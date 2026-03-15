import { PAPER_PRESETS, dom, state } from "./dom-state.js";
import { applyVisualAdjustments, hasAppearanceAdjustments } from "./appearance.js";
import { drawImageToCanvas, renderCanvasFit, resizeCanvasToBox } from "./canvas-view.js";
import {
  runPipeline,
  estimateCrossRoiSidePx,
  buildCrossConvolutionCanvas,
  getCvInterpolationFlag,
  extractSingleFrameToCanvas,
} from "./pipeline.js";

const TOOLTIP_TEXT = {
  "#appTitle": "",
  "#appLedePrimary": "",
  "#appLedeSecondary": "",
  "#photoHeading": "Loads a source photo or scan for processing. Pages must be in landscape orientation.",
  "#loadDemoButton": "Loads the bundled demo image without choosing a file.",
  "#dropZone": "Drop a photo or scan of a plotted frame-sheet here, or click to choose a file. Pages must be in landscape orientation.",
  "#layoutSummary": "Sets the frame-grid dimensions and paper format assumptions.",
  "#frameCols": "Number of animation frame columns in the plotted grid.",
  "#frameRows": "Number of animation frame rows in the plotted grid.",
  "#paperPreset": "Choose a landscape paper preset, or Custom to enter your own dimensions.",
  "#paperWidth": "Custom paper width (arbitrary units) when Paper Size is set to Custom.",
  "#paperHeight": "Custom paper height (arbitrary units) when Paper Size is set to Custom.",
  "#detectionAlignmentSummary": "Controls for finding the paper, locating the frame grid, and refining extracted frames using crosses.",
  "#thresholdMethod": "Thresholding methods for finding the paper quadrilateral.",
  "#thresholdOffset": "Nudges the paper threshold darker or lighter after thresholding.",
  "#paperMargin": "Insets the coarse boundary search away from the page edge to avoid background bleed and warped borders.",
  "#boundarySensitivity": "The threshold used to find the frame-grid.",
  "#boundaryPersistence": "How many consecutive pixels must stay above the threshold before the frame-grid boundary is accepted.",
  "#crossRoiScale": "Sets the size of the square search regions used to localize each registration cross.",
  "#useCrossAlignment": "Use detected crosses to refine frame extraction beyond a nominal equal-spaced grid.",
  "#appearanceSummary": "Adjusts the look of the extracted animation frames.",
  "#resetAppearanceButton": "Restores all appearance controls to their default values.",
  "#brightness": "Adjusts perceptual lightness before contrast and vibrance are applied.",
  "#contrast": "Applies a midpoint-preserving contrast curve to OKLab lightness.",
  "#vibrance": "Boosts or reduces muted colors more than already-saturated colors.",
  "#temperature": "Shifts the image white balance cooler or warmer using chromatic adaptation after the OKLab adjustments.",
  "#invert": "Inverts the animation frames like a photographic negative.",
  "#gifResampling": "Selects the interpolation method used when extracting and unwarping frames.",
  "#cropOutputSummary": "Crops pixels away from the extracted animation frames.",
  "#resetTrimButton": "Restores all crop values to zero.",
  "#cropLeft": "Crops pixels from the left side of the animation (before optional output scaling).",
  "#cropRight": "Crops pixels from the right side of the animation (before optional output scaling).",
  "#cropTop": "Crops pixels from the top of the animation (before optional output scaling).",
  "#cropBottom": "Crops pixels from the bottom of the animation (before optional output scaling).",
  "#gifExportSummary": "Controls that affect preview playback and the exported GIF file.",
  "#fps": "Playback speed of the preview animation and exported GIF in frames per second.",
  "#outputScale": "Scales the final animation for preview and export (post-cropping).",
  "#gifQuality": "GIF encoder quality setting. Lower numbers are slower but higher quality.",
  "#gifDither": "Selects the dithering method used during GIF color quantization.",
  "#gifGlobalPalette": "Use one shared palette for all GIF frames, instead of per-frame palettes.",
  "#statusHeading": "Processing and diagnostic status for the current image and settings.",
  "#tooltipToggleButton": "Turn tooltips on or off throughout the interface.",
  "#statusText": "Current pipeline status and other diagnostic information.",
  "#rawPhotoHeading": "Preview of the original source image.",
  "#rawCanvas": "Preview of the source photo. The detected paper contour is outlined in green.",
  "#rectifiedSheetHeading": "Preview of the rectified page used for frame detection and extraction.",
  "#rectifiedCanvas": "Preview of the rectified page; click to toggle the convolution diagnostic view.",
  "#crossRegionsHeading": "Diagnostic tiles showing the regions used to localize each registration cross.",
  "#crossRoiGrid": "Per-cross diagnostic regions used to inspect registration mark detection.",
  "#animationPreviewHeading": "Live animation preview using the current settings.",
  "#exportButton": "Render and download the animated GIF using the current settings.",
  "#gifPreviewCanvas": "This is a live animation preview. Click 'Export GIF' to generate the GIF.",
  "#gifImage": "Most recently exported GIF preview image.",
};

init();

/**
 * Keep the Animation Preview panel title in sync with whether it is showing the live canvas
 * or a completed exported GIF.
 *
 * @returns {void}
 */
function updateAnimationPreviewHeading() {
  dom.animationPreviewHeading.textContent = state.export.url ? "GIF Output" : "Animation Preview";
}

/**
 * Set the Export GIF button label, optionally with an in-progress percentage suffix.
 *
 * @param {number | null} [progressPercent=null]
 * @returns {void}
 */
function updateExportButtonLabel(progressPercent = null) {
  dom.exportButton.textContent = (typeof progressPercent === "number")
    ? `Export GIF ...${progressPercent}%`
    : "Export GIF";
}

