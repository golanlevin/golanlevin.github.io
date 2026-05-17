// Obzok by Golan Levin
// Original Java version: January 1, 2001
// Processing port: September 15, 2007
// p5.js port: May 16, 2026

let obzok;
let obzokSkeleton;
let IBs = [];
let blobPalette = [];
let obzokError = 0;
let nIB = 0;
let theMouseDown = false;
let bDrawAsWireframe = false;
let bInfoDismissed = false;
let infoTextAlpha = 1.0;
const sc = 1.333;

const CANVAS_W = 960;
const CANVAS_H = 540;

const infoStr = "Obzok (Golan Levin, 2001) is an interactive virtual creature created for the January 2001 issue of Singlecell.org, a monthly online bestiary. Singlecell featured a variety of virtual creatures discovered and reared by a diverse group of computational artists and designers."

function setup() {
  const canvas = createCanvas(CANVAS_W, CANVAS_H, P2D);
  if (typeof document !== "undefined") {
    const main = document.querySelector("main");
    if (main) {
      canvas.parent(main);
    }
  }
  establishSimulation();
}

function draw() {
  background(0);
  doSimulation();

  push();
  scale(sc, sc);

  if (bDrawAsWireframe){
    drawSimulationWireframe();
  } else {
    drawSimulation();
  }
  pop();

  drawInfoPage();
}

function establishSimulation() {
  obzok = new Obzok();
  obzokSkeleton = obzok.S;
  obzokSkeleton.setScreenCenter(width / 2 / sc, height / 2 / sc);

  nIB = 30;
  IBs = [];
  blobPalette = [];

  for (let i = 0; i < nIB; i++) {
    const threshold = (i + 1) * (0.00248 / nIB);
    const nParticles = 8 + ((i + 1) * 4);
    IBs[i] = new ImplicitBlob(obzokSkeleton, threshold, nParticles);
  }
  createPalette();
}

function createPalette() {
  const rgb = [
    [1, 2, 5],
    [1, 5, 2],
    [2, 1, 5],
    [2, 5, 1],
    [5, 1, 2],
    [5, 2, 1]
  ];
  const which = Math.floor(Math.random() * 5.99999);
  const [rp, gp, bp] = rgb[which];
  const cc = 1.04;

  for (let i = 0; i < nIB; i++) {
    const f = i / nIB;
    const r = Math.floor(255.0 * Math.pow(f / cc, rp));
    const g = Math.floor(255.0 * Math.pow(f / cc, gp));
    const b = Math.floor(255.0 * Math.pow(f / cc, bp));
    blobPalette[i] = [r, g, b];
  }
}

function doSimulation() {
  if (theMouseDown) {
    obzokSkeleton.mouseDrag(mouseX / sc, mouseY / sc);
  } else {
    obzokSkeleton.mouseMove(mouseX / sc, mouseY / sc);
  }
  obzokSkeleton.move();
  obzokSkeleton.moveCentroid();
  obzokSkeleton.computeCentroid();

  obzokError = IBs[nIB - 1].calculateError();
  if (obzokError > 10) {
    initIBs();
  }
  for (let i = 0; i < nIB; i++) {
    IBs[i].move();
  }
}

function drawSimulation() {
  if (obzokSkeleton.nJoints > 0) {
    noStroke();
    for (let i = 0; i < nIB; i++) {
      fill(...blobPalette[i]);
      IBs[i].draw();
    }
    obzok.draw();
  }
}

function drawSimulationWireframe() {
  if (obzokSkeleton.nJoints > 0) {
    obzok.S.drawStructure();
    obzok.S.drawBody(false);
  }
}

function initIBs() {
  for (let i = 0; i < nIB; i++) {
    IBs[i].init();
  }
}

function mousePressed() {
  dismissInfoPage();
  theMouseDown = true;
  obzok.S.mouseDown(mouseX / sc, mouseY / sc);
  return false;
}

function mouseReleased() {
  dismissInfoPage();
  theMouseDown = false;
  obzok.S.mouseUp(mouseX / sc, mouseY / sc);
  return false;
}

function mouseMoved() {
  dismissInfoPage();
  theMouseDown = false;
  obzok.S.mouseMove(mouseX / sc, mouseY / sc);
  return false;
}

function mouseDragged() {
  dismissInfoPage();
  theMouseDown = true;
  obzok.S.mouseDrag(mouseX / sc, mouseY / sc);
  return false;
}

function keyPressed() {
  if (key == 'i' || key == 'I') {
    showInfoPage();
  } else {
    dismissInfoPage();
  }

  if (key == 'D'){
    bDrawAsWireframe = !bDrawAsWireframe;
  } else {
    bDrawAsWireframe = false;
    createPalette();
    initIBs();
    obzok.S.lastInteractionTime = millis();
  }
}

function dismissInfoPage() {
  bInfoDismissed = true;
}

function showInfoPage() {
  bInfoDismissed = false;
  infoTextAlpha = 1.0;
}

