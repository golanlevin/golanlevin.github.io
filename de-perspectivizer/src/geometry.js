// Camera coordinates: x right, y down, z forward. Matrices are row-major.
// A plane normal n is rectified by a rotation R with R*n = [0,0,1].
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const radians = degrees => degrees * Math.PI / 180;
export const degrees = radians => radians * 180 / Math.PI;
export const normalize = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export function multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    for (let k = 0; k < 3; k++) out[3 * r + c] += a[3 * r + k] * b[3 * k + c];
  return out;
}
export function inverse(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const out = [e*i-f*h, c*h-b*i, b*f-c*e, f*g-d*i, a*i-c*g, c*d-a*f, d*h-e*g, b*g-a*h, a*e-b*d];
  const det = a*out[0] + b*out[3] + c*out[6];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return out.map(v => v / det);
}
export function project(m, x, y) {
  const w = m[6]*x + m[7]*y + m[8];
  return [(m[0]*x+m[1]*y+m[2])/w, (m[3]*x+m[4]*y+m[5])/w, w];
}
export function rotationForNormal(n) {
  const [x, y, z] = normalize(n), k = 1 / (1 + z);
  return [1-x*x*k, -x*y*k, -x, -x*y*k, 1-y*y*k, -y, x, y, z];
}
export function cameraMatrix(width, height, horizontalFov) {
  const f = width / (2 * Math.tan(radians(horizontalFov)/2));
  return [f, 0, width/2, 0, f, height/2, 0, 0, 1];
}
export function rectification(width, height, horizontalFov, normal) {
  const k = cameraMatrix(width, height, horizontalFov);
  return multiply(multiply(k, rotationForNormal(normal)), inverse(k));
}
export function isSafeNormal(normal, width, height, fov) {
  if (normal.some(v => !Number.isFinite(v)) || normal[2] < Math.cos(radians(72))) return false;
  const f = cameraMatrix(width, height, fov)[0];
  // Keep the projective horizon outside the whole frame; no folds/infinities.
  return normal[2] - Math.abs(normal[0])*width/(2*f) - Math.abs(normal[1])*height/(2*f) > 0.10;
}
export function fittedHomography(width, height, fov, normal, outputWidth=width, outputHeight=height, axisRotation=0) {
  let h = rectification(width, height, fov, normal);
  const c=Math.cos(axisRotation),sine=Math.sin(axisRotation);
  h=multiply([c,-sine,0, sine,c,0, 0,0,1],h);
  let corners = [[0,0], [width,0], [width,height], [0,height]].map(([x,y]) => project(h,x,y));
  if (corners.some(p => !p.every(Number.isFinite) || p[2] <= 0.05)) {
    h=IDENTITY.slice();
    corners=[[0,0,1],[width,0,1],[width,height,1],[0,height,1]];
  }
  const xs = corners.map(p=>p[0]), ys = corners.map(p=>p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  // Fit the whole quad to the actual panel, independently of capture aspect.
  const s = Math.min(outputWidth/(right-left), outputHeight/(bottom-top));
  const tx = (outputWidth-s*(right-left))/2-s*left, ty = (outputHeight-s*(bottom-top))/2-s*top;
  return multiply([s,0,tx, 0,s,ty, 0,0,1], h);
}
export const columnMajor = m => [m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];

// Perpendicular, unoriented axes are equivalent every quarter turn. Keep the
// representative nearest the previous correction, including across +/-45°.
export function nearestAxisRotation(rotation, previous=0) {
  const period=Math.PI/2;
  return rotation+Math.round((previous-rotation)/period)*period;
}

export function estimateAxisRotation(evidence, plane, previous=0) {
  const missing={valid:false,rotation:previous,support:0,lineCount:0};
  if(!plane.valid)return missing;
  const used=new Set();
  for(const index of plane.inliers){used.add(evidence.pairs[index].i);used.add(evidence.pairs[index].j);}
  const h=rectification(evidence.width,evidence.height,evidence.fov,plane.normal),directions=[];
  for(const index of used){
    const line=evidence.lines[index],a=project(h,...line.segment.slice(0,2)),b=project(h,...line.segment.slice(2,4));
    if(!a.every(Number.isFinite)||!b.every(Number.isFinite)||a[2]<=0||b[2]<=0)continue;
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<1)continue;
    // Source length rewards structural edges without overweighting lines
    // stretched by rectification near the projective horizon.
    directions.push({angle:Math.atan2(b[1]-a[1],b[0]-a[0]),weight:line.length});
  }
  if(directions.length<3)return missing;
  const tolerance=radians(8),total=directions.reduce((sum,d)=>sum+d.weight,0);
  const distance=(a,b)=>nearestAxisRotation(a-b);
  const weightAt=(d,at)=>{const r=distance(d.angle,at)/tolerance;return Math.abs(r)<1?d.weight*(1-r*r)**2:0;};
  const scoreAt=at=>directions.reduce((sum,d)=>sum+weightAt(d,at),0);
  let axis=-previous,best=scoreAt(axis);
  for(const d of directions){
    const score=scoreAt(d.angle);
    // Keep the previous axis family when competing modes have similar support.
    if(score>best*1.08+1e-6){axis=d.angle;best=score;}
  }
  for(let iteration=0;iteration<3;iteration++){
    let sx=0,sy=0;
    for(const d of directions){const w=weightAt(d,axis);sx+=w*Math.cos(4*d.angle);sy+=w*Math.sin(4*d.angle);}
    axis=nearestAxisRotation(Math.atan2(sy,sx)/4,axis);
  }
  let support=0,count=0;
  const families=[0,0];
  for(const d of directions)if(Math.abs(distance(d.angle,axis))<tolerance){
    support+=d.weight;count++;
    families[Math.abs(Math.cos(d.angle-axis))>Math.SQRT1_2?0:1]+=d.weight;
  }
  const valid=count>=3&&support/total>=0.35&&Math.min(...families)>=0.08*support;
  return {valid,rotation:valid?nearestAxisRotation(-axis,previous):previous,support:support/total,lineCount:count};
}

