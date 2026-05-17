// Dendron by Golan Levin
// http://www.flong.com/projects/dendron
//
// DBN version, 2000-2001
// Java 1.1 version, October 2001
// Processing v135 version, January 2008
// Processing v4.4.7 version, September 2025
// p5.js v.1.11.10 port: September 2025
// 
// Initiated at the Aesthetics and Computation Group, 
// MIT Media Laboratory, 2000. First presented in 
// "4x4: Life and Oblivion", Friends of Ed, 2002.
// Acquired by the Cooper Hewitt, Smithsonian 
// Design Museum, September 2025, purchase from 
// the General Acquisitions Endowment Fund.
// Edition of 1 + 1 A.P.
//
// To launch in Chrome for kiosk/museum display (2025):
// Mac:
// "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --kiosk --app="file:///.../index.html" --noerrdialogs --disable-infobars
// Windows:
// chrome.exe --kiosk --app="C:\path\to\index.html" --noerrdialogs --disable-infobars

// The following app resolutions are acceptable: 
// 1024x768, 1280x720, 1280x800, 1280x1024, 1024x1024, 1280x1280
// Keep it around ~1 megapixel total, please. 
// Change the resolution by modifying BASE_W & BASE_H:
const BASE_W = 1024; 
const BASE_H = 768;   
let cnv;

let myPaletteR = new Uint8Array(256);
let myPaletteG = new Uint8Array(256);
let myPaletteB = new Uint8Array(256);
let pal32 = new Uint32Array(256);

let rasterW; // canvas width
let rasterH; // canvas height
let rasterPixels; // Uint8 raster of palette indices
let numberOfRasterPixels; // w*h

// DLA simulation state
let numberOfParticles;
let particleArray = [];
let aggregationThreshold = 10;
const maxParticleVelocity = 20;
const DRAW_BYTE = 97;
const ACCRETE_BYTE = 65;
const blurFrequency = 4;
const particlesPerPixel = 0.15;
const baseAggThresholdDelta = 0.10;
const clearRasterThreshold = 0.950; 
// Note: this may change for different resolutions:
// 0.94 for 800x600, 0.96 for 1280x1024

// Interaction & self-player
const durationBeforeSelfPlay = 60000; // timeout
const textFadeTime = 2000;
const aggThreshToRenew = 180;
let selfPlayMaxLen = 1024;
let bSelfPlaying = false;
let bClicked = false;
let lastInteractionTime = 0;
let clickedMillis = 0;
let selfX = 0, selfY = 0;
let pselfX = 0, pselfY = 0;
let selfHeading = 0; 
let selfPlayLen = 0; 

// --------------------------------------------------
function setup() {

  cnv = createCanvas(BASE_W, BASE_H);
  cnv.parent('stage'); // Mount canvas into the centered stage
  pixelDensity(2);
  fitCanvasCSS(); // size the canvas on load

  noSmooth();
  noStroke();
  textFont("monospace");
  colorMode(RGB, 255, 255, 255, 255);

  rasterW = width;
  rasterH = height;
  numberOfRasterPixels = rasterW * rasterH;
  rasterPixels = new Uint8Array(numberOfRasterPixels);
  for (let i = 0; i < numberOfRasterPixels; i++) {
    rasterPixels[i] = 0;
  }

  createCustomPalette();
  initializeSimulation();
}

function windowResized() {
  fitCanvasCSS();
}

function fitCanvasCSS() {
  // Scale the canvas' CSS size to fit/letterbox 
  // within the window while preserving the aspect ratio. 
  // The internal drawing size remains BASE_WxBASE_H.

  const ww = windowWidth;
  const wh = windowHeight;
  const scale = Math.min(ww / BASE_W, wh / BASE_H);

  // Set the CSS display size (doesn't change the drawing resolution)
  const cssW = Math.floor(BASE_W * scale);
  const cssH = Math.floor(BASE_H * scale);

  // p5 stores the underlying HTMLCanvasElement at cnv.elt
  cnv.elt.style.width  = cssW + 'px';
  cnv.elt.style.height = cssH + 'px';
}

// --------------------------------------------------
function draw(){  
  const d = pixelDensity();
  if (d === 1){
    drawPixelDensity1(); 
  } else if (d >= 2){
    drawPixelDensity2(); 
  }
  handleSelfPlay(); 
}


