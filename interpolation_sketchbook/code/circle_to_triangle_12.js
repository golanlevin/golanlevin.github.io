/*
 * ◯⟷△ №.12
 * Interpolation From a Circle to an Equilateral Triangle (#12)
 * "By treating the form as a series of six circular arcs,
 * whose radii alternate betwen small and large."
 * Page Twelve of a 14-Page Pedagogical Sketchbook
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

var radius;
var cx, cy;
var trianglePoints = [];
var nFrames = 360;
var nLoops = 2;
var backgrCol;
var strokeCol;

function setup() {
  createCanvas(1024, 1024);
  pixelDensity(1);
  frameRate(60);

  backgrCol = color(253, 247, 241);
  strokeCol = color(24, 14, 6);

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
  strokeJoin(ROUND);
  noFill();

  var strokeWeight1 = ceil(width * 0.01);
  var strokeWeight2 = width / 1024.0;

  var frac = ((frameCount / nLoops) % nFrames) / nFrames;
  var theta = TWO_PI * frac;
  var wiggle = 0.5 + 0.5 * cos(theta);
  var rad = (1.0 - wiggle) * radius;
  var bDrawDebug = frac < 0.5;

  if (rad === 0) {
    stroke(strokeCol);
    strokeWeight(strokeWeight1);
    beginShape();
    vertex(trianglePoints[0].x, trianglePoints[0].y);
    vertex(trianglePoints[1].x, trianglePoints[1].y);
    vertex(trianglePoints[2].x, trianglePoints[2].y);
    endShape(CLOSE);
  } else {
    for (var i = 0; i < 3; i++) {
      var j = (i + 1) % 3;
      var tx1 = trianglePoints[i].x;
      var ty1 = trianglePoints[i].y;
      var tx2 = trianglePoints[j].x;
      var ty2 = trianglePoints[j].y;

      var px1 = lerp(cx, tx1, wiggle);
      var py1 = lerp(cy, ty1, wiggle);
      var px2 = lerp(cx, tx2, wiggle);
      var py2 = lerp(cy, ty2, wiggle);

      var cornerArcAng = map(wiggle, 0, 1, 30.0, 59.99);
      var sa1 = (i * TWO_PI) / 3.0 - HALF_PI - radians(cornerArcAng);
      var ea1 = (i * TWO_PI) / 3.0 - HALF_PI + radians(cornerArcAng);
      var sa2 = (j * TWO_PI) / 3.0 - HALF_PI - radians(cornerArcAng);
      var ea2 = (j * TWO_PI) / 3.0 - HALF_PI + radians(cornerArcAng);

      var x1 = px1 + rad * cos(ea1);
      var y1 = py1 + rad * sin(ea1);
      var x2 = x1 - 0.5 * rad * sin(ea1);
      var y2 = y1 + 0.5 * rad * cos(ea1);

      var x3 = px2 + rad * cos(sa2);
      var y3 = py2 + rad * sin(sa2);
      var x4 = x3 + 0.5 * rad * sin(sa2);
      var y4 = y3 - 0.5 * rad * cos(sa2);

      if (bDrawDebug) {
        strokeWeight(strokeWeight2);
        stroke(24, 14, 6, 128 * wiggle);
        ellipse(px1, py1, rad * 2, rad * 2);
      }

      // Construct perpendiculars
      var bigR = 1000000;
      var ppx = x1 - bigR * (y2 - y1);
      var ppy = y1 + bigR * (x2 - x1);
      var pqx = x3 - bigR * (y3 - y4);
      var pqy = y3 + bigR * (x3 - x4);

      // Compute the intersection of (x1,y1, ppx,ppy) and (x3,y3, pqx,pqy)
      // Via Bourke: http://paulbourke.net/geometry/pointlineplane/
      var numer = (pqx - x3) * (y1 - y3) - (pqy - y3) * (x1 - x3);
      var denom = (pqy - y3) * (ppx - x1) - (pqx - x3) * (ppy - y1);
      if (denom > 0) {
        var u = numer / denom;
        var acx = x1 + u * (ppx - x1);
        var acy = y1 + u * (ppy - y1);
        var arcD = 2.0 * dist(acx, acy, x1, y1);
        var arcSa = atan2(y1 - acy, x1 - acx);
        var arcEa = atan2(y3 - acy, x3 - acx);

        if (bDrawDebug) {
          strokeWeight(strokeWeight2);
          stroke(24, 14, 6, 128 * (1.0 - wiggle));
          ellipse(acx, acy, arcD, arcD);
        }

        stroke(strokeCol);
        strokeWeight(strokeWeight1);
        arc(acx, acy, arcD, arcD, arcSa, arcEa);
      }

      stroke(strokeCol);
      strokeWeight(strokeWeight1);
      arc(px1, py1, rad * 2, rad * 2, sa1, ea1);
    }
  }
}
