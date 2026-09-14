import cdt2d from "cdt2d";

const DRAW_SAMPLE_SPACING = 4;
const DEFAULT_WASM_FILE = "arap2d_bg.wasm";
const RESOLUTION_PRESETS = [
  {
    name: "low",
    subdivisions: 0,
    douglasPeuckerEpsilon: 7,
    boundaryMaxSegment: 34,
    maxBoundaryPoints: 48,
    interiorSpacingScale: 1.45,
  },
  {
    name: "medium",
    subdivisions: 1,
    douglasPeuckerEpsilon: 5,
    boundaryMaxSegment: 24,
    maxBoundaryPoints: 96,
    interiorSpacingScale: 1,
  },
];

const libraryScriptUrl = (() => {
  if (typeof document === "undefined") return null;
  if (document.currentScript?.src) return document.currentScript.src;
  const scripts = [...document.querySelectorAll("script[src]")];
  const ownScript = scripts.reverse().find((script) => /arap-p5(?:\.min)?\.js(?:[?#].*)?$/.test(script.src));
  return ownScript?.src || null;
})();

let configuredWasmUrl = null;
let wasmReadyPromise = null;

function toPoint(pointOrX, y) {
  if (Array.isArray(pointOrX)) return { x: Number(pointOrX[0]), y: Number(pointOrX[1]) };
  if (typeof pointOrX === "object" && pointOrX !== null) {
    return { x: Number(pointOrX.x), y: Number(pointOrX.y) };
  }
  return { x: Number(pointOrX), y: Number(y) };
}

function toPointList(points) {
  return points.map((point) => toPoint(point));
}

function defaultWasmUrl() {
  if (!libraryScriptUrl) return DEFAULT_WASM_FILE;
  return new URL(DEFAULT_WASM_FILE, libraryScriptUrl).toString();
}

export function setWasmUrl(url) {
  configuredWasmUrl = url;
  wasmReadyPromise = null;
}

export async function initialize(options = {}) {
  if (options.wasmUrl) setWasmUrl(options.wasmUrl);
  if (wasmReadyPromise) return wasmReadyPromise;
  const loader = globalThis.wasm_bindgen;
  if (typeof loader !== "function") {
    throw new Error("ArapP5 could not find wasm_bindgen. Make sure arap-p5.js is loaded before sketch.js.");
  }
  const wasmUrl = configuredWasmUrl || defaultWasmUrl();
  wasmReadyPromise = Promise.resolve(loader(wasmUrl)).then(() => loader);
  try {
    return await wasmReadyPromise;
  } catch (error) {
    wasmReadyPromise = null;
    throw error;
  }
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function interpolate(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function positiveShell(points) {
  return polygonArea(points) < 0 ? points.slice().reverse() : points;
}

function removeClosingDuplicate(points, epsilon = 1) {
  if (points.length > 2 && dist(points[0], points[points.length - 1]) <= epsilon) {
    return points.slice(0, -1);
  }
  return points;
}

function dedupeConsecutivePoints(points, epsilon = 0.5) {
  const out = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > epsilon) out.push(p);
  }
  return removeClosingDuplicate(out, epsilon);
}

function densifyClosedPath(points, spacing) {
  if (points.length < 2) return points;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = dist(a, b);
    const steps = Math.max(1, Math.ceil(length / spacing));
    out.push(a);
    for (let step = 1; step < steps; step++) out.push(interpolate(a, b, step / steps));
  }
  return out;
}

function perpendicularDistanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function douglasPeuckerOpen(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDistance = -1;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceToSegment(points[i], first, last);
    if (d > maxDistance) {
      maxDistance = d;
      splitIndex = i;
    }
  }
  if (maxDistance <= epsilon) return [first, last];
  const left = douglasPeuckerOpen(points.slice(0, splitIndex + 1), epsilon);
  const right = douglasPeuckerOpen(points.slice(splitIndex), epsilon);
  return left.slice(0, -1).concat(right);
}

function polygonCentroid(points) {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < 1e-7) {
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

function douglasPeuckerClosed(points, epsilon) {
  if (points.length <= 3) return points;
  const center = polygonCentroid(points);
  let startIndex = 0;
  let startDistance = -1;
  points.forEach((p, i) => {
    const d = dist(p, center);
    if (d > startDistance) {
      startDistance = d;
      startIndex = i;
    }
  });
  const rotated = points.slice(startIndex).concat(points.slice(0, startIndex));
  const simplified = douglasPeuckerOpen([...rotated, rotated[0]], epsilon);
  const closed = removeClosingDuplicate(simplified, 1e-6);
  return closed.length >= 3 ? closed : points;
}

function removeNearCollinear(points, epsilon = 0.015) {
  if (points.length < 4) return points;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const ux = curr.x - prev.x;
    const uy = curr.y - prev.y;
    const vx = next.x - curr.x;
    const vy = next.y - curr.y;
    const cross = Math.abs(ux * vy - uy * vx);
    const scale = Math.max(1, Math.hypot(ux, uy) * Math.hypot(vx, vy));
    if (cross / scale > epsilon || dist(prev, next) < 1) out.push(curr);
  }
  return out.length >= 3 ? out : points;
}

function subdivideLongBoundarySegments(points, maxSegmentLength, maxPoints) {
  if (points.length < 2) return points;
  const out = [];
  const perimeter = points.reduce((sum, p, i) => sum + dist(p, points[(i + 1) % points.length]), 0);
  const scale = Math.max(1, perimeter / (maxSegmentLength * maxPoints));
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(dist(a, b) / (maxSegmentLength * scale)));
    out.push(a);
    for (let step = 1; step < steps; step++) out.push(interpolate(a, b, step / steps));
  }
  return out;
}