/**
 * Bootstrap the application once the module is loaded.
 *
 * @returns {void}
 */
function init() {
  attachUi();
  initializeTooltips();
  syncPaperPresetUi();
  dom.gifPreviewCanvas.title = TOOLTIP_TEXT["#gifPreviewCanvas"] || "";
  dom.gifImage.classList.add("hidden");
  dom.gifImage.hidden = true;
  dom.gifImage.removeAttribute("src");
  updateAnimationPreviewHeading();
  updateExportButtonLabel();

  if (typeof cv !== "undefined" && cv.onRuntimeInitialized) {
    cv.onRuntimeInitialized = onOpenCvReady;
  } else if (typeof cv !== "undefined") {
    onOpenCvReady();
  } else {
    setStatus("OpenCV.js did not load.");
  }

  updateSliderReadouts();
  attachResizeHandler();
  startGifPreviewLoop();
}

/**
 * Attach all DOM event listeners and classify controls by what they invalidate.
 *
 * @returns {void}
 */
function attachUi() {
  // Raw-photo drag-out is enabled for convenient access to the uploaded source image.
  makeCanvasDraggable(dom.rawCanvas, "raw-photo.png", () => state.source.canvas);
  // Disabled for now: dragging this preview out of the browser was useful for debugging,
  // but it is currently not desired in the UI. The helper is kept in case we restore it later.
  // makeCanvasDraggable(dom.rectifiedCanvas, "rectified-sheet.png", () => state.preview.rectifiedCanvas);
  makeLivePreviewDragCue();
  makeGifImageDraggable();

  dom.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropZone.classList.add("dragging");
  });
  dom.dropZone.addEventListener("dragleave", () => {
    dom.dropZone.classList.remove("dragging");
  });
  dom.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropZone.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  dom.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  });
  dom.loadDemoButton.addEventListener("click", () => {
    void loadImageSource("demo/mySrcImage.jpg", "mySrcImage.jpg");
  });
  dom.rectifiedCanvas.addEventListener("click", () => {
    state.preview.showRectifiedDiagnostic = !state.preview.showRectifiedDiagnostic;
    if (state.preview.rectifiedCanvas) {
      renderRectifiedPreview(state.preview.rectifiedCanvas);
    }
  });

  attachResetButton(dom.resetAppearanceButton, resetAppearanceControls);
  attachResetButton(dom.resetTrimButton, resetTrimControls);
  dom.tooltipToggleButton.addEventListener("click", () => {
    setTooltipsEnabled(!state.runtime.tooltipsEnabled);
  });

  dom.paperPreset.addEventListener("input", () => {
    syncPaperPresetUi();
    updateSliderReadouts();
    scheduleProcess();
  });
  dom.paperPreset.addEventListener("change", () => {
    syncPaperPresetUi();
    scheduleProcess();
  });

  const appearanceInputs = [dom.brightness, dom.contrast, dom.vibrance, dom.temperature, dom.invert];
  appearanceInputs.forEach((input) => {
    input.addEventListener("input", () => {
      revokeGifUrl();
      updateSliderReadouts();
      invalidateAppearanceCache();
      scheduleAppearancePreviewUpdate(false);
      cancelInFlightProcessing();
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      updateSliderReadouts();
      invalidateAppearanceCache();
      scheduleAppearancePreviewUpdate(false);
    });
  });

  const geometryInputs = [
    dom.paperWidth,
    dom.paperHeight,
    dom.frameCols,
    dom.frameRows,
    dom.thresholdMethod,
    dom.thresholdOffset,
    dom.paperMargin,
    dom.boundarySensitivity,
    dom.boundaryPersistence,
    dom.crossRoiScale,
    dom.useCrossAlignment,
  ];
  geometryInputs.forEach((input) => {
    input.addEventListener("input", () => {
      revokeGifUrl();
      updateSliderReadouts();
      scheduleProcess();
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      scheduleProcess();
    });
  });

  const lazyFrameInputs = [
    dom.gifResampling,
    dom.outputScale,
    dom.cropLeft,
    dom.cropRight,
    dom.cropTop,
    dom.cropBottom,
    dom.fps,
    dom.gifQuality,
    dom.gifDither,
    dom.gifGlobalPalette
  ];
  lazyFrameInputs.forEach((input) => {
    input.addEventListener("input", () => {
      revokeGifUrl();
      updateSliderReadouts();
      if (
        (input === dom.gifResampling) ||
        (input === dom.outputScale) ||
        (input === dom.cropLeft) ||
        (input === dom.cropRight) ||
        (input === dom.cropTop) ||
        (input === dom.cropBottom)
      ) invalidateFrameCaches();
      drawCurrentGifPreview();
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      if (
        (input === dom.gifResampling) ||
        (input === dom.outputScale) ||
        (input === dom.cropLeft) ||
        (input === dom.cropRight) ||
        (input === dom.cropTop) ||
        (input === dom.cropBottom)
      ) invalidateFrameCaches();
      drawCurrentGifPreview();
    });
  });

  dom.exportButton.addEventListener("click", () => {
    void exportGif();
  });
}

/**
 * Register tooltip text for major UI controls and keep them disabled by default.
 *
 * @returns {void}
 */
function initializeTooltips() {
  const tooltipMap = new Map();
  for (const [selector, text] of Object.entries(TOOLTIP_TEXT)) {
    document.querySelectorAll(selector).forEach((element) => {
      tooltipMap.set(element, text);
      const isFormControl = element.matches("input, select, textarea, output");
      if (isFormControl) {
        const label = element.closest("label");
        if (label) tooltipMap.set(label, text);
      }
    });
  }
  state.runtime.tooltipRegistry = [...tooltipMap.entries()];
  setTooltipsEnabled(false);
}

