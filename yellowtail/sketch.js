/**
 * Yellowtail
 * by Golan Levin (http://flong.com, @golan). 
 * Click, drag, and release to create a kinetic gesture.
 * 
 * Yellowtail (1998- ) is an interactive system for
 * the gestural creation and performance of real-time
 * abstract animation. The software repeats your
 * marks end-over-end, allowing the simultaneous
 * specification of a line’s shape and quality of
 * movement. Each line repeats according to its own
 * period, producing an ever-changing display of
 * lively, worm-like textures.
 * 
 * Acknowledgements:
 * Originally developed 1998-2000 by Golan Levin
 * Uses p5.js, created by the @p5xjs community
 * Additional thanks to @n1ckfg, @MAKIO135, 
 * @mrdoob, @quasimondo, and @presstube.
 */

// "use strict";

let gestureArray;
let nGestures; // Number of gestures
let minMove; // Minimum travel for a new point
let currentGestureID;
let bClicked;
let textAlpha; 
let direction; 

let tmpXp;
let tmpYp;

//-----------------------------------------------------
function setup() {
  gestureArray = [];
  nGestures = 16; // Number of gestures
  minMove = (0.99 * sqrt(2.0)); // Minimum travel for a new point
  bClicked = false;
  textAlpha = 1.0; 
  direction = -1;

  tmpXp = [];
  tmpYp = [];

  createCanvas(windowWidth, windowHeight);
  background(0, 0, 0);

  currentGestureID = -1;
  gestureArray = new Array(nGestures);
  for (let i = 0; i < nGestures; i++) {
    gestureArray[i] = new Gesture(width, height);
  }

  clearGestures();
  createInitialGesture(); 
}

//-----------------------------------------------------
function draw() {
  background(0, 0, 0);
  drawLegend();

  updateGeometry();
  for (let i = 0; i < nGestures; i++) {
    renderGesture(gestureArray[i], width, height);
  }
}


//-----------------------------------------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (let i = 0; i < nGestures; i++) {
    gestureArray[i].resizeWindow(width, height);
  }
}

//-----------------------------------------------------
function drawLegend() {
  
  if (bClicked) {
    textAlpha *= 0.97;
  }
  
  if (textAlpha > 0.02){
    let legend = "";
    legend += "Yellowtail (by @Golan Levin, 1998) is an interactive \n";
    legend += "system for the gestural creation and performance of \n";
    legend += "real-time abstract animation. The software repeats \n";
    legend += "your marks end-over-end, allowing the simultaneous \n";
    legend += "specification of a line’s shape and also its quality of \n";
    legend += "movement. Each line repeats according to its own \n";
    legend += "period, producing an ever-changing, generative \n";
    legend += "display of lively, worm-like textures. \n";
    legend += "\n";
    legend += "Developed at the MIT Aesthetics & Computation Group. \n";
    legend += "Uses p5.js, created by the ProcessingOrg community. \n";
    legend += "\n";
    legend += "Instructions: Draw to begin. Press 'r' to reverse. \n";
    legend += "Press +/- to change thickness. Press SPACE to clear. \n";

    let translations = {
      "AR": "رسم لبدء",
      "CS": "čerpat začít",
      "DA": "drage til at begynde",
      "DE": "ziehen zu beginnen",
      "EL": "κλήρωση για να ξεκινήσετε",
      "EN": "draw to begin",
      "ES": "para empezar a dibujar",
      "ET": "koostama hakata",
      "FI": "piirtää alkaa",
      "FR": "tirage pour commencer",
      "HE": "כדי להתחיל לצייר",
      "HR": "povući za početak",
      "HU": "felhívni, hogy kezdődik",
      "ID": "menarik untuk memulai",
      "IS": "draga að byrja",
      "IT": "attingere per iniziare",
      "JA": "を開始して描画",
      "KO": "시작하다",
      "LT": "atkreipti pradėti",
      "LV": "izdarīt, lai sāktu",
      "MS": "menarik untuk memulakan",
      "NL": "te trekken om te beginnen",
      "NO": "trekke å begynne",
      "PL": "czerpać, aby rozpocząć",
      "PT": "para começar a desenhar",
      "RO": "trage pentru a începe",
      "RU": "обратить начать",
      "SK": "čerpať začať",
      "SV": "dra för att börja",
      "TH": "เพื่อเริ่มต้นการวาด",
      "TR": "başlamak için çizin",
      "UK": "звернути почати",
      "ZH": "抽奖开始"
    };

    let languages = "";
    let drawToBeginTexts = "";
    for (let T in translations) {
      languages += T + " \n";
    }
    for (let T in translations) {
      drawToBeginTexts += translations[T] + " \n";
    }

    textFont("Helvetica");
    textStyle(BOLD); 
    noStroke();
    fill(200,200,195, textAlpha*255);
    textAlign(LEFT);
    textSize(22);
    text("Yellowtail (p5.js Version)", 40, 60); 

    let TY = 90;
    textFont("Helvetica");
    textStyle(NORMAL); 
    textSize(10);
    noStroke();

    fill(200,200,195, textAlpha*255);
    textAlign(LEFT);
    text(legend, 40, TY);

    fill(80,80,75, textAlpha*255);
    textAlign(RIGHT);
    text(languages, 30, TY+200);

    fill(200,200,195, textAlpha*255);
    textAlign(LEFT);
    text(drawToBeginTexts, 40, TY+200);
  }
}

