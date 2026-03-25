import { PAPER_PRESETS, dom, state } from "./dom-state.js";
import { SETTINGS_DEFAULTS, applyAppearanceDefaults, applyCropGeometryDefaults, applyNonLayoutDefaults } from "./settings-defaults.js";
import { applyVisualAdjustments, hasAppearanceAdjustments } from "./appearance.js";
import { drawImageToCanvas, renderCanvasFit, resizeCanvasToBox } from "./canvas-view.js";
import {
  setBusyState as syncBusyState,
  releaseOwnedSourceUrl as releaseSourceUrl,
  handleFile as loadFileSource,
  loadImageSource as loadImageSourceViaController,
} from "./load-controller.js";
import {
  releaseRectifiedDragUrl as releaseRectifiedDragAsset,
  primeRectifiedDragAsset as buildRectifiedDragAsset,
  makeCanvasDraggable as attachCanvasDragAsset,
  makeGifImageDraggable as attachGifImageDragAsset,
  makeLivePreviewDragCue as attachLivePreviewDragCue,
  makeRectifiedFilename,
} from "./drag-assets.js";
import {
  attachUi as wireUiControls,
  initializeTooltips as registerTooltips,
  setTooltipsEnabled as applyTooltipState,
} from "./ui-controls.js";
import {
  updateAnimationPreviewHeading as syncAnimationPreviewHeading,
  updatePreviewPlayPauseButton as syncPreviewPlayPauseButton,
  getOrderedFrameCount as getPreviewOrderedFrameCount,
  getOrderedFrameIndex as getPreviewOrderedFrameIndex,
  startGifPreviewLoop as startPreviewLoop,
  drawCurrentGifPreview as drawPreviewFrame,
  rerenderPreviews as rerenderPreviewSurfaces,
} from "./preview-controller.js";
import { createStoredZip } from "./zip-builder.js";
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
  "#loadDemoSelect": "Loads one of the bundled demo images listed in the demo manifest.",
  "#dropZone": "Drop a photo or scan of a plotted frame-sheet here, or click to choose a file. Pages must be in landscape orientation.",
  "#layoutSummary": "Sets the frame-grid dimensions and paper format assumptions.",
  "#frameCols": "Number of animation frame columns in the plotted grid.",
  "#frameRows": "Number of animation frame rows in the plotted grid.",
  "#paperPreset": "Choose a landscape paper preset, or Custom to enter your own dimensions.",
  "#paperWidth": "Custom paper width (arbitrary units) when Paper Size is set to Custom.",
  "#paperHeight": "Custom paper height (arbitrary units) when Paper Size is set to Custom.",
  "#pageGridDetectionSummary": "Controls for finding the paper and locating the outer frame-grid region on the page.",
  "#frameAlignmentSummary": "Controls for refining the frame-alignment markers inside the detected grid region.",
  "#thresholdMethod": "Thresholding methods for finding the paper quadrilateral.",
  "#thresholdOffset": "Nudges the paper threshold darker or lighter after thresholding.",
  "#paperMargin": "Insets the coarse boundary search away from the page edge to avoid background bleed and warped borders.",
  "#boundarySensitivity": "The threshold used to find the frame-grid.",
  "#boundaryPersistence": "How many consecutive pixels must stay above the threshold before the frame-grid boundary is accepted.",
  "#alignmentMarkerTypeField": "Choose whether frame alignment uses cross markers or filled-dot markers.",
  "#alignmentMarkerTypeCrosses": "Use cross-shaped alignment markers when refining the frame grid.",
  "#alignmentMarkerTypeCircles": "Use filled-dot alignment markers when refining the frame grid.",
  "#crossRoiScale": "Sets the size of the square search regions used to localize each alignment marker.",
  "#detectCrossesWithConvolution": "Use the cross-kernel convolution inside each ROI instead of the default profile-based localizer.",
  "#useCrossAlignment": "Use detected alignment markers to refine frame extraction beyond a nominal equal-spaced grid.",
  "#appearanceSummary": "Adjusts the look of the extracted animation frames.",
  "#resetAppearanceButton": "Restores all appearance controls to their default values.",
  "#brightness": "Adjusts perceptual lightness before contrast and vibrance are applied.",
  "#contrast": "Applies a midpoint-preserving contrast curve to OKLab lightness.",
  "#vibrance": "Boosts or reduces muted colors more than already-saturated colors.",
  "#temperature": "Shifts the image white balance cooler or warmer using chromatic adaptation after the OKLab adjustments.",
  "#unsharpRadius": "Sets the blur radius used by the unsharp mask sharpening stage.",
  "#unsharpAmount": "Controls how strongly the blurred image is subtracted to sharpen edges.",
  "#invert": "Inverts the animation frames like a photographic negative.",
  "#gifResampling": "Selects the interpolation method used when extracting and unwarping frames.",
  "#cropOutputSummary": "Crops the extracted animation frames and applies simple post-crop geometry transforms.",
  "#resetTrimButton": "Restores all crop values to zero.",
  "#cropLeft": "Crops pixels from the left side of the animation (before optional output scaling).",
  "#cropRight": "Crops pixels from the right side of the animation (before optional output scaling).",
  "#cropTop": "Crops pixels from the top of the animation (before optional output scaling).",
  "#cropBottom": "Crops pixels from the bottom of the animation (before optional output scaling).",
  "#flipHorizontal": "Flip the post-cropped animation frames left-to-right.",
  "#flipVertical": "Flip the post-cropped animation frames top-to-bottom.",
  "#rotate90Cw": "Rotate the post-cropped animation frames 90 degrees clockwise.",
  "#gifExportSummary": "Controls that affect preview playback and exported output files.",
  "#fps": "Playback speed of the preview animation and exported GIF in frames per second.",
  "#outputScale": "Scales the final animation for preview and export (post-cropping).",
  "#gifQuality": "GIF encoder quality setting. Lower numbers are slower but higher quality.",
  "#gifDither": "Selects the dithering method used during GIF color quantization.",
  "#gifGlobalPalette": "Use one shared palette for all GIF frames, instead of per-frame palettes.",
  "#reverseOrder": "Reverse the playback and export order of the animation frames.",
  "#pingPong": "Play and export the animation forward and backward without repeating the endpoints.",
  "#statusHeading": "Processing and diagnostic status for the current image and settings.",
  "#tooltipToggleButton": "Turn tooltips on or off throughout the interface.",
  "#statusText": "Current pipeline status and other diagnostic information.",
  "#rawPhotoHeading": "Preview of the original source image.",
  "#rawCanvas": "Preview of the source photo. The detected paper contour is outlined in green.",
  "#rectifiedSheetHeading": "Preview of the rectified page used for frame detection and extraction.",
  "#rectifiedCanvas": "Preview of the rectified page; click to toggle the convolution diagnostic view.",
  "#crossRegionsHeading": "Diagnostic tiles showing the regions used to localize each frame-alignment marker.",
  "#crossRoiGrid": "Per-marker diagnostic regions used to inspect frame-alignment marker detection.",
  "#animationPreviewHeading": "Live animation preview using the current settings.",
  "#previewPlayPauseButton": "Pause or resume the live animation preview.",
  "#exportZipButton": "Download a ZIP archive containing the current animation frames as PNG files.",
  "#exportButton": "Render and download the animated GIF using the current settings.",
  "#saveSettingsButton": "Download the current settings as the same tab-separated settings.txt file included in the ZIP export.",
  "#gifPreviewCanvas": "This is a live animation preview. Click 'Export GIF' to generate the GIF.",
  "#gifImage": "Most recently exported GIF preview image.",
};