function makeLine(segment, width, height, f) {
  const [x1,y1,x2,y2] = segment;
  const dx = x2-x1, dy = y2-y1, length = Math.hypot(dx,dy);
  // The image line is a plane through the camera's center. Its 3D normal
  // is K^T*l. Unit normalization removes arbitrary homogeneous scale.
  const c = ((x1-width/2)*(y2-height/2)-(x2-width/2)*(y1-height/2))/f;
  return { segment: Array.from(segment.slice(0,4)), length, dx: dx/length, dy: dy/length,
    m: normalize([-dy, dx, c]) };
}
export function prepareEvidence(segments, width, height, fov, maxLines=200) {
  const f = cameraMatrix(width,height,fov)[0];
  const candidates = [];
  for (let i=0;i<segments.length;i+=7) {
    const s = Array.from(segments.slice(i,i+7));
    if (!s.every(Number.isFinite) || Math.hypot(s[2]-s[0],s[3]-s[1]) < 10) continue;
    candidates.push(makeLine(s,width,height,f));
  }
  candidates.sort((a,b)=>b.length-a.length);
  const lines = [];
  for (const candidate of candidates) {
    const [x1,y1,x2,y2] = candidate.segment;
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const duplicate = lines.some(l => {
      if (Math.abs(l.dx*candidate.dx+l.dy*candidate.dy) < 0.998) return false;
      const [ax,ay,bx,by] = l.segment;
      const distance = Math.abs((mx-ax)*l.dy-(my-ay)*l.dx);
      const along = Math.abs((mx-(ax+bx)/2)*l.dx+(my-(ay+by)/2)*l.dy);
      return distance < 2.5 && along < 0.42*(l.length+candidate.length);
    });
    if (!duplicate) lines.push(candidate);
    if (lines.length>=maxLines) break;
  }
  const pairs = [];
  for (let i=0;i<lines.length;i++) for (let j=i+1;j<lines.length;j++) {
    const a = lines[i], b = lines[j];
    if (Math.abs(a.dx*b.dx+a.dy*b.dy) > Math.cos(radians(12))) continue;
    const [ax,ay,bx,by]=a.segment, [cx,cy,dx,dy]=b.segment;
    const ux=bx-ax,uy=by-ay,vx=dx-cx,vy=dy-cy;
    const cross=ux*vy-uy*vx;
    const t=((cx-ax)*vy-(cy-ay)*vx)/cross;
    const u=((cx-ax)*uy-(cy-ay)*ux)/cross;
    const marginA=0.15+4/a.length, marginB=0.15+4/b.length;
    if (t < -marginA || t > 1+marginA || u < -marginB || u > 1+marginB) continue;
    const x=ax+t*ux,y=ay+t*uy;
    if (x < 0 || x > width || y < 0 || y > height) continue;
    pairs.push({ i,j,x,y, ab:dot(a.m,b.m), weight: Math.min(2,Math.sqrt(Math.min(a.length,b.length)/16)) });
  }
  return {lines,pairs,width,height,fov};
}

