/**
 * Saved experimental Frankenmesh builder.
 *
 * This file ports the old C++ HandMeshBuilder idea: construct a full 151-point
 * mesh procedurally from contour handmarks and a contour loop. It is currently
 * NOT wired into `main.js`; Frankenmesh2 is the live experiment. Keep this file
 * for reference because it captures the original 2014 topology-construction
 * logic in browser-compatible JavaScript.
 */

const HANDMARK = {
  PINKY_TIP: 0,
  PR_CROTCH: 1,
  RING_TIP: 2,
  RM_CROTCH: 3,
  MIDDLE_TIP: 4,
  MI_CROTCH: 5,
  POINTER_TIP: 6,
  POINTER_SIDE: 7,
  IT_CROTCH: 8,
  THUMB_TIP: 9,
  THUMB_KNUCKLE: 10,
  THUMB_BASE: 11,
  THUMBSIDE_WRIST: 12,
  PINKYSIDE_WRIST: 13,
  PALM_BASE: 14,
  PINKY_SIDE: 15,
};

const HANDMARK_VERTICES = [
  40, 138, 61, 140, 82, 142, 103, 86,
  0, 19, 2, 144, 116, 105, 117, 21,
];

const SKELETON_CONTROLS = [
  { mp: 0, vertices: [115], weights: [1], strength: 0.9 },
  { mp: 1, vertices: [126, 116], weights: [0.7, 0.3], strength: 0.35 },
  { mp: 2, vertices: [1], weights: [1], strength: 0.55 },
  { mp: 3, vertices: [10, 16], weights: [0.5, 0.5], strength: 0.45 },
  { mp: 5, vertices: [143], weights: [1], strength: 0.65 },
  { mp: 6, vertices: [91], weights: [1], strength: 0.55 },
  { mp: 7, vertices: [97, 100], weights: [0.5, 0.5], strength: 0.5 },
  { mp: 9, vertices: [141], weights: [1], strength: 0.65 },
  { mp: 10, vertices: [70], weights: [1], strength: 0.55 },
  { mp: 11, vertices: [76, 79], weights: [0.5, 0.5], strength: 0.5 },
  { mp: 13, vertices: [139], weights: [1], strength: 0.65 },
  { mp: 14, vertices: [49], weights: [1], strength: 0.55 },
  { mp: 15, vertices: [55, 58], weights: [0.5, 0.5], strength: 0.5 },
  { mp: 17, vertices: [137], weights: [1], strength: 0.65 },
  { mp: 18, vertices: [28], weights: [1], strength: 0.55 },
  { mp: 19, vertices: [34, 37], weights: [0.5, 0.5], strength: 0.5 },
];

// These regions were copied from the TPS mesh during the first Frankenmesh
// surgery because the procedural palm/wrist triangles were visually worse.
const TPS_CORE_RANGES = [
  [105, 116], // wrist
  [117, 143], // palm
  [144, 150], // thumb web / thumb-side palm edge
];

// MCP crown vertices were snapped back to MediaPipe after the TPS core copy.
const MCP_JUNCTIONS = [
  { mp: 17, vertex: 137 }, // pinky MCP
  { mp: 13, vertex: 139 }, // ring MCP
  { mp: 9, vertex: 141 }, // middle MCP
  { mp: 5, vertex: 143 }, // index MCP
];

/**
 * Linear map equivalent to openFrameworks `ofMap`.
 *
 * @param {number} value - Input value.
 * @param {number} inputMin - Input range minimum.
 * @param {number} inputMax - Input range maximum.
 * @param {number} outputMin - Output range minimum.
 * @param {number} outputMax - Output range maximum.
 * @returns {number} Mapped value.
 */
function ofMap(value, inputMin, inputMax, outputMin, outputMax) {
  return outputMin + ((value - inputMin) / (inputMax - inputMin)) * (outputMax - outputMin);
}

/**
 * Read one packed point.
 *
 * @param {Float64Array|number[]} points - Packed point array.
 * @param {number} index - Point index.
 * @returns {{x:number,y:number}} Point object.
 */
function point(points, index) {
  return { x: points[2 * index], y: points[2 * index + 1] };
}

/**
 * Append a point to a mutable packed JS array.
 *
 * @param {number[]} points - Mutable packed point list.
 * @param {number} x - X coordinate.
 * @param {number} y - Y coordinate.
 */
function addPoint(points, x, y) {
  points.push(x, y);
}

/**
 * Distance between point-like objects.
 *
 * @param {{x:number,y:number}} a - First point.
 * @param {{x:number,y:number}} b - Second point.
 * @returns {number} Euclidean distance.
 */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Compute cumulative polyline length.
 *
 * @param {Float64Array|number[]} points - Packed polyline points.
 * @param {boolean} [closed=false] - Include closing segment.
 * @returns {{lengths:Float64Array,total:number}} Cumulative lengths and total length.
 */
