/*
 * ◯⟷△ №.04
 * Interpolation From a Circle to an Equilateral Triangle (#04)
 * "By considering it as a set of alternating straight lines
 * and arcs, in which the arcs shrink while the lines grow."
 * Page Four of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 720 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=25m02s).
 * NFT created in 2021 for #Sketch4Processing, and minted by
 * KT1TaPfAuhmnyo6Le6zKe17opvFCsTxk1VN7 (golan_x_processingorg).
 * Per contract, 20% of all sales are donated to @ProcessingOrg.
 *
 * References:
 * - Joseph Choma, "Morphing: A Guide to Mathematical
 * Transformations for Architects and Designers", 2015.
 * - Guus Craenen and Adrian Häne, "Fruit Salad", 1970.
 * - CTG Japan (Masao Kohmura, Koji Fujino, Makoto Ohtake),
 * "Running Cola is Africa!", 1968.
 * - Wassily Kandinsky, "Point and Line to Plane", 1926.
 * - William Kolomyjec, "Banana Cone", 1970-1975.
 * - Jürg Lehni and Wilm Thoben, "Footnotes from the History
 * of Two Cultures: Mitsuo Katsui", 2015.
 * - Manfred Mohr, "P-112 / Lady Quark", 1972.
 * - Bruno Munari, "Square Circle Triangle", 1960-1976.
 * - Charles Philipon, "Les Poires", 1831.
 * - Troika, "Squaring the Circle"; "Dark Matter", 2013-2014.
 * - Wucius Wong, "Principles of Two-Dimensional Design", 1972.
 * - Yuki Yoshida, "A Book of drawCircle()", 2014.
 */

var radius;
var trianglePoints = [];
var bShowDebug;
var nFrames = 360;
var nLoops = 2;
var theta;
var strokeCol1;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol1 = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);
  radius = (width / 2) * 0.75;

  for (var i = 0; i < 3; i++) {
    var x = radius * cos((i * TWO_PI) / 3.0 - HALF_PI);
    var y = radius * sin((i * TWO_PI) / 3.0 - HALF_PI);
    trianglePoints[i] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  noFill();

  var t = ((frameCount / nLoops) % nFrames) / nFrames;
  theta = TWO_PI * t;

  push();
  translate(width / 2, height / 2);
  rotate(PI);

  var currentRadii01 = 0.5 + 0.5 * sin(theta);
  var rad = currentRadii01 * radius;
  if (cos(theta) > 0) scale(-1, 1);

  var nPointsInArc = 60;
  strokeJoin(currentRadii01 < 0.002 ? ROUND : MITER);
  stroke(strokeCol1);
  strokeWeight(ceil(width * 0.01));
  beginShape();
  for (var i = 0; i < 3; i++) {
    var px = 0 - map(currentRadii01, 0, 1, trianglePoints[i].x, 0);
    var py = 0 - map(currentRadii01, 0, 1, trianglePoints[i].y, 0);

    var ang1 = ((i + 1) * TWO_PI) / 3 + HALF_PI / 3 + PI;
    var ang2 = ((i + 2) * TWO_PI) / 3 + HALF_PI / 3 + PI;
    for (var j = 0; j <= nPointsInArc; j++) {
      var t = map(j, 0, nPointsInArc, ang1, ang2);
      var ax = px + rad * cos(t);
      var ay = py + rad * sin(t);
      vertex(ax, ay);
    }
  }
  endShape(CLOSE);

  bShowDebug = theta <= TWO_PI * 0.25 || theta >= TWO_PI * 0.75;
  if (bShowDebug) {
    var t2 = (theta + PI * 1.5) % TWO_PI;
    var alph = 0.5 - 0.5 * cos(t2);
    stroke(24, 14, 6, 128 * pow(alph, 0.333));
    strokeWeight(width / 1024.0);

    for (var i = 0; i < 3; i++) {
      var px = 0 - map(currentRadii01, 0, 1, trianglePoints[i].x, 0);
      var py = 0 - map(currentRadii01, 0, 1, trianglePoints[i].y, 0);
      var qx = 0 - map(currentRadii01, 0, 1, trianglePoints[(i + 1) % 3].x, 0);
      var qy = 0 - map(currentRadii01, 0, 1, trianglePoints[(i + 1) % 3].y, 0);
      line(px, py, qx, qy);

      var ang1 = ((i + 1) * TWO_PI) / 3 + HALF_PI / 3 + PI;
      var ang2 = ((i + 2) * TWO_PI) / 3 + HALF_PI / 3 + PI;
      var ax = px + rad * cos(ang1);
      var ay = py + rad * sin(ang1);
      line(ax, ay, px, py);
      var bx = px + rad * cos(ang2);
      var by = py + rad * sin(ang2);
      line(bx, by, px, py);
    }
  }
  pop();
}
