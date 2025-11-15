// Directrix (1998) by Golan Levin — p5.js v.1.11 port (2025)
// https://objkt.com/collections/objkt-gen-art/projects/directrix-31560116/drop
// https://www.art-magazine.ai/artist-directory/feature/golan-levin---touching-grass

/*
"Directrix" (1998, 2025) is a long-form generative artwork and interactive 
drawing environment, in which animated "pseudo-parabolas" are created 
autonomously or in collaboration with a participant. These complex curves are 
the result of an interplay between a set of dynamic and static gestures. 
Depending on how they are structured and layered, the results can vary from 
sparse and delicate constructions of gently curved lines, to violently 
twitching, thatchy masses.

Directrix creates images from a generalized model of parabolas — the set of 
points which are equidistant from a special point called the focus, and an 
(ordinarily) straight line called the directrix. This interactive environment 
was designed to explore the implications of two premises: firstly, that the 
shape of a parabola's directrix could be a drawn or generated curve, and 
secondly, that its focus could be a moving point, animated along the trace of 
a viewer's recorded gesture. Directrix is interesting, in my opinion, because 
of the interplay it establishes between a strictly spatial specification (the 
directrix) and a spatio-temporal one (the path of the focus). 

A discussion of Directrix appears in section 3.1.4 (pages 69-71) of my masters 
thesis, "Painterly Interfaces for Audiovisual Performance" (2000), produced in 
the Aesthetics and Computation Group at the MIT Media Laboratory. The original 
project was developed in C++; this port to p5.js is the first time the project 
has been made available to the public, and includes expanded features for 
autonomous play and generative variation. 
  
There are five possible drawing targets: the white directrix line, and the 
focal paths of four different pseudo-parabolas. You can select the drawing 
target by pressing keys 1-5, or you may cycle through them by clicking the 
right mouse button.
  
Key commands:
• H - display Help.
• P - export a PNG screenshot.
• N - generate a Novel variation.
• R/Return/Space/Escape - Restore to original.
• 1,2,3,4 - select Parabola # for editing.
• 5/D - select Directrix for editing.
*/

document.oncontextmenu = () => false;
const LIMIT = 16000;
const DIREX = 4;
const NPARABS = 4;
const LONELYTIME = 30000;

let myCanvas;
let theRseed = null; 
let gParabs = new Array(4);
let gSelTime = -10.0;
let gCurrentSelection = DIREX;
let MX = 0;
let MY = 0;
let lastMouseTime = -10000;
let touchedParabFoci = false;
const mouseRadius = 28;
let colorHarmonyName = "Random"; 

//-----------------
// Tracer/Directrix data
let tracerFoci = [];
let userDirectrixPoints = [];
let myTracer;
let myFrameCount = 0;
let myParabFrame = 0;
let myFrameCountWhenClick = 0;
let bDoUserDirectrix = false;
let bNeedsCapture = true; 
let bShowHelp = true; 
let showHelpFrame = 0; 

//==================================================
// Properties to Randomize
let props;
class PropertySheet {
  constructor(rseed) {
    const nupf = 2; 
    this.tracerDamping = constrain(myRandomGaussian(0.98, 0.007), 0.95, 0.999);
    this.noisiness = constrain(myRandomGaussian(0.7, 0.1), 0.5, 1.5);
    this.cycleLen =floor(constrain(myRandomGaussian(2000,250),1400,2500)/nupf)*nupf;
    this.cyclePow = constrain(myRandomGaussian(3.0, 0.15), 2.0, 4.0);
    this.parabAlphaCenter = constrain(myRandomGaussian(110, 6), 96, 128);
    this.sigmoPow = constrain(myRandomGaussian(0.75, 0.025), 0.5, 0.9);
    this.FA = constrain(myRandomGaussian(2.0, 0.33), 1.0, 4.0);
    this.FB = constrain(myRandomGaussian(7.0, 0.66), 5.0, 9.0);
    this.bDrawParabsContinuously = myRandom(1) < 0.8;
    this.wiggleSpeed = 8000;
    this.nUpdatesPerFrame = nupf;

    this.maxWeight = myRandomFromArray([1.5, 1.5, 1.5, 1.75]);
    this.minWeight = myRandomFromArray([0.5, 0.5, 0.5, 0.5, 0.4, 0.666]);
    this.maxAlpha = 180;
    this.minAlpha = 80;

    this.wiggleAmount = 40.0;
    this.wiggleScale = 200.0;
    this.focusMovement = 10;

    const vbg = color(10, 0, 6);
    const obg = color(8, 4, 0);
    const gbg = color(0, 8, 4);
    const bbg = color(6, 0, 10);
    this.bgColor = myRandomFromArray([vbg, obg, obg, gbg, bbg, bbg, bbg]);
    this.bgFade = myRandom(1) < 0.999;
    this.bHifi = myRandom(1) < 0.95;
  }
}

function colorName(c) {
  const col = [red(c), green(c), blue(c)];
  if (col[0] > col[2] && col[2] > col[1]) return "Reddish";
  if (col[0] > col[1] && col[1] > col[2]) return "Brownish";
  if (col[1] > col[2] && col[2] > col[0]) return "Greenish";
  if (col[2] > col[0] && col[0] > col[1]) return "Bluish";
  return "Dark";
}