function makePolylineLength(points, closed = false) {
  const n = points.length / 2;
  const lengths = new Float64Array(n + (closed ? 1 : 0));
  let total = 0;
  for (let i = 1; i < n; i += 1) {
    total += dist(point(points, i - 1), point(points, i));
    lengths[i] = total;
  }
  if (closed && n > 1) {
    total += dist(point(points, n - 1), point(points, 0));
    lengths[n] = total;
  }
  return { lengths, total };
}

/**
 * Sample a point at arc-length percentage along an open polyline.
 *
 * @param {Float64Array|number[]} points - Packed polyline points.
 * @param {number} percent - Percent in `[0,1]`.
 * @returns {{x:number,y:number}} Interpolated point.
 */
function pointAtPercent(points, percent) {
  const n = points.length / 2;
  if (n <= 0) return { x: 0, y: 0 };
  if (n === 1) return point(points, 0);
  const { lengths, total } = makePolylineLength(points, false);
  if (total <= 1e-9) return point(points, 0);
  const target = Math.max(0, Math.min(1, percent)) * total;
  for (let i = 1; i < n; i += 1) {
    if (lengths[i] >= target) {
      const prev = lengths[i - 1];
      const seg = Math.max(1e-9, lengths[i] - prev);
      const t = (target - prev) / seg;
      const a = point(points, i - 1);
      const b = point(points, i);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return point(points, n - 1);
}

/**
 * Find the closest point on a polyline to a query point.
 *
 * @param {Float64Array|number[]} points - Packed polyline points.
 * @param {{x:number,y:number}} q - Query point.
 * @param {boolean} [closed=true] - Treat polyline as closed.
 * @returns {{x:number,y:number}} Closest point on any segment.
 */
function closestPointOnPolyline(points, q, closed = true) {
  const n = points.length / 2;
  if (n <= 0) return { x: q.x, y: q.y };
  let best = point(points, 0);
  let bestD2 = Infinity;
  const segmentCount = closed ? n : n - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const a = point(points, i);
    const b = point(points, (i + 1) % n);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const denom = vx * vx + vy * vy;
    let t = denom > 1e-12 ? ((q.x - a.x) * vx + (q.y - a.y) * vy) / denom : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + vx * t;
    const y = a.y + vy * t;
    const d2 = (x - q.x) ** 2 + (y - q.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { x, y };
    }
  }
  return best;
}

/**
 * Slice packed points forward around a closed loop.
 *
 * @param {Float64Array|number[]} points - Packed closed-loop points.
 * @param {number} start - Start index.
 * @param {number} end - End index.
 * @returns {number[]} Packed sliced points.
 */
function sliceForward(points, start, end) {
  const n = points.length / 2;
  const out = [];
  let i = start;
  for (let guard = 0; guard <= n; guard += 1) {
    const p = point(points, i);
    addPoint(out, p.x, p.y);
    if (i === end) break;
    i = (i + 1) % n;
  }
  return out;
}

/**
 * Slice packed points backward around a closed loop.
 *
 * @param {Float64Array|number[]} points - Packed closed-loop points.
 * @param {number} start - Start index.
 * @param {number} end - End index.
 * @returns {number[]} Packed sliced points.
 */
function sliceBackward(points, start, end) {
  const n = points.length / 2;
  const out = [];
  let i = start;
  for (let guard = 0; guard <= n; guard += 1) {
    const p = point(points, i);
    addPoint(out, p.x, p.y);
    if (i === end) break;
    i = (i - 1 + n) % n;
  }
  return out;
}

/**
 * Reorder the native 95-point contour so handmark order matches the C++ builder.
 *
 * @param {Float64Array} boundaryContour - Packed contour in model boundary order.
 * @param {object} model - Runtime model with `boundary`.
 * @returns {{contour:Float64Array,nativeToContour:Map<number,number>}} Reordered contour and vertex-index map.
 */
function makeNativeContour(boundaryContour, model) {
  const boundary = Array.from(model.boundary);
  const start = boundary.indexOf(40);
  const ordered = [];
  for (let i = 0; i < boundary.length; i += 1) ordered.push((start + i) % boundary.length);

  const native = [];
  const nativeToContour = new Map();
  for (let oi = 0; oi < ordered.length; oi += 1) {
    const bi = ordered[oi];
    const vertex = boundary[bi];
    nativeToContour.set(vertex, native.length / 2);
    addPoint(native, boundaryContour[2 * bi], boundaryContour[2 * bi + 1]);
  }
  return { contour: Float64Array.from(native), nativeToContour };
}

/**
 * Convert semantic mesh vertices into C++-style contour handmark records.
 *
 * @param {Map<number,number>} nativeToContour - Mesh vertex to contour index map.
 * @returns {Array<object>} Handmark records.
 */
function makeHandmarks(nativeToContour) {
  return HANDMARK_VERTICES.map((vertex, type) => ({
    type,
    vertex,
    index: nativeToContour.get(vertex) ?? 0,
  }));
}

/**
 * Append a triangle with optional winding flip.
 *
 * @param {number[]} triangles - Mutable packed triangle index list.
 * @param {number} a - First vertex index.
 * @param {number} b - Second vertex index.
 * @param {number} c - Third vertex index.
 * @param {boolean} windingCcw - Preserve CCW winding when true.
 */
function addTriangle(triangles, a, b, c, windingCcw) {
  if (windingCcw) triangles.push(a, b, c);
  else triangles.push(a, c, b);
}

/**
 * Procedurally build the five fingers from contour-side samples.
 *
 * @param {number[]} mesh - Mutable packed mesh vertex list.
 * @param {number[]} triangles - Mutable packed triangle list.
 * @param {Float64Array} contour - Reordered native contour.
 * @param {Array<object>} handmarks - C++-style contour handmarks.
 * @param {boolean} windingCcw - Triangle winding flag.
 */
function addFingers(mesh, triangles, contour, handmarks, windingCcw) {
  const verticesPerFinger = 21;
  for (let whichFinger = 0; whichFinger < 5; whichFinger += 1) {
    let contourIndex0 = 0;
    let contourIndex1 = 0;
    let contourIndex2 = 0;
    if (whichFinger === 0) {
      contourIndex0 = handmarks[HANDMARK.IT_CROTCH].index;
      contourIndex1 = handmarks[HANDMARK.THUMB_TIP].index;
      contourIndex2 = handmarks[HANDMARK.THUMB_KNUCKLE].index;
    } else if (whichFinger === 1) {
      contourIndex0 = handmarks[HANDMARK.PINKY_SIDE].index;
      contourIndex1 = handmarks[HANDMARK.PINKY_TIP].index;
      contourIndex2 = handmarks[HANDMARK.PR_CROTCH].index;
    } else if (whichFinger === 2) {
      contourIndex0 = handmarks[HANDMARK.PR_CROTCH].index;
      contourIndex1 = handmarks[HANDMARK.RING_TIP].index;
      contourIndex2 = handmarks[HANDMARK.RM_CROTCH].index;
    } else if (whichFinger === 3) {
      contourIndex0 = handmarks[HANDMARK.RM_CROTCH].index;
      contourIndex1 = handmarks[HANDMARK.MIDDLE_TIP].index;
      contourIndex2 = handmarks[HANDMARK.MI_CROTCH].index;
    } else {
      contourIndex0 = handmarks[HANDMARK.MI_CROTCH].index;
      contourIndex1 = handmarks[HANDMARK.POINTER_TIP].index;
      contourIndex2 = handmarks[HANDMARK.POINTER_SIDE].index;
    }

    const poly01 = sliceForward(contour, contourIndex0, contourIndex1);
    const poly21 = sliceBackward(contour, contourIndex2, contourIndex1);
    const nLen = 6;
    const poly01RS = [];
    const poly21RS = [];
    let startFrac01 = 0.3 / 6.5;
    let endFrac01 = 5.5 / 6.5;
    if (whichFinger === 0 || whichFinger === 1) startFrac01 = 0;
    for (let i = 1; i <= nLen; i += 1) {
      let frac = ofMap(i, 1, nLen, startFrac01, endFrac01);
      if (whichFinger === 0) frac = frac ** 1.25;
      const p = pointAtPercent(poly01, frac);
      addPoint(poly01RS, p.x, p.y);
    }
    let startFrac21 = 0.3 / 6.5;
    let endFrac21 = 5.5 / 6.5;
    if (whichFinger === 0 || whichFinger === 4) startFrac21 = 0;
    for (let i = 1; i <= nLen; i += 1) {
      let frac = ofMap(i, 1, nLen, startFrac21, endFrac21);
      if (whichFinger === 0) frac = frac ** 1.25;
      const p = pointAtPercent(poly21, frac);
      addPoint(poly21RS, p.x, p.y);
    }

    for (let i = 0; i < nLen; i += 1) {
      const p01 = point(poly01RS, i);
      const p21 = point(poly21RS, i);
      addPoint(mesh, p01.x, p01.y);
      addPoint(mesh, 0.5 * (p01.x + p21.x), 0.5 * (p01.y + p21.y));
      addPoint(mesh, p21.x, p21.y);
    }

    const tip = point(contour, contourIndex1);
    const last01 = point(poly01RS, nLen - 1);
    const last21 = point(poly21RS, nLen - 1);
    const qa = closestPointOnPolyline(contour, { x: 0.5 * (last01.x + tip.x), y: 0.5 * (last01.y + tip.y) }, true);
    const qb = closestPointOnPolyline(contour, { x: 0.5 * (last21.x + tip.x), y: 0.5 * (last21.y + tip.y) }, true);
    addPoint(mesh, qa.x, qa.y);
    addPoint(mesh, tip.x, tip.y);
    addPoint(mesh, qb.x, qb.y);

    const vertexIndex = whichFinger * verticesPerFinger;
    const nw = 3;
    for (let i = 0; i < nLen - 1; i += 1) {
      const row = vertexIndex + i * nw;
      for (let j = 0; j < nw - 1; j += 1) {
        addTriangle(triangles, row + j, row + j + 1, row + j + nw, windingCcw);
        addTriangle(triangles, row + j + 1, row + j + 1 + nw, row + j + nw, windingCcw);
      }
    }
    const row = vertexIndex + (nLen - 1) * nw;
    addTriangle(triangles, row + 0, row + 1, row + 3, windingCcw);
    addTriangle(triangles, row + 3, row + 1, row + 4, windingCcw);
    addTriangle(triangles, row + 4, row + 1, row + 5, windingCcw);
    addTriangle(triangles, row + 1, row + 2, row + 5, windingCcw);
  }
}

/**
 * Build the wrist lattice.
 *
 * @param {number[]} mesh - Mutable packed mesh vertex list.
 * @param {number[]} triangles - Mutable packed triangle list.
 * @param {Float64Array} contour - Reordered native contour.
 * @param {Array<object>} handmarks - C++-style contour handmarks.
 * @param {{x:number,y:number}|null} wristPoint - Optional MediaPipe wrist point.
 * @param {boolean} windingCcw - Triangle winding flag.
 * @returns {number} Mesh vertex index for the wrist-center vertex.
 */
function addWrist(mesh, triangles, contour, handmarks, wristPoint, windingCcw) {
  const pt11 = point(contour, handmarks[HANDMARK.THUMB_BASE].index);
  const pt12 = point(contour, handmarks[HANDMARK.THUMBSIDE_WRIST].index);
  const pt13 = point(contour, handmarks[HANDMARK.PINKYSIDE_WRIST].index);
  const pt14 = point(contour, handmarks[HANDMARK.PALM_BASE].index);
  const vIndex = mesh.length / 2;
  const nr = 3;
  const nw = 3;
  let midpoint = { x: 0.5 * (pt13.x + pt12.x), y: 0.5 * (pt13.y + pt12.y) };
  const contourMid1213 = closestPointOnPolyline(contour, midpoint, true);
  addPoint(mesh, pt13.x, pt13.y);
  addPoint(mesh, contourMid1213.x, contourMid1213.y);
  addPoint(mesh, pt12.x, pt12.y);

  for (let i = 1; i < nr; i += 1) {
    const nearWrist = ofMap(i, 0, nr, 0, 1) ** 0.666;
    const q13 = {
      x: (1 - nearWrist) * pt13.x + nearWrist * pt14.x,
      y: (1 - nearWrist) * pt13.y + nearWrist * pt14.y,
    };
    const q12 = {
      x: (1 - nearWrist) * pt12.x + nearWrist * pt11.x,
      y: (1 - nearWrist) * pt12.y + nearWrist * pt11.y,
    };
    const contourMid1314 = closestPointOnPolyline(contour, q13, true);
    const contourMid1211 = closestPointOnPolyline(contour, q12, true);
    addPoint(mesh, contourMid1314.x, contourMid1314.y);
    addPoint(mesh, 0.5 * (contourMid1314.x + contourMid1211.x), 0.5 * (contourMid1314.y + contourMid1211.y));
    addPoint(mesh, contourMid1211.x, contourMid1211.y);
  }

  let avg = { x: 0.5 * (pt14.x + pt11.x), y: 0.5 * (pt14.y + pt11.y) };
  if (wristPoint && dist(avg, wristPoint) < 80) avg = wristPoint;
  addPoint(mesh, pt14.x, pt14.y);
  const wristVertexIndex = mesh.length / 2;
  addPoint(mesh, avg.x, avg.y);
  addPoint(mesh, pt11.x, pt11.y);

  for (let j = 0; j < nr; j += 1) {
    const row = j * nw;
    for (let i = 0; i < 2; i += 1) {
      addTriangle(triangles, vIndex + row + i, vIndex + row + i + 1, vIndex + row + i + nw, windingCcw);
      addTriangle(triangles, vIndex + row + i + 1, vIndex + row + i + 1 + nw, vIndex + row + i + nw, windingCcw);
    }
  }
  return wristVertexIndex;
}

/**
 * Intersect two line segments.
 *
 * @param {{x:number,y:number}} a - First segment start.
 * @param {{x:number,y:number}} b - First segment end.
 * @param {{x:number,y:number}} c - Second segment start.
 * @param {{x:number,y:number}} d - Second segment end.
 * @returns {{x:number,y:number}|null} Intersection point inside both segments.
 */
function lineIntersection(a, b, c, d) {
  const denominator = ((d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y));
  if (Math.abs(denominator) < 1e-9) return null;
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denominator;
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denominator;
  if (ua > 0 && ua < 1 && ub > 0 && ub < 1) {
    return { x: a.x + ua * (b.x - a.x), y: a.y + ua * (b.y - a.y) };
  }
  return null;
}

/**
 * Build the palm ladder/crown region.
 *
 * @param {number[]} mesh - Mutable packed mesh vertex list.
 * @param {number[]} triangles - Mutable packed triangle list.
 * @param {Float64Array} contour - Reordered native contour.
 * @param {Array<object>} handmarks - C++-style contour handmarks.
 * @param {number} wristVertexIndex - Previously created wrist-center vertex.
 * @param {Int16Array} thumbsidePalmVertexIndices - Output indices used by thumb webbing.
 * @param {boolean} windingCcw - Triangle winding flag.
 */
function addPalm(mesh, triangles, contour, handmarks, wristVertexIndex, thumbsidePalmVertexIndices, windingCcw) {
  const contourIndex14 = handmarks[HANDMARK.PALM_BASE].index;
  const contourIndex15 = handmarks[HANDMARK.PINKY_SIDE].index;
  const pinkyPalmSide = sliceForward(contour, contourIndex14, contourIndex15);
  const pt11 = point(contour, handmarks[HANDMARK.THUMB_BASE].index);
  const pt07 = point(contour, handmarks[HANDMARK.POINTER_SIDE].index);
  const wristPoint = point(mesh, wristVertexIndex);
  const crotchIndices = [
    handmarks[HANDMARK.PINKY_SIDE].index,
    handmarks[HANDMARK.PR_CROTCH].index,
    handmarks[HANDMARK.RM_CROTCH].index,
    handmarks[HANDMARK.MI_CROTCH].index,
    handmarks[HANDMARK.POINTER_SIDE].index,
  ];
  const nr = 5;
  const nc = 4;
  const vertexStartIndex = mesh.length / 2;
  thumbsidePalmVertexIndices[0] = vertexStartIndex - 1;

  for (let i = 1; i < nr; i += 1) {
    const rowFractionP = ofMap(i, 0, nr, 0, 1) ** 0.8;
    const rowFractionT = ofMap(i, 0, nr, 0, 1);
    const pinkySidePt = pointAtPercent(pinkyPalmSide, rowFractionP);
    const thumbSidePt = {
      x: (1 - rowFractionT) * pt11.x + rowFractionT * pt07.x,
      y: (1 - rowFractionT) * pt11.y + rowFractionT * pt07.y,
    };
    addPoint(mesh, pinkySidePt.x, pinkySidePt.y);
    for (let j = 0; j < 3; j += 1) {
      const crotch = point(contour, crotchIndices[j + 1]);
      const inter = lineIntersection(pinkySidePt, thumbSidePt, crotch, wristPoint);
      if (inter) addPoint(mesh, inter.x, inter.y);
      else addPoint(mesh, pinkySidePt.x + (thumbSidePt.x - pinkySidePt.x) * ((j + 1) / 4), pinkySidePt.y + (thumbSidePt.y - pinkySidePt.y) * ((j + 1) / 4));
    }
    thumbsidePalmVertexIndices[i] = mesh.length / 2;
    addPoint(mesh, thumbSidePt.x, thumbSidePt.y);
  }

  const palmBaseTopIndexStart = mesh.length / 2 - (nr * nc);
  const palmBaseBotIndexStart = wristVertexIndex - 1;
  const pt0 = palmBaseTopIndexStart;
  const pb0 = palmBaseBotIndexStart;
  addTriangle(triangles, pb0 + 0, pb0 + 1, pt0 + 0, windingCcw);
  addTriangle(triangles, pb0 + 1, pt0 + 1, pt0 + 0, windingCcw);
  addTriangle(triangles, pt0 + 1, pb0 + 1, pt0 + 2, windingCcw);
  addTriangle(triangles, pt0 + 2, pb0 + 1, pt0 + 3, windingCcw);
  addTriangle(triangles, pb0 + 1, pb0 + 2, pt0 + 3, windingCcw);
  addTriangle(triangles, pt0 + 3, pb0 + 2, pt0 + 4, windingCcw);

  const vM = vertexStartIndex;
  const nd = nc + 1;
  for (let j = 0; j < 3; j += 1) {
    const row = j * nd;
    for (let i = 0; i < nc; i += 1) {
      addTriangle(triangles, vM + row + i, vM + row + i + 1, vM + row + i + nd, windingCcw);
      addTriangle(triangles, vM + row + i + 1, vM + row + i + 1 + nd, vM + row + i + nd, windingCcw);
    }
  }

  const nVerticesAfterPalmBulk = mesh.length / 2;
  for (let i = 0; i < 4; i += 1) {
    const palm1 = point(mesh, nVerticesAfterPalmBulk - (nc + 1) + i);
    const palm2 = point(mesh, nVerticesAfterPalmBulk - (nc + 1) + i + 1);
    const crotch3 = point(contour, crotchIndices[i]);
    const crotch4 = point(contour, crotchIndices[i + 1]);
    if (i > 0) addPoint(mesh, crotch3.x, crotch3.y);
    addPoint(mesh, 0.25 * (palm1.x + palm2.x + crotch3.x + crotch4.x), 0.25 * (palm1.y + palm2.y + crotch3.y + crotch4.y));
  }
  thumbsidePalmVertexIndices[5] = 4 * 21 + 2;

  for (let i = 0; i < 4; i += 1) {
    const aPalmIndex1 = nVerticesAfterPalmBulk - (nc + 1) + i;
    const aPalmIndex2 = nVerticesAfterPalmBulk - (nc + 1) + i + 1;
    let aCrotchIndex3 = nVerticesAfterPalmBulk + 2 * i - 1;
    const aKnuckleIndex = nVerticesAfterPalmBulk + 2 * i;
    let aCrotchIndex4 = nVerticesAfterPalmBulk + 2 * i + 1;
    if (i === 0) aCrotchIndex3 = 21;
    if (i === 3) aCrotchIndex4 = 4 * 21 + 2;
    const fingBaseIndex0 = (i + 1) * 21;
    const fingBaseIndex1 = (i + 1) * 21 + 1;
    const fingBaseIndex2 = (i + 1) * 21 + 2;
    if (i > 0) addTriangle(triangles, aCrotchIndex3, aKnuckleIndex, fingBaseIndex0, windingCcw);
    addTriangle(triangles, aPalmIndex1, aKnuckleIndex, aCrotchIndex3, windingCcw);
    addTriangle(triangles, aPalmIndex1, aPalmIndex2, aKnuckleIndex, windingCcw);
    addTriangle(triangles, aPalmIndex2, aCrotchIndex4, aKnuckleIndex, windingCcw);
    if (i < 3) addTriangle(triangles, aCrotchIndex4, fingBaseIndex2, aKnuckleIndex, windingCcw);
    addTriangle(triangles, fingBaseIndex1, aKnuckleIndex, fingBaseIndex2, windingCcw);
    addTriangle(triangles, fingBaseIndex1, fingBaseIndex0, aKnuckleIndex, windingCcw);
  }
}

/**
 * Build the thumb web/gusset region.
 *
 * @param {number[]} mesh - Mutable packed mesh vertex list.
 * @param {number[]} triangles - Mutable packed triangle list.
 * @param {Float64Array} contour - Reordered native contour.
 * @param {Array<object>} handmarks - C++-style contour handmarks.
 * @param {number} wristVertexIndex - Previously created wrist-center vertex.
 * @param {Int16Array} thumbsidePalmVertexIndices - Palm vertices required by the gusset.
 * @param {boolean} windingCcw - Triangle winding flag.
 */
function addThumbWebbing(mesh, triangles, contour, handmarks, wristVertexIndex, thumbsidePalmVertexIndices, windingCcw) {
  const contourIndex07 = handmarks[HANDMARK.POINTER_SIDE].index;
  const contourIndex08 = handmarks[HANDMARK.IT_CROTCH].index;
  const contourIndex11 = handmarks[HANDMARK.THUMB_BASE].index;
  const contourIndex10 = handmarks[HANDMARK.THUMB_KNUCKLE].index;
  const thumbKnucklePt = point(contour, contourIndex10);
  const thumbBasePt = point(contour, contourIndex11);
  const thumbBaseVertexIndices = new Int16Array(5);
  thumbBaseVertexIndices[0] = wristVertexIndex + 1;
  thumbBaseVertexIndices[4] = 2;
  for (let i = 1; i < 4; i += 1) {
    const fraction = i / 4;
    const interp = {
      x: (1 - fraction) * thumbBasePt.x + fraction * thumbKnucklePt.x,
      y: (1 - fraction) * thumbBasePt.y + fraction * thumbKnucklePt.y,
    };
    const contourPt = closestPointOnPolyline(contour, interp, true);
    thumbBaseVertexIndices[i] = mesh.length / 2;
    addPoint(mesh, contourPt.x, contourPt.y);
  }

  const thumbPedestalVertexIndices = new Int16Array(5);
  thumbPedestalVertexIndices[4] = thumbsidePalmVertexIndices[5];
  thumbPedestalVertexIndices[2] = 0;
  thumbPedestalVertexIndices[1] = 1;
  thumbPedestalVertexIndices[0] = 2;
  const pointerSidePt = point(contour, contourIndex07);
  const itCrotchPt = point(contour, contourIndex08);
  const contour78Pt = closestPointOnPolyline(contour, { x: 0.5 * (pointerSidePt.x + itCrotchPt.x), y: 0.5 * (pointerSidePt.y + itCrotchPt.y) }, true);
  const indexOfInterpPedestalVert = mesh.length / 2;
  thumbPedestalVertexIndices[3] = indexOfInterpPedestalVert;
  addPoint(mesh, contour78Pt.x, contour78Pt.y);

  for (let i = 1; i < 5; i += 1) {
    const topFrac = (i - 1) / 3;
    const topL = point(mesh, thumbsidePalmVertexIndices[2]);
    const topR = point(mesh, thumbPedestalVertexIndices[1]);
    if (i > 1 && i < 4) addPoint(mesh, (1 - topFrac) * topL.x + topFrac * topR.x, (1 - topFrac) * topL.y + topFrac * topR.y);
  }
  const topL = point(mesh, thumbsidePalmVertexIndices[3]);
  const topR = point(mesh, thumbPedestalVertexIndices[2]);
  addPoint(mesh, 0.5 * (topL.x + topR.x), 0.5 * (topL.y + topR.y));

  addTriangle(triangles, thumbsidePalmVertexIndices[1], thumbsidePalmVertexIndices[0], thumbBaseVertexIndices[1], windingCcw);
  addTriangle(triangles, thumbsidePalmVertexIndices[2], thumbsidePalmVertexIndices[1], thumbBaseVertexIndices[1], windingCcw);

  const interiorVIndices = mesh.length / 2 - 3;
  const topRowA = [thumbsidePalmVertexIndices[2], interiorVIndices, interiorVIndices + 1, 1];
  for (let i = 1; i < 4; i += 1) {
    const botIndex0 = thumbBaseVertexIndices[i];
    const botIndex1 = thumbBaseVertexIndices[i + 1];
    const topIndex0 = topRowA[i - 1];
    const topIndex1 = topRowA[i];
    addTriangle(triangles, botIndex0, topIndex1, topIndex0, windingCcw);
    addTriangle(triangles, botIndex0, botIndex1, topIndex1, windingCcw);
  }

  const topRowB = [thumbsidePalmVertexIndices[3], interiorVIndices + 2, 0];
  for (let i = 0; i < 3; i += 1) {
    addTriangle(triangles, topRowB[i], topRowA[i], topRowA[i + 1], windingCcw);
    if (i < 2) addTriangle(triangles, topRowB[i], topRowA[i + 1], topRowB[i + 1], windingCcw);
  }
  addTriangle(triangles, thumbsidePalmVertexIndices[4], thumbsidePalmVertexIndices[3], topRowB[1], windingCcw);
  addTriangle(triangles, thumbsidePalmVertexIndices[4], topRowB[1], indexOfInterpPedestalVert, windingCcw);
  addTriangle(triangles, indexOfInterpPedestalVert, topRowB[1], topRowB[2], windingCcw);
  addTriangle(triangles, thumbsidePalmVertexIndices[5], thumbsidePalmVertexIndices[4], indexOfInterpPedestalVert, windingCcw);
}

/**
 * Lightly nudge non-boundary skeleton-control vertices toward MediaPipe landmarks.
 *
 * @param {Float64Array} mesh - Packed output mesh.
 * @param {Array<{x:number,y:number}>} landmarks - MediaPipe landmarks.
 * @param {Set<number>} boundarySet - Mesh vertices that must remain on contour.
 */
function applySkeletonControls(mesh, landmarks, boundarySet) {
  if (!landmarks?.length) return;
  for (const control of SKELETON_CONTROLS) {
    const target = landmarks[control.mp];
    if (!target) continue;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < control.vertices.length; i += 1) {
      const vertex = control.vertices[i];
      const w = control.weights[i];
      cx += mesh[2 * vertex] * w;
      cy += mesh[2 * vertex + 1] * w;
    }
    const dx = target.x - cx;
    const dy = target.y - cy;
    for (let i = 0; i < control.vertices.length; i += 1) {
      const vertex = control.vertices[i];
      if (boundarySet.has(vertex)) continue;
      const gain = control.strength * control.weights[i];
      mesh[2 * vertex] += dx * gain;
      mesh[2 * vertex + 1] += dy * gain;
    }
  }
}