/**
 * Enable or disable native browser tooltips across the registered controls.
 *
 * @param {boolean} enabled
 * @returns {void}
 */
function setTooltipsEnabled(enabled) {
  state.runtime.tooltipsEnabled = enabled;
  for (const [element, text] of state.runtime.tooltipRegistry || []) {
    if (enabled && String(text || "").trim()) {
      element.title = text;
    } else {
      element.removeAttribute("title");
    }
  }
  dom.gifPreviewCanvas.title = TOOLTIP_TEXT["#gifPreviewCanvas"] || "";
  dom.tooltipToggleButton.textContent = enabled ? "Disable Tooltips" : "Enable Tooltips";
}

/**
 * Make a preview canvas draggable by exposing its backing canvas as a PNG data URL.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 * @param {() => HTMLCanvasElement | null} getSourceCanvas
 * @returns {void}
 */
function makeCanvasDraggable(canvas, filename, getSourceCanvas) {
  canvas.draggable = true;
  canvas.addEventListener("dragstart", (event) => {
    try {
      const sourceCanvas = getSourceCanvas?.() || canvas;
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
        event.preventDefault();
        return;
      }
      const dataUrl = sourceCanvas.toDataURL("image/png");
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/uri-list", dataUrl);
      event.dataTransfer.setData("text/plain", dataUrl);
      event.dataTransfer.setData("DownloadURL", `image/png:${filename}:${dataUrl}`);
    } catch (error) {
      console.error("Could not start canvas drag:", error);
    }
  });
}

/**
 * Make the exported GIF preview image draggable with a friendly filename.
 *
 * @returns {void}
 */
function makeGifImageDraggable() {
  dom.gifImage.draggable = true;
  dom.gifImage.addEventListener("dragstart", (event) => {
    if (!state.export.url || !state.export.filename) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/uri-list", state.export.url);
    event.dataTransfer.setData("text/plain", state.export.url);
    event.dataTransfer.setData("DownloadURL", `image/gif:${state.export.filename}:${state.export.url}`);
  });
}

/**
 * Intercept drag attempts on the live preview canvas and point the user toward Export GIF.
 *
 * @returns {void}
 */
function makeLivePreviewDragCue() {
  dom.gifPreviewCanvas.draggable = true;
  dom.gifPreviewCanvas.addEventListener("dragstart", (event) => {
    // Only an exported GIF is a real downloadable asset. The live canvas is just a viewer.
    if (state.export.url) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    triggerExportButtonAttention();
  });
}

/**
 * Run a brief cartoon-like "ring" animation on the Export GIF button.
 *
 * @returns {void}
 */
function triggerExportButtonAttention() {
  const button = dom.exportButton;
  button.classList.remove("button-ring");
  void button.offsetWidth;
  button.classList.add("button-ring");
  window.clearTimeout(state.preview.exportButtonRingTimer || 0);
  state.preview.exportButtonRingTimer = window.setTimeout(() => {
    button.classList.remove("button-ring");
  }, 900);
}

/**
 * Wire a small header reset button without toggling the parent details element.
 *
 * @param {HTMLButtonElement | null} button
 * @param {() => void} onReset
 * @returns {void}
 */
function attachResetButton(button, onReset) {
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onReset();
  });
}

/**
 * Restore all appearance controls to their defaults and invalidate derived caches.
 *
 * @returns {void}
 */
function resetAppearanceControls() {
  dom.brightness.value = "0";
  dom.contrast.value = "0";
  dom.vibrance.value = "0";
  dom.temperature.value = "0";
  dom.invert.checked = false;
  dom.gifResampling.value = "linear";
  revokeGifUrl();
  updateSliderReadouts();
  invalidateFrameCaches();
  invalidateAppearanceCache();
  refreshAppearanceOutputs();
  drawCurrentGifPreview();
}

/**
 * Restore all trim controls to zero and rerun geometry extraction.
 *
 * @returns {void}
 */
function resetTrimControls() {
  const alreadyReset =
    (Number(dom.cropLeft.value) || 0) === 0 &&
    (Number(dom.cropRight.value) || 0) === 0 &&
    (Number(dom.cropTop.value) || 0) === 0 &&
    (Number(dom.cropBottom.value) || 0) === 0;
  if (alreadyReset) {
    return;
  }
  dom.cropLeft.value = "0";
  dom.cropRight.value = "0";
  dom.cropTop.value = "0";
  dom.cropBottom.value = "0";
  revokeGifUrl();
  updateSliderReadouts();
  invalidateFrameCaches();
  drawCurrentGifPreview();
}

/**
 * Mark OpenCV ready and initialize any controls that depend on its runtime capabilities.
 *
 * @returns {void}
 */
function onOpenCvReady() {
  state.runtime.cvReady = true;
  populateResamplingOptions();
  setStatus("OpenCV.js ready.\nLoad frame-sheet image to begin.");
}

/**
 * Invalidate any queued or active processing pass by bumping the request id.
 *
 * @returns {void}
 */
function cancelInFlightProcessing() {
  state.processing.requestId += 1;
  state.processing.pending = false;
}

/**
 * Coalesce rapid appearance updates into one animation-frame preview refresh.
 *
 * @param {boolean} [includeRectified=false]
 * @returns {void}
 */
