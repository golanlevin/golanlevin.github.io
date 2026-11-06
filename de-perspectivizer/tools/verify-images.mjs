// macOS-only image QA using the built-in sips decoder. No image library needed.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createLSD} from '../src/lsd.js';
import {prepareEvidence,estimatePlane,estimateAxisRotation,fittedHomography,inverse,project,degrees} from '../src/geometry.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(path.join(os.tmpdir(),'deperspectivizer-images-'));
const outputDir=path.join(root,'test-output');mkdirSync(outputDir,{recursive:true});
function sips(args){const result=spawnSync('sips',args,{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'sips unavailable; run this image check on macOS.');}
function readBMP(file){
  const b=readFileSync(file),offset=b.readUInt32LE(10),width=b.readInt32LE(18),signedHeight=b.readInt32LE(22);
  const height=Math.abs(signedHeight),bits=b.readUInt16LE(28),stride=Math.ceil(width*bits/32)*4;
  assert.equal(bits,24);assert.equal(b.readUInt32LE(30),0);
  const rgb=new Uint8Array(width*height*3),gray=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=offset+(signedHeight>0?height-1-y:y)*stride+x*3,j=(y*width+x)*3;
    rgb.set([b[i+2],b[i+1],b[i]],j);gray[y*width+x]=Math.round(.2126*b[i+2]+.7152*b[i+1]+.0722*b[i]);
  }
  return {width,height,rgb,gray};
}
function writeBMP(file,rgb,width,height){
  const stride=Math.ceil(width*3/4)*4,b=Buffer.alloc(54+stride*height);
  b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);
  b.writeInt32LE(width,18);b.writeInt32LE(-height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3,j=54+y*stride+x*3;b[j]=rgb[i+2];b[j+1]=rgb[i+1];b[j+2]=rgb[i];
  }
  writeFileSync(file,b);
}
function warp(image,h){
  const {width,height,rgb}=image,out=new Uint8Array(rgb.length),inv=inverse(h);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [sx,sy]=project(inv,x+.5,y+.5),u=sx-.5,v=sy-.5,index=(y*width+x)*3;
    if(u<0||v<0||u>=width-1||v>=height-1){out.set([14,17,20],index);continue;}
    const ix=Math.floor(u),iy=Math.floor(v),dx=u-ix,dy=v-iy;
    for(let c=0;c<3;c++)out[index+c]=Math.round(
      rgb[(iy*width+ix)*3+c]*(1-dx)*(1-dy)+rgb[(iy*width+ix+1)*3+c]*dx*(1-dy)+
      rgb[((iy+1)*width+ix)*3+c]*(1-dx)*dy+rgb[((iy+1)*width+ix+1)*3+c]*dx*dy);
  }
  return out;
}

try{
  const detector=await createLSD(readFileSync(path.join(root,'assets/lsd.wasm')));
  const results=[];
  for(const[name,asset,fov]of[['building',path.join(root,'assets/dc_1.jpg'),2*Math.atan(22.3/44)*180/Math.PI]]){
    const input=path.join(temp,`${name}.bmp`);
    sips(['-Z','480','-s','format','bmp',asset,'--out',input]);
    const image=readBMP(input),t0=performance.now();
    const detection=detector.detect(image.gray,image.width,image.height),t1=performance.now();
    const evidence=prepareEvidence(detection.segments,image.width,image.height,fov);
    const result=estimatePlane(evidence,{trials:160});
    const axes=estimateAxisRotation(evidence,result);
    const elapsed=performance.now()-t0;
    assert.ok(result.valid,`${name}: no valid plane`);
    assert.ok(result.score>result.identityScore*1.5,`${name}: insufficient right-angle improvement`);
    const h=fittedHomography(image.width,image.height,fov,result.normal);
    const bmp=path.join(temp,`${name}-corrected.bmp`);
    writeBMP(bmp,warp(image,h),image.width,image.height);
    sips(['-s','format','png',bmp,'--out',path.join(outputDir,`${name}-corrected.png`)]);
    assert.ok(axes.valid,`${name}: no dominant perpendicular axes`);
    const aligned=fittedHomography(image.width,image.height,fov,result.normal,image.width,image.height,axes.rotation);
    writeBMP(bmp,warp(image,aligned),image.width,image.height);
    sips(['-s','format','png',bmp,'--out',path.join(outputDir,`${name}-aligned.png`)]);
    const stats={image:name,width:image.width,height:image.height,fov,normal:result.normal,
      confidence:result.confidence,lines:result.lineCount,pairs:result.pairCount,inliers:result.inliers.length,
      identityScore:result.identityScore,correctedScore:result.score,axisRotationDegrees:degrees(axes.rotation),axisSupport:axes.support,
      lsdMs:t1-t0,totalMs:elapsed,heapBytes:detection.heapBytes};
    results.push(stats);console.log(JSON.stringify(stats));
  }
  writeFileSync(path.join(outputDir,'image-results.json'),JSON.stringify(results,null,2)+'\n');
}finally{rmSync(temp,{recursive:true,force:true});}
