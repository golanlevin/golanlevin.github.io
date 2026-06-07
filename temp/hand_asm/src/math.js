/**
 * Small numeric helpers shared by the browser runtime.
 *
 * The code intentionally avoids external math dependencies in the frame loop.
 * All matrix solves here are tiny dense systems, so a straightforward
 * Float64Array Gaussian elimination is adequate and keeps allocation sites easy
 * to audit.
 */

/**
 * Compute the Euclidean length of a 2D vector.
 *
 * @param {number} x - X component.
 * @param {number} y - Y component.
 * @returns {number} `sqrt(x*x + y*y)`.
 */
export function hypot2(x, y) {
  return Math.hypot(x, y);
}

/**
 * Clamp a number into a closed interval.
 *
 * @param {number} value - Value to constrain.
 * @param {number} lo - Inclusive lower bound.
 * @param {number} hi - Inclusive upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Solve a dense linear system using Gaussian elimination with partial pivoting.
 *
 * @param {Float64Array|number[]} aIn - Row-major `n x n` matrix.
 * @param {Float64Array|number[]} bIn - Right-hand side vector.
 * @param {number} n - Matrix dimension.
 * @returns {Float64Array} Solution vector.
 */
export function solveLinearSystem(aIn, bIn, n) {
  const a = new Float64Array(aIn);
  const b = new Float64Array(bIn);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let pivotAbs = Math.abs(a[col * n + col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(a[row * n + col]);
      if (value > pivotAbs) {
        pivot = row;
        pivotAbs = value;
      }
    }
    if (pivotAbs < 1e-12) {
      a[col * n + col] += 1e-8;
      pivotAbs = Math.abs(a[col * n + col]);
    }
    if (pivot !== col) {
      for (let k = col; k < n; k += 1) {
        const tmp = a[col * n + k];
        a[col * n + k] = a[pivot * n + k];
        a[pivot * n + k] = tmp;
      }
      const tb = b[col];
      b[col] = b[pivot];
      b[pivot] = tb;
    }
    const diag = a[col * n + col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row * n + col] / diag;
      if (factor === 0) continue;
      a[row * n + col] = 0;
      for (let k = col + 1; k < n; k += 1) {
        a[row * n + k] -= factor * a[col * n + k];
      }
      b[row] -= factor * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let col = row + 1; col < n; col += 1) {
      sum -= a[row * n + col] * x[col];
    }
    x[row] = sum / a[row * n + row];
  }
  return x;
}

/**
 * Compute the median of a short numeric list.
 *
 * @param {number[]} values - Input values.
 * @returns {number} Median, or 0 for an empty list.
 */
export function median(values) {
  if (!values.length) return 0;
  const copy = Array.from(values).sort((a, b) => a - b);
  const mid = copy.length >> 1;
  return copy.length % 2 ? copy[mid] : 0.5 * (copy[mid - 1] + copy[mid]);
}

/**
 * Rolling median for noisy per-frame timing measurements.
 */
export class RollingMedian {
  /**
   * @param {number} [size=60] - Maximum number of samples to retain.
   */
  constructor(size = 60) {
    this.size = size;
    this.values = [];
  }

  /**
   * Add a finite sample to the rolling window.
   *
   * @param {number} value - New timing/value sample.
   */
  push(value) {
    if (!Number.isFinite(value)) return;
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
  }

  /**
   * @returns {number} Median of the retained samples.
   */
  value() {
    return median(this.values);
  }
}

/**
 * Signed area of a triangle in a packed 2D point array.
 *
 * Positive/negative sign is used to detect triangle winding flips after
 * deformation.
 *
 * @param {Float64Array|number[]} points - Packed `[x0,y0,x1,y1,...]` points.
 * @param {number[]} tri - Three vertex indices.
 * @returns {number} Signed triangle area.
 */
export function triangleSignedArea(points, tri) {
  const ia = tri[0] * 2;
  const ib = tri[1] * 2;
  const ic = tri[2] * 2;
  const ax = points[ia];
  const ay = points[ia + 1];
  const bx = points[ib];
  const by = points[ib + 1];
  const cx = points[ic];
  const cy = points[ic + 1];
  return 0.5 * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}