//-----------------------------------------------------
function createInitialGesture() {
    let initialGestureData = {
    "points":[
      {"x":95.000000, "y":113.000000},
      {"x":97.600243, "y":110.326553},
      {"x":100.163910, "y":107.871696},
      {"x":102.594559, "y":105.948532},
      {"x":104.714470, "y":104.988785},
      {"x":106.296928, "y":105.439079},
      {"x":107.144958, "y":107.580376},
      {"x":107.179436, "y":111.390274},
      {"x":106.480980, "y":116.542564},
      {"x":105.258133, "y":122.531670},
      {"x":103.766724, "y":128.846954},
      {"x":102.230888, "y":135.119568},
      {"x":100.802490, "y":141.177643},
      {"x":99.565300, "y":146.993820},
      {"x":98.562767, "y":152.590759},
      {"x":97.837646, "y":157.970627},
      {"x":97.480042, "y":163.075882},
      {"x":97.673485, "y":167.745026},
      {"x":98.694397, "y":171.678314},
      {"x":100.821800, "y":174.483566},
      {"x":104.198723, "y":175.810410},
      {"x":108.750168, "y":175.500214},
      {"x":114.189842, "y":173.662598},
      {"x":120.077499, "y":170.632309},
      {"x":125.974258, "y":166.807129},
      {"x":131.611359, "y":162.507309},
      {"x":136.890778, "y":157.979614},
      {"x":141.803131, "y":153.412598},
      {"x":146.388992, "y":148.880783},
      {"x":150.722092, "y":144.346985},
      {"x":154.889099, "y":139.712372},
      {"x":158.966461, "y":134.836304},
      {"x":163.009399, "y":129.539520},
      {"x":167.052856, "y":123.641136},
      {"x":171.105743, "y":117.035782},
      {"x":175.126572, "y":109.795609},
      {"x":179.003891, "y":102.260315},
      {"x":182.590668, "y":94.994247},
      {"x":185.760559, "y":88.617142},
      {"x":188.400742, "y":83.694679},
      {"x":190.407806, "y":80.822128},
      {"x":191.703888, "y":80.612450},
      {"x":192.333313, "y":83.220512},
      {"x":192.439575, "y":87.960167},
      {"x":192.163055, "y":93.893982},
      {"x":191.604645, "y":100.398087},
      {"x":190.839584, "y":107.203827},
      {"x":189.946030, "y":114.244659},
      {"x":188.993103, "y":121.584351},
      {"x":188.034607, "y":129.317825},
      {"x":187.121887, "y":137.325729},
      {"x":186.308838, "y":145.166168},
      {"x":185.618652, "y":152.534485},
      {"x":185.006348, "y":159.636505},
      {"x":184.383759, "y":166.829163},
      {"x":183.640991, "y":174.292725},
      {"x":182.669556, "y":182.174042},
      {"x":181.402695, "y":190.703094},
      {"x":179.853760, "y":199.952240},
      {"x":178.153107, "y":209.541138},
      {"x":176.372055, "y":218.981125},
      {"x":174.391754, "y":228.018173},
      {"x":172.019989, "y":236.775009},
      {"x":169.157806, "y":245.786423},
      {"x":165.843262, "y":255.204636},
      {"x":162.324310, "y":264.169312},
      {"x":158.673492, "y":272.027039},
      {"x":154.502960, "y":279.433228},
      {"x":149.436066, "y":286.832153},
      {"x":143.786331, "y":293.311218},
      {"x":138.217545, "y":298.077148},
      {"x":133.412888, "y":300.969269},
      {"x":129.253601, "y":302.438568},
      {"x":125.736443, "y":302.581696},
      {"x":123.373901, "y":300.526062},
      {"x":122.653351, "y":295.524750},
      {"x":123.432518, "y":288.713379},
      {"x":125.969849, "y":282.015930},
      {"x":129.635376, "y":275.134796},
      {"x":134.280853, "y":267.324768},
      {"x":139.718689, "y":259.137817},
      {"x":146.160126, "y":251.063477},
      {"x":153.033356, "y":243.171997},
      {"x":160.055756, "y":235.561401},
      {"x":167.303345, "y":228.160278},
      {"x":175.038086, "y":221.052490},
      {"x":182.867783, "y":214.147369},
      {"x":190.475433, "y":207.544052},
      {"x":197.990692, "y":201.137024},
      {"x":205.415771, "y":195.077621},
      {"x":212.299973, "y":189.469040},
      {"x":217.417725, "y":185.048187},
      {"x":222.194702, "y":180.801178},
      {"x":227.510986, "y":175.981354},
      {"x":232.824127, "y":171.086639},
      {"x":237.482956, "y":166.507202},
      {"x":242.054321, "y":161.943146},
      {"x":246.923889, "y":156.996124},
      {"x":250.996826, "y":152.083176},
      {"x":255.000000, "y":149.000000},
      {"x":259.000000, "y":145.000000}
    ]
  };
  
  currentGestureID = (currentGestureID + 1) % nGestures;
  let G = gestureArray[currentGestureID];
  G.clear();
  G.clearPolys();
  let ox = 520; 
  let oy = 80; 
  let nInitialPoints = initialGestureData.points.length; 
  for (let i=0; i<nInitialPoints; i++){
    let px = ox + initialGestureData.points[i].x;
    let py = oy + initialGestureData.points[i].y;
    G.addPoint(px, py);
  }
  G.smooth();
  G.compile();
}