init();

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
 * Populate the Load Demo pulldown from a small manifest in `demo/index.json`.
 *
 * Browsers do not reliably expose directory listings to client-side code, so this manifest keeps
 * demo filenames out of the app logic while still allowing the UI to reflect the current demo set.
 *
 * @returns {Promise<void>}
 */
async function populateDemoSelect() {
  const select = dom.loadDemoSelect;
  if (!select) return;
  try {
    const response = await fetch("demo/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const filenames = await response.json();
    if (!Array.isArray(filenames)) throw new Error("Demo manifest is not an array.");
    for (const filename of filenames) {
      if (typeof filename !== "string") continue;
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename;
      select.appendChild(option);
    }
    select.disabled = filenames.length === 0;
  } catch (error) {
    console.warn("Could not populate demo list.", error);
    select.disabled = true;
  }
}

/**
 * Small local wrapper around the preview module's heading sync.
 *
 * @returns {void}
 */
function updateAnimationPreviewHeading() {
  syncAnimationPreviewHeading(dom, state);
}

/**
 * Small local wrapper around the preview module's play/pause-button sync.
 *
 * @returns {void}
 */
function updatePreviewPlayPauseButton() {
  syncPreviewPlayPauseButton(dom, state);
}

/**
 * Small local wrapper around the preview module's sequence-length logic.
 *
 * @returns {number}
 */
function getOrderedFrameCount() {
  return getPreviewOrderedFrameCount(state, readConfig);
}

/**
 * Small local wrapper around the preview module's frame-order mapping.
 *
 * @param {number} previewIndex
 * @returns {number}
 */
function getOrderedFrameIndex(previewIndex) {
  return getPreviewOrderedFrameIndex(previewIndex, state, readConfig);
}

/**
 * Draw the current preview frame via the dedicated preview controller.
 *
 * @returns {void}
 */
function drawCurrentGifPreview() {
  drawPreviewFrame({ dom, state, getAdjustedFrameCanvas, readConfig });
}

/**
 * Start the preview loop via the dedicated preview controller.
 *
 * @returns {void}
 */
function startAnimationPreviewLoop() {
  startPreviewLoop({ state, readConfig, drawCurrentGifPreview });
}

/**
 * Rerender visible previews after display-only changes such as resize.
 *
 * @returns {void}
 */
function rerenderPreviews() {
  rerenderPreviewSurfaces({ state, renderRawPreview, renderRectifiedPreview, drawCurrentGifPreview });
}

/**
 * Small local wrapper around the ui-controls module's tooltip state toggler.
 *
 * @param {boolean} enabled
 * @returns {void}
 */
function setTooltipsEnabled(enabled) {
  applyTooltipState({
    dom,
    state,
    enabled,
    previewTooltipText: TOOLTIP_TEXT["#gifPreviewCanvas"] || "",
  });
}

/**
 * Small local wrapper around the load controller's busy-state sync.
 *
 * @param {boolean} busy
 * @returns {void}
 */
function setBusyState(busy) {
  syncBusyState(dom, state, busy);
}

/**
 * Yield one browser paint so UI updates land before kicking off heavier work.
 *
 * @returns {Promise<void>}
 */
async function waitForNextPaint() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Small local wrapper around the drag-assets module's rectified drag-URL cleanup.
 *
 * @returns {void}
 */
function releaseRectifiedDragUrl() {
  releaseRectifiedDragAsset(state);
}

/**
 * Small local wrapper around the drag-assets module's rectified drag-asset builder.
 *
 * @param {HTMLCanvasElement | null} rectifiedCanvas
 * @returns {void}
 */
function primeRectifiedDragAsset(rectifiedCanvas) {
  buildRectifiedDragAsset(state, rectifiedCanvas);
}

/**
 * Small local wrapper around the drag-assets module's generic canvas drag hookup.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {() => {url?:string, filename:string, mimeType:string, canvas?:HTMLCanvasElement | null} | null} getDragAsset
 * @returns {void}
 */
function makeCanvasDraggable(canvas, getDragAsset) {
  attachCanvasDragAsset(canvas, getDragAsset);
}

/**
 * Small local wrapper around the drag-assets module's exported-GIF drag hookup.
 *
 * @returns {void}
 */
function makeGifImageDraggable() {
  attachGifImageDragAsset(dom, state);
}

/**
 * Small local wrapper around the drag-assets module's live-preview drag cue hookup.
 *
 * @returns {void}
 */
function makeLivePreviewDragCue() {
  attachLivePreviewDragCue(dom, state);
}

/**
 * Clear all derived preview surfaces so a newly loaded source image never shows stale results.
 *
 * @returns {void}
 */
function clearDerivedPreviews() {
  state.preview.rectifiedCanvas = null;
  releaseRectifiedDragUrl();
  state.preview.rectifiedDragBuildId += 1;
  state.geometry.baseRectifiedCanvas = null;
  state.geometry.baseRectifiedPageCanvas = null;
  state.geometry.pagePreviewGridQuad = null;
  state.geometry.alignmentInfo = null;
  state.geometry.frameCount = 0;
  state.frames.base = [];
  state.frames.adjustedCache.clear();
  state.preview.frameIndex = 0;
  state.preview.showRectifiedDiagnostic = false;

  const rectifiedCtx = dom.rectifiedCanvas.getContext("2d");
  resizeCanvasToBox(dom.rectifiedCanvas);
  rectifiedCtx.clearRect(0, 0, dom.rectifiedCanvas.width, dom.rectifiedCanvas.height);
  dom.rectifiedCanvas.parentElement?.classList.add("is-empty");

  const previewCtx = dom.gifPreviewCanvas.getContext("2d");
  resizeCanvasToBox(dom.gifPreviewCanvas);
  previewCtx.clearRect(0, 0, dom.gifPreviewCanvas.width, dom.gifPreviewCanvas.height);
  dom.gifPreviewCanvas.parentElement?.classList.add("is-empty");

  dom.crossRoiGrid.innerHTML = "";
  dom.crossRoiGrid.classList.add("is-empty");
  dom.exportButton.disabled = true;
  dom.exportZipButton.disabled = true;
  dom.saveSettingsButton.disabled = true;
  updatePreviewPlayPauseButton();
  updateAnimationPreviewHeading();
  updateExportButtonLabel();
}

/**
 * Clear every preview panel back to its striped empty state while a new source image is loading.
 *
 * This prevents stale raw/rectified/animation content from lingering between source-image loads.
 *
 * @returns {void}
 */
function clearAllPreviews() {
  state.source.rawPageContour = null;
  state.preview.paused = false;
  updatePreviewPlayPauseButton();

  const rawCtx = dom.rawCanvas.getContext("2d");
  resizeCanvasToBox(dom.rawCanvas);
  rawCtx.clearRect(0, 0, dom.rawCanvas.width, dom.rawCanvas.height);
  dom.rawCanvas.parentElement?.classList.add("is-empty");

  clearDerivedPreviews();
}

/**
 * Bootstrap the application once the module is loaded.
 *
 * @returns {void}
 */
function init() {
  attachUi();
  initAccordionPanels();
  initializeTooltips();
  void populateDemoSelect();
  syncPaperPresetUi();
  syncAlignmentMarkerUi();
  dom.gifPreviewCanvas.title = TOOLTIP_TEXT["#gifPreviewCanvas"] || "";
  dom.gifImage.classList.add("hidden");
  dom.gifImage.hidden = true;
  dom.gifImage.removeAttribute("src");
  updateAnimationPreviewHeading();
  updateExportButtonLabel();
  updatePreviewPlayPauseButton();

  if (typeof cv !== "undefined" && cv.onRuntimeInitialized) {
    cv.onRuntimeInitialized = onOpenCvReady;
  } else if (typeof cv !== "undefined") {
    onOpenCvReady();
  } else {
    setStatus("OpenCV.js did not load.");
  }

  updateSliderReadouts();
  attachResizeHandler();
  startAnimationPreviewLoop();
}

/**
 * Small local wrapper around the ui-controls module's event wiring.
 *
 * @returns {void}
 */
function attachUi() {
  wireUiControls({
    dom,
    state,
    makeCanvasDraggable,
    makeRectifiedFilename,
    makeLivePreviewDragCue,
    makeGifImageDraggable,
    handleFile,
    loadSelectedDemo: (filename) => { void loadImageSource(`demo/${filename}`, filename); },
    renderRectifiedPreview,
    resetAppearanceControls,
    resetTrimControls,
    toggleTooltips: () => setTooltipsEnabled(!state.runtime.tooltipsEnabled),
    togglePreviewPaused: () => {
      if (dom.previewPlayPauseButton.disabled) return;
      state.preview.paused = !state.preview.paused;
      state.preview.lastTime = performance.now();
      updatePreviewPlayPauseButton();
      drawCurrentGifPreview();
    },
    syncPaperPresetUi,
    syncAlignmentMarkerUi,
    updateSliderReadouts,
    scheduleProcess,
    revokeGifUrl,
    invalidateAppearanceCache,
    scheduleAppearancePreviewUpdate,
    cancelInFlightProcessing,
    invalidateFrameCaches,
    drawCurrentGifPreview,
    exportGif,
    exportZip,
    saveSettingsFile,
  });
}

/**
 * Small local wrapper around the ui-controls module's tooltip registration.
 *
 * @returns {void}
 */
function initializeTooltips() {
  registerTooltips({
    tooltipText: TOOLTIP_TEXT,
    state,
    dom,
    applyTooltipState: setTooltipsEnabled,
  });
}

/**
 * Make the sidebar's collapsible control groups behave like an accordion.
 *
 * Opening one collapsible panel closes the others, while non-collapsible sections
 * like Photo and Status remain unaffected.
 *
 * @returns {void}
 */
function initAccordionPanels() {
  const panels = [...document.querySelectorAll(".control-panel details.collapsible")];
  panels.forEach((panel) => {
    panel.addEventListener("toggle", () => {
      if (!panel.open) return;
      panels.forEach((other) => {
        if (other !== panel) other.open = false;
      });
    });
  });
}

/**
 * Close all collapsible sidebar panels.
 *
 * This is used when loading a new image so the user returns to the compact default layout.
 *
 * @returns {void}
 */
function collapseAllPanels() {
  const panels = document.querySelectorAll(".control-panel details.collapsible");
  panels.forEach((panel) => {
    panel.open = false;
  });
}

/**
 * Restore all appearance controls to their defaults and invalidate derived caches.
 *
 * @returns {void}
 */
function resetAppearanceControls() {
  applyAppearanceDefaults(dom);
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
    (Number(dom.cropBottom.value) || 0) === 0 &&
    !dom.flipHorizontal.checked &&
    !dom.flipVertical.checked &&
    !dom.rotate90Cw.checked;
  if (alreadyReset) {
    return;
  }
  applyCropGeometryDefaults(dom);
  revokeGifUrl();
  updateSliderReadouts();
  invalidateFrameCaches();
  drawCurrentGifPreview();
}

/**
 * Restore every non-Layout control to its default value.
 *
 * Layout settings are intentionally preserved across image loads, while detection,
 * appearance, crop/geometry, and GIF export controls all return to their startup defaults.
 *
 * @returns {void}
 */
function resetNonLayoutControls() {
  applyNonLayoutDefaults(dom);

  state.preview.paused = false;
  updatePreviewPlayPauseButton();
  syncAlignmentMarkerUi();
  updateSliderReadouts();
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
async function handleFile(file, files = null) {
  await loadFileSource(file, files, { state, loadImageSource, applySettingsFile });
}

/**
 * Load an image from a URL, reset dependent state, and kick off processing.
 *
 * @param {string} src
 * @param {string} [filename=""]
 * @param {string} [mimeType="image/jpeg"]
 * @returns {Promise<void>}
 */
async function loadImageSource(src, filename = "", mimeType = "image/jpeg", settingsFile = null) {
  await loadImageSourceViaController({
    src,
    filename,
    mimeType,
    settingsFile,
    dom,
    state,
    setStatus,
    collapseAllPanels,
    resetNonLayoutControls,
    revokeGifUrl,
    clearAllPreviews,
    renderRawPreview,
    loadCompanionSettingsText,
    applyLoadedSettingsText,
    invalidateAppearanceCache,
    processCurrentImage,
    drawImageToCanvas,
  });
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
 *   alignmentMarkerType:string,
 *   crossRoiScalePct:number,
 *   crossRoiScale:number,
 *   detectCrossesWithConvolution:boolean,
 *   useCrossAlignment:boolean,
 *   crop:{left:number,right:number,top:number,bottom:number},
 *   postCropGeometry:{flipHorizontal:boolean,flipVertical:boolean,rotate90Cw:boolean},
 *   filters:{brightness:number,contrast:number,vibrance:number,temperature:number,unsharpRadius:number,unsharpAmount:number,invert:boolean},
 *   fps:number,
 *   exportOptions:{quality:number,dither:string|false,resampling:string,globalPalette:boolean,outputScale:number,reverseOrder:boolean,pingPong:boolean}
 * }}
 */
function readConfig() {
  const paperPreset = dom.paperPreset.value || SETTINGS_DEFAULTS.layout.paperPreset;
  const presetSize = PAPER_PRESETS[paperPreset];
  const isCustomPaper = paperPreset === "custom";
  const paperWidth = isCustomPaper
    ? (Number(dom.paperWidth.value) || SETTINGS_DEFAULTS.layout.paperWidth)
    : (presetSize?.width || SETTINGS_DEFAULTS.layout.paperWidth);
  const paperHeight = isCustomPaper
    ? (Number(dom.paperHeight.value) || SETTINGS_DEFAULTS.layout.paperHeight)
    : (presetSize?.height || SETTINGS_DEFAULTS.layout.paperHeight);
  return {
    paperPreset,
    paperWidthIn: Math.max(1, paperWidth),
    paperHeightIn: Math.max(1, paperHeight),
    frameCols: Math.max(1, Math.min(20, Math.round(Number(dom.frameCols.value) || SETTINGS_DEFAULTS.layout.frameCols))),
    frameRows: Math.max(1, Math.min(20, Math.round(Number(dom.frameRows.value) || SETTINGS_DEFAULTS.layout.frameRows))),
    thresholdMethod: dom.thresholdMethod.value || SETTINGS_DEFAULTS.detection.thresholdMethod,
    thresholdOffset: Math.max(-128, Math.min(128, Math.round(Number(dom.thresholdOffset.value) || SETTINGS_DEFAULTS.detection.thresholdOffset))),
    paperMarginPx: Math.max(0, Math.min(150, Math.round(Number(dom.paperMargin.value) || SETTINGS_DEFAULTS.detection.paperMarginPx))),
    boundarySensitivity: Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || SETTINGS_DEFAULTS.detection.boundarySensitivity)),
    boundaryPersistencePx: Math.max(1, Math.min(15, Math.round(Number(dom.boundaryPersistence.value) || SETTINGS_DEFAULTS.detection.boundaryPersistencePx))),
    alignmentMarkerType: dom.alignmentMarkerTypeCircles.checked ? "circles" : "crosses",
    crossRoiScalePct: Math.max(18, Math.min(110, Number(dom.crossRoiScale.value) || SETTINGS_DEFAULTS.detection.crossRoiScalePct)),
    crossRoiScale: Math.max(0.18, Math.min(1.1, (Number(dom.crossRoiScale.value) || SETTINGS_DEFAULTS.detection.crossRoiScalePct) / 100)),
    detectCrossesWithConvolution: dom.alignmentMarkerTypeCrosses.checked && dom.detectCrossesWithConvolution.checked,
    useCrossAlignment: dom.useCrossAlignment.checked,
    useRectifiedAsSource: false,
    crop: {
      left: Math.max(0, Math.round(Number(dom.cropLeft.value) || 0)),
      right: Math.max(0, Math.round(Number(dom.cropRight.value) || 0)),
      top: Math.max(0, Math.round(Number(dom.cropTop.value) || 0)),
      bottom: Math.max(0, Math.round(Number(dom.cropBottom.value) || 0)),
    },
    postCropGeometry: {
      flipHorizontal: dom.flipHorizontal.checked,
      flipVertical: dom.flipVertical.checked,
      rotate90Cw: dom.rotate90Cw.checked,
    },
    filters: {
      brightness: Number(dom.brightness.value) || SETTINGS_DEFAULTS.appearance.brightness,
      contrast: Number(dom.contrast.value) || SETTINGS_DEFAULTS.appearance.contrast,
      vibrance: Number(dom.vibrance.value) || SETTINGS_DEFAULTS.appearance.vibrance,
      temperature: Number(dom.temperature.value) || SETTINGS_DEFAULTS.appearance.temperature,
      unsharpRadius: Math.max(0.1, Math.min(100, Number(dom.unsharpRadius.value) || SETTINGS_DEFAULTS.appearance.unsharpRadius)),
      unsharpAmount: Math.max(0, Math.min(500, Number(dom.unsharpAmount.value) || SETTINGS_DEFAULTS.appearance.unsharpAmount)),
      invert: dom.invert.checked,
    },
    fps: Math.max(1, Math.min(60, Math.round(Number(dom.fps.value) || SETTINGS_DEFAULTS.gifExport.fps))),
    exportOptions: {
      outputScale: Math.max(0.25, Math.min(1.0, Number(dom.outputScale.value) || SETTINGS_DEFAULTS.gifExport.outputScale)),
      quality: Math.max(1, Math.min(20, Math.round(Number(dom.gifQuality.value) || SETTINGS_DEFAULTS.gifExport.quality))),
      dither: (dom.gifDither.value && dom.gifDither.value !== "off") ? dom.gifDither.value : false,
      resampling: dom.gifResampling.value || "linear",
      globalPalette: dom.gifGlobalPalette.checked,
      reverseOrder: dom.reverseOrder.checked,
      pingPong: dom.pingPong.checked,
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
 * Show or hide controls that only apply to cross-shaped alignment markers.
 *
 * @returns {void}
 */
function syncAlignmentMarkerUi() {
  const markerType = dom.alignmentMarkerTypeCircles.checked ? "circles" : "crosses";
  const showCrossOnlyControls = markerType === "crosses";
  dom.detectCrossesWithConvolutionRow.hidden = !showCrossOnlyControls;
  if (!showCrossOnlyControls) {
    dom.detectCrossesWithConvolution.checked = false;
  }
}

/**
 * Best-effort loader for a sibling settings file that matches the selected image.
 *
 * For URL-based demo/server images, this fetches `<imagename>_settings.txt` from the same directory.
 * For dropped local files, it can consume an explicitly provided sibling settings file if one was
 * included in the same drag payload.
 *
 * @param {string} src
 * @param {string} filename
 * @param {File | null} [settingsFile=null]
 * @returns {Promise<string>}
 */
async function loadCompanionSettingsText(src, filename, settingsFile = null) {
  if (settingsFile) {
    return await settingsFile.text();
  }
  if (!filename || src.startsWith("blob:")) {
    return "";
  }
  try {
    const settingsUrl = new URL(makeSettingsFilename(filename), new URL(src, window.location.href)).toString();
    const response = await fetch(settingsUrl, { cache: "no-store" });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Apply a standalone settings file without replacing the currently loaded image.
 *
 * If an image is already loaded, this reprocesses it using the new settings. If not, it simply
 * updates the UI so the next loaded image starts from those values.
 *
 * @param {File} file
 * @returns {Promise<void>}
 */
async function applySettingsFile(file) {
  if (!file) return;
  setBusyState(true);
  try {
    const settingsText = await file.text();
    applyLoadedSettingsText(settingsText);
    revokeGifUrl();
    invalidateFrameCaches();
    invalidateAppearanceCache();
    if (state.source.image) {
      setStatus("Loaded settings file.\nRe-analyzing page…");
      await waitForNextPaint();
      state.processing.requestId += 1;
      await processCurrentImage(state.processing.requestId);
    } else {
      setStatus("Loaded settings file.\nLoad an image to use them.");
    }
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load the selected settings file.\n(${error?.message || String(error)})`);
  } finally {
    if (!state.processing.active && !state.processing.pending) {
      setBusyState(false);
    }
  }
}

/**
 * Apply a tab-separated settings manifest to the current UI controls.
 *
 * Unknown keys are ignored so older/newer settings files degrade gracefully.
 *
 * @param {string} settingsText
 * @returns {void}
 */
function applyLoadedSettingsText(settingsText) {
  if (!settingsText.trim()) return;
  const entries = new Map(
    settingsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("\t");
        return [key, rest.join("\t")];
      })
  );

  const setIfPresent = (key, element, transform = (value) => value) => {
    if (!entries.has(key) || !element) return;
    element.value = String(transform(entries.get(key)));
  };
  const setCheckedIfPresent = (key, element) => {
    if (!entries.has(key) || !element) return;
    element.checked = entries.get(key) === "true";
  };

  setIfPresent("paper_preset", dom.paperPreset);
  setIfPresent("paper_width", dom.paperWidth);
  setIfPresent("paper_height", dom.paperHeight);
  setIfPresent("frame_cols", dom.frameCols);
  setIfPresent("frame_rows", dom.frameRows);
  setIfPresent("threshold_method", dom.thresholdMethod);
  setIfPresent("threshold_offset", dom.thresholdOffset);
  setIfPresent("search_inset_margin_px", dom.paperMargin);
  setIfPresent("boundary_threshold", dom.boundarySensitivity);
  setIfPresent("boundary_persistence_px", dom.boundaryPersistence);
  const markerType = entries.get("alignment_marker_type");
  if (markerType === "circles") {
    dom.alignmentMarkerTypeCircles.checked = true;
  } else if (markerType === "crosses") {
    dom.alignmentMarkerTypeCrosses.checked = true;
  }
  setIfPresent("alignment_marker_region_scale_pct", dom.crossRoiScale);
  setCheckedIfPresent("detect_crosses_with_convolution", dom.detectCrossesWithConvolution);
  setCheckedIfPresent("use_cross_alignment", dom.useCrossAlignment);
  setIfPresent("crop_left", dom.cropLeft);
  setIfPresent("crop_right", dom.cropRight);
  setIfPresent("crop_top", dom.cropTop);
  setIfPresent("crop_bottom", dom.cropBottom);
  setCheckedIfPresent("flip_horizontal", dom.flipHorizontal);
  setCheckedIfPresent("flip_vertical", dom.flipVertical);
  setCheckedIfPresent("rotate_90_cw", dom.rotate90Cw);
  setIfPresent("brightness", dom.brightness);
  setIfPresent("contrast", dom.contrast);
  setIfPresent("vibrance", dom.vibrance);
  setIfPresent("color_temperature", dom.temperature);
  setIfPresent("unsharp_amount", dom.unsharpAmount);
  setIfPresent("unsharp_radius", dom.unsharpRadius);
  setCheckedIfPresent("invert", dom.invert);
  setIfPresent("fps", dom.fps);
  setCheckedIfPresent("reverse_order", dom.reverseOrder);
  setCheckedIfPresent("ping_pong", dom.pingPong);
  setIfPresent("output_scale", dom.outputScale);
  setIfPresent("encoding_quality", dom.gifQuality);
  setIfPresent("dither", dom.gifDither);
  setIfPresent("resampling", dom.gifResampling);
  setCheckedIfPresent("use_global_palette", dom.gifGlobalPalette);

  syncPaperPresetUi();
  syncAlignmentMarkerUi();
  updateSliderReadouts();
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
  dom.unsharpRadiusValue.textContent = (Math.max(0.1, Math.min(100, Number(dom.unsharpRadius.value) || SETTINGS_DEFAULTS.appearance.unsharpRadius))).toFixed(1);
  dom.unsharpAmountValue.textContent = (Math.max(0, Math.min(500, Number(dom.unsharpAmount.value) || SETTINGS_DEFAULTS.appearance.unsharpAmount))).toFixed(1);
  dom.thresholdOffsetValue.textContent = formatSignedValue(dom.thresholdOffset.value);
  dom.paperMarginValue.textContent = `${Math.max(0, Math.min(150, Number(dom.paperMargin.value) || SETTINGS_DEFAULTS.detection.paperMarginPx))} px`;
  dom.boundarySensitivityValue.textContent = `${Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || SETTINGS_DEFAULTS.detection.boundarySensitivity)).toFixed(1)}`;
  dom.boundaryPersistenceValue.textContent = String(Math.max(1, Math.min(15, Number(dom.boundaryPersistence.value) || SETTINGS_DEFAULTS.detection.boundaryPersistencePx)));
  const outputScale = Math.max(0.25, Math.min(1.0, Number(dom.outputScale.value) || SETTINGS_DEFAULTS.gifExport.outputScale));
  const scaledSize = getScaledOutputFrameSize(outputScale);
  dom.outputScaleValue.textContent = `${outputScale.toFixed(2)} (${scaledSize.width}\u00d7${scaledSize.height})`;
  dom.gifQualityValue.textContent = String(Math.max(1, Math.min(20, Number(dom.gifQuality.value) || SETTINGS_DEFAULTS.gifExport.quality)));
  dom.cropAspectRatioValue.textContent = getCurrentCropAspectRatioText();
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
    setBusyState(false);
    setStatus("OpenCV is still loading.");
    return;
  }
  if (!state.source.image) return;
  if (state.processing.active) {
    state.processing.pending = true;
    return;
  }

  state.processing.active = true;
  setBusyState(true);
  dom.exportButton.disabled = true;
  dom.exportZipButton.disabled = true;

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
    dom.exportZipButton.disabled = state.geometry.frameCount === 0;
    dom.saveSettingsButton.disabled = state.geometry.frameCount === 0;
    updatePreviewPlayPauseButton();
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
        primeRectifiedDragAsset(state.preview.rectifiedCanvas);
        renderRectifiedPreview(error.partialResult.rectifiedCanvas);
      }
      console.error(error);
      updateExportButtonLabel();
      setStatus("Unable to find page boundary. Try adjusting the Thresholding Offset and/or the Thresholding Method.\n(" + (error?.message || String(error)) + ")");
    }
  } finally {
    state.processing.active = false;
    if (state.processing.pending) {
      state.processing.pending = false;
      window.clearTimeout(state.processing.timer);
      state.processing.timer = window.setTimeout(() => {
        void processCurrentImage(state.processing.requestId);
      }, 0);
    } else {
      setBusyState(false);
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
  dom.rectifiedCanvas.parentElement?.classList.remove("is-empty");
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
  releaseRectifiedDragUrl();
  state.preview.rectifiedDragBuildId += 1;
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
 * Refresh the rectified-sheet preview from the unadjusted base page rectification.
 *
 * The Rectified Sheet panel is intended as a geometry/debug view, so Appearance controls should
 * not recolor it even when those same controls affect the live animation preview and exports.
 *
 * @returns {void}
 */
function refreshAppearanceOutputs() {
  if (!state.geometry.baseRectifiedPageCanvas) return;
  state.preview.rectifiedCanvas = state.geometry.baseRectifiedPageCanvas;
  primeRectifiedDragAsset(state.preview.rectifiedCanvas);
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
    const transformedFrame = transformOutputCanvas(frame, config.postCropGeometry);
    const scaledFrame = scaleOutputCanvas(transformedFrame, config.exportOptions.outputScale, config.exportOptions.resampling);
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
  const geometryWidth = config.postCropGeometry.rotate90Cw ? croppedHeight : croppedWidth;
  const geometryHeight = config.postCropGeometry.rotate90Cw ? croppedWidth : croppedHeight;
  return {
    width: Math.max(1, Math.round(geometryWidth * outputScale)),
    height: Math.max(1, Math.round(geometryHeight * outputScale)),
  };
}

/**
 * Format the current post-crop aspect ratio as a fixed-precision readout.
 *
 * @returns {string}
 */
function getCurrentCropAspectRatioText() {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo) return "--";
  const config = readConfig();
  const cellWidth = alignmentInfo.gridBounds.width / alignmentInfo.cols;
  const cellHeight = alignmentInfo.gridBounds.height / alignmentInfo.rows;
  let croppedWidth = Math.max(1, cellWidth - config.crop.left - config.crop.right);
  let croppedHeight = Math.max(1, cellHeight - config.crop.top - config.crop.bottom);
  if (config.postCropGeometry.rotate90Cw) {
    [croppedWidth, croppedHeight] = [croppedHeight, croppedWidth];
  }
  const widthPx = Math.max(1, Math.round(croppedWidth));
  const heightPx = Math.max(1, Math.round(croppedHeight));
  return `${(croppedWidth / croppedHeight).toFixed(3)} (${widthPx}\u00d7${heightPx})`;
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
 * Apply the post-crop flip/rotation options to one extracted frame.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{flipHorizontal:boolean, flipVertical:boolean, rotate90Cw:boolean}} geometry
 * @returns {HTMLCanvasElement}
 */
function transformOutputCanvas(sourceCanvas, geometry) {
  if (!sourceCanvas) return sourceCanvas;
  const flipHorizontal = !!geometry?.flipHorizontal;
  const flipVertical = !!geometry?.flipVertical;
  const rotate90Cw = !!geometry?.rotate90Cw;
  if (!flipHorizontal && !flipVertical && !rotate90Cw) return sourceCanvas;

  let current = sourceCanvas;
  if (flipHorizontal) current = flipCanvas(current, true, false);
  if (flipVertical) current = flipCanvas(current, false, true);
  if (rotate90Cw) current = rotateCanvas90Cw(current);
  return current;
}

/**
 * Flip a canvas horizontally and/or vertically.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {boolean} flipHorizontal
 * @param {boolean} flipVertical
 * @returns {HTMLCanvasElement}
 */
function flipCanvas(sourceCanvas, flipHorizontal, flipVertical) {
  const flipped = document.createElement("canvas");
  flipped.width = sourceCanvas.width;
  flipped.height = sourceCanvas.height;
  const ctx = flipped.getContext("2d");
  ctx.translate(flipHorizontal ? flipped.width : 0, flipVertical ? flipped.height : 0);
  ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  ctx.drawImage(sourceCanvas, 0, 0);
  return flipped;
}

/**
 * Rotate a canvas 90 degrees clockwise.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement}
 */
function rotateCanvas90Cw(sourceCanvas) {
  const rotated = document.createElement("canvas");
  rotated.width = sourceCanvas.height;
  rotated.height = sourceCanvas.width;
  const ctx = rotated.getContext("2d");
  ctx.translate(rotated.width, 0);
  ctx.rotate(Math.PI * 0.5);
  ctx.drawImage(sourceCanvas, 0, 0);
  return rotated;
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
  dom.rawCanvas.parentElement?.classList.remove("is-empty");
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
    grid.classList.add("is-empty");
    grid.textContent = "";
    return;
  }
  grid.classList.remove("is-empty");
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
        if (tile.kind === "unrefined") {
          tile.canvas.title = "";
        } else {
          const colContrast = Number.isFinite(tile.colContrast) ? tile.colContrast.toFixed(2) : "--";
          const rowContrast = Number.isFinite(tile.rowContrast) ? tile.rowContrast.toFixed(2) : "--";
          const darkFrac = Number.isFinite(tile.darkFrac) ? tile.darkFrac.toFixed(4) : "--";
          const convStrength = Number.isFinite(tile.convolutionStrength) ? ` | conv ${tile.convolutionStrength.toFixed(4)}` : "";
          tile.canvas.title = `(${col}, ${row}) ${tile.accepted ? "accepted" : "rejected"} | col ${colContrast} | row ${rowContrast} | ink ${darkFrac}${convStrength}`;
        }
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
 * Materialize all adjusted frames and hand them off to gif.js for encoding.
 *
 * @returns {Promise<void>}
 */
async function exportGif() {
  const orderedFrameCount = getOrderedFrameCount();
  if (!orderedFrameCount) return;
  dom.exportButton.disabled = true;
  dom.exportZipButton.disabled = true;
  dom.saveSettingsButton.disabled = true;
  updateExportButtonLabel(0);
  setStatus("Encoding GIF…");

  const config = readConfig();
  const firstFrame = getAdjustedFrameCanvas(getOrderedFrameIndex(0));
  if (!firstFrame) {
    dom.exportButton.disabled = false;
    dom.exportZipButton.disabled = false;
    dom.saveSettingsButton.disabled = false;
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
  for (let i = 0; i < orderedFrameCount; i++) {
    // Preview stays lazy, but export must realize the full adjusted frame set.
    gif.addFrame(getAdjustedFrameCanvas(getOrderedFrameIndex(i)), { copy: true, delay });
  }

  gif.on("finished", (blob) => {
    revokeGifUrl();
    state.export.filename = makeGifFilename(state.source.filename, config.exportOptions.quality);
    state.export.url = URL.createObjectURL(blob);
    dom.gifImage.src = state.export.url;
    dom.gifPreviewCanvas.hidden = true;
    dom.gifImage.classList.remove("hidden");
    dom.gifImage.hidden = false;
    dom.gifPreviewCanvas.parentElement?.classList.remove("is-empty");
    updateAnimationPreviewHeading();
    downloadBlobWithFilename(blob, state.export.filename);
    dom.exportButton.disabled = false;
    dom.exportZipButton.disabled = false;
    dom.saveSettingsButton.disabled = false;
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
 * Convert a canvas into a PNG byte array.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Uint8Array>}
 */
async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Could not encode PNG frame.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Build a timestamped archive stem shared by ZIP exports and their root folder.
 *
 * Example:
 * `mySrcImage_anim_20260324_154546`
 *
 * @param {string} sourceFilename
 * @returns {string}
 */
function makeArchiveStem(sourceFilename) {
  const base = sanitizeFilenameBase(sourceFilename || "frame_sheet");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${base}_anim_${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

/**
 * Build a ZIP filename for frame export.
 *
 * @param {string} sourceFilename
 * @returns {string}
 */
function makeZipFilename(sourceFilename) {
  return `${makeArchiveStem(sourceFilename)}.zip`;
}

/**
 * Build a standalone settings-manifest filename using the same timestamped stem as ZIP export.
 *
 * @param {string} sourceFilename
 * @returns {string}
 */
function makeSettingsFilename(sourceFilename) {
  return `${sanitizeFilenameBase(sourceFilename || "frame_sheet")}_settings.txt`;
}

/**
 * Serialize the current app settings into a simple tab-separated manifest.
 *
 * Each line uses:
 * `setting<TAB>value`
 *
 * @param {ReturnType<readConfig>} config
 * @returns {string}
 */
function buildSettingsTsv(config) {
  const rows = [
    ["source_filename", state.source.filename || ""],
    ["paper_preset", config.paperPreset],
    ["paper_width", String(config.paperWidthIn)],
    ["paper_height", String(config.paperHeightIn)],
    ["frame_cols", String(config.frameCols)],
    ["frame_rows", String(config.frameRows)],
    ["threshold_method", config.thresholdMethod],
    ["threshold_offset", String(config.thresholdOffset)],
    ["search_inset_margin_px", String(config.paperMarginPx)],
    ["boundary_threshold", String(config.boundarySensitivity)],
    ["boundary_persistence_px", String(config.boundaryPersistencePx)],
    ["alignment_marker_type", config.alignmentMarkerType],
    ["alignment_marker_region_scale_pct", String(config.crossRoiScalePct)],
    ["detect_crosses_with_convolution", String(config.detectCrossesWithConvolution)],
    ["use_cross_alignment", String(config.useCrossAlignment)],
    ["crop_left", String(config.crop.left)],
    ["crop_right", String(config.crop.right)],
    ["crop_top", String(config.crop.top)],
    ["crop_bottom", String(config.crop.bottom)],
    ["flip_horizontal", String(config.postCropGeometry.flipHorizontal)],
    ["flip_vertical", String(config.postCropGeometry.flipVertical)],
    ["rotate_90_cw", String(config.postCropGeometry.rotate90Cw)],
    ["brightness", String(config.filters.brightness)],
    ["contrast", String(config.filters.contrast)],
    ["vibrance", String(config.filters.vibrance)],
    ["color_temperature", String(config.filters.temperature)],
    ["unsharp_amount", String(config.filters.unsharpAmount)],
    ["unsharp_radius", String(config.filters.unsharpRadius)],
    ["invert", String(config.filters.invert)],
    ["fps", String(config.fps)],
    ["reverse_order", String(config.exportOptions.reverseOrder)],
    ["ping_pong", String(config.exportOptions.pingPong)],
    ["output_scale", String(config.exportOptions.outputScale)],
    ["encoding_quality", String(config.exportOptions.quality)],
    ["dither", String(config.exportOptions.dither || "off")],
    ["resampling", String(config.exportOptions.resampling)],
    ["use_global_palette", String(config.exportOptions.globalPalette)],
  ];
  return rows.map(([key, value]) => `${key}\t${value}`).join("\n") + "\n";
}

/**
 * Export the current ordered animation frames as a ZIP archive of PNG files.
 *
 * Archive layout:
 * - `frames/`
 * - `frames/<base>_anim_000.png`
 * - ...
 *
 * @returns {Promise<void>}
 */
async function exportZip() {
  const orderedFrameCount = getOrderedFrameCount();
  if (!orderedFrameCount) return;
  dom.exportButton.disabled = true;
  dom.exportZipButton.disabled = true;
  dom.saveSettingsButton.disabled = true;
  setStatus("Preparing ZIP…");

  try {
    const config = readConfig();
    const base = sanitizeFilenameBase(state.source.filename || "frame_sheet");
    const archiveStem = makeArchiveStem(state.source.filename);
    const rootDir = `${archiveStem}/`;
    const framesDir = `${rootDir}frames/`;
    const settingsBytes = new TextEncoder().encode(buildSettingsTsv(config));
    const entries = [
      { name: rootDir, data: new Uint8Array(0), isDirectory: true },
      { name: framesDir, data: new Uint8Array(0), isDirectory: true },
      { name: `${rootDir}${makeSettingsFilename(state.source.filename)}`, data: settingsBytes },
    ];
    for (let i = 0; i < orderedFrameCount; i++) {
      const frameCanvas = getAdjustedFrameCanvas(getOrderedFrameIndex(i));
      if (!frameCanvas) {
        throw new Error("Could not prepare one or more frames for ZIP export.");
      }
      const pngBytes = await canvasToPngBytes(frameCanvas);
      const frameNumber = String(i).padStart(3, "0");
      entries.push({
        name: `${framesDir}${base}_anim_${frameNumber}.png`,
        data: pngBytes,
      });
    }

    const zipBlob = createStoredZip(entries);
    downloadBlobWithFilename(zipBlob, makeZipFilename(state.source.filename));
    setStatus(`ZIP ready.\nFrame count: ${orderedFrameCount}`);
  } catch (error) {
    console.error(error);
    setStatus(`ZIP export failed.\n(${error?.message || String(error)})`);
  } finally {
    dom.exportButton.disabled = state.geometry.frameCount === 0;
    dom.exportZipButton.disabled = state.geometry.frameCount === 0;
    dom.saveSettingsButton.disabled = state.geometry.frameCount === 0;
    updateExportButtonLabel();
  }
}

/**
 * Download the same settings manifest used inside ZIP export as a standalone text file.
 *
 * @returns {void}
 */
function saveSettingsFile() {
  if (!state.geometry.frameCount) return;
  const config = readConfig();
  const settingsText = buildSettingsTsv(config);
  const blob = new Blob([settingsText], { type: "text/plain;charset=utf-8" });
  downloadBlobWithFilename(blob, makeSettingsFilename(state.source.filename));
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
  dom.gifPreviewCanvas.parentElement?.classList.add("is-empty");
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
