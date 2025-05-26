/*
 * ◯⟶△ №.05
 * Interpolation From a Circle to an Equilateral Triangle (#05)
 * "By sampling a circle into many segments, and then locally
 * averaging (blurring) each point with its neighbors,
 * except for the three special corner vertices."
 * Page Five of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * Note: this morph is monodirectional.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 701 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=13m29s).
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
var nCirclePoints = 120;
var circlePoints = [];
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
  init();
}

function init() {
  for (var i = 0; i < nCirclePoints; i++) {
    var t = map(i, 0, nCirclePoints, 0, TWO_PI) - HALF_PI;
    var x = cx + radius * cos(t);
    var y = cy + radius * sin(t);
    circlePoints[i] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol1);
  strokeJoin(MITER);
  strokeWeight(ceil(width * 0.01));

  // Average points with their neighbors.
  // Pause for 20 frames; then do two passes.
  // Restart the animation after 720 frames.
  var fc = frameCount % nFrames;
  if (fc == 0) init();
  if (fc > 20) {
    for (var k = 0; k < 2; k++) {
      for (var i = 0; i < nCirclePoints; i++) {
        if (i % (nCirclePoints / 3) !== 0) {
          var h = (i - 1 + nCirclePoints) % nCirclePoints;
          var j = (i + 1 + nCirclePoints) % nCirclePoints;
          var hx = circlePoints[h].x;
          var hy = circlePoints[h].y;
          var ix = circlePoints[i].x;
          var iy = circlePoints[i].y;
          var jx = circlePoints[j].x;
          var jy = circlePoints[j].y;
          circlePoints[i].x = (hx + ix + jx) / 3.0;
          circlePoints[i].y = (hy + iy + jy) / 3.0;
        }
      }
    }
  }

  beginShape(); // Render the shape.
  for (var i = 0; i < nCirclePoints; i++) {
    vertex(circlePoints[i].x, circlePoints[i].y);
  }
  endShape(CLOSE);
}