//-----------------------------
function initializeArtwork(rseed) {
  theRseed = rseed;
  myRandomSeed(rseed);
  myNoiseSeed();

  myFrameCount = 0;
  myParabFrame = 0;
  touchedParabFoci = false;
  gCurrentSelection = DIREX;

  props = new PropertySheet(rseed);
  randomizeTracerFoci();
  let c = getTracerFociCentroid();
  myTracer = new Tracer(c.x, c.y);

  randomizeParabolas();
  randomizeColors();
  for (let i = 0; i < NPARABS; i++) {
    gParabs[i].makeMintPath();
  }
  
  if ((theRseed == $o.seed) || (theRseed === null)) {
    // console.log("Directrix mint seed:", $o.seed);
    let bgColName = colorName(props.bgColor);
    let pcl = props.cycleLen; 
    
    $o.registerFeatures({
      "Background": bgColName,
      "Color Harmony": colorHarmonyName, 
      "Directrix Clusters": tracerFoci.length,
      "Directrix Length": (pcl < 1800) ? "Short":(pcl > 2200) ? "Long":"Medium",
      "Directrix Damping": props.tracerDamping.toFixed(2),
      "Continuous": props.bDrawParabsContinuously ? "Yes" : "No",
      "Bloom": props.bHifi ? "True" : "False",
    });
  }
}


//==========================
function setup() {
  myCanvas = createCanvas(window.innerWidth, window.innerHeight);
  pixelDensity(2);
  frameRate(60);
  noCursor();

  MX = width / 2;
  MY = height / 2;

  userDirectrixPoints = [];
  initializeArtwork($o.seed);
  selectParab(DIREX);
  
  $o.isCapture = true;
  if ($o.isCapture) {
    const c = myCanvas?.canvas || myCanvas?.elt || document.querySelector("canvas");
    if (!c) {
      console.warn("Canvas not found yet — deferring exporter registration");
      setTimeout(setupExporter, 500);
    } else {
      setupExporter();
    }
  }
  
  // prevent iOS/Android drag-to-scroll when touching canvas
  myCanvas.elt.addEventListener('touchstart', (e) => e.preventDefault());
  myCanvas.elt.addEventListener('touchmove', (e) => e.preventDefault());
  myCanvas.elt.addEventListener('touchend', (e) => e.preventDefault());
}


function setupExporter() {
  const c = myCanvas?.canvas || 
        myCanvas?.elt || 
        document.querySelector("canvas");
  if (!c) throw new Error("Canvas not found for export");
  function pngExport() {
    return c.toDataURL("image/png");
  }
  $o.registerExport(
    { mime: "image/png", resolution: { x: 1280, y: 720 }, default: true },
    pngExport
  );
}


function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
}

function drawSmall(){
  background("green"); 
  strokeWeight(10); 
  stroke(255); 
  line(0,0, width,height);
  
  // Capture a preview exactly once
  myFrameCount++;
  if (bNeedsCapture && (myFrameCount >= 240)) {
    $o.capture();
    bNeedsCapture = false;
  }
}


function draw() {
  manageCursor();

  // manage background
  if (props.bgFade) {
    blendMode(BLEND);
    let bk = color(0, 0, 0);
    let t = myFrameCount / props.cycleLen;
    let fadeCol = lerpColor(bk, props.bgColor, t);
    background(red(fadeCol), green(fadeCol), blue(fadeCol), 236);
  } else {
    clear();
    blendMode(ADD);
    background(props.bgColor);
  }

  // smooth mouse data
  let mA = 0.625;
  if (gCurrentSelection >= 0 && gCurrentSelection <= 3) {
    mA = 0.875;
  }
  const mB = 1.0 - mA;
  MX = mA * MX + mB * mouseX;
  MY = mA * MY + mB * mouseY;

  // Update and draw the Directrix/Tracer
  if (bDoUserDirectrix) {
    drawUserDirectrix();
    myFrameCount++;
  } else {
    for (let i = 0; i < props.nUpdatesPerFrame; i++) {
      updateDirectrix();
      myFrameCountWhenClick = myFrameCount++;
    }
    drawAutoDirectrix();
  }

  updateParabolas();
  blendMode(ADD);
  renderAllParabolas();

  // In Hifi mode, add the blurred canvas
  if (props.bHifi) {
    let snap = get();
    snap.resize(64, 36);
    snap.filter(BLUR, 4);
    blendMode(ADD);
    image(snap, 0, 0, width, height);
  }

  // Capture a thumbnail exactly once, at the canonical frame
  if (bNeedsCapture && (myFrameCount >= props.cycleLen)) {
    console.log("Initiated capture at frame: ", myFrameCount); 
    const c = myCanvas?.canvas || 
          myCanvas?.elt || 
          document.querySelector("canvas");
    $o.capture();
    bNeedsCapture = false;
  }
  
  if (bShowHelp){
    const helpDur = 500; // frames
    let helpElapsed = (myFrameCount-showHelpFrame);
    if (helpElapsed <= helpDur){
      let t = pow(map(helpElapsed,0,helpDur, 1,0),1.6)*200;
      let ty = 20;
      let tx = 14;
      let col = gParabs[3]._color;
      fill(red(col),green(col),blue(col), t); 
      textSize(10); 
      textFont("Helvetica"); 
      textStyle(ITALIC); 
      text("Directrix", tx,ty); 
      textStyle(NORMAL); 
      text("(1998, 2025) by Golan Levin", tx+40,ty);
      text("1-5 – select draw target",tx,ty+=15); 
      text("N – new variation", tx,ty+=15); 
      text("R – restore original", tx,ty+=15);
      text("H – show help", tx,ty+=15);
    } else {
      bShowHelp = false;
    }
  }
}


//============================================
function pngExport({ resolution: { x, y } }) {
  // synchronous, non-Promise; works with Objkt’s capture sandbox
  const c = myCanvas?.canvas || myCanvas?.elt || document.querySelector("canvas");
  if (!c){
    console.log("Canvas not found for PNG export!");
  }
  return c.toDataURL("image/png");
}

