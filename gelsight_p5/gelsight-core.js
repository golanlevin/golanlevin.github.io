(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GelSightCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WIDTH = 320;
  const HEIGHT = 240;
  const PIXELS = WIDTH * HEIGHT;
  const FEATURE_COUNT = 5;
  const BORDER_FRACTION = 0.15;
  const MARKER_THRESHOLD_LOW = 0;
  const MARKER_THRESHOLD_HIGH = 70;
  const MARKER_GRAYSCALE_WEIGHTS_BGR = [0.299, 0.587, 0.114];
  const MAX_GRADIENT_ABS = 50;

  /**
   * Create the canvas pair used for crop/resize preprocessing.
   */
  function makePreprocessCanvases(width = WIDTH, height = HEIGHT) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return { canvas, ctx, width, height };
  }

  /**
   * Crop a source image/video into the reconstruction canvas.
   */
  function drawCroppedVideoToCanvas(
    source,
    target,
    borderFraction = BORDER_FRACTION,
  ) {
    const sourceWidth =
      source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight =
      source.videoHeight || source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) {
      return false;
    }

    const crop = Math.max(0, Math.min(0.49, borderFraction));
    const cropTop = Math.floor(sourceHeight * crop);
    const cropLeft = Math.floor(sourceWidth * crop);
    const cropWidth = sourceWidth - cropLeft * 2;
    const cropHeight = sourceHeight - cropTop * 2;
    target.ctx.drawImage(
      source,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      0,
      0,
      target.width,
      target.height,
    );
    return {
      sourceWidth,
      sourceHeight,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      targetWidth: target.width,
      targetHeight: target.height,
    };
  }

  /**
   * Read RGBA pixels from the preprocessing canvas.
   */
  function readPreprocessImageData(target) {
    return target.ctx.getImageData(0, 0, target.width, target.height);
  }

  /**
   * Crop, resize, and return ImageData from a source frame.
   */
  function drawCroppedVideo(source, target, borderFraction = BORDER_FRACTION) {
    const cropInfo = drawCroppedVideoToCanvas(source, target, borderFraction);
    if (!cropInfo) {
      return null;
    }
    return readPreprocessImageData(target);
  }

  /**
   * Allocate model feature buffers and precompute static x/y feature columns.
   */
  function makeFeatureBuffers(width = WIDTH, height = HEIGHT) {
    const features = new Float32Array(width * height * FEATURE_COUNT);
    const markerMask = new Uint8Array(width * height);
    let out = 0;

    for (let y = 0; y < height; y += 1) {
      const yn = y / height;
      for (let x = 0; x < width; x += 1) {
        // CRITICAL: the x/y columns are static model inputs. They are
        // precomputed once so each live frame only updates B, G, R and marker
        // mask data. The full feature order remains B, G, R, y, x.
        features[out + 3] = yn;
        features[out + 4] = x / width;
        out += FEATURE_COUNT;
      }
    }

    return { features, markerMask, width, height };
  }

  /**
   * Update BGR color features and marker mask from RGBA pixels.
   */
  function updateFeaturesFromRgba(
    imageData,
    buffers,
    width = WIDTH,
    height = HEIGHT,
  ) {
    if (!buffers || buffers.width !== width || buffers.height !== height) {
      buffers = makeFeatureBuffers(width, height);
    }

    const rgba = imageData.data;
    const features = buffers.features;
    const markerMask = buffers.markerMask;
    let out = 0;
    let pixel = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = pixel * 4;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];

        // CRITICAL: browser canvas pixels are RGBA, but the GelSight network was
        // trained and called from OpenCV's BGR order. The feature order below is
        // B, G, R, y, x. Changing it to R, G, B recreates the false noisy top
        // depth patch we saw in Python.
        features[out] = b / 255;
        features[out + 1] = g / 255;
        features[out + 2] = r / 255;

        // Match the Python code's marker threshold convention as closely as
        // possible. Python labels the image RGB, but the data it passes is BGR,
        // so the grayscale weights are applied to B, G, R in this order.
        const gray =
          MARKER_GRAYSCALE_WEIGHTS_BGR[0] * b +
          MARKER_GRAYSCALE_WEIGHTS_BGR[1] * g +
          MARKER_GRAYSCALE_WEIGHTS_BGR[2] * r;
        markerMask[pixel] =
          gray >= MARKER_THRESHOLD_LOW && gray <= MARKER_THRESHOLD_HIGH ? 1 : 0;

        out += FEATURE_COUNT;
        pixel += 1;
      }
    }

    return { features, markerMask, buffers };
  }

  /**
   * Build a fresh feature buffer from RGBA pixels.
   */
  function featuresFromRgba(imageData, width = WIDTH, height = HEIGHT) {
    return updateFeaturesFromRgba(
      imageData,
      makeFeatureBuffers(width, height),
      width,
      height,
    );
  }

  /**
   * Build a low-resolution sampled feature buffer for fast inference.
   */
  function updateSampledFeaturesFromRgba(
    imageData,
    buffers,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  ) {
    if (
      !buffers ||
      buffers.width !== targetWidth ||
      buffers.height !== targetHeight
    ) {
      buffers = makeFeatureBuffers(targetWidth, targetHeight);
    }

    const rgba = imageData.data;
    const features = buffers.features;
    const markerMask = buffers.markerMask;
    let out = 0;
    let targetPixel = 0;

    for (let y = 0; y < targetHeight; y += 1) {
      const sourceY = Math.min(
        sourceHeight - 1,
        Math.floor(((y + 0.5) * sourceHeight) / targetHeight),
      );
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = Math.min(
          sourceWidth - 1,
          Math.floor(((x + 0.5) * sourceWidth) / targetWidth),
        );
        const i = (sourceY * sourceWidth + sourceX) * 4;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];

        // CRITICAL: this sampled low-resolution path preserves the same BGR
        // feature order as updateFeaturesFromRgba(). Only the spatial sampling
        // rate changes; model input columns remain B, G, R, y, x.
        features[out] = b / 255;
        features[out + 1] = g / 255;
        features[out + 2] = r / 255;

        const gray =
          MARKER_GRAYSCALE_WEIGHTS_BGR[0] * b +
          MARKER_GRAYSCALE_WEIGHTS_BGR[1] * g +
          MARKER_GRAYSCALE_WEIGHTS_BGR[2] * r;
        markerMask[targetPixel] =
          gray >= MARKER_THRESHOLD_LOW && gray <= MARKER_THRESHOLD_HIGH ? 1 : 0;

        out += FEATURE_COUNT;
        targetPixel += 1;
      }
    }

    return { features, markerMask, buffers };
  }

  /**
   * Convert model normal outputs into x/y surface gradients.
   */
  function normalsToGradients(
    normalXY,
    markerMask,
    width = WIDTH,
    height = HEIGHT,
    useMask = true,
  ) {
    const length = width * height;
    const gx = new Float32Array(length);
    const gy = new Float32Array(length);
    const nz = new Float32Array(length);
    let nzSum = 0;
    let nzCount = 0;

    for (let i = 0; i < length; i += 1) {
      const nx = normalXY[i * 2];
      const ny = normalXY[i * 2 + 1];
      const zz = Math.sqrt(1 - nx * nx - ny * ny);
      if (Number.isFinite(zz)) {
        nz[i] = zz;
        nzSum += zz;
        nzCount += 1;
      } else {
        nz[i] = NaN;
      }
    }

    const meanNz = nzCount > 0 ? nzSum / nzCount : 1;
    for (let i = 0; i < length; i += 1) {
      const zz = Number.isFinite(nz[i]) ? nz[i] : meanNz;
      gx[i] = -normalXY[i * 2] / zz;
      gy[i] = -normalXY[i * 2 + 1] / zz;
    }

    if (useMask && markerMask) {
      interpolateMaskedAreas(gx, markerMask, width, height);
      interpolateMaskedAreas(gy, markerMask, width, height);
    }

    return { gx, gy };
  }

  /**
   * Fill marker-like regions in gradient maps before integration.
   */
  function applyMarkerMaskToGradients(
    gx,
    gy,
    markerMask,
    width = WIDTH,
    height = HEIGHT,
  ) {
    if (!markerMask) {
      return { gx, gy };
    }

    interpolateMaskedAreas(gx, markerMask, width, height);
    interpolateMaskedAreas(gy, markerMask, width, height);
    return { gx, gy };
  }

  /**
   * Replace invalid gradients and clamp extreme values before Poisson integration.
   */
  function sanitizeGradients(
    gx,
    gy,
    width = WIDTH,
    height = HEIGHT,
    maxAbs = MAX_GRADIENT_ABS,
  ) {
    const length = width * height;
    const invalidMask = new Uint8Array(length);
    let invalid = 0;
    let clamped = 0;

    for (let i = 0; i < length; i += 1) {
      const x = gx[i];
      const y = gy[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        gx[i] = 0;
        gy[i] = 0;
        invalidMask[i] = 1;
        invalid += 1;
        continue;
      }

      if (x > maxAbs) {
        gx[i] = maxAbs;
        clamped += 1;
      } else if (x < -maxAbs) {
        gx[i] = -maxAbs;
        clamped += 1;
      }

      if (y > maxAbs) {
        gy[i] = maxAbs;
        clamped += 1;
      } else if (y < -maxAbs) {
        gy[i] = -maxAbs;
        clamped += 1;
      }
    }

    if (invalid > 0 && invalid < length) {
      interpolateMaskedAreas(gx, invalidMask, width, height);
      interpolateMaskedAreas(gy, invalidMask, width, height);
    }

    let replacedAfterFill = 0;
    for (let i = 0; i < length; i += 1) {
      if (!Number.isFinite(gx[i])) {
        gx[i] = 0;
        replacedAfterFill += 1;
      } else if (gx[i] > maxAbs) {
        gx[i] = maxAbs;
        clamped += 1;
      } else if (gx[i] < -maxAbs) {
        gx[i] = -maxAbs;
        clamped += 1;
      }

      if (!Number.isFinite(gy[i])) {
        gy[i] = 0;
        replacedAfterFill += 1;
      } else if (gy[i] > maxAbs) {
        gy[i] = maxAbs;
        clamped += 1;
      } else if (gy[i] < -maxAbs) {
        gy[i] = -maxAbs;
        clamped += 1;
      }
    }

    return { invalid, clamped, replacedAfterFill, maxAbs };
  }

  /**
   * Allocate reusable buffers for gradient upsampling.
   */
  function makeGradientUpsampleBuffers(width = WIDTH, height = HEIGHT) {
    return {
      gx: new Float32Array(width * height),
      gy: new Float32Array(width * height),
      width,
      height,
    };
  }

  /**
   * Upsample low-resolution gradients to reconstruction resolution.
   */
  function upsampleGradientsBilinear(
    lowGx,
    lowGy,
    lowWidth,
    lowHeight,
    highWidth = WIDTH,
    highHeight = HEIGHT,
    buffers = null,
  ) {
    if (
      !buffers ||
      buffers.width !== highWidth ||
      buffers.height !== highHeight
    ) {
      buffers = makeGradientUpsampleBuffers(highWidth, highHeight);
    }

    const highGx = buffers.gx;
    const highGy = buffers.gy;
    const xScale = lowWidth > 1 ? (lowWidth - 1) / (highWidth - 1) : 0;
    const yScale = lowHeight > 1 ? (lowHeight - 1) / (highHeight - 1) : 0;

    for (let y = 0; y < highHeight; y += 1) {
      const sourceY = y * yScale;
      const y0 = Math.floor(sourceY);
      const y1 = Math.min(lowHeight - 1, y0 + 1);
      const fy = sourceY - y0;
      const row0 = y0 * lowWidth;
      const row1 = y1 * lowWidth;
      const outRow = y * highWidth;

      for (let x = 0; x < highWidth; x += 1) {
        const sourceX = x * xScale;
        const x0 = Math.floor(sourceX);
        const x1 = Math.min(lowWidth - 1, x0 + 1);
        const fx = sourceX - x0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = row0 + x0;
        const i10 = row0 + x1;
        const i01 = row1 + x0;
        const i11 = row1 + x1;
        const out = outRow + x;

        highGx[out] =
          lowGx[i00] * w00 +
          lowGx[i10] * w10 +
          lowGx[i01] * w01 +
          lowGx[i11] * w11;
        highGy[out] =
          lowGy[i00] * w00 +
          lowGy[i10] * w10 +
          lowGy[i01] * w01 +
          lowGy[i11] * w11;
      }
    }

    return { gx: highGx, gy: highGy, buffers };
  }

  /**
   * Fill masked pixels using nearby unmasked values.
   */
  function interpolateMaskedAreas(values, mask, width, height) {
    const current = new Float32Array(values);
    const filled = new Uint8Array(mask.length);
    const queue = [];
    let head = 0;

    for (let i = 0; i < mask.length; i += 1) {
      filled[i] = mask[i] ? 0 : 1;
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (filled[i]) {
          continue;
        }
        let sum = 0;
        let count = 0;
        if (x > 0 && filled[i - 1]) {
          sum += current[i - 1];
          count += 1;
        }
        if (x + 1 < width && filled[i + 1]) {
          sum += current[i + 1];
          count += 1;
        }
        if (y > 0 && filled[i - width]) {
          sum += current[i - width];
          count += 1;
        }
        if (y + 1 < height && filled[i + width]) {
          sum += current[i + width];
          count += 1;
        }
        if (count > 0) {
          current[i] = sum / count;
          filled[i] = 1;
          queue.push(i);
        }
      }
    }

    while (head < queue.length) {
      const i = queue[head];
      head += 1;
      const x = i % width;
      const y = Math.floor(i / width);
      const neighbors = [];
      if (x > 0) neighbors.push(i - 1);
      if (x + 1 < width) neighbors.push(i + 1);
      if (y > 0) neighbors.push(i - width);
      if (y + 1 < height) neighbors.push(i + width);

      for (const n of neighbors) {
        if (!filled[n]) {
          current[n] = current[i];
          filled[n] = 1;
          queue.push(n);
        }
      }
    }

    values.set(current);
  }

  /**
   * Integrate gradients into depth using a DCT Neumann Poisson solve.
   */
  function poissonDctNeumann(
    cv,
    gx,
    gy,
    width = WIDTH,
    height = HEIGHT,
    regularizationLambda = 0,
  ) {
    if (!cv || typeof cv.dct !== "function" || typeof cv.idct !== "function") {
      throw new Error(
        "OpenCV.js with dct/idct is required for Poisson reconstruction.",
      );
    }

    const div = new Float32Array(width * height);
    const lambda = Math.max(0, Number(regularizationLambda) || 0);
    const root2 = Math.sqrt(2);
    const root2Inv = 1 / root2;

    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const i = row + x;
        const nextCol = row + (x + 1 < width ? x + 1 : width - 1);
        const prevCol = row + (x > 0 ? x - 1 : 0);
        const nextRow = (y + 1 < height ? y + 1 : height - 1) * width + x;
        const prevRow = (y > 0 ? y - 1 : 0) * width + x;
        div[i] = gx[nextCol] - gx[prevCol] + gy[nextRow] - gy[prevRow];
      }
    }

    for (let x = 1; x < width - 1; x += 1) {
      div[x] -= -gy[x];
      div[(height - 1) * width + x] -= gy[(height - 1) * width + x];
    }
    for (let y = 1; y < height - 1; y += 1) {
      const left = y * width;
      const right = left + width - 1;
      div[left] -= -gx[left];
      div[right] -= gx[right];
    }

    div[0] -= root2 * root2Inv * (-gy[0] - gx[0]);
    div[width - 1] -= root2 * root2Inv * (-gy[width - 1] + gx[width - 1]);
    div[(height - 1) * width] -=
      root2 * root2Inv * (gy[(height - 1) * width] - gx[(height - 1) * width]);
    div[height * width - 1] -=
      root2 * root2Inv * (gy[height * width - 1] + gx[height * width - 1]);

    const divMat = cv.matFromArray(height, width, cv.CV_32F, div);
    const dctMat = new cv.Mat();
    const depthDctMat = new cv.Mat(height, width, cv.CV_32F);
    const depthMat = new cv.Mat();
    let depth;

    try {
      cv.dct(divMat, dctMat);
      const dctData = dctMat.data32F;
      const depthDct = depthDctMat.data32F;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = y * width + x;
          const denom =
            4 *
            (Math.sin((0.5 * Math.PI * (x + 1)) / width) ** 2 +
              Math.sin((0.5 * Math.PI * (y + 1)) / height) ** 2);
          depthDct[i] = -dctData[i] / (denom + lambda);
        }
      }

      cv.idct(depthDctMat, depthMat);
      depth = new Float32Array(depthMat.data32F);
    } finally {
      divMat.delete();
      dctMat.delete();
      depthDctMat.delete();
      depthMat.delete();
    }

    let mean = 0;
    for (let i = 0; i < depth.length; i += 1) {
      mean += depth[i];
    }
    mean /= depth.length;
    for (let i = 0; i < depth.length; i += 1) {
      depth[i] -= mean;
    }
    return depth;
  }

  /**
   * Subtract the calibration baseline from a raw depth map.
   */
  function subtractBaseline(depth, baseline) {
    if (!baseline) {
      return depth;
    }
    const out = new Float32Array(depth.length);
    for (let i = 0; i < depth.length; i += 1) {
      const value = Number.isFinite(depth[i]) ? depth[i] : 0;
      const base = Number.isFinite(baseline[i]) ? baseline[i] : 0;
      const result = value - base;
      out[i] = Number.isFinite(result) ? result : 0;
    }
    return out;
  }

  /**
   * Compute finite min, max, mean, and count for a numeric buffer.
   */
  function stats(values) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let finite = 0;
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
      finite += 1;
    }
    if (finite === 0) {
      return { min: 0, max: 0, mean: 0, finite: 0 };
    }
    return { min, max, mean: sum / finite, finite };
  }

  /**
   * Allocate reusable depth preview image and histogram buffers.
   */
  function makeDepthImageBuffers(width = WIDTH, height = HEIGHT, bins = 512) {
    return {
      imageData: new ImageData(width, height),
      histogram: new Uint32Array(bins),
      bins,
      width,
      height,
    };
  }

  /**
   * Estimate robust low/high percentiles with a histogram.
   */
  function percentileRange(
    values,
    low = 1,
    high = 99,
    bins = 512,
    histogram = null,
  ) {
    let minValue = Infinity;
    let maxValue = -Infinity;
    let finiteCount = 0;

    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
      finiteCount += 1;
    }

    if (finiteCount === 0 || minValue === maxValue) {
      return { low: minValue || 0, high: maxValue || 1 };
    }

    histogram ??= new Uint32Array(bins);
    histogram.fill(0);
    const scale = (bins - 1) / (maxValue - minValue);
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) {
        continue;
      }
      const bin = Math.max(
        0,
        Math.min(bins - 1, Math.floor((value - minValue) * scale)),
      );
      histogram[bin] += 1;
    }

    const lowTarget = Math.floor((low / 100) * finiteCount);
    const highTarget = Math.floor((high / 100) * finiteCount);
    let cumulative = 0;
    let lowBin = 0;
    let highBin = bins - 1;

    for (let i = 0; i < bins; i += 1) {
      cumulative += histogram[i];
      if (cumulative > lowTarget) {
        lowBin = i;
        break;
      }
    }

    cumulative = 0;
    for (let i = 0; i < bins; i += 1) {
      cumulative += histogram[i];
      if (cumulative > highTarget) {
        highBin = i;
        break;
      }
    }

    const binWidth = (maxValue - minValue) / (bins - 1);
    return {
      low: minValue + lowBin * binWidth,
      high: minValue + highBin * binWidth,
    };
  }

  /**
   * Render a depth buffer into grayscale ImageData using percentile normalization.
   */
  function depthToImageData(depth, width = WIDTH, height = HEIGHT, buffers) {
    if (!buffers || buffers.width !== width || buffers.height !== height) {
      buffers = makeDepthImageBuffers(width, height);
    }
    const range = percentileRange(
      depth,
      1,
      99,
      buffers.bins,
      buffers.histogram,
    );
    const span = Math.max(10, range.high - range.low);
    const imageData = buffers.imageData;
    const rgba = imageData.data;
    for (let i = 0; i < depth.length; i += 1) {
      const value = Number.isFinite(depth[i]) ? depth[i] : range.low;
      const v = Math.max(0, Math.min(1, (value - range.low) / span));
      const c = Math.round(v * 255);
      const j = i * 4;
      rgba[j] = c;
      rgba[j + 1] = c;
      rgba[j + 2] = c;
      rgba[j + 3] = 255;
    }
    return imageData;
  }

  return {
    WIDTH,
    HEIGHT,
    PIXELS,
    FEATURE_COUNT,
    BORDER_FRACTION,
    MARKER_THRESHOLD_LOW,
    MARKER_THRESHOLD_HIGH,
    MARKER_GRAYSCALE_WEIGHTS_BGR,
    MAX_GRADIENT_ABS,
    makePreprocessCanvases,
    makeDepthImageBuffers,
    drawCroppedVideoToCanvas,
    readPreprocessImageData,
    drawCroppedVideo,
    makeFeatureBuffers,
    updateFeaturesFromRgba,
    updateSampledFeaturesFromRgba,
    featuresFromRgba,
    normalsToGradients,
    applyMarkerMaskToGradients,
    sanitizeGradients,
    makeGradientUpsampleBuffers,
    upsampleGradientsBilinear,
    poissonDctNeumann,
    subtractBaseline,
    stats,
    percentileRange,
    depthToImageData,
  };
});
