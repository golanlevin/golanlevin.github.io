/*
 * ◯⟷△ №.01
 * Interpolation From a Circle to an Equilateral Triangle (#01)
 * "In which a circle is treated as a (rounded) triangle,
 * whose rounded corners have a dynamic radius."
 * Page One of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 *
 * Animated GIF, 1024x1024, 720 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=20m6s).
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
var cx, cy;
var trianglePoints = [];
var currentRadii01;
var nFrames = 360;
var nLoops = 2;
var theta;
var strokeCol1;
var strokeCol2;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol1 = color(24, 14, 6, 255);
  strokeCol2 = color(24, 14, 6, 96);
  backgrCol = color(253, 247, 241);

  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 3; i++) {
    var x = cx + radius * cos((i * TWO_PI) / 3.0 - HALF_PI);
    var y = cy + radius * sin((i * TWO_PI) / 3.0 - HALF_PI);
    trianglePoints[i] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol1);
  strokeJoin(ROUND);

  var strw = ceil(width * 0.01);
  strokeWeight(strw);

  theta = (TWO_PI * ((frameCount / nLoops) % nFrames)) / nFrames;
  currentRadii01 = 0.5 - 0.5 * cos(theta * nLoops);
  var rad = currentRadii01 * radius;

  beginShape();
  for (var i = 0; i < 3; i++) {
    var px = map(currentRadii01, 0, 1, trianglePoints[i].x, cx);
    var py = map(currentRadii01, 0, 1, trianglePoints[i].y, cy);

    var ang1 = ((i + 1) * TWO_PI) / 3.0 + HALF_PI;
    var ang2 = ((i + 2) * TWO_PI) / 3.0 + HALF_PI;
    var dang = (ang2 - ang1) / 60.0;
    for (var t = ang1; t <= ang2; t += dang) {
      var ax = px + rad * cos(t);
      var ay = py + rad * sin(t);
      vertex(ax, ay);
    }
  }
  endShape(CLOSE);
  drawDebug();
}

function drawDebug() {
  if (theta > TWO_PI / nLoops) {
    var strw = width / 1024.0;
    strokeWeight(strw);
    stroke(strokeCol2);
    for (var i = 0; i < 3; i++) {
      var px = map(currentRadii01, 0, 1, trianglePoints[i].x, cx);
      var py = map(currentRadii01, 0, 1, trianglePoints[i].y, cy);
      var ang1 = ((i + 1) * TWO_PI) / 3.0 + HALF_PI;
      var ang2 = ((i + 2) * TWO_PI) / 3.0 + HALF_PI;

      var ax = px + currentRadii01 * radius * cos(ang1);
      var ay = py + currentRadii01 * radius * sin(ang1);
      line(px, py, ax, ay);

      var bx = px + currentRadii01 * radius * cos(ang2);
      var by = py + currentRadii01 * radius * sin(ang2);
      line(px, py, bx, by);
    }
  }
}