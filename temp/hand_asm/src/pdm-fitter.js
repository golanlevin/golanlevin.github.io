import { clamp, solveLinearSystem } from "./math.js";

/**
 * PDM fitting stage.
 *
 * This module fits the full 151-vertex PCA/PDM model to 21 MediaPipe landmark
 * points. It mirrors the Python offline fitter: estimate a similarity transform,
 * solve regularized PCA coefficients in model space, clamp coefficients, and
 * transform the reconstructed mesh back to image coordinates.
 */

/**
 * Evaluate the model's MediaPipe correspondence points on a packed shape.
 *
 * @param {Float64Array} shape - Packed 151-vertex shape.
 * @param {object} model - Runtime model with learned correspondences.
 * @param {Float64Array} out - Packed 21-point output buffer.
 * @returns {Float64Array} `out`.
 */
function correspondencePoints(shape, model, out) {
  const corr = model.correspondence;
  for (let i = 0; i < 21; i += 1) {
    let x = 0;
    let y = 0;
    for (const point of corr[i].points) {
      const j = point.vertex * 2;
      x += point.weight * shape[j];
      y += point.weight * shape[j + 1];
    }
    out[2 * i] = x;
    out[2 * i + 1] = y;
  }
  return out;
}

/**
 * Estimate a weighted 2D similarity transform from source to target points.
 *
 * The transform is scale + rotation + translation, with no shear. Reflection is
 * intentionally not allowed because the model orientation is already canonical.
 *
 * @param {Float64Array} source - Packed source points.
 * @param {Float64Array} target - Packed target points.
 * @param {Float64Array} weights - Per-point weights.
 * @returns {{scale:number,cos:number,sin:number,tx:number,ty:number}} Similarity transform.
 */
function estimateSimilarity(source, target, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) total += Math.max(weights[i], 0);
  if (total <= 1e-12) total = weights.length;
  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = total === weights.length ? 1 / weights.length : Math.max(weights[i], 0) / total;
    sx += w * source[2 * i];
    sy += w * source[2 * i + 1];
    tx += w * target[2 * i];
    ty += w * target[2 * i + 1];
  }
  let a = 0;
  let b = 0;
  let variance = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = total === weights.length ? 1 / weights.length : Math.max(weights[i], 0) / total;
    const x = source[2 * i] - sx;
    const y = source[2 * i + 1] - sy;
    const u = target[2 * i] - tx;
    const v = target[2 * i + 1] - ty;
    a += w * (x * u + y * v);
    b += w * (x * v - y * u);
    variance += w * (x * x + y * y);
  }
  const norm = Math.hypot(a, b);
  const cos = norm > 1e-12 ? a / norm : 1;
  const sin = norm > 1e-12 ? b / norm : 0;
  const scale = norm / Math.max(variance, 1e-12);
  return {
    scale,
    cos,
    sin,
    tx: tx - scale * (cos * sx - sin * sy),
    ty: ty - scale * (sin * sx + cos * sy),
  };
}

/**
 * Apply a similarity transform to a packed shape.
 *
 * @param {Float64Array} shape - Packed source points.
 * @param {object} transform - Similarity transform from `estimateSimilarity`.
 * @param {Float64Array} out - Output buffer.
 * @returns {Float64Array} `out`.
 */
function applySimilarity(shape, transform, out) {
  for (let i = 0; i < shape.length / 2; i += 1) {
    const x = shape[2 * i];
    const y = shape[2 * i + 1];
    out[2 * i] = transform.scale * (transform.cos * x - transform.sin * y) + transform.tx;
    out[2 * i + 1] = transform.scale * (transform.sin * x + transform.cos * y) + transform.ty;
  }
  return out;
}

/**
 * Map packed image-space points back into current model-aligned space.
 *
 * @param {Float64Array} points - Packed image-space points.
 * @param {object} transform - Model-to-image similarity transform.
 * @param {Float64Array} out - Output buffer.
 * @returns {Float64Array} `out`.
 */
function invertSimilarityPoints(points, transform, out) {
  const invScale = 1 / Math.max(transform.scale, 1e-12);
  for (let i = 0; i < points.length / 2; i += 1) {
    const x = (points[2 * i] - transform.tx) * invScale;
    const y = (points[2 * i + 1] - transform.ty) * invScale;
    out[2 * i] = transform.cos * x + transform.sin * y;
    out[2 * i + 1] = -transform.sin * x + transform.cos * y;
  }
  return out;
}

/**
 * Solve regularized weighted least squares for PCA coefficients.
 *
 * Only MediaPipe correspondence constraints are used here; contour/image-edge
 * evidence is applied later by ASM/TPS stages.
 *
 * @param {object} model - Runtime PDM model.
 * @param {Float64Array} landmarksModel - 21 landmarks in model-aligned coordinates.
 * @param {Float64Array} visibility - Per-landmark visibility/confidence.
 * @param {number} regularization - Prior strength for `b_i^2 / eigenvalue_i`.
 * @param {number} clampSigma - Coefficient clamp in standard deviations.
 * @param {Float64Array} outCoeffs - Output PCA coefficient buffer.
 * @returns {Float64Array} `outCoeffs`.
 */