//------------------------------
function randomizeParabolas() {
  gParabs = [];
  for (let i = 0; i < NPARABS; i++) {
    let rx = myRandom(0.1,0.9) * width;
    let ry = myRandom(0.1,0.9) * height;
    gParabs[i] = new PseudoParab(i, myTracer.directrix);
    gParabs[i].makeLissPath(rx, ry);
  }
}

//------------------------------
function randomizeTracerFoci() {
  tracerFoci = [];
  let nPts = round(myRandom(3.0, 5.0));
  nPts = constrain(nPts, 3, 5);
  for (let i = 0; i < nPts; i++) {
    let px = myRandom(0.1,0.9) * width;
    let py = myRandom(0.1,0.9) * height;
    tracerFoci.push(createVector(px, py));
  }
}

//------------------------------
function getTracerFociCentroid() {
  let mx = 0;
  let my = 0;
  const nPts = tracerFoci.length;
  for (let i = 0; i < nPts; i++) {
    mx += tracerFoci[i].x;
    my += tracerFoci[i].y;
  }
  return createVector(mx/nPts, my/nPts);
}

//------------------------------
function doubleExponentialSigmoid(x, a) {
  const epsilon = 0.00001;
  const min_param_a = 0.0 + epsilon;
  const max_param_a = 1.0 - epsilon;
  a = 1.0 - min(max_param_a, max(min_param_a, a));
  let y = 0;
  if (x <= 0.5) {
    y = pow(2.0 * x, 1.0 / a) / 2.0;
  } else {
    y = 1.0 - pow(2.0 * (1.0 - x), 1.0 / a) / 2.0;
  }
  return y;
}

//------------------------------
function turnAngle(qx, qy, rx, ry, sx, sy) {
  const v1x = qx - rx;
  const v1y = qy - ry;
  const v2x = sx - rx;
  const v2y = sy - ry;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  return Math.atan2(cross, dot);
}

function drawUserDirectrix() {
  // Draw user directrix (polyline)
  if (userDirectrixPoints.length > 1) {
    // Determine if selection indicator is on
    const now = millis() / 1000.0;
    const selDirectrix = gCurrentSelection === DIREX && now - gSelTime < 1.0;
    const dth = 1 - min(now - gSelTime, 1);
    const sw = 0.75 + 2.0 * (selDirectrix ? dth : 0);

    blendMode(HARD_LIGHT);
    stroke(255, 255, 255, 102);
    strokeWeight(sw);
    strokeCap(SQUARE);
    noFill();

    beginShape();
    vertex(userDirectrixPoints[0].x, userDirectrixPoints[0].y);
    for (let i = 0; i < userDirectrixPoints.length; i++) {
      const p = userDirectrixPoints[i];
      curveVertex(p.x, p.y);
    }
    endShape();
  }
}

//------------------------------------------
function updateDirectrix() {
  myTracer.update();
}

function drawAutoDirectrix() {
  if (props.bHifi) {
    myTracer.display();
  } else {
    myTracer.displaySimple();
  }
}

function updateParabolas() {
  myParabFrame++;
  for (let i = 0; i < NPARABS; i++) {
    let focusPt = null;
    if (i === gCurrentSelection && mouseIsPressed && mouseButton === LEFT) {
      focusPt = createVector(MX, MY);
    }
    gParabs[i].computeCache(myParabFrame, focusPt);
  }
}

function renderAllParabolas() {
  for (let i = 0; i < NPARABS; i++) {
    gParabs[i].renderWithClipping(i); 
  }
}

//------------------------------------------
function manageCursor() {
  let now = millis();
  let elapsed = now - lastMouseTime;
  if (elapsed < 5000) {
    cursor();
  } else {
    noCursor();
  }
  
  if (mouseIsPressed){
    bShowHelp = false;
  }

  if (elapsed > LONELYTIME) {
    if (touchedParabFoci) {
      for (let i = 0; i < NPARABS; i++) {
        gParabs[i].restoreFromMintPath();
      }
    }
    if (bDoUserDirectrix) {
      bDoUserDirectrix = false;
      initializeArtwork($o.seed);
    }
  }
}

function mouseMoved() {
    lastMouseTime = millis();
}

function mouseReleased() {
    lastMouseTime = millis();
    if (bDoUserDirectrix) {
      if (gCurrentSelection === DIREX) {
        if (userDirectrixPoints.length < 5) {
          bDoUserDirectrix = false;
          myFrameCount = myFrameCountWhenClick;

          for (let i = 0; i < NPARABS; i++) {
            gParabs[i].restoreFromMintPath();
          }
        }
      }
    }
}

function mousePressed() {
  bShowHelp = false;
    lastMouseTime = millis();
    if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
      if (!bDoUserDirectrix) {
        myFrameCountWhenClick = myFrameCount;
      }
      MX = mouseX;
      MY = mouseY;
      if (mouseButton === RIGHT) {
        gCurrentSelection = (gCurrentSelection + 1) % 5;
        selectParab(gCurrentSelection);
      } else {
        // Find out which parab focus we clicked on, if any
        let whichClicked = -1;
        for (let i = 0; i < 4; i++) {
          let dx = MX - gParabs[i].focusPOINT.x;
          let dy = MY - gParabs[i].focusPOINT.y;
          let dh = sqrt(dx * dx + dy * dy);
          if (dh < mouseRadius) {
            whichClicked = i;
            break;
          }
        }

        // If we indeed clicked on a focus, select that parab
        if (whichClicked >= 0) {
          selectParab(whichClicked);
          gCurrentSelection = whichClicked;
        }

        // if a parabola was just (or is already) selected, add an initial point
        if (gCurrentSelection >= 0 && gCurrentSelection <= 3) {
          gParabs[gCurrentSelection].clearFociPoints();
          gParabs[gCurrentSelection].addFocusPoint(createVector(MX, MY));
          touchedParabFoci = true;
        } else {
          // Otherwise, no parab focus was clicked,
          // no parab was already selected, so add to the directrix
          bDoUserDirectrix = true;
          gCurrentSelection = DIREX;
          myFrameCount = 0;
          userDirectrixPoints.length = 0;
          userDirectrixPoints.push(createVector(MX, MY));
        }
      }
    }
}

