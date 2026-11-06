import { normalize, dot, degrees, inverse, fittedHomography, columnMajor, nearestAxisRotation } from './geometry.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { createCameraFrames } from './video-frames.js';

const $ = id => document.getElementById(id);
const original = $('original'), originalContext = original.getContext('2d');
const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d',{willReadFrequently:true});
const DEFAULT_FOV=100;
const buildingSample={url:'assets/dc_1.jpg',label:'Building facade'};
let p, warpProgram, source=null, stream=null, video=null, sourceRequest=0, generation=0;
let worker, workerReady=false, workerBusy=false, workerFailed=false;
let analysisId=0,lastAnalysis=0,analysisRequested=true,lastAnalyzedFrame=-1,cameraFrames=null;
let planeNormal=[0,0,1],target=[0,0,1],pending=null,pendingCount=0,lastReliable=0;
let axisRotation=0,targetAxisRotation=0,axisReliable=0,axisPending=null,axisPendingCount=0;
let held=false,overlay=null,latest=null,lastDraw=0,lastMetrics=0,renderFps=0;
let fov=DEFAULT_FOV,lastError=null;
let canvasResizes=0;

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function resetTracking(){
  generation++;planeNormal=[0,0,1];target=[0,0,1];pending=null;pendingCount=0;
  lastReliable=0;overlay=null;latest=null;analysisRequested=true;lastAnalysis=0;lastAnalyzedFrame=-1;
  axisRotation=0;targetAxisRotation=0;axisReliable=0;axisPending=null;axisPendingCount=0;
  $('performance').textContent='Finding right-angle structure';
}
function stopTracks(){
  cameraFrames?.dispose();cameraFrames=null;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  video?.remove();video=null;
  $('stop').disabled=true;
}
function setHeld(value){held=value;$('hold').setAttribute('aria-pressed',String(held));$('hold').textContent=held?'Resume correction':'Hold correction';}
function setFov(value){
  fov=Number(value);$('fov').value=String(fov);$('fov-value').value=`${fov.toFixed(2)}°`;
}
function sourceChanged(){
  setHeld(false);resetTracking();if(!workerFailed)lastError=null;
  $('hold').disabled=false;$('reacquire').disabled=false;
  status(workerFailed?`Line detector unavailable: ${lastError||'reload to retry'}`:workerReady?'Looking for the dominant plane…':'Loading the line detector…',workerFailed);
}

async function refreshDevices(selected){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
  const prior=selected??$('camera').value;
  $('camera').replaceChildren(new Option('Default camera',''));
  for(const [i,device]of devices.entries())$('camera').add(new Option(device.label||`Camera ${i+1}`,device.deviceId));
  if(devices.some(device=>device.deviceId===prior))$('camera').value=prior;
  return devices;
}

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){
    if(await loadSample('building'))status('Camera unavailable · showing the building facade.');
    return;
  }
  const request=++sourceRequest;
  const selected=$('camera').value;
  const captureWidth=Number($('resolution').value),captureHeight=captureWidth*9/16;
  if(source?.kind==='camera')source=null;
  stopTracks();$('start').disabled=true;status('Waiting for camera access…');
  let opened=null,element=null;
  try{
    const constraints={audio:false,video:{width:{ideal:captureWidth},height:{ideal:captureHeight},frameRate:{ideal:30,max:30},...(selected?{deviceId:{exact:selected}}:{})}};
    opened=await navigator.mediaDevices.getUserMedia(constraints);
    if(request!==sourceRequest){opened.getTracks().forEach(t=>t.stop());return;}
    element=p.createVideo([]);element.hide();element.elt.muted=true;element.elt.playsInline=true;
    element.elt.srcObject=opened;
    await element.elt.play();
    if(!element.elt.videoWidth)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('The camera did not deliver a video frame.')),10000);
      element.elt.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve();},{once:true});
    });
    if(request!==sourceRequest){opened.getTracks().forEach(t=>t.stop());element.remove();return;}
    stream=opened;video=element;
    cameraFrames=createCameraFrames(video.elt,(captureWidth,captureHeight)=>p.createImage(captureWidth,captureHeight));
    const track=stream.getVideoTracks()[0],settings=track.getSettings();
    source={kind:'camera',texture:null,drawable:null,width:video.elt.videoWidth,height:video.elt.videoHeight,
      label:track.label||'Camera'};
    sourceChanged();$('sample').value='';$('stop').disabled=false;
    await refreshDevices(settings.deviceId).catch(()=>{});
    track.addEventListener('ended',async()=>{
      if(stream===opened&&await loadSample('building'))status('Camera disconnected · showing the building facade.');
    });
  }catch(error){
    opened?.getTracks().forEach(t=>t.stop());element?.remove();
    if(request===sourceRequest){
      const message=error.name==='NotAllowedError'?'Camera permission denied'
        :error.name==='NotFoundError'?'No camera found':'Camera unavailable';
      if(await loadSample('building')){
        lastError=error.message;
        status(`${message} · showing the building facade.`);
      }
    }
  }finally{if(request===sourceRequest)$('start').disabled=false;}
}

