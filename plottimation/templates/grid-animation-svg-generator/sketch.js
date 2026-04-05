// Press keys 1-3 for different animation designs. 
// Press 's' to save SVG. 

// Some good grid sizes are:
// 5x4, 4x4, 4x3, 6x4, 6x5, 5x5, 3x3, 5x3
const nCols = 5; 
const nRows = 4;
const aspectFrame = 4/3;

const inch = 96;
const crossSize = inch / 4;
const marginPageX = inch * 0.75;
const marginCell = inch * 0.25;
const nFrames = nCols * nRows;
let bShowDebug = false;
let bAnimating = true;
let myFrameCount = 0; 
let ANIMATION_STYLE = 1;

// For SVG export
p5.disableFriendlyErrors = true; 
let bDoExportSvg = false; 
let exportSvgButton;

//-------------------------------------------------
function setup() {
  createCanvas(11*inch, 8.5*inch);
  frameRate(30); 
  strokeWeight(1.0); 
  noFill(); 
  
  exportSvgButton = createButton('Export SVG');
  exportSvgButton.position(10,10);
  exportSvgButton.mousePressed(function () {
    bDoExportSvg = true;
  });
}


//-------------------------------------------------
function keyPressed(){
  if (key == 's'){ 
    bDoExportSvg = true; 
  } else if (key == 'd'){
    bShowDebug = !bShowDebug;
  } else if (key == ' '){
    bAnimating = !bAnimating; 
  } else if (!bAnimating && keyCode === LEFT_ARROW) {
    myFrameCount--;
  } else if (!bAnimating && keyCode === RIGHT_ARROW) {
    myFrameCount++;
  } else if (key == 1){
    ANIMATION_STYLE = 1; 
  } else if (key == 2){
    ANIMATION_STYLE = 2; 
  } else if (key == 3){
    ANIMATION_STYLE = 3; 
  }
}


//-------------------------------------------------
function draw() {
  background('white');
  if (bDoExportSvg){
    let timeStr = nf(hour(),2)+nf(minute(),2); 
    let fn = "animation_" + nCols + "x" + nRows + "_" + timeStr + ".svg";
    beginRecordSvg(this, fn);
    setSvgGroupByStrokeColor(true); 
    setSvgFlattenTransforms(true); 
  }
  
  if (bAnimating){ 
    myFrameCount++; 
  }
  
  stroke('black');
  drawDebugAndRegistrationFeatures(); 
  drawAnimationFrames();

  if (bDoExportSvg){
    endRecordSvg();
    bDoExportSvg = false;
  }
}



//-------------------------------------------------
function drawAnimationFrames(){
  for (let row=0; row<nRows; row++){
    for (let col=0; col<nCols; col++){
      let C = getCellAndFrameCoords(row,col); 
      let findex = row*nCols + col;
      const fx = C.framex;
      const fy = C.framey;
      const fw = C.framew;
      const fh = C.frameh;
      
      switch (ANIMATION_STYLE){
        case 1: 
          drawAnimationFrameStyle1(fx,fy,fw,fh, findex);
          break;
        case 2: 
          drawAnimationFrameStyle2(fx,fy,fw,fh, findex);
          break;
        case 3:
          drawAnimationFrameStyle3(fx,fy,fw,fh, findex);
          break;
      }
    }
  }
}


//-------------------------------------------------
function drawAnimationFrameStyle1 (fx,fy, fw,fh, findex){
  // ANIMATION_STYLE 1
  // After a design by Dave Mawer (dmawer_art)
  // https://x.com/FigsFromPlums/status/1974203677771477418
  const phase = TWO_PI * ((myFrameCount+findex)%nFrames)/nFrames; 
  push(); 
  translate(fx,fy); 
  let nLines = 19; 
  for (let i=0; i<nLines; i++){
    let sx = map(i, 0, nLines-1, 0, 0.75 * TWO_PI) + phase; 
    let px = map(i, 0, nLines-1, 0,fw); 
    let sy = sin(sx) * ((i%2 == 0) ? 1 : -1);
    let py = map(sy, -1,1, fh*0.3, fh*0.7); 
    let qy = (i%2 == 0) ? fh : 0;
    line(px,py, px,qy); 
  }
  pop(); 
}


//-------------------------------------------------
function drawAnimationFrameStyle2 (fx,fy, fw,fh, findex){
  // ANIMATION_STYLE 2
  const t = ((myFrameCount+findex)%nFrames)/nFrames;
  push(); 
  translate(fx,fy); 
  
  let cx = fw/2 + 0*20 * sin(t*TWO_PI + PI/2);
  let cy = fh/2 + 0*10 * sin(t*TWO_PI * 2);
  let nc = 20;
  for (let i=0; i<nc; i++){
    let cr = map(i+t,0,nc, 0,1); 
    cr = pow(cr, 0.6); 
    cr *= fw * 0.7; 
    cr += 2.0 * sin((t*TWO_PI) + 2*(i+t)/nc * TWO_PI);
    cr += 0.5; 
    
    let qx = cx;
    let qy = cy; 
    const np = 32; 
    for (let j=0; j<=np; j++){
      let u = map(j,0,np, 0,TWO_PI);
      u += t * TWO_PI / np;
      let px = cx + cr * cos(u); 
      let py = cy + cr * sin(u);  
      if ((j > 0) && ((j+i)%2 == 0)) {
        lineClipped(px,py,qx,qy, 0,0,fw,fh); 
        // line(px,py,qx,qy); 
      }
      qx = px; 
      qy = py;
    }
  }
  pop(); 
}

