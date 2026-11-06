import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { createLSD } from '../src/lsd.js';
import { normalize, dot, rectification, inverse, multiply, project, IDENTITY,
  prepareEvidence, estimatePlane, fittedHomography, isSafeNormal, estimateAxisRotation, nearestAxisRotation } from '../src/geometry.js';

function rectangles(normal, width=480,height=270,fov=70.42) {
  const projection=inverse(rectification(width,height,fov,normal));
  const output=[];
  for(let i=0;i<12;i++) {
    const theta=i*Math.PI/6;
    const cx=width/2+95*Math.cos(theta),cy=height/2+65*Math.sin(theta);
    const angle=i*0.21, c=Math.cos(angle),s=Math.sin(angle);
    const corners=[[-16,-12],[16,-12],[16,12],[-16,12]].map(([x,y])=>
      project(projection,cx+c*x-s*y,cy+s*x+c*y));
    for(let k=0;k<4;k++)output.push(...corners[k].slice(0,2),...corners[(k+1)%4].slice(0,2),1,0.125,12);
  }
  return new Float64Array(output);
}

test('camera rotation rectifies a known plane and has a stable inverse',()=>{
  const normal=normalize([0.38,-0.48,1]);
  const h=rectification(480,270,70.42,normal);
  const identity=multiply(h,inverse(h));
  identity.forEach((v,i)=>assert.ok(Math.abs(v-IDENTITY[i])<1e-10));
  assert.ok(isSafeNormal(normal,480,270,70.42));
  assert.equal(isSafeNormal(normalize([5,0,1]),480,270,70.42),false);
  const fitted=fittedHomography(480,270,70.42,normal);
  for(const[x,y]of[[0,0],[480,0],[480,270],[0,270]]) {
    const p=project(fitted,x,y);
    assert.ok(p[0]>=-1e-6&&p[0]<=480+1e-6&&p[1]>=-1e-6&&p[1]<=270+1e-6);
  }
  // Capture and panel can have different aspect ratios. The complete quad
  // must stay inside the panel and touch an edge in at least one dimension.
  for(const [outWidth,outHeight]of[[640,360],[640,480],[380,500]])for(const axisRotation of [0,-0.55,0.8]){
    const panelFit=fittedHomography(1920,1080,70.42,normal,outWidth,outHeight,axisRotation);
    const quad=[[0,0],[1920,0],[1920,1080],[0,1080]].map(([x,y])=>project(panelFit,x,y));
    const xs=quad.map(point=>point[0]),ys=quad.map(point=>point[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    assert.ok(left>=-1e-6&&right<=outWidth+1e-6&&top>=-1e-6&&bottom<=outHeight+1e-6);
    assert.ok(Math.abs(right-left-outWidth)<1e-6||Math.abs(bottom-top-outHeight)<1e-6);
    assert.ok(Math.abs((left+right)/2-outWidth/2)<1e-6&&Math.abs((top+bottom)/2-outHeight/2)<1e-6);
  }
});

test('angle regularity recovers a tilted plane with varied local corner orientations',()=>{
  const normal=normalize([0.38,-0.48,1]);
  const evidence=prepareEvidence(rectangles(normal),480,270,70.42);
  const result=estimatePlane(evidence,{trials:160});
  assert.ok(result.valid,JSON.stringify(result));
  const error=Math.acos(Math.min(1,dot(normal,result.normal)))*180/Math.PI;
  assert.ok(error<1.0,`Normal error ${error} degrees`);
  assert.ok(result.score>result.identityScore*2);
});

test('fronto-parallel and insufficient-evidence scenes stay well behaved',()=>{
  const result=estimatePlane(prepareEvidence(rectangles([0,0,1]),480,270,70.42));
  assert.ok(result.valid);
  assert.ok(dot(result.normal,[0,0,1])>0.999);
  const empty=estimatePlane(prepareEvidence(new Float64Array(),480,270,70.42));
  assert.equal(empty.valid,false);
  assert.deepEqual(empty.normal,[0,0,1]);
});

function orientedRectangles(normal,angle,count=12){
  const projection=inverse(rectification(480,270,70.42,normal)),output=[];
  const c=Math.cos(angle),s=Math.sin(angle);
  for(let i=0;i<count;i++){
    const theta=i*2*Math.PI/count,cx=240+95*Math.cos(theta),cy=135+65*Math.sin(theta);
    const corners=[[-16,-12],[16,-12],[16,12],[-16,12]].map(([x,y])=>project(projection,cx+c*x-s*y,cy+s*x+c*y));
    for(let k=0;k<4;k++)output.push(...corners[k].slice(0,2),...corners[(k+1)%4].slice(0,2),1,0.125,12);
  }
  return output;
}

test('axis alignment rectifies a rotated grid and keeps its whole quad maximally fit',()=>{
  const normal=normalize([0.38,-0.48,1]),angle=27*Math.PI/180;
  const segments=orientedRectangles(normal,angle),evidence=prepareEvidence(segments,480,270,70.42);
  const plane=estimatePlane(evidence,{trials:160}),axes=estimateAxisRotation(evidence,plane);
  assert.ok(plane.valid);assert.ok(axes.valid,JSON.stringify(axes));
  assert.ok(Math.abs(nearestAxisRotation(axes.rotation+angle))<Math.PI/180);
  const h=fittedHomography(480,270,70.42,plane.normal,640,440,axes.rotation);
  for(let i=0;i<segments.length;i+=7){
    const a=project(h,segments[i],segments[i+1]),b=project(h,segments[i+2],segments[i+3]);
    const dx=b[0]-a[0],dy=b[1]-a[1];
    assert.ok(Math.min(Math.abs(dx),Math.abs(dy))/Math.hypot(dx,dy)<0.02);
  }
  assert.notDeepEqual(h,fittedHomography(480,270,70.42,plane.normal,640,440));
});

test('axis alignment selects the dominant orientation instead of averaging different grids',()=>{
  const normal=normalize([0.2,-0.3,1]),angle=26*Math.PI/180;
  const segments=[...orientedRectangles(normal,angle),...orientedRectangles(normal,-18*Math.PI/180,4)];
  const evidence=prepareEvidence(segments,480,270,70.42),plane=estimatePlane(evidence,{trials:160});
  const axes=estimateAxisRotation(evidence,plane);
  assert.ok(axes.valid,JSON.stringify(axes));
  assert.ok(Math.abs(nearestAxisRotation(axes.rotation+angle))<Math.PI/180,JSON.stringify(axes));
});

test('axis alignment stays continuous across the 45-degree boundary and tolerates reversed segments',()=>{
  const normal=normalize([0.2,-0.3,1]);
  let previous=-44*Math.PI/180;
  for(const degrees of [44,46,50,70,92]){
    const segments=orientedRectangles(normal,degrees*Math.PI/180);
    for(let i=0;i<segments.length;i+=14)[segments[i],segments[i+1],segments[i+2],segments[i+3]]=[segments[i+2],segments[i+3],segments[i],segments[i+1]];
    const evidence=prepareEvidence(segments,480,270,70.42),plane=estimatePlane(evidence,{trials:160});
    const axes=estimateAxisRotation(evidence,plane,previous);
    assert.ok(axes.valid);
    assert.ok(Math.abs(axes.rotation+degrees*Math.PI/180)<Math.PI/180,JSON.stringify(axes));
    previous=axes.rotation;
  }
  const empty=prepareEvidence([],480,270,70.42);
  assert.deepEqual(estimateAxisRotation(empty,{valid:false},previous),{valid:false,rotation:previous,support:0,lineCount:0});
  assert.equal(estimateAxisRotation(empty,{valid:true,inliers:[],normal},previous).valid,false);
});

test('WASM LSD detects edges, handles blank images, and resets its arena across frames',async()=>{
  const lsd=await createLSD(readFileSync(new URL('../assets/lsd.wasm',import.meta.url)));
  const width=320,height=180;
  const image=Uint8Array.from({length:width*height},(_,i)=>i%width<160?0:255);
  let used;
  for(let i=0;i<15;i++){
    const result=lsd.detect(image,width,height);
    assert.ok(result.segments.length>=7);
    assert.ok(Math.abs(result.segments[0]-160)<3);
    assert.ok(result.segments.every(Number.isFinite));
    if(used)assert.equal(result.heapBytes,used);
    used=result.heapBytes;
  }
  assert.equal(lsd.detect(new Uint8Array(width*height),width,height).segments.length,0);
  assert.throws(()=>lsd.detect(new Uint8Array(9),3,3));
});

test('WASM detection and the solver recover a camera pose from a rasterized perspective grid',async()=>{
  const width=480,height=270,fov=70.42,normal=normalize([0.24,0.44,1]);
  const h=rectification(width,height,fov,normal);
  const gray=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [u,v]=project(h,x+0.5,y+0.5);
    gray[y*width+x]=((Math.floor(u/36)+Math.floor(v/36))%2+2)%2?210:40;
  }
  const lsd=await createLSD(readFileSync(new URL('../assets/lsd.wasm',import.meta.url)));
  const detection=lsd.detect(gray,width,height);
  const result=estimatePlane(prepareEvidence(detection.segments,width,height,fov),{trials:160});
  assert.ok(result.valid);
  const error=degreesBetween(normal,result.normal);
  assert.ok(error<2,`Pose error ${error}°`);
  assert.ok(result.inliers.length>=15);
});

function degreesBetween(a,b){return Math.acos(Math.max(-1,Math.min(1,dot(a,b))))*180/Math.PI;}

test('the worker protocol processes transferred RGBA frames with the real WASM module',async t=>{
  const harness=`
    import {parentPort,workerData} from 'node:worker_threads';
    import {readFile} from 'node:fs/promises';
    globalThis.self=globalThis;
    globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
    globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
    parentPort.on('message',data=>self.onmessage({data}));
    await import(workerData.module);
  `;
  const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(harness)),{
    workerData:{module:new URL('../src/worker.js',import.meta.url).href}
  });
  t.after(()=>worker.terminate());
  const [ready]=await once(worker,'message');assert.equal(ready.kind,'ready');
  const width=320,height=180,fov=70.42,normal=normalize([0.24,0.44,1]);
  const h=rectification(width,height,fov,normal),rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [u,v]=project(h,x+.5,y+.5),shade=((Math.floor(u/24)+Math.floor(v/24))%2+2)%2?210:40;
    rgba.set([shade,shade,shade,255],(y*width+x)*4);
  }
  const response=once(worker,'message');
  worker.postMessage({kind:'frame',id:1,generation:7,rgba,width,height,fov,previous:[0,0,1]},[rgba.buffer]);
  assert.equal(rgba.byteLength,0);
  const [result]=await response;
  assert.equal(result.kind,'result');assert.equal(result.generation,7);assert.equal(result.valid,true);
  assert.ok(result.overlay instanceof Float32Array);assert.equal(result.overlay.length,result.lineCount*5);
  assert.ok(result.axes.valid);assert.ok(Math.abs(result.axes.rotation)<2*Math.PI/180);
  assert.ok(result.heapBytes<32*1024*1024);assert.ok(degreesBetween(normal,result.normal)<2);
});
