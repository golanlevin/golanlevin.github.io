/*
 * ◯⟷△ №.09
 * Interpolation From a Circle to an Equilateral Triangle (#09)
 * "By progressively rendering it as a 3-gon, 6-gon, 12-gon,
 * 24-gon, 48-gon, etcetera, with smooth interpolations."
 * Page Nine of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 653 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=17m7s).
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
var nCirclePoints = 3;
var nPows = 5;
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
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol);
  strokeJoin(MITER);
  strokeWeight(ceil(width * 0.01));

  push();
  translate(width / 2, height / 2);

  var fracOverall = (frameCount % nFrames) / nFrames;
  var frac = (fracOverall * (nPows * 2)) % 1.0;
  var t = floor(fracOverall * (nPows * 2)) % nPows; // 0,1,2,3,4,0,1,2,3,4...
  var direction = floor(fracOverall * 2.0) % 2; // 0,1,0,1...

  var tupow = 3 * floor(pow(2, t)); // 3,6,12,24,48...
  var utpow = 3 * floor(pow(2, nPows - t - 1)); // 48,24,12,6,3...
  var bitupow = direction === 0 ? tupow : utpow;
  var tfrac = direction === 0 ? frac : 1.0 - frac;
  tfrac = pow(tfrac, 3.0);

  beginShape();
  nCirclePoints = 2 * bitupow;
  for (var i = 0; i <= nCirclePoints + 1; i++) {
    // for good shape closure
    if (i % 2 === 0) {
      // the corner vertices
      var angle = map(i, 0, nCirclePoints, 0, TWO_PI) - HALF_PI;
      var px = radius * cos(angle);
      var py = radius * sin(angle);
      vertex(px, py);
    } else {
      // the halfway vertices
      var angleA = map(i - 1, 0, nCirclePoints, 0, TWO_PI) - HALF_PI;
      var angleB = map(i + 0, 0, nCirclePoints, 0, TWO_PI) - HALF_PI;
      var angleC = map(i + 1, 0, nCirclePoints, 0, TWO_PI) - HALF_PI;

      var pxA = radius * cos(angleA);
      var pyA = radius * sin(angleA);
      var pxB = radius * cos(angleB);
      var pyB = radius * sin(angleB);
      var pxC = radius * cos(angleC);
      var pyC = radius * sin(angleC);

      // points halfway between flanking vertices:
      var pxAC = (pxA + pxC) / 2;
      var pyAC = (pyA + pyC) / 2;

      var px = map(tfrac, 0, 1, pxAC, pxB);
      var py = map(tfrac, 0, 1, pyAC, pyB);
      vertex(px, py);
    }
  }
  endShape(CLOSE);
  pop();
}