function mouseDragged() {
    lastMouseTime = millis();
    const mousePos = createVector(MX, MY);
    if (gCurrentSelection === DIREX) {
      userDirectrixPoints.push(mousePos);
    } else if (gCurrentSelection >= 0 && gCurrentSelection <= 3) {
      let bAddInterpolatedPoint = !true;
      if (bAddInterpolatedPoint) {
        let nPts = gParabs[gCurrentSelection].fociPathPts.length;
        if (nPts > 0) {
          let lastPt = gParabs[gCurrentSelection].fociPathPts[nPts - 1];
          let ix = lerp(lastPt.x, MX, 0.5);
          let iy = lerp(lastPt.y, MY, 0.5);
          gParabs[gCurrentSelection].addFocusPoint(createVector(ix, iy));
        }
      }
      gParabs[gCurrentSelection].addFocusPoint(createVector(MX, MY));
    }
}


// Touch event equivalents for mobile
function touchStarted() {
  // Map to mousePressed
  mousePressed();
  return false; // Prevent browser scrolling
}

function touchMoved() {
  // Map to mouseDragged
  mouseDragged();
  return false;
}

function touchEnded() {
  // Map to mouseReleased
  mouseReleased();
  return false;
}


//-----------------------------------------------
function keyPressed() {
  bShowHelp = false;
    const ch = key;
    switch (key) {
      case "p":
      case "P":
        saveScreenshotPNG();
        break;
      case "1":
        selectParab(0);
        break;
      case "2":
        selectParab(1);
        break;
      case "3":
        selectParab(2);
        break;
      case "4":
        selectParab(3);
        break;
      case "5":
      case "0":
      case "d":
      case "D":
        selectParab(DIREX);
        break;

      case "Q":
        // toggle Quality
        props.bHifi = !props.bHifi;
        break;
      case "h":
      case "H": 
        bShowHelp = true;
        showHelpFrame = myFrameCount; 
        print("Directrix (1998,2025) by Golan Levin");
        print("Key commands: "); 
        print(" H - print Help to the console."); 
        print(" P - export a PNG screenshot."); 
        print(" N - generate a Novel variation."); 
        print(" 1,2,3,4 - select Parabola # for editing.");
        print(" 5/D - select Directrix for editing."); 
        print(" R/Return/Space/Escape - restore mint."); 
        break;
      case "n":
      case "N": 
        // generate novel new one for fun
        bDoUserDirectrix = false;
        let localSeed = frameCount * 569;
        initializeArtwork(localSeed);
        break;
      case "x":
        userDirectrixPoints = [];
        break;
      case " ":
      case "r":
      case "R":
        // Master reset on Space, R
        bDoUserDirectrix = false;
        initializeArtwork($o.seed);
        break;
    }

    if (key === 'Escape' || keyCode === 27) {
      // Master reset on Escape
      bDoUserDirectrix = false;
      initializeArtwork($o.seed);

    } else if (keyCode === RETURN) {
      // Master reset on Return
      bDoUserDirectrix = false;
      initializeArtwork($o.seed);
    }
}

function saveScreenshotPNG() {
  let outputFilename = "directrix_";
  outputFilename += nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2);
  outputFilename += "_" + nf(myFrameCount, 5) + ".png";
  save(outputFilename);
}

function randomizeColors() {
  let palette = randomOKLCHPalette();
  for (let i = 0; i < NPARABS; i++) {
    gParabs[i].setColor(
      color(palette[i][0], palette[i][1], palette[i][2], 255)
    );
  }
}

// Compact OKLCH-based palette generator returning RGB colors
function randomOKLCHPalette() {
  colorHarmonyName = "Random";
  const nCols = NPARABS;
  const curveAccent = myRandom(0.3, 0.55);
  const hBase = myRandomFromArray([-10,0,10,15,25,30,35,60,90,240]);

  let hStep = [0, 30, 60, 120];
  let hStepChoice = myRandom(1);
  if (hStepChoice < 0.5) {
    let hStepIdx = myRandomFromArray([0,1,2,3,4]);
    const harmonies = [
      [0, 10, 20, 60],
      [0, 30, 60, 120],
      [0, 22, 45, 180],
      [0, 180, 30, 210],
      [-10, 10, 170, -170],
    ];
    hStep = harmonies[hStepIdx];
    colorHarmonyName = "Set-" + hStepIdx;
  } else if (hStepChoice < 0.8) {
    let hi = 0;
    const hdel = myRandomFromArray([15, 30, 45]);
    const hdev = myRandomFromArray([2, 10]);
    colorHarmonyName = "Delta-" + hdel; 
    for (let i = 0; i < nCols; i++) {
      hStep[i] = hi;
      hi += floor(myRandomGaussian(hdel, hdev));
    }
  } else if (hStepChoice < 1.0) {
    colorHarmonyName = "Random";
    for (let i = 0; i < nCols; i++) {
      hStep[i] = floor(i * myRandom(10, hBase));
    }
  }

  let rs = myRandom(0.1, 0.18);
  const sRange = [1 * rs, 2 * rs];
  const lRange = [myRandom(0.3, 0.5), 0.95];
  let cols = [];
  for (let i = 0; i < nCols; i++) {
    const t = i / (nCols - 1);
    const tx = pow(1 - t, 1 - curveAccent);
    const ty = pow(t, 1 - curveAccent);
    const C = lerp(sRange[0], sRange[1], tx);
    const L = lerp(lRange[0], lRange[1], ty);
    const h = (hBase + hStep[i] + 3600) % 360;
    cols.push(oklchToRgb(L, C, h));
  }
  return cols;
}

