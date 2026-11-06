import { createLSD } from './lsd.js';
import { prepareEvidence, estimatePlane, estimateAxisRotation } from './geometry.js';

const detector = createLSD();
detector.then(() => postMessage({kind:'ready'})).catch(error => postMessage({kind:'error',message:error.message}));

self.onmessage = async ({data}) => {
  if (data.kind !== 'frame') return;
  try {
    const lsd = await detector;
    const start = performance.now();
    const {width,height,rgba,fov,previous,id,generation} = data;
    const gray = new Uint8Array(width*height);
    for(let i=0,j=0;i<gray.length;i++,j+=4)
      gray[i] = (54*rgba[j]+183*rgba[j+1]+19*rgba[j+2])>>8;
    const detection = lsd.detect(gray,width,height);
    const detectedAt = performance.now();
    const evidence = prepareEvidence(detection.segments,width,height,fov);
    const result = estimatePlane(evidence,{previous,trials:112,seed:(id*2654435761+123456789)|0});
    const axes=estimateAxisRotation(evidence,result,data.previousAxisRotation??0);
    const inlierLines = new Set();
    for(const index of result.inliers){inlierLines.add(evidence.pairs[index].i);inlierLines.add(evidence.pairs[index].j);}
    const overlay = new Float32Array(evidence.lines.length*5);
    evidence.lines.forEach((line,i)=>{overlay.set(line.segment,i*5);overlay[i*5+4]=inlierLines.has(i)?1:0;});
    postMessage({kind:'result',id,generation,width,height,
      normal:result.normal,valid:result.valid,confidence:result.confidence,axes,
      lineCount:result.lineCount,pairCount:result.pairCount,inlierCount:result.inliers.length,
      score:result.score,identityScore:result.identityScore,
      lsdMs:detectedAt-start,analysisMs:performance.now()-start,
      heapBytes:detection.heapBytes,overlay},[overlay.buffer]);
  } catch(error) {
    postMessage({kind:'frame-error',generation:data.generation,message:error.message});
  }
};