function fitCoefficients(model, landmarksModel, visibility, regularization, clampSigma, outCoeffs) {
  const modes = model.nModes;
  const dims = model.nVertices * 2;
  const lhs = new Float64Array(modes * modes);
  const rhs = new Float64Array(modes);
  for (let mp = 0; mp < 21; mp += 1) {
    const entry = model.correspondence[mp];
    const weight = Math.sqrt(Math.max(entry.landmarkWeight, 0) * Math.max(visibility[mp], 0));
    if (weight <= 0) continue;
    for (let axis = 0; axis < 2; axis += 1) {
      const rowBasis = new Float64Array(modes);
      let meanValue = 0;
      for (const point of entry.points) {
        const dim = 2 * point.vertex + axis;
        meanValue += point.weight * model.mean[dim];
        for (let mode = 0; mode < modes; mode += 1) {
          rowBasis[mode] += point.weight * model.components[mode * dims + dim];
        }
      }
      const residual = landmarksModel[2 * mp + axis] - meanValue;
      for (let i = 0; i < modes; i += 1) {
        const wi = weight * rowBasis[i];
        rhs[i] += wi * weight * residual;
        for (let j = 0; j < modes; j += 1) {
          lhs[i * modes + j] += wi * weight * rowBasis[j];
        }
      }
    }
  }
  for (let i = 0; i < modes; i += 1) {
    lhs[i * modes + i] += regularization / Math.max(model.eigenvalues[i], 1e-12);
  }
  const solved = solveLinearSystem(lhs, rhs, modes);
  for (let i = 0; i < modes; i += 1) {
    const limit = clampSigma * Math.sqrt(Math.max(model.eigenvalues[i], 1e-12));
    outCoeffs[i] = clamp(solved[i], -limit, limit);
  }
  return outCoeffs;
}

/**
 * Reconstruct a packed model-space mesh from PCA coefficients.
 *
 * @param {object} model - Runtime PDM model.
 * @param {Float64Array} coeffs - PCA coefficient vector.
 * @param {Float64Array} out - Output packed mesh.
 * @returns {Float64Array} `out`.
 */
function reconstruct(model, coeffs, out) {
  out.set(model.mean);
  const dims = model.nVertices * 2;
  for (let mode = 0; mode < model.nModes; mode += 1) {
    const b = coeffs[mode];
    const offset = mode * dims;
    for (let d = 0; d < dims; d += 1) {
      out[d] += b * model.components[offset + d];
    }
  }
  return out;
}

/**
 * Stateful PDM fitter with reusable typed-array buffers.
 */
export class PdmFitter {
  /**
   * @param {object} [options] - Fitting options.
   * @param {number} [options.regularization=1e-4] - PCA prior strength.
   * @param {number} [options.clampSigma=3.0] - Coefficient clamp in sigma units.
   * @param {number} [options.iterations=20] - Alternating transform/PCA iterations.
   */
  constructor(options = {}) {
    this.regularization = options.regularization ?? 1e-4;
    this.clampSigma = options.clampSigma ?? 3.0;
    this.iterations = options.iterations ?? 20;
    this.landmarkVec = new Float64Array(42);
    this.visibility = new Float64Array(21);
    this.modelCorr = new Float64Array(42);
    this.imageCorr = new Float64Array(42);
    this.landmarksModel = new Float64Array(42);
  }

  /**
   * Fit a runtime PDM model to 21 MediaPipe landmarks.
   *
   * @param {object} model - Runtime model loaded by `HandModelLoader`.
   * @param {Array<{x:number,y:number,visibility?:number}>} landmarks - MediaPipe landmarks in canvas pixels.
   * @returns {object} Fit result containing mesh, initial mesh, transform, coefficients, and fitted correspondences.
   */
  fit(model, landmarks) {
    const dims = model.nVertices * 2;
    if (!this.coeffs || this.coeffs.length !== model.nModes) this.coeffs = new Float64Array(model.nModes);
    if (!this.current || this.current.length !== dims) {
      this.current = new Float64Array(dims);
      this.modelShape = new Float64Array(dims);
      this.mesh = new Float64Array(dims);
      this.initialMesh = new Float64Array(dims);
    }
    for (let i = 0; i < 21; i += 1) {
      this.landmarkVec[2 * i] = landmarks[i].x;
      this.landmarkVec[2 * i + 1] = landmarks[i].y;
      this.visibility[i] = landmarks[i].visibility ?? 1;
    }
    const pointWeights = new Float64Array(21);
    for (let i = 0; i < 21; i += 1) {
      pointWeights[i] = model.correspondence[i].landmarkWeight * this.visibility[i];
    }
    this.current.set(model.mean);
    let transform = estimateSimilarity(correspondencePoints(this.current, model, this.modelCorr), this.landmarkVec, pointWeights);
    applySimilarity(model.mean, transform, this.initialMesh);
    this.coeffs.fill(0);
    for (let iter = 0; iter < this.iterations; iter += 1) {
      transform = estimateSimilarity(correspondencePoints(this.current, model, this.modelCorr), this.landmarkVec, pointWeights);
      invertSimilarityPoints(this.landmarkVec, transform, this.landmarksModel);
      fitCoefficients(model, this.landmarksModel, this.visibility, this.regularization, this.clampSigma, this.coeffs);
      reconstruct(model, this.coeffs, this.current);
    }
    transform = estimateSimilarity(correspondencePoints(this.current, model, this.modelCorr), this.landmarkVec, pointWeights);
    this.modelShape.set(this.current);
    applySimilarity(this.modelShape, transform, this.mesh);
    correspondencePoints(this.mesh, model, this.imageCorr);
    return {
      transform,
      coefficients: this.coeffs,
      modelShape: this.modelShape,
      mesh: this.mesh,
      initialMesh: this.initialMesh,
      fittedCorrespondence: this.imageCorr,
    };
  }
}
