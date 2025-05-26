/*
 * ◯⟷△ №.02
 * Interpolation From a Circle to an Equilateral Triangle (#02)
 * "In which a circle is approximated by three circular arcs,
 * whose radii dynamically lengthen to infinity."
 * Page Two of a 14-Page Pedagogical Sketchbook
 * By Golan Levin (@golan), 2017-2021.
 * https://link.medium.com/bn3sesXYOkb
 *
 * Animated GIF, 1024x1024, 663 frames @~50fps, made with p5.js;
 * Presented October 25, 2017 on the Coding Train episode,
 * "Guest Tutorial #7: Circle Morphing with Golan Levin"
 * (https://www.youtube.com/watch?v=mvgcNOX8JGQ&t=18m51s).
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
  backgrCol = color(253, 247, 241);

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
  noFill();

  var t = ((frameCount / nLoops) % nFrames) / nFrames;
  theta = PI / 4 + TWO_PI * t;

  var wiggle = max(0.01, 0.5 * (1.0 + sin(theta * nLoops)));
  var amount = pow(1.0 / wiggle - 1.0, 2.0);
  var bShowDebug = t < 0.5;

  for (var i = 0; i < 3; i++) {
    var p0x = trianglePoints[i].x;
    var p0y = trianglePoints[i].y;
    var p1x = trianglePoints[(i + 1) % 3].x;
    var p1y = trianglePoints[(i + 1) % 3].y;
    var pcx = cx - amount * ((p0x + p1x) / 2 - cx);
    var pcy = cy - amount * ((p0y + p1y) / 2 - cy);

    if (bShowDebug) {
      var alph = 0.5 - 0.5 * cos(2 * (theta - PI / 4));
      stroke(24, 14, 6, 128 * pow(alph, 0.333));
      strokeWeight(width / 1024.0);
      line(pcx, pcy, p0x, p0y);
      line(pcx, pcy, p1x, p1y);
    }

    var dx = p0x - pcx;
    var dy = p0y - pcy;
    var dh = sqrt(dx * dx + dy * dy);
    var angle0 = atan2(p0y - pcy, p0x - pcx);
    var angle1 = atan2(p1y - pcy, p1x - pcx);

    stroke(strokeCol1);
    strokeWeight(ceil(width * 0.01));
    arc(pcx, pcy, dh * 2, dh * 2, angle0, angle1, OPEN);
  }
}
