/*
 * ◯⟷△ №.10
 * Interpolation From a Circle to an Equilateral Triangle (#10)
 * "By treating points along the perimeter as a series
 * of springy particles."
 * Page Ten of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 720 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=24m26s).
 * NFT created in 2021 for #Sketch4Processing, and minted by
 * KT1TaPfAuhmnyo6Le6zKe17opvFCsTxk1VN7 (golan_x_processingorg).
 * Per contract, 20% of all sales are donated to @ProcessingOrg.
 *
 * References:
 * - Guus Craenen and Adrian Häne, "Fruit Salad", 1970.
 * - Wassily Kandinsky, "Point and Line to Plane", 1926.
 * - Jürg Lehni and Wilm Thoben, "Footnotes from the History
 * of Two Cultures: Mitsuo Katsui", 2015.
 * - Manfred Mohr, "P-112 / Lady Quark", 1972.
 * - Bruno Munari, "Square Circle Triangle", 1960-1976.
 * - Troika, "Squaring the Circle"; "Dark Matter", 2013-2014.
 * - Wucius Wong, "Principles of Two-Dimensional Design", 1972.
 * - Yuki Yoshida, "A Book of drawCircle()", 2014.
 */

var nPts, third, offset;
var radius;
var cx, cy;
var trianglePts = [];
var srcPts = [];
var dstPts = [];
var targetPts = [];
var particles = [];
var target = 0;
var DAMPING = 0.96;
var MASS = 10;
var THRESH = 14.0;
var strokeCol;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);

  nPts = 60;
  third = nPts / 3;
  offset = nPts / 12;
  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 3; i++) {
    var x = cx + radius * cos((i * TWO_PI) / 3.0 - HALF_PI);
    var y = cy + radius * sin((i * TWO_PI) / 3.0 - HALF_PI);
    trianglePts[i] = { x, y };
  }

  // compute srcPts: points on the circle
  for (var j = 0; j < nPts; j++) {
    var t = map(j, 0, nPts, 0, TWO_PI);
    var x = cx + radius * cos(t);
    var y = cy + radius * sin(t);
    srcPts[j] = { x, y };
  }

  // compute dstPts: points along the triangle
  for (var j = 0; j < nPts; j++) {
    var i = (floor((j + nPts - offset) / third) + 1) % 3;
    var p1x = trianglePts[i % 3].x;
    var p1y = trianglePts[i % 3].y;
    var p2x = trianglePts[(i + 1) % 3].x;
    var p2y = trianglePts[(i + 1) % 3].y;

    var jt = (j + nPts - (offset - 0)) % third;
    var x = map(jt, 0, third, p1x, p2x);
    var y = map(jt, 0, third, p1y, p2y);
    targetPts[j] = dstPts[j] = { x, y };
  }

  for (var j = 0; j < nPts; j++) {
    var px = srcPts[j].x;
    var py = srcPts[j].y;
    particles[j] = new Particle(px, py, 0, 0);
  }
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol);
  strokeWeight(ceil(width * 0.01));

  var error = 0;
  for (var j = 0; j < nPts; j++) {
    var px = particles[j].px;
    var py = particles[j].py;
    var tx = targetPts[j].x;
    var ty = targetPts[j].y;
    var dx = tx - px;
    var dy = ty - py;
    var dh = sqrt(dx * dx + dy * dy);
    error += dh;
    if (dh > 0) {
      particles[j].applyForce(dx / dh, dy / dh);
    }
  }
  if (error < THRESH) {
    flipTarget();
  }

  var F = 0.5;
  for (var j = 0; j < nPts; j++) {
    var ix = particles[(j - 1 + nPts) % nPts].px;
    var iy = particles[(j - 1 + nPts) % nPts].py;
    var jx = particles[j % nPts].px;
    var jy = particles[j % nPts].py;
    var kx = particles[(j + 1 + nPts) % nPts].px;
    var ky = particles[(j + 1 + nPts) % nPts].py;
    var ijdx = ix - jx;
    var ijdy = iy - jy;
    var ijdh = sqrt(ijdx * ijdx + ijdy * ijdy);
    if (ijdh > 0) {
      var ifx = (ijdx / ijdh) * F;
      var ify = (ijdy / ijdh) * F;
      particles[j].applyForce(ifx, ify);
    }
    var kjdx = kx - jx;
    var kjdy = ky - jy;
    var kjdh = sqrt(kjdx * kjdx + kjdy * kjdy);
    if (kjdh > 0) {
      var kfx = (kjdx / kjdh) * F;
      var kfy = (kjdy / kjdh) * F;
      particles[j].applyForce(kfx, kfy);
    }
  }

  for (var j = 0; j < nPts; j++) {
    particles[j].update();
  }

  var ofs = 2;
  beginShape();
  var px = particles[ofs % nPts].px;
  var py = particles[ofs % nPts].py;
  curveVertex(px, py);
  for (var j = 0; j < nPts; j++) {
    px = particles[(j + ofs) % nPts].px;
    py = particles[(j + ofs) % nPts].py;
    curveVertex(px, py);
  }
  endShape(CLOSE);
}

function flipTarget() {
  for (var j = 0; j < nPts; j++) {
    x = target === 1 ? dstPts[j].x : srcPts[j].x;
    y = target === 1 ? dstPts[j].y : srcPts[j].y;
    targetPts[j] = { x, y };
  }
  target = 1 - target;
}

function Particle(px, py, vx, vy) {
  this.px = px;
  this.py = py;
  this.vx = vx;
  this.vy = vy;

  this.applyForce = function (fx, fy) {
    this.vx += fx / MASS;
    this.vy += fy / MASS;
  };
  this.update = function () {
    this.vx *= DAMPING;
    this.vy *= DAMPING;
    this.px += this.vx;
    this.py += this.vy;
  };
}