/**
 * Copy the stable TPS palm/wrist/thumb-web core into the procedural mesh.
 *
 * @param {Float64Array} mesh - Packed procedural mesh.
 * @param {Float64Array|null} tpsMesh - Packed TPS mesh.
 * @returns {number} Number of copied vertices.
 */
function copyTpsStableCore(mesh, tpsMesh) {
  if (!tpsMesh || tpsMesh.length < mesh.length) return 0;
  let copied = 0;
  for (const [start, end] of TPS_CORE_RANGES) {
    for (let vertex = start; vertex <= end; vertex += 1) {
      mesh[2 * vertex] = tpsMesh[2 * vertex];
      mesh[2 * vertex + 1] = tpsMesh[2 * vertex + 1];
      copied += 1;
    }
  }
  return copied;
}

/**
 * Snap four MCP crown vertices directly to MediaPipe.
 *
 * @param {Float64Array} mesh - Packed procedural mesh.
 * @param {Array<{x:number,y:number}>} landmarks - MediaPipe landmarks.
 * @returns {number} Number of snapped vertices.
 */
function snapMcpJunctionsToMediaPipe(mesh, landmarks) {
  if (!landmarks?.length) return 0;
  let snapped = 0;
  for (const { mp, vertex } of MCP_JUNCTIONS) {
    const p = landmarks[mp];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    mesh[2 * vertex] = p.x;
    mesh[2 * vertex + 1] = p.y;
    snapped += 1;
  }
  return snapped;
}