function drawPixelDensity1() {
  computeSimulation();
  loadPixels();

  let idxRGBA = 0;
  for (let y = 0; y < rasterH; y++) {
    const ro = y * rasterW;
    for (let x = 0; x < rasterW; x++) {
      const ri = rasterPixels[ro + x];
      pixels[idxRGBA    ] = myPaletteR[ri];
      pixels[idxRGBA + 1] = myPaletteG[ri];
      pixels[idxRGBA + 2] = myPaletteB[ri];
      pixels[idxRGBA + 3] = 255;
      idxRGBA += 4;
    }
  }
  updatePixels();
  drawText();
}


function drawPixelDensity2() {
  computeSimulation();
  loadPixels();

  // Typed u32 view over ImageData buffer
  const u32 = new Uint32Array(pixels.buffer);
  const devW = width << 1;    // width * 2

  for (let y = 0; y < rasterH; y++) {
    const ro   = y * rasterW;
    const dy   = y << 1;      // y*2
    const row0 = dy * devW;   // top device row index (in px)
    const row1 = row0 + devW; // next device row

    for (let x = 0; x < rasterW; x++) {
      const ri = rasterPixels[ro + x];
      const C  = pal32[ri];

      const dx   = x << 1;    // x*2
      const p00  = row0 + dx; // (dx,   dy)
      const p01  = p00 + 1;   // (dx+1, dy)
      const p10  = row1 + dx; // (dx,   dy+1)
      const p11  = p10 + 1;   // (dx+1, dy+1)
      
      u32[p00] = C;
      u32[p01] = C;
      u32[p10] = C;
      u32[p11] = C;
    }
  }
  updatePixels();
  drawText();
}


// --------------------------------------------------
function drawText() {
  const now = millis();
  const elapsed = now - clickedMillis;

  let alp = 0;
  if (!bClicked) {
    alp = 255;
  }
  
  if (bClicked == false) {
    let frac = elapsed / textFadeTime;
    frac = pow(min(1.0, frac), 0.75); 
    alp = frac * 255.0;
  } else if (bClicked && elapsed < textFadeTime) {
    let frac = elapsed / textFadeTime;
    frac = pow(frac, 0.5);
    frac = min(1.0, frac);
    alp = 255.0 * (1.0 - frac);
  }

  if (alp > 0) {
    fill(176, 245, 218, alp);
    textAlign(CENTER, CENTER);
    let advice = "dendron by golan levin (2001, revised 2025)"; 
    advice += "\nclick, drag, wait • space to clear";
    text(advice, width * 0.5, height * 0.4);
  }
}

// --------------------------------------------------
function keyPressed() {
  lastInteractionTime = millis(); 
  bSelfPlaying = false; 
  
  if (key == ' ') {
    // Space bar to clear canvas.
    clearRaster();
    resetParticles();
    bClicked = false;
    clickedMillis = millis(); 
    createCustomPalette(); 
  
  } else if (key === 'S'){
    // Capital-S to save a PNG. 
    let ts = nf(year(),4) + nf(month(),2) + nf(day(),2) + "_";
    ts += nf(hour(),2) + nf(minute(),2) + nf(second(),2);
    save("dendron_" + ts + ".png"); 

  } else if (key === 'f' || key === 'F') {
    // F or f to fullscreen the sketch.
    const fs = fullscreen();
    fullscreen(!fs);
  }
}

function mousePressed() {
  aggregationThreshold = 1;
  createLine(mouseX - 1, mouseY, mouseX, mouseY);
  if (!bClicked) {
    clickedMillis = millis();
  }
  bClicked = true;
  lastInteractionTime = millis(); 
  bSelfPlaying = false; 
}

function mouseDragged() {
  createLine(pmouseX, pmouseY, mouseX, mouseY);
  lastInteractionTime = millis();
  bSelfPlaying = false; 
}

function mouseMoved(){
  lastInteractionTime = millis(); 
  bSelfPlaying = false;
}


// --------------------------------------------------
function handleSelfPlay(){
  let elapsed = millis() - lastInteractionTime;
  if (elapsed > durationBeforeSelfPlay){
    if (!bSelfPlaying){
      initSelfPlay(); 
    }
    bSelfPlaying = true;
    advanceSelfPlay(); 
  } 
}

