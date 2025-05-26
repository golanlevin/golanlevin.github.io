/*
 * ◯⟷△ №.13
 * Interpolation From a Circle to an Equilateral Triangle (#13)
 * "By linearly interpolating points on the circle towards
 * points on the triangle, along radii of the circle."
 * Page Thirteen of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 *
 * Animated GIF, 1024x1024, 720 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=1315s).
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

var nPoints;
var radius;
var cx, cy;
var trianglePoints = [];
var srcPoints = []; // points on the circle
var dstPoints = []; // points on the triangle
var bShowDebug = true;
var nFrames;
var backgrCol;
var strokeCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);

  backgrCol = color(253, 247, 241);
  strokeCol = color(24, 14, 6);

  nFrames = 720;
  nPoints = 180;
  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 3; i++) {
    // triangle vertices
    var x = cx + radius * cos(0 + (i * TWO_PI) / 3.0 - HALF_PI);
    var y = cy + radius * sin(0 + (i * TWO_PI) / 3.0 - HALF_PI);
    trianglePoints[i] = { x, y };
  }

  // compute srcPoints: points on the circle
  for (var j = 0; j < nPoints; j++) {
    var t = map(j, 0, nPoints, 0, TWO_PI);
    var x = cx + radius * cos(t - HALF_PI);
    var y = cy + radius * sin(t - HALF_PI);
    srcPoints[j] = { x, y };
  }

  // compute dstPoints: points along the triangle
  for (var j = 0; j < nPoints; j++) {
    var i = floor(j / (nPoints / 3));
    var p1x = trianglePoints[i].x;
    var p1y = trianglePoints[i].y;
    var p2x = trianglePoints[(i + 1) % 3].x;
    var p2y = trianglePoints[(i + 1) % 3].y;

    var p3x = cx;
    var p3y = cy;
    var p4x = srcPoints[j].x;
    var p4y = srcPoints[j].y;

    // see http://paulbourke.net/geometry/pointlineplane/
    var numea = (p4x - p3x) * (p1y - p3y) - (p4y - p3y) * (p1x - p3x);
    var numeb = (p2x - p1x) * (p1y - p3y) - (p2y - p1y) * (p1x - p3x);
    var denom = (p4y - p3y) * (p2x - p1x) - (p4x - p3x) * (p2y - p1y);
    var ua = numea / denom;
    var ub = numeb / denom;
    var u = 1.0;
    if (ua >= 0 && ua <= 1) {
      u = ua;
    } else if (ub >= 0 && ub <= 1) {
      u = ub;
    }
    var x = p1x + u * (p2x - p1x);
    var y = p1y + u * (p2y - p1y);
    dstPoints[j] = { x, y };
  }
}

function draw() {
  background(backgrCol);

  var progress = (frameCount % nFrames) / nFrames;
  var theta = progress * TWO_PI;
  var t = pow(map(cos(theta), -1, 1, 0, 1), 1.5);

  noFill();
  stroke(strokeCol);
  strokeJoin(MITER);
  strokeWeight(ceil(width * 0.01));

  beginShape();
  for (var j = 0; j < nPoints; j++) {
    var px = map(t, 0, 1, srcPoints[j].x, dstPoints[j].x);
    var py = map(t, 0, 1, srcPoints[j].y, dstPoints[j].y);
    vertex(px, py);
  }
  endShape(CLOSE);

  if (progress > 0.5) {
    var alph = pow(sin((PI * (progress - 0.5)) / 0.5), 0.4);
    stroke(24, 14, 6, 96 * alph);
    strokeWeight(width / 1024.0);
    for (var j = 0; j < nPoints; j += 5) {
      line(srcPoints[j].x, srcPoints[j].y, dstPoints[j].x, dstPoints[j].y);
    }
  }
}