function scheduleAppearancePreviewUpdate(includeRectified = false) {
  state.preview.appearancePreviewNeedsRectified = state.preview.appearancePreviewNeedsRectified || includeRectified;
  if (state.preview.appearancePreviewRaf) return;
  state.preview.appearancePreviewRaf = requestAnimationFrame(() => {
    state.preview.appearancePreviewRaf = 0;
    if (state.preview.appearancePreviewNeedsRectified) {
      refreshAppearanceOutputs();
    }
    state.preview.appearancePreviewNeedsRectified = false;
    drawCurrentGifPreview();
  });
}

/**
 * Populate the resampling dropdown with only the interpolation modes available in this OpenCV build.
 *
 * @returns {void}
 */
function populateResamplingOptions() {
  const select = dom.gifResampling;
  const previousValue = select.value || "linear";
  select.innerHTML = "";
  const options = [
    { value: "linear", label: "Balanced (Linear)" },
    { value: "cubic", label: "Sharper (Cubic)" },
  ];
  if (typeof cv !== "undefined" && typeof cv.INTER_LANCZOS4 !== "undefined") {
    options.push({ value: "lanczos", label: "Maximum Detail (Lanczos)" });
  }
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    if (option.value === previousValue) el.selected = true;
    select.appendChild(el);
  }
}

/**
 * Rerender previews after window resize settles so canvases match their new boxes.
 *
 * @returns {void}
 */
function attachResizeHandler() {
  window.addEventListener("resize", () => {
    window.clearTimeout(state.preview.resizeTimer);
    state.preview.resizeTimer = window.setTimeout(() => {
      rerenderPreviews();
    }, 40);
  });
}

/**
 * Load an image selected by the user from a File object.
 *
 * @param {File} file
 * @returns {Promise<void>}
 */
async function handleFile(file) {
  const url = URL.createObjectURL(file);
  await loadImageSource(url, file.name || "", () => {
    URL.revokeObjectURL(url);
  });
}

/**
 * Load an image from a URL, reset dependent state, and kick off processing.
 *
 * @param {string} src
 * @param {string} [filename=""]
 * @param {(() => void) | null} [onComplete=null]
 * @returns {Promise<void>}
 */
async function loadImageSource(src, filename = "", onComplete = null) {
  const image = new Image();
  image.onload = async () => {
    try {
      document.body.classList.add("has-loaded-image");
      state.source.image = image;
      state.source.filename = filename || "";
      state.source.rawPageContour = null;
      state.geometry.baseRectifiedCanvas = null;
      state.geometry.baseRectifiedPageCanvas = null;
      state.geometry.pagePreviewGridQuad = null;
      state.preview.showRectifiedDiagnostic = false;
      state.geometry.alignmentInfo = null;
      state.geometry.frameCount = 0;
      invalidateFrameCaches();
      invalidateAppearanceCache();
      dom.rawPhotoName.textContent = filename ? `(${filename})` : "";
      drawImageToCanvas(image, state.source.canvas);
      renderRawPreview();
      revokeGifUrl();
      await processCurrentImage();
    } finally {
      onComplete?.();
    }
  };
  image.onerror = () => {
    onComplete?.();
    setStatus("Failed to load the selected image.");
  };
  image.src = src;
}

/**
 * Debounce a geometry-affecting reprocess so multiple control edits collapse into one run.
 *
 * @returns {void}
 */
function scheduleProcess() {
  if (!state.source.image) return;
  state.processing.requestId += 1;
  const requestId = state.processing.requestId;
  window.clearTimeout(state.processing.timer);
  state.processing.timer = window.setTimeout(() => {
    void processCurrentImage(requestId);
  }, 220);
}

/**
 * Read the current UI state and normalize it into a processing/export config object.
 *
 * @returns {{
 *   paperPreset:string,
 *   paperWidthIn:number,
 *   paperHeightIn:number,
 *   frameCols:number,
 *   frameRows:number,
 *   thresholdMethod:string,
 *   thresholdOffset:number,
 *   paperMarginPx:number,
 *   boundarySensitivity:number,
 *   boundaryPersistencePx:number,
 *   crossRoiScalePct:number,
 *   crossRoiScale:number,
 *   useCrossAlignment:boolean,
 *   crop:{left:number,right:number,top:number,bottom:number},
 *   filters:{brightness:number,contrast:number,vibrance:number,temperature:number,invert:boolean},
 *   fps:number,
 *   exportOptions:{quality:number,dither:string|false,resampling:string,globalPalette:boolean,outputScale:number}
 * }}
 */