/**
 * Force all native boundary vertices to exactly equal the Final Contour.
 *
 * @param {Float64Array} mesh - Packed procedural mesh.
 * @param {Float64Array} hybridContour - Packed Final Contour.
 * @param {object} model - Runtime model with `boundary`.
 * @returns {number} Number of copied boundary vertices.
 */
function copyNativeBoundary(mesh, hybridContour, model) {
  if (!hybridContour || !model?.boundary) return 0;
  let copied = 0;
  const n = Math.min(model.boundary.length, hybridContour.length / 2);
  for (let i = 0; i < n; i += 1) {
    const vertex = model.boundary[i];
    mesh[2 * vertex] = hybridContour[2 * i];
    mesh[2 * vertex + 1] = hybridContour[2 * i + 1];
    copied += 1;
  }
  return copied;
}

/**
 * Disabled legacy Frankenmesh builder.
 */
export class FrankenmeshBuilder {
  /**
   * Allocate reusable output buffers.
   */
  constructor() {
    this.mesh = new Float64Array(151 * 2);
    this.last = { vertices: 0, triangles: 0, tpsCoreVertices: 0, mcpJunctions: 0, nativeBoundaryVertices: 0 };
  }

  /**
   * Build a procedural Frankenmesh from the Final Contour and optional TPS mesh.
   *
   * @param {Float64Array} hybridContour - Packed Final Contour.
   * @param {object} model - Runtime model.
   * @param {Array<{x:number,y:number}>} landmarks - MediaPipe landmarks.
   * @param {Float64Array|null} [tpsMesh=null] - Optional TPS mesh for stable-core copy.
   * @returns {Float64Array} Packed 151-vertex mesh.
   */
  build(hybridContour, model, landmarks, tpsMesh = null) {
    const { contour, nativeToContour } = makeNativeContour(hybridContour, model);
    const handmarks = makeHandmarks(nativeToContour);
    const mesh = [];
    const triangles = [];
    const windingCcw = true;
    addFingers(mesh, triangles, contour, handmarks, windingCcw);
    const wristPoint = landmarks?.[0] ? { x: landmarks[0].x, y: landmarks[0].y } : null;
    const wristVertexIndex = addWrist(mesh, triangles, contour, handmarks, wristPoint, windingCcw);
    const thumbsidePalmVertexIndices = new Int16Array(6);
    addPalm(mesh, triangles, contour, handmarks, wristVertexIndex, thumbsidePalmVertexIndices, windingCcw);
    addThumbWebbing(mesh, triangles, contour, handmarks, wristVertexIndex, thumbsidePalmVertexIndices, windingCcw);
    const out = this.mesh;
    out.fill(0);
    out.set(mesh.slice(0, out.length));
    applySkeletonControls(out, landmarks, new Set(Array.from(model.boundary)));
    const tpsCoreVertices = copyTpsStableCore(out, tpsMesh);
    const mcpJunctions = snapMcpJunctionsToMediaPipe(out, landmarks);
    const nativeBoundaryVertices = copyNativeBoundary(out, hybridContour, model);
    this.last = {
      vertices: mesh.length / 2,
      triangles: triangles.length / 3,
      handmarks,
      tpsCoreVertices,
      mcpJunctions,
      nativeBoundaryVertices,
    };
    return out;
  }
}
