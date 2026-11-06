import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraFrames} from '../src/video-frames.js';

function camera({callbacks=true}={}){
  const pending=new Map(),allocated=[];
  let nextId=0;
  const element={readyState:2,videoWidth:1920,videoHeight:1080,currentTime:0,content:'first',fail:false};
  if(callbacks){
    element.requestVideoFrameCallback=fn=>{pending.set(++nextId,fn);return nextId;};
    element.cancelVideoFrameCallback=id=>pending.delete(id);
  }
  const cache=createCameraFrames(element,(width,height)=>{
    const frame={width,height,canvas:{},modified:false,drawingContext:{drawImage(video){
      frame.canvas.content=video.content;
      if(video.fail)throw new DOMException('Frame unavailable','InvalidStateError');
    }},setModified(value){frame.modified=value;}};
    allocated.push(frame);return frame;
  });
  function present(content,time,presentedFrames){
    element.content=content;element.currentTime=time;
    if(callbacks){
      const [id,fn]=pending.entries().next().value;pending.delete(id);
      fn(0,{mediaTime:time,presentedFrames});
    }
  }
  return {element,cache,allocated,pending,present};
}

test('camera frames update at video cadence and reuse two snapshots across render ticks',()=>{
  const {cache,present,allocated}=camera();
  const first=cache.poll();assert.equal(first.canvas.content,'first');assert.equal(first.modified,true);
  for(let i=0;i<60;i++)assert.equal(cache.poll(),first);
  assert.equal(allocated.length,1);assert.equal(cache.serial,1);
  for(let i=1;i<30;i++){
    present(`frame ${i}`,i/30,i);
    assert.equal(cache.poll().canvas.content,`frame ${i}`);
    assert.equal(cache.serial,i+1);
  }
  assert.equal(allocated.length,2);
  const last=cache.poll();present('same timestamp',29/30,29);
  assert.equal(cache.poll(),last);assert.equal(cache.poll().canvas.content,'frame 29');assert.equal(cache.serial,30);
});

test('unavailable or failed video copies never expose a blank or partially copied snapshot',()=>{
  const {cache,present,element}=camera(),first=cache.poll();
  element.readyState=1;present('blank',1/30,1);
  assert.equal(cache.poll(),first);assert.equal(cache.poll().canvas.content,'first');
  element.readyState=2;element.fail=true;present('corrupted copy',2/30,2);
  assert.equal(cache.poll(),first);assert.equal(cache.poll().canvas.content,'first');
  assert.equal(cache.serial,1);assert.equal(cache.diagnostics.unavailable,1);assert.equal(cache.diagnostics.copyFailures,1);
  element.fail=false;present('recovered',3/30,3);
  assert.equal(cache.poll().canvas.content,'recovered');assert.equal(cache.serial,2);
});

test('camera snapshots handle dimension changes and cancel callbacks when stopped',()=>{
  const {cache,present,element,pending}=camera();
  element.videoWidth=1280;element.videoHeight=720;present('new resolution',1/30,1);
  assert.equal(cache.poll().width,1280);assert.equal(cache.poll().height,720);
  const lateCallback=pending.values().next().value;
  const serial=cache.serial;cache.dispose();assert.equal(pending.size,0);
  lateCallback(0,{mediaTime:2/30,presentedFrames:2});
  assert.equal(cache.serial,serial);assert.equal(pending.size,0);
});

test('camera snapshots support timestamp polling and start safely before the first decoded frame',()=>{
  const {cache,present,element,allocated}=camera({callbacks:false});
  const first=cache.poll();assert.equal(cache.poll(),first);
  present('second',1/30);assert.equal(cache.poll().canvas.content,'second');assert.equal(allocated.length,2);
  element.readyState=0;assert.equal(cache.poll().canvas.content,'second');
  const cold={readyState:0,videoWidth:0,videoHeight:0,currentTime:0};
  const waiting=createCameraFrames(cold,()=>{throw new Error('Must not allocate before a frame exists');});
  assert.equal(waiting.poll(),null);assert.equal(waiting.serial,0);
  waiting.dispose();
});
