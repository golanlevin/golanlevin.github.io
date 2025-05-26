/*
 * ◯⟷△ №.07
 * Interpolation From a Circle to an Equilateral Triangle (#07)
 * "By gradually shrinking the circle's radius,
 * revealing triangular corners within."
 * Page Seven of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 360 frames @50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=24m10s).
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
var nFrames = 360;
var third;
var theta;
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
  third = TWO_PI / 3.0;

  for (var i = 0; i < 3; i++) {
    var x = cx + radius * cos(i * third - HALF_PI);
    var y = cy + radius * sin(i * third - HALF_PI);
    trianglePoints[i] = { x, y };
  }
}

function draw() {
  background(backgrCol);
  noFill();
  stroke(strokeCol);
  strokeJoin(ROUND);
  strokeCap(ROUND);
  strokeWeight(ceil(width * 0.01));

  theta = (TWO_PI * (frameCount % nFrames)) / nFrames;
  var amount = 0.745 + 0.255 * cos(theta); // Magic numbers
  var rad = amount * radius;
  var nPts = 30;

  for (var i = 0; i < 3; i++) {
    var x1 = trianglePoints[(i + 0) % 3].x - cx;
    var y1 = trianglePoints[(i + 0) % 3].y - cy;
    var x2 = trianglePoints[(i + 1) % 3].x - cx;
    var y2 = trianglePoints[(i + 1) % 3].y - cy;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dr = sqrt(dx * dx + dy * dy);
    var D = x1 * y2 - x2 * y1;

    // See http://mathworld.wolfram.com/Circle-LineIntersection.html
    var discriminant = rad * rad * dr * dr - D * D;
    if (discriminant <= 0) {
      line(x1 + cx, y1 + cy, x2 + cx, y2 + cy);
    } else {
      var dysign = dy < 0 ? -1 : 1;
      var px = cx + (D * dy + dysign * dx * sqrt(discriminant)) / (dr * dr);
      var py = cy + (-D * dx + abs(dy) * sqrt(discriminant)) / (dr * dr);
      var qx = cx + (D * dy - dysign * dx * sqrt(discriminant)) / (dr * dr);
      var qy = cy + (-D * dx - abs(dy) * sqrt(discriminant)) / (dr * dr);
      var pAng = atan2(py - cy, px - cx);
      var qAng = atan2(qy - cy, qx - cx);

      if (i == 2) {
        var tmp = pAng;
        pAng = qAng;
        qAng = tmp;
        if (py > cy) {
          qAng -= TWO_PI;
        }
      }

      beginShape();
      vertex(x2 + cx, y2 + cy);
      for (var j = 0; j <= nPts; j++) {
        var t = map(j, 0, nPts, pAng, qAng);
        var tx = cx + rad * cos(t);
        var ty = cy + rad * sin(t);
        vertex(tx, ty);
      }
      vertex(x1 + cx, y1 + cy);
      endShape();
    }
  }
}
