// Signet Ring Band Generator - Version 10/17/2024
// A simple tool for parametric design of ring bands.
// Instructions: Press "Play" (▶) button to run.
// Print the downloaded PNG image at 4"x2" (288ppi).
// 
// Created by Golan Levin for Zen Levin (IG: @zenmetal__)
// This software is licensed: Creative Commons CC-BY 4.0
// https://creativecommons.org/licenses/by/4.0/deed.en
//
// CAUTION CAUTION CAUTION CAUTION CAUTION CAUTION
// The data used here produces rings that may run
// as much as ~2 sizes too small, in practice!!
//
// US Ring Size data is taken from the following sites:
// https://www.carreracasting.com/charts/ring-size and
// https://www.brilliance.com/ring-size-conversion-chart
//
const USRingSizesInMm = {
   "3.00": 14.05,
   "3.25": 14.24,
   "3.50": 14.45,
   "3.75": 14.65,
   "4.00": 14.86,
   "4.25": 15.07,
   "4.50": 15.27,
   "4.75": 15.48,
   "5.00": 15.70,
   "5.25": 15.90,
   "5.50": 16.10,
   "5.75": 16.31,
   "6.00": 16.51,
   "6.25": 16.73,
   "6.50": 16.92,
   "6.75": 17.14,
   "7.00": 17.35,
   "7.25": 17.56,
   "7.50": 17.75,
   "7.75": 17.97,
   "8.00": 18.19,
   "8.25": 18.39,
   "8.50": 18.59,
   "8.75": 18.78,
   "9.00": 18.99,
   "9.25": 19.22,
   "9.50": 19.41,
   "9.75": 19.63,
  "10.00": 19.84,
  "10.25": 20.05,
  "10.50": 20.24,
  "10.75": 20.46,
  "11.00": 20.68,
  "11.25": 20.88,
  "11.50": 21.08,
  "11.75": 21.30,
  "12.00": 21.49,
  "12.25": 21.71,
  "12.50": 21.89,
  "12.75": 22.12,
  "13.00": 22.33,
  "13.25": 22.54,
  "13.50": 22.75,
  "13.75": 22.92,
  "14.00": 23.16,
  "14.25": 23.37,
  "14.50": 23.55,
  "14.75": 23.78,
  "15.00": 24.00,
};

// NOTE: This software has the following dependencies: 
// p5.js v.1.10.0, https://github.com/processing/p5.js
// p5.EasyCam.js v.1.2.3, https://github.com/freshfork/p5.EasyCam
// jsPDF v.2.5.2, https://github.com/parallax/jsPDF

const ppi = 72;
const ppmm = ppi / 25.4;
const nSegs = 72;
const EPSILON = 0.000001;
const sliderDy = 18;
const sliderY = 20; 
const easyCamH = 165; 

let rungs = [];
let bandDiamMm, bandLengthMm, scaleFactor;
let shapeFactor1, shapeFactor2, shapeFactor3; 
let minBandWidthMm, maxBandWidthMm, bandThicknessMm; 
let ringSize, maxVal, minVal;

let offscreen;
let theCanvas;
let myButtonPNG;
let myButtonPDF;
let myFlipSeamCheckbox; 
let myOrthoCheckbox; 
let easycam;
let myFont;
let sliderA;
let sliderB;
let sliderC;
let sliderD;
let sliderE;
let sliderF;
let sliderG;

//------------------------------------------------------------------
function preload(){
  myFont = loadFont("mono.ttf");
}

//------------------------------------------------------------------
function setup() {
  theCanvas = createCanvas(375, 500, WEBGL);
  document.oncontextmenu = ()=>false;
  
  let my3DGraphics = createGraphics(width,easyCamH, WEBGL)
  easycam = new Dw.EasyCam(my3DGraphics._renderer, {distance : 1100});
  easycam.attachMouseListeners(this._renderer);
  easycam.setViewport([0,height-easyCamH,width,easyCamH]);
  easycam.setDistanceMin(800);
  easycam.setDistanceMax(1200);
  easycam.setRotationScale(0.005); 
  
  offscreen = createGraphics(288, 144);
  offscreen.pixelDensity(4);

  textFont(myFont);
  textSize(10);
  
  createUserInterfaceElements();
}