function oklchToRgb(L, C, hDeg) {
  const h = radians(hDeg);
  const ch = C * cos(h);
  const sh = C * sin(h);
  const l = (L + 0.3963377 * ch + 0.2158037 * sh) ** 3;
  const m = (L - 0.1055613 * ch - 0.0638541 * sh) ** 3;
  const s = (L - 0.0894841 * ch - 1.2914855 * sh) ** 3;
  const r = 4.076741 * l - 3.307711 * m + 0.230969 * s;
  const g = -1.268438 * l + 2.609757 * m - 0.341319 * s;
  const b = -0.004196 * l - 0.703418 * m + 1.707614 * s;
  const toSRGB = (x) =>
    255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1 / 2.4) - 0.055);

  return [
    constrain(toSRGB(r), 0, 255),
    constrain(toSRGB(g), 0, 255),
    constrain(toSRGB(b), 0, 255),
  ];
}

function selectParab(p) {
  gCurrentSelection = p;
  for (let i = 0; i < NPARABS; i++) {
    gParabs[i].doSelect(i === p);
  }
  gSelTime = millis() / 1000.0;
}

//============================================================
// --- internal RNG management ---
let _currentRnd = $o.rnd; // start with host RNG
let _gaussianHasSpare = false;
let _gaussianSpare;

// sfc32 algorithm (same as host)
function sfc32_local(a, b, c, d) {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// deterministic 4-int seed from number
function makeSeedFromNumber(n) {
  const s = n >>> 0;
  return [s, s ^ 0x9e3779b9, (s << 13) ^ (s >>> 7), s ^ 0xa5a5a5a5];
}

// --- main control function ---
function myRandomSeed(n) {
  if ((n == $o.seed) || (n === null) || (typeof n === "undefined")) {
    // revert to official generator
    $o.rnd(null); // reset its internal state
    _currentRnd = $o.rnd; // reattach official RNG
  } else {
    // make an independent sub-generator
    const seedArray = makeSeedFromNumber(n);
    _currentRnd = sfc32_local(...seedArray);
  }
  _gaussianHasSpare = false; // clear cached Gaussian
}

// --- random number functions using _currentRnd ---
function myRandom(lo, hi) {
  const argc = arguments.length;
  if (argc === 0) return _currentRnd();
  if (argc === 1) { hi = lo; lo = 0; }
  return lo + (hi - lo) * _currentRnd();
}

function myRandomFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const idx = Math.floor(_currentRnd() * arr.length);
  return arr[idx];
}

function myRandomGaussian(mean = 0, sd = 1) {
  let y1, x1, x2, w;
  if (_gaussianHasSpare) {
    _gaussianHasSpare = false;
    y1 = _gaussianSpare;
  } else {
    do {
      x1 = 2 * _currentRnd() - 1;
      x2 = 2 * _currentRnd() - 1;
      w = x1 * x1 + x2 * x2;
    } while (w >= 1 || w === 0);
    w = Math.sqrt((-2 * Math.log(w)) / w);
    y1 = x1 * w;
    _gaussianSpare = x2 * w;
    _gaussianHasSpare = true;
  }
  return y1 * sd + mean;
}

// -----------------------------------------------
// Perlin noise implementation using myRandom() instead of Math.random()
const MY_PERLIN_YWRAPB = 4;
const MY_PERLIN_YWRAP = 1 << MY_PERLIN_YWRAPB;
const MY_PERLIN_ZWRAPB = 8;
const MY_PERLIN_ZWRAP = 1 << MY_PERLIN_ZWRAPB;
const MY_PERLIN_SIZE = 4095;
let my_perlin = null;
let my_perlin_octaves = 4;
let my_perlin_amp_falloff = 0.5;
const my_scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));