function stopCamera(){
  sourceRequest++;
  const wasCamera=source?.kind==='camera';
  stopTracks();$('start').disabled=false;
  if(wasCamera){source=null;resetTracking();$('hold').disabled=true;$('reacquire').disabled=true;status('Camera stopped. Select a test image or start the camera again.');}
}
async function loadSample(key){
  if(key!=='building')return false;
  const sample=buildingSample;
  const request=++sourceRequest;
  if(source?.kind==='camera')source=null;
  stopTracks();$('start').disabled=false;
  status(`Loading ${sample.label.toLowerCase()}…`);
  try{
    const sampleImage=await p.loadImage(sample.url);
    if(request!==sourceRequest)return false;
    source={kind:key,texture:sampleImage,drawable:sampleImage.canvas,width:sampleImage.width,height:sampleImage.height,label:sample.label};
    sourceChanged();$('sample').value=key;
    return true;
  }catch(error){if(request===sourceRequest)status(`Could not load the test image: ${error.message}`,true);return false;}
}

function handleEstimate(data){
  workerBusy=false;
  if(data.generation!==generation)return;
  if(data.kind==='frame-error'){status(`Analysis failed: ${data.message}`,true);lastError=data.message;return;}
  latest=data;overlay={lines:data.overlay,width:data.width,height:data.height};
  if(held){status('Correction held. Live video continues.');return;}
  if(data.valid){
    const angle=degrees(Math.acos(Math.max(-1,Math.min(1,dot(target,data.normal)))));
    if(lastReliable&&angle>15){
      if(pending&&dot(pending,data.normal)>Math.cos(8*Math.PI/180))pendingCount++;else pendingCount=1;
      pending=data.normal;
      if(pendingCount<3){status('Checking a new dominant plane…');return;}
    }
    target=data.normal;lastReliable=performance.now();pending=null;pendingCount=0;
    if(data.axes?.valid){
      const proposed=nearestAxisRotation(data.axes.rotation,targetAxisRotation);
      if(axisReliable&&Math.abs(proposed-targetAxisRotation)>12*Math.PI/180){
        if(axisPending!==null&&Math.abs(nearestAxisRotation(proposed,axisPending)-axisPending)<5*Math.PI/180)axisPendingCount++;
        else axisPendingCount=1;
        axisPending=proposed;
      }else{axisPending=null;axisPendingCount=0;}
      if(axisPending===null||axisPendingCount>=3){
        targetAxisRotation=proposed;axisReliable=lastReliable;axisPending=null;axisPendingCount=0;
      }
    }else{axisPending=null;axisPendingCount=0;}
    status('Tracking the dominant plane');
  }else {
    pending=null;pendingCount=0;axisPending=null;axisPendingCount=0;
    status(lastReliable
      ? performance.now()-lastReliable>2500?'No reliable plane · easing back to the original view':'Too few reliable corners · holding the last correction'
      :'Looking for more right-angle structure…');
  }
}

function requestAnalysis(now){
  if(!source||!workerReady||workerBusy||workerFailed||held)return;
  if(source.kind!=='camera'&&!analysisRequested)return;
  if(now-lastAnalysis<Math.max(140,(latest?.analysisMs||0)*1.4))return;
  if(source.kind==='camera'&&cameraFrames.serial===lastAnalyzedFrame)return;
  const analysisFactor=Math.min(480/source.width,480/source.height);
  const analysisWidth=Math.max(8,Math.round(source.width*analysisFactor)),analysisHeight=Math.max(8,Math.round(source.height*analysisFactor));
  if(analysisCanvas.width!==analysisWidth||analysisCanvas.height!==analysisHeight){analysisCanvas.width=analysisWidth;analysisCanvas.height=analysisHeight;}
  analysisContext.drawImage(source.drawable,0,0,analysisWidth,analysisHeight);
  const rgba=analysisContext.getImageData(0,0,analysisWidth,analysisHeight).data;
  workerBusy=true;lastAnalysis=now;analysisRequested=false;lastAnalyzedFrame=cameraFrames?.serial??-1;
  worker.postMessage({kind:'frame',id:++analysisId,generation,rgba,width:analysisWidth,height:analysisHeight,fov,previous:target,previousAxisRotation:targetAxisRotation},[rgba.buffer]);
}