function residual(pair, lines, normal) {
  const a=lines[pair.i].m,b=lines[pair.j].m;
  const an=dot(a,normal),bn=dot(b,normal);
  const denominator=Math.sqrt(Math.max(0,1-an*an)*Math.max(0,1-bn*bn));
  return denominator>1e-8 ? (pair.ab-an*bn)/denominator : 1;
}
const slopesNormal = slopes => normalize([slopes[0],slopes[1],1]);
const normalSlopes = normal => [normal[0]/normal[2],normal[1]/normal[2]];

function fit(pairs, lines, initial, iterations=24) {
  let x=initial.slice(), lambda=0.001;
  const values = at => {const n=slopesNormal(at);return pairs.map(p=>residual(p,lines,n));};
  let r=values(x), cost=r.reduce((s,v)=>s+v*v,0);
  for (let k=0;k<iterations;k++) {
    const eps=0.0002;
    const rx=values([x[0]+eps,x[1]]),ry=values([x[0],x[1]+eps]);
    let aa=lambda,ab=0,bb=lambda,ga=0,gb=0;
    for (let i=0;i<r.length;i++) {
      const a=(rx[i]-r[i])/eps,b=(ry[i]-r[i])/eps;
      aa+=a*a;ab+=a*b;bb+=b*b;ga+=a*r[i];gb+=b*r[i];
    }
    const det=aa*bb-ab*ab;
    if (det<1e-16) break;
    let dx=(-bb*ga+ab*gb)/det,dy=(ab*ga-aa*gb)/det;
    const scale=Math.max(1,Math.hypot(dx,dy)/0.6); dx/=scale;dy/=scale;
    const next=[Math.max(-3,Math.min(3,x[0]+dx)),Math.max(-3,Math.min(3,x[1]+dy))];
    const nr=values(next),nc=nr.reduce((s,v)=>s+v*v,0);
    if(nc<cost){x=next;r=nr;cost=nc;lambda=Math.max(1e-7,lambda/3);}
    else lambda=Math.min(1000,lambda*6);
    if(cost<1e-12 || Math.hypot(dx,dy)<1e-6)break;
  }
  return slopesNormal(x);
}

function evaluate(normal, evidence, threshold) {
  const {lines,pairs}=evidence;
  let score=0,error=0;
  const inliers=[];
  for (let i=0;i<pairs.length;i++) {
    const r=Math.abs(residual(pairs[i],lines,normal));
    if(r<threshold){ const q=1-(r/threshold)**2;score+=pairs[i].weight*q*q;inliers.push(i);error+=r*r; }
  }
  return {normal,score,inliers,rms:inliers.length?Math.sqrt(error/inliers.length):1};
}

export function estimatePlane(evidence, {previous=[0,0,1], trials=96, seed=123456789}={}) {
  const {lines,pairs,width,height,fov}=evidence;
  const threshold=Math.sin(radians(3));
  let randomState=seed|0;
  const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return(randomState>>>0)/4294967296;};
  const identity=evaluate([0,0,1],evidence,threshold);
  let best=identity;
  const consider=normal=>{
    if(!isSafeNormal(normal,width,height,fov))return;
    const result=evaluate(normal,evidence,threshold);
    // Prefer the previous orientation when support is effectively tied.
    if(result.score>best.score+0.001)best=result;
  };
  consider(previous);
  if(pairs.length>=2)for(let k=0;k<trials;k++){
    const a=pairs[Math.floor(random()*pairs.length)],b=pairs[Math.floor(random()*pairs.length)];
    if(a===b || (a.i===b.i&&a.j===b.j))continue;
    const start=k%3===0?normalSlopes(previous):[(random()-0.5)*2.8,(random()-0.5)*2.8];
    consider(fit([a,b],lines,start));
  }
  if(best.inliers.length>=3){
    const inlierPairs=best.inliers.map(i=>pairs[i]);
    consider(fit(inlierPairs,lines,normalSlopes(best.normal),20));
  }
  const used=new Set(),cells=new Set();
  for(const index of best.inliers){const p=pairs[index];used.add(p.i);used.add(p.j);cells.add(`${Math.min(3,Math.floor(p.x/width*4))},${Math.min(3,Math.floor(p.y/height*4))}`);}
  const ratio=pairs.length?best.inliers.length/pairs.length:0;
  const confidence=Math.min(1,best.inliers.length/18)*Math.min(1,used.size/10)*Math.min(1,cells.size/4)*Math.min(1,ratio/0.45);
  const valid=best.inliers.length>=6&&used.size>=5&&cells.size>=2&&confidence>=0.22;
  return {...best, valid, confidence, pairCount:pairs.length, lineCount:lines.length,
    inlierRatio:ratio, uniqueLines:used.size, spatialCells:cells.size, identityScore:identity.score};
}