function myNoise(x, y = 0, z = 0) {
  if (my_perlin == null) {
    my_perlin = new Array(MY_PERLIN_SIZE + 1);
    for (let i = 0; i < MY_PERLIN_SIZE + 1; i++) {
      my_perlin[i] = myRandom();
    }
  }

  if (x < 0) x = -x;
  if (y < 0) y = -y;
  if (z < 0) z = -z;
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;
  let r = 0;
  let ampl = 0.5;

  for (let o = 0; o < my_perlin_octaves; o++) {
    let of = xi + (yi << MY_PERLIN_YWRAPB) + (zi << MY_PERLIN_ZWRAPB);
    let rxf = my_scaled_cosine(xf);
    let ryf = my_scaled_cosine(yf);
    let n1 = my_perlin[of & MY_PERLIN_SIZE];
    n1 += rxf * (my_perlin[(of + 1) & MY_PERLIN_SIZE] - n1);
    let n2 = my_perlin[(of + MY_PERLIN_YWRAP) & MY_PERLIN_SIZE];
    n2 += rxf * (my_perlin[(of + MY_PERLIN_YWRAP + 1) & MY_PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);
    of += MY_PERLIN_ZWRAP;
    n2 = my_perlin[of & MY_PERLIN_SIZE];
    n2 += rxf * (my_perlin[(of + 1) & MY_PERLIN_SIZE] - n2);
    let n3 = my_perlin[(of + MY_PERLIN_YWRAP) & MY_PERLIN_SIZE];
    n3 += rxf * (my_perlin[(of + MY_PERLIN_YWRAP + 1) & MY_PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);
    n1 += my_scaled_cosine(zf) * (n2 - n1);
    r += n1 * ampl;
    ampl *= my_perlin_amp_falloff;
    xi <<= 1; xf *= 2;
    yi <<= 1; yf *= 2;
    zi <<= 1; zf *= 2;
    if (xf >= 1.0) { xi++; xf--; }
    if (yf >= 1.0) { yi++; yf--; }
    if (zf >= 1.0) { zi++; zf--; }
  }
  return r;
}

// Seed noise array using myRandomSeed() and myRandom()
function myNoiseSeed() {
  my_perlin = new Array(MY_PERLIN_SIZE + 1);
  for (let i = 0; i < MY_PERLIN_SIZE + 1; i++) {
    my_perlin[i] = myRandom();
  }
}


//===============================================================
// PseudoParab class
class PseudoParab {
  constructor(id, directrixRef) {
    this.id = id;
    this.directrixPts = directrixRef; // shared array of p5.Vector
    this.mintPathPts = []; // array of p5.Vector (focus path)
    this.fociPathPts = []; // array of p5.Vector (focus path)
    this.parabPOINTS = []; // array of p5.Vector (computed locus)
    this.continuityFlags = []; // array of booleans
    this.left = 0 - LIMIT;
    this.top = 0 - LIMIT;
    this.right = LIMIT;
    this.bottom = LIMIT;
    this.thickness = 0.5;
    this._color = color(255, 255, 255);
    this.sel = false;
    this.selTime = -10.0;
    this.focusPOINT = createVector(width * 0.5, height * 0.5);
  }

  makeLissPath(rx, ry) {
    this.clearFociPoints();
    const len = props.cycleLen;
    const focm = props.focusMovement;
    const id10 = this.id * 10;

    for (let i = 0; i < len; i++) {
      let lt = (4 + this.id * 3) * (i / len + this.id / NPARABS) * TWO_PI;
      let lx = focm * (myNoise(cos(lt), sin(lt), id10) - 0.5);
      let ly = focm * (myNoise(cos(lt), sin(lt), id10 + 5) - 0.5);
      let fcLiss = createVector(rx + lx, ry + ly);
      this.addFocusPoint(fcLiss);
    }
  }

  makeMintPath() {
    this.mintPathPts = [];
    let nPts = this.fociPathPts.length;
    for (let i = 0; i < nPts; i++) {
      let p = this.fociPathPts[i];
      this.mintPathPts.push(p5.Vector.copy(p));
    }
  }

  restoreFromMintPath() {
    this.fociPathPts = [];
    let nPts = this.mintPathPts.length;
    for (let i = 0; i < nPts; i++) {
      let p = this.mintPathPts[i];
      this.fociPathPts.push(p5.Vector.copy(p));
    }
  }

  clearFociPoints() {
    this.fociPathPts.length = 0;
    this.parabPOINTS.length = 0;
    this.continuityFlags.length = 0;
  }

  addFocusPoint(p) {
    this.fociPathPts.push(p5.Vector.copy(p));
  }

  setColor(c) {
    this._color = c;
  }
  doSelect(selected) {
    this.sel = selected;
    this.selTime = millis() / 1000.0;
  }

  // compute the pseudo-parabola for a specific
  // focus index, or an explicit focus point
  computeCache(focusIndex, focusPt = null) {
    if (this.fociPathPts.length > 0) {
      if (focusIndex && !focusPt) {
        let index = focusIndex % this.fociPathPts.length;
        this.computeParabola(index, null);
      } else if (focusPt) {
        this.computeParabola(focusIndex, focusPt);
      }
    }
  }

  
  renderWithClipping (whichId) {
    const nPpts = this.parabPOINTS.length;
    if (nPpts > 0) {
      const id = ((whichId * 5) & 3) ^ 1; // remap
      const now = millis() / 1000.0;
      const useSel = this.sel && now - this.selTime < 1.0;

      // stroke style
      let sr = red(this._color);
      let sg = green(this._color);
      let sb = blue(this._color);
      let sa =
        props.parabAlphaCenter +
        20 * sin(id * radians(30) + myFrameCount / 600);
      stroke(sr, sg, sb, sa);

      let dth = 1 - min(now - this.selTime, 1);
      strokeWeight(this.thickness + (useSel ? dth : 0));
      strokeJoin(MITER);
      noFill();

      if (props.bDrawParabsContinuously) {
        let qx1 = this.parabPOINTS[0].x;
        let qy1 = this.parabPOINTS[0].y;
        for (let i = 1; i < nPpts; i++) {
          const p = this.parabPOINTS[i];
          const px1 = p.x;
          const py1 = p.y;
          this.lineClippedToCanvas(px1,py1, qx1,qy1);
          qx1 = px1; 
          qy1 = py1; 
        }
        
      } else {
        // draw segment-by-segment honoring continuity
        let p0onscreen = true;
        let qx1 = this.parabPOINTS[0].x;
        let qy1 = this.parabPOINTS[0].y;
        for (let i = 1; i < nPpts; i++) {
          const cont = this.continuityFlags[i];
          const p = this.parabPOINTS[i];
          const px1 = p.x;
          const py1 = p.y;
          const p1onscreen =
            px1 <= this.right &&
            px1 >= this.left &&
            py1 <= this.bottom &&
            py1 >= this.top;
          const onscreen = p1onscreen || p0onscreen;
          if (!(!cont || !onscreen)) {
            this.lineClippedToCanvas(px1,py1, qx1,qy1);
          }
          qx1 = px1; 
          qy1 = py1; 
          p0onscreen = p1onscreen;
        }
      }
    }
    this.displayFocusPoint();
  }
  
  
  //-----------------------
  // Liang–Barsky clipping
  lineClippedToCanvas(ax, ay, bx, by) {
    const xMin = 0, xMax = width;
    const yMin = 0, yMax = height;

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

      // Small numeric guard to land exactly on edges
      px = constrain(px, xMin, xMax);
      py = constrain(py, yMin, yMax);
      qx = constrain(qx, xMin, xMax);
      qy = constrain(qy, yMin, yMax);
      line(px,py, qx,qy);
    }
  }
  
  
  displayFocusPoint() {
    noStroke();
    let hl = bDoUserDirectrix
      ? userDirectrixPoints.length
      : myTracer.history.length;
    let frac = bDoUserDirectrix ? 1.0 : min(1.0, hl / 100);
    let r = this.sel ? 3 : 2;
    let selFrac = 1 - constrain(millis() / 1000.0 - this.selTime, 0, 1);

    let dx = MX - this.focusPOINT.x;
    let dy = MY - this.focusPOINT.y;
    let dh = sqrt(dx * dx + dy * dy);
    if (dh < mouseRadius || (this.sel && selFrac > 0)) {
      const sr = red(this._color);
      const sg = green(this._color);
      const sb = blue(this._color);
      const sa = 96;
      fill(sr, sg, sb, sa);

      let sd = pow(max(0, 1 - dh / mouseRadius), 0.25);
      let se = max(selFrac, sd);
      circle(this.focusPOINT.x, this.focusPOINT.y, se * 15);
      circle(this.focusPOINT.x, this.focusPOINT.y, se * 23);
    }

    fill(255, 254, 253, 255 * frac);
    let diam = r * 2 * frac;
    circle(this.focusPOINT.x, this.focusPOINT.y, diam);
  }

  computeParabola(focusIndex, focusPt = null) {
    this.directrixPts = myTracer.directrix;
    if (bDoUserDirectrix) {
      this.directrixPts = userDirectrixPoints;
    }

    let fx, fy;
    if (focusPt) {
      fy = focusPt.y;
      fx = focusPt.x;
    } else {
      let index = focusIndex % this.fociPathPts.length;
      const fpFocus = this.fociPathPts[index];
      fy = fpFocus.y;
      fx = fpFocus.x;
    }

    this.focusPOINT.set(fx, fy);
    const nDir = this.directrixPts.length;
    const nDirm1 = nDir - 1;

    this.parabPOINTS.length = 0;
    this.continuityFlags.length = 0;

    let cross = 0;
    let crossLast = 0;
    let crossSign = 0;
    let crossLastSign = 0;

    for (let i = 0; i < nDirm1; i++) {
      const p1 = this.directrixPts[i];
      const p2 = this.directrixPts[i + 1];
      const mx1 = p1.x;
      const my1 = p1.y;
      const mx2 = p2.x;
      const my2 = p2.y;
      const dmx = mx2 - mx1;
      const dmy = my2 - my1;
      if (abs(dmy) + abs(dmx) < 0.1) {
        continue;
      }

      let my2Mmy1 = my2 - my1;
      let fyMmy1 = fy - my1;
      if (my2 === my1) {
        my2Mmy1 += 0.0001;
      }
      if (fy === my1) {
        fyMmy1 += 0.0001;
      }
      let frac = (mx1 - mx2) / my2Mmy1;
      if (frac === 0.0) {
        frac += 0.0001;
      }

      const num1 = (fx * fx + fy * fy - mx1 * mx1 - my1 * my1) / (2.0 * fyMmy1);
      const num2 = frac * mx1 - my1;
      const num3 = frac + (fx - mx1) / fyMmy1;
      const px = (num1 + num2) / num3;
      const num4 = (mx2 - mx1) / my2Mmy1;
      const num5 = num4 * (mx1 - px);
      const py = my1 + num5;
      const fmx = mx1 - fx;
      const fmy = my1 - fy;

      crossLast = cross;
      crossLastSign = crossSign;
      cross = fmx * dmy - dmx * fmy;
      crossSign = Math.sign(cross);
      const contFlag = !(i !== 0 && crossLastSign !== crossSign);
      if (isFinite(px) && isFinite(py)) {
        if (Math.abs(px) < LIMIT && Math.abs(py) < LIMIT) {
          this.parabPOINTS.push(createVector(px, py));
          this.continuityFlags.push(contFlag);
        } else {
          if (this.parabPOINTS.length > 1) {
            let qx = this.parabPOINTS[this.parabPOINTS.length - 1].x;
            let qy = this.parabPOINTS[this.parabPOINTS.length - 1].y;
            this.parabPOINTS.push(createVector(qx, qy));
            this.continuityFlags.push(false);
          }
        }
      }
    }
  }
}

//=================================================
class Tracer {
  constructor(inx, iny) {
    this.reset(inx, iny);
  }

  reset(inx, iny) {
    this.history = [];
    this.directrix = [];
    this.px = inx;
    this.py = iny;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
  }

  getCentroid() {
    let cx = 0;
    let cy = 0;
    let thl = this.history.length;
    if (thl > 0) {
      for (let i = 0; i < thl; i++) {
        let px = this.history[i].x;
        let py = this.history[i].y;
        cx += px;
        cy += py;
      }
      cx /= thl;
      cy /= thl;
    }
    return createVector(cx, cy);
  }

  //-----------------------
  update() {
    const len = props.cycleLen;
    if (true || this.history.length < len) {
      this.ax = 0;
      this.ay = 0;
      const nPts = tracerFoci.length;
      const j = myFrameCount % len;
      const jfrac = j / len;
      const jfrac10 = 10 + jfrac;
      const jfrac20 = 20 + jfrac;
      const cpow = props.cyclePow;
      const spow = props.sigmoPow;
      const FA = props.FA;
      const FB = props.FB;

      for (let i = 0; i < nPts; i++) {
        const t = (jfrac + i / nPts) * TWO_PI;
        let factor = pow(0.5 * (1 + cos(t)), cpow);
        factor = doubleExponentialSigmoid(factor, spow);

        const px = this.px;
        const py = this.py;
        const dx = tracerFoci[i].x - px;
        const dy = tracerFoci[i].y - py;
        const dh2 = dx * dx + dy * dy;
        const dh = sqrt(dh2);
        const fx = ((FA * dx) / dh) * factor;
        const fy = ((FA * dy) / dh) * factor;
        const gx = ((FB * dy) / dh2) * factor;
        const gy = ((FB * dx) / dh2) * factor;
        const nx =
          props.noisiness * (myNoise(px / 200.0, py / 200.0, jfrac10) - 0.5);
        const ny =
          props.noisiness * (myNoise(px / 200.0, py / 200.0, jfrac20) - 0.5);
        this.ax += fx - gx + nx;
        this.ay += fy + gy + ny;
      }

      this.vx += this.ax;
      this.vy += this.ay;
      this.vx *= props.tracerDamping;
      this.vy *= props.tracerDamping;
      this.px += this.vx;
      this.py += this.vy;
      this.history.push(createVector(this.px, this.py));
      if (this.history.length > len) {
        this.history.shift(); // remove the oldest
      }
    } else {
      const ox = this.history[0].x;
      const oy = this.history[0].y;
      this.history.push(createVector(ox, oy));
      this.history.shift(); // remove the oldest
    }

    this.directrix = [];
    const ms = (myFrameCount * 16) / props.wiggleSpeed;
    const ms10 = ms + 10;
    const ms20 = ms + 20;
    const ifracLen = 100;
    const thl = this.history.length;
    const wiggleScale = props.wiggleScale;
    const wiggleAmount = props.wiggleAmount;

    for (let i = 0; i < thl; i++) {
      const ifract = ((i - thl + len) % len) / ifracLen;
      const px = this.history[i].x;
      const py = this.history[i].y;
      const pxw = px / wiggleScale;
      const pyw = py / wiggleScale;
      const nx = myNoise(pxw, pyw, ms10 + ifract) - 0.5;
      const ny = myNoise(pxw, pyw, ms20 + ifract) - 0.5;
      const qx = px + nx * wiggleAmount;
      const qy = py + ny * wiggleAmount;
      this.directrix.push(createVector(qx, qy));
    }
  }

  //-----------------------
  displaySimple() {
    blendMode(BLEND);
    const thl = this.history.length;
    const len = props.cycleLen;

    if (thl > 1) {
      const tw = (props.maxWeight + props.minWeight) / 2;
      const ta = (props.maxAlpha + props.minAlpha) / 2;
      strokeWeight(tw);
      stroke(255, 254, 253, ta);
      noFill();

      let qx = 0;
      let qy = 0;

      if (myFrameCount < len) {
        beginShape();
        for (let i = 0; i < thl; i++) {
          qx = this.directrix[i].x;
          qy = this.directrix[i].y;
          vertex(qx, qy);
        }
        endShape();
      } else {
        beginShape();
        for (let i = 0; i < thl; i++) {
          let j = (i - (myFrameCount % thl) + thl) % thl;
          qx = this.directrix[j].x;
          qy = this.directrix[j].y;
          vertex(qx, qy);
        }
        endShape();
      }

      qx = this.directrix[thl - 1].x;
      qy = this.directrix[thl - 1].y;
      noStroke();
      fill(255, 255, 255);
      circle(qx, qy, 6);
    }
  }

  display() {
    blendMode(HARD_LIGHT);
    stroke(255, 255, 255, 102);
    strokeWeight(0.6666);
    strokeCap(SQUARE);
    noFill();

    const ms = (myFrameCount * 16) / props.wiggleSpeed;
    const ifracLen = 100;
    const thl = this.history.length;
    if (thl > 1) {
      let qx = 0;
      let qy = 0;
      let rx = this.history[1].x;
      let ry = this.history[1].y;
      let sx = this.history[0].x;
      let sy = this.history[0].y;
      const maxTW = props.maxWeight;
      const minTW = props.minWeight;
      const maxTA = props.maxAlpha;
      const minTA = props.minAlpha;

      const now = millis() / 1000.0;
      const selDirectrix = gCurrentSelection === DIREX && now - gSelTime < 1.0;
      let dth = selDirectrix ? 2.0 * (1 - min(now - gSelTime, 1)) : 0;

      if (!true) {
        strokeWeight((maxTW + minTW) / 2);
        stroke(255, 254, 253, (maxTA + minTA) / 2);
        beginShape();
        for (let i = 0; i < thl; i++) {
          qx = this.directrix[i].x;
          qy = this.directrix[i].y;
          curveVertex(qx, qy);
        }
        endShape();
      } else {
        for (let i = 0; i < thl; i++) {
          qx = this.directrix[i].x;
          qy = this.directrix[i].y;

          if (i > 2) {
            if (i != thl - (myFrameCount % thl)) {
              const ang = pow(
                abs(turnAngle(qx, qy, rx, ry, sx, sy)) / PI,
                10.0
              );
              const angWeight = dth + map(ang, 0, 1, maxTW, minTW);
              let angAlpha = map(ang, 0, 1, maxTA, minTA);
              if (i < ifracLen) {
                angAlpha *= i / ifracLen;
              }
              stroke(255, 254, 253, angAlpha);
              strokeWeight(angWeight);
              line(qx, qy, rx, ry);
            }
          }
          sx = rx;
          sy = ry;
          rx = qx;
          ry = qy;
        }
      }

      noStroke();
      let frac = pow(min(1.0, thl / 100), 0.5);
      fill(255, 255, 255, 255);
      circle(qx, qy, 6 * frac);
    }
    blendMode(BLEND);
  }
}
