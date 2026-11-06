// Optional developer check; Playwright is NOT a runtime application dependency.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))throw new Error('outside root');
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
});
let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const context=await browser.newContext({viewport:{width:1312,height:800},deviceScaleFactor:2,permissions:['camera']});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.__deperspectivizer?.source?.kind==='camera',null,{timeout:30000});
  assert.equal(await page.evaluate(()=>p5.VERSION),'2.3.4');
  assert.equal(await page.title(),'De-Perspectivizer');
  assert.equal(await page.locator('h1').textContent(),'De-Perspectivizer');
  await page.waitForFunction(()=>window.__deperspectivizer?.rendering?.width>600);
  const rendering=await page.evaluate(()=>window.__deperspectivizer.rendering);
  assert.equal(rendering.pixelDensity,1);
  assert.equal(rendering.bufferWidth,rendering.width);assert.equal(rendering.bufferHeight,rendering.height);
  assert.equal(await page.evaluate(()=>window.__deperspectivizer.fov),100);
  assert.equal(await page.locator('#align-axes').isChecked(),true);
  assert.deepEqual(await page.locator('#sample option').allTextContents(),['Live camera','Building facade']);
  const panels=await page.locator('.frame').all();
  const left=await panels[0].boundingBox(),right=await panels[1].boundingBox();
  assert.equal(left.width,640);assert.equal(right.width,640);assert.equal(left.y,right.y);
  assert.ok((await page.locator('footer').boundingBox()).y<800);
  assert.ok((await page.locator('.diagnostics').boundingBox()).y>=left.y+left.height);
  await page.waitForFunction(()=>window.__deperspectivizer.cameraFrames?.copied>=2);
  const resizeChecks=await page.evaluate(async()=>{
    const status=document.getElementById('status'),metrics=document.getElementById('performance');
    const previous=[status.textContent,metrics.textContent],sizes=[];
    for(const message of ['Tracking','Too few reliable corners · holding the last correction',
      'No reliable plane · easing back to the original view','Tracking']){
      status.textContent=message;
      metrics.textContent=message==='Tracking'?'60 render fps':'80 supported right-angle pairs · 60 render fps · analysis 22 ms · tilt -20.5° · pan -8.3° · rotation -35.5°';
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const state=window.__deperspectivizer,rect=document.getElementById('corrected-frame').getBoundingClientRect();
      sizes.push({width:rect.width,height:rect.height,resizes:state.rendering.canvasResizes});
    }
    [status.textContent,metrics.textContent]=previous;
    return sizes;
  });
  for(const size of resizeChecks)assert.deepEqual(size,resizeChecks[0],'Diagnostic text must not resize either canvas');
  const retained=await page.evaluate(async()=>{
    const video=document.querySelector('video');
    Object.defineProperty(video,'readyState',{configurable:true,get:()=>1});
    const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const fingerprint=()=>{
      const element=document.getElementById('original'),pixels=element.getContext('2d').getImageData(0,0,element.width,element.height).data;
      let hash=0;for(let i=0;i<pixels.length;i++)hash=(Math.imul(hash,31)+pixels[i])|0;
      return {hash,serial:window.__deperspectivizer.cameraFrames.serial};
    };
    await tick();const before=fingerprint();await tick();const after=fingerprint();
    delete video.readyState;
    return {before,after};
  });
  assert.deepEqual(retained.after,retained.before,'Video readiness gaps must retain the same complete frame');
  // Exercise the actual warp shader at both densities, independently of the
  // app's density=1 setting. An identity warp must cover all four corners.
  const densityChecks=await page.evaluate(async()=>{
    const {vertexShader,fragmentShader}=await import('/src/shaders.js');
    const results=[];
    for(const density of [1,2]){
      const element=document.createElement('canvas');element.width=640*density;element.height=360*density;
      const gl=element.getContext('webgl',{antialias:false});
      const program=gl.createProgram();
      for(const [type,source]of [[gl.VERTEX_SHADER,vertexShader],[gl.FRAGMENT_SHADER,fragmentShader]]){
        const compiled=gl.createShader(type);gl.shaderSource(compiled,source);gl.compileShader(compiled);
        if(!gl.getShaderParameter(compiled,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(compiled));
        gl.attachShader(program,compiled);
      }
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.uniform1i(gl.getUniformLocation(program,'uFrame'),0);
      gl.uniformMatrix3fv(gl.getUniformLocation(program,'uInverseHomography'),false,new Float32Array([1,0,0,0,1,0,0,0,1]));
      gl.uniform2f(gl.getUniformLocation(program,'uSourceSize'),640,360);gl.uniform2f(gl.getUniformLocation(program,'uCanvasSize'),640,360);
      gl.uniform2f(gl.getUniformLocation(program,'uDrawingBufferSize'),gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.viewport(0,0,element.width,element.height);gl.drawArrays(gl.TRIANGLES,0,6);
      const corners=[];
      for(const [x,y]of [[0,0],[element.width-1,0],[0,element.height-1],[element.width-1,element.height-1]]){
        const pixel=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);corners.push([...pixel]);
      }
      results.push({density,corners});gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    return results;
  });
  for(const check of densityChecks)for(const corner of check.corners)assert.deepEqual(corner,[255,255,255,255],`Warp must fill the panel at density ${check.density}`);
  await page.locator('#hold').click();assert.equal(await page.locator('#hold').getAttribute('aria-pressed'),'true');
  await page.locator('#sample').selectOption('building');
  await page.waitForFunction(()=>window.__deperspectivizer?.source?.kind==='building'&&window.__deperspectivizer.latest?.valid);
  assert.equal(await page.evaluate(()=>window.__deperspectivizer.fov),100);
  await page.waitForFunction(()=>document.getElementById('performance').textContent.includes('supported right-angle pairs'));
  assert.match(await page.locator('#performance').textContent(),/render fps · analysis \d+ ms · tilt/);
  assert.ok(!(await page.locator('#performance').textContent()).includes('%'));
  await page.waitForFunction(()=>window.__deperspectivizer.latest?.axes?.valid);
  await page.locator('#align-axes').uncheck();
  assert.equal(await page.evaluate(()=>window.__deperspectivizer.alignAxes),false);
  assert.equal(await page.evaluate(()=>window.__deperspectivizer.fov),100);
  await page.locator('#align-axes').check();
  await page.locator('#hold').click();
  const heldRotation=await page.evaluate(()=>window.__deperspectivizer.axisRotation);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.__deperspectivizer.axisRotation),heldRotation);
  await page.locator('#hold').click();
  await page.locator('#show-lines').check();
  await page.locator('#fov').evaluate(element=>{element.value='58';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.__deperspectivizer.fov===58&&window.__deperspectivizer.latest?.valid);
  assert.deepEqual(errors,[]);
  await mkdir(path.join(root,'test-output'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-output/browser.png'),fullPage:true});
  const unavailable=await context.newPage();
  await unavailable.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('No camera','NotFoundError');};
  });
  await unavailable.goto(`http://127.0.0.1:${server.address().port}/`);
  await unavailable.waitForFunction(()=>window.__deperspectivizer?.source?.kind==='building'&&window.__deperspectivizer.latest?.valid);
  assert.equal(await unavailable.locator('#sample').inputValue(),'building');
  console.log('Browser checks passed: stable canvas sizes during diagnostic updates, retained frames during camera readiness gaps, Retina canvas sizing, shader coverage at densities 1 and 2, title, diagnostics below views, automatic camera startup, building fallback, two 640px panels, exact p5 version, worker estimates, axis alignment toggle and hold, input switching, FOV control, and overlay.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
