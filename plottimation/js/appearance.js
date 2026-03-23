/**
 * Report whether any appearance controls require a non-identity color pass.
 *
 * @param {{brightness:number, contrast:number, vibrance:number, temperature:number, unsharpRadius:number, unsharpAmount:number, invert:boolean}} filters
 * @returns {boolean}
 */
export function hasAppearanceAdjustments(filters) {
  return filters.brightness !== 0 ||
    filters.contrast !== 0 ||
    filters.vibrance !== 0 ||
    filters.temperature !== 0 ||
    filters.unsharpAmount !== 0 ||
    filters.invert;
}

/**
 * Copy a source canvas into a target canvas and optionally apply perceptual
 * appearance adjustments in-place.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {HTMLCanvasElement} targetCanvas
 * @param {{brightness:number, contrast:number, vibrance:number, temperature:number, unsharpRadius:number, unsharpAmount:number, invert:boolean}} filters
 * @returns {void}
 */
export function applyVisualAdjustments(sourceCanvas, targetCanvas, filters) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  if (!hasAppearanceAdjustments(filters)) {
    return;
  }
  applyOklabAppearanceAdjustments(targetCanvas, filters);
}

/**
 * Map the UI vibrance slider into an internal chroma-scaling amount.
 *
 * @param {number} vibranceValue
 * @returns {number}
 */
function mapVibranceSliderToAmount(vibranceValue) {
  const normalized = Math.max(-1, Math.min(1, vibranceValue / 100));
  return normalized * 1.6;
}

/**
 * Map the color-temperature slider into a mired white-balance offset.
 *
 * @param {number} temperatureValue
 * @returns {number}
 */
function mapTemperatureSliderToMiredShift(temperatureValue) {
  const normalized = Math.max(-1, Math.min(1, temperatureValue / 100));
  return normalized * 60;
}

/**
 * Apply the full appearance stack in a single OKLab pass:
 * brightness on L, contrast on L, vibrance on chroma, then white-balance adaptation
 * and optional RGB inversion.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{brightness:number, contrast:number, vibrance:number, temperature:number, unsharpRadius:number, unsharpAmount:number, invert:boolean}} filters
 * @returns {void}
 */
function applyOklabAppearanceAdjustments(canvas, filters) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const deltaL = mapBrightnessSliderToDeltaL(filters.brightness);
  const contrastK = mapContrastSliderToCurveStrength(filters.contrast);
  const vibranceAmount = mapVibranceSliderToAmount(filters.vibrance);
  const temperatureMiredShift = mapTemperatureSliderToMiredShift(filters.temperature);
  const adaptation = Math.abs(temperatureMiredShift) > 1e-6
    ? makeTemperatureAdaptation(temperatureMiredShift)
    : null;

  for (let i = 0; i < data.length; i += 4) {
    // Do the perceptual edits in OKLab first, then return to sRGB for a white-balance style
    // chromatic adaptation pass that behaves more like a real temperature adjustment.
    const oklab = srgbToOklab(
      data[i] / 255,
      data[i + 1] / 255,
      data[i + 2] / 255
    );
    let lightness = Math.max(0, Math.min(1, oklab.L + deltaL));
    lightness = applyMidpointSCurve(lightness, contrastK);

    const chroma = Math.hypot(oklab.a, oklab.b);
    const adaptive = 1 - Math.max(0, Math.min(1, chroma / 0.32));
    const chromaScale = Math.max(0, 1 + (vibranceAmount * adaptive));
    const adjusted = oklabToSrgb(lightness, oklab.a * chromaScale, oklab.b * chromaScale);
    const adapted = adaptation
      ? adaptSrgbTemperature(adjusted[0], adjusted[1], adjusted[2], adaptation)
      : adjusted;

    data[i] = Math.round(adapted[0] * 255);
    data[i + 1] = Math.round(adapted[1] * 255);
    data[i + 2] = Math.round(adapted[2] * 255);
  }

  ctx.putImageData(imageData, 0, 0);

  if (filters.unsharpAmount > 0) {
    applyUnsharpMask(canvas, filters.unsharpRadius, filters.unsharpAmount);
  }

  if (filters.invert) {
    applyInvert(canvas);
  }
}

/**
 * Apply an RGB unsharp-mask pass using a blurred copy of the current canvas contents.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} radiusPx
 * @param {number} amountPercent
 * @returns {void}
 */
function applyUnsharpMask(canvas, radiusPx, amountPercent) {
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return;

  const sourceCtx = canvas.getContext("2d");
  const sourceImage = sourceCtx.getImageData(0, 0, width, height);
  const sourceData = sourceImage.data;

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext("2d");
  blurCtx.filter = `blur(${Math.max(0.1, radiusPx)}px)`;
  blurCtx.drawImage(canvas, 0, 0);
  blurCtx.filter = "none";
  const blurData = blurCtx.getImageData(0, 0, width, height).data;

  const amount = Math.max(0, amountPercent) / 100;
  for (let i = 0; i < sourceData.length; i += 4) {
    sourceData[i] = clampByte(sourceData[i] + amount * (sourceData[i] - blurData[i]));
    sourceData[i + 1] = clampByte(sourceData[i + 1] + amount * (sourceData[i + 1] - blurData[i + 1]));
    sourceData[i + 2] = clampByte(sourceData[i + 2] + amount * (sourceData[i + 2] - blurData[i + 2]));
  }

  sourceCtx.putImageData(sourceImage, 0, 0);
}