function initSelfPlay(){
  pselfX = selfX = width/2;
  pselfY = selfY = height/2;
  selfHeading = random(TWO_PI);
  selfPlayMaxLen = width;
  clearRaster();
  resetParticles();
  bClicked = true;
  aggregationThreshold = 1;
  selfPlayLen = 0; 
}

function advanceSelfPlay(){
  noiseDetail(5, 0.65);
  const baseStepSize = height * 0.025;
  const headingBias = 0.6;

  let stepDelta = (noise(millis() / 1000.0 + 10) - 0.5);
  let myStepSize = baseStepSize + stepDelta;
  let dx = selfX - (width / 2);
  let dy = selfY - (height / 2);
  let dh01 = max(0.0001, sqrt(dx * dx + dy * dy) / (height * 0.4));
  
  myStepSize *= 1.0 - 0.9 * dh01;
  selfHeading += radians(20.0 * (noise(millis() / 600.0) - headingBias));
  selfX += myStepSize * cos(selfHeading);
  selfY += myStepSize * sin(selfHeading);
  
  if (selfPlayLen < selfPlayMaxLen){
    createLine(pselfX, pselfY, selfX, selfY);
  }
  if (aggregationThreshold > aggThreshToRenew){
    aggregationThreshold = 1;
    selfPlayLen = 0; 
    
    let bFound = false; 
    let nAttempts = 0; 
    selfX = int(width*random(0.3, 0.7)); 
    selfY = int(height*random(0.3, 0.7));
    selfPlayMaxLen = width * random(0.5, 1.25); 
    
    while (!bFound && nAttempts < 100){
      const loc = selfY * rasterW + selfX;
      if (rasterPixels[loc] == 0){
        bFound = true; 
      } else {
        selfX = int(width*random(0.3, 0.7)); 
        selfY = int(height*random(0.3, 0.7)); 
      }
      nAttempts++;
    }
  }

  selfPlayLen += dist(pselfX, pselfY, selfX, selfY); 
  pselfX = selfX;
  pselfY = selfY;
}


// --------------------------------------------------
// Palette
function createCustomPalette(){
  if (random(1) < 0.333){
    createCustomPalette1(); 
  } else {
    createCustomPalette2(); 
  }
}


function createCustomPalette1() {
  // background and foreground
  const bg = color(53, 29, 13);
  const fg = color("#B0FFD0");

  const r0 = red(bg),
    g0 = green(bg),
    b0 = blue(bg);
  const r1 = red(fg),
    g1 = green(fg),
    b1 = blue(fg);

  for (let i = 0; i < 256; i++) {
    let f = 0.1 + pow(i / 255.0, 0.9);
    if (i === 0) f = 0.0;

    const percent = i / 255.0;
    let rPercent = pow(percent, 0.5) + f;
    let gPercent = pow(percent, 0.4) + f;
    let bPercent = pow(percent, 0.38) + f;
    rPercent = min(1, rPercent);
    gPercent = min(1, gPercent);
    bPercent = min(1, bPercent);

    const r = int(floor(r0 + rPercent * (r1 - r0)));
    const g = int(floor(g0 + gPercent * (g1 - g0)));
    const b = int(floor(b0 + bPercent * (b1 - b0)));
    myPaletteR[i] = r;
    myPaletteG[i] = g;
    myPaletteB[i] = b;
  }
  
  for (let i = 0; i < 256; i++) {
    pal32[i] = (255 << 24) | 
      (myPaletteB[i] << 16) | 
      (myPaletteG[i] << 8) | 
      (myPaletteR[i]);
  }
}


function createCustomPalette2(){
  let which = int(random(8)); 
  let params = [[0.70,0.14],[0.65,0.10],[0.52,0.25],
    [0.88,0.08],[0.45,0.20],[0.75,0.05],[0.92,0.09]];
  
  for (let i=0; i<256; i++) {
    let f = 0.1 + 0.9 * pow(i/255.0, 0.325);
    if (which < 7){
      let pala = params[which][0]; 
      let palb = params[which][1]; 
      f = sigmoid(i/255.0, pala,palb); 
    }
    let col = getQuinticMagmaColorApproximation(f); 
    myPaletteR[i] = int(col[0]); 
    myPaletteG[i] = int(col[1]); 
    myPaletteB[i] = int(col[2]); 
  }
  
  for (let i = 0; i < 256; i++) {
    pal32[i] = (255 << 24) | 
      (myPaletteB[i] << 16) | 
      (myPaletteG[i] << 8) | 
      (myPaletteR[i]);
  }
}