//------------------------------------------------------------------
function draw() {
  background(220);
  
  computeRingShape(); 
  createOffscreenImage(); 
  drawRing3D();
  displayRing3D();
  drawSliderLabels();
  
  let ix = -width / 2 + (width - offscreen.width) / 2;
  let iy = -height / 2 + 190;
  image(offscreen, ix, iy);
}

//------------------------------------------------------------------
function computeRingShape(){
  ringSize = sliderD.value();
  bandDiamMm = USRingSizesInMm[nf(ringSize, 1,2)];
  bandLengthMm = bandDiamMm * PI;
  minBandWidthMm = sliderA.value();
  maxBandWidthMm = sliderB.value();
  shapeFactor1 = sliderC.value();
  shapeFactor2 = sliderF.value();
  shapeFactor3 = sliderG.value();
  bandThicknessMm = sliderE.value();
  scaleFactor = ppmm;

  rungs = []; 
  maxVal = 0;
  minVal = 999;
  for (let i = nSegs; i >= 0; i--) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let fun = 0.5 + 0.5 * cos(theta + PI);
    fun = AdjustableCenterDoubleExponentialSigmoid(
      fun,
      shapeFactor2,
      shapeFactor3
    );
    fun = pow(fun, shapeFactor1);
    let val01 = map(fun, 0, 1, 0, 1);
    let val = map(val01, 0, 1, minBandWidthMm, maxBandWidthMm);
    let pyA = 0 + val / 2;
    if (val > maxVal) {
      maxVal = val;
    }
    if (val < minVal){
      minVal = val; 
    }
    rungs[i] = pyA;
  }
}

//------------------------------------------------------------------
function drawSliderLabels(){
  push();
  translate(0 - width / 2, 0 - height / 2);
  fill(0);
  noStroke();
  
  
  let textY = sliderY + 13;
  let ibwm = nf(minBandWidthMm, 1,1); 
  let abwm = nf(maxBandWidthMm, 1,1);
  let bdm = nf(bandDiamMm, 1,2);
  let bthm = nf(bandThicknessMm, 1,1);
  let rs = nf(ringSize, 1,2);
  
  textAlign(CENTER);
  text("Signet Ring Band Generator", width / 2, textY-sliderDy);

  textAlign(LEFT);
  text("A. minBandWidth (mm) = " + ibwm, 192,textY);
  textY += sliderDy;
  text("B. maxBandWidth (mm) = " + abwm, 192,textY);
  textY += sliderDy;
  text("C. USRingSize: " + rs + " (" + bdm + "mm)", 192,textY);
  textY += sliderDy;
  text("D. sheetThickness (mm) = " + bthm, 192,textY);
  textY += sliderDy;
  text("E. shapeFactor1 = " + nf(shapeFactor1, 1,2), 192,textY);
  textY += sliderDy;
  text("F. shapeFactor2 = " + nf(shapeFactor2, 1,2), 192,textY);
  textY += sliderDy;
  text("G. shapeFactor3 = " + nf(shapeFactor3, 1,2), 192,textY);
  text("Flip Seam", 30, 171);
  text("Ortho", 120, 171);
  pop();
}

