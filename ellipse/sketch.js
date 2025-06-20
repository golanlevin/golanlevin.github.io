// ZEN'S SUPER-ELLIPSE GENERATOR v.2025.06.17
// Generates ellipses, superellipses, and rectangles.
// Press "Download PNG" or the 's' key to export an image.
// Math at: https://en.wikipedia.org/wiki/Superellipse
//
// By Golan Levin; CC0: No Rights Reserved. 
// Version: 17 June 2025 • For Z.L.
// Uses: p5.js v.1.11.8 and p5.plotsvg v.0.1.4

p5.disableFriendlyErrors = true; 

let sliderAspect;
let sliderExponent; 
let sliderDivider;
let buttonPng; 
let buttonSvg;
let checkboxAxes;
let checkboxSnap;
let checkboxCirc;
let checkboxRect;
let jobInput; 
let isHovered = false;
let bDoExportSvg = false; 
let svgFilename = "ellipse.svg";

let bShowAxes = true;
let bEnableSnap = true; 
let bCircAxes = false;
let bShowRect = false;
let offscreen; 

let aspectRatio; 
let exponent;

const aspMin = 1.0; 
const aspMax = 2.5; 
const nonlin = 3.0/2.0; 
const margin = 20; 
const nPoints = 360;
const uiy = 58;

let eccs = [];  
const vals = [1.0, 1.03279556, 1.0606602, 1.15470054, 1.20, 
              1.25, 1.27201965, 4.0/3.0, 1.4142136, 1.5, 
              1.618034, 1.732051, 2.0, 2.25, 2.5];
// We could add the Tribonnaci constant, 1.839286755214161 (OEIS A058265).
const rats = ["(1:1)", "(4/√15)", "(3:2√2)", "(2:√3)", "(6:5)", 
              "(5:4)", "(√ϕ)", "(4:3)", "(√2)", "(3:2)", 
              "(ϕ)", "(√3)", "(2:1)", "(9:4)", "(5:2)"];

//=============================================
function setup() {
  createCanvas(375, 500);
  offscreen = createGraphics(width-2*margin,width-2*margin);
  offscreen.pixelDensity(4); 
  
  let initVal = pow(map(1.5,aspMin,aspMax, 0,1),1.0/nonlin);
  sliderAspect = createSlider(0,1, initVal, 0.001);
  sliderAspect.style('width', '340px');
  sliderAspect.position(15,uiy+2);
  
  sliderExponent = createSlider(0,1, 0, 0.001);
  sliderExponent.style('width', '175px');
  sliderExponent.position(15,uiy+22);
  
  sliderDivider = createSlider(3,9, 4, 1);
  sliderDivider.style('width', '96px');
  sliderDivider.position(224,uiy+49);
  
  checkboxAxes = createCheckbox("", bShowAxes);
  checkboxAxes.position(134,uiy+49);
  
  checkboxSnap = createCheckbox("", bEnableSnap);
  checkboxSnap.position(339,uiy+22);
  
  checkboxCirc = createCheckbox("", bCircAxes);
  checkboxCirc.position(339,uiy+70);
  
  checkboxRect = createCheckbox("", bShowRect);
  checkboxRect.position(300,uiy+70);
  
  buttonPng = createButton('⬇png');
  buttonPng.position(18, uiy+48);
  buttonPng.mousePressed(savePngOutput);
  buttonPng.mouseOver(() => isHovered = true);
  buttonPng.mouseOut(() => isHovered = false);
  
  buttonSvg = createButton('⬇svg'); 
  buttonSvg.position(18+60, uiy+48);
  buttonSvg.mousePressed(saveSvgOutput);
  buttonSvg.mouseOver(() => isHovered = true);
  buttonSvg.mouseOut(() => isHovered = false);
  
  jobInput = createInput('');
  jobInput.position(239, 43);
  jobInput.size(110, 12);
  jobInput.attribute('maxlength', '12'); // Limit to 10 characters
  jobInput.style('font-size', '10px'); 
  jobInput.input(() => {
    let val = jobInput.value();
    jobInput.value(val.replace(/ /g, '_'));
  });

  
  for (let i=0; i<vals.length; i++){
    eccs[i] = sqrt(1.0 - sq(1.0/vals[i])); 
  }
}