//-----------------------------------------------------
function mousePressed() {
  if (!bClicked){
    clearGestures();
  }
  bClicked = true;
  currentGestureID = (currentGestureID + 1) % nGestures;
  let G = gestureArray[currentGestureID];
  G.clear();
  G.clearPolys();
  G.addPoint(mouseX, mouseY);
}

//-----------------------------------------------------
function mouseDragged() {
  if (currentGestureID >= 0) {
    let G = gestureArray[currentGestureID];
    if (G.distToLast(mouseX, mouseY) > minMove) {
      G.addPoint(mouseX, mouseY);
      G.smooth();
      G.compile();
    }
  }
}

//-----------------------------------------------------
function keyPressed() {
  
  if (key == '+' || key == '=') {
    if (currentGestureID >= 0) {
      let th = gestureArray[currentGestureID].thickness; // float
      gestureArray[currentGestureID].thickness = min(96, th + 1);
      gestureArray[currentGestureID].compile();
    }
  } else if (key == '-') {
    if (currentGestureID >= 0) {
      let th = gestureArray[currentGestureID].thickness; // float
      gestureArray[currentGestureID].thickness = max(2, th - 1);
      gestureArray[currentGestureID].compile();
    }
  }
  if ((key == 'i') || (key == 'h')){ 
    bClicked = false;
    textAlpha = 1.0;
  }
    
  if (key == 'r') {
    direction = -1 * direction; 
  }
  if (key == ' ') {
    clearGestures();
  }
}