//------------------------------------------------------------------
function createOffscreenImage(){
  let blm = bandLengthMm;
  offscreen.background("white");
  offscreen.fill(0);
  offscreen.noStroke();
  offscreen.text('4"×2"', 3, 12);
  offscreen.noFill();
  offscreen.stroke(0);
  offscreen.rect(0, 0, offscreen.width, offscreen.height);
  offscreen.push();
  offscreen.translate(
    (offscreen.width - blm * scaleFactor) / 2,
    offscreen.height * 0.6
  );
  offscreen.scale(scaleFactor);
  offscreen.strokeWeight(0.75 / scaleFactor);

  let bDrawScaleLabels = true;
  if (bDrawScaleLabels){
    offscreen.stroke(0);
    let ly = (-0.45 * offscreen.height) / scaleFactor;
    offscreen.line(0, ly, blm, ly);
    offscreen.line(0, ly - 3, 0, ly + 3);
    offscreen.line(blm, ly - 3, blm, ly + 3);
    
    let vx=9;
    offscreen.line(blm+vx, 0 - maxVal/2, blm+vx,     maxVal/2);
    if ((2 * maxVal * scaleFactor - 8) > (textWidth(nf(maxVal, 1,1)) )){
      offscreen.line(blm+vx, 0 - maxVal/2, blm+vx+3, 0 - maxVal/2);
      offscreen.line(blm+vx,     maxVal/2, blm+vx+3,     maxVal/2);
    }
    let bDrawMinTicks = false;
    if ((2 * minVal * scaleFactor - 8) > (textWidth(nf(minVal,1,1)) )){
      offscreen.line(blm+vx, 0 - minVal/2, blm+vx-3, 0 - minVal/2);
      offscreen.line(blm+vx,     minVal/2, blm+vx-3,     minVal/2);
      bDrawMinTicks = true;
    }
    offscreen.fill(0);
    offscreen.noStroke();
    offscreen.textAlign(CENTER, CENTER);
    offscreen.textSize(8 / scaleFactor);
    let str = "Len: " + nf(blm, 1,1) + " mm";
    str += " • " + nf(blm / 25.4, 1,2) + " in";
    str += " @" + ppi * offscreen.pixelDensity() + " ppi";
    offscreen.text(str, blm / 2, ly + 2);
    let ristr = int(ringSize) + "";
    if ((ringSize%1.0) > 0){
      ristr += ((ringSize%1.0) === 0.5) ? "½" : "¼"; 
    }
    ristr += "."; 
    offscreen.text("US ring size (nominal): " + ristr, blm/2,ly-2);
    offscreen.text("CAUTION: Ring size may run small!", blm/2,ly-5);
    
    // Verts: 
    offscreen.push();
    offscreen.translate(blm + vx, 0);
    offscreen.rotate(-PI / 2);
    offscreen.textAlign(CENTER, CENTER);
    offscreen.text(nf(maxVal, 1, 1), 0, 2);
    offscreen.text(nf(minVal, 1, 1), 0, -2);
    offscreen.textAlign(LEFT, CENTER);
    offscreen.text("mm", maxVal/2+1, 0);
    let humph = (maxVal - minVal)/2;
    if (humph > 6.0){
      offscreen.text(nf(humph,1,1), 0-(maxVal/2+0.1), -2);
    }
    offscreen.pop();
  }
  
  let bDrawMainContour = true;
  let bFlipSeamLocation = myFlipSeamCheckbox.checked(); 
  if (bDrawMainContour){
    offscreen.stroke(0);
    offscreen.strokeWeight(0.75 / scaleFactor);
    offscreen.noFill();
    offscreen.beginShape();
    for (let i = 0; i <= nSegs; i++) {
      let px = map(i, 0, nSegs, 0, blm);
      let j = (bFlipSeamLocation) ? (i + nSegs/2)%nSegs : i;
      let pyA = rungs[j]; 
      offscreen.vertex(px, pyA);
    }
    for (let i = nSegs; i >= 0; i--) {
      let px = map(i, 0, nSegs, 0, blm);
      let j = (bFlipSeamLocation) ? (i + nSegs/2)%nSegs : i;
      let pyB = 0 - rungs[j];
      offscreen.vertex(px, pyB);
    }
    offscreen.endShape(CLOSE);
  } 

  let bDrawGrid = true;
  if (bDrawGrid){
    offscreen.noFill();
    offscreen.stroke(0);
    offscreen.strokeWeight(0.25 / scaleFactor);
    offscreen.line(0, 0, blm, 0);
    offscreen.line(0, 0 - minBandWidthMm/2, blm, 0 - minBandWidthMm/2);
    offscreen.line(0, 0 + minBandWidthMm/2, blm, 0 + minBandWidthMm/2);
    if (bFlipSeamLocation){
      offscreen.arc(blm,0, maxVal,maxVal, radians(90),radians(270)); 
      offscreen.arc(0,0,   maxVal,maxVal, radians(-90),radians(90)); 
      offscreen.arc(blm,0, maxVal/2,maxVal/2, radians(90),radians(270)); 
      offscreen.arc(0,0,   maxVal/2,maxVal/2, radians(-90),radians(90));
    } else {
      offscreen.circle(blm / 2, 0, maxVal);
      offscreen.circle(blm / 2, 0, maxVal / 2);
    }
    for (let i = 0; i < nSegs; i += 6) {
      let px = map(i, 0, nSegs, 0, blm);
      let j = (bFlipSeamLocation) ? (i + nSegs/2)%nSegs : i;
      let pyB = rungs[j];
      offscreen.line(px, 0 - pyB, px, pyB);
    }
  }
  offscreen.pop();

  let bDrawSettingsInfo = true;
  if (bDrawSettingsInfo){
    offscreen.noStroke();
    offscreen.fill(0);
    offscreen.push();
    offscreen.scale(0.5);
    offscreen.translate(5, 40);
    offscreen.textAlign(LEFT, CENTER);
    offscreen.textFont(myFont);
    let dyt = 12; 
    offscreen.text("Settings: ", 3, 0*dyt);
    offscreen.text("A: " + nf(minBandWidthMm, 1, 1), 3, 1*dyt);
    offscreen.text("B: " + nf(maxBandWidthMm, 1, 1), 3, 2*dyt);
    offscreen.text("C: " + nf(ringSize,       1, 2), 3, 3*dyt);
    offscreen.text("D: " + nf(bandThicknessMm,1, 1), 3, 4*dyt);
    offscreen.text("E: " + nf(shapeFactor1,   1, 2), 3, 5*dyt);
    offscreen.text("F: " + nf(shapeFactor2,   1, 2), 3, 6*dyt);
    offscreen.text("G: " + nf(shapeFactor3,   1, 2), 3, 7*dyt);
    offscreen.pop();
  }
}