function drawOriginal(){
  const fitFactor=Math.min(original.width/source.width,original.height/source.height);
  const drawnWidth=source.width*fitFactor,drawnHeight=source.height*fitFactor;
  const offsetX=(original.width-drawnWidth)/2,offsetY=(original.height-drawnHeight)/2;
  originalContext.fillStyle='#0e1116';originalContext.fillRect(0,0,original.width,original.height);
  originalContext.drawImage(source.drawable,offsetX,offsetY,drawnWidth,drawnHeight);
  if(!$('show-lines').checked||!overlay)return;
  const sx=drawnWidth/overlay.width,sy=drawnHeight/overlay.height;
  originalContext.save();originalContext.lineWidth=1.6;
  for(let i=0;i<overlay.lines.length;i+=5){
    originalContext.strokeStyle=overlay.lines[i+4]?'#8effc6':'rgba(230,170,100,.48)';
    originalContext.beginPath();originalContext.moveTo(offsetX+overlay.lines[i]*sx,offsetY+overlay.lines[i+1]*sy);
    originalContext.lineTo(offsetX+overlay.lines[i+2]*sx,offsetY+overlay.lines[i+3]*sy);originalContext.stroke();
  }
  originalContext.restore();
}

function draw(){
  const now=performance.now(),dt=Math.min(0.1,Math.max(0.001,(now-lastDraw)/1000));lastDraw=now;
  renderFps=renderFps?renderFps*0.93+(1/dt)*0.07:1/dt;
  if(!source)return;
  if(source.kind==='camera'){
    const cameraFrame=cameraFrames.poll();
    if(!cameraFrame)return;
    source.texture=cameraFrame;source.drawable=cameraFrame.canvas;
    source.width=cameraFrame.width;source.height=cameraFrame.height;
  }
  if(source.kind==='camera'&&!held){
    if(lastReliable&&now-lastReliable>2500){target=[0,0,1];targetAxisRotation=0;axisReliable=0;}
    if(axisReliable&&now-axisReliable>2500){targetAxisRotation=0;axisReliable=0;}
  }
  if(!held){
    const smoothingAmount=1-Math.exp(-dt/0.35);
    planeNormal=normalize(planeNormal.map((v,i)=>v+(target[i]-v)*smoothingAmount));
    axisRotation+=(targetAxisRotation-axisRotation)*smoothingAmount;
  }
  const renderWidth=Math.max(1,$('corrected-frame').clientWidth),renderHeight=Math.max(1,$('corrected-frame').clientHeight);
  if(p.width!==renderWidth||p.height!==renderHeight){p.resizeCanvas(renderWidth,renderHeight,true);canvasResizes++;}
  if(original.width!==renderWidth||original.height!==renderHeight){original.width=renderWidth;original.height=renderHeight;}
  p.shader(warpProgram);
  const homography=fittedHomography(source.width,source.height,fov,planeNormal,renderWidth,renderHeight,$('align-axes').checked?axisRotation:0);
  warpProgram.setUniform('uFrame',source.texture);
  warpProgram.setUniform('uInverseHomography',columnMajor(inverse(homography)));
  warpProgram.setUniform('uSourceSize',[source.width,source.height]);warpProgram.setUniform('uCanvasSize',[p.width,p.height]);
  warpProgram.setUniform('uDrawingBufferSize',[p.drawingContext.drawingBufferWidth,p.drawingContext.drawingBufferHeight]);
  p.beginShape(p.TRIANGLES);
  p.vertex(-1,-1,0);p.vertex(1,-1,0);p.vertex(1,1,0);
  p.vertex(-1,-1,0);p.vertex(1,1,0);p.vertex(-1,1,0);
  p.endShape();
  drawOriginal();requestAnalysis(now);
  if(now-lastMetrics>300){
    lastMetrics=now;
    const tilt=degrees(Math.atan2(planeNormal[1],Math.hypot(planeNormal[0],planeNormal[2])));
    const pan=degrees(Math.atan2(planeNormal[0],planeNormal[2]));
    $('performance').textContent=[
      ...(latest?[`${latest.inlierCount} supported right-angle pairs`]:[]),
      `${Math.round(renderFps)} render fps`,
      ...(latest?[`analysis ${Math.round(latest.analysisMs)} ms`]:[]),
      `tilt ${tilt.toFixed(1)}°`, `pan ${pan.toFixed(1)}°`,
      ...($('align-axes').checked?[`rotation ${degrees(axisRotation).toFixed(1)}°`]:[]), ...(held?['held']:[])
    ].join(' · ');
  }
}

