/*
 * ◯⟷△ №.08
 * Interpolation From a Circle to an Equilateral Triangle (#08)
 * "By treating the circle as a multisided polygon
 * whose number of sides gradually decreases to three."
 * Page Eight of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 668 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=16m19s).
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
var nFrames = 720;
var strokeCol;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);

  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol);
  strokeJoin(MITER);
  strokeWeight(ceil(width * 0.01));

  var maxSides = 60;
  var minSides = 3;

  var theta = (TWO_PI * (frameCount % nFrames)) / nFrames;
  var t = 0.5 - 0.5 * cos(theta);
  t = pow(t, 0.333333);

  var nSidesf = constrain(
    map(t, 0, 1, maxSides, minSides - 0.25),
    minSides,
    maxSides
  );
  var nSidesi = ceil(nSidesf);
  var dang = TWO_PI / nSidesf;
  var ang = HALF_PI + (TWO_PI - (nSidesi - 1) * dang) / 2.0;
  if (nSidesi % 2 === 0) {
    ang -= dang / 2.0;
  }

  beginShape();
  for (var i = 0; i < nSidesi; i++) {
    var px = cx + radius * cos(ang);
    var py = cy + radius * sin(ang);
    vertex(px, py);
    ang += dang;
  }
  endShape(CLOSE);
}