//------------------------------------------------------------------
function displayRing3D(){
  noStroke(); 
  var vp = easycam.getViewport();
  
  // Draw a dark blurry one (shadow)
  push(); 
  resetMatrix();
  tint(0,0,0, 128); 
  ortho(0, width, -height, 0, -Number.MAX_VALUE, 0);
  texture(easycam.graphics);
  rect(vp[0], vp[1]+0*(height-easyCamH), vp[2], vp[3]);
  pop(); 
  filter(BLUR, 5);
  
  // Draw a crisp white one
  push(); 
  resetMatrix();
  tint(255); 
  ortho(0, width, -height, 0, -Number.MAX_VALUE, 0);
  texture(easycam.graphics);
  rect(vp[0], vp[1]+0*(height-easyCamH), vp[2], vp[3]);
  pop();
  
  tint(255);
}

//------------------------------------------------------------------
function drawRing3D(){
  let innerRadius = bandDiamMm / 2.0;
  let outerRadius = innerRadius + bandThicknessMm;

  let pg = easycam.graphics;
  pg.clear();
  pg.push();
  
  if (myOrthoCheckbox.checked()){
    var cam_dist = easycam.getDistance();
    var oscale = cam_dist * 0.001;
    var ox = width  / 2 * oscale;
    var oy = easyCamH / 2 * oscale;
    pg.ortho(-ox, +ox, -oy, +oy, -10000, 10000);
    easycam.setPanScale(0.004 / sqrt(cam_dist));
  }
  
  pg.rotateZ(HALF_PI);
  pg.rotateX(radians(-85)); 
  pg.scale(6);
  pg.strokeWeight(1);
  
  pg.fill(255);
  pg.stroke(0, 0, 0, 50);

  pg.beginShape(QUAD_STRIP);
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = innerRadius * cos(theta);
    let py = innerRadius * sin(theta);
    let val = rungs[i % nSegs];
    pg.vertex(px, py, 0 + val);
    pg.vertex(px, py, 0 - val);
  }
  pg.endShape();

  pg.beginShape(QUAD_STRIP);
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = outerRadius * cos(theta);
    let py = outerRadius * sin(theta);
    let val = rungs[i % nSegs];
    pg.vertex(px, py, 0 + val);
    pg.vertex(px, py, 0 - val);
  }
  pg.endShape();

  pg.beginShape(QUAD_STRIP);
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = innerRadius * cos(theta);
    let py = innerRadius * sin(theta);
    let qx = outerRadius * cos(theta);
    let qy = outerRadius * sin(theta);
    let val = rungs[i % nSegs];
    pg.vertex(px, py, 0 - val);
    pg.vertex(qx, qy, 0 - val);
  }
  pg.endShape();
  pg.beginShape(QUAD_STRIP);
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = innerRadius * cos(theta);
    let py = innerRadius * sin(theta);
    let qx = outerRadius * cos(theta);
    let qy = outerRadius * sin(theta);
    let val = rungs[i % nSegs];
    pg.vertex(px, py, 0 + val);
    pg.vertex(qx, qy, 0 + val);
  }
  pg.endShape();

  pg.noFill();
  pg.stroke(0, 0, 0, 255);
  pg.strokeWeight(1);
  pg.beginShape();
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = innerRadius * cos(theta);
    let py = innerRadius * sin(theta);
    let val = rungs[i % nSegs];
    let pzA = 0 + val;
    pg.vertex(px, py, pzA);
  }
  pg.endShape(CLOSE);
  pg.beginShape();
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = innerRadius * cos(theta);
    let py = innerRadius * sin(theta);
    let val = rungs[i % nSegs];
    let pzB = 0 - val;
    pg.vertex(px, py, pzB);
  }
  pg.endShape(CLOSE);
  pg.beginShape();
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = outerRadius * cos(theta);
    let py = outerRadius * sin(theta);
    let val = rungs[i % nSegs];
    let pzA = 0 + val;
    pg.vertex(px, py, pzA);
  }
  pg.endShape(CLOSE);
  pg.beginShape();
  for (let i = 0; i <= nSegs; i++) {
    let theta = map(i, 0, nSegs, 0, TWO_PI);
    let px = outerRadius * cos(theta);
    let py = outerRadius * sin(theta);
    let val = rungs[i % nSegs];
    let pzB = 0 - val;
    pg.vertex(px, py, pzB);
  }
  pg.endShape(CLOSE);
  
  pg.pop();
}