//-----------------------------------------------------
function renderGesture(gesture, w, h) {
  if (gesture.exists) {
    if (gesture.nPolys > 0) {
      strokeWeight(0.5);
      stroke(255, 255, 245);
      fill(255, 255, 245);

      let polygons = gesture.polygons;
      let crosses = gesture.crosses;

      let xpts = [];
      let ypts = [];
      let p;
      let cr;

      beginShape(QUADS);
      let gnp = gesture.nPolys;
      for (let i = 0; i < gnp; i++) {

        p = polygons[i];
        xpts = p.xpoints;
        ypts = p.ypoints;

        vertex(xpts[0], ypts[0]);
        vertex(xpts[1], ypts[1]);
        vertex(xpts[2], ypts[2]);
        vertex(xpts[3], ypts[3]);

        if ((cr = crosses[i]) > 0) {
          if ((cr & 3) > 0) {
            vertex(xpts[0] + w, ypts[0]);
            vertex(xpts[1] + w, ypts[1]);
            vertex(xpts[2] + w, ypts[2]);
            vertex(xpts[3] + w, ypts[3]);

            vertex(xpts[0] - w, ypts[0]);
            vertex(xpts[1] - w, ypts[1]);
            vertex(xpts[2] - w, ypts[2]);
            vertex(xpts[3] - w, ypts[3]);
          }
          if ((cr & 12) > 0) {
            vertex(xpts[0], ypts[0] + h);
            vertex(xpts[1], ypts[1] + h);
            vertex(xpts[2], ypts[2] + h);
            vertex(xpts[3], ypts[3] + h);

            vertex(xpts[0], ypts[0] - h);
            vertex(xpts[1], ypts[1] - h);
            vertex(xpts[2], ypts[2] - h);
            vertex(xpts[3], ypts[3] - h);
          }

          // I have knowingly retained the small flaw of not
          // completely dealing with the corner conditions
          // (the case in which both of the above are true).
        }
      }
      endShape();
    }
  }
}

//-----------------------------------------------------
function updateGeometry() {
  let J;
  for (let g = 0; g < nGestures; g++) {
    if ((J = gestureArray[g]).exists) {
      if (g != currentGestureID) {
        advanceGesture(J);
      } else if (!mouseIsPressed) {
        advanceGesture(J);
      }
    }
  }
}

//-----------------------------------------------------
function advanceGesture(gesture) {
  // Move a Gesture one step
  if (gesture.exists) { // check
    let nPts = gesture.nPoints;
    let nPts1 = nPts - 1;
    let path = [];
    let jx = gesture.jumpDx;
    let jy = gesture.jumpDy;

    if (nPts > 0) {
      path = gesture.path;
      
      if (direction > 0){
        for (let i = 0; i < nPts1; i++) {
          path[i].x = path[i + 1].x;
          path[i].y = path[i + 1].y;
        }
        path[nPts1].x = path[0].x + jx;
        path[nPts1].y = path[0].y + jy;
        gesture.compile();
        
      } else if (direction < 0){
        for (let i = nPts1; i > 0; i--) {
          path[i].x = path[i - 1].x;
          path[i].y = path[i - 1].y;
        }
        path[0].x = path[nPts1].x - jx;
        path[0].y = path[nPts1].y - jy;
        gesture.compile();
      }
    }
  }
}

//-----------------------------------------------------
function clearGestures() {
  for (let i = 0; i < nGestures; i++) {
    gestureArray[i].clear();
  }
}

//=====================================================
class Gesture {

  constructor(mw, mh) {
    this.damp = 5.0;
    this.dampInv = 1.0 / this.damp;
    this.damp1 = this.damp - 1;

    this.w = mw;
    this.h = mh;
    this.capacity = 600;

    this.path = new Array(this.capacity); // Vec3f
    this.polygons = new Array(this.capacity); // Polygon
    this.crosses = new Array(this.capacity); // int

    for (let i = 0; i < this.capacity; i++) {
      this.polygons[i] = new Polygon(4);
      this.path[i] = new Vec3f(0, 0, 0);
      this.crosses[i] = 0;
    }

    this.nPoints = 0;
    this.nPolys = 0;

    this.exists = false;
    this.jumpDx = 0;
    this.jumpDy = 0;

    this.INIT_TH = 14;
    this.thickness = this.INIT_TH;
  }
  