function connectUI(){
  for(const id of ['start','camera','resolution','sample'])$(id).disabled=false;
  $('start').addEventListener('click',startCamera);$('stop').addEventListener('click',stopCamera);
  $('camera').addEventListener('change',startCamera);
  $('resolution').addEventListener('change',()=>{if(source?.kind==='camera')startCamera();});
  $('sample').addEventListener('change',()=>{if($('sample').value)loadSample($('sample').value);else startCamera();});
  $('fov').addEventListener('input',()=>{setFov($('fov').value);resetTracking();setHeld(false);});
  $('reset-fov').addEventListener('click',()=>{setFov(DEFAULT_FOV);resetTracking();setHeld(false);});
  $('reacquire').addEventListener('click',()=>{setHeld(false);resetTracking();status('Reacquiring the dominant plane…');});
  $('hold').addEventListener('click',()=>{setHeld(!held);if(held)status('Correction held. Live video continues.');else{analysisRequested=true;status('Resuming automatic correction…');}});
  navigator.mediaDevices?.addEventListener('devicechange',()=>refreshDevices().catch(()=>{}));
  window.addEventListener('pagehide',()=>{stopTracks();worker?.terminate();});
}

Object.defineProperty(window,'__deperspectivizer',{get:()=>({
  ready:!!p,workerReady,workerFailed,source:source?{kind:source.kind,width:source.width,height:source.height}:null,
  rendering:p?.drawingContext?{pixelDensity:p.pixelDensity(),width:p.width,height:p.height,
    bufferWidth:p.drawingContext.drawingBufferWidth,bufferHeight:p.drawingContext.drawingBufferHeight,canvasResizes}:null,
  cameraFrames:cameraFrames?.diagnostics??null,
  normal:planeNormal.slice(),target:target.slice(),fov,held,generation,axisRotation,targetAxisRotation,alignAxes:$('align-axes').checked,
  latest:latest?{valid:latest.valid,confidence:latest.confidence,axes:latest.axes,
    inlierCount:latest.inlierCount,lineCount:latest.lineCount,analysisMs:latest.analysisMs}:null,lastError
})});

if(!window.p5){status('Could not load p5.js 2.3.4. Check that src/p5.js is present and reload.',true);}
else new window.p5(sketch=>{
  p=sketch;
  sketch.setup=async()=>{
    try{
      // p5 2.x forwards setAttributes() to the current renderer, which is
      // still 2D here. Configure a native canvas first and hand it to p5's
      // public createCanvas(..., canvas) API. Its existing WebGL1 context
      // also keeps our GLSL shader and context attributes consistent.
      const element=document.createElement('canvas');
      if(!element.getContext('webgl',{antialias:false,alpha:false,depth:false,preserveDrawingBuffer:false}))
        throw new Error('WebGL is unavailable. Enable hardware acceleration in Chrome and reload.');
      const canvas=p.createCanvas(640,360,p.WEBGL,element);canvas.parent('corrected-frame');
      // In p5 2.x, createCanvas creates a renderer with the display density.
      // Set this on the new WebGL renderer, not the initial 2D renderer.
      p.pixelDensity(1);
      canvas.elt.setAttribute('aria-label','Perspective-corrected image');
      canvas.elt.addEventListener('webglcontextlost',event=>{event.preventDefault();status('The graphics context was lost. Reload to reconnect WebGL.',true);p.noLoop();});
      $('loading').remove();p.noStroke();p.frameRate(60);warpProgram=p.createShader(vertexShader,fragmentShader);
      worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        if(data.kind==='ready'){workerReady=true;analysisRequested=true;if(source)status('Looking for the dominant plane…');}
        else if(data.kind==='error'){workerFailed=true;lastError=data.message;status(`Line detector unavailable: ${data.message}`,true);}
        else handleEstimate(data);
      };
      worker.onerror=event=>{workerFailed=true;workerBusy=false;status(`Analysis worker failed: ${event.message}`,true);};
      connectUI();await refreshDevices().catch(()=>{});
      setFov(DEFAULT_FOV);
      // Finish p5 setup while permission is pending, so all controls remain usable.
      if(new URLSearchParams(location.search).get('sample')==='building')loadSample('building');
      else startCamera();
    }catch(error){lastError=error.message;status(`Could not initialize the app: ${error.message}`,true);p.noLoop();}
  };
  sketch.draw=()=>{try{draw();}catch(error){lastError=error.message;status(`Could not render the view: ${error.message}`,true);p.noLoop();}};
});
