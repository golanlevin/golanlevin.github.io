import { clamp } from "./math.js";

/**
 * ASM-style contour refinement.
 *
 * The PDM fit gives a stable anatomical estimate. This module only refines the
 * 95-point external boundary using local image evidence in a small normal-search
 * window. It does not train a model, run MediaPipe, or deform the full mesh.
 */

export const SNAP_PRESETS = {
  safe: "safe",
  default: "default",
  aggressive: "aggressive",
  direct: "direct",
};

const FINGERTIP_VERTICES = new Set([19, 40, 61, 82, 103]);
const CROTCH_VERTICES = new Set([138, 140, 142, 0, 146, 147]);
const HIGH_CURVATURE_VERTICES = new Set([...FINGERTIP_VERTICES, ...CROTCH_VERTICES]);
const CROTCH_CROWN_MIDPOINTS = new Map([
  [138, [17, 13]], // pinky-ring web aims toward the midpoint between pinky/ring MCPs.
  [140, [13, 9]], // ring-middle web aims toward the midpoint between ring/middle MCPs.
  [142, [9, 5]], // middle-index web aims toward the midpoint between middle/index MCPs.
]);

/**
 * Extract the ordered native boundary loop from a packed 151-vertex mesh.
 *
 * @param {Float64Array} mesh - Packed full mesh.
 * @param {object} model - Runtime model with `boundary` vertex indices.
 * @param {Float64Array} [out] - Optional packed contour output buffer.
 * @returns {Float64Array} Packed 95-point contour.
 */
export function extractContour(mesh, model, out) {
  const boundary = model.boundary;
  if (!out || out.length !== boundary.length * 2) out = new Float64Array(boundary.length * 2);
  for (let i = 0; i < boundary.length; i += 1) {
    const v = boundary[i] * 2;
    out[2 * i] = mesh[v];
    out[2 * i + 1] = mesh[v + 1];
  }
  return out;
}

/**
 * Compute a padded image ROI around a packed contour.
 *
 * @param {Float64Array} points - Packed contour or landmark points.
 * @param {number} width - Image/canvas width.
 * @param {number} height - Image/canvas height.
 * @param {number} [padding=36] - Pixel padding around the bounds.
 * @returns {{x:number,y:number,width:number,height:number}} Clipped ROI rectangle.
 */
