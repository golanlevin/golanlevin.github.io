/**
 * Main application orchestrator.
 *
 * This module ties together UI state, preview rendering, the OpenCV pipeline, settings I/O,
 * export flows, and cache invalidation. Most other modules are narrower helpers that are called
 * from here.
 */
import { PAPER_PRESETS, dom, state } from "./dom-state.js";
import { SETTINGS_DEFAULTS, applyAppearanceDefaults, applyCropGeometryDefaults, applyNonLayoutDefaults } from "./settings-defaults.js";
import {
  loadCompanionSettingsText as loadCompanionSettingsTextViaIo,
  applyLoadedSettingsText as applyLoadedSettingsTextViaIo,
  makeSettingsFilename as makeSettingsFilenameViaIo,
  buildSettingsTsv as buildSettingsTsvViaIo,
} from "./settings-io.js";
import { renderCrossRoiGrid as renderCrossRoiGridViaEditor } from "./marker-editor.js";
import { applyVisualAdjustments, hasAppearanceAdjustments } from "./appearance.js";
import { drawImageToCanvas, renderCanvasFit, resizeCanvasToBox } from "./canvas-view.js";
import {
  updateExportButtonLabel as updateExportButtonLabelViaController,
  revokeGifUrl as revokeGifUrlViaController,
  sanitizeFilenameBase,
  exportGif as exportGifViaController,
  exportMp4 as exportMp4ViaController,
  exportZip as exportZipViaController,
  saveSettingsFile as saveSettingsFileViaController,
} from "./export-controller.js";
import {
  updateRectifiedSheetHeading as syncRectifiedSheetHeading,
  updatePageGridDetectionHeading as syncPageGridDetectionHeading,
  setStatus as syncStatusText,
} from "./status-controller.js";
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
import {
  runPipeline,
  estimateCrossRoiSidePx,
  buildCrossConvolutionCanvas,
  getCvInterpolationFlag,
  extractSingleFrameToCanvas,
} from "./pipeline.js";
// Final output-size scaling can be done either with browser canvas drawImage() or with OpenCV.
// Keep both code paths available for comparison while evaluating tiny-output quality.
const bUseOpenCvOutputScaling = true;

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
  "#paperPreset": "Choose a paper preset, or Custom to enter your own dimensions.",
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
  "#loopCount": "Repeat the full ordered frame sequence this many times in the preview and exported files.",
  "#outputWidth": "Sets the final output width in pixels after cropping and rotation; the height stays proportional.",
  "#outputHeight": "Sets the final output height in pixels after cropping and rotation; the width stays proportional.",
  "#gifQuality": "Shared encoding quality slider from 1 to 100. Higher values raise MP4 bitrate and map to better GIF encoder quality.",
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
  "#toggleMarkerEditingButton": "Enable or disable manual editing of alignment markers in the diagnostic grid.",
  "#clearMarkerEditsButton": "Remove all saved manual marker overrides for the current image.",
  "#animationPreviewHeading": "Live animation preview using the current settings.",
  "#previewPlayPauseButton": "Pause or resume the live animation preview.",
  "#exportZipButton": "Download a ZIP archive containing the current animation frames as PNG files.",
  "#exportMp4Button": "Render and download an H.264 MP4 movie when this browser supports in-browser MP4 export.",
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
  updateExportButtonLabelViaController(dom, progressPercent);
}

/**
 * Read the shared 1..100 encoding-quality slider.
 *
 * @returns {number}
 */
function getEncodingQualityValue() {
  const parsed = Number(dom.gifQuality.value);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? parsed : SETTINGS_DEFAULTS.gifExport.quality));
}

/**
 * Map the shared 1..100 quality slider onto gif.js's inverse 20..1 quality scale.
 *
 * @param {number} encodingQuality
 * @returns {number}
 */
function mapEncodingQualityToGifEncoderQuality(encodingQuality) {
  const clamped = Math.max(1, Math.min(100, encodingQuality));
  const normalized = (clamped - 1) / 99;
  return Math.max(1, Math.min(20, Math.round(20 - (normalized * 19))));
}

/**
 * Probe whether this browser can encode H.264 frames with WebCodecs for later MP4 muxing.
 *
 * @returns {Promise<{supported:boolean, codec:string}>}
 */
async function detectMp4ExportSupport() {
  if (typeof globalThis.VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") {
    return { supported: false, codec: "" };
  }
  const candidates = ["avc1.42001f", "avc1.42E01E", "avc1.4D401E"];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: 16,
        height: 16,
        bitrate: 500_000,
        framerate: 20,
        avc: { format: "avc" },
      });
      if (support?.supported) {
        return { supported: true, codec };
      }
    } catch {
      // Try the next H.264 profile string.
    }
  }
  return { supported: false, codec: "" };
}

/**
 * Build the stable string key used for marker override storage.
 *
 * @param {number} col
 * @param {number} row
 * @returns {string}
 */