function readConfig() {
  const paperPreset = dom.paperPreset.value || "letter";
  const presetSize = PAPER_PRESETS[paperPreset];
  const isCustomPaper = paperPreset === "custom";
  const paperWidth = isCustomPaper ? (Number(dom.paperWidth.value) || 11) : (presetSize?.width || 11);
  const paperHeight = isCustomPaper ? (Number(dom.paperHeight.value) || 8.5) : (presetSize?.height || 8.5);
  return {
    paperPreset,
    paperWidthIn: Math.max(1, paperWidth),
    paperHeightIn: Math.max(1, paperHeight),
    frameCols: Math.max(1, Math.round(Number(dom.frameCols.value) || 5)),
    frameRows: Math.max(1, Math.round(Number(dom.frameRows.value) || 4)),
    thresholdMethod: dom.thresholdMethod.value || "offset-peak",
    thresholdOffset: Math.max(-128, Math.min(128, Math.round(Number(dom.thresholdOffset.value) || -20))),
    paperMarginPx: Math.max(0, Math.min(150, Math.round(Number(dom.paperMargin.value) || 80))),
    boundarySensitivity: Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || 8)),
    boundaryPersistencePx: Math.max(1, Math.min(15, Math.round(Number(dom.boundaryPersistence.value) || 7))),
    crossRoiScalePct: Math.max(18, Math.min(110, Number(dom.crossRoiScale.value) || 52)),
    crossRoiScale: Math.max(0.18, Math.min(1.1, (Number(dom.crossRoiScale.value) || 52) / 100)),
    useCrossAlignment: dom.useCrossAlignment.checked,
    useRectifiedAsSource: false,
    crop: {
      left: Math.max(0, Math.round(Number(dom.cropLeft.value) || 0)),
      right: Math.max(0, Math.round(Number(dom.cropRight.value) || 0)),
      top: Math.max(0, Math.round(Number(dom.cropTop.value) || 0)),
      bottom: Math.max(0, Math.round(Number(dom.cropBottom.value) || 0)),
    },
    filters: {
      brightness: Number(dom.brightness.value) || 0,
      contrast: Number(dom.contrast.value) || 0,
      vibrance: Number(dom.vibrance.value) || 0,
      temperature: Number(dom.temperature.value) || 0,
      invert: dom.invert.checked,
    },
    fps: Math.max(1, Math.min(60, Math.round(Number(dom.fps.value) || 20))),
    exportOptions: {
      outputScale: Math.max(0.25, Math.min(1.0, Number(dom.outputScale.value) || 1)),
      quality: Math.max(1, Math.min(20, Math.round(Number(dom.gifQuality.value) || 10))),
      dither: (dom.gifDither.value && dom.gifDither.value !== "off") ? dom.gifDither.value : false,
      resampling: dom.gifResampling.value || "linear",
      globalPalette: dom.gifGlobalPalette.checked,
    },
  };
}

/**
 * Show or hide the custom paper size fields based on the current preset selection.
 *
 * @returns {void}
 */
function syncPaperPresetUi() {
  const presetKey = dom.paperPreset.value || "letter";
  const isCustom = presetKey === "custom";
  const preset = PAPER_PRESETS[presetKey];
  dom.customPaperFields.hidden = !isCustom;
  dom.paperWidth.disabled = !isCustom;
  dom.paperHeight.disabled = !isCustom;
  if (!isCustom && preset) {
    dom.paperWidth.value = String(preset.width);
    dom.paperHeight.value = String(preset.height);
  }
}

/**
 * Refresh all live numeric readouts attached to sliders and similar controls.
 *
 * @returns {void}
 */
function updateSliderReadouts() {
  dom.brightnessValue.textContent = formatSignedValue(dom.brightness.value);
  dom.contrastValue.textContent = formatSignedValue(dom.contrast.value);
  dom.vibranceValue.textContent = formatSignedValue(dom.vibrance.value);
  dom.temperatureValue.textContent = formatSignedValue(dom.temperature.value);
  dom.thresholdOffsetValue.textContent = formatSignedValue(dom.thresholdOffset.value);
  dom.paperMarginValue.textContent = `${Math.max(0, Math.min(150, Number(dom.paperMargin.value) || 80))} px`;
  dom.boundarySensitivityValue.textContent = `${Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || 8)).toFixed(1)}`;
  dom.boundaryPersistenceValue.textContent = String(Math.max(1, Math.min(15, Number(dom.boundaryPersistence.value) || 7)));
  const outputScale = Math.max(0.25, Math.min(1.0, Number(dom.outputScale.value) || 1));
  const scaledSize = getScaledOutputFrameSize(outputScale);
  dom.outputScaleValue.textContent = `${outputScale.toFixed(2)} (${scaledSize.width}\u00d7${scaledSize.height})`;
  dom.gifQualityValue.textContent = String(Math.max(1, Math.min(20, Number(dom.gifQuality.value) || 10)));
  if (!state.geometry.alignmentInfo) {
    dom.crossRoiScaleValue.textContent = "-- px";
    return;
  }
  const config = readConfig();
  const roiSizePx = estimateCrossRoiSidePx(
    state.geometry.alignmentInfo.rectifiedWidth,
    state.geometry.alignmentInfo.rectifiedHeight,
    config.frameCols,
    config.frameRows,
    config.crossRoiScale,
    config.paperWidthIn * 100,
    config.paperHeightIn * 100
  );
  dom.crossRoiScaleValue.textContent = `${roiSizePx} px`;
}

/**
 * Format a numeric slider value with an explicit sign for display.
 *
 * @param {string | number} value
 * @returns {string}
 */
function formatSignedValue(value) {
  const number = Number(value) || 0;
  return (number >= 0 ? "+" : "") + number;
}

/**
 * Run the full geometry/CV pipeline, update caches, and refresh all previews.
 *
 * @param {number} [requestId=state.processing.requestId]
 * @returns {Promise<void>}
 */