//------------------------------------------------------------------
function keyPressed() {
  if (key == "S") {
    saveOutputPNG();
  } else if (key == 'P'){
    saveOutputPDF(); 
  }
}


//------------------------------------------------------------------
function saveOutputPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: [8.5, 11]
  });
  
  let dateStr = year();
  dateStr += "/" + nf(month(),2); 
  dateStr += "/" + nf(day(),2);
  dateStr += " @ " + nf(hour(),2); 
  dateStr += ":" + nf(minute(),2); 
  dateStr += ":" + nf(second(),2); 
  
  doc.text("Created with the Signet Ring Band Generator:", 1,1.0);
  doc.text("https://editor.p5js.org/golan/sketches/agU6jerpg",   1,1.3); 
  doc.text("Generated on: " + dateStr, 1,1.6);

  let diagramImgData = offscreen.canvas.toDataURL('image/png');
  doc.addImage(diagramImgData, 'PNG', 1,2, 4,2); // x,y, width,height in PDF

  // Capture an image of the 3D ring.
  let density = 2; 
  let ringCanvas = document.createElement('canvas');
  ringCanvas.width = easycam.graphics.width * density;
  ringCanvas.height = easycam.graphics.height * density;
  let ringCtx = ringCanvas.getContext('2d');
  let ringImg = easycam.graphics.get(0, 0, ringCanvas.width, ringCanvas.height);
  ringCtx.drawImage(ringImg.canvas, 0, 0);
  let ringImgData = ringCanvas.toDataURL('image/png');
  let ringImgW = ringCanvas.width / (ppi*density); 
  let ringImgH = ringCanvas.height / (ppi*density); 
  let ringAsp = ringImgH / ringImgW; 
  doc.addImage(ringImgData, 'PNG', 1,4.25, 4,4*ringAsp);
  
  let outputFilename = makeOutputFilename(); 
  outputFilename += ".pdf";
  doc.save(outputFilename);
}