function getMarkerKey(col, row) {
  return `${col},${row}`;
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
    const manifestText = await response.text();
    const filenames = parseDemoManifest(manifestText);
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
 * Parse the demo manifest text into an array of filenames.
 *
 * This accepts strict JSON, JSON with trailing commas, or a simple newline list.
 *
 * @param {string} manifestText
 * @returns {string[]}
 */
function parseDemoManifest(manifestText) {
  const trimmed = String(manifestText || "").trim();
  if (!trimmed) return [];
  try {
    // Accept slightly sloppy JSON manifests too, since these files are hand-edited and small.
    const parsed = JSON.parse(trimmed.replace(/,\s*([\]}])/g, "$1"));
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string");
    }
  } catch {
    // Fall through to the simple line-based parser below.
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^["']|["'],?$/g, "").replace(/,$/, ""))
    .filter(Boolean);
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

function updateRectifiedSheetHeading() {
  syncRectifiedSheetHeading(dom, state);
}

function updatePageGridDetectionHeading(showWarning = false) {
  syncPageGridDetectionHeading(dom, showWarning);
}

/**
 * Keep the export buttons synchronized with frame availability and MP4 support.
 *
 * @param {boolean} [forceDisabled=false]
 * @returns {void}
 */
function updateExportControlsAvailability(forceDisabled = false) {
  const hasFrames = state.geometry.frameCount > 0;
  dom.exportButton.disabled = forceDisabled || !hasFrames;
  dom.exportZipButton.disabled = forceDisabled || !hasFrames;
  dom.saveSettingsButton.disabled = forceDisabled || !hasFrames;
  dom.exportMp4Button.disabled = forceDisabled || !hasFrames || !state.runtime.mp4ExportSupported;
}

/**
 * Keep the marker-editing header controls synchronized with current state.
 *
 * @returns {void}
 */
function syncMarkerEditingUi() {
  const hasAlignmentInfo = !!state.geometry.alignmentInfo;
  const hasEdits = state.geometry.manualMarkerOverrides.size > 0;
  dom.toggleMarkerEditingButton.disabled = !hasAlignmentInfo;
  dom.toggleMarkerEditingButton.textContent = state.runtime.markerEditingEnabled ? "Disable Overrides" : "Enable Overrides";
  dom.clearMarkerEditsButton.hidden = !hasEdits;
  dom.clearMarkerEditsButton.disabled = !hasEdits;
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
 * Return the number of frames that should be emitted into exported files after loop repetition
 * is applied. The live preview intentionally ignores `Number of Loops`.
 *
 * @returns {number}
 */
function getExportOrderedFrameCount() {
  const singleLoopCount = getOrderedFrameCount();
  if (singleLoopCount <= 0) return 0;
  return singleLoopCount * Math.max(1, readConfig().exportOptions.loopCount || 1);
}

/**
 * Map an export-sequence index to the underlying source-frame index, repeating the preview-order
 * sequence for the requested number of loops.
 *
 * @param {number} exportIndex
 * @returns {number}
 */
function getExportOrderedFrameIndex(exportIndex) {
  const singleLoopCount = getOrderedFrameCount();
  if (singleLoopCount <= 0) return 0;
  const localIndex = ((exportIndex % singleLoopCount) + singleLoopCount) % singleLoopCount;
  return getOrderedFrameIndex(localIndex);
}

/**
 * Draw the current preview frame via the dedicated preview controller.
 *
 * @returns {void}
 */
function drawCurrentGifPreview() {
  drawPreviewFrame({ dom, state, getAdjustedFrameCanvas, readConfig });
  if (state.preview.rectifiedCanvas) {
    renderRectifiedPreview(state.preview.rectifiedCanvas);
  }
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
  if (state.geometry.alignmentInfo) {
    renderCrossRoiGrid(state.geometry.alignmentInfo);
  }
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
 * Toggle a body-level cursor cue while geometry-affecting CV work is queued or running.
 *
 * @param {boolean} active
 * @returns {void}
 */
function setGeometryProcessingCursor(active) {
  document.body.classList.toggle("geometry-processing", !!active);
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
  state.preview.rectifiedDiagnosticSourceCanvas = null;
  state.preview.rectifiedDiagnosticDirty = true;
  releaseRectifiedDragUrl();
  state.preview.rectifiedDragBuildId += 1;
  state.geometry.baseRectifiedCanvas = null;
  state.geometry.baseRectifiedPageCanvas = null;
  state.geometry.pagePreviewGridQuad = null;
  state.geometry.alignmentInfo = null;
  state.geometry.frameCount = 0;
  state.geometry.manualMarkerOverrides.clear();
  state.runtime.markerEditingEnabled = false;
  state.frames.base = [];
  state.frames.adjustedCache.clear();
  state.preview.frameIndex = 0;
  state.preview.showRectifiedDiagnostic = false;
  updateRectifiedSheetHeading();

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
  updateExportControlsAvailability(true);
  syncMarkerEditingUi();
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
  syncMp4ExportUi();
  syncMarkerEditingUi();
  updatePageGridDetectionHeading(false);
  updateRectifiedSheetHeading();
  dom.gifPreviewCanvas.title = TOOLTIP_TEXT["#gifPreviewCanvas"] || "";
  dom.gifImage.classList.add("hidden");
  dom.gifImage.hidden = true;
  dom.gifImage.removeAttribute("src");
  updateAnimationPreviewHeading();
  updateExportButtonLabel();
  updatePreviewPlayPauseButton();
  updateExportControlsAvailability();

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
  void initializeMp4Support();
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
    resetExportControls,
    toggleTooltips: () => setTooltipsEnabled(!state.runtime.tooltipsEnabled),
    togglePreviewPaused: () => {
      if (dom.previewPlayPauseButton.disabled) return;
      if (state.export.url) {
        revokeGifUrl();
        state.preview.paused = true;
        state.preview.lastTime = performance.now();
        updatePreviewPlayPauseButton();
        drawCurrentGifPreview();
        return;
      }
      state.preview.paused = !state.preview.paused;
      state.preview.lastTime = performance.now();
      updatePreviewPlayPauseButton();
      drawCurrentGifPreview();
    },
    stepPausedPreviewFrame: (direction) => {
      const frameCount = state.geometry.frameCount;
      if (!state.preview.paused || frameCount <= 0) return;
      state.preview.frameIndex = (state.preview.frameIndex + direction + frameCount) % frameCount;
      drawCurrentGifPreview();
    },
    toggleMarkerEditing,
    clearMarkerEdits,
    syncOutputSizeFromWidthInput,
    syncOutputSizeFromHeightInput,
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
    exportMp4,
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
 * Detect WebCodecs-based MP4 export support after startup and refresh the relevant UI.
 *
 * This is asynchronous because `VideoEncoder.isConfigSupported(...)` is async. The rest of the app
 * can finish booting immediately and then reveal/enable MP4 controls once support is known.
 *
 * @returns {Promise<void>}
 */
async function initializeMp4Support() {
  try {
    const support = await detectMp4ExportSupport();
    state.runtime.mp4ExportSupported = support.supported;
    if (support.codec) {
      state.runtime.mp4Codec = support.codec;
    }
  } catch {
    state.runtime.mp4ExportSupported = false;
  }
  syncMp4ExportUi();
  updateExportControlsAvailability();
  setTooltipsEnabled(state.runtime.tooltipsEnabled);
}

/**
 * Apply persisted manual marker overrides to the freshly detected alignment result.
 *
 * Overrides are stored in rectified-sheet coordinates and replace the marker center used by
 * extraction, while the original auto-detection remains available in the tile metadata.
 *
 * @param {object | null} alignmentInfo
 * @returns {void}
 */
function applyManualMarkerOverrides(alignmentInfo) {
  if (!alignmentInfo) return;
  for (const [key, override] of state.geometry.manualMarkerOverrides.entries()) {
    const marker = alignmentInfo.markerLookup.get(key);
    const tile = alignmentInfo.crossRoiTileMap?.get(key);
    if (marker) {
      marker.detectedX = override.x;
      marker.detectedY = override.y;
      marker.accepted = true;
      marker.manualOverride = true;
    }
    if (tile) {
      tile.detectedX = override.x;
      tile.detectedY = override.y;
      tile.accepted = true;
      tile.manualOverride = true;
    }
  }
}

/**
 * Preserve the original auto-detected marker positions so manual edits can be reverted cleanly.
 *
 * @param {object | null} alignmentInfo
 * @returns {void}
 */
function stashOriginalMarkerDetections(alignmentInfo) {
  if (!alignmentInfo) return;
  for (const marker of alignmentInfo.markerLookup.values()) {
    if (!Number.isFinite(marker.autoDetectedX)) {
      marker.autoDetectedX = marker.detectedX;
      marker.autoDetectedY = marker.detectedY;
    }
  }
  for (const tile of alignmentInfo.crossRoiTiles || []) {
    if (!Number.isFinite(tile.autoDetectedX)) {
      tile.autoDetectedX = tile.detectedX;
      tile.autoDetectedY = tile.detectedY;
    }
  }
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
 * Restore Export Options controls to their defaults and return output size to native 100%.
 *
 * @returns {void}
 */
function resetExportControls() {
  const previousOutputSize = getRequestedOutputSize();
  const alreadyReset =
    (Number(dom.fps.value) || SETTINGS_DEFAULTS.gifExport.fps) === SETTINGS_DEFAULTS.gifExport.fps &&
    (Number(dom.loopCount.value) || SETTINGS_DEFAULTS.gifExport.loopCount) === SETTINGS_DEFAULTS.gifExport.loopCount &&
    !dom.reverseOrder.checked &&
    !dom.pingPong.checked &&
    getEncodingQualityValue() === SETTINGS_DEFAULTS.gifExport.quality &&
    (dom.gifDither.value || SETTINGS_DEFAULTS.gifExport.dither) === SETTINGS_DEFAULTS.gifExport.dither &&
    !dom.gifGlobalPalette.checked &&
    state.runtime.outputSizeAuto;
  if (alreadyReset) {
    return;
  }
  dom.fps.value = String(SETTINGS_DEFAULTS.gifExport.fps);
  dom.loopCount.value = String(SETTINGS_DEFAULTS.gifExport.loopCount);
  dom.reverseOrder.checked = SETTINGS_DEFAULTS.gifExport.reverseOrder;
  dom.pingPong.checked = SETTINGS_DEFAULTS.gifExport.pingPong;
  dom.outputWidth.value = "";
  dom.outputHeight.value = "";
  dom.gifQuality.value = String(SETTINGS_DEFAULTS.gifExport.quality);
  dom.gifDither.value = SETTINGS_DEFAULTS.gifExport.dither;
  dom.gifGlobalPalette.checked = SETTINGS_DEFAULTS.gifExport.globalPalette;
  state.runtime.outputWidthPx = 0;
  state.runtime.outputHeightPx = 0;
  state.runtime.outputSizeAuto = true;
  state.runtime.outputSizeAnchor = "auto";
  state.runtime.pendingOutputScale = null;
  revokeGifUrl();
  updateSliderReadouts();
  const nextOutputSize = getRequestedOutputSize();
  if (
    previousOutputSize.width !== nextOutputSize.width ||
    previousOutputSize.height !== nextOutputSize.height
  ) {
    invalidateFrameCaches();
  }
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
  state.geometry.manualMarkerOverrides.clear();
  state.runtime.markerEditingEnabled = false;
  state.runtime.outputWidthPx = 0;
  state.runtime.outputHeightPx = 0;
  state.runtime.outputSizeAuto = true;
  state.runtime.outputSizeAnchor = "auto";
  state.runtime.pendingOutputScale = null;

  state.preview.paused = false;
  updatePreviewPlayPauseButton();
  syncAlignmentMarkerUi();
  syncMarkerEditingUi();
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
  window.clearTimeout(state.processing.timer);
  setGeometryProcessingCursor(false);
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
    { value: "area", label: "Strong Reduction (Area)" },
    { value: "linear", label: "Balanced (Linear)" },
    { value: "cubic", label: "Sharper (Cubic)" },
  ];
  if (typeof cv !== "undefined" && typeof cv.INTER_LANCZOS4 !== "undefined") {
    options.push({ value: "lanczos", label: "Maximum Detail (Lanczos)" });
  }
  if (typeof cv !== "undefined" && typeof cv.INTER_NEAREST !== "undefined") {
    options.push({ value: "nearest", label: "Pixelated (Nearest Neighbor)" });
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
  setGeometryProcessingCursor(true);
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
 *   paperAspect:number,
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
 *   exportOptions:{encodingQuality:number,quality:number,mp4Quality:number,dither:string|false,resampling:string,globalPalette:boolean,outputWidthPx:number,outputHeightPx:number,outputScale:number,reverseOrder:boolean,pingPong:boolean,loopCount:number}
 * }}
 */
function readConfig() {
  const paperPreset = dom.paperPreset.value || SETTINGS_DEFAULTS.layout.paperPreset;
  const presetSize = PAPER_PRESETS[paperPreset];
  const isCustomPaper = paperPreset === "custom";
  const paperOrientation = dom.paperOrientationPortrait.checked ? "portrait" : "landscape";
  const orientedPresetWidth = (paperOrientation === "portrait")
    ? (presetSize?.height || SETTINGS_DEFAULTS.layout.paperHeight)
    : (presetSize?.width || SETTINGS_DEFAULTS.layout.paperWidth);
  const orientedPresetHeight = (paperOrientation === "portrait")
    ? (presetSize?.width || SETTINGS_DEFAULTS.layout.paperWidth)
    : (presetSize?.height || SETTINGS_DEFAULTS.layout.paperHeight);
  const paperWidth = isCustomPaper
    ? (Number(dom.paperWidth.value) || SETTINGS_DEFAULTS.layout.paperWidth)
    : orientedPresetWidth;
  const paperHeight = isCustomPaper
    ? (Number(dom.paperHeight.value) || SETTINGS_DEFAULTS.layout.paperHeight)
    : orientedPresetHeight;
  const paperAspect = clampPaperAspect(paperWidth, paperHeight);
  const encodingQuality = getEncodingQualityValue();
  return {
    paperOrientation,
    paperPreset,
    paperWidthIn: Math.max(1, paperWidth),
    paperHeightIn: Math.max(1, paperHeight),
    paperAspect,
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
      loopCount: Math.max(1, Math.min(10, Math.round(Number(dom.loopCount.value) || SETTINGS_DEFAULTS.gifExport.loopCount))),
      outputWidthPx: getRequestedOutputSize().width,
      outputHeightPx: getRequestedOutputSize().height,
      outputScale: getRequestedOutputSize().scale,
      encodingQuality,
      quality: mapEncodingQualityToGifEncoderQuality(encodingQuality),
      mp4Quality: encodingQuality,
      dither: (dom.gifDither.value && dom.gifDither.value !== "off") ? dom.gifDither.value : false,
      resampling: dom.gifResampling.value || "linear",
      globalPalette: dom.gifGlobalPalette.checked,
      reverseOrder: dom.reverseOrder.checked,
      pingPong: dom.pingPong.checked,
    },
  };
}

/**
 * Clamp the paper aspect ratio to a sane range so custom sheets cannot request pathological
 * page geometries. Paper dimensions are treated as aspect-ratio hints, not real-world units.
 *
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
function clampPaperAspect(width, height) {
  const safeWidth = Math.max(1e-6, Number(width) || SETTINGS_DEFAULTS.layout.paperWidth);
  const safeHeight = Math.max(1e-6, Number(height) || SETTINGS_DEFAULTS.layout.paperHeight);
  return Math.max(0.25, Math.min(4.0, safeWidth / safeHeight));
}

/**
 * Return the current paper-orientation selection. Presets use this to swap their displayed
 * and effective width/height ordering without changing the underlying preset catalog.
 *
 * @returns {"landscape"|"portrait"}
 */
function getPaperOrientation() {
  return dom.paperOrientationPortrait.checked ? "portrait" : "landscape";
}

/**
 * Format one preset option label using the active paper orientation. Custom stays unchanged.
 *
 * @param {string} presetKey
 * @returns {string}
 */
function formatPaperPresetLabel(presetKey) {
  if (presetKey === "custom") return "Custom";
  const preset = PAPER_PRESETS[presetKey];
  if (!preset) return presetKey;
  const orientation = getPaperOrientation();
  const width = orientation === "portrait" ? preset.height : preset.width;
  const height = orientation === "portrait" ? preset.width : preset.height;
  const units = preset.width > 100 ? "mm" : "in";
  const baseLabelMap = {
    letter: "Letter",
    legal: "Legal",
    tabloid: "Tabloid",
    "12x9": "12×9",
    "18x12": "18×12",
    "24x18": "24×18",
    "36x24": "36×24",
    a4: "A4",
    a3: "A3",
    a2: "A2",
    a1: "A1",
  };
  return `${baseLabelMap[presetKey] || presetKey} (${width}×${height} ${units})`;
}

/**
 * Show or hide the custom paper size fields based on the current preset selection, refresh
 * the preset labels for the current orientation, and disable orientation when Custom is active.
 *
 * @returns {void}
 */
function syncPaperPresetUi() {
  const presetKey = dom.paperPreset.value || "letter";
  const isCustom = presetKey === "custom";
  const preset = PAPER_PRESETS[presetKey];
  const orientation = getPaperOrientation();
  dom.paperPresetLabel.textContent = "Paper Size";
  Array.from(dom.paperPreset.options).forEach((option) => {
    option.textContent = formatPaperPresetLabel(option.value);
  });
  dom.customPaperFields.hidden = !isCustom;
  dom.paperWidth.disabled = !isCustom;
  dom.paperHeight.disabled = !isCustom;
  dom.paperOrientationLandscape.disabled = isCustom;
  dom.paperOrientationPortrait.disabled = isCustom;
  if (!isCustom && preset) {
    const width = orientation === "portrait" ? preset.height : preset.width;
    const height = orientation === "portrait" ? preset.width : preset.height;
    dom.paperWidth.value = String(width);
    dom.paperHeight.value = String(height);
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
 * Show or hide MP4-specific export controls based on browser support.
 *
 * @returns {void}
 */
function syncMp4ExportUi() {
  const supported = !!state.runtime.mp4ExportSupported;
  dom.exportMp4Button.hidden = false;
  if (!supported) {
    dom.exportMp4Button.disabled = true;
    dom.exportMp4Button.title = "Not supported by this browser";
  } else {
    dom.exportMp4Button.removeAttribute("title");
  }
}

/**
 * Toggle manual marker-editing mode on or off.
 *
 * @returns {void}
 */
function toggleMarkerEditing() {
  if (!state.geometry.alignmentInfo) return;
  state.runtime.markerEditingEnabled = !state.runtime.markerEditingEnabled;
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
}

/**
 * Remove all saved manual marker overrides and re-render from the current auto-detected markers.
 *
 * @returns {void}
 */
function clearMarkerEdits() {
  if (!state.geometry.manualMarkerOverrides.size) return;
  state.geometry.manualMarkerOverrides.clear();
  state.runtime.markerEditingEnabled = false;
  if (state.geometry.alignmentInfo) {
    // Original auto-detected positions are cached on the live alignment objects so edits can revert instantly
    // without rerunning the whole detector.
    for (const [key, marker] of state.geometry.alignmentInfo.markerLookup.entries()) {
      if (Number.isFinite(marker.autoDetectedX)) {
        marker.detectedX = marker.autoDetectedX;
        marker.detectedY = marker.autoDetectedY;
        marker.manualOverride = false;
      }
      const tile = state.geometry.alignmentInfo.crossRoiTileMap?.get(key);
      if (tile && Number.isFinite(tile.autoDetectedX)) {
        tile.detectedX = tile.autoDetectedX;
        tile.detectedY = tile.autoDetectedY;
        tile.manualOverride = false;
      }
    }
  }
  revokeGifUrl();
  invalidateFrameCaches();
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
  drawCurrentGifPreview();
}

function loadCompanionSettingsText(src, filename, settingsFile = null) {
  return loadCompanionSettingsTextViaIo({
    src,
    filename,
    settingsFile,
    makeSettingsFilename,
  });
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

function applyLoadedSettingsText(settingsText) {
  applyLoadedSettingsTextViaIo({
    settingsText,
    dom,
    state,
    settingsDefaults: SETTINGS_DEFAULTS,
    getMarkerKey,
    syncOutputSizeFromWidthInput,
    syncOutputSizeFromHeightInput,
    syncPaperPresetUi,
    syncAlignmentMarkerUi,
    syncMarkerEditingUi,
    updateSliderReadouts,
  });
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
  const outputSize = getRequestedOutputSize();
  dom.outputWidth.value = outputSize.width > 0 ? String(outputSize.width) : "";
  dom.outputHeight.value = outputSize.height > 0 ? String(outputSize.height) : "";
  dom.gifQualityValue.textContent = String(getEncodingQualityValue());
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
  dom.crossRoiScaleValue.textContent = `${roiSizePx}×${roiSizePx} px`;
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
 * Clamp an output-scale value to the supported typed/slider range.
 *
 * @param {number} value
 * @returns {number}
 */
function clampLegacyOutputScale(value) {
  return Math.max(0.25, Math.min(1.25, Number(value) || 1));
}

/**
 * Clamp a requested output dimension to the supported 1..1999 range.
 *
 * @param {number} value
 * @returns {number}
 */
function clampOutputDimension(value) {
  return Math.max(1, Math.min(1999, Math.round(Number(value) || 0)));
}

/**
 * Compute the current frame size after crop and post-crop rotation but before output scaling.
 *
 * @returns {{width:number,height:number}|null}
 */
function getCurrentOutputGeometrySize() {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo) return null;
  const cellWidth = alignmentInfo.gridBounds.width / alignmentInfo.cols;
  const cellHeight = alignmentInfo.gridBounds.height / alignmentInfo.rows;
  const cropLeft = Math.max(0, Math.round(Number(dom.cropLeft.value) || 0));
  const cropRight = Math.max(0, Math.round(Number(dom.cropRight.value) || 0));
  const cropTop = Math.max(0, Math.round(Number(dom.cropTop.value) || 0));
  const cropBottom = Math.max(0, Math.round(Number(dom.cropBottom.value) || 0));
  const rotate90Cw = dom.rotate90Cw.checked;
  const croppedWidth = Math.max(1, Math.round(cellWidth - cropLeft - cropRight));
  const croppedHeight = Math.max(1, Math.round(cellHeight - cropTop - cropBottom));
  return rotate90Cw
    ? { width: croppedHeight, height: croppedWidth }
    : { width: croppedWidth, height: croppedHeight };
}

/**
 * Convert a requested width into a proportional final output size, clamped to 1999×1999.
 *
 * @param {{width:number,height:number}} geometrySize
 * @param {number} requestedWidth
 * @returns {{width:number,height:number,scale:number}}
 */
function resolveOutputSizeFromWidth(geometrySize, requestedWidth) {
  const unclampedWidth = clampOutputDimension(requestedWidth);
  const requestedScale = unclampedWidth / geometrySize.width;
  const maxScale = Math.min(1999 / geometrySize.width, 1999 / geometrySize.height);
  const scale = Math.min(requestedScale, maxScale);
  return {
    width: Math.max(1, Math.min(1999, Math.round(geometrySize.width * scale))),
    height: Math.max(1, Math.min(1999, Math.round(geometrySize.height * scale))),
    scale,
  };
}

/**
 * Convert a requested height into a proportional final output size, clamped to 1999×1999.
 *
 * @param {{width:number,height:number}} geometrySize
 * @param {number} requestedHeight
 * @returns {{width:number,height:number,scale:number}}
 */
function resolveOutputSizeFromHeight(geometrySize, requestedHeight) {
  const unclampedHeight = clampOutputDimension(requestedHeight);
  const requestedScale = unclampedHeight / geometrySize.height;
  const maxScale = Math.min(1999 / geometrySize.width, 1999 / geometrySize.height);
  const scale = Math.min(requestedScale, maxScale);
  return {
    width: Math.max(1, Math.min(1999, Math.round(geometrySize.width * scale))),
    height: Math.max(1, Math.min(1999, Math.round(geometrySize.height * scale))),
    scale,
  };
}

/**
 * Capture the current Output Width field as the controlling dimension.
 *
 * @returns {void}
 */
function syncOutputSizeFromWidthInput() {
  const geometrySize = getCurrentOutputGeometrySize();
  const parsed = clampOutputDimension(dom.outputWidth.value);
  if (!geometrySize) {
    state.runtime.outputSizeAuto = false;
    state.runtime.outputSizeAnchor = "width";
    state.runtime.outputWidthPx = parsed;
    state.runtime.outputHeightPx = 0;
    state.runtime.pendingOutputScale = null;
    return;
  }
  const resolved = resolveOutputSizeFromWidth(geometrySize, parsed);
  state.runtime.outputSizeAuto = false;
  state.runtime.outputSizeAnchor = "width";
  state.runtime.outputWidthPx = resolved.width;
  state.runtime.outputHeightPx = resolved.height;
  state.runtime.pendingOutputScale = null;
}

/**
 * Capture the current Output Height field as the controlling dimension.
 *
 * @returns {void}
 */
function syncOutputSizeFromHeightInput() {
  const geometrySize = getCurrentOutputGeometrySize();
  const parsed = clampOutputDimension(dom.outputHeight.value);
  if (!geometrySize) {
    state.runtime.outputSizeAuto = false;
    state.runtime.outputSizeAnchor = "height";
    state.runtime.outputWidthPx = 0;
    state.runtime.outputHeightPx = parsed;
    state.runtime.pendingOutputScale = null;
    return;
  }
  const resolved = resolveOutputSizeFromHeight(geometrySize, parsed);
  state.runtime.outputSizeAuto = false;
  state.runtime.outputSizeAnchor = "height";
  state.runtime.outputWidthPx = resolved.width;
  state.runtime.outputHeightPx = resolved.height;
  state.runtime.pendingOutputScale = null;
}

/**
 * Resolve the current final output size from the auto/manual state and current geometry.
 *
 * @returns {{width:number,height:number,scale:number}}
 */
function getRequestedOutputSize() {
  const geometrySize = getCurrentOutputGeometrySize();
  if (!geometrySize) {
    return { width: 0, height: 0, scale: 1 };
  }
  if (Number.isFinite(state.runtime.pendingOutputScale) && state.runtime.pendingOutputScale > 0) {
    return resolveOutputSizeFromWidth(
      geometrySize,
      Math.round(geometrySize.width * state.runtime.pendingOutputScale)
    );
  }
  if (state.runtime.outputSizeAuto) {
    return resolveOutputSizeFromWidth(geometrySize, geometrySize.width);
  }
  if (state.runtime.outputSizeAnchor === "height" && state.runtime.outputHeightPx > 0) {
    return resolveOutputSizeFromHeight(geometrySize, state.runtime.outputHeightPx);
  }
  if (state.runtime.outputWidthPx > 0) {
    return resolveOutputSizeFromWidth(geometrySize, state.runtime.outputWidthPx);
  }
  if (state.runtime.outputHeightPx > 0) {
    return resolveOutputSizeFromHeight(geometrySize, state.runtime.outputHeightPx);
  }
  return resolveOutputSizeFromWidth(geometrySize, geometrySize.width);
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
    setGeometryProcessingCursor(false);
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
  updateExportControlsAvailability(true);

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
    stashOriginalMarkerDetections(state.geometry.alignmentInfo);
    applyManualMarkerOverrides(state.geometry.alignmentInfo);
    if (state.geometry.manualMarkerOverrides.size > 0) {
      state.frames.base = new Array(result.frames.length);
    }
    invalidateAppearanceCache();
    updateSliderReadouts();
    renderRawPreview();
    refreshAppearanceOutputs();
    renderCrossRoiGrid(result.alignmentInfo);
    drawCurrentGifPreview();
    updateExportControlsAvailability();
    syncMarkerEditingUi();
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
        state.preview.rectifiedDiagnosticSourceCanvas = null;
        state.preview.rectifiedDiagnosticDirty = true;
        primeRectifiedDragAsset(state.preview.rectifiedCanvas);
        renderRectifiedPreview(error.partialResult.rectifiedCanvas);
      }
      console.error(error);
      updateExportButtonLabel();
      setStatus("Unable to find page boundary. Try adjusting the Thresholding Offset or other Page & Grid Detection settings.\n(" + (error?.message || String(error)) + ")");
    }
  } finally {
    updateExportControlsAvailability();
    state.processing.active = false;
    if (state.processing.pending) {
      state.processing.pending = false;
      window.clearTimeout(state.processing.timer);
      setGeometryProcessingCursor(true);
      state.processing.timer = window.setTimeout(() => {
        void processCurrentImage(state.processing.requestId);
      }, 0);
    } else {
      setBusyState(false);
      setGeometryProcessingCursor(false);
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
  updateRectifiedSheetHeading();
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

  const currentFrameQuad = getCurrentPreviewFrameQuadInPagePreview();
  if (currentFrameQuad) {
    // Green quad tracks the exact frame currently shown in Animation Preview, using the
    // same refined/overridden marker positions that drive extraction.
    ctx.strokeStyle = "rgb(0, 128, 0)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(offsetX + currentFrameQuad.tl.x * scale, offsetY + currentFrameQuad.tl.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.tr.x * scale, offsetY + currentFrameQuad.tr.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.br.x * scale, offsetY + currentFrameQuad.br.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.bl.x * scale, offsetY + currentFrameQuad.bl.y * scale);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Resolve one marker to its refined/overridden rectified-sheet location, falling back to the
 * nominal lattice if that marker is unavailable.
 *
 * @param {object} extractionInfo
 * @param {number} col
 * @param {number} row
 * @returns {{x:number, y:number}}
 */
function resolveFrameMarkerPoint(extractionInfo, col, row) {
  const marker = extractionInfo?.markerLookup?.get(`${col},${row}`);
  if (marker) {
    return { x: marker.detectedX, y: marker.detectedY };
  }
  const bounds = extractionInfo.gridBounds;
  return {
    x: bounds.left + bounds.width * (col / extractionInfo.cols),
    y: bounds.top + bounds.height * (row / extractionInfo.rows),
  };
}

/**
 * Resolve the quadrilateral for one extracted frame using the current marker positions.
 *
 * @param {object} extractionInfo
 * @param {number} col
 * @param {number} row
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function resolveFrameQuadForPreview(extractionInfo, col, row) {
  return {
    tl: resolveFrameMarkerPoint(extractionInfo, col, row),
    tr: resolveFrameMarkerPoint(extractionInfo, col + 1, row),
    br: resolveFrameMarkerPoint(extractionInfo, col + 1, row + 1),
    bl: resolveFrameMarkerPoint(extractionInfo, col, row + 1),
  };
}

/**
 * Return the frame quad corresponding to the frame currently shown in Animation Preview.
 *
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}} | null}
 */
function getCurrentPreviewFrameQuad() {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo || state.geometry.frameCount <= 0) return null;
  const orderedIndex = getOrderedFrameIndex(state.preview.frameIndex);
  const cols = alignmentInfo.cols;
  const col = orderedIndex % cols;
  const row = Math.floor(orderedIndex / cols);
  if (row < 0 || row >= alignmentInfo.rows) return null;
  return resolveFrameQuadForPreview(alignmentInfo, col, row);
}

/**
 * Map one point from extraction-rectified coordinates back into the full page-preview warp.
 *
 * @param {{x:number,y:number}} point
 * @returns {{x:number,y:number}}
 */
function mapRectifiedPointToPagePreview(point) {
  const alignmentInfo = state.geometry.alignmentInfo;
  const previewQuad = state.geometry.pagePreviewGridQuad;
  if (!alignmentInfo || !previewQuad || typeof cv === "undefined") {
    return { x: point.x, y: point.y };
  }
  const bounds = alignmentInfo.gridBounds;
  const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    bounds.left, bounds.top,
    bounds.left + bounds.width, bounds.top,
    bounds.left + bounds.width, bounds.top + bounds.height,
    bounds.left, bounds.top + bounds.height,
  ]);
  const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    previewQuad.tl.x, previewQuad.tl.y,
    previewQuad.tr.x, previewQuad.tr.y,
    previewQuad.br.x, previewQuad.br.y,
    previewQuad.bl.x, previewQuad.bl.y,
  ]);
  const srcPoint = cv.matFromArray(1, 1, cv.CV_32FC2, [point.x, point.y]);
  const dstPoint = new cv.Mat();
  const transform = cv.getPerspectiveTransform(srcCorners, dstCorners);
  try {
    cv.perspectiveTransform(srcPoint, dstPoint, transform);
    return {
      x: dstPoint.data32F[0],
      y: dstPoint.data32F[1],
    };
  } finally {
    srcCorners.delete();
    dstCorners.delete();
    srcPoint.delete();
    dstPoint.delete();
    transform.delete();
  }
}

/**
 * Return the current preview frame quad expressed in the full page-preview coordinate system.
 *
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}} | null}
 */
function getCurrentPreviewFrameQuadInPagePreview() {
  const quad = getCurrentPreviewFrameQuad();
  if (!quad) return null;
  return {
    tl: mapRectifiedPointToPagePreview(quad.tl),
    tr: mapRectifiedPointToPagePreview(quad.tr),
    br: mapRectifiedPointToPagePreview(quad.br),
    bl: mapRectifiedPointToPagePreview(quad.bl),
  };
}

/**
 * Build the cross-kernel convolution diagnostic image for the current rectified-page preview.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {HTMLCanvasElement}
 */
function getRectifiedConvolutionCanvas(sourceCanvas) {
  if (
    state.preview.rectifiedDiagnosticDirty ||
    state.preview.rectifiedDiagnosticSourceCanvas !== sourceCanvas
  ) {
    buildCrossConvolutionCanvas(sourceCanvas, state.preview.rectifiedDiagnosticCanvas);
    state.preview.rectifiedDiagnosticSourceCanvas = sourceCanvas;
    state.preview.rectifiedDiagnosticDirty = false;
  }
  return state.preview.rectifiedDiagnosticCanvas;
}

/**
 * Invalidate all appearance-adjusted frame caches while keeping the base geometry/debug previews
 * intact. The Rectified Sheet no longer depends on Appearance, so it must keep its canvas handle
 * in order for the animated frame quad to continue updating during preview playback.
 *
 * @returns {void}
 */
function invalidateAppearanceCache() {
  state.frames.adjustedCache.clear();
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
 * Return the extracted frame indices affected by one alignment marker.
 *
 * Marker `(c, r)` can influence up to four neighboring frame cells:
 * `(c-1, r-1)`, `(c, r-1)`, `(c-1, r)`, `(c, r)`.
 *
 * @param {number} markerCol
 * @param {number} markerRow
 * @returns {number[]}
 */
function getAffectedFrameIndicesForMarker(markerCol, markerRow) {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo) return [];
  const indices = [];
  for (let row = markerRow - 1; row <= markerRow; row++) {
    for (let col = markerCol - 1; col <= markerCol; col++) {
      if (col < 0 || row < 0 || col >= alignmentInfo.cols || row >= alignmentInfo.rows) continue;
      indices.push((row * alignmentInfo.cols) + col);
    }
  }
  return indices;
}

/**
 * Invalidate only the extracted/adjusted frames touched by one edited marker.
 *
 * This keeps interactive marker dragging responsive by avoiding unnecessary re-extraction of
 * frames that do not depend on the moved marker.
 *
 * @param {number} markerCol
 * @param {number} markerRow
 * @returns {void}
 */
function invalidateFramesForMarker(markerCol, markerRow) {
  for (const index of getAffectedFrameIndicesForMarker(markerCol, markerRow)) {
    state.frames.base[index] = undefined;
    state.frames.adjustedCache.delete(index);
  }
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
  state.preview.rectifiedDiagnosticSourceCanvas = null;
  state.preview.rectifiedDiagnosticDirty = true;
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
    const scaledFrame = scaleOutputCanvas(transformedFrame, config.exportOptions.outputWidthPx, config.exportOptions.resampling);
    state.frames.base[index] = scaledFrame;
    return scaledFrame;
  } finally {
    rectifiedMat.delete();
  }
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
 * Apply the post-crop output-size scaling used by preview and export.
 *
 * These scaled canvases are cached in `state.frames.base`, so the chosen resize path only runs
 * once per frame unless geometry/export-size inputs change and invalidate that cache.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} outputWidthPx
 * @param {string} resampling
 * @returns {HTMLCanvasElement}
 */
function scaleOutputCanvas(sourceCanvas, outputWidthPx, resampling) {
  if (!sourceCanvas) return sourceCanvas;
  const targetWidth = Math.max(1, Math.round(outputWidthPx || sourceCanvas.width));
  if (targetWidth === sourceCanvas.width) return sourceCanvas;
  const scale = targetWidth / sourceCanvas.width;
  const targetHeight = Math.max(1, Math.round(sourceCanvas.height * scale));
  if (!bUseOpenCvOutputScaling) {
    const scaled = document.createElement("canvas");
    scaled.width = targetWidth;
    scaled.height = targetHeight;
    const ctx = scaled.getContext("2d");
    // Browser-canvas fallback for final output-size change; geometric warps still happen in OpenCV.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = (resampling === "linear") ? "medium" : "high";
    ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
    return scaled;
  }

  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();
  const scaled = document.createElement("canvas");
  try {
    // OpenCV path for final output scaling, useful when comparing very small outputs where the
    // browser's drawImage downsampling can look noticeably worse.
    cv.resize(
      src,
      dst,
      new cv.Size(targetWidth, targetHeight),
      0,
      0,
      getCvInterpolationFlag(resampling)
    );
    scaled.width = targetWidth;
    scaled.height = targetHeight;
    cv.imshow(scaled, dst);
    return scaled;
  } finally {
    src.delete();
    dst.delete();
  }
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
  renderCrossRoiGridViaEditor({
    dom,
    state,
    alignmentInfo,
    getMarkerKey,
    syncMarkerEditingUi,
    onApplyOverride: applyMarkerOverride,
    onRestoreOverride: restoreMarkerOverride,
  });
}

/**
 * Save or update one manual marker override in rectified-sheet coordinates and refresh dependent previews.
 *
 * @param {object} tile
 * @param {{x:number, y:number}} local
 * @param {boolean} finalize
 * @returns {void}
 */
function applyMarkerOverride(tile, local, finalize) {
  const center = (tile.canvas.width - 1) * 0.5;
  const detectedX = tile.x + (local.x - center);
  const detectedY = tile.y + (local.y - center);
  const key = getMarkerKey(tile.col, tile.row);
  state.geometry.manualMarkerOverrides.set(key, { x: detectedX, y: detectedY });
  if (state.geometry.alignmentInfo) {
    // Manual overrides patch the already-detected alignment object in place, which lets preview/extraction
    // update lazily from the edited marker positions without another CV pass.
    applyManualMarkerOverrides(state.geometry.alignmentInfo);
  }
  revokeGifUrl();
  invalidateFramesForMarker(tile.col, tile.row);
  syncMarkerEditingUi();
  if (finalize) {
    renderCrossRoiGrid(state.geometry.alignmentInfo);
  }
  drawCurrentGifPreview();
}

/**
 * Remove one saved marker override and restore the original auto-detected position.
 *
 * @param {object} tile
 * @returns {void}
 */
function restoreMarkerOverride(tile) {
  const key = getMarkerKey(tile.col, tile.row);
  state.geometry.manualMarkerOverrides.delete(key);
  if (state.geometry.alignmentInfo) {
    const marker = state.geometry.alignmentInfo.markerLookup.get(key);
    const liveTile = state.geometry.alignmentInfo.crossRoiTileMap?.get(key);
    if (marker && Number.isFinite(marker.autoDetectedX)) {
      marker.detectedX = marker.autoDetectedX;
      marker.detectedY = marker.autoDetectedY;
      marker.manualOverride = false;
    }
    if (liveTile && Number.isFinite(liveTile.autoDetectedX)) {
      liveTile.detectedX = liveTile.autoDetectedX;
      liveTile.detectedY = liveTile.autoDetectedY;
      liveTile.manualOverride = false;
    }
  }
  revokeGifUrl();
  invalidateFramesForMarker(tile.col, tile.row);
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
  drawCurrentGifPreview();
}

function makeSettingsFilename(sourceFilename) {
  return makeSettingsFilenameViaIo(sourceFilename, sanitizeFilenameBase);
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
  return buildSettingsTsvViaIo({
    config,
    sourceFilename: state.source.filename,
    manualMarkerOverrides: state.geometry.manualMarkerOverrides,
    sanitizeFilenameBase,
  });
}

function revokeGifUrl() {
  revokeGifUrlViaController({ dom, state, updateAnimationPreviewHeading });
}

/**
 * Materialize all adjusted frames and hand them off to the export controller's GIF encoder.
 *
 * @returns {Promise<void>}
 */
async function exportGif() {
  return exportGifViaController({
    dom,
    state,
    readConfig,
    getExportOrderedFrameCount,
    getExportOrderedFrameIndex,
    getAdjustedFrameCanvas,
    revokeGifUrl,
    updateAnimationPreviewHeading,
    updateExportControlsAvailability,
    setStatus,
  });
}

/**
 * Encode the ordered frame sequence as an H.264 MP4 using the export controller.
 *
 * @returns {Promise<void>}
 */
async function exportMp4() {
  return exportMp4ViaController({
    state,
    readConfig,
    getExportOrderedFrameCount,
    getExportOrderedFrameIndex,
    getAdjustedFrameCanvas,
    updateExportControlsAvailability,
    setStatus,
  });
}

/**
 * Export the current ordered animation frames as a ZIP archive of PNG files.
 *
 * @returns {Promise<void>}
 */
async function exportZip() {
  return exportZipViaController({
    state,
    readConfig,
    getExportOrderedFrameCount,
    getExportOrderedFrameIndex,
    getAdjustedFrameCanvas,
    buildSettingsTsv,
    makeSettingsFilename,
    updateExportControlsAvailability,
    setStatus,
    updateExportButtonLabel,
  });
}

/**
 * Download the current settings manifest as a standalone text file.
 *
 * @returns {void}
 */
function saveSettingsFile() {
  return saveSettingsFileViaController({
    state,
    readConfig,
    buildSettingsTsv,
    makeSettingsFilename,
  });
}

/**
 * Update the status panel text.
 *
 * @param {string} text
 * @returns {void}
 */
function setStatus(text) {
  syncStatusText(dom, text);
}