async function processCurrentImage(requestId = state.processing.requestId) {
  if (!state.runtime.cvReady) {
    setStatus("OpenCV is still loading.");
    return;
  }
  if (!state.source.image) return;
  if (state.processing.active) {
    state.processing.pending = true;
    return;
  }

  state.processing.active = true;
  dom.exportButton.disabled = true;

  try {
    const config = readConfig();
    const result = runPipeline(state.source.canvas, config, requestId, throwIfProcessAborted);
    if (requestId !== state.processing.requestId) return;

    state.frames.base = result.frames;
    state.geometry.frameCount = result.frames.length;
    state.geometry.alignmentInfo = result.alignmentInfo;
    state.geometry.baseRectifiedCanvas = result.rectifiedCanvas;
    state.geometry.baseRectifiedPageCanvas = result.pagePreviewCanvas;
    state.geometry.pagePreviewGridQuad = result.pagePreviewGridQuad;
    state.source.rawPageContour = result.pageQuadPoints;
    invalidateAppearanceCache();
    updateSliderReadouts();
    renderRawPreview();
    refreshAppearanceOutputs();
    renderCrossRoiGrid(result.alignmentInfo);
    drawCurrentGifPreview();
    dom.exportButton.disabled = state.geometry.frameCount === 0;
    updateExportButtonLabel();
    setStatus(result.statusText);
  } catch (error) {
    if (error?.name !== "ProcessAbortedError") {
      if (error?.partialResult?.pageQuadPoints) {
        state.source.rawPageContour = error.partialResult.pageQuadPoints;
        renderRawPreview();
      }
      if (error?.partialResult?.rectifiedCanvas) {
        state.geometry.baseRectifiedPageCanvas = error.partialResult.rectifiedCanvas;
        state.geometry.pagePreviewGridQuad = null;
        state.preview.rectifiedCanvas = error.partialResult.rectifiedCanvas;
        renderRectifiedPreview(error.partialResult.rectifiedCanvas);
      }
      console.error(error);
      updateExportButtonLabel();
      setStatus("Processing failed.\n" + (error?.message || String(error)));
    }
  } finally {
    state.processing.active = false;
    if (state.processing.pending) {
      state.processing.pending = false;
      window.clearTimeout(state.processing.timer);
      state.processing.timer = window.setTimeout(() => {
        void processCurrentImage(state.processing.requestId);
      }, 0);
    }
  }
}

/**
 * Throw a sentinel error if a stale processing pass is still running.
 *
 * @param {number} requestId
 * @returns {void}
 */
function throwIfProcessAborted(requestId) {
  if (requestId !== state.processing.requestId) {
    const error = new Error("Processing aborted.");
    error.name = "ProcessAbortedError";
    throw error;
  }
}

/**
 * Render the current rectified-sheet canvas into its preview panel.
 *
 * @param {HTMLCanvasElement} rectifiedCanvas
 * @returns {void}
 */
function renderRectifiedPreview(rectifiedCanvas) {
  const diagnosticSource = state.geometry.baseRectifiedPageCanvas || rectifiedCanvas;
  const displayCanvas = state.preview.showRectifiedDiagnostic
    ? getRectifiedConvolutionCanvas(diagnosticSource)
    : rectifiedCanvas;
  renderCanvasFit(displayCanvas, dom.rectifiedCanvas);
  const targetCanvas = dom.rectifiedCanvas;
  const scale = Math.min(targetCanvas.width / displayCanvas.width, targetCanvas.height / displayCanvas.height);
  const drawW = displayCanvas.width * scale;
  const drawH = displayCanvas.height * scale;
  const offsetX = (targetCanvas.width - drawW) * 0.5;
  const offsetY = (targetCanvas.height - drawH) * 0.5;
  const ctx = targetCanvas.getContext("2d");
  const margin = Math.max(0, Math.min(150, readConfig().paperMarginPx || 0));

  ctx.save();
  // Blue inset marks the part of the page that is excluded from the coarse cross sweeps.
  ctx.strokeStyle = "rgba(0, 0, 255, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    offsetX + margin * scale + 0.5,
    offsetY + margin * scale + 0.5,
    Math.max(0, drawW - (margin * 2 * scale) - 1),
    Math.max(0, drawH - (margin * 2 * scale) - 1)
  );

  const quad = state.geometry.pagePreviewGridQuad;
  if (!quad) {
    ctx.restore();
    return;
  }

  // Red quad marks the coarse frame-grid bounds detected from the convolution profiles.
  ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(offsetX + quad.tl.x * scale, offsetY + quad.tl.y * scale);
  ctx.lineTo(offsetX + quad.tr.x * scale, offsetY + quad.tr.y * scale);
  ctx.lineTo(offsetX + quad.br.x * scale, offsetY + quad.br.y * scale);
  ctx.lineTo(offsetX + quad.bl.x * scale, offsetY + quad.bl.y * scale);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Build the cross-kernel convolution diagnostic image for the current rectified-page preview.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement}
 */
function getRectifiedConvolutionCanvas(sourceCanvas) {
  return buildCrossConvolutionCanvas(sourceCanvas, state.preview.rectifiedDiagnosticCanvas);
}

/**
 * Invalidate all appearance-adjusted frame/rectified caches while keeping base geometry intact.
 *
 * @returns {void}
 */
function invalidateAppearanceCache() {
  state.frames.adjustedCache.clear();
  state.preview.rectifiedCanvas = null;
}

/**
 * Invalidate lazily extracted base frames and any adjusted-frame cache derived from them.
 *
 * @returns {void}
 */
function invalidateFrameCaches() {
  state.frames.base = new Array(state.geometry.frameCount);
  state.frames.adjustedCache.clear();
}

/**
 * Refresh the rectified-sheet preview, applying appearance adjustments only when needed.
 *
 * @returns {void}
 */
function refreshAppearanceOutputs() {
  if (!state.geometry.baseRectifiedPageCanvas) return;
  const filters = readConfig().filters;
  if (!hasAppearanceAdjustments(filters)) {
    state.preview.rectifiedCanvas = state.geometry.baseRectifiedPageCanvas;
  } else {
    applyVisualAdjustments(state.geometry.baseRectifiedPageCanvas, state.preview.adjustedRectifiedCanvas, filters);
    state.preview.rectifiedCanvas = state.preview.adjustedRectifiedCanvas;
  }
  renderRectifiedPreview(state.preview.rectifiedCanvas);
}

/**
 * Lazily extract one unadjusted animation frame from the cached rectified sheet.
 *
 * @param {number} index
 * @returns {HTMLCanvasElement | null}
 */
