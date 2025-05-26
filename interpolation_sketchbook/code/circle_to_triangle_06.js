/*
 * ◯⟷△ №.06
 * Interpolation From a Circle to an Equilateral Triangle (#06)
 * "By progressively deleting all vertices along a
 * resampled circle, except for three special vertices,
 * which constitute the triangle's corners."
 * Page Six of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 458 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=14m40s).
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

var xpoints = [];
var ypoints = [];
var nCirclePoints = 180;
var nFrames = 4 * nCirclePoints;
var corners = [];
var radius;
var editIndex;
var strokeCol1;
var backgrCol;
var theta;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol1 = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);
  radius = (width / 2) * 0.75;

  var corner1 = (1 * nCirclePoints) / 3;
  var corner2 = (2 * nCirclePoints) / 3;
  var corner3 = (3 * nCirclePoints) / 3;
  corners = [corner1, corner2, corner3];
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol1);
  strokeJoin(MITER);
  strokeWeight(ceil(width * 0.01));

  push();
  translate(width / 2, height / 2);
  rotate(-HALF_PI);
  beginShape();
  for (var i = 0; i < xpoints.length; i++) {
    var px = xpoints[i];
    var py = ypoints[i];
    vertex(px, py);
  }
  endShape(CLOSE);
  drawDebug();
  pop();

  var frameFrac = (frameCount % nFrames) / nFrames;
  theta = frameFrac * TWO_PI;
  xpoints = [];
  ypoints = [];
  var t, i;

  if (theta <= PI) {
    editIndex = round(map(theta, 0, PI, nCirclePoints, 0));
    for (i = 0; i < 3; i++) {
      if (editIndex <= corners[i]) {
        t = map(corners[i], 0, nCirclePoints, 0, -TWO_PI);
        xpoints.push(radius * cos(t));
        ypoints.push(radius * sin(t));
      }
    }
    for (i = 0; i < editIndex; i++) {
      t = i * (-TWO_PI / nCirclePoints);
      xpoints.push(radius * cos(t));
      ypoints.push(radius * sin(t));
    }
  } else {
    editIndex = round(map(theta, PI, TWO_PI, 0, nCirclePoints));
    for (i = 0; i <= editIndex; i++) {
      t = i * (-TWO_PI / nCirclePoints);
      xpoints.push(radius * cos(t));
      ypoints.push(radius * sin(t));
    }
    for (i = 0; i < 3; i++) {
      if (editIndex <= corners[i]) {
        t = map(corners[i], 0, nCirclePoints, 0, -TWO_PI);
        xpoints.push(radius * cos(t));
        ypoints.push(radius * sin(t));
      }
    }
  }
}

function drawDebug() {
  var len = xpoints.length;
  if (theta >= PI) {
    if (len >= 4) {
      var alph = 0.5 - 0.5 * cos(2.0 * theta);
      stroke(24, 14, 6, 128 * pow(alph, 0.25));
      strokeWeight(width / 1024.0);

      line(0, 0, xpoints[0], ypoints[0]);
      if (len <= corners[0] + 3) {
        line(0, 0, xpoints[len - 4], ypoints[len - 4]);
        line(0, 0, xpoints[len - 3], ypoints[len - 3]);
        line(0, 0, xpoints[len - 2], ypoints[len - 2]);
      } else if (len <= corners[1] + 2) {
        line(0, 0, xpoints[len - 3], ypoints[len - 3]);
        line(0, 0, xpoints[len - 2], ypoints[len - 2]);
      } else if (len <= corners[2] + 1) {
        line(0, 0, xpoints[len - 2], ypoints[len - 2]);
      } else if (len <= corners[3] + 1) {
        line(0, 0, xpoints[len - 1], ypoints[len - 1]);
      }
    }
  }
}