function simplifyBoundary(points, preset) {
  const cleaned = dedupeConsecutivePoints(points);
  if (cleaned.length < 3) return cleaned;
  const dense = densifyClosedPath(cleaned, DRAW_SAMPLE_SPACING);
  const simplified = removeNearCollinear(douglasPeuckerClosed(dense, preset.douglasPeuckerEpsilon));
  return subdivideLongBoundarySegments(simplified, preset.boundaryMaxSegment, preset.maxBoundaryPoints);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function distanceToBoundary(point, boundary) {
  let best = Infinity;
  for (let i = 0; i < boundary.length; i++) {
    best = Math.min(best, perpendicularDistanceToSegment(point, boundary[i], boundary[(i + 1) % boundary.length]));
  }
  return best;
}

function boundaryBounds(boundary) {
  return boundary.reduce(
    (box, p) => ({
      minX: Math.min(box.minX, p.x),
      minY: Math.min(box.minY, p.y),
      maxX: Math.max(box.maxX, p.x),
      maxY: Math.max(box.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function interiorSampleSpacing(boundary, preset) {
  const area = Math.max(1, Math.abs(polygonArea(boundary)));
  return Math.max(30, Math.min(68, (Math.sqrt(area) / 6) * preset.interiorSpacingScale));
}

function addUniqueVertex(vertices, point, epsilon = 1e-6) {
  for (let i = 0; i < vertices.length; i++) {
    if (dist(vertices[i], point) <= epsilon) return i;
  }
  vertices.push({ x: point.x, y: point.y });
  return vertices.length - 1;
}

function addInteriorSamples(vertices, boundary, preset) {
  const box = boundaryBounds(boundary);
  const spacing = interiorSampleSpacing(boundary, preset);
  const rowHeight = spacing * Math.sqrt(3) * 0.5;
  const clearance = spacing * 0.38;
  let row = 0;
  for (let y = box.minY + rowHeight * 0.5; y <= box.maxY - rowHeight * 0.25; y += rowHeight) {
    const offset = row % 2 === 0 ? spacing * 0.5 : 0;
    for (let x = box.minX + offset; x <= box.maxX; x += spacing) {
      const p = { x, y };
      if (pointInPolygon(p, boundary) && distanceToBoundary(p, boundary) > clearance) {
        addUniqueVertex(vertices, p, 0.5);
      }
    }
    row += 1;
  }
}

function buildControlMesh(boundary, preset, extraPoints) {
  const vertices = boundary.map((p) => ({ x: p.x, y: p.y }));
  const boundaryCount = vertices.length;
  for (const p of extraPoints) {
    if (pointInPolygon(p, boundary) || distanceToBoundary(p, boundary) <= 1) {
      addUniqueVertex(vertices, p, 0.5);
    }
  }
  addInteriorSamples(vertices, boundary, preset);
  const points = vertices.map((p) => [p.x, p.y]);
  const edges = boundary.map((_, i) => [i, (i + 1) % boundary.length]);
  const triangles = cdt2d(points, edges, { exterior: false, delaunay: true });
  return { vertices, triangles, polygon: boundary, boundaryCount };
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildEdgeInfo(triangles) {
  const edges = new Map();
  triangles.forEach((tri) => {
    for (const [a, b, opposite] of [
      [tri[0], tri[1], tri[2]],
      [tri[1], tri[2], tri[0]],
      [tri[2], tri[0], tri[1]],
    ]) {
      const key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), opposites: [] });
      edges.get(key).opposites.push(opposite);
    }
  });
  const boundaryNeighbors = new Map();
  for (const edge of edges.values()) {
    if (edge.opposites.length !== 1) continue;
    if (!boundaryNeighbors.has(edge.a)) boundaryNeighbors.set(edge.a, []);
    if (!boundaryNeighbors.has(edge.b)) boundaryNeighbors.set(edge.b, []);
    boundaryNeighbors.get(edge.a).push(edge.b);
    boundaryNeighbors.get(edge.b).push(edge.a);
  }
  return { edges, boundaryNeighbors };
}

function oppositeAcross(edges, a, b, exclude) {
  const edge = edges.get(edgeKey(a, b));
  if (!edge) return null;
  return edge.opposites.find((idx) => idx !== exclude) ?? null;
}

function addScaled(out, point, scale) {
  out.x += point.x * scale;
  out.y += point.y * scale;
}

function boundaryButterflyPoint(vertices, boundaryNeighbors, a, b) {
  const va = vertices[a];
  const vb = vertices[b];
  const prev = (boundaryNeighbors.get(a) || []).find((idx) => idx !== b);
  const next = (boundaryNeighbors.get(b) || []).find((idx) => idx !== a);
  if (prev == null || next == null) return { x: (va.x + vb.x) * 0.5, y: (va.y + vb.y) * 0.5 };
  const vp = vertices[prev];
  const vn = vertices[next];
  return {
    x: (9 * va.x + 9 * vb.x - vp.x - vn.x) / 16,
    y: (9 * va.y + 9 * vb.y - vp.y - vn.y) / 16,
  };
}

function butterflyPoint(vertices, topology, a, b) {
  const { edges, boundaryNeighbors } = topology;
  const edge = edges.get(edgeKey(a, b));
  const va = vertices[a];
  const vb = vertices[b];
  if (!edge || edge.opposites.length !== 2) return boundaryButterflyPoint(vertices, boundaryNeighbors, a, b);
  const [c, d] = edge.opposites;
  const outer = [
    oppositeAcross(edges, a, c, b),
    oppositeAcross(edges, b, c, a),
    oppositeAcross(edges, a, d, b),
    oppositeAcross(edges, b, d, a),
  ];
  if (outer.some((idx) => idx == null)) return { x: (va.x + vb.x) * 0.5, y: (va.y + vb.y) * 0.5 };
  const out = { x: 0, y: 0 };
  addScaled(out, va, 0.5);
  addScaled(out, vb, 0.5);
  addScaled(out, vertices[c], 0.125);
  addScaled(out, vertices[d], 0.125);
  outer.forEach((idx) => addScaled(out, vertices[idx], -0.0625));
  return out;
}

function butterflySubdivision(mesh, iterations = 1) {
  let vertices = mesh.vertices.map((p) => ({ x: p.x, y: p.y }));
  let triangles = mesh.triangles.map((tri) => [...tri]);
  let boundaryCount = mesh.boundaryCount;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const topology = buildEdgeInfo(triangles);
    const edgeVertices = new Map();
    const nextVertices = vertices.map((p) => ({ x: p.x, y: p.y }));
    const getEdgeVertex = (a, b) => {
      const key = edgeKey(a, b);
      if (!edgeVertices.has(key)) {
        edgeVertices.set(key, nextVertices.length);
        nextVertices.push(butterflyPoint(vertices, topology, a, b));
      }
      return edgeVertices.get(key);
    };
    const nextTriangles = [];
    for (const [a, b, c] of triangles) {
      const ab = getEdgeVertex(a, b);
      const bc = getEdgeVertex(b, c);
      const ca = getEdgeVertex(c, a);
      nextTriangles.push([a, ab, ca]);
      nextTriangles.push([ab, b, bc]);
      nextTriangles.push([ca, bc, c]);
      nextTriangles.push([ab, bc, ca]);
    }
    vertices = nextVertices;
    triangles = nextTriangles;
  }
  return { vertices, triangles, polygon: mesh.polygon, boundaryCount };
}

function resolutionPreset(resolution) {
  if (typeof resolution === "string") {
    const found = RESOLUTION_PRESETS.find((preset) => preset.name === resolution.toLowerCase());
    if (found) return found;
  }
  const index = Math.max(0, Math.min(RESOLUTION_PRESETS.length - 1, Math.round(Number(resolution) || 0)));
  return RESOLUTION_PRESETS[index];
}

function triangulatePolygon(rawPath, options = {}) {
  const preset = resolutionPreset(options.resolution ?? 1);
  const boundary = positiveShell(simplifyBoundary(toPointList(rawPath), preset));
  if (boundary.length < 3) throw new Error("ArapShape needs at least three boundary vertices.");
  const controlMesh = buildControlMesh(boundary, preset, options.extraPoints || []);
  const mesh = butterflySubdivision(controlMesh, preset.subdivisions);
  mesh.sourcePath = toPointList(rawPath);
  mesh.resolutionName = preset.name;
  return mesh;
}

function flattenVertices(vertices) {
  const data = new Float64Array(vertices.length * 2);
  vertices.forEach((p, i) => {
    data[2 * i] = p.x;
    data[2 * i + 1] = p.y;
  });
  return data;
}

function flattenTriangles(triangles) {
  const data = new Uint32Array(triangles.length * 3);
  triangles.forEach((tri, i) => {
    data[3 * i] = tri[0];
    data[3 * i + 1] = tri[1];
    data[3 * i + 2] = tri[2];
  });
  return data;
}

function nearestIndexIn(vertices, point, used = null) {
  let best = null;
  let bestDistance = Infinity;
  vertices.forEach((p, index) => {
    if (used?.has(index)) return;
    const d = dist(point, p);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

function clonePoint(p) {
  return { x: p.x, y: p.y };
}

export class ArapShape {
  constructor(boundaryVertices, options = {}) {
    this.boundaryVertices = toPointList(boundaryVertices);
    this.options = { resolution: options.resolution ?? 1, scaleAdjust: options.scaleAdjust ?? true };
    this.pins = [];
    this.controls = [];
    this.mesh = null;
    this.deformed = [];
    this.solver = null;
    this.constrained = [];
    this.dirtySolver = true;

    for (const pin of options.pins || []) this.addPin(pin);
    for (const control of options.controls || []) this.addControl(control);
  }

  addPin(pointOrX, y) {
    const point = toPoint(pointOrX, y);
    this.pins.push({ rest: point, meshIndex: null });
    this.dirtySolver = true;
    return this.pins.length - 1;
  }

  addControl(pointOrX, y) {
    const point = toPoint(pointOrX, y);
    this.controls.push({ rest: point, target: clonePoint(point), meshIndex: null });
    this.dirtySolver = true;
    return this.controls.length - 1;
  }

  async build(options = {}) {
    Object.assign(this.options, options);
    await initialize(options);
    const extraPoints = [...this.pins.map((pin) => pin.rest), ...this.controls.map((control) => control.rest)];
    this.mesh = triangulatePolygon(this.boundaryVertices, {
      resolution: this.options.resolution,
      extraPoints,
    });
    const used = new Set();
    for (const pin of this.pins) {
      pin.meshIndex = nearestIndexIn(this.mesh.vertices, pin.rest, used);
      if (pin.meshIndex != null) used.add(pin.meshIndex);
    }
    for (const control of this.controls) {
      control.meshIndex = nearestIndexIn(this.mesh.vertices, control.rest, used);
      if (control.meshIndex != null) used.add(control.meshIndex);
    }
    this.deformed = this.mesh.vertices.map(clonePoint);
    this.dirtySolver = true;
    this.update();
    return this;
  }

  rebuild(options = {}) {
    return this.build(options);
  }

  async setResolution(resolution) {
    this.options.resolution = resolution;
    if (!this.mesh) return this;
    return this.rebuild();
  }

  setBoundary(boundaryVertices) {
    this.boundaryVertices = toPointList(boundaryVertices);
    this.mesh = null;
    this.solver = null;
    this.dirtySolver = true;
  }

  moveControl(index, pointOrX, y) {
    const control = this.controls[index];
    if (!control) throw new Error(`No control exists at index ${index}.`);
    control.target = toPoint(pointOrX, y);
    this.update();
  }

  setControl(index, pointOrX, y) {
    this.moveControl(index, pointOrX, y);
  }

  resetControls() {
    for (const control of this.controls) control.target = clonePoint(control.rest);
    this.update();
  }

  compileSolver() {
    if (!this.mesh) throw new Error("Call build() before deforming an ArapShape.");
    const constrained = [
      ...this.pins.map((pin) => pin.meshIndex),
      ...this.controls.map((control) => control.meshIndex),
    ].filter((idx) => idx != null);
    this.constrained = [...new Set(constrained)].sort((a, b) => a - b);
    if (this.constrained.length < 2) {
      this.solver = null;
      return false;
    }
    const WasmArap = globalThis.wasm_bindgen?.WasmArap;
    if (!WasmArap) throw new Error("ArapP5 has not initialized its WebAssembly solver.");
    this.solver = new WasmArap(
      flattenVertices(this.mesh.vertices),
      flattenTriangles(this.mesh.triangles),
      new Uint32Array(this.constrained),
    );
    this.dirtySolver = false;
    return true;
  }

  targetForMeshIndex(meshIndex) {
    for (const pin of this.pins) {
      if (pin.meshIndex === meshIndex) return this.mesh.vertices[meshIndex];
    }
    for (const control of this.controls) {
      if (control.meshIndex === meshIndex) return control.target;
    }
    return this.mesh.vertices[meshIndex];
  }

  update() {
    if (!this.mesh) return;
    if (this.dirtySolver && !this.compileSolver()) {
      this.deformed = this.mesh.vertices.map(clonePoint);
      return;
    }
    if (!this.solver) {
      this.deformed = this.mesh.vertices.map(clonePoint);
      return;
    }
    const targets = new Float64Array(this.constrained.length * 2);
    this.constrained.forEach((meshIndex, i) => {
      const p = this.targetForMeshIndex(meshIndex);
      targets[2 * i] = p.x;
      targets[2 * i + 1] = p.y;
    });
    const result = this.solver.deform(targets, this.options.scaleAdjust);
    this.deformed = [];
    for (let i = 0; i < result.length; i += 2) this.deformed.push({ x: result[i], y: result[i + 1] });
  }

  getBoundary(options = {}) {
    if (!this.mesh) return this.boundaryVertices.map(clonePoint);
    const source = options.rest ? this.mesh.vertices : this.deformed;
    return source.slice(0, this.mesh.boundaryCount).map(clonePoint);
  }

  getRestBoundary() {
    return this.getBoundary({ rest: true });
  }

  getMesh() {
    if (!this.mesh) return null;
    return {
      vertices: this.mesh.vertices.map(clonePoint),
      deformedVertices: this.deformed.map(clonePoint),
      triangles: this.mesh.triangles.map((tri) => [...tri]),
      boundaryCount: this.mesh.boundaryCount,
      resolution: this.mesh.resolutionName,
    };
  }

  drawDebug(p5OrOptions = globalThis, maybeOptions = {}) {
    if (!this.mesh) return;
    const looksLikeP5 = p5OrOptions && typeof p5OrOptions.triangle === "function";
    const p = looksLikeP5 ? p5OrOptions : globalThis;
    const options = looksLikeP5 ? maybeOptions : p5OrOptions || {};
    if (typeof p.triangle !== "function") {
      throw new Error("ArapShape.drawDebug() needs p5 drawing functions. Use drawDebug() in global mode or drawDebug(this) in instance mode.");
    }

    const strokeColor = options.stroke ?? [60, 120, 180, 80];
    const strokeWeight = options.strokeWeight ?? 1;
    if (typeof p.push === "function") p.push();
    if (typeof p.noFill === "function") p.noFill();
    if (typeof p.stroke === "function") {
      Array.isArray(strokeColor) ? p.stroke(...strokeColor) : p.stroke(strokeColor);
    }
    if (typeof p.strokeWeight === "function") p.strokeWeight(strokeWeight);

    for (const tri of this.mesh.triangles) {
      const a = this.deformed[tri[0]];
      const b = this.deformed[tri[1]];
      const c = this.deformed[tri[2]];
      p.triangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
    if (typeof p.pop === "function") p.pop();
  }

  getPins() {
    return this.pins.map((pin, index) => ({
      index,
      meshIndex: pin.meshIndex,
      rest: clonePoint(pin.rest),
      x: pin.rest.x,
      y: pin.rest.y,
    }));
  }

  getControls() {
    return this.controls.map((control, index) => ({
      index,
      meshIndex: control.meshIndex,
      rest: clonePoint(control.rest),
      target: clonePoint(control.target),
      x: control.target.x,
      y: control.target.y,
    }));
  }

  nearestControl(pointOrX, y, maxDistance = 18) {
    const point = toPoint(pointOrX, y);
    let best = -1;
    let bestDistance = maxDistance;
    this.controls.forEach((control, index) => {
      const d = dist(point, control.target);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }
}

export const utils = {
  distance: dist,
  pointInPolygon,
};