function getBaseFrameCanvas(index) {
  const cached = state.frames.base[index];
  if (cached) return cached;
  if (!state.geometry.baseRectifiedCanvas || !state.geometry.alignmentInfo) return null;
  const rectifiedMat = cv.imread(state.geometry.baseRectifiedCanvas);
  try {
    const config = readConfig();
    const cols = state.geometry.alignmentInfo.cols;
    const col = index % cols;
    const row = Math.floor(index / cols);
    // Extraction stays lazy: pull just this frame from the rectified sheet, then apply
    // post-crop output scaling without forcing the whole animation to be rebuilt.
    const frame = extractSingleFrameToCanvas(
      rectifiedMat,
      state.geometry.alignmentInfo,
      col,
      row,
      config.crop,
      getCvInterpolationFlag(config.exportOptions.resampling)
    );
    const scaledFrame = scaleOutputCanvas(frame, config.exportOptions.outputScale, config.exportOptions.resampling);
    state.frames.base[index] = scaledFrame;
    return scaledFrame;
  } finally {
    rectifiedMat.delete();
  }
}

/**
 * Compute the current post-crop, post-scale frame size shown in the Output Scale readout.
 *
 * @param {number} outputScale
 * @returns {{width:number|string, height:number|string}}
 */
function getScaledOutputFrameSize(outputScale) {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo) return { width: "--", height: "--" };
  const config = readConfig();
  const cellWidth = alignmentInfo.gridBounds.width / alignmentInfo.cols;
  const cellHeight = alignmentInfo.gridBounds.height / alignmentInfo.rows;
  const croppedWidth = Math.max(1, Math.round(cellWidth - config.crop.left - config.crop.right));
  const croppedHeight = Math.max(1, Math.round(cellHeight - config.crop.top - config.crop.bottom));
  return {
    width: Math.max(1, Math.round(croppedWidth * outputScale)),
    height: Math.max(1, Math.round(croppedHeight * outputScale)),
  };
}

/**
 * Apply the post-crop output scaling used by preview and GIF export.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} outputScale
 * @param {string} resampling
 * @returns {HTMLCanvasElement}
 */
