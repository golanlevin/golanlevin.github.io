/**
 * Central default values for user-facing settings.
 *
 * Keep this file in sync with the corresponding initial values in `index.html`.
 * The goal is to give `app.js` one canonical source for reset behavior and
 * fallback values when controls are empty or invalid.
 */
export const SETTINGS_DEFAULTS = {
  layout: {
    paperPreset: "letter",
    paperWidth: 11,
    paperHeight: 8.5,
    frameCols: 5,
    frameRows: 4,
  },
  detection: {
    thresholdMethod: "offset-peak",
    thresholdOffset: -20,
    paperMarginPx: 80,
    boundarySensitivity: 8.0,
    boundaryPersistencePx: 7,
    alignmentMarkerType: "crosses",
    crossRoiScalePct: 52,
    useCrossAlignment: true,
    detectCrossesWithConvolution: false,
  },
  appearance: {
    brightness: 0,
    contrast: 0,
    vibrance: 0,
    temperature: 0,
    unsharpAmount: 0,
    unsharpRadius: 1.0,
    invert: false,
    resampling: "linear",
  },
  cropGeometry: {
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
    flipHorizontal: false,
    flipVertical: false,
    rotate90Cw: false,
  },
  gifExport: {
    fps: 20,
    loopCount: 1,
    reverseOrder: false,
    pingPong: false,
    outputWidthPx: 0,
    quality: 75,
    dither: "FloydSteinberg-serpentine",
    globalPalette: false,
  },
};

/**
 * Apply only the Appearance-panel defaults to the current DOM.
 *
 * @param {import("./dom-state.js").dom} dom
 * @returns {void}
 */
export function applyAppearanceDefaults(dom) {
  dom.brightness.value = String(SETTINGS_DEFAULTS.appearance.brightness);
  dom.contrast.value = String(SETTINGS_DEFAULTS.appearance.contrast);
  dom.vibrance.value = String(SETTINGS_DEFAULTS.appearance.vibrance);
  dom.temperature.value = String(SETTINGS_DEFAULTS.appearance.temperature);
  dom.unsharpAmount.value = String(SETTINGS_DEFAULTS.appearance.unsharpAmount);
  dom.unsharpRadius.value = SETTINGS_DEFAULTS.appearance.unsharpRadius.toFixed(1);
  dom.invert.checked = SETTINGS_DEFAULTS.appearance.invert;
  dom.gifResampling.value = SETTINGS_DEFAULTS.appearance.resampling;
}

/**
 * Apply only the Crop & Geometry defaults to the current DOM.
 *
 * @param {import("./dom-state.js").dom} dom
 * @returns {void}
 */
export function applyCropGeometryDefaults(dom) {
  dom.cropLeft.value = String(SETTINGS_DEFAULTS.cropGeometry.cropLeft);
  dom.cropRight.value = String(SETTINGS_DEFAULTS.cropGeometry.cropRight);
  dom.cropTop.value = String(SETTINGS_DEFAULTS.cropGeometry.cropTop);
  dom.cropBottom.value = String(SETTINGS_DEFAULTS.cropGeometry.cropBottom);
  dom.flipHorizontal.checked = SETTINGS_DEFAULTS.cropGeometry.flipHorizontal;
  dom.flipVertical.checked = SETTINGS_DEFAULTS.cropGeometry.flipVertical;
  dom.rotate90Cw.checked = SETTINGS_DEFAULTS.cropGeometry.rotate90Cw;
}

/**
 * Apply all non-Layout defaults to the current DOM.
 *
 * @param {import("./dom-state.js").dom} dom
 * @returns {void}
 */
export function applyNonLayoutDefaults(dom) {
  dom.thresholdMethod.value = SETTINGS_DEFAULTS.detection.thresholdMethod;
  dom.thresholdOffset.value = String(SETTINGS_DEFAULTS.detection.thresholdOffset);
  dom.paperMargin.value = String(SETTINGS_DEFAULTS.detection.paperMarginPx);
  dom.boundarySensitivity.value = SETTINGS_DEFAULTS.detection.boundarySensitivity.toFixed(1);
  dom.boundaryPersistence.value = String(SETTINGS_DEFAULTS.detection.boundaryPersistencePx);
  dom.alignmentMarkerTypeCrosses.checked = SETTINGS_DEFAULTS.detection.alignmentMarkerType === "crosses";
  dom.alignmentMarkerTypeCircles.checked = SETTINGS_DEFAULTS.detection.alignmentMarkerType === "circles";
  dom.crossRoiScale.value = String(SETTINGS_DEFAULTS.detection.crossRoiScalePct);
  dom.useCrossAlignment.checked = SETTINGS_DEFAULTS.detection.useCrossAlignment;
  dom.detectCrossesWithConvolution.checked = SETTINGS_DEFAULTS.detection.detectCrossesWithConvolution;

  applyAppearanceDefaults(dom);
  applyCropGeometryDefaults(dom);

  dom.fps.value = String(SETTINGS_DEFAULTS.gifExport.fps);
  dom.loopCount.value = String(SETTINGS_DEFAULTS.gifExport.loopCount);
  dom.reverseOrder.checked = SETTINGS_DEFAULTS.gifExport.reverseOrder;
  dom.pingPong.checked = SETTINGS_DEFAULTS.gifExport.pingPong;
  dom.outputWidth.value = "";
  dom.outputHeight.value = "";
  dom.gifQuality.value = String(SETTINGS_DEFAULTS.gifExport.quality);
  dom.gifDither.value = SETTINGS_DEFAULTS.gifExport.dither;
  dom.gifGlobalPalette.checked = SETTINGS_DEFAULTS.gifExport.globalPalette;
}