function drawInfoPage() {
  if (obzok && obzok.S && millis() - obzok.S.lastInteractionTime > obzok.S.BEDTIME) {
    dismissInfoPage();
  }

  if (bInfoDismissed) {
    infoTextAlpha *= 0.98;
  }

  if (infoTextAlpha <= 0.02) {
    return;
  }

  push();
  textFont("Helvetica");
  textStyle(NORMAL);
  textAlign(LEFT, TOP);
  textSize(11);
  textLeading(15);
  noStroke();
  fill(220, 216, 208, infoTextAlpha * 255);
  text(infoStr, 28, 34, 290);
  pop();
}

function drawSmoothBezierLoop(verts, tightness = 1 / 3) {
  const n = verts.length;
  if (n < 2) {
    return;
  }

  beginShape();
  vertex(verts[0].x, verts[0].y);
  for (let i = 0; i < n; i++) {
    const c1 = getSmoothLoopControlPoint(verts, i, 1, tightness);
    const c2 = getSmoothLoopControlPoint(verts, i + 1, -1, tightness);
    const p = verts[(i + 1) % n];
    bezierVertex(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
  }
  endShape(CLOSE);
}

function getSmoothLoopControlPoint(verts, index, side, tightness) {
  const n = verts.length;
  const b = verts[((index % n) + n) % n];
  const a = verts[((index - 1) % n + n) % n];
  const c = verts[(index + 1) % n];

  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const abm = Math.hypot(abx, aby) || 1;
  const cbm = Math.hypot(cbx, cby) || 1;
  const abnx = abx / abm;
  const abny = aby / abm;
  const cbnx = cbx / cbm;
  const cbny = cby / cbm;

  let perpx = abnx + cbnx;
  let perpy = abny + cbny;
  const perpm = Math.hypot(perpx, perpy);
  if (perpm === 0) {
    perpx = -cbny;
    perpy = cbnx;
  } else {
    perpx /= perpm;
    perpy /= perpm;
  }

  let tanx = perpy;
  let tany = -perpx;
  const cross = abnx * cbny - abny * cbnx;
  let len = tightness;

  if (side === 1) {
    len *= cbm;
    len *= cross > 0 ? -1 : 1;
  } else {
    len *= abm;
    len *= cross < 0 ? -1 : 1;
  }

  tanx *= len;
  tany *= len;
  return new FPoint(b.x + tanx, b.y + tany);
}

class FPoint {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clear() {
    this.x = 0;
    this.y = 0;
  }

  set(x, y) {
    if (x instanceof FPoint) {
      this.x = x.x;
      this.y = x.y;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  translate(x, y) {
    if (x instanceof FPoint) {
      this.x += x.x;
      this.y += x.y;
    } else {
      this.x += x;
      this.y += y;
    }
  }

  scale(x, y = x) {
    this.x *= x;
    this.y *= y;
  }

  magnitude() {
    return this.x * this.x + this.y * this.y;
  }

  clamp(bound) {
    this.x = Math.min(bound, Math.max(this.x, -bound));
    this.y = Math.min(bound, Math.max(this.y, -bound));
  }
}

class Joint {
  constructor(x, y, id) {
    this.position = new FPoint(x, y);
    this.velocity = new FPoint();
    this.displacement = new FPoint();
    this.id = id;

    this.K = -(0.09 + 0.02 * (Math.random() - 0.5));
    this.D = 0.945 + 0.025 * (Math.random() - 0.5);
    this.MAX_VELOCITY = 10;
    this.MAX_MOVEMENT = 16;
  }

  draw() {
    noStroke();
    fill(...blobPalette[Math.floor(nIB * 0.6)]);
    ellipse(this.position.x, this.position.y, 7, 7);
  }

  set(x, y) {
    this.position.set(x, y);
  }

  addDisplacement(dx, dy) {
    this.displacement.translate(dx, dy);
  }

  getDisplacementSquared() {
    return this.displacement.x * this.displacement.x + this.displacement.y * this.displacement.y;
  }

  moveTowards(x, y) {
    const mtx = x - this.position.x;
    const mty = y - this.position.y;
    const dist = Math.hypot(mtx, mty);
    const mth = dist === 0 ? 1 : Math.min(1.0, this.MAX_MOVEMENT / dist);
    this.position.x += mtx * mth;
    this.position.y += mty * mth;
  }

  update() {
    const forceX = this.K * this.displacement.x;
    const forceY = this.K * this.displacement.y;
    this.velocity.scale(this.D);
    this.velocity.translate(forceX, forceY);
    this.velocity.clamp(this.MAX_VELOCITY);
    this.position.translate(this.velocity);
    this.displacement.clear();
  }
}

class Link {
  constructor(j0, j1, onBoundary, strength) {
    this.j0 = j0;
    this.j1 = j1;
    this.fp0 = j0.position;
    this.fp1 = j1.position;
    this.onBoundary = onBoundary;
    this.strength = strength;

    const dx = this.fp0.x - this.fp1.x;
    const dy = this.fp0.y - this.fp1.y;
    this.restLength0 = Math.hypot(dx, dy);
    this.restLength = this.restLength0;
  }

  wiggle(amount, speed) {
    const t = millis() / speed;
    this.restLength = this.restLength0 * (1.0 + amount * Math.sin(t));
  }

  update() {
    const dx = this.fp0.x - this.fp1.x;
    const dy = this.fp0.y - this.fp1.y;
    const dh = Math.hypot(dx, dy) || 0.1;
    const stretch = (dh - this.restLength) * this.strength;
    const fx = (dx / dh) * stretch;
    const fy = (dy / dh) * stretch;
    this.j0.addDisplacement(fx, fy);
    this.j1.addDisplacement(-fx, -fy);
  }

  flipBoundary() {
    this.onBoundary = !this.onBoundary;
  }

  draw() {
    stroke(...blobPalette[Math.floor(nIB * 0.8)]);
    line(this.fp0.x, this.fp0.y, this.fp1.x, this.fp1.y);
  }
}

class Blob {
  constructor(precision) {
    this.knots = [];
    this.precision = precision;
  }

  clear() {
    this.knots.length = 0;
  }

  addKnot(x, y) {
    if (x instanceof FPoint) {
      this.knots.push(x);
    } else {
      this.knots.push(new FPoint(x, y));
    }
  }

  pointWithin(x, y) {
    const n = this.knots.length;
    if (n < 3) {
      return false;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.knots) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = this.knots[i];
      const pj = this.knots[j];
      const intersects = ((pi.y > y) !== (pj.y > y)) &&
        (x < (pj.x - pi.x) * (y - pi.y) / ((pj.y - pi.y) || 1) + pi.x);
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  draw() {
    if (this.knots.length > 0) {
      drawSmoothBezierLoop(this.knots, 0.25);
    }
  }
}

class ImplicitBlob {
  constructor(skeleton, threshold, nParticles) {
    this.S = skeleton;
    this.joints = this.S.joints;
    this.nJoints = this.S.nJoints;
    this.S.computeCentroid();
    this.centroid = this.S.centroid;
    this.centroidX = this.centroid.x;
    this.centroidY = this.centroid.y;
    this.FPArray = this.joints.map((joint) => joint.position);

    this.threshold = threshold;
    this.npts = nParticles;
    this.B = new Blob(5);
    this.xposf = new Array(this.npts);
    this.yposf = new Array(this.npts);
    this.xvelf = new Array(this.npts);
    this.yvelf = new Array(this.npts);
    this.cose = new Array(this.npts);
    this.sine = new Array(this.npts);

    const initialR = 150;
    for (let i = 0; i < this.npts; i++) {
      const t = (i / this.npts) * TWO_PI;
      this.cose[i] = initialR * Math.cos(t);
      this.sine[i] = initialR * Math.sin(t);
    }

    this.h = 0.25;
    this.h6 = this.h / 6.0;
    this.h2 = this.h / 2.0;
    this.K = -50000;
    this.D = 0.0007 * (Math.sqrt(Math.abs(this.K)) * 2.0);
    this.MAX_FORCE = 0.8;
    this.MIN_FORCE = -0.8;

    this.init();
  }

  init() {
    for (let i = 0; i < this.npts; i++) {
      this.xvelf[i] = 0;
      this.yvelf[i] = 0;
      this.xposf[i] = this.centroidX + this.cose[i];
      this.yposf[i] = this.centroidY + this.sine[i];
    }
  }

  calculateError() {
    let maxSep = 0;
    let avgSep = 0;
    for (let i = 1; i < this.npts; i++) {
      const sep = Math.abs(this.xposf[i] - this.xposf[i - 1]) +
        Math.abs(this.yposf[i] - this.yposf[i - 1]);
      avgSep += sep;
      if (sep > maxSep) {
        maxSep = sep;
      }
    }
    avgSep /= this.npts - 1;
    return avgSep === 0 ? 0 : maxSep / avgSep;
  }

  draw() {
    this.B.draw();
  }

  fieldValueAt(px, py) {
    let val = 0;
    for (let j = 0; j < this.nJoints; j++) {
      const dfx = px - this.FPArray[j].x;
      const dfy = py - this.FPArray[j].y;
      const dh = dfx * dfx + dfy * dfy;
      val += 1.0 / (dh || 0.000001);
    }
    return val;
  }

  acceleration(px, py, vx, vy) {
    const val = this.fieldValueAt(px, py);
    const dx = px - this.centroidX;
    const dy = py - this.centroidY;
    const dh = Math.hypot(dx, dy) || 1.0;
    let force = this.K * (this.threshold - val) / dh;
    force = Math.max(this.MIN_FORCE, Math.min(this.MAX_FORCE, force));
    return {
      x: force * dx - this.D * vx,
      y: force * dy - this.D * vy
    };
  }

  move() {
    this.B.clear();
    this.centroidX = this.centroid.x;
    this.centroidY = this.centroid.y;

    for (let i = 0; i < this.npts; i++) {
      const p1x = this.xposf[i];
      const p1y = this.yposf[i];
      const v1x = this.xvelf[i];
      const v1y = this.yvelf[i];
      const g1 = this.acceleration(p1x, p1y, v1x, v1y);

      const v2x = v1x + this.h2 * g1.x;
      const v2y = v1y + this.h2 * g1.y;
      const p2x = p1x + this.h2 * v1x;
      const p2y = p1y + this.h2 * v1y;
      const g2 = this.acceleration(p2x, p2y, v2x, v2y);

      const v3x = v1x + this.h2 * g2.x;
      const v3y = v1y + this.h2 * g2.y;
      const p3x = p1x + this.h2 * v2x;
      const p3y = p1y + this.h2 * v2y;
      const g3 = this.acceleration(p3x, p3y, v3x, v3y);

      const v4x = v1x + this.h * g3.x;
      const v4y = v1y + this.h * g3.y;
      const p4x = p1x + this.h * v3x;
      const p4y = p1y + this.h * v3y;
      const g4 = this.acceleration(p4x, p4y, v4x, v4y);

      this.xposf[i] = p1x + this.h6 * (v1x + 2.0 * v2x + 2.0 * v3x + v4x);
      this.xvelf[i] = v1x + this.h6 * (g1.x + 2.0 * g2.x + 2.0 * g3.x + g4.x);
      this.yposf[i] = p1y + this.h6 * (v1y + 2.0 * v2y + 2.0 * v3y + v4y);
      this.yvelf[i] = v1y + this.h6 * (g1.y + 2.0 * g2.y + 2.0 * g3.y + g4.y);

      this.B.addKnot(this.xposf[i], this.yposf[i]);
    }
  }
}

class Obzok {
  constructor() {
    this.S = new Skeleton();
    this.initx = 300;
    this.inity = 250;
    this.initr = 60;
    this.nDivs = 12;
    this.stalkVector = [];

    this.dang = TWO_PI / this.nDivs;
    const ango = -2.5 * this.dang;
    this.jointSep = Math.sqrt(2.0 * this.initr * this.initr * (1.0 - Math.cos(this.dang)));
    this.linkStrength = 1.0;

    for (let j = 0; j < this.nDivs; j++) {
      const jx = this.initx + this.initr * Math.cos(ango + j * this.dang);
      const jy = this.inity + this.initr * Math.sin(ango + j * this.dang);
      this.S.addJoint(jx, jy);
    }

    const nDh = this.nDivs / 2;
    for (let j = 0; j < this.nDivs; j++) {
      this.S.addLink(j, (j + 1) % this.nDivs, true, this.linkStrength);
      for (let i = 2; i < nDh; i++) {
        this.S.addLink(j, (j + i) % this.nDivs, false, this.linkStrength * 0.05 + this.linkStrength / i);
      }
    }

    this.insertStalk(0, 4);
    this.insertStalk(1, 3);

    const str1 = this.linkStrength * 0.1;
    this.S.addLink(5, 10, false, str1);
    this.S.addLink(7, 10, false, str1);
    this.S.addLink(6, 9, false, str1);
    this.S.addLink(7, 9, false, str1);
    this.S.addLink(6, 11, false, str1);
    this.S.addLink(6, 10, false, str1);
    this.S.addLink(5, 11, false, str1);
    this.S.addWiggleLink(4, 11, false, str1);

    const str2 = this.linkStrength * 2.0;
    this.S.addLink(24, 0, false, str2);
    this.S.addLink(7, 15, false, str2);
    this.S.addLink(14, 16, false, str2);
    this.S.addLink(25, 9, false, str2);
    this.S.addLink(24, 1, false, str2);
    this.S.addLink(13, 16, false, str2);

    this.S.setEyeID(this.S.LEFT_EYE, 2);
    this.S.setEyeID(this.S.RIGHT_EYE, 10);
    this.S.finishConstructing();
  }

  draw() {
    this.S.drawBody(true);
    this.S.drawEyes();
    this.S.drawZees();
    this.S.drawMouth();
  }

  insertStalk(whichDiv, nSegments) {
    whichDiv %= 12;

    let startJointID = whichDiv;
    for (const stalk of this.stalkVector) {
      if (stalk.whichDiv === whichDiv) {
        break;
      } else if (stalk.whichDiv < whichDiv) {
        startJointID += stalk.nSegments * 2;
      }
    }

    let nj = this.S.nJoints;
    let ji = startJointID;
    const str = this.linkStrength * 2.0;
    const prevJ = this.S.joints[(startJointID + nj - 1) % nj];
    const nextJ = this.S.joints[startJointID];
    this.S.flipLinkGender(prevJ, nextJ);

    let jx = prevJ.position.x;
    let jy = prevJ.position.y;
    const cang = (whichDiv - 3) * this.dang;
    const dx = this.jointSep * Math.cos(cang);
    const dy = this.jointSep * Math.sin(cang);

    for (let i = 0; i < nSegments; i++) {
      jx += dx;
      jy += dy;
      nj = this.S.insertJoint(jx, jy, ji);
      this.S.addLink(ji, (ji - 1 + nj) % nj, true, str);
      ji++;
    }

    jx -= dy;
    jy += dx;

    for (let i = 0; i < nSegments; i++) {
      nj = this.S.insertJoint(jx, jy, ji);
      this.S.addLink(ji, ji - 1, true, str);
      if (i > 0) {
        this.S.addLink(ji, ji - (i * 2 + 1), false, str);
        this.S.addLink(ji, ji - (i * 2), false, str);
      }
      this.S.addLink(ji, (ji - ((i + 1) * 2) + nj) % nj, false, str);
      jx -= dx;
      jy -= dy;
      ji++;
    }
    this.S.addLink(ji, ji - 1, true, str);
    this.S.addLink(ji, ji - (nSegments * 2), false, str);

    ji = (startJointID - 1) % nj;
    for (let i = 0; i < nSegments - 1; i++) {
      this.S.addLink((ji + i + nj) % nj, (ji + (2 * nSegments) - (1 + i) + nj) % nj, false, str);
      this.S.addLink((ji + nSegments - i) % nj, (ji + nSegments + 3 + i) % nj, false, str);
    }

    this.stalkVector.push({ whichDiv, nSegments, startJointID });
  }
}

class Skeleton {
  constructor() {
    this.nJoints = 0;
    this.nLinks = 0;
    this.nJointsInv = 0;
    this.joints = [];
    this.links = [];
    this.jointArray = [];
    this.linkArray = [];
    this.jointFPArray = [];
    this.constructed = false;
    this.wiggleLinkID = -1;
    this.randomMovementAmount = 0.5;
    this.wiggleAmount = 0;
    this.wiggleSpeed = 500;
    this.centroid = new FPoint();
    this.B = new Blob(10);
    this.screenXc = 0;
    this.screenYc = 0;
    this.myMouseX = 0;
    this.myMouseY = 0;
    this.orientation = 0;
    this.initialOrientation = 0.25;

    this.lastInteractionTime = millis();
    this.BEDTIME = 8000;
    this.SNORETIME = 10000;
    this.RANDTIME = 6000;

    this.grabJoint = -1;
    this.grabbed = false;
    this.grabOffsetX = 0;
    this.grabOffsetY = 0;
    this.MIN_GRAB_DISTANCE = 30;

    this.LEFT_EYE = 0;
    this.RIGHT_EYE = 1;
    this.leftEyeStartJoint = 0;
    this.rightEyeStartJoint = 0;
    this.leftEyeR = 8;
    this.rightEyeR = 8;
    this.leftPupR = 2;
    this.rightPupR = 2;
    this.leftEyeD = 16;
    this.rightEyeD = 16;
    this.leftPupD = 5;
    this.rightPupD = 5;
    this.SCOPE = 200;
    this.deadpan = true;
    this.deadpanStartTime = millis();
    this.deadpanDuration = 850;
    this.deadpanProbability = 0.0095;
    this.timeToBlink = false;
    this.lastBlinkTime = millis();
    this.minimumBlinkHiatus = 3000;
    this.blinkProbability = 0.05;
    this.eyeColor = [184, 145, 145];
    this.dxml = 0;
    this.dyml = 0;
    this.dxmr = 0;
    this.dymr = 0;

    this.bodyColor = [255, 240, 240];
    this.mouthR = 70;
    this.mouthX = 0;
    this.mouthY = 0;
    this.vx1 = 0;
    this.vy1 = 0;
    this.vx2 = 0;
    this.vy2 = 0;
    this.MOUTH_PTS = 8;
    this.matrix = [];
    this.unc = 500;
    this.generateMouthMatrix();

    this.sleeping = false;
    this.nZees = 10;
    this.zees = [];
    for (let i = 0; i < this.nZees; i++) {
      this.zees.push(new Zparticle(this));
    }
  }

  setScreenCenter(xc, yc) {
    this.mouthX = xc;
    this.screenXc = xc;
    this.mouthY = yc;
    this.screenYc = yc;
  }

  addJoint(x, y) {
    this.joints.push(new Joint(x, y, this.nJoints));
    this.nJoints++;
  }

  insertJoint(x, y, i) {
    this.joints.splice(i, 0, new Joint(x, y, this.nJoints));
    this.nJoints = this.joints.length;
    return this.nJoints;
  }

  addLink(from, toi, onBoundary, strength) {
    this.nJoints = this.joints.length;
    if (from >= 0 && from < this.joints.length && toi >= 0 && toi < this.joints.length && from !== toi) {
      this.links.push(new Link(this.joints[from], this.joints[toi], onBoundary, strength));
      this.nLinks++;
    }
  }

  addWiggleLink(from, toi, onBoundary, strength) {
    this.nJoints = this.joints.length;
    if (from >= 0 && from < this.joints.length && toi >= 0 && toi < this.joints.length && from !== toi) {
      this.links.push(new Link(this.joints[from], this.joints[toi], onBoundary, strength));
      this.wiggleLinkID = this.nLinks;
      this.nLinks++;
    }
  }

  finishConstructing() {
    this.jointArray = this.joints.slice();
    this.jointFPArray = this.jointArray.map((joint) => joint.position);
    this.linkArray = this.links.slice();
    this.nJoints = this.joints.length;
    this.nLinks = this.links.length;
    this.nJointsInv = 1.0 / this.nJoints;
    this.constructed = true;
    this.computeCentroid();
    for (const z of this.zees) {
      z.init();
    }
  }

  flipLinkGender(ji, jj) {
    for (const link of this.links) {
      if ((link.j0 === ji && link.j1 === jj) || (link.j0 === jj && link.j1 === ji)) {
        link.flipBoundary();
        return;
      }
    }
  }

  moveCentroid() {
    const dx = (this.screenXc - this.centroid.x) * 0.05;
    const dy = (this.screenYc - this.centroid.y) * 0.05;
    for (const pos of this.jointFPArray) {
      pos.translate(dx, dy);
    }
  }

  move() {
    const timeSinceInteract = millis() - this.lastInteractionTime;
    const snorefactor = (Math.max(this.BEDTIME, Math.min(timeSinceInteract, this.SNORETIME)) - this.BEDTIME) /
      (this.SNORETIME - this.BEDTIME);

    this.wiggleAmount = 0.5 + 1.25 * snorefactor;
    this.wiggleSpeed = 700;
    if (this.wiggleLinkID >= 0) {
      this.linkArray[this.wiggleLinkID].wiggle(this.wiggleAmount, this.wiggleSpeed);
    }

    this.randomMovementAmount = 0.5 * Math.min(timeSinceInteract, this.RANDTIME) / this.RANDTIME;
    this.moveRandomly();
    this.correctOrientation();

    for (const link of this.linkArray) {
      link.update();
    }
    for (const joint of this.jointArray) {
      joint.update();
    }
  }

  mouseUp() {
    this.clearWireframeOnWake();
    this.lastInteractionTime = millis();
    this.grabbed = false;
    this.grabJoint = -1;
  }

  mouseDown(mx, my) {
    this.clearWireframeOnWake();
    this.lastInteractionTime = millis();
    if (this.grabbed) {
      return;
    }

    this.grabJoint = -1;
    let dist = 99999;
    for (let j = 0; j < this.nJoints; j++) {
      const J = this.jointFPArray[j];
      const dx = J.x - mx;
      const dy = J.y - my;
      const dh = Math.hypot(dx, dy);
      if (dh < dist) {
        dist = dh;
        this.grabJoint = j;
        if (dh <= this.MIN_GRAB_DISTANCE) {
          this.grabOffsetX = 0;
          this.grabOffsetY = 0;
          this.grabbed = true;
        } else {
          this.grabOffsetX = dx;
          this.grabOffsetY = dy;
        }
      }
    }

    if (!this.grabbed && this.B.pointWithin(mx, my)) {
      this.grabbed = true;
    }
  }

  mouseDrag(mx, my) {
    this.clearWireframeOnWake();
    this.lastInteractionTime = millis();
    if (this.grabbed && this.grabJoint > -1) {
      this.jointArray[this.grabJoint].moveTowards(mx + this.grabOffsetX, my + this.grabOffsetY);
      this.grabOffsetX *= 0.96;
      this.grabOffsetY *= 0.96;
    }
  }

  mouseMove(mx, my) {
    if ((this.myMouseX - mx) !== 0 || (this.myMouseY - my) !== 0) {
      this.clearWireframeOnWake();
      this.lastInteractionTime = millis();
    }
    this.myMouseY = my;
    this.myMouseX = mx;
    this.grabbed = false;
    this.grabJoint = -1;
  }

  clearWireframeOnWake() {
    if (this.sleeping || millis() - this.lastInteractionTime > this.BEDTIME) {
      bDrawAsWireframe = false;
    }
  }

  moveRandomly() {
    if (this.randomMovementAmount <= 0) {
      return;
    }

    for (const J of this.jointFPArray) {
      J.x += this.randomMovementAmount * (Math.random() - 0.5);
      J.y += this.randomMovementAmount * (Math.random() - 0.5);
    }
  }

  computeCentroid() {
    if (this.nJoints > 0) {
      let x = 0;
      let y = 0;
      for (const pos of this.jointFPArray) {
        x += pos.x;
        y += pos.y;
      }
      this.centroid.set(x * this.nJointsInv, y * this.nJointsInv);
    }
    return this.centroid;
  }

  correctOrientation() {
    if (!this.jointFPArray[20]) {
      return;
    }
    const dang = 0.03 * (this.orientation - this.initialOrientation);
    const dx = this.centroid.x - this.jointFPArray[20].x;
    const dy = this.centroid.y - this.jointFPArray[20].y;
    this.jointArray[20].addDisplacement(dy * dang, -dx * dang);
  }

  drawBody(bFill) {
    if (bFill) {
      noStroke();
      fill(...this.bodyColor);
    } else {
      strokeWeight(2);
      stroke(...this.bodyColor);
      noFill();
    }

    this.B.clear();
    for (const p of this.jointFPArray) {
      this.B.addKnot(p);
    }
    this.B.draw();
    strokeWeight(1);
  }

  drawStructure() {
    for (const joint of this.jointArray) {
      joint.draw();
    }
    for (const link of this.linkArray) {
      link.draw();
    }
  }

  setEyeID(whichEye, whichJoint) {
    if (whichEye === this.LEFT_EYE) {
      this.leftEyeStartJoint = whichJoint;
      this.leftEyeR = 8;
      this.leftEyeD = this.leftEyeR * 2;
      this.leftPupR = this.leftEyeR * 0.25;
      this.leftPupD = this.leftPupR * 2 + 1;
    } else if (whichEye === this.RIGHT_EYE) {
      this.rightEyeStartJoint = whichJoint;
      this.rightEyeR = 8;
      this.rightEyeD = this.rightEyeR * 2;
      this.rightPupR = this.rightEyeR * 0.25;
      this.rightPupD = this.rightPupR * 2 + 1;
    }
  }

  drawEyes() {
    strokeWeight(1);

    let Lx = 0;
    let Ly = 0;
    let Rx = 0;
    let Ry = 0;
    for (let i = 0; i < 4; i++) {
      const Lj = this.jointFPArray[this.leftEyeStartJoint + i];
      const Rj = this.jointFPArray[this.rightEyeStartJoint + i];
      Lx += Lj.x;
      Ly += Lj.y;
      Rx += Rj.x;
      Ry += Rj.y;
    }
    Lx /= 4.0;
    Ly /= 4.0;
    Rx /= 4.0;
    Ry /= 4.0;

    this.orientation = Math.PI * 0.5 + Math.atan2(((Ly + Ry) * 0.5) - this.centroid.y, ((Lx + Rx) * 0.5) - this.centroid.x);

    noStroke();
    fill(255, 255, 255);
    ellipse(Lx, Ly, this.leftEyeD, this.leftEyeD);
    ellipse(Rx, Ry, this.rightEyeD, this.rightEyeD);

    noFill();
    stroke(...this.eyeColor);
    ellipse(Lx, Ly, this.leftEyeD, this.leftEyeD);
    ellipse(Rx, Ry, this.rightEyeD, this.rightEyeD);

    let lookXl = 0;
    let lookYl = 0;
    let lookXr = 0;
    let lookYr = 0;
    const now = millis();
    if (now < 1000) {
      fill(...this.eyeColor);
      ellipse(Lx, Ly, this.leftPupD, this.leftPupD);
      ellipse(Rx, Ry, this.rightPupD, this.rightPupD);
      return;
    }

    if (this.deadpan) {
      if ((now - this.deadpanStartTime) > this.deadpanDuration) {
        this.deadpan = false;
      }
    } else {
      lookXl = this.myMouseX - Lx;
      lookYl = this.myMouseY - Ly;
      lookXr = this.myMouseX - Rx;
      lookYr = this.myMouseY - Ry;
      if (Math.random() < this.deadpanProbability && (now - this.deadpanStartTime) > this.deadpanDuration * 2) {
        this.deadpanStartTime = now;
        this.deadpan = true;
      }
    }

    const elapsed = now - this.lastInteractionTime;
    if (elapsed > this.BEDTIME) {
      this.timeToBlink = true;
      if (!this.sleeping) {
        for (const z of this.zees) {
          z.init();
        }
      }
      this.sleeping = true;
    } else if ((now - this.lastBlinkTime) > this.minimumBlinkHiatus && Math.random() < this.blinkProbability) {
      this.timeToBlink = true;
      this.lastBlinkTime = now;
      this.sleeping = false;
    } else {
      this.timeToBlink = false;
      if (this.sleeping) {
        bDrawAsWireframe = false;
        initIBs();
      }
      this.sleeping = false;
    }

    strokeWeight(1);
    stroke(this.eyeColor[0], this.eyeColor[1], this.eyeColor[2], 128);
    fill(...this.eyeColor);
    if (this.timeToBlink) {
      const bdl = this.blinkVector(Lx, Ly, this.leftEyeR);
      const bdr = this.blinkVector(Rx, Ry, this.rightEyeR);
      line(Lx - bdl.cos, Ly + bdl.sin, Lx + bdl.cos, Ly - bdl.sin);
      line(Rx - bdr.cos, Ry + bdr.sin, Rx + bdr.cos, Ry - bdr.sin);
    } else {
      this.dxml = 0.5 * (this.dxml + lookXl);
      this.dyml = 0.5 * (this.dyml + lookYl);
      const leftPupil = this.pupilOffset(this.dxml, this.dyml, this.leftEyeR);

      this.dxmr = 0.5 * (this.dxmr + lookXr);
      this.dymr = 0.5 * (this.dymr + lookYr);
      const rightPupil = this.pupilOffset(this.dxmr, this.dymr, this.rightEyeR);

      ellipse(Lx + leftPupil.x, Ly + leftPupil.y, this.leftPupD, this.leftPupD);
      ellipse(Rx + rightPupil.x, Ry + rightPupil.y, this.rightPupD, this.rightPupD);
    }
  }

  blinkVector(x, y, r) {
    const dx = x - this.centroid.x;
    const dy = y - this.centroid.y;
    const scale = r / (Math.hypot(dx, dy) || 1);
    return {
      cos: dy * scale,
      sin: dx * scale
    };
  }

  pupilOffset(dx, dy, eyeR) {
    const dh = Math.hypot(dx, dy);
    if (dh === 0) {
      return { x: 0, y: 0 };
    }
    const view = (Math.min(dh, this.SCOPE) / this.SCOPE) * (eyeR * 0.6) / dh;
    return {
      x: dx * view,
      y: dy * view
    };
  }

  generateMouthMatrix() {
    this.matrix = [];
    for (let p = 0; p < this.MOUTH_PTS; p++) {
      const bt = p / (this.MOUTH_PTS - 1);
      const bt2 = bt * bt;
      const onemt = 1.0 - bt;
      const onemt2 = onemt * onemt;
      this.matrix[p] = [
        bt * bt2,
        onemt * onemt2,
        bt * onemt2 * 3.0,
        bt2 * onemt * 3.0
      ];
    }
  }

  drawMouth() {
    stroke(...this.eyeColor);
    this.mouthX = 0.5 * this.mouthX + 0.25 * (this.centroid.x + this.jointFPArray[20].x);
    this.mouthY = 0.5 * this.mouthY + 0.25 * (this.centroid.y + this.jointFPArray[20].y);

    const mood = obzokError;
    const cm = (11 + mood) * Math.cos(this.orientation);
    const sm = (11 + mood) * Math.sin(this.orientation);
    const ux0 = this.mouthX - cm;
    const uy0 = this.mouthY - sm;
    const ux3 = this.mouthX + cm;
    const uy3 = this.mouthY + sm;

    const hist = 0.99;
    const hinv = 1.0 - hist;
    const kist = 0.10;
    const kinv = 1.0 - kist;
    if (this.grabbed) {
      if (this.grabJoint <= 15) {
        this.unc += Math.random() * 10.0;
        const sint = kinv * 0.5 * Math.sin((millis() + this.unc) / 2000.0);
        this.vx1 = kist * this.vx1 - sm * sint;
        this.vy1 = kist * this.vy1 + cm * sint;
        this.vx2 = kist * this.vx2 + sm * sint;
        this.vy2 = kist * this.vy2 - cm * sint;
      } else {
        this.vx1 = hist * this.vx1 - hinv * sm * 0.5;
        this.vy1 = hist * this.vy1 + hinv * cm * 0.5;
        this.vx2 = hist * this.vx2 - hinv * sm * 0.5;
        this.vy2 = hist * this.vy2 + hinv * cm * 0.5;
      }
    } else {
      this.vx1 = hist * this.vx1 - hinv * sm * 0.1;
      this.vy1 = hist * this.vy1 + hinv * cm * 0.1;
      this.vx2 = hist * this.vx2 - hinv * sm * 0.1;
      this.vy2 = hist * this.vy2 + hinv * cm * 0.1;
    }

    const ux1 = ux0 + 0.33 * (ux3 - ux0) + this.vx1;
    const uy1 = uy0 + 0.33 * (uy3 - uy0) + this.vy1;
    const ux2 = ux0 + 0.66 * (ux3 - ux0) + this.vx2;
    const uy2 = uy0 + 0.66 * (uy3 - uy0) + this.vy2;

    let x0 = ux0;
    let y0 = uy0;
    strokeWeight(1.5);
    for (let p = 1; p < this.MOUTH_PTS; p++) {
      if (p === 1 || p === this.MOUTH_PTS - 1) {
        strokeWeight(1.5);
      } else {
        strokeWeight(1.25);
      }
      const M = this.matrix[p];
      const x1 = M[1] * ux0 + M[2] * ux1 + M[3] * ux2 + M[0] * ux3;
      const y1 = M[1] * uy0 + M[2] * uy1 + M[3] * uy2 + M[0] * uy3;
      line(x0, y0, x1, y1);
      x0 = x1;
      y0 = y1;
    }
    strokeWeight(1);
  }

  drawZees() {
    if (this.sleeping) {
      fill(...this.bodyColor);
      for (const z of this.zees) {
        z.draw();
        z.move();
      }
    }
  }
}

class Zparticle {
  constructor(skeleton) {
    this.S = skeleton;
    this.position = new FPoint();
    this.velocity = new FPoint();
    this.fx = 0;
    this.fy = 0;
    this.init();
  }

  init() {
    this.position.set(this.S.centroid.x, this.S.centroid.y);
    this.velocity.clear();
  }

  move() {
    this.fx = (this.fx + (Math.random() - 0.50)) * 0.5;
    this.fy = (this.fy + (Math.random() - 0.70)) * 0.5;
    this.velocity.scale(0.9);
    this.velocity.translate(this.fx, this.fy);
    this.position.translate(this.velocity);
    if (this.position.y < 0) {
      this.init();
    }
  }

  draw() {
    stroke(255, 240, 240, 144);
    noFill();
    ellipse(this.position.x, this.position.y, 7, 7);
  }
}