function scaleOutputCanvas(sourceCanvas, outputScale, resampling) {
  if (!sourceCanvas) return sourceCanvas;
  const scale = Math.max(0.25, Math.min(1.0, outputScale || 1));
  if (Math.abs(scale - 1) < 1e-6) return sourceCanvas;
  const scaled = document.createElement("canvas");
  scaled.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  scaled.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const ctx = scaled.getContext("2d");
  // Use browser scaling only for the final post-crop output-size change; geometric warps still happen in OpenCV.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = (resampling === "linear") ? "medium" : "high";
  ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/**
 * Lazily apply appearance adjustments to one cached base frame.
 *
 * @param {number} index
 * @returns {HTMLCanvasElement | null}
 */
function getAdjustedFrameCanvas(index) {
  const baseFrame = getBaseFrameCanvas(index);
  if (!baseFrame) return null;
  const filters = readConfig().filters;
  if (!hasAppearanceAdjustments(filters)) return baseFrame;
  if (state.frames.adjustedCache.has(index)) return state.frames.adjustedCache.get(index);
  const adjustedFrame = document.createElement("canvas");
  applyVisualAdjustments(baseFrame, adjustedFrame, filters);
  state.frames.adjustedCache.set(index, adjustedFrame);
  return adjustedFrame;
}

/**
 * Render the raw photo preview and overlay the detected page quad in lime.
 *
 * @returns {void}
 */
function renderRawPreview() {
  renderCanvasFit(state.source.canvas, dom.rawCanvas);
  if (!state.source.rawPageContour || state.source.rawPageContour.length !== 4) return;
  const targetCanvas = dom.rawCanvas;
  const sourceCanvas = state.source.canvas;
  const ctx = targetCanvas.getContext("2d");
  const scale = Math.min(targetCanvas.width / sourceCanvas.width, targetCanvas.height / sourceCanvas.height);
  const drawW = sourceCanvas.width * scale;
  const drawH = sourceCanvas.height * scale;
  const offsetX = (targetCanvas.width - drawW) * 0.5;
  const offsetY = (targetCanvas.height - drawH) * 0.5;
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < state.source.rawPageContour.length; i++) {
    const pt = state.source.rawPageContour[i];
    const x = offsetX + (pt.x * scale);
    const y = offsetY + (pt.y * scale);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Rebuild the cross-region diagnostic grid from the latest alignment result.
 *
 * @param {object | null} alignmentInfo
 * @returns {void}
 */
function renderCrossRoiGrid(alignmentInfo) {
  const grid = dom.crossRoiGrid;
  grid.innerHTML = "";
  if (!alignmentInfo || !alignmentInfo.crossRoiTiles || alignmentInfo.crossRoiTiles.length === 0) {
    grid.textContent = "";
    return;
  }
  grid.style.gridTemplateColumns = `repeat(${alignmentInfo.cols + 1}, max-content)`;
  for (let row = 0; row <= alignmentInfo.rows; row++) {
    for (let col = 0; col <= alignmentInfo.cols; col++) {
      const isCorner = ((col === 0) || (col === alignmentInfo.cols)) && ((row === 0) || (row === alignmentInfo.rows));
      if (isCorner && !alignmentInfo.includeCornerCrosses) {
        const spacer = document.createElement("div");
        spacer.className = "cross-roi-empty";
        grid.appendChild(spacer);
        continue;
      }
      const tile = alignmentInfo.crossRoiTileMap.get(`${col},${row}`);
      if (tile) {
        tile.canvas.classList.add("cross-roi-tile");
        tile.canvas.title = (tile.kind === "unrefined") ? "" : `(${col}, ${row}) ${tile.accepted ? "accepted" : "rejected"}`;
        grid.appendChild(tile.canvas);
      } else {
        const spacer = document.createElement("div");
        spacer.className = "cross-roi-empty";
        grid.appendChild(spacer);
      }
    }
  }
}

/**
 * Drive the live animation preview at the configured frame rate.
 *
 * @returns {void}
 */
function startGifPreviewLoop() {
  const loop = (time) => {
    if (state.geometry.frameCount > 0) {
      const fps = readConfig().fps;
      const frameDelay = 1000 / fps;
      if ((time - state.preview.lastTime) >= frameDelay) {
        state.preview.lastTime = time;
        state.preview.frameIndex = (state.preview.frameIndex + 1) % state.geometry.frameCount;
        drawCurrentGifPreview();
      }
    }
    state.preview.loopHandle = requestAnimationFrame(loop);
  };
  state.preview.loopHandle = requestAnimationFrame(loop);
}

/**
 * Draw the current animation frame into the preview panel.
 *
 * @returns {void}
 */
function drawCurrentGifPreview() {
  if (state.export.url) {
    // After export, this panel becomes a GIF viewer until some setting invalidates that GIF.
    dom.gifPreviewCanvas.hidden = true;
    updateAnimationPreviewHeading();
    return;
  }
  dom.gifPreviewCanvas.hidden = false;
  updateAnimationPreviewHeading();
  const frame = getAdjustedFrameCanvas(state.preview.frameIndex);
  if (!frame) {
    const ctx = dom.gifPreviewCanvas.getContext("2d");
    resizeCanvasToBox(dom.gifPreviewCanvas);
    ctx.clearRect(0, 0, dom.gifPreviewCanvas.width, dom.gifPreviewCanvas.height);
    return;
  }
  renderCanvasFit(frame, dom.gifPreviewCanvas);
}

/**
 * Rerender all visible previews after a resize or other display-only change.
 *
 * @returns {void}
 */
function rerenderPreviews() {
  if (state.source.image) renderRawPreview();
  if (state.preview.rectifiedCanvas) renderRectifiedPreview(state.preview.rectifiedCanvas);
  drawCurrentGifPreview();
}

/**
 * Materialize all adjusted frames and hand them off to gif.js for encoding.
 *
 * @returns {Promise<void>}
 */
async function exportGif() {
  if (!state.geometry.frameCount) return;
  dom.exportButton.disabled = true;
  updateExportButtonLabel(0);
  setStatus("Encoding GIF…");

  const config = readConfig();
  const firstFrame = getAdjustedFrameCanvas(0);
  if (!firstFrame) {
    dom.exportButton.disabled = false;
    updateExportButtonLabel();
    return;
  }

  const gif = new GIF({
    workers: 2,
    quality: config.exportOptions.quality,
    width: firstFrame.width,
    height: firstFrame.height,
    repeat: 0,
    dither: config.exportOptions.dither,
    globalPalette: config.exportOptions.globalPalette,
    workerScript: "js/gif.worker.js",
  });

  const delay = Math.max(1, Math.round(1000 / config.fps));
  for (let i = 0; i < state.geometry.frameCount; i++) {
    // Preview stays lazy, but export must realize the full adjusted frame set.
    gif.addFrame(getAdjustedFrameCanvas(i), { copy: true, delay });
  }

  gif.on("finished", (blob) => {
    revokeGifUrl();
    state.export.filename = makeGifFilename(state.source.filename, config.exportOptions.quality);
    state.export.url = URL.createObjectURL(blob);
    dom.gifImage.src = state.export.url;
    dom.gifPreviewCanvas.hidden = true;
    dom.gifImage.classList.remove("hidden");
    dom.gifImage.hidden = false;
    updateAnimationPreviewHeading();
    downloadBlobWithFilename(blob, state.export.filename);
    dom.exportButton.disabled = false;
    updateExportButtonLabel();
    setStatus("GIF ready.\nFrame count: " + state.geometry.frameCount);
  });
  gif.on("progress", (progress) => {
    const progressPercent = Math.round(progress * 100);
    updateExportButtonLabel(progressPercent);
    setStatus("Encoding GIF…\n" + progressPercent + "%");
  });
  gif.render();
}

/**
 * Revoke and hide any previously exported GIF URL.
 *
 * @returns {void}
 */
function revokeGifUrl() {
  if (!state.export.url) return;
  URL.revokeObjectURL(state.export.url);
  state.export.url = "";
  state.export.filename = "";
  // Any settings change invalidates the exported GIF and returns the panel to live preview mode.
  dom.gifPreviewCanvas.hidden = false;
  dom.gifImage.classList.add("hidden");
  dom.gifImage.hidden = true;
  dom.gifImage.removeAttribute("src");
  updateAnimationPreviewHeading();
}

/**
 * Build a friendly exported GIF filename from the source name, timestamp, and quality.
 *
 * @param {string} sourceFilename
 * @param {number} [quality=10]
 * @returns {string}
 */
function makeGifFilename(sourceFilename, quality = 10) {
  const base = sanitizeFilenameBase(sourceFilename || "frame_sheet");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${base}_anim_${yyyy}${mm}${dd}_${hh}${mi}${ss}_q${quality}.gif`;
}

/**
 * Strip unsupported characters from a filename stem.
 *
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilenameBase(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "frame_sheet";
}

/**
 * Trigger a download for an in-memory blob with a caller-supplied filename.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {void}
 */
function downloadBlobWithFilename(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Update the status panel text.
 *
 * @param {string} text
 * @returns {void}
 */
function setStatus(text) {
  dom.statusText.textContent = text;
}