/**
 * Invert the current canvas contents in-place.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function applyInvert(canvas) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Clamp a channel value into the 8-bit byte range.
 *
 * @param {number} value
 * @returns {number}
 */
function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Map the brightness slider into an OKLab lightness delta.
 *
 * @param {number} brightnessValue
 * @returns {number}
 */
function mapBrightnessSliderToDeltaL(brightnessValue) {
  const normalized = Math.max(-1, Math.min(1, brightnessValue / 100));
  return normalized * 0.28;
}

/**
 * Map the contrast slider into the S-curve strength parameter.
 *
 * @param {number} contrastValue
 * @returns {number}
 */
function mapContrastSliderToCurveStrength(contrastValue) {
  const normalized = Math.max(-1, Math.min(1, contrastValue / 100));
  return normalized * 5.5;
}

/**
 * Apply a midpoint-preserving S-curve to a normalized lightness value.
 *
 * @param {number} value
 * @param {number} k
 * @returns {number}
 */
function applyMidpointSCurve(value, k) {
  if (Math.abs(k) < 1e-6) {
    return value;
  }
  const strength = Math.abs(k);
  const centered = value - 0.5;
  const tanhHalf = Math.tanh(0.5 * strength);
  if (Math.abs(tanhHalf) < 1e-6) {
    return value;
  }

  let curved;
  if (k > 0) {
    curved = 0.5 + (Math.tanh(centered * strength) / (2 * tanhHalf));
  } else {
    const scaled = Math.max(-0.999999, Math.min(0.999999, (2 * centered) * tanhHalf));
    curved = 0.5 + (Math.atanh(scaled) / strength);
  }

  return Math.max(0, Math.min(1, curved));
}

/**
 * Convert an sRGB triple in 0..1 into OKLab.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{L:number, a:number, b:number}}
 */
function srgbToOklab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt((0.4122214708 * lr) + (0.5363325363 * lg) + (0.0514459929 * lb));
  const m = Math.cbrt((0.2119034982 * lr) + (0.6806995451 * lg) + (0.1073969566 * lb));
  const s = Math.cbrt((0.0883024619 * lr) + (0.2817188376 * lg) + (0.6299787005 * lb));

  return {
    L: (0.2104542553 * l) + (0.7936177850 * m) - (0.0040720468 * s),
    a: (1.9779984951 * l) - (2.4285922050 * m) + (0.4505937099 * s),
    b: (0.0259040371 * l) + (0.7827717662 * m) - (0.8086757660 * s),
  };
}

/**
 * Convert OKLab back into an sRGB triple in 0..1.
 *
 * @param {number} L
 * @param {number} a
 * @param {number} b
 * @returns {[number, number, number]}
 */
function oklabToSrgb(L, a, b) {
  const l = Math.pow(L + (0.3963377774 * a) + (0.2158037573 * b), 3);
  const m = Math.pow(L - (0.1055613458 * a) - (0.0638541728 * b), 3);
  const s = Math.pow(L - (0.0894841775 * a) - (1.2914855480 * b), 3);

  const r = linearToSrgb((4.0767416621 * l) - (3.3077115913 * m) + (0.2309699292 * s));
  const g = linearToSrgb((-1.2684380046 * l) + (2.6097574011 * m) - (0.3413193965 * s));
  const blue = linearToSrgb((-0.0041960863 * l) - (0.7034186147 * m) + (1.7076147010 * s));

  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, blue)),
  ];
}

/**
 * Convert one gamma-encoded sRGB channel into linear light.
 *
 * @param {number} value
 * @returns {number}
 */
function srgbToLinear(value) {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return Math.pow((value + 0.055) / 1.055, 2.4);
}

/**
 * Convert one linear-light channel into gamma-encoded sRGB.
 *
 * @param {number} value
 * @returns {number}
 */
function linearToSrgb(value) {
  const clamped = Math.max(0, value);
  if (clamped <= 0.0031308) {
    return 12.92 * clamped;
  }
  return (1.055 * Math.pow(clamped, 1 / 2.4)) - 0.055;
}

const SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

const XYZ_TO_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252],
];

const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

const BRADFORD_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];

/**
 * Build a Bradford chromatic-adaptation transform that shifts D65 toward a warmer or cooler white.
 *
 * @param {number} miredShift
 * @returns {{matrix:number[][]}}
 */