//-------------------------------------------------
function drawAnimationFrameStyle3 (fx,fy, fw,fh, findex){
  // ANIMATION_STYLE 2
  const t = ((myFrameCount+findex)%nFrames)/nFrames;

  function drawClippedRotRect(px,py, rw,rh, rotAng) {
    let hw = rw * 0.5;
    let hh = rh * 0.5;
    let c = cos(rotAng);
    let s = sin(rotAng);
    let x0 = -hw, y0 = -hh;
    let x1 =  hw, y1 = -hh;
    let x2 =  hw, y2 =  hh;
    let x3 = -hw, y3 =  hh;
    let ax = px + x0 * c - y0 * s;
    let ay = py + x0 * s + y0 * c;
    let bx = px + x1 * c - y1 * s;
    let by = py + x1 * s + y1 * c;
    let cx = px + x2 * c - y2 * s;
    let cy = py + x2 * s + y2 * c;
    let dx = px + x3 * c - y3 * s;
    let dy = py + x3 * s + y3 * c;
    lineClipped(ax,ay, bx,by, 0,0,fw,fh);
    lineClipped(bx,by, cx,cy, 0,0,fw,fh);
    lineClipped(cx,cy, dx,dy, 0,0,fw,fh);
    lineClipped(dx,dy, ax,ay, 0,0,fw,fh);
  }

  push(); 
  translate(fx,fy); 
  rect(0,0, fw,fh); 
    let px = fw * 0.7; 
    let py = fh * 0.4; 
    let pw = fw * 0.7;
    let ph = fh * 0.6;
    let rot = t*PI; 
    drawClippedRotRect(px,py, pw,ph, rot);
  pop(); 
}




//-------------------------------------------------
function drawDebugAndRegistrationFeatures(){
  for (let row=0; row<=nRows; row++){
    for (let col=0; col<=nCols; col++){
      let C = getCellAndFrameCoords(row,col); 
      
      // draw registration crosses
      let d = crossSize/2;
      line(C.cellx,C.celly-d, C.cellx,C.celly+d);
      line(C.cellx-d,C.celly, C.cellx+d,C.celly);
      
      if (row<nRows && col<nCols){
        // draw animation frame borders
        if (bShowDebug){
          rect(C.framex,C.framey, C.framew,C.frameh); 
        }
      }
    }
  }
}


//-------------------------------------------------
function getCellAndFrameCoords(row, col){
  let cx = map(col,0,nCols, marginPageX,width-marginPageX);
  let cw = (width - 2*marginPageX)/nCols;
  let fw = cw - 2*marginCell;
  let fh = fw/aspectFrame;
  let ch = fh + 2*marginCell;
  let marginPageY = (height - nRows*ch)/2;
  let cy = marginPageY + row*ch;
  let fx = cx + marginCell;
  let fy = cy + marginCell; 
  
  return { 
    cellx: cx,
    celly: cy,
    cellw: cw,
    cellh: ch, 
    framex: fx, 
    framey: fy, 
    framew: fw,
    frameh: fh
  };
}


//-------------------------------------------------
function lineClipped(ax, ay, bx, by, rx, ry, rw, rh){
  let L = getLineClippedToRect(ax, ay, bx, by, rx, ry, rw, rh);
  if (L){
    line(L.x0,L.y0, L.x1,L.y1);
  }
}


//-------------------------------------------------
// Liang–Barsky clipping:
// Crop a line segment (ax,ay)-(bx,by) to 
// an axis-aligned rect at (rx,ry) size (rw,rh).
// Returns {x0,y0,x1,y1} if there is an overlap; 
// otherwise returns null.
function getLineClippedToRect(ax, ay, bx, by, rx, ry, rw, rh) {
  const xMin = rx,      xMax = rx + rw;
  const yMin = ry,      yMax = ry + rh;

  let t0 = 0, t1 = 1;                 // param range for clipped segment
  const dx = bx - ax, dy = by - ay;

  // Liang–Barsky helper: clip against a single half-space
  function clip(p, q) {
    if (p === 0) {                    // segment parallel to this boundary
      if (q < 0) return false;        // entirely outside
      return true;                    // inside; no change to [t0,t1]
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else { // p > 0
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  }

  // Clip against the four rectangle sides
  if (
    clip(-dx, ax - xMin) && // left
    clip( dx, xMax - ax) && // right
    clip(-dy, ay - yMin) && // top
    clip( dy, yMax - ay)    // bottom
  ) {
    // Compute the clipped endpoints
    let px = ax + t0 * dx;
    let py = ay + t0 * dy;
    let qx = ax + t1 * dx;
    let qy = ay + t1 * dy;

    // Small numeric guard to land exactly on edges if we're off by ~epsilon
    px = constrain(px, xMin, xMax);
    py = constrain(py, yMin, yMax);
    qx = constrain(qx, xMin, xMax);
    qy = constrain(qy, yMin, yMax);

    return { x0: px, y0: py, x1: qx, y1: qy };
  }
  return null; // no intersection with the rectangle
}