// Sigmoid function with adjustable center (b)
function sigmoid (_x, _a, _b){
  if(!_a) _a = 0.75; // default
  if(!_b) _b = 0.50; // default
  let min_param_a = 0.0 + Number.EPSILON;
  let max_param_a = 1.0 - Number.EPSILON;
  _a = constrain(_a, min_param_a, max_param_a);
  _a = 1-_a;
  
  let _y = 0;
  let w = Math.max(0, Math.min(1, _x-(_b-0.5)));
  if (w<=0.5){
    _y = (Math.pow(2.0*w, 1.0/_a))/2.0;
  } else {
    _y = 1.0 - (Math.pow(2.0*(1.0-w), 1.0/_a))/2.0;
  }
  return(_y);
}


function getQuinticMagmaColorApproximation(x) {
  // Magma palette: Quintic Polynomial Fit
  // The argument x is expected in the range 0...1
  // The output channels are in the range 0...255
  
  let x2 = pow(x,2);
  let x3 = pow(x,3);
  let x4 = pow(x,4);
  let x5 = pow(x,5);
  
  let R = -0.007956784;
  R += 0.8537145 * x;
  R += 1.117858 * x2;
  R += 3.575814 * x3;
  R +=-8.902918 * x4;
  R += 4.348184 * x5;
  
  let G = 0.000479376;
  G += 0.5343249 * x;
  G +=-1.244406 * x2;
  G += 1.699593 * x3;
  G += 1.273513 * x4;
  G +=-1.262283 * x5;
  
  let B = 0.007555538;
  B += 2.0451040 * x;
  B += 3.925836 * x2;
  B +=-26.21259 * x3;
  B += 34.35849 * x4;
  B +=-13.37318 * x5; 

  let r = round(255.0*constrain(R,0,1)); 
  let g = round(255.0*constrain(G,0,1)); 
  let b = round(255.0*constrain(B,0,1)); 
  return [r,g,b];
}


// --------------------------------------------------
// Reset helpers
function clearRaster() {
  rasterPixels.fill(0);
}

function resetParticles() {
  for (let i = 0; i < numberOfParticles; i++) {
    particleArray[i].reset();
    particleArray[i].reset2();
  }
}


// --------------------------------------------------
// Initialization
function initializeSimulation() {
  numberOfParticles = floor(numberOfRasterPixels * particlesPerPixel);
  particleArray = new Array(numberOfParticles);
  for (let i = 0; i < numberOfParticles; i++) {
    particleArray[i] = new Particle();
  }
}


// --------------------------------------------------
// Core simulation step
function computeSimulation() {
  // diffusion-limited aggregation step
  
  const minX = 1;
  const minY = 1;
  const maxX = rasterW - 2;
  const maxY = rasterH - 2;
  
  let count = 0;
  for (let i = 0; i < numberOfParticles; i++) {
    const P = particleArray[i];
    P.update();

    const x = floor(P.px);
    const y = floor(P.py);

    if (x > minX && x < maxX && y > minY && y < maxY) {
      const loc = y * rasterW + x;
      let locc = loc - 1;
      let locn = locc - rasterW;
      let locs = locc + rasterW;

      const sum =
        rasterPixels[locn++] +
        rasterPixels[locn++] +
        rasterPixels[locn  ] +
        rasterPixels[locc++] +
        rasterPixels[locc++] +
        rasterPixels[locc  ] +
        rasterPixels[locs++] +
        rasterPixels[locs++] +
        rasterPixels[locs  ];

      if (sum >= aggregationThreshold) {
        const cur = rasterPixels[loc];
        const dur = cur + ACCRETE_BYTE;
        rasterPixels[loc] = dur > 255 ? 255 : dur;

        count++;
        if (count % blurFrequency === 0) {
          if (random(1) < 0.5) {
            blurNeighborhood(locs);
          } else {
            if (random(1) < 0.5){
              blurNeighborhood(loc + 1);
            }
          }
          blurNeighborhood(loc);
        } else {
          blur2(loc);
        }
        
        P.reset();
      }
    }
  }

  let occupancy = count / numberOfParticles;
  let aggDelta = baseAggThresholdDelta + pow(occupancy, 0.5);
  aggregationThreshold += aggDelta;
  if (occupancy > clearRasterThreshold) {
    clearRaster();
    resetParticles();
    bClicked = false;
    if (bSelfPlaying){
      bClicked = true;
      initSelfPlay(); 
    }
    clickedMillis = millis();
    createCustomPalette(); 
  }
}


