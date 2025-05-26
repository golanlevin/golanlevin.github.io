/*
 * ◯⟷△ №.11
 * Interpolation From a Circle to an Equilateral Triangle (#11)
 * "By progressively moving points evenly sampled along the circle,
 * towards points on the triangle, resampled at equal intervals,
 * by small random amounts."
 * Page Eleven of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 624 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=12m7s).
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
 * - Jürg Lehni and Wilm Thoben, "Footnotes from the History
 * of Two Cultures: Mitsuo Katsui", 2015.
 * - Manfred Mohr, "P-112 / Lady Quark", 1972.
 * - Bruno Munari, "Square Circle Triangle", 1960-1976.
 * - Troika, "Squaring the Circle"; "Dark Matter", 2013-2014.
 * - Wucius Wong, "Principles of Two-Dimensional Design", 1972.
 * - Yuki Yoshida, "A Book of drawCircle()", 2014.
 */

var nPoints, third, offset;
var radius;
var cx, cy;
var trianglePoints = []; // the 3 vertices of the triangle
var srcPoints = []; // points along the circle
var dstPoints = []; // points along the triangle
var curPercents = []; // percentages of interpolation
var durPercents = [];
var nFrames = 720;
var targetPercent = 1;
var strokeCol;
var backgrCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);
  strokeCol = color(24, 14, 6, 255);
  backgrCol = color(253, 247, 241);

  nPoints = 60;
  third = nPoints / 3;
  offset = nPoints / 12;
  radius = (width / 2) * 0.75;
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 3; i++) {
    var x = cx + radius * cos((i * TWO_PI) / 3.0 - HALF_PI);
    var y = cy + radius * sin((i * TWO_PI) / 3.0 - HALF_PI);
    trianglePoints[i] = { x, y };
  }

  // compute srcPoints: points on the circle
  for (var j = 0; j < nPoints; j++) {
    durPercents[j] = curPercents[j] = 0.0;
    var t = map(j, 0, nPoints, 0, TWO_PI);
    var x = cx + radius * cos(t);
    var y = cy + radius * sin(t);
    srcPoints[j] = { x, y };
  }

  // compute dstPoints: points along the triangle
  for (var j = 0; j < nPoints; j++) {
    var i = (floor((j + nPoints - offset) / third) + 1) % 3;
    var p1x = trianglePoints[(i + 0) % 3].x;
    var p1y = trianglePoints[(i + 0) % 3].y;
    var p2x = trianglePoints[(i + 1) % 3].x;
    var p2y = trianglePoints[(i + 1) % 3].y;

    var jt = (j + nPoints - offset) % third;
    var x = map(jt, 0, third, p1x, p2x);
    var y = map(jt, 0, third, p1y, p2y);
    dstPoints[j] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  noFill();
  strokeCap(ROUND);
  stroke(strokeCol);
  strokeWeight(ceil(width * 0.01));

  var i, j, k;

  // move the curPercents inward, randomly
  var speed = 0.012;
  var bias = targetPercent === 1 ? 0.15 : 0.85;
  var progress = (frameCount % nFrames) / nFrames; // 0...1
  for (j = 0; j < nPoints; j++) {
    curPercents[j] += speed * (noise((j + progress) * 10) - bias);
    curPercents[j] = constrain(curPercents[j], 0, 1);
    durPercents[j] = curPercents[j];
  }

  // blur the boundary, and calculate the error
  var A = 0.98;
  var B = (1.0 - A) / 2.0;
  for (j = 0; j < nPoints; j++) {
    i = (j - 1 + nPoints) % nPoints;
    k = (j + 1) % nPoints;
    curPercents[j] =
      B * durPercents[i] + A * durPercents[j] + B * durPercents[k];
  }

  /*
// An alternative way to decide when to switch is to
// accumulate error, then check if e.g. errorSum < 0.0001
var errorSum = 0;
for (j=0; j<nPoints; j++) {
errorSum += abs(targetPercent - curPercents[j]);
}
*/

  // switch directions if it's close to our current target
  if (frameCount % (nFrames / 2) == 0) {
    for (var j = 0; j < nPoints; j++) {
      curPercents[j] = targetPercent;
    }
    targetPercent = 1.0 - targetPercent;
    noiseSeed(millis());
  }

  // render using polycurves
  for (i = 0; i < 3; i++) {
    var begin = i * third;
    var end = (i + 1) * third;
    var px, py;
    beginShape();
    {
      px = trianglePoints[(i + 1) % 3].x;
      py = trianglePoints[(i + 1) % 3].y;
      vertex(px, py);
      for (j = begin; j < end; j++) {
        k = (j + offset + nPoints) % nPoints;
        px = map(curPercents[k], 0, 1, srcPoints[k].x, dstPoints[k].x);
        py = map(curPercents[k], 0, 1, srcPoints[k].y, dstPoints[k].y);
        curveVertex(px, py);
      }
      px = trianglePoints[(i + 2) % 3].x;
      py = trianglePoints[(i + 2) % 3].y;
      vertex(px, py);
      vertex(px, py);
    }
    endShape();
  }
}
