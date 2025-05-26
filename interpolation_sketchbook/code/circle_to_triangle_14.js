/*
 * ◯⟷△ №.14
 * Interpolation From a Circle to an Equilateral Triangle (#14)
 * "By approximating a circle with three Bézier cubic splines
 * and modulating the spline control points."
 * Page Fourteen of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 *
 * Animated GIF, 1024x1024, 720 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=1075s).
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
var bShowDebug;
var backgrCol;
var strokeCol1;
var strokeCol2;
var nFrames = 720;
var nLoops = 2;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);

  backgrCol = color(253, 247, 241);
  strokeCol1 = color(24, 14, 6, 255);
  strokeCol2 = color(24, 14, 6, 128);

  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 3; i++) {
    // triangle vertices
    var x = cx + radius * cos((i * TWO_PI) / 3.0 - HALF_PI);
    var y = cy + radius * sin((i * TWO_PI) / 3.0 - HALF_PI);
    trianglePoints[i] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  strokeCap(ROUND);
  strokeJoin(ROUND);

  var progress = (frameCount % nFrames) / nFrames;
  var theta = TWO_PI * progress * 2.0 + PI;
  var bShowDebug = progress > 0.5;

  var wiggle = 0.5 * (1 + cos(theta));
  var amount = 0.77 * wiggle; // magic number

  for (var i = 0; i < 3; i++) {
    var p0x = trianglePoints[i].x;
    var p0y = trianglePoints[i].y;
    var p3x = trianglePoints[(i + 2) % 3].x;
    var p3y = trianglePoints[(i + 2) % 3].y;
    var p1x = p0x + amount * (p0y - cy);
    var p1y = p0y - amount * (p0x - cx);
    var p2x = p3x - amount * (p3y - cy);
    var p2y = p3y + amount * (p3x - cx);

    noFill();
    stroke(strokeCol1);
    strokeWeight(ceil(width * 0.01));
    bezier(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);

    if (bShowDebug) {
      var u = width / 1024.0;
      stroke(strokeCol2);
      strokeWeight(u);
      fill(strokeCol2);
      circle(p1x, p1y, 6 * u);
      circle(p2x, p2y, 6 * u);
      line(p0x, p0y, p1x, p1y);
      line(p3x, p3y, p2x, p2y);
      noFill();
    }
  }
}
