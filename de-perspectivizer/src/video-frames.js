// Keep a complete camera frame available independently of the render loop.
// Both views and the analyzer read this snapshot, never the live video texture.
export function createCameraFrames(element, createImage) {
  let front=null,back=null,lastMediaTime=null,callbackId=null,disposed=false,serial=0;
  const usesFrameCallbacks=typeof element.requestVideoFrameCallback==='function';
  const stats={copied:0,copyFailures:0,unavailable:0,missedCallbacks:0,lastPresentedFrames:null};

  function copyFrame(mediaTime) {
    if(disposed)return;
    if(element.readyState<2||element.videoWidth<=0||element.videoHeight<=0){stats.unavailable++;return;}
    if(front&&mediaTime===lastMediaTime)return;
    try{
      if(!back||back.width!==element.videoWidth||back.height!==element.videoHeight)
        back=createImage(element.videoWidth,element.videoHeight);
      // Do not clear the visible frame first. Swap only after a successful
      // copy, so a stalled decoder or failed copy leaves the last frame intact.
      back.drawingContext.drawImage(element,0,0,back.width,back.height);
      back.setModified(true); // Tell p5 to upload this image once, when used.
      const previous=front;front=back;back=previous;
      lastMediaTime=mediaTime;serial++;stats.copied++;
    }catch{stats.copyFailures++;}
  }
  function onFrame(_now,metadata) {
    callbackId=null;
    if(disposed)return;
    if(Number.isFinite(metadata.presentedFrames)){
      if(stats.lastPresentedFrames!==null)stats.missedCallbacks+=Math.max(0,metadata.presentedFrames-stats.lastPresentedFrames-1);
      stats.lastPresentedFrames=metadata.presentedFrames;
    }
    copyFrame(metadata.mediaTime);
    callbackId=element.requestVideoFrameCallback(onFrame);
  }

  // Seed the cache from the first decoded frame, then update at camera cadence.
  copyFrame(element.currentTime);
  if(usesFrameCallbacks)callbackId=element.requestVideoFrameCallback(onFrame);
  return {
    poll(){if(!usesFrameCallbacks)copyFrame(element.currentTime);return front;},
    get serial(){return serial;},
    get diagnostics(){return {...stats,serial,usesFrameCallbacks};},
    dispose(){
      disposed=true;
      if(callbackId!==null)element.cancelVideoFrameCallback?.(callbackId);
      callbackId=null;
    }
  };
}