// --------------------------------------------------
// rasterPixels: Uint8Array, values 0..255
function blur2(locC) {
  if ((locC >= (rasterW + 1)) && 
      (locC < (numberOfRasterPixels - rasterW - 1))) {
    
    const rp = rasterPixels;
    const c  = locC;
    const n  = c - rasterW;   // north row index (center)
    const s  = c + rasterW;   // south row index

    // 9 taps
    const v1 = rp[n - 1], v2 = rp[n], v3 = rp[n + 1];
    const v4 = rp[c - 1], v5 = rp[c], v6 = rp[c + 1];
    const v7 = rp[s - 1], v8 = rp[s], v9 = rp[s + 1];

    // (1 2 1; 2 4 2; 1 2 1) / 16
    const sum = (
        (v2 + v4 + v6 + v8) << 1) +      // the four "2×" taps
        (v1 + v3 + v7 + v9) +            // the four "1×" taps
        (v5 << 2);                       // center "4×"
    rp[c] = sum >> 4;                    // divide by 16
  }
}


function blurNeighborhood(locC) {
  // Blur the 3x3 neighborhood centered at locC
  // (Intentionally light on bounds checks like the original.)
  const locN = locC - rasterW;
  const locS = locC + rasterW;

  // corners first
  blur2(locN - 1);
  blur2(locN + 1);
  blur2(locS - 1);
  blur2(locS + 1);

  // edges
  blur2(locN);
  blur2(locS);
  blur2(locC - 1);
  blur2(locC + 1);

  // center
  blur2(locC);
}


// --------------------------------------------------
// Drawing into the raster
function createLine(x0, y0, x1, y1) {
  x0 = constrain(x0, 0, rasterW - 1);
  y0 = constrain(y0, 0, rasterH - 1);
  x1 = constrain(x1, 0, rasterW - 1);
  y1 = constrain(y1, 0, rasterH - 1);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const dh = sqrt(dx * dx + dy * dy);

  for (let i = 0; i < dh; i++) {
    const percent = i / dh;
    const x = floor(x0 + percent * dx);
    const y = floor(y0 + percent * dy);

    const xm = x % rasterW;
    const ym = y % rasterH;
    const index = ym * rasterW + xm;
    rasterPixels[index] = (rasterPixels[index] + DRAW_BYTE);
  }
}


// --------------------------------------------------
// Particle class
class Particle {
  constructor() {
    this.A = 0.9;
    this.B = 1.0 - this.A;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.dx = 0;
    this.dy = 0;
    this.used = 0;
    this.active = true;
    this.reset();
    this.reset2();
  }
  reset() {
    this.px = random() * rasterW;
    this.py = random() * rasterH;
    this.vx = 0;
    this.vy = 0;
  }
  reset2() {
    this.active = true;
    this.used = 0;
  }
  update() {
    // integrate position
    this.px += this.vx;
    this.py += this.vy;

    // wrap around edges
    if (this.px > rasterW) {
      this.px -= rasterW;
    } else if (this.px < 0) {
      this.px += rasterW;
    }
    if (this.py > rasterH) {
      this.py -= rasterH;
    } else if (this.py < 0) {
      this.py += rasterH;
    }

    // random deflection; smoothed drunk walk
    this.dx = (random() - 0.5) * maxParticleVelocity;
    this.dy = (random() - 0.5) * maxParticleVelocity;
    this.vx = this.A * this.vx + this.B * this.dx;
    this.vy = this.A * this.vy + this.B * this.dy;
  }
}