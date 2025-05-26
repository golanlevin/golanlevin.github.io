/*
 * ◯⟷△ №.03
 * Interpolation From a Circle to an Equilateral Triangle (#03)
 * "By gradually flattening a circle on three sides."
 * Page Three of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 718 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=23m37s).
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
var TWO_THIRDS_PI;
var bShowDebug;
var nFrames = 360;
var nLoops = 2;
var theta;
var angularAmount;
var strokeCol1;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol1 = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);

  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;
  TWO_THIRDS_PI = TWO_PI / 3.0;
  bShowDebug = false;
}

function draw() {
  background(backgrCol);
  noFill();
  strokeJoin(ROUND);
  stroke(strokeCol1);
  strokeWeight(ceil(width * 0.01));

  var t = ((frameCount / nLoops) % nFrames) / nFrames;
  theta = TWO_PI * t * nLoops;
  angularAmount = pow(0.5 + 0.5 * cos(theta), 2.0);

  // Draw vertices along three concentric arcs, subtending variable
  // angular amounts. Connect the arcs by straight lines.
  var nArcPoints = 60;
  beginShape();
  for (var j = 0; j < 3; j++) {
    for (var i = 0; i <= nArcPoints; i++) {
      var angCenter = (j + 0.5) * TWO_THIRDS_PI;
      var angA = angCenter - angularAmount * 0.5 * TWO_THIRDS_PI;
      var angB = angCenter + angularAmount * 0.5 * TWO_THIRDS_PI;
      var t = map(i, 0, nArcPoints, angA, angB) + HALF_PI;
      var px = cx + radius * cos(t);
      var py = cy + radius * sin(t);
      vertex(px, py);
    }
  }
  endShape(CLOSE);

  drawDebug();
}

function drawDebug() {
  var t2 = (theta + PI) % (TWO_PI * 2);
  if (t2 < TWO_PI) {
    var alph = 0.5 - 0.5 * cos(t2);
    stroke(24, 14, 6, 128 * pow(alph, 0.333));
    strokeWeight(width / 1024.0);

    for (var j = 0; j < 3; j++) {
      var angCenter = (j + 0.5) * TWO_THIRDS_PI;
      var angA = angCenter - angularAmount * 0.5 * TWO_THIRDS_PI + HALF_PI;
      var angB = angCenter + angularAmount * 0.5 * TWO_THIRDS_PI + HALF_PI;

      var px = cx + radius * cos(angA);
      var py = cy + radius * sin(angA);
      line(cx, cy, px, py);

      var qx = cx + radius * cos(angB);
      var qy = cy + radius * sin(angB);
      line(cx, cy, qx, qy);
    }
  }
}