  resizeWindow(mw, mh){
    this.w = mw;
    this.h = mh;
  }

  clear() {
    this.nPoints = 0;
    this.exists = false;
    this.thickness = this.INIT_TH;
  }

  clearPolys() {
    this.nPolys = 0;
  }

  addPoint(x, y) { // float
    if (this.nPoints >= this.capacity) {
      // there are all sorts of possible solutions here,
      // but for abject simplicity, I don't do anything.
    } else {
      let v = this.distToLast(x, y);
      let p = this.getPressureFromVelocity(v);

      // ~ ~ ~ ~ ~ ~ ~ ~
      this.path[this.nPoints++].set(x, y, p);
      // ~ ~ ~ ~ ~ ~ ~ ~

      if (this.nPoints > 1) {
        this.exists = true;
        this.jumpDx = this.path[this.nPoints - 1].x - this.path[0].x;
        this.jumpDy = this.path[this.nPoints - 1].y - this.path[0].y;
      }
    }
  }

  getPressureFromVelocity(v) { // float
    let scale = 18;
    let minP = 0.02;
    let oldP = (this.nPoints > 0) ? this.path[this.nPoints - 1].p : 0;
    return ((minP + max(0, 1.0 - v / scale)) + (this.damp1 * oldP)) * this.dampInv;
  }

  setPressures() {
    // pressures lety from 0...1
    let pressure; //float
    let tmp; // vec3f
    let t = 0; // float
    let u = 1.0 / (this.nPoints - 1) * TWO_PI;

    for (let i = 0; i < this.nPoints; i++) {
      pressure = sqrt((1.0 - cos(t)) * 0.5);
      this.path[i].p = pressure;
      t += u;
    }
  }

  distToLast(ix, iy) {
    if (this.nPoints > 0) {
      let v = this.path[this.nPoints - 1];
      let dx = v.x - ix;
      let dy = v.y - iy;
      return mag(dx, dy);
    } else {
      return 30;
    }
  }