export function computeHandRoi(points, width, height, padding = 36) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < points.length / 2; i += 1) {
    const x = points[2 * i];
    const y = points[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  minX = Math.floor(clamp(minX - padding, 0, width - 1));
  minY = Math.floor(clamp(minY - padding, 0, height - 1));
  maxX = Math.ceil(clamp(maxX + padding, minX + 1, width));
  maxY = Math.ceil(clamp(maxY + padding, minY + 1, height));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * ROI-local grayscale/gradient/chroma sampler.
 *
 * This is the main performance optimization in the browser ASM path: build
 * gradient/chroma maps only for the current hand ROI rather than the full frame.
 */
export class RoiGradient {
  /**
   * Create an internal canvas used for ROI pixel reads.
   */
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  /**
   * Extract an ROI from the source canvas and compute normalized gradient/chroma maps.
   *
   * @param {HTMLCanvasElement} sourceCanvas - Canvas containing the current video frame.
   * @param {{x:number,y:number,width:number,height:number}} roi - ROI in canvas pixels.
   * @returns {RoiGradient} This sampler.
   */
  prepare(sourceCanvas, roi) {
    this.roi = roi;
    this.canvas.width = roi.width;
    this.canvas.height = roi.height;
    this.ctx.drawImage(sourceCanvas, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
    const image = this.ctx.getImageData(0, 0, roi.width, roi.height);
    const count = roi.width * roi.height;
    if (!this.gray || this.gray.length !== count) {
      this.gray = new Float32Array(count);
      this.gradient = new Float32Array(count);
      this.cb = new Float32Array(count);
      this.cr = new Float32Array(count);
    }
    const data = image.data;
    for (let i = 0; i < count; i += 1) {
      const j = 4 * i;
      const r = data[j] / 255;
      const g = data[j + 1] / 255;
      const b = data[j + 2] / 255;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      this.gray[i] = y;
      this.cb[i] = 0.5 + 0.5 * (b - y) / 0.9278;
      this.cr[i] = 0.5 + 0.5 * (r - y) / 0.7874;
    }
    let maxGrad = 1e-6;
    for (let y = 0; y < roi.height; y += 1) {
      for (let x = 0; x < roi.width; x += 1) {
        const idx = y * roi.width + x;
        const xm = Math.max(0, x - 1);
        const xp = Math.min(roi.width - 1, x + 1);
        const ym = Math.max(0, y - 1);
        const yp = Math.min(roi.height - 1, y + 1);
        const gx = this.gray[y * roi.width + xp] - this.gray[y * roi.width + xm];
        const gy = this.gray[yp * roi.width + x] - this.gray[ym * roi.width + x];
        const g = Math.hypot(gx, gy);
        this.gradient[idx] = g;
        if (g > maxGrad) maxGrad = g;
      }
    }
    const inv = 1 / maxGrad;
    for (let i = 0; i < count; i += 1) this.gradient[i] = clamp(this.gradient[i] * inv, 0, 1);
    return this;
  }

  /**
   * Bilinearly sample a Float32Array map in full-canvas coordinates.
   *
   * @param {Float32Array} values - ROI-local sampled map.
   * @param {number} x - Full-canvas x coordinate.
   * @param {number} y - Full-canvas y coordinate.
   * @returns {number} Bilinear sample, or 0 outside the ROI.
   */
  sampleArray(values, x, y) {
    const lx = x - this.roi.x;
    const ly = y - this.roi.y;
    if (lx < 0 || ly < 0 || lx >= this.roi.width - 1 || ly >= this.roi.height - 1) return 0;
    const x0 = Math.floor(lx);
    const y0 = Math.floor(ly);
    const fx = lx - x0;
    const fy = ly - y0;
    const w = this.roi.width;
    const i00 = y0 * w + x0;
    const v00 = values[i00];
    const v10 = values[i00 + 1];
    const v01 = values[i00 + w];
    const v11 = values[i00 + w + 1];
    return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;
  }

  /**
   * Sample normalized gradient magnitude at a full-canvas coordinate.
   *
   * @param {number} x - Full-canvas x coordinate.
   * @param {number} y - Full-canvas y coordinate.
   * @returns {number} Gradient magnitude in `[0,1]`.
   */
  sampleCanvas(x, y) {
    return this.sampleArray(this.gradient, x, y);
  }

  /**
   * Sample chroma values at a full-canvas coordinate.
   *
   * @param {number} x - Full-canvas x coordinate.
   * @param {number} y - Full-canvas y coordinate.
   * @returns {{cb:number,cr:number}} Approximate YCbCr chroma channels.
   */
  sampleChroma(x, y) {
    return {
      cb: this.sampleArray(this.cb, x, y),
      cr: this.sampleArray(this.cr, x, y),
    };
  }

  /**
   * Estimate a per-frame skin chroma distribution from 5x5 MediaPipe patches.
   *
   * @param {Array<{x:number,y:number}>} landmarks - MediaPipe landmarks in pixels.
   * @param {number} [patchRadius=2] - Radius for square patches around landmarks.
   * @returns {object|null} Skin model, or null when no samples are in the ROI.
   */
  estimateSkinModel(landmarks, patchRadius = 2) {
    const patchMeans = [];
    for (const point of landmarks ?? []) {
      let cbSum = 0;
      let crSum = 0;
      let count = 0;
      for (let dy = -patchRadius; dy <= patchRadius; dy += 1) {
        for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
          const x = point.x + dx;
          const y = point.y + dy;
          const lx = x - this.roi.x;
          const ly = y - this.roi.y;
          if (lx < 0 || ly < 0 || lx >= this.roi.width - 1 || ly >= this.roi.height - 1) continue;
          const chroma = this.sampleChroma(x, y);
          cbSum += chroma.cb;
          crSum += chroma.cr;
          count += 1;
        }
      }
      if (count > 0) patchMeans.push({ cb: cbSum / count, cr: crSum / count });
    }
    if (!patchMeans.length) {
      this.skinModel = null;
      return null;
    }
    let cbMean = 0;
    let crMean = 0;
    for (const p of patchMeans) {
      cbMean += p.cb;
      crMean += p.cr;
    }
    cbMean /= patchMeans.length;
    crMean /= patchMeans.length;
    let cbVar = 0;
    let crVar = 0;
    for (const p of patchMeans) {
      cbVar += (p.cb - cbMean) ** 2;
      crVar += (p.cr - crMean) ** 2;
    }
    const cbStd = Math.max(Math.sqrt(cbVar / Math.max(patchMeans.length - 1, 1)), 0.025);
    const crStd = Math.max(Math.sqrt(crVar / Math.max(patchMeans.length - 1, 1)), 0.025);
    this.skinModel = { cbMean, crMean, cbStd, crStd, sampleCount: patchMeans.length };
    return this.skinModel;
  }

  /**
   * Return Gaussian skin-likelihood in chroma space.
   *
   * @param {number} x - Full-canvas x coordinate.
   * @param {number} y - Full-canvas y coordinate.
   * @returns {number} Skin likelihood in `[0,1]`, or 0 without a skin model.
   */
  skinLikelihood(x, y) {
    if (!this.skinModel) return 0;
    const chroma = this.sampleChroma(x, y);
    const zCb = (chroma.cb - this.skinModel.cbMean) / this.skinModel.cbStd;
    const zCr = (chroma.cr - this.skinModel.crMean) / this.skinModel.crStd;
    return Math.exp(-0.5 * (zCb * zCb + zCr * zCr));
  }
}

/**
 * Stateful ASM normal-search/refinement engine.
 *
 * The object owns reusable typed arrays to avoid per-frame allocations. `search`
 * fills `raw`, `confidence`, and `displacement`; `blend` converts those into the
 * displayed Final Contour.
 */
export class ContourAsm {
  /**
   * @param {number} [maxBoundary=128] - Maximum supported boundary vertices.
   */
  constructor(maxBoundary = 128) {
    this.raw = new Float64Array(maxBoundary * 2);
    this.searchRaw = new Float64Array(maxBoundary * 2);
    this.confidence = new Float64Array(maxBoundary);
    this.alpha = new Float64Array(maxBoundary);
    this.offsets = new Float64Array(maxBoundary);
    this.measuredOffsets = new Float64Array(maxBoundary);
    this.stableOffsets = new Float64Array(maxBoundary);
    this.hasStableOffsets = false;
    this.smoothedOffsets = new Float64Array(maxBoundary);
    this.displacement = new Float64Array(maxBoundary * 2);
    this.normals = new Float64Array(maxBoundary * 2);
    this.curvatureWork = new Float64Array(maxBoundary * 2);
    this.curvatureNext = new Float64Array(maxBoundary * 2);
  }

  /**
   * Build or reuse a normalized Gaussian-ish tangent kernel.
   *
   * @param {number} width - Requested odd/even profile width.
   * @returns {Float64Array} Normalized kernel with odd length.
   */
  tangentKernel(width) {
    const n = Math.max(1, Math.min(9, Math.round(width) || 1));
    const odd = n % 2 ? n : n + 1;
    if (!this.kernel || this.kernelWidth !== odd) {
      this.kernelWidth = odd;
      this.kernel = new Float64Array(odd);
      const radius = (odd - 1) / 2;
      if (radius === 0) {
        this.kernel[0] = 1;
      } else {
        const sigma = Math.max(radius * 0.65, 0.75);
        let sum = 0;
        for (let i = 0; i < odd; i += 1) {
          const x = i - radius;
          const w = Math.exp(-0.5 * (x / sigma) ** 2);
          this.kernel[i] = w;
          sum += w;
        }
        for (let i = 0; i < odd; i += 1) this.kernel[i] /= sum;
      }
    }
    return this.kernel;
  }

  /**
   * Sample gradient support across a small strip tangent to the contour.
   *
   * This replaces a brittle 1-pixel normal strip with 5/7/9-tap lateral support.
   *
   * @param {RoiGradient} gradient - ROI gradient sampler.
   * @param {number} x - Candidate x coordinate.
   * @param {number} y - Candidate y coordinate.
   * @param {number} tangentX - Unit tangent x component.
   * @param {number} tangentY - Unit tangent y component.
   * @param {Float64Array} kernel - Tangent sampling kernel.
   * @returns {number} Weighted gradient score.
   */
  sampleTangentKernel(gradient, x, y, tangentX, tangentY, kernel) {
    const radius = (kernel.length - 1) / 2;
    let score = 0;
    for (let k = 0; k < kernel.length; k += 1) {
      const offset = k - radius;
      score += kernel[k] * gradient.sampleCanvas(x + offset * tangentX, y + offset * tangentY);
    }
    return score;
  }

  /**
   * Classify a boundary index by semantic curvature role.
   *
   * @param {object} model - Runtime model.
   * @param {number} index - Boundary-loop index, not mesh vertex index.
   * @returns {"crotch"|"fingertip"|"normal"} Curvature role.
   */
  curvatureRole(model, index) {
    const vertex = model.boundary[index];
    if (CROTCH_VERTICES.has(vertex)) return "crotch";
    if (FINGERTIP_VERTICES.has(vertex)) return "fingertip";
    return "normal";
  }

  /**
   * Test whether an index touches a known fingertip/crotch vertex.
   *
   * @param {object} model - Runtime model.
   * @param {number} index - Boundary-loop index.
   * @returns {boolean} True when current/neighbor vertices are high-curvature.
   */
  hasHighCurvatureNeighbor(model, index) {
    const prev = model.prev[index];
    const next = model.next[index];
    return (
      HIGH_CURVATURE_VERTICES.has(model.boundary[prev]) ||
      HIGH_CURVATURE_VERTICES.has(model.boundary[index]) ||
      HIGH_CURVATURE_VERTICES.has(model.boundary[next])
    );
  }

  /**
   * Scale offset smoothing by anatomical role.
   *
   * Crotches intentionally act as smoothing barriers so concavities are not
   * averaged away by neighboring finger-side offsets.
   *
   * @param {object} model - Runtime model.
   * @param {number} index - Boundary-loop index.
   * @returns {number} Multiplier for smoothing strength.
   */
  offsetSmoothingScale(model, index) {
    const region = model.boundaryRegions[index];
    if (region === "wrist") return 0.25;
    const role = this.curvatureRole(model, index);
    if (role === "crotch") return 0.03;
    if (role === "fingertip") return 0.12;
    if (this.hasHighCurvatureNeighbor(model, index)) return 0.28;
    return 1.0;
  }

  /**
   * Scale curvature-preservation strength by anatomical role.
   *
   * @param {object} model - Runtime model.
   * @param {number} index - Boundary-loop index.
   * @returns {number} Multiplier for curvature regularization.
   */
  curvaturePreserveScale(model, index) {
    const region = model.boundaryRegions[index];
    if (region === "wrist") return 0.4;
    const role = this.curvatureRole(model, index);
    if (role === "crotch") return 0.2;
    if (role === "fingertip") return 0.3;
    if (this.hasHighCurvatureNeighbor(model, index)) return 0.45;
    return 1.0;
  }

  /**
   * Compute signed local turn/curvature for a boundary point.
   *
   * Sign is meaningful because the boundary loop order is stable. Known
   * fingertips and crotches should generally preserve opposite signs.
   *
   * @param {Float64Array} points - Packed contour points.
   * @param {object} model - Runtime model with prev/next arrays.
   * @param {number} index - Boundary-loop index.
   * @returns {number} Signed normalized curvature.
   */
  signedCurvature(points, model, index) {
    const prev = model.prev[index];
    const next = model.next[index];
    const ax = points[2 * index] - points[2 * prev];
    const ay = points[2 * index + 1] - points[2 * prev + 1];
    const bx = points[2 * next] - points[2 * index];
    const by = points[2 * next + 1] - points[2 * index + 1];
    const denom = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 1e-8);
    return (ax * by - ay * bx) / denom;
  }

  /**
   * Compute signed curvature if one boundary point were replaced by a candidate.
   *
   * This is used during crotch search so candidates that preserve the expected
   * concavity sign can win over nearby unrelated finger-side edges.
   *
   * @param {Float64Array} points - Packed contour points used for neighbors.
   * @param {object} model - Runtime model with prev/next arrays.
   * @param {number} index - Boundary-loop index being tested.
   * @param {number} x - Candidate x coordinate for `index`.
   * @param {number} y - Candidate y coordinate for `index`.
   * @returns {number} Signed normalized curvature for the hypothetical candidate.
   */
  candidateSignedCurvature(points, model, index, x, y) {
    const prev = model.prev[index];
    const next = model.next[index];
    const ax = x - points[2 * prev];
    const ay = y - points[2 * prev + 1];
    const bx = points[2 * next] - x;
    const by = points[2 * next + 1] - y;
    const denom = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 1e-8);
    return (ax * by - ay * bx) / denom;
  }

  /**
   * Build a MediaPipe-guided search direction for between-finger crotches.
   *
   * The three central finger webs are expected to sit between adjacent MCP
   * "crown" landmarks. A normal-only search can miss these concavities when
   * the local PDM contour is offset outside the true crotch, so this supplies a
   * second one-sided ray from the contour point toward the MCP midpoint.
   *
   * @param {object} model - Runtime model with boundary vertex ids.
   * @param {number} index - Boundary-loop index being searched.
   * @param {Array<{x:number,y:number}>} landmarks - 21 MediaPipe landmarks in canvas pixels.
   * @param {number} x - Current contour x coordinate.
   * @param {number} y - Current contour y coordinate.
   * @returns {{x:number,y:number}|null} Unit direction toward the MCP midpoint.
   */
  crotchCrownMidpointDirection(model, index, landmarks, x, y) {
    if (!landmarks || landmarks.length < 21) return null;
    const vertex = model.boundary[index];
    const pair = CROTCH_CROWN_MIDPOINTS.get(vertex);
    if (!pair) return null;
    const a = landmarks[pair[0]];
    const b = landmarks[pair[1]];
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return null;
    }
    const targetX = 0.5 * (a.x + b.x);
    const targetY = 0.5 * (a.y + b.y);
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-8) return null;
    return { x: dx / len, y: dy / len };
  }

  /**
   * Repair flattened or sign-flipped curvature at known crotches/fingertips.
   *
   * The normal search is per-vertex, but curvature is a local triple property.
   * This post-pass detects semantic high-curvature locations whose candidate
   * contour lost the expected sign or became too flat, then nudges those points
   * toward a PDM-compatible signed curvature while still mixing in the raw edge
   * candidate when its sign is plausible.
   *
   * @param {Float64Array} contour - Original PDM contour.
   * @param {object} model - Runtime model.
   * @param {object} options - ASM options.
   */
  repairSignedCurvature(contour, model, options) {
    const n = model.boundary.length;
    const repairWeight = options.signedCurvatureWeight ?? 0.65;
    if (repairWeight <= 0) return;
    for (let pass = 0; pass < 2; pass += 1) {
      this.curvatureNext.set(this.raw.subarray(0, n * 2), 0);
      for (let i = 0; i < n; i += 1) {
        const role = this.curvatureRole(model, i);
        if (role === "normal") continue;
        const expected = this.signedCurvature(contour, model, i);
        if (Math.abs(expected) < 0.015) continue;
        const current = this.signedCurvature(this.raw, model, i);
        const wrongSign = Math.sign(current) !== Math.sign(expected);
        const tooFlat = Math.abs(current) < Math.abs(expected) * (role === "crotch" ? 0.65 : 0.45);
        if (!wrongSign && !tooFlat) continue;

        const prev = model.prev[i];
        const next = model.next[i];
        const pdmX = contour[2 * i];
        const pdmY = contour[2 * i + 1];
        const pdmCurvX = contour[2 * prev] - 2 * pdmX + contour[2 * next];
        const pdmCurvY = contour[2 * prev + 1] - 2 * pdmY + contour[2 * next + 1];
        let targetX = 0.5 * (this.raw[2 * prev] + this.raw[2 * next] - pdmCurvX);
        let targetY = 0.5 * (this.raw[2 * prev + 1] + this.raw[2 * next + 1] - pdmCurvY);

        const searchSign = this.signedCurvature(this.searchRaw, model, i);
        if (Math.sign(searchSign) === Math.sign(expected) && this.confidence[i] > 0.15) {
          const edgeMix = role === "crotch" ? 0.45 : 0.3;
          targetX = (1 - edgeMix) * targetX + edgeMix * this.searchRaw[2 * i];
          targetY = (1 - edgeMix) * targetY + edgeMix * this.searchRaw[2 * i + 1];
        }

        const roleWeight = role === "crotch" ? 1.0 : 0.55;
        const w = clamp(repairWeight * roleWeight, 0, 1);
        this.curvatureNext[2 * i] = this.raw[2 * i] + w * (targetX - this.raw[2 * i]);
        this.curvatureNext[2 * i + 1] = this.raw[2 * i + 1] + w * (targetY - this.raw[2 * i + 1]);
      }
      this.raw.set(this.curvatureNext.subarray(0, n * 2), 0);
    }
  }

  /**
   * Smooth offsets, preserve PDM-like curvature, and apply signed-curvature repair.
   *
   * @param {Float64Array} contour - Original PDM contour.
   * @param {object} model - Runtime model.
   * @param {object} options - ASM options.
   */
  regularizeCandidates(contour, model, options) {
    const n = model.boundary.length;
    const offsetStrength = options.offsetSmoothing ?? 0.35;
    const curvatureWeight = options.curvatureWeight ?? 0.25;
    for (let i = 0; i < n; i += 1) this.smoothedOffsets[i] = this.offsets[i];
    if (offsetStrength > 0) {
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i < n; i += 1) {
          const scale = this.offsetSmoothingScale(model, i);
          const strength = offsetStrength * scale;
          const avg = 0.5 * (this.smoothedOffsets[model.prev[i]] + this.smoothedOffsets[model.next[i]]);
          this.offsets[i] = this.smoothedOffsets[i] + strength * (avg - this.smoothedOffsets[i]);
        }
        for (let i = 0; i < n; i += 1) this.smoothedOffsets[i] = this.offsets[i];
      }
    }
    for (let i = 0; i < n; i += 1) {
      this.raw[2 * i] = contour[2 * i] + this.smoothedOffsets[i] * this.normals[2 * i];
      this.raw[2 * i + 1] = contour[2 * i + 1] + this.smoothedOffsets[i] * this.normals[2 * i + 1];
    }
    for (let i = 0; i < n; i += 1) {
      if (this.curvatureRole(model, i) !== "crotch" || this.confidence[i] <= 0.05) continue;
      const keepRaw = clamp(0.35 + 0.5 * this.confidence[i], 0.35, 0.85);
      this.raw[2 * i] = (1 - keepRaw) * this.raw[2 * i] + keepRaw * this.searchRaw[2 * i];
      this.raw[2 * i + 1] = (1 - keepRaw) * this.raw[2 * i + 1] + keepRaw * this.searchRaw[2 * i + 1];
    }
    if (curvatureWeight > 0) {
      this.curvatureWork.set(this.raw.subarray(0, n * 2));
      for (let iter = 0; iter < 3; iter += 1) {
        for (let i = 0; i < n; i += 1) {
          const prev = model.prev[i];
          const next = model.next[i];
          const scale = this.curvaturePreserveScale(model, i);
          const w = curvatureWeight * scale;
          const pdmX = contour[2 * i];
          const pdmY = contour[2 * i + 1];
          const pdmCurvX = contour[2 * prev] - 2 * pdmX + contour[2 * next];
          const pdmCurvY = contour[2 * prev + 1] - 2 * pdmY + contour[2 * next + 1];
          const targetX = 0.5 * (this.curvatureWork[2 * prev] + this.curvatureWork[2 * next] - pdmCurvX);
          const targetY = 0.5 * (this.curvatureWork[2 * prev + 1] + this.curvatureWork[2 * next + 1] - pdmCurvY);
          this.curvatureNext[2 * i] = this.raw[2 * i] + w * (targetX - this.raw[2 * i]);
          this.curvatureNext[2 * i + 1] = this.raw[2 * i + 1] + w * (targetY - this.raw[2 * i + 1]);
        }
        const tmp = this.curvatureWork;
        this.curvatureWork = this.curvatureNext;
        this.curvatureNext = tmp;
      }
      this.raw.set(this.curvatureWork.subarray(0, n * 2), 0);
    }
    this.repairSignedCurvature(contour, model, options);
    for (let i = 0; i < n; i += 1) {
      this.displacement[2 * i] = this.raw[2 * i] - contour[2 * i];
      this.displacement[2 * i + 1] = this.raw[2 * i + 1] - contour[2 * i + 1];
    }
  }

  /**
   * Run the local ASM normal search around every boundary vertex.
   *
   * @param {Float64Array} contour - Packed PDM contour.
   * @param {object} model - Runtime model.
   * @param {RoiGradient} gradient - ROI gradient/chroma sampler.
   * @param {object} options - Search/regularization options from UI controls.
   * @returns {object} Raw contour, confidence, displacement, and scalar offsets.
   */
  search(contour, model, gradient, options) {
    const n = model.boundary.length;
    const radius = options.searchRadius ?? 15;
    const distancePenalty = options.distancePenalty ?? 0.06;
    const edgeThreshold = options.edgeThreshold ?? 0.08;
    const strongEdgeThreshold = options.strongEdgeThreshold ?? 0.18;
    const largeJumpFraction = 0.65;
    const kernel = this.tangentKernel(options.profileWidth ?? 5);
    const skinWeight = options.skinWeight ?? 0.35;
    const temporalWeight = options.temporalWeight ?? 0.12;
    const minTemporalGain = options.temporalGain ?? 0.2;
    for (let i = 0; i < n; i += 1) {
      const pi = model.prev[i];
      const ni = model.next[i];
      const px = contour[2 * pi];
      const py = contour[2 * pi + 1];
      const nxp = contour[2 * ni];
      const nyp = contour[2 * ni + 1];
      const tx = nxp - px;
      const ty = nyp - py;
      let tangentX = tx;
      let tangentY = ty;
      const tangentLen = Math.hypot(tangentX, tangentY);
      if (tangentLen > 1e-8) {
        tangentX /= tangentLen;
        tangentY /= tangentLen;
      } else {
        tangentX = 1;
        tangentY = 0;
      }
      let normalX = ty;
      let normalY = -tx;
      const len = Math.hypot(normalX, normalY);
      if (len > 1e-8) {
        normalX /= len;
        normalY /= len;
      } else {
        normalX = 0;
        normalY = -1;
      }
      this.normals[2 * i] = normalX;
      this.normals[2 * i + 1] = normalY;
      const cx = contour[2 * i];
      const cy = contour[2 * i + 1];
      const role = this.curvatureRole(model, i);
      const expectedCurvature = role === "crotch" ? this.signedCurvature(contour, model, i) : 0;
      let bestScore = -Infinity;
      let secondScore = -Infinity;
      let bestCue = 0;
      let bestGradientCue = 0;
      let bestSkinTransition = 0;
      let bestOffset = 0;
      let bestDistance = 0;
      let bestX = cx;
      let bestY = cy;

      const testDirection = (
        dirX,
        dirY,
        directionRadius,
        directionPenaltyScale = 1,
        minOffset = -directionRadius,
        maxOffset = directionRadius
      ) => {
        for (let offset = minOffset; offset <= maxOffset; offset += 1) {
          const sx = cx + offset * dirX;
          const sy = cy + offset * dirY;
          const gradientCue = this.sampleTangentKernel(gradient, sx, sy, tangentX, tangentY, kernel);
          const sideDistance = Math.max(2, Math.min(8, radius * 0.25));
          const skinA = gradient.skinLikelihood(sx + dirX * sideDistance, sy + dirY * sideDistance);
          const skinB = gradient.skinLikelihood(sx - dirX * sideDistance, sy - dirY * sideDistance);
          const skinTransition = Math.abs(skinA - skinB);
          const cue = clamp(gradientCue + skinWeight * skinTransition, 0, 1);
          const distance = Math.abs(offset);
          const normalOffset = (sx - cx) * normalX + (sy - cy) * normalY;
          const penalty = distancePenalty * directionPenaltyScale * (distance / Math.max(radius, 1)) ** 2;
          const temporalPenalty =
            this.hasStableOffsets && temporalWeight > 0
              ? temporalWeight * ((normalOffset - this.stableOffsets[i]) / Math.max(radius, 1)) ** 2
              : 0;
          let score = cue - penalty - temporalPenalty;
          if (role === "crotch" && Math.abs(expectedCurvature) > 0.015) {
            const candidateCurvature = this.candidateSignedCurvature(contour, model, i, sx, sy);
            const sameSign = Math.sign(candidateCurvature) === Math.sign(expectedCurvature);
            const relativeMagnitude = Math.abs(candidateCurvature) / Math.max(Math.abs(expectedCurvature), 1e-6);
            score += sameSign ? 0.08 + 0.05 * clamp(relativeMagnitude, 0, 1.5) : -0.18;
            if (relativeMagnitude < 0.55) score -= 0.08;
          }
          if (score > bestScore) {
            secondScore = bestScore;
            bestScore = score;
            bestCue = cue;
            bestGradientCue = gradientCue;
            bestSkinTransition = skinTransition;
            bestOffset = normalOffset;
            bestDistance = distance;
            bestX = sx;
            bestY = sy;
          } else if (score > secondScore) {
            secondScore = score;
          }
        }
      };

      testDirection(normalX, normalY, radius, 1);
      if (role === "crotch") {
        const curvX = contour[2 * pi] - 2 * cx + contour[2 * ni];
        const curvY = contour[2 * pi + 1] - 2 * cy + contour[2 * ni + 1];
        const curvLen = Math.hypot(curvX, curvY);
        if (curvLen > 1e-8) {
          const crotchRadius = Math.max(radius, Math.round(radius * 1.25));
          testDirection(curvX / curvLen, curvY / curvLen, crotchRadius, 0.7);
        }
        const crownDirection = this.crotchCrownMidpointDirection(model, i, options.landmarks, cx, cy);
        if (crownDirection) {
          const crotchRadius = Math.max(radius, Math.round(radius * 1.25));
          testDirection(crownDirection.x, crownDirection.y, crotchRadius, 0.5, 0, crotchRadius);
        }
      }

      const largeJump = bestDistance > largeJumpFraction * radius;
      const credible =
        (bestGradientCue >= edgeThreshold || (skinWeight > 0 && bestGradientCue >= edgeThreshold * 0.5 && bestSkinTransition >= 0.25)) &&
        bestDistance <= (role === "crotch" ? Math.max(radius, Math.round(radius * 1.25)) : radius) &&
        (!largeJump || bestCue >= (role === "crotch" ? strongEdgeThreshold * 0.75 : strongEdgeThreshold)) &&
        Number.isFinite(bestScore) &&
        bestScore > 0;
      if (credible) {
        this.searchRaw[2 * i] = bestX;
        this.searchRaw[2 * i + 1] = bestY;
        this.offsets[i] = bestOffset;
        this.measuredOffsets[i] = bestOffset;
      } else {
        this.searchRaw[2 * i] = cx;
        this.searchRaw[2 * i + 1] = cy;
        this.offsets[i] = 0;
        this.measuredOffsets[i] = this.hasStableOffsets ? this.stableOffsets[i] : 0;
        bestCue = 0;
        secondScore = bestScore;
      }
      this.raw[2 * i] = this.searchRaw[2 * i];
      this.raw[2 * i + 1] = this.searchRaw[2 * i + 1];
      this.displacement[2 * i] = this.raw[2 * i] - cx;
      this.displacement[2 * i + 1] = this.raw[2 * i + 1] - cy;
      const margin = credible ? Math.max(bestScore - secondScore, 0) : 0;
      const distanceConf = Math.exp(-0.5 * (Math.abs(this.offsets[i]) / 9) ** 2);
      const marginConf = clamp(margin / 0.08, 0, 1);
      this.confidence[i] = credible ? clamp(bestCue, 0, 1) * (0.55 + 0.45 * marginConf) * distanceConf : 0;
    }
    for (let i = 0; i < n; i += 1) {
      if (!this.hasStableOffsets) {
        this.stableOffsets[i] = this.measuredOffsets[i];
      } else {
        const gain = clamp(minTemporalGain + (1 - minTemporalGain) * this.confidence[i], minTemporalGain, 1);
        this.stableOffsets[i] += gain * (this.measuredOffsets[i] - this.stableOffsets[i]);
      }
      this.offsets[i] = this.stableOffsets[i];
    }
    this.hasStableOffsets = true;
    this.regularizeCandidates(contour, model, options);
    for (let i = 0; i < n; i += 1) {
      const prev = model.prev[i];
      const next = model.next[i];
      const mx = 0.5 * (this.displacement[2 * prev] + this.displacement[2 * next]);
      const my = 0.5 * (this.displacement[2 * prev + 1] + this.displacement[2 * next + 1]);
      const rough = Math.hypot(this.displacement[2 * i] - mx, this.displacement[2 * i + 1] - my);
      const smoothConf = Math.exp(-0.5 * (rough / 5) ** 2);
      this.confidence[i] = clamp(this.confidence[i] * (0.55 + 0.45 * smoothConf), 0, 1);
    }
    return {
      rawContour: this.raw.subarray(0, n * 2),
      confidence: this.confidence.subarray(0, n),
      displacement: this.displacement.subarray(0, n * 2),
      offsets: this.offsets.subarray(0, n),
    };
  }

  /**
   * Blend the PDM contour toward the ASM raw contour to produce Final Contour.
   *
   * The current UI uses the `direct` preset, so `edgeSnapAmount` is effectively
   * the visible blend amount, with wrist vertices downweighted once.
   *
   * @param {Float64Array} contour - Packed PDM contour.
   * @param {object} model - Runtime model.
   * @param {string} preset - Snap preset key.
   * @param {object} [options] - Blend options.
   * @returns {{hybridContour:Float64Array, alpha:Float64Array}} Final contour and alphas.
   */
  blend(contour, model, preset, options = {}) {
    const n = model.boundary.length;
    const edgeSnapAmount = options.edgeSnapAmount ?? 1;
    const snapWrist = options.snapWrist ?? false;
    if (!this.hybrid || this.hybrid.length < n * 2) this.hybrid = new Float64Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const c = this.confidence[i];
      let alpha = c;
      if (preset === SNAP_PRESETS.default) alpha = Math.min(1, 1.5 * c);
      else if (preset === SNAP_PRESETS.aggressive) alpha = Math.sqrt(c);
      else if (preset === SNAP_PRESETS.direct) alpha = 1;
      alpha *= edgeSnapAmount;
      if (!snapWrist && model.boundaryRegions[i] === "wrist") alpha *= 0.2;
      alpha = clamp(alpha, 0, 1);
      this.alpha[i] = alpha;
      const dx = this.raw[2 * i] - contour[2 * i];
      const dy = this.raw[2 * i + 1] - contour[2 * i + 1];
      this.hybrid[2 * i] = contour[2 * i] + alpha * dx;
      this.hybrid[2 * i + 1] = contour[2 * i + 1] + alpha * dy;
    }
    return {
      hybridContour: this.hybrid.subarray(0, n * 2),
      alpha: this.alpha.subarray(0, n),
    };
  }
}
