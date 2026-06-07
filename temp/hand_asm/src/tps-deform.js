import { solveLinearSystem, triangleSignedArea } from "./math.js";

/**
 * Thin-plate-spline radial basis function in squared-radius form.
 *
 * @param {number} r2 - Squared distance from a control point.
 * @returns {number} TPS basis value.
 */
function phi(r2) {
  if (r2 <= 1e-12) return 0;
  return 0.5 * r2 * Math.log(r2);
}

/**
 * Boundary-driven TPS deformer.
 *
 * The source controls are the PDM contour points and the target controls are
 * the final snapped contour. Applying the warp to all 151 vertices produces the
 * `TPS mesh`, which Frankenmesh2 then uses as its base.
 */
export class TpsDeformer {
  /**
   * Create an empty deformer. Call `build()` before `apply()`.
   */
  constructor() {
    this.lastBoundaryCount = 0;
  }

  /**
   * Build a TPS displacement field from source contour to target contour.
   *
   * @param {Float64Array} sourceBoundary - Packed source boundary points.
   * @param {Float64Array} targetBoundary - Packed target boundary points.
   */
  build(sourceBoundary, targetBoundary) {
    const n = sourceBoundary.length / 2;
    const size = n + 3;
    const a = new Float64Array(size * size);
    const bx = new Float64Array(size);
    const by = new Float64Array(size);
    for (let i = 0; i < n; i += 1) {
      const xi = sourceBoundary[2 * i];
      const yi = sourceBoundary[2 * i + 1];
      for (let j = 0; j < n; j += 1) {
        const dx = xi - sourceBoundary[2 * j];
        const dy = yi - sourceBoundary[2 * j + 1];
        a[i * size + j] = phi(dx * dx + dy * dy);
      }
      a[i * size + n] = 1;
      a[i * size + n + 1] = xi;
      a[i * size + n + 2] = yi;
      a[n * size + i] = 1;
      a[(n + 1) * size + i] = xi;
      a[(n + 2) * size + i] = yi;
      bx[i] = targetBoundary[2 * i] - xi;
      by[i] = targetBoundary[2 * i + 1] - yi;
    }
    for (let i = 0; i < n; i += 1) {
      a[i * size + i] += 1e-3;
    }
    this.source = new Float64Array(sourceBoundary);
    this.wx = solveLinearSystem(a, bx, size);
    this.wy = solveLinearSystem(a, by, size);
    this.n = n;
  }

  /**
   * Apply the most recently built TPS field to a packed mesh.
   *
   * @param {Float64Array} mesh - Packed 151-vertex source mesh.
   * @param {Float64Array} [out] - Optional output buffer.
   * @returns {Float64Array} Deformed mesh.
   */
  apply(mesh, out) {
    const n = this.n;
    const size = n + 3;
    if (!out || out.length !== mesh.length) out = new Float64Array(mesh.length);
    for (let vi = 0; vi < mesh.length / 2; vi += 1) {
      const x = mesh[2 * vi];
      const y = mesh[2 * vi + 1];
      let dx = this.wx[n] + this.wx[n + 1] * x + this.wx[n + 2] * y;
      let dy = this.wy[n] + this.wy[n + 1] * x + this.wy[n + 2] * y;
      for (let i = 0; i < n; i += 1) {
        const sx = this.source[2 * i];
        const sy = this.source[2 * i + 1];
        const basis = phi((x - sx) ** 2 + (y - sy) ** 2);
        dx += this.wx[i] * basis;
        dy += this.wy[i] * basis;
      }
      out[2 * vi] = x + dx;
      out[2 * vi + 1] = y + dy;
    }
    return out;
  }
}

/**
 * Compare triangle validity between a reference mesh and a deformed mesh.
 *
 * @param {Float64Array} reference - Packed reference mesh.
 * @param {Float64Array} mesh - Packed deformed mesh.
 * @param {number[][]} triangles - Triangle vertex index list.
 * @returns {{flips:number, degenerates:number}} Triangle quality summary.
 */
export function triangleStats(reference, mesh, triangles) {
  let flips = 0;
  let degenerates = 0;
  for (const tri of triangles) {
    const refArea = triangleSignedArea(reference, tri);
    const area = triangleSignedArea(mesh, tri);
    if (Math.abs(area) < 1e-5) degenerates += 1;
    if (Math.abs(refArea) > 1e-8 && Math.sign(refArea) !== Math.sign(area)) flips += 1;
  }
  return { flips, degenerates };
}