  compile() {
    // compute the polygons from the path of Vec3f's
    if (this.exists) {
      this.clearPolys();

      let p0, p1, p2;
      let radius0, radius1;
      let ax, bx, cx, dx;
      let ay, by, cy, dy;
      let axi, bxi, cxi, dxi, axip, axid;
      let ayi, byi, cyi, dyi, ayip, ayid;
      let p1x, p1y;
      let dx01, dy01, hp01, si01, co01;
      let dx02, dy02, hp02, si02, co02;
      let dx13, dy13, hp13, si13, co13;
      let taper = 1.0;

      let nPathPoints = this.nPoints - 1;
      let lastPolyIndex = nPathPoints - 1;
      let npm1finv = 1.0 / max(1, nPathPoints - 1);

      // handle the first point
      p0 = this.path[0];
      p1 = this.path[1];
      radius0 = p0.p * this.thickness;
      dx01 = p1.x - p0.x;
      dy01 = p1.y - p0.y;
      hp01 = sqrt(dx01 * dx01 + dy01 * dy01);

      if (hp01 == 0) {
        hp02 = 0.0001;
      }

      co01 = radius0 * dx01 / hp01;
      si01 = radius0 * dy01 / hp01;
      ax = p0.x - si01;
      ay = p0.y + co01;
      bx = p0.x + si01;
      by = p0.y - co01;

      let xpts = [];
      let ypts = [];

      let LC = 20;
      let RC = this.w - LC;
      let TC = 20;
      let BC = this.h - TC;
      let mint = 0.618;
      let tapow = 0.4;

      // handle the middle points
      let i = 1;
      let apoly; // Polygon

      for (let i = 1; i < nPathPoints; i++) {
        taper = pow((lastPolyIndex - i) * npm1finv, tapow);

        p0 = this.path[i - 1];
        p1 = this.path[i];
        p2 = this.path[i + 1];
        p1x = p1.x;
        p1y = p1.y;
        radius1 = Math.max(mint, taper * p1.p * this.thickness);

        // assumes all segments are roughly the same length...
        dx02 = p2.x - p0.x;
        dy02 = p2.y - p0.y;
        hp02 = Math.sqrt(dx02 * dx02 + dy02 * dy02);

        if (hp02 != 0) {
          hp02 = radius1 / hp02;
        }

        co02 = dx02 * hp02;
        si02 = dy02 * hp02;

        // translate the integer coordinates to the viewing rectangle
        axi = axip = floor(ax);
        ayi = ayip = floor(ay);
        axi = (axi < 0) ? (this.w - ((-axi) % this.w)) : axi % this.w;
        axid = axi - axip;
        ayi = (ayi < 0) ? (this.h - ((-ayi) % this.h)) : ayi % this.h;
        ayid = ayi - ayip;

        // set the vertices of the polygon

        // ~ ~ ~ ~ ~ ~ ~ ~
        apoly = this.polygons[this.nPolys++];
        // ~ ~ ~ ~ ~ ~ ~ ~

        xpts = apoly.xpoints;
        ypts = apoly.ypoints;
        xpts[0] = axi = axid + axip;
        xpts[1] = bxi = axid + floor(bx);
        xpts[2] = cxi = axid + floor((cx = p1x + si02));
        xpts[3] = dxi = axid + floor((dx = p1x - si02));
        ypts[0] = ayi = ayid + ayip;
        ypts[1] = byi = ayid + floor(by);
        ypts[2] = cyi = ayid + floor(cy = p1y - co02);
        ypts[3] = dyi = ayid + floor(dy = p1y + co02);

        // keep a record of where we cross the edge of the screen
        this.crosses[i] = 0;
        if ((axi <= LC) || (bxi <= LC) || (cxi <= LC) || (dxi <= LC)) {
          this.crosses[i] |= 1;
        }
        if ((axi >= RC) || (bxi >= RC) || (cxi >= RC) || (dxi >= RC)) {
          this.crosses[i] |= 2;
        }
        if ((ayi <= TC) || (byi <= TC) || (cyi <= TC) || (dyi <= TC)) {
          this.crosses[i] |= 4;
        }
        if ((ayi >= BC) || (byi >= BC) || (cyi >= BC) || (dyi >= BC)) {
          this.crosses[i] |= 8;
        }

        //swap data for next time
        ax = dx;
        ay = dy;
        bx = cx;
        by = cy;
      }

      // handle the last point
      p2 = this.path[nPathPoints];

      // ~ ~ ~ ~ ~ ~ ~ ~
      apoly = this.polygons[this.nPolys++];
      // ~ ~ ~ ~ ~ ~ ~ ~

      xpts = apoly.xpoints;
      ypts = apoly.ypoints;

      xpts[0] = floor(ax);
      xpts[1] = floor(bx);
      xpts[2] = floor((p2.x));
      xpts[3] = floor((p2.x));

      ypts[0] = floor(ay);
      ypts[1] = floor(by);
      ypts[2] = floor((p2.y));
      ypts[3] = floor((p2.y));

    }
  }

  smooth() {
    // average neighboring points
    let weight = 18;
    let scale = 1.0 / (weight + 2);
    let nPointsMinusTwo = this.nPoints - 2;
    let lower, upper, center;

    for (let i = 1; i < nPointsMinusTwo; i++) {
      lower = this.path[i - 1];
      center = this.path[i];
      upper = this.path[i + 1];

      center.x = (lower.x + weight * center.x + upper.x) * scale;
      center.y = (lower.y + weight * center.y + upper.y) * scale;
    }
  }
}

//=====================================================
class Polygon {
  constructor(n) {
    this.npoints = n;
    this.xpoints = new Array(n);
    this.ypoints = new Array(n);
  }
}

//=====================================================
class Vec3f {
  constructor(ix, iy, ip) {
    this.x = 0;
    this.y = 0;
    this.p = 0; // Pressure
    this.set(ix, iy, ip);
  }
  set(ix, iy, ip) {
    this.x = ix;
    this.y = iy;
    this.p = ip;
  }
}