//------------------------------------------------------------------
function saveOutputPNG() {
  let outputFilename = makeOutputFilename(); 
  outputFilename += ".png";
  offscreen.save(outputFilename);
}

//------------------------------------------------------------------
function makeOutputFilename(){
  let ringSize_ = sliderD.value();
  let bandDiamMm_ = USRingSizesInMm[nf(ringSize, 1,2)];
  let bandLengthMm_   = bandDiamMm * TWO_PI;
  let minBandWidthMm_ = nf(sliderA.value(), 1,1);
  let maxBandWidthMm_ = nf(sliderB.value(), 1,1);
  let shapeFactor1_   = nf(sliderC.value(), 1,2);
  let shapeFactor2_   = nf(sliderF.value(), 1,2);
  let shapeFactor3_   = nf(sliderG.value(), 1,2);

  let str = "ring_" + ringSize_ + "_";
  str += minBandWidthMm_ + "-";
  str += maxBandWidthMm_ + "_";
  str += shapeFactor1_ + "_";
  str += shapeFactor2_ + "_";
  str += shapeFactor3_; 
  
  return str; 
}

//------------------------------------------------------------------
function AdjustableCenterDoubleExponentialSigmoid(x, a, b) {
  let min_param_a = 0.0 + EPSILON;
  let max_param_a = 1.0 - EPSILON;
  a = 1 - constrain(a, min_param_a, max_param_a);
  let y = 0;
  let w = max(0, min(1, x - (b - 0.5)));
  if (w <= 0.5) {
    y = pow(2.0 * w, 1.0 / a) / 2.0;
  } else {
    y = 1.0 - pow(2.0 * (1.0 - w), 1.0 / a) / 2.0;
  }
  return y;
}

//------------------------------------------------------------------
function createUserInterfaceElements(){
  myButtonPNG = createButton("⬇PNG");
  myButtonPNG.position(192, 155);
  myButtonPNG.mousePressed(saveOutputPNG);
  
  myButtonPDF = createButton("⬇PDF");
  myButtonPDF.position(255, 155);
  myButtonPDF.mousePressed(saveOutputPDF);
  
  myFlipSeamCheckbox = createCheckbox();
  myFlipSeamCheckbox.position(10, 158);
  myOrthoCheckbox = createCheckbox("", true);
  myOrthoCheckbox.position(100, 158);

  let sy = sliderY;
  sliderA = createSlider(2, 10, 4, 0.1);
  sliderA.position(10, sy).size(175);
  sliderB = createSlider(4, 35, 16, 0.1);
  sliderB.position(10, (sy += sliderDy)).size(175);
  sliderD = createSlider(3.0, 15.0, 9, 0.25);
  sliderD.position(10, (sy += sliderDy)).size(175);
  sliderE = createSlider(0.5, 3.0, 1.0, 0.1);
  sliderE.position(10, (sy += sliderDy)).size(175);
  sliderC = createSlider(1.0, 12,  3.0, 0.1);
  sliderC.position(10, (sy += sliderDy)).size(175);
  sliderF = createSlider(0.0, 1.0, 0.0, 0.02);
  sliderF.position(10, (sy += sliderDy)).size(175);
  sliderG = createSlider(0.0, 1.0, 0.5, 0.02);
  sliderG.position(10, (sy += sliderDy)).size(175);
}