//=============================================
function draw() {
  background(245);
  
  // Compute aspect ratio from nonlinearized slider,
  // and gently quantize slider to important values
  aspectRatio = map(pow(sliderAspect.value(),nonlin),
                    0,1,aspMin,aspMax);
  let snapThresh = map(aspectRatio,aspMin,aspMax, 0.01,0.03); 
  let whichRatio = -1; 
  bEnableSnap = checkboxSnap.checked(); 
  if (bEnableSnap){
    for (let i=0; i<vals.length; i++){
      if (abs(aspectRatio - vals[i]) <= snapThresh){
        let inverseVal = pow(map(vals[i],aspMin,aspMax,0,1),
                             1/nonlin);
        sliderAspect.value(inverseVal);
        aspectRatio = vals[i];
        whichRatio = i; 
      }
    }
  }
  
  // Compute exponent from nonlinearized slider
  exponent = 2.0/map(sliderExponent.value(),0,1,1,0.002);
  
  let oh = offscreen.height;
  let eh = offscreen.width - 1.0; // -1 to inset stroke
  let ew = eh/aspectRatio;
  let ey = offscreen.height/2;
  let ex = offscreen.width/2; 
  
  offscreen.clear();
  offscreen.push(); 
  offscreen.translate(ex,ey); 
  generateSuperEllipse(ew,eh, offscreen);
  offscreen.pop();
  
  if (bDoExportSvg){
    beginRecordSVG(this, svgFilename);
    push(); 
    // translate(ex,ey); 
    translate(ew/2,ey); 
    generateSuperEllipse(ew,eh, this);
    pop();
    endRecordSVG();
    bDoExportSvg = false;
  }
  
  drawShape(ew,eh); 
  image(offscreen, margin,height-oh-margin); 
  
  
  let a = eh;
  let b = ew; 
  let k = sqrt(1.0 - sq(b/a)); // Eccentricity
  let e2 = sqrt(a*a - b*b)/b; // Second Eccentricity, e'
  let f = (a-b)/a; // Flattening
  
  fill(0); 
  noStroke(); 
  let ratStr = nf(aspectRatio, 1,3);
  ratStr += ((whichRatio >= 0) ? (" " + rats[whichRatio]): "");
  let expStr = (exponent > 500) ? "∞" : nf(exponent,1,2);
  textSize(14); 
  textStyle(BOLD); 
  text("ZEN'S SUPER-ELLIPSE GENERATOR • v.2025.06", 19, 30); 
  textSize(12); 
  textStyle(NORMAL); 
  text("Aspect: " + ratStr + ";  𝑒 : " + nf(k,1,3), 19,uiy); 
  text("Job: ", 213,uiy); 
  text("Snap", 310,uiy+36); 
  text("Exponent: " + expStr, 200,uiy+36); 
  text("Draw Axes", 156,uiy+63); 
  text("Div/" + int(sliderDivider.value()), 329,uiy+63); 
  text("⌖", 328, uiy+82);
  text("▯", 296, uiy+83);
}


//=============================================
function drawShape(ew,eh){
  // Purely visual, just makes a nice white background oval
  push(); 
  let ey = margin + height-width + offscreen.height/2;
  translate(width/2,ey); 
  fill(255); 
  noStroke(); 
  if (exponent < 2.001){
    ellipseMode(CENTER);
    ellipse(0,0, ew,eh); 
  } else if (exponent > 500){
    rectMode(CENTER);
    rect(0,0, ew,eh); 
  } else {
    beginShape();
    for (let i=0; i<nPoints; i++){
      let t = map(i, 0,nPoints, 0, TWO_PI); 
      let c = pow(abs(cos(t)), exponent);
      let s = pow(abs(sin(t)), exponent);
      let r = pow(c+s, -1.0/exponent);
      px = ew/2 * r * cos(t); 
      py = eh/2 * r * sin(t); 
      vertex(px,py); 
    }
    endShape(CLOSE); 
  }
  pop(); 
}