function makeTemperatureAdaptation(miredShift) {
  const sourceWhite = xyzFromCctKelvin(6504);
  const targetKelvin = clampKelvin(1e6 / ((1e6 / 6504) + miredShift));
  const targetWhite = xyzFromCctKelvin(targetKelvin);
  // Bradford adaptation remaps colors as though the scene illuminant, not the pigments themselves, changed.
  return { matrix: buildBradfordAdaptationMatrix(sourceWhite, targetWhite) };
}

/**
 * Apply a chromatic-adaptation matrix to one sRGB color.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {{matrix:number[][]}} adaptation
 * @returns {[number, number, number]}
 */
function adaptSrgbTemperature(r, g, b, adaptation) {
  // Temperature adaptation operates in linear-light XYZ/LMS space to avoid the hue shifts
  // that would come from simply nudging RGB channels directly.
  const linear = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const xyz = multiplyMat3Vec3(SRGB_TO_XYZ, linear);
  const adaptedXyz = multiplyMat3Vec3(adaptation.matrix, xyz);
  const adaptedLinear = multiplyMat3Vec3(XYZ_TO_SRGB, adaptedXyz);
  return [
    Math.max(0, Math.min(1, linearToSrgb(adaptedLinear[0]))),
    Math.max(0, Math.min(1, linearToSrgb(adaptedLinear[1]))),
    Math.max(0, Math.min(1, linearToSrgb(adaptedLinear[2]))),
  ];
}

/**
 * Approximate a daylight white point from correlated color temperature.
 *
 * @param {number} kelvin
 * @returns {[number, number, number]}
 */
function xyzFromCctKelvin(kelvin) {
  const T = clampKelvin(kelvin);
  const x = (T <= 7000)
    ? (-4.6070e9 / (T ** 3)) + (2.9678e6 / (T ** 2)) + (99.11 / T) + 0.244063
    : (-2.0064e9 / (T ** 3)) + (1.9018e6 / (T ** 2)) + (247.48 / T) + 0.237040;
  const y = (-3 * x * x) + (2.87 * x) - 0.275;
  return [x / y, 1, (1 - x - y) / y];
}

/**
 * Build a Bradford adaptation matrix between two XYZ white points.
 *
 * @param {[number, number, number]} sourceWhite
 * @param {[number, number, number]} targetWhite
 * @returns {number[][]}
 */
function buildBradfordAdaptationMatrix(sourceWhite, targetWhite) {
  const srcCone = multiplyMat3Vec3(BRADFORD, sourceWhite);
  const dstCone = multiplyMat3Vec3(BRADFORD, targetWhite);
  const scale = [
    [dstCone[0] / srcCone[0], 0, 0],
    [0, dstCone[1] / srcCone[1], 0],
    [0, 0, dstCone[2] / srcCone[2]],
  ];
  return multiplyMat3(BRADFORD_INV, multiplyMat3(scale, BRADFORD));
}

/**
 * Multiply two 3x3 matrices.
 *
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function multiplyMat3(a, b) {
  return [
    [
      (a[0][0] * b[0][0]) + (a[0][1] * b[1][0]) + (a[0][2] * b[2][0]),
      (a[0][0] * b[0][1]) + (a[0][1] * b[1][1]) + (a[0][2] * b[2][1]),
      (a[0][0] * b[0][2]) + (a[0][1] * b[1][2]) + (a[0][2] * b[2][2]),
    ],
    [
      (a[1][0] * b[0][0]) + (a[1][1] * b[1][0]) + (a[1][2] * b[2][0]),
      (a[1][0] * b[0][1]) + (a[1][1] * b[1][1]) + (a[1][2] * b[2][1]),
      (a[1][0] * b[0][2]) + (a[1][1] * b[1][2]) + (a[1][2] * b[2][2]),
    ],
    [
      (a[2][0] * b[0][0]) + (a[2][1] * b[1][0]) + (a[2][2] * b[2][0]),
      (a[2][0] * b[0][1]) + (a[2][1] * b[1][1]) + (a[2][2] * b[2][1]),
      (a[2][0] * b[0][2]) + (a[2][1] * b[1][2]) + (a[2][2] * b[2][2]),
    ],
  ];
}

/**
 * Multiply a 3x3 matrix by a 3-vector.
 *
 * @param {number[][]} matrix
 * @param {[number, number, number]} vector
 * @returns {[number, number, number]}
 */
function multiplyMat3Vec3(matrix, vector) {
  return [
    (matrix[0][0] * vector[0]) + (matrix[0][1] * vector[1]) + (matrix[0][2] * vector[2]),
    (matrix[1][0] * vector[0]) + (matrix[1][1] * vector[1]) + (matrix[1][2] * vector[2]),
    (matrix[2][0] * vector[0]) + (matrix[2][1] * vector[1]) + (matrix[2][2] * vector[2]),
  ];
}

/**
 * Clamp correlated color temperature to a conservative usable range.
 *
 * @param {number} kelvin
 * @returns {number}
 */
function clampKelvin(kelvin) {
  return Math.max(2500, Math.min(25000, kelvin));
}