//=============================================
function generateSuperEllipse(ew,eh, gfx){
  gfx.noFill();  
  gfx.stroke(0);
  let jobStr = jobInput.value();
  
  if (checkboxRect.checked() && (exponent < 500)){
    gfx.strokeWeight(0.25); 
    gfx.rectMode(CENTER);
    gfx.rect(0,0, ew,eh);
  }
  
  gfx.strokeWeight(1.0); 
  if (exponent < 2.001){
    gfx.ellipseMode(CENTER);
    gfx.ellipse(0,0, ew,eh); 
  } else if (exponent > 500){
    gfx.rectMode(CENTER);
    gfx.rect(0,0, ew,eh); 
  } else {
    gfx.beginShape();
    for (let i=0; i<nPoints; i++){
      let t = map(i, 0,nPoints, 0, TWO_PI); 
      let c = pow(abs(cos(t)), exponent);
      let s = pow(abs(sin(t)), exponent);
      let r = pow(c+s, -1.0/exponent);
      px = ew/2 * r * cos(t); 
      py = eh/2 * r * sin(t); 
      gfx.vertex(px,py); 
    }
    gfx.endShape(CLOSE); 
  }
  
  if (checkboxAxes.checked()){
    gfx.strokeWeight(0.25); 

    // X and Y axes
    gfx.strokeWeight(0.5); 
    gfx.line(-ew/2, 0, ew/2, 0); 
    gfx.line(0,-10, 0,eh/2);
    if (jobStr.length == 0){
      gfx.line(0,-eh/2, 0,0);
    } else {
      gfx.line(0,-eh/2, 0,-28);
    }
    
    
    // Ellipse foci
    let fy = sqrt(sq(eh/2) - sq(ew/2));
    gfx.circle(0,-fy, 7); 
    gfx.circle(0,fy, 7); 
    
    // Concentrics
    let divi = int(sliderDivider.value());
    if (checkboxCirc.checked()){
      for (let i=divi%2; i<divi; i+=2){
        gfx.circle(0,0, ew*(i/divi)); 
      }
      if (aspectRatio >=1.25){
        gfx.circle(0,0, ew); 
      }
    } else {
      for (let j=divi%2; j<divi; j+=2){
        gfx.beginShape();
        for (let i=0; i<nPoints; i++){
          let t = map(i, 0,nPoints, 0, TWO_PI); 
          let c = pow(abs(cos(t)), exponent);
          let s = pow(abs(sin(t)), exponent);
          let r = pow(c+s, -1.0/exponent);
          px = ew*(j/divi)/2 * r * cos(t); 
          py = eh*(j/divi)/2 * r * sin(t); 
          gfx.vertex(px,py); 
        }
        gfx.endShape(CLOSE); 
      }
    }

    // Snap ticks
    if (!isHovered){
      let k=3;
      gfx.strokeWeight(0.25); 
      for (let i=0; i< eccs.length; i++){
        let e = eccs[i];
        gfx.line(-k,e*eh/2,k,e*eh/2); 
        gfx.line(-k,-e*eh/2,k,-e*eh/2); 
      }
    }
    
  }
  
  if (jobStr.length > 0){
    gfx.noStroke(); 
    gfx.fill(0); 
    gfx.textAlign(CENTER); 
    gfx.text(jobStr, 0,0-textDescent()-textAscent()); 
    gfx.textAlign(LEFT); 
  }
}

//=============================================
/*
function keyPressed(){
  if ((key=='S') || (key=='s')){
    // image PNG
    // savePngOutput(); 
  }
  if ((key=='V') || (key=='v')){
    // vector SVG
    // bDoExportSvg = true; 
  }
}
*/


//=============================================
function savePngOutput(){
  let str = "ellipse_";
  str += year() + nf(month(),2) + nf(day(),2);
  str += nf(hour(),2) + nf(minute(),2);
  str += "_ratio" + nf(aspectRatio,1,3);
  if (exponent > 2.0){
    str += "_pow" + nf(exponent,1,2);
  }
  let jobStr = jobInput.value();
  if (jobStr.length > 0){
    str += "_"  + jobStr;
  }
  str += ".png";
  
  let oh = offscreen.height;
  let ow = int(round(offscreen.height / aspectRatio));
  let dx = 0-(offscreen.width - ow)/2;
  let output = createGraphics(ow,oh);
  output.pixelDensity(4);
  output.clear();
  output.image(offscreen,dx,0);
  output.save(str);
}

//=============================================
function saveSvgOutput(){
  svgFilename = "ellipse_";
  svgFilename += year() + nf(month(),2) + nf(day(),2);
  svgFilename += nf(hour(),2) + nf(minute(),2);
  svgFilename += "_ratio" + nf(aspectRatio,1,3);
  if (exponent > 2.0){
    svgFilename += "_pow" + nf(exponent,1,2);
  }
  let jobStr = jobInput.value();
  if (jobStr.length > 0){
    svgFilename += "_"  + jobStr;
  }
  svgFilename += ".svg";
  bDoExportSvg = true;
}