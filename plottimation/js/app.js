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
  previewPageBoundary,
  estimateCrossRoiSidePx,
  buildCrossConvolutionCanvas,
  getCvInterpolationFlag,
  extractSingleFrameToCanvas,
} from "./pipeline.js";
import { applyTranslations, getTooltipText, t } from "./i18n.js";
// Final output-size scaling can be done either with browser canvas drawImage() or with OpenCV.
// Keep both code paths available for comparison while evaluating tiny-output quality.
const bUseOpenCvOutputScaling = true;
const MOBILE_VIEWER_BREAKPOINT_PX = 960;
const LIVE_THRESHOLD_PREVIEW_MAX_LONG_EDGE_PX = 512;
const FRAME_MATCH_WEIGHT_CACHE = new Map();

const TOOLTIP_TEXT = getTooltipText();

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
  state.runtime.pageBoundaryWarningVisible = showWarning;
  syncPageGridDetectionHeading(dom, showWarning);
  syncRawPhotoFilenameDisplay();
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
 * Mobile currently treats the marker panel as read-only, so the override controls are hidden
 * there even when alignment data exists.
 *
 * @returns {void}
 */
function syncMarkerEditingUi() {
  const hasAlignmentInfo = !!state.geometry.alignmentInfo;
  const hasEdits = state.geometry.manualMarkerOverrides.size > 0;
  const allowEditing = hasAlignmentInfo && !state.runtime.mobileSingleViewerMode;
  dom.toggleMarkerEditingButton.hidden = state.runtime.mobileSingleViewerMode;
  dom.toggleMarkerEditingButton.disabled = !allowEditing;
  dom.toggleMarkerEditingButton.textContent = state.runtime.markerEditingEnabled
    ? t("alignment.disableOverrides")
    : t("alignment.enableOverrides");
  dom.clearMarkerEditsButton.hidden = state.runtime.mobileSingleViewerMode || !hasEdits;
  dom.clearMarkerEditsButton.disabled = !hasEdits;
  dom.toggleMarkerBlobViewButton.hidden = true;
  dom.toggleMarkerBlobViewButton.disabled = true;
  dom.toggleMarkerBlobViewButton.classList.remove("is-active");
}

/**
 * Keep the temporary markerless phase-debug toggle synchronized with runtime state.
 *
 * @returns {void}
 */
function syncMarkerlessPhaseDebugUi() {
  if (dom.markerlessPhaseDebug) {
    dom.markerlessPhaseDebug.checked = !!state.runtime.markerlessPhaseDebugVisible;
  }
}

/**
 * Detect whether the viewport should use the mobile single-viewer layout.
 *
 * @returns {boolean}
 */
function isMobileSingleViewerMode() {
  return window.innerWidth <= MOBILE_VIEWER_BREAKPOINT_PX;
}

/**
 * Apply the currently selected mobile control tab to the reparented control groups.
 *
 * @returns {void}
 */
function syncMobileControlTabUi() {
  const mobileMode = state.runtime.mobileSingleViewerMode;
  const activeTab = state.runtime.activeMobileControlTab;
  const tabButtons = [
    dom.mobileControlTabLayout,
    dom.mobileControlTabPageGrid,
    dom.mobileControlTabAlignment,
    dom.mobileControlTabAppearance,
    dom.mobileControlTabCrop,
    dom.mobileControlTabExport,
  ];
  tabButtons.forEach((button) => {
    const isActive = mobileMode && button?.dataset.controlTab === activeTab;
    button?.classList.toggle("is-active", !!isActive);
    button?.setAttribute("aria-selected", String(!!isActive));
  });

  const controlGroups = [
    dom.layoutGroup,
    dom.pageGridDetectionGroup,
    dom.frameAlignmentGroup,
    dom.appearanceGroup,
    dom.cropGeometryGroup,
    dom.exportOptionsGroup,
  ];
  controlGroups.forEach((group) => {
    if (!group) return;
    const isActive = !mobileMode || group.dataset.mobileControl === activeTab;
    if (mobileMode) {
      group.open = isActive;
    }
    group.classList.toggle("mobile-control-active", isActive);
  });
}

/**
 * Switch the active mobile control tab.
 *
 * @param {string} tab
 * @returns {void}
 */
function setActiveMobileControlTab(tab) {
  const validTabs = new Set(["layout", "page-grid", "alignment", "appearance", "crop", "export"]);
  state.runtime.activeMobileControlTab = validTabs.has(tab) ? tab : "layout";
  syncMobileControlTabUi();
}

/**
 * Apply the current responsive viewer mode and active-tab state to the workspace.
 *
 * Desktop keeps all four viewer cards visible. Mobile switches to one visible viewer card at a
 * time, moves the accordion control groups below the viewer, moves Status to the bottom, and
 * forces the marker panel into read-only mode for now.
 *
 * @returns {void}
 */
function syncResponsiveViewerUi() {
  const mobileMode = isMobileSingleViewerMode();
  const previousMode = state.runtime.mobileSingleViewerMode;
  const collapsibleGroups = [
    dom.layoutGroup,
    dom.pageGridDetectionGroup,
    dom.frameAlignmentGroup,
    dom.appearanceGroup,
    dom.cropGeometryGroup,
    dom.exportOptionsGroup,
  ];
  state.runtime.mobileSingleViewerMode = mobileMode;
  document.body.classList.toggle("mobile-layout", mobileMode);
  document.body.classList.toggle("mobile-raw-active", mobileMode && state.runtime.activeViewerTab === "raw");
  document.body.classList.toggle("mobile-preview-active", mobileMode && state.runtime.activeViewerTab === "preview");
  document.body.classList.toggle("mobile-rectified-active", mobileMode && state.runtime.activeViewerTab === "rectified");
  document.body.classList.toggle("mobile-markers-active", mobileMode && state.runtime.activeViewerTab === "markers");
  if (mobileMode) {
    // Reparent the same desktop control groups into the mobile stack instead of maintaining a
    // duplicate mobile-only form. This keeps settings state and reset behavior shared.
    collapsibleGroups.forEach((group) => {
      if (group && dom.mobileControlStack && group.parentElement !== dom.mobileControlStack) {
        if (group.dataset.desktopOpen == null) {
          group.dataset.desktopOpen = group.open ? "true" : "false";
        }
        dom.mobileControlStack.appendChild(group);
      }
    });
    state.preview.showRectifiedDiagnostic = false;
    if (dom.statusGroup && dom.appShell?.lastElementChild !== dom.statusGroup) {
      dom.appShell?.appendChild(dom.statusGroup);
    }
    if (dom.statusGroup) dom.statusGroup.open = true;
  } else {
    // Restore the desktop sidebar ordering when leaving mobile mode.
    if (dom.statusGroup && dom.controlPanel?.lastElementChild !== dom.statusGroup) {
      dom.controlPanel?.appendChild(dom.statusGroup);
    }
    collapsibleGroups.forEach((group) => {
      if (group && dom.controlPanel && group.parentElement !== dom.controlPanel) {
        if (group.dataset.desktopOpen != null) {
          group.open = group.dataset.desktopOpen === "true";
        }
        dom.controlPanel.insertBefore(group, dom.statusGroup);
      }
    });
  }

  const validViews = new Set(["raw", "rectified", "markers", "preview"]);
  if (!validViews.has(state.runtime.activeViewerTab)) {
    state.runtime.activeViewerTab = "raw";
  }

  const tabButtons = [
    dom.viewerTabRaw,
    dom.viewerTabRectified,
    dom.viewerTabMarkers,
    dom.viewerTabPreview,
  ];
  tabButtons.forEach((button) => {
    const isActive = button?.dataset.view === state.runtime.activeViewerTab;
    button?.classList.toggle("is-active", isActive);
    button?.setAttribute("aria-pressed", String(isActive));
  });

  const cards = [
    dom.rawViewerCard,
    dom.rectifiedViewerCard,
    dom.markersViewerCard,
    dom.previewViewerCard,
  ];
  cards.forEach((card) => {
    const isActive = card?.dataset.view === state.runtime.activeViewerTab;
    card?.classList.toggle("viewer-active", !mobileMode || isActive);
  });

  if (mobileMode && state.runtime.markerEditingEnabled) {
    state.runtime.markerEditingEnabled = false;
    renderCrossRoiGrid(state.geometry.alignmentInfo);
  } else if (previousMode !== mobileMode) {
    syncMarkerEditingUi();
  }
  syncMobileControlTabUi();
  syncMobileMarkerGridLayout();
}

/**
 * Keep the mobile Preview card's aspect-ratio hint aligned with the current output dimensions.
 *
 * This lets the mobile preview panel collapse to the same maximized animation shape instead of
 * reserving the full viewer height with extra blank space.
 *
 * @returns {void}
 */
function updateMobilePreviewAspectRatio() {
  const config = readConfig();
  const width = Math.max(1, Math.round(config.exportOptions.outputWidthPx || state.runtime.outputWidthPx || 1));
  const height = Math.max(1, Math.round(config.exportOptions.outputHeightPx || state.runtime.outputHeightPx || 1));
  dom.previewViewerCard?.style.setProperty("--mobile-preview-aspect", `${width} / ${height}`);
}

/**
 * Keep the mobile Rectified Sheet card's aspect-ratio hint aligned with the displayed sheet.
 *
 * @param {HTMLCanvasElement | null} rectifiedCanvas
 * @returns {void}
 */
function updateMobileRectifiedAspectRatio(rectifiedCanvas) {
  const width = Math.max(1, Math.round(rectifiedCanvas?.width || 1));
  const height = Math.max(1, Math.round(rectifiedCanvas?.height || 1));
  dom.rectifiedViewerCard?.style.setProperty("--mobile-rectified-aspect", `${width} / ${height}`);
}

/**
 * Scale the marker diagnostic grid to fit the mobile viewport width and set the viewport height
 * to the scaled grid height. Desktop keeps the unscaled scrollable grid behavior.
 *
 * @returns {void}
 */
function syncMobileMarkerGridLayout() {
  const viewport = dom.crossRoiViewport;
  const grid = dom.crossRoiGrid;
  if (!viewport || !grid) return;
  if (!state.runtime.mobileSingleViewerMode || grid.classList.contains("is-empty")) {
    viewport.style.height = "";
    grid.style.width = "";
    grid.style.height = "";
    grid.style.setProperty("--mobile-marker-grid-scale", "1");
    return;
  }
  const intrinsicWidth = Math.max(1, Math.round(grid.scrollWidth || 1));
  const intrinsicHeight = Math.max(1, Math.round(grid.scrollHeight || 1));
  const availableWidth = Math.max(1, Math.round(viewport.clientWidth || 1));
  const scale = Math.min(1, availableWidth / intrinsicWidth);
  grid.style.width = `${intrinsicWidth}px`;
  grid.style.height = `${intrinsicHeight}px`;
  grid.style.setProperty("--mobile-marker-grid-scale", String(scale));
  viewport.style.height = `${Math.ceil(intrinsicHeight * scale)}px`;
}

/**
 * Keep the mobile Raw Photo card's aspect-ratio hint aligned with the loaded source image.
 *
 * @returns {void}
 */
function updateMobileRawAspectRatio() {
  const width = Math.max(1, Math.round(state.source.canvas?.width || 1));
  const height = Math.max(1, Math.round(state.source.canvas?.height || 1));
  dom.rawViewerCard?.style.setProperty("--mobile-raw-aspect", `${width} / ${height}`);
}

/**
 * Switch the active mobile viewer tab while leaving the desktop multi-panel view unchanged.
 *
 * The rerender is deferred one animation frame so hidden canvases are not resized while their
 * cards are still `display:none`.
 *
 * @param {string} view
 * @returns {void}
 */
function setActiveViewerTab(view) {
  state.runtime.activeViewerTab = view;
  syncResponsiveViewerUi();
  window.requestAnimationFrame(() => {
    rerenderPreviews();
  });
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
 * Return the number of source cells currently included in preview/export before ordering expands
 * them into ping-pong playback.
 *
 * @returns {number}
 */
function getIncludedSourceFrameCount() {
  const total = Math.max(0, state.geometry.frameCount || 0);
  if (total <= 0) return 0;
  const requested = Math.round(Number(readConfig().exportOptions.frameCountToExport) || total);
  return Math.max(1, Math.min(total, requested));
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
 * Resolve the source-frame index currently shown in Preview.
 *
 * During paused arrow-key inspection, this deliberately ignores export/playback ordering so the
 * user can examine the physical frame grid directly.
 *
 * @returns {number}
 */
function getCurrentDisplayedFrameSourceIndex() {
  const frameCount = getIncludedSourceFrameCount();
  if (frameCount <= 0) return 0;
  if (state.preview.paused && state.preview.inspectingRawFrame) {
    return ((state.preview.frameIndex % frameCount) + frameCount) % frameCount;
  }
  return getOrderedFrameIndex(state.preview.frameIndex);
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
 * Step up or down within the valid source cells of the current physical column.
 *
 * When `Frames in Export` omits highest-indexed cells, the last physical row may be incomplete.
 * Vertical paused-grid inspection should wrap only across the valid cells that remain in the
 * current column, rather than wrapping modulo the truncated linear frame count.
 *
 * @param {number} sourceIndex
 * @param {number} rowStep
 * @returns {number}
 */
function getVerticallySteppedSourceIndex(sourceIndex, rowStep) {
  const frameCount = getIncludedSourceFrameCount();
  const cols = Math.max(1, state.geometry.alignmentInfo?.cols || 1);
  if (frameCount <= 0) return 0;
  if (cols <= 1) {
    return ((sourceIndex + rowStep + frameCount) % frameCount + frameCount) % frameCount;
  }
  const col = ((sourceIndex % cols) + cols) % cols;
  const columnIndices = [];
  for (let index = col; index < frameCount; index += cols) {
    columnIndices.push(index);
  }
  if (columnIndices.length <= 1) {
    return columnIndices[0] ?? sourceIndex;
  }
  const currentPos = Math.max(0, columnIndices.indexOf(sourceIndex));
  const nextPos = ((currentPos + rowStep) % columnIndices.length + columnIndices.length) % columnIndices.length;
  return columnIndices[nextPos];
}

/**
 * Draw the current preview frame via the dedicated preview controller.
 *
 * @returns {void}
 */
function drawCurrentGifPreview() {
  updateMobilePreviewAspectRatio();
  drawPreviewFrame({ dom, state, getAdjustedFrameCanvas, getDisplayFrameIndex: getCurrentDisplayedFrameSourceIndex });
  if (state.preview.rectifiedCanvas) {
    renderRectifiedPreview(state.preview.rectifiedCanvas);
  }
}

/**
 * Clear the markerless paper-backdrop CSS variable so fallback styling applies again.
 *
 * @returns {void}
 */
function clearMarkerlessPaperBackdropColor() {
  document.body.style.removeProperty("--markerless-paper-backdrop");
}

/**
 * Estimate the rectified sheet's paper color from a thin border sample and use a slightly darker
 * version of that color behind Markerless Frame Corners / Preview panels.
 *
 * Sampled pixels:
 * - top two rows
 * - bottom two rows
 * - left two columns
 * - right two columns
 *
 * @param {HTMLCanvasElement | null} canvas
 * @returns {void}
 */
function updateMarkerlessPaperBackdropColor(canvas) {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    clearMarkerlessPaperBackdropColor();
    return;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    clearMarkerlessPaperBackdropColor();
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  const bandRows = Math.min(2, height);
  const bandCols = Math.min(2, width);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  const accumulateRowBand = (yStart, rows) => {
    if (rows <= 0) return;
    const data = ctx.getImageData(0, yStart, width, rows).data;
    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  };
  const accumulateColBand = (xStart, cols, yStart, rows) => {
    if (cols <= 0 || rows <= 0) return;
    const data = ctx.getImageData(xStart, yStart, cols, rows).data;
    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  };

  accumulateRowBand(0, bandRows);
  if (height > bandRows) {
    accumulateRowBand(Math.max(0, height - bandRows), bandRows);
  }

  const middleY = bandRows;
  const middleRows = Math.max(0, height - (bandRows * 2));
  if (middleRows > 0) {
    accumulateColBand(0, bandCols, middleY, middleRows);
    if (width > bandCols) {
      accumulateColBand(Math.max(0, width - bandCols), bandCols, middleY, middleRows);
    }
  }

  if (count <= 0) {
    clearMarkerlessPaperBackdropColor();
    return;
  }

  const avgR = Math.max(0, Math.min(255, Math.round(rSum / count) - 20));
  const avgG = Math.max(0, Math.min(255, Math.round(gSum / count) - 20));
  const avgB = Math.max(0, Math.min(255, Math.round(bSum / count) - 20));
  document.body.style.setProperty("--markerless-paper-backdrop", `rgb(${avgR}, ${avgG}, ${avgB})`);
}

/**
 * Release cached OpenCV source mats that are tied to the currently loaded raw image.
 *
 * The lightweight Thresholding Offset preview reuses these mats so slider drags do not keep
 * re-reading the source canvas or redoing full-image grayscale conversion.
 *
 * @returns {void}
 */
function releaseSourceCvCaches() {
  if (state.source.cvMat) {
    state.source.cvMat.delete();
    state.source.cvMat = null;
  }
  if (state.source.grayMat) {
    state.source.grayMat.delete();
    state.source.grayMat = null;
  }
  if (state.source.previewGrayMat) {
    state.source.previewGrayMat.delete();
    state.source.previewGrayMat = null;
  }
  state.source.previewScale = 1;
}

/**
 * Ensure that the raw source image has cached OpenCV mats ready for lightweight page-boundary
 * previewing while the threshold-offset slider is dragged.
 *
 * @returns {{cvMat: cv.Mat, grayMat: cv.Mat, previewGrayMat: cv.Mat, previewScale: number} | null}
 */
function ensureSourceCvCaches() {
  if (!state.runtime.cvReady || !state.source.image) return null;
  if (!state.source.cvMat) {
    state.source.cvMat = cv.imread(state.source.canvas);
  }
  if (!state.source.grayMat) {
    state.source.grayMat = new cv.Mat();
    cv.cvtColor(state.source.cvMat, state.source.grayMat, cv.COLOR_RGBA2GRAY);
  }
  if (!state.source.previewGrayMat) {
    const sourceWidth = state.source.canvas.width;
    const sourceHeight = state.source.canvas.height;
    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    const previewScale =
      sourceLongEdge > LIVE_THRESHOLD_PREVIEW_MAX_LONG_EDGE_PX
        ? LIVE_THRESHOLD_PREVIEW_MAX_LONG_EDGE_PX / sourceLongEdge
        : 1;
    state.source.previewScale = previewScale;
    if (previewScale < 1) {
      const previewWidth = Math.max(1, Math.round(sourceWidth * previewScale));
      const previewHeight = Math.max(1, Math.round(sourceHeight * previewScale));
      state.source.previewGrayMat = new cv.Mat();
      cv.resize(
        state.source.grayMat,
        state.source.previewGrayMat,
        new cv.Size(previewWidth, previewHeight),
        0,
        0,
        cv.INTER_AREA
      );
    } else {
      state.source.previewGrayMat = state.source.grayMat.clone();
    }
  }
  return {
    cvMat: state.source.cvMat,
    grayMat: state.source.grayMat,
    previewGrayMat: state.source.previewGrayMat,
    previewScale: state.source.previewScale,
  };
}

/**
 * Recompute just the page boundary and redraw the Raw panel while Thresholding Offset is dragged.
 *
 * This intentionally skips page warp, grid detection, marker alignment, and frame extraction.
 *
 * @returns {void}
 */
function previewPageBoundaryForThresholdOffset() {
  if (!state.runtime.cvReady || !state.source.image || state.processing.active) return;
  const config = readConfig();
  let previewGrayMat = null;
  try {
    const cachedSource = ensureSourceCvCaches();
    if (!cachedSource) return;
    previewGrayMat = cachedSource.previewGrayMat.clone();
    const useInvertedMarkerVision = config.alignmentPipeline === "markers" && config.lightOnDarkDesign;
    if (useInvertedMarkerVision) {
      // Match the lightweight threshold-preview path to the full marker pipeline so dragging
      // threshold controls previews the same light-on-dark interpretation used during processing.
      cv.bitwise_not(previewGrayMat, previewGrayMat);
    }
    const previewWidth = previewGrayMat.cols;
    const previewHeight = previewGrayMat.rows;
    const preview = previewPageBoundary(
      previewGrayMat,
      previewWidth,
      previewHeight,
      config.thresholdMethod,
      config.thresholdOffset
    );
    state.source.rawPageContour = Array.isArray(preview.pageQuadPoints)
      ? preview.pageQuadPoints.map((point) => ({
          x: point.x / cachedSource.previewScale,
          y: point.y / cachedSource.previewScale,
        }))
      : preview.pageQuadPoints;
    const hasPageQuad = Array.isArray(preview.pageQuadPoints) && preview.pageQuadPoints.length === 4;
    if (!hasPageQuad) {
      clearDerivedOutputsForDetectionFailure();
    }
    updatePageGridDetectionHeading(!hasPageQuad);
    renderRawPreview();
  } catch (error) {
    clearDerivedOutputsForDetectionFailure();
    updatePageGridDetectionHeading(true);
    console.error(error);
  } finally {
    previewGrayMat?.delete();
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
  releaseRectifiedCvCache();
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
  state.preview.activeEditedMarker = null;
  state.runtime.markerEditingEnabled = false;
  state.runtime.markerBlobDebugVisible = false;
  state.frames.base = [];
  state.frames.stabilizedCache.clear();
  state.frames.stabilizationMatchData = null;
  state.frames.stabilizationPairwise = null;
  state.frames.stabilizationAverageReference = null;
  state.frames.stabilizationOffsets = null;
  state.frames.adjustedCache.clear();
  state.preview.frameIndex = 0;
  state.preview.inspectingRawFrame = false;
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
  dom.crossRoiViewport?.classList.add("is-empty");
  syncMobileMarkerGridLayout();
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
  releaseSourceCvCaches();
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
 * Blank all downstream panels after page-detection failure while keeping the source image and any
 * saved manual marker overrides available for a later successful reprocess.
 *
 * This prevents Rectified Sheet, Frame Alignment Markers, and Preview from showing stale
 * last-known-good results when the current settings no longer produce a valid page boundary.
 *
 * @returns {void}
 */
function clearDerivedOutputsForDetectionFailure() {
  releaseRectifiedCvCache();
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
  state.runtime.markerEditingEnabled = false;
  state.runtime.markerBlobDebugVisible = false;
  state.frames.base = [];
  state.frames.stabilizedCache.clear();
  state.frames.stabilizationMatchData = null;
  state.frames.stabilizationPairwise = null;
  state.frames.stabilizationAverageReference = null;
  state.frames.stabilizationOffsets = null;
  state.frames.adjustedCache.clear();
  state.preview.frameIndex = 0;
  state.preview.inspectingRawFrame = false;
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
  dom.crossRoiViewport?.classList.add("is-empty");
  syncMobileMarkerGridLayout();
  updateExportControlsAvailability(true);
  syncMarkerEditingUi();
  updatePreviewPlayPauseButton();
  updateAnimationPreviewHeading();
  updateExportButtonLabel();
}

/**
 * Bootstrap the application once the module is loaded.
 *
 * This wires both the desktop layout and the narrower-screen mobile layout. The responsive
 * reparenting of control groups happens later inside `syncResponsiveViewerUi()`.
 *
 * @returns {void}
 */
function init() {
  applyTranslations(document);
  attachUi();
  [
    dom.mobileControlTabLayout,
    dom.mobileControlTabPageGrid,
    dom.mobileControlTabAlignment,
    dom.mobileControlTabAppearance,
    dom.mobileControlTabCrop,
    dom.mobileControlTabExport,
  ].forEach((button) => {
    button?.addEventListener("click", () => {
      setActiveMobileControlTab(button.dataset.controlTab || "layout");
    });
  });
  initAccordionPanels();
  initializeTooltips();
  dom.statusGroup?.addEventListener("toggle", () => {
    if (state.runtime.mobileSingleViewerMode && dom.statusGroup) {
      dom.statusGroup.open = true;
    }
  });
  void populateDemoSelect();
  syncPaperPresetUi();
  syncAlignmentMarkerUi();
  syncMp4ExportUi();
  syncResponsiveViewerUi();
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
  state.runtime.pageBoundaryWarningVisible = false;

  if (typeof cv !== "undefined" && cv.onRuntimeInitialized) {
    cv.onRuntimeInitialized = onOpenCvReady;
  } else if (typeof cv !== "undefined") {
    onOpenCvReady();
  } else {
    setStatus(t("status.openCvNotLoaded"));
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
    getPaperGeometrySignature,
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
        state.preview.inspectingRawFrame = false;
        state.preview.lastTime = performance.now();
        updatePreviewPlayPauseButton();
        drawCurrentGifPreview();
        return;
      }
      state.preview.paused = !state.preview.paused;
      if (!state.preview.paused) {
        state.preview.inspectingRawFrame = false;
      }
      state.preview.lastTime = performance.now();
      updatePreviewPlayPauseButton();
      drawCurrentGifPreview();
    },
    stepPausedPreviewFrame: (direction) => {
      const frameCount = getIncludedSourceFrameCount();
      if (!state.preview.paused || frameCount <= 0) return;
      const currentSourceIndex = getCurrentDisplayedFrameSourceIndex();
      const cols = Math.max(1, state.geometry.alignmentInfo?.cols || 1);
      state.preview.inspectingRawFrame = true;
      if (Math.abs(direction) === cols) {
        state.preview.frameIndex = getVerticallySteppedSourceIndex(currentSourceIndex, Math.sign(direction) || 1);
      } else {
        state.preview.frameIndex = (currentSourceIndex + direction + frameCount) % frameCount;
      }
      drawCurrentGifPreview();
    },
    toggleMarkerBlobView,
    toggleMarkerlessPhaseDebug,
    toggleMarkerEditing,
    clearMarkerEdits,
    syncOutputSizeFromWidthInput,
    syncOutputSizeFromHeightInput,
    previewPageBoundaryForThresholdOffset,
    syncPaperPresetUi,
    syncAlignmentMarkerUi,
    setActiveViewerTab,
    updateSliderReadouts,
    scheduleProcess,
    revokeGifUrl,
    invalidateAppearanceCache,
    invalidateStabilizationCache,
    invalidateStabilizedOutputCaches,
    invalidateStabilizationOffsetsCache,
    invalidateCurrentPreviewFrameCaches,
    invalidateCurrentPreviewStabilizationCaches,
    scheduleAppearancePreviewUpdate,
    scheduleStabilizationPreviewUpdate,
    scheduleMarkerlessPhasePreviewUpdate,
    warmCurrentStabilizationMethod: scheduleCurrentStabilizationWarmup,
    beginStabilizationStrengthScrub,
    endStabilizationStrengthScrub,
    beginMarkerlessPhaseScrub,
    endMarkerlessPhaseScrub,
    setGeometryProcessingCursor,
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
  if (readConfig().alignmentPipeline === "markerless") return;
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
  const maxFrameCount = Math.max(
    1,
    Math.max(1, Math.round(Number(dom.frameCols.value) || SETTINGS_DEFAULTS.layout.frameCols)) *
    Math.max(1, Math.round(Number(dom.frameRows.value) || SETTINGS_DEFAULTS.layout.frameRows))
  );
  const alreadyReset =
    (Number(dom.fps.value) || SETTINGS_DEFAULTS.gifExport.fps) === SETTINGS_DEFAULTS.gifExport.fps &&
    (Number(dom.loopCount.value) || SETTINGS_DEFAULTS.gifExport.loopCount) === SETTINGS_DEFAULTS.gifExport.loopCount &&
    (Number(dom.frameCountToExport?.value) || maxFrameCount) === maxFrameCount &&
    !dom.reverseOrder.checked &&
    !dom.boustrophedonOrder.checked &&
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
  if (dom.frameCountToExport) {
    dom.frameCountToExport.value = String(maxFrameCount);
  }
  dom.reverseOrder.checked = SETTINGS_DEFAULTS.gifExport.reverseOrder;
  dom.boustrophedonOrder.checked = SETTINGS_DEFAULTS.gifExport.boustrophedonOrder;
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
  state.preview.activeEditedMarker = null;
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
  setStatus(t("status.openCvReady"));
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
 * Coalesce markerless phase-slider preview updates into one animation-frame redraw.
 *
 * @returns {void}
 */
function scheduleMarkerlessPhasePreviewUpdate() {
  if (state.preview.markerlessPhasePreviewRaf) return;
  state.preview.markerlessPhasePreviewRaf = requestAnimationFrame(() => {
    state.preview.markerlessPhasePreviewRaf = 0;
    renderCrossRoiGrid(state.geometry.alignmentInfo);
    drawCurrentGifPreview();
  });
}

/**
 * Coalesce stabilization-strength preview updates into one animation-frame redraw.
 *
 * @returns {void}
 */
function scheduleStabilizationPreviewUpdate() {
  if (state.preview.stabilizationPreviewRaf) return;
  state.preview.stabilizationPreviewRaf = requestAnimationFrame(() => {
    state.preview.stabilizationPreviewRaf = 0;
    if (!state.preview.markerOverrideScrubbing) {
      renderCrossRoiGrid(state.geometry.alignmentInfo);
    }
    drawCurrentGifPreview();
  });
}

/**
 * Pause Preview playback while the stabilization-strength slider is actively scrubbed.
 *
 * @returns {void}
 */
function beginStabilizationStrengthScrub() {
  if (readConfig().alignmentPipeline === "markerless") {
    scheduleCurrentStabilizationWarmup();
  }
  if (state.preview.stabilizationStrengthScrubbing) return;
  state.preview.stabilizationStrengthScrubbing = true;
  if (state.preview.paused) {
    state.preview.stabilizationStrengthResumePlayback = false;
    return;
  }
  state.preview.stabilizationStrengthResumePlayback = true;
  state.preview.paused = true;
  updatePreviewPlayPauseButton();
}

/**
 * Restore Preview playback after stabilization-strength scrubbing if the scrub initiated the pause.
 *
 * @returns {void}
 */
function endStabilizationStrengthScrub() {
  if (!state.preview.stabilizationStrengthScrubbing) return;
  state.preview.stabilizationStrengthScrubbing = false;
  if (!state.preview.stabilizationStrengthResumePlayback) return;
  state.preview.stabilizationStrengthResumePlayback = false;
  state.preview.paused = false;
  updatePreviewPlayPauseButton();
}

/**
 * Pause Preview playback while a markerless corner override is actively scrubbed.
 *
 * @returns {void}
 */
function beginMarkerOverrideScrub() {
  if (state.preview.markerOverrideScrubbing) return;
  state.preview.markerOverrideScrubbing = true;
  if (state.preview.paused) {
    state.preview.markerOverrideResumePlayback = false;
    return;
  }
  state.preview.markerOverrideResumePlayback = true;
  state.preview.paused = true;
  updatePreviewPlayPauseButton();
}

/**
 * Restore Preview playback after a markerless corner override scrub if the scrub initiated pause.
 *
 * @returns {void}
 */
function endMarkerOverrideScrub() {
  if (!state.preview.markerOverrideScrubbing) return;
  state.preview.markerOverrideScrubbing = false;
  if (!state.preview.markerOverrideResumePlayback) return;
  state.preview.markerOverrideResumePlayback = false;
  state.preview.paused = false;
  updatePreviewPlayPauseButton();
}

/**
 * Pause Preview playback while a markerless phase slider is actively scrubbed.
 *
 * @returns {void}
 */
function beginMarkerlessPhaseScrub() {
  if (state.preview.markerlessPhaseScrubbing) return;
  state.preview.markerlessPhaseScrubbing = true;
  if (state.preview.paused) {
    state.preview.markerlessPhaseResumePlayback = false;
    return;
  }
  state.preview.markerlessPhaseResumePlayback = true;
  state.preview.paused = true;
  updatePreviewPlayPauseButton();
}

/**
 * Restore Preview playback after a markerless phase scrub if the scrub initiated the pause.
 *
 * @returns {void}
 */
function endMarkerlessPhaseScrub() {
  if (!state.preview.markerlessPhaseScrubbing) return;
  state.preview.markerlessPhaseScrubbing = false;
  if (!state.preview.markerlessPhaseResumePlayback) return;
  state.preview.markerlessPhaseResumePlayback = false;
  state.preview.paused = false;
  updatePreviewPlayPauseButton();
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
    { value: "area", label: t("export.dynamicResamplingOptions.area") },
    { value: "linear", label: t("export.dynamicResamplingOptions.linear") },
    { value: "cubic", label: t("export.dynamicResamplingOptions.cubic") },
  ];
  if (typeof cv !== "undefined" && typeof cv.INTER_LANCZOS4 !== "undefined") {
    options.push({ value: "lanczos", label: t("export.dynamicResamplingOptions.lanczos") });
  }
  if (typeof cv !== "undefined" && typeof cv.INTER_NEAREST !== "undefined") {
    options.push({ value: "nearest", label: t("export.dynamicResamplingOptions.nearest") });
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
      syncResponsiveViewerUi();
      window.requestAnimationFrame(() => {
        syncRawPhotoFilenameDisplay();
        rerenderPreviews();
      });
    }, 40);
  });
}

/**
 * Truncate a filename with a middle ellipsis so the start and extension remain visible.
 *
 * @param {string} text
 * @param {number} maxWidthPx
 * @param {string} font
 * @returns {string}
 */
function truncateMiddleTextToFit(text, maxWidthPx, font) {
  if (!text || maxWidthPx <= 0) return text;
  const canvas = truncateMiddleTextToFit.canvas || (truncateMiddleTextToFit.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidthPx) return text;

  const ellipsis = "…";
  const extensionIndex = text.lastIndexOf(".");
  const extensionLength = extensionIndex >= 0 ? (text.length - extensionIndex) : 0;
  const suffixFloor = Math.max(
    4,
    extensionLength > 0 ? Math.min(text.length - 1, extensionLength + 2) : 4
  );
  let best = text;

  for (let prefixLen = Math.min(text.length - suffixFloor - 1, 12); prefixLen >= 1; prefixLen--) {
    for (let suffixLen = suffixFloor; suffixLen < text.length - prefixLen; suffixLen++) {
      const suffixStart = text.length - suffixLen;
      const safeSuffixStart = (extensionIndex >= 0 && suffixStart >= extensionIndex)
        ? Math.max(0, extensionIndex - 2)
        : suffixStart;
      const candidate = `${text.slice(0, prefixLen)}${ellipsis}${text.slice(safeSuffixStart)}`;
      if (ctx.measureText(candidate).width <= maxWidthPx) {
        return candidate;
      }
      best = candidate;
      if (suffixLen > 12) break;
    }
  }

  return best;
}

/**
 * Decide whether the Raw Photo filename is long enough to warrant middle truncation.
 *
 * This keeps ordinary filenames unchanged even if the header layout has a little slack jitter,
 * and only engages ellipsis for genuinely long names.
 *
 * @param {string} text
 * @param {number} availableWidthPx
 * @param {string} font
 * @returns {boolean}
 */
function shouldEllipsizeRawFilename(text, availableWidthPx, font) {
  if (!text) return false;
  if (text.length <= 24) return false;
  const canvas = shouldEllipsizeRawFilename.canvas || (shouldEllipsizeRawFilename.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const measuredWidth = ctx.measureText(text).width;
  return measuredWidth > Math.max(availableWidthPx, 0) + 24;
}

/**
 * Fit the Raw Photo filename link into the header using a middle ellipsis when needed.
 *
 * @returns {void}
 */
function syncRawPhotoFilenameDisplay() {
  if (!dom.rawPhotoName || !dom.rawPhotoNameWrap || dom.rawPhotoNameWrap.hidden) return;
  const fullFilename = dom.rawPhotoName.dataset.fullFilename || state.source.filename || "";
  if (!fullFilename) {
    dom.rawPhotoName.textContent = "";
    return;
  }

  const headingRowWidth = dom.rawPhotoHeading?.parentElement?.clientWidth || 0;
  const titleWidth = dom.rawPhotoHeadingText?.getBoundingClientRect().width || 0;
  const warningWidth = dom.rawPhotoWarning?.hidden ? 0 : (dom.rawPhotoWarning.getBoundingClientRect().width || 0);
  const busyWidth = dom.rawBusy?.hidden ? 0 : (dom.rawBusy.getBoundingClientRect().width || 0);
  const availableWrapWidth = Math.max(40, headingRowWidth - titleWidth - warningWidth - busyWidth - 20);
  const availableLinkWidth = Math.max(32, availableWrapWidth - 12);
  const computed = window.getComputedStyle(dom.rawPhotoName);
  const font = computed.font || `${computed.fontSize} ${computed.fontFamily}`;
  dom.rawPhotoName.textContent = shouldEllipsizeRawFilename(fullFilename, availableLinkWidth, font)
    ? truncateMiddleTextToFit(fullFilename, availableLinkWidth, font)
    : fullFilename;
  dom.rawPhotoName.title = state.runtime.tooltipsEnabled ? t("tooltip.rawPhotoName") : "";
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
    setActiveViewerTab,
    collapseAllPanels,
    resetNonLayoutControls,
    revokeGifUrl,
    clearAllPreviews,
    renderRawPreview,
    syncRawPhotoFilenameDisplay,
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
 * @param {number} [delayMs=220]
 * @returns {void}
 */
function scheduleProcess(delayMs = 220) {
  if (!state.source.image) return;
  state.processing.requestId += 1;
  const requestId = state.processing.requestId;
  window.clearTimeout(state.processing.timer);
  setGeometryProcessingCursor(true);
  state.processing.timer = window.setTimeout(() => {
    void processCurrentImage(requestId);
  }, Math.max(0, delayMs));
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
 *   alignmentPipeline:string,
 *   stabilizationMethod:string,
 *   alignmentMarkerType:string,
 *   crossRoiScalePct:number,
 *   crossRoiScale:number,
 *   stabilizationStrength:number,
 *   stabilizationLambda:number,
 *   markerlessPhaseX:number,
 *   markerlessPhaseY:number,
 *   verticalDriftCompensation:number,
 *   markerlessUseDarkness:boolean,
 *   markerlessUseTexture:boolean,
 *   markerlessUseVariance:boolean,
 *   lightOnDarkDesign:boolean,
 *   detectCrossesWithConvolution:boolean,
 *   useCrossAlignment:boolean,
 *   crop:{left:number,right:number,top:number,bottom:number},
 *   postCropGeometry:{flipHorizontal:boolean,flipVertical:boolean,rotate90Cw:boolean},
 *   filters:{brightness:number,contrast:number,vibrance:number,temperature:number,unsharpRadius:number,unsharpAmount:number,invert:boolean},
 *   fps:number,
 *   exportOptions:{encodingQuality:number,quality:number,mp4Quality:number,dither:string|false,resampling:string,globalPalette:boolean,outputWidthPx:number,outputHeightPx:number,outputScale:number,reverseOrder:boolean,boustrophedonOrder:boolean,pingPong:boolean,loopCount:number,frameCountToExport:number}
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
  const frameCols = Math.max(1, Math.min(20, Math.round(Number(dom.frameCols.value) || SETTINGS_DEFAULTS.layout.frameCols)));
  const frameRows = Math.max(1, Math.min(20, Math.round(Number(dom.frameRows.value) || SETTINGS_DEFAULTS.layout.frameRows)));
  const sourceFrameCount = Math.max(1, frameCols * frameRows);
  const encodingQuality = getEncodingQualityValue();
  return {
    paperOrientation,
    paperPreset,
    paperWidthIn: Math.max(1, paperWidth),
    paperHeightIn: Math.max(1, paperHeight),
    paperAspect,
    frameCols,
    frameRows,
    thresholdMethod: dom.thresholdMethod.value || SETTINGS_DEFAULTS.detection.thresholdMethod,
    thresholdOffset: Math.max(-128, Math.min(128, Math.round(Number(dom.thresholdOffset.value) || SETTINGS_DEFAULTS.detection.thresholdOffset))),
    paperMarginPx: Math.max(
      0,
      Math.min(
        256,
        Math.round(
          Number.isFinite(Number(dom.paperMargin.value))
            ? Number(dom.paperMargin.value)
            : SETTINGS_DEFAULTS.detection.paperMarginPx
        )
      )
    ),
    boundarySensitivity: Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || SETTINGS_DEFAULTS.detection.boundarySensitivity)),
    boundaryPersistencePx: Math.max(1, Math.min(15, Math.round(Number(dom.boundaryPersistence.value) || SETTINGS_DEFAULTS.detection.boundaryPersistencePx))),
    alignmentPipeline: dom.alignmentPipelineMarkerless.checked ? "markerless" : "markers",
    // The radio group exposes a temporary-friendly UI label, but the config keeps stable internal
    // ids so settings files and solver branching do not depend on user-facing wording.
    stabilizationMethod: dom.stabilizationMethodAverage?.checked ? "difference-from-average" : "pairwise-cyclic",
    alignmentMarkerType: dom.alignmentMarkerType.value || "crosses",
    crossRoiScalePct: Math.max(18, Math.min(110, Number(dom.crossRoiScale.value) || SETTINGS_DEFAULTS.detection.crossRoiScalePct)),
    crossRoiScale: Math.max(0.18, Math.min(1.1, (Number(dom.crossRoiScale.value) || SETTINGS_DEFAULTS.detection.crossRoiScalePct) / 100)),
    stabilizationStrength: Math.max(0, Math.min(150, Math.round(Number(dom.stabilizationStrength.value) || SETTINGS_DEFAULTS.detection.stabilizationStrength))),
    stabilizationLambda: Math.max(0.001, Math.min(0.1, Number(dom.stabilizationLambda.value) || SETTINGS_DEFAULTS.detection.stabilizationLambda)),
    markerlessPhaseX: Math.max(-0.4, Math.min(0.4, Number(dom.markerlessPhaseX.value) || SETTINGS_DEFAULTS.detection.markerlessPhaseX)),
    markerlessPhaseY: Math.max(-0.4, Math.min(0.4, Number(dom.markerlessPhaseY.value) || SETTINGS_DEFAULTS.detection.markerlessPhaseY)),
    verticalDriftCompensation: Math.max(
      -0.05,
      Math.min(
        0.05,
        Number(dom.verticalDriftCompensation?.value) || SETTINGS_DEFAULTS.detection.verticalDriftCompensation
      )
    ),
    markerlessUseDarkness: dom.markerlessUseDarkness ? dom.markerlessUseDarkness.checked : true,
    markerlessUseTexture: dom.markerlessUseTexture ? dom.markerlessUseTexture.checked : true,
    markerlessUseVariance: dom.markerlessUseVariance ? dom.markerlessUseVariance.checked : true,
    lightOnDarkDesign: dom.lightOnDarkDesign ? dom.lightOnDarkDesign.checked : false,
    detectCrossesWithConvolution: (dom.alignmentPipelineMarkers.checked && dom.alignmentMarkerType.value === "crosses") && dom.detectCrossesWithConvolution.checked,
    useCrossAlignment: dom.alignmentPipelineMarkerless.checked ? true : dom.useCrossAlignment.checked,
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
      boustrophedonOrder: dom.boustrophedonOrder.checked,
      pingPong: dom.pingPong.checked,
      frameCountToExport: Math.max(
        1,
        Math.min(
          sourceFrameCount,
          Math.round(Number(dom.frameCountToExport?.value) || sourceFrameCount)
        )
      ),
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
 * Return a compact signature for the effective paper geometry currently implied by the UI.
 *
 * This is used to avoid unnecessary reprocessing when the user switches between a preset and
 * `Custom` without actually changing the sheet dimensions.
 *
 * @returns {string}
 */
function getPaperGeometrySignature() {
  const config = readConfig();
  return `${config.paperWidthIn}x${config.paperHeightIn}`;
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
  if (presetKey === "custom") return t("layout.presetNames.custom");
  const preset = PAPER_PRESETS[presetKey];
  if (!preset) return presetKey;
  const orientation = getPaperOrientation();
  const width = orientation === "portrait" ? preset.height : preset.width;
  const height = orientation === "portrait" ? preset.width : preset.height;
  const units = preset.width > 100 ? t("layout.units.mm") : t("layout.units.in");
  return `${t(`layout.presetNames.${presetKey}`)} (${width}×${height} ${units})`;
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
  dom.paperPresetLabel.textContent = t("layout.paperSize");
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

function getActiveAlignmentPipeline() {
  return dom.alignmentPipelineMarkerless.checked ? "markerless" : "markers";
}

/**
 * Preserve the markerless default of zero Search Inset Margin when switching away from marker mode.
 *
 * @param {"markerless"|"markers"} pipeline
 * @returns {void}
 */
function applyAlignmentPipelineDefaults(pipeline) {
  if (
    pipeline === "markerless" &&
    dom.paperMargin &&
    Number(dom.paperMargin.value) === SETTINGS_DEFAULTS.detection.paperMarginPx
  ) {
    // Markerless mode defaults to no search inset. Preserve any non-default user/saved value.
    dom.paperMargin.value = "0";
  }
}

/**
 * Ensure marker-pipeline-only controls hold a valid state before being shown again.
 *
 * @param {"markerless"|"markers"} pipeline
 * @returns {void}
 */
function sanitizeAlignmentPipelineState(pipeline) {
  if (
    pipeline === "markers" &&
    dom.alignmentMarkerType.value !== "auto" &&
    dom.alignmentMarkerType.value !== "crosses" &&
    dom.alignmentMarkerType.value !== "circles"
  ) {
    dom.alignmentMarkerType.value = SETTINGS_DEFAULTS.detection.alignmentMarkerType;
  }
}

/**
 * Return which alignment-specific control groups should be visible for the active pipeline.
 *
 * @param {"markerless"|"markers"} pipeline
 * @returns {{showMarkerlessControls:boolean,showMarkersPipelineControls:boolean,showCrossOnlyControls:boolean}}
 */
function getAlignmentUiModeFlags(pipeline) {
  document.body.classList.toggle("markerless-pipeline", pipeline === "markerless");
  const markerType = dom.alignmentMarkerType.value || SETTINGS_DEFAULTS.detection.alignmentMarkerType;
  const resolvedAutoType = state.geometry.alignmentInfo?.resolvedMarkerType || null;
  const showMarkersPipelineControls = pipeline === "markers";
  const showCrossOnlyControls = showMarkersPipelineControls && (markerType === "crosses" || (markerType === "auto" && resolvedAutoType === "crosses"));
  const showMarkerlessControls = pipeline === "markerless";
  return {
    showMarkerlessControls,
    showMarkersPipelineControls,
    showCrossOnlyControls,
  };
}

/**
 * Rewrite alignment-related labels so the UI language matches the active pipeline.
 *
 * @param {{showMarkerlessControls:boolean}} flags
 * @returns {void}
 */
function syncAlignmentPipelineLabels(flags) {
  const { showMarkerlessControls } = flags;
  const frameAlignmentSummary = document.querySelector("#frameAlignmentSummary");
  const frameAlignmentSummaryLabel =
    frameAlignmentSummary?.querySelector("[data-i18n='alignment.summary']") ||
    frameAlignmentSummary?.firstElementChild;
  const dropGuidanceNote = document.querySelector("#dropGuidanceNote");
  if (frameAlignmentSummaryLabel) {
    frameAlignmentSummaryLabel.textContent = showMarkerlessControls ? t("alignment.summaryMarkerless") : t("alignment.summary");
  }
  if (dropGuidanceNote) {
    dropGuidanceNote.textContent = showMarkerlessControls ? t("photo.dropNoteMarkerless") : t("photo.dropNote");
  }
  const isMobileViewerMode = state.runtime.mobileSingleViewerMode;
  const headingText = isMobileViewerMode
    ? t(showMarkerlessControls ? "viewerTabs.centers" : "viewerTabs.markers")
    : t(showMarkerlessControls ? "panels.frameCorners" : "panels.frameAlignmentMarkers");
  if (dom.crossRegionsHeading) {
    const label = dom.crossRegionsHeading.querySelector("[data-panel-heading]") || dom.crossRegionsHeading.firstElementChild;
    if (label) label.textContent = headingText;
  }
  if (dom.viewerTabMarkers) {
    const viewerTabKey = showMarkerlessControls ? "viewerTabs.centers" : "viewerTabs.markers";
    dom.viewerTabMarkers.textContent = t(viewerTabKey);
  }
  if (dom.mobileControlTabAlignment) {
    const mobileControlTabKey = showMarkerlessControls ? "mobileControlTabs.stabilize" : "mobileControlTabs.markers";
    dom.mobileControlTabAlignment.textContent = t(mobileControlTabKey);
  }
  if (dom.crossRoiScaleLabel) {
    dom.crossRoiScaleLabel.textContent = showMarkerlessControls
      ? t("alignment.frameCornerRoiSize")
      : t("alignment.roiSize");
  }
  const markerlessPhaseXLabel =
    dom.markerlessPhaseXRow?.querySelector("[data-i18n='alignment.markerlessPhaseX']") ||
    dom.markerlessPhaseXRow?.querySelector("span span");
  if (markerlessPhaseXLabel) {
    markerlessPhaseXLabel.textContent = t("alignment.markerlessPhaseXOffset");
  }
  const markerlessPhaseYLabel =
    dom.markerlessPhaseYRow?.querySelector("[data-i18n='alignment.markerlessPhaseY']") ||
    dom.markerlessPhaseYRow?.querySelector("span span");
  if (markerlessPhaseYLabel) {
    markerlessPhaseYLabel.textContent = t("alignment.markerlessPhaseYOffset");
  }
  syncAlignmentModeTooltips(showMarkerlessControls);
}

/**
 * Keep shared tooltip text aligned with the active pipeline when marker terminology becomes
 * corner/stabilization terminology in markerless mode.
 *
 * @param {boolean} showMarkerlessControls
 * @returns {void}
 */
function syncAlignmentModeTooltips(showMarkerlessControls) {
  const applyTooltip = (element, key, extraElements = []) => {
    if (!element) return;
    const text = t(`tooltip.${key}`);
    const targets = [element, ...extraElements].filter(Boolean);
    if (Array.isArray(state.runtime.tooltipRegistry)) {
      for (const entry of state.runtime.tooltipRegistry) {
        if (targets.includes(entry[0])) entry[1] = text;
      }
    }
    for (const target of targets) {
      if (state.runtime.tooltipsEnabled && String(text || "").trim()) {
        target.title = text;
      } else {
        target.removeAttribute("title");
      }
    }
  };

  applyTooltip(
    document.querySelector("#frameAlignmentSummary"),
    showMarkerlessControls ? "frameAlignmentSummaryMarkerless" : "frameAlignmentSummary",
  );
  applyTooltip(
    dom.crossRegionsHeading,
    showMarkerlessControls ? "crossRegionsHeadingMarkerless" : "crossRegionsHeading",
  );
  applyTooltip(
    dom.crossRoiScale,
    showMarkerlessControls ? "crossRoiScaleMarkerless" : "crossRoiScale",
    [dom.crossRoiScale?.closest("label")],
  );
  applyTooltip(
    dom.toggleMarkerEditingButton,
    showMarkerlessControls ? "toggleMarkerEditingButtonMarkerless" : "toggleMarkerEditingButton",
  );
  applyTooltip(
    dom.clearMarkerEditsButton,
    showMarkerlessControls ? "clearMarkerEditsButtonMarkerless" : "clearMarkerEditsButton",
  );
}

/**
 * Keep the shared ROI-size slider in the right position for the active alignment mode.
 *
 * @param {{showMarkerlessControls:boolean}} flags
 * @returns {void}
 */
function syncAlignmentSliderOrder(flags) {
  const { showMarkerlessControls } = flags;
  if (dom.alignmentSliderStack && dom.crossRoiScaleRow) {
    if (showMarkerlessControls) {
      dom.alignmentSliderStack.appendChild(dom.crossRoiScaleRow);
    } else {
      dom.alignmentSliderStack.prepend(dom.crossRoiScaleRow);
    }
  }
}

/**
 * Show or hide the alignment controls appropriate for the active pipeline.
 *
 * @param {{showMarkerlessControls:boolean,showMarkersPipelineControls:boolean,showCrossOnlyControls:boolean}} flags
 * @returns {void}
 */
function syncAlignmentPipelineVisibility(flags) {
  const { showMarkerlessControls, showMarkersPipelineControls, showCrossOnlyControls } = flags;
  dom.boundarySensitivityRow.hidden = showMarkerlessControls;
  dom.boundaryPersistenceRow.hidden = showMarkerlessControls;
  if (dom.stabilizationMethodGroup) {
    dom.stabilizationMethodGroup.hidden = !showMarkerlessControls;
  }
  dom.alignmentMarkerTypeField.hidden = !showMarkersPipelineControls;
  dom.useCrossAlignmentRow.hidden = showMarkerlessControls;
  dom.detectCrossesWithConvolutionRow.hidden = !showCrossOnlyControls;
  dom.stabilizationStrengthRow.hidden = !showMarkerlessControls;
  dom.stabilizationLambdaRow.hidden = !showMarkerlessControls;
  dom.emphasizePeripheryRow.hidden = true;
  dom.markerlessPhaseXRow.hidden = !showMarkerlessControls;
  dom.markerlessPhaseYRow.hidden = !showMarkerlessControls;
  if (dom.markerlessPhaseDebugRow) {
    dom.markerlessPhaseDebugRow.hidden = true;
  }
  if (dom.markerlessUseDarknessRow) {
    dom.markerlessUseDarknessRow.hidden = true;
  }
  if (dom.markerlessUseTextureRow) {
    dom.markerlessUseTextureRow.hidden = true;
  }
  if (dom.markerlessUseVarianceRow) {
    dom.markerlessUseVarianceRow.hidden = true;
  }
  dom.verticalDriftCompensationRow.hidden = !showMarkerlessControls;
}

/**
 * Enable only the stabilization controls that apply to the current markerless method.
 *
 * `Stabilization Rigidity` (`lambda`) only affects the pairwise/cyclic least-squares solve. The
 * alternate average-reference method does not use it, so the slider should be visibly inactive in
 * that mode to avoid implying that it has any effect.
 *
 * @param {{showMarkerlessControls:boolean}} flags
 * @returns {void}
 */
function syncStabilizationMethodUi(flags) {
  const { showMarkerlessControls } = flags;
  const usesLambda =
    showMarkerlessControls &&
    (dom.stabilizationMethodPairwise?.checked || !dom.stabilizationMethodAverage?.checked);
  if (dom.stabilizationLambda) {
    dom.stabilizationLambda.disabled = !usesLambda;
  }
  if (dom.stabilizationLambdaRow) {
    dom.stabilizationLambdaRow.classList.toggle("is-disabled", !usesLambda);
    dom.stabilizationLambdaRow.setAttribute("aria-disabled", usesLambda ? "false" : "true");
  }
}

/**
 * Clear or collapse inactive alignment-only diagnostics when the active pipeline changes.
 *
 * @param {{showCrossOnlyControls:boolean}} flags
 * @returns {void}
 */
function resetInactiveAlignmentUiState(flags) {
  const { showCrossOnlyControls } = flags;
  if (!showCrossOnlyControls) {
    dom.detectCrossesWithConvolution.checked = false;
  } else if (state.runtime.markerBlobDebugVisible) {
    state.runtime.markerBlobDebugVisible = false;
    if (state.geometry.alignmentInfo) {
      renderCrossRoiGrid(state.geometry.alignmentInfo);
    }
  }
}

/**
 * Reconfigure the alignment UI for the active pipeline.
 *
 * Markerless mode intentionally presents a different mental model from marker mode:
 * - the subpanel becomes "Stabilization"
 * - marker-type controls disappear
 * - gutter / phase / stabilization controls appear
 * - the marker tile panel is relabeled as Frame Corners, even though it still reuses the same
 *   underlying tile widget and override machinery
 *
 * @returns {void}
 */
function syncAlignmentMarkerUi() {
  const pipeline = getActiveAlignmentPipeline();
  applyAlignmentPipelineDefaults(pipeline);
  sanitizeAlignmentPipelineState(pipeline);
  const flags = getAlignmentUiModeFlags(pipeline);
  syncAlignmentPipelineLabels(flags);
  syncAlignmentSliderOrder(flags);
  syncAlignmentPipelineVisibility(flags);
  syncStabilizationMethodUi(flags);
  resetInactiveAlignmentUiState(flags);
  if (state.runtime.markerlessPhaseDebugVisible) {
    state.runtime.markerlessPhaseDebugVisible = false;
    if (state.preview.rectifiedCanvas) {
      renderRectifiedPreview(state.preview.rectifiedCanvas);
    }
  }
  syncMarkerlessPhaseDebugUi();
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
    dom.exportMp4Button.title = t("panels.mp4Unsupported");
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
 * Toggle the marker tiles between grayscale ROIs and binarized dot-blob diagnostics.
 *
 * @returns {void}
 */
function toggleMarkerBlobView() {
  if (!state.geometry.alignmentInfo?.crossRoiTiles?.some((tile) => tile.blobCanvas)) return;
  state.runtime.markerBlobDebugVisible = !state.runtime.markerBlobDebugVisible;
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
}

/**
 * Toggle the temporary markerless phase-debug overlay and refresh the rectified-sheet preview.
 *
 * @returns {void}
 */
function toggleMarkerlessPhaseDebug() {
  if (readConfig().alignmentPipeline !== "markerless") return;
  state.runtime.markerlessPhaseDebugVisible = !state.runtime.markerlessPhaseDebugVisible;
  syncMarkerlessPhaseDebugUi();
  if (state.preview.rectifiedCanvas) {
    renderRectifiedPreview(state.preview.rectifiedCanvas);
  }
}

/**
 * Remove all saved manual marker overrides and re-render from the current auto-detected markers.
 *
 * @returns {void}
 */
function clearMarkerEdits() {
  if (!state.geometry.manualMarkerOverrides.size) return;
  state.geometry.manualMarkerOverrides.clear();
  state.preview.activeEditedMarker = null;
  state.runtime.markerEditingEnabled = false;
  const isMarkerless = readConfig().alignmentPipeline === "markerless";
  if (state.geometry.alignmentInfo && !isMarkerless) {
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
  if (isMarkerless) {
    state.frames.base = new Array(state.geometry.frameCount);
    state.frames.stabilizedCache.clear();
    state.frames.adjustedCache.clear();
  } else {
    invalidateFrameCaches();
  }
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
  scheduleStabilizationPreviewUpdate();
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
      setStatus(`${t("status.loadedSettingsFile")}\n${t("status.reanalyzingPage")}`);
      await waitForNextPaint();
      state.processing.requestId += 1;
      await processCurrentImage(state.processing.requestId);
    } else {
      setStatus(`${t("status.loadedSettingsFile")}\n${t("status.loadImageToUseSettings")}`);
    }
  } catch (error) {
    console.error(error);
    setStatus(t("status.failedToLoadSettings", { message: error?.message || String(error) }));
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
  syncFrameCountToExportUi();
  dom.brightnessValue.textContent = formatSignedValue(dom.brightness.value);
  dom.contrastValue.textContent = formatSignedValue(dom.contrast.value);
  dom.vibranceValue.textContent = formatSignedValue(dom.vibrance.value);
  dom.temperatureValue.textContent = formatSignedValue(dom.temperature.value);
  dom.unsharpRadiusValue.textContent = (Math.max(0.1, Math.min(100, Number(dom.unsharpRadius.value) || SETTINGS_DEFAULTS.appearance.unsharpRadius))).toFixed(1);
  dom.unsharpAmountValue.textContent = (Math.max(0, Math.min(500, Number(dom.unsharpAmount.value) || SETTINGS_DEFAULTS.appearance.unsharpAmount))).toFixed(1);
  dom.thresholdOffsetValue.textContent = formatSignedValue(dom.thresholdOffset.value);
  dom.paperMarginValue.textContent = `${Math.max(
    0,
    Math.min(
      256,
      Number.isFinite(Number(dom.paperMargin.value))
        ? Number(dom.paperMargin.value)
        : SETTINGS_DEFAULTS.detection.paperMarginPx
    )
  )} px`;
  dom.boundarySensitivityValue.textContent = `${Math.max(0, Math.min(20, Number(dom.boundarySensitivity.value) || SETTINGS_DEFAULTS.detection.boundarySensitivity)).toFixed(1)}`;
  dom.boundaryPersistenceValue.textContent = String(Math.max(1, Math.min(15, Number(dom.boundaryPersistence.value) || SETTINGS_DEFAULTS.detection.boundaryPersistencePx)));
  dom.stabilizationStrengthValue.textContent = `${Math.max(0, Math.min(150, Math.round(Number(dom.stabilizationStrength.value) || SETTINGS_DEFAULTS.detection.stabilizationStrength)))}%`;
  dom.stabilizationLambdaValue.textContent = `${Math.max(0.001, Math.min(0.1, Number(dom.stabilizationLambda.value) || SETTINGS_DEFAULTS.detection.stabilizationLambda)).toFixed(3)}`;
  dom.markerlessPhaseXValue.textContent = formatSignedDecimal(Math.max(-0.4, Math.min(0.4, Number(dom.markerlessPhaseX.value) || SETTINGS_DEFAULTS.detection.markerlessPhaseX)));
  dom.markerlessPhaseYValue.textContent = formatSignedDecimal(Math.max(-0.4, Math.min(0.4, Number(dom.markerlessPhaseY.value) || SETTINGS_DEFAULTS.detection.markerlessPhaseY)));
  if (dom.verticalDriftCompensationValue) {
    dom.verticalDriftCompensationValue.textContent = `${formatSignedDecimal(
      Math.max(
        -0.05,
        Math.min(
          0.05,
          Number(dom.verticalDriftCompensation?.value) || SETTINGS_DEFAULTS.detection.verticalDriftCompensation
        )
      ) * 100
    )}%`;
  }
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
 * Clamp the export-frame-count control to the current grid size. If the control was still at the
 * previous maximum, treat it as "use all cells" and advance it to the new maximum automatically.
 *
 * @returns {number}
 */
function syncFrameCountToExportUi() {
  if (!dom.frameCountToExport) return 0;
  const cols = Math.max(1, Math.min(20, Math.round(Number(dom.frameCols.value) || SETTINGS_DEFAULTS.layout.frameCols)));
  const rows = Math.max(1, Math.min(20, Math.round(Number(dom.frameRows.value) || SETTINGS_DEFAULTS.layout.frameRows)));
  const maxFrameCount = Math.max(1, cols * rows);
  const previousMax = Math.max(1, state.runtime.lastFrameExportCountMax || maxFrameCount);
  const rawText = String(dom.frameCountToExport.value || "").trim();
  const rawValue = Number(rawText);
  let nextValue = rawValue;
  if (!rawText || !Number.isFinite(rawValue) || rawValue === previousMax) {
    nextValue = maxFrameCount;
  }
  nextValue = Math.max(1, Math.min(maxFrameCount, Math.round(nextValue)));
  dom.frameCountToExport.min = "1";
  dom.frameCountToExport.max = String(maxFrameCount);
  dom.frameCountToExport.value = String(nextValue);
  state.runtime.lastFrameExportCountMax = maxFrameCount;
  return nextValue;
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
 * Format a signed decimal readout with fixed precision.
 *
 * @param {number} value
 * @returns {string}
 */
function formatSignedDecimal(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(3)}`;
}

/**
 * Return an overlay stroke width in backing-store pixels while preserving the intended CSS-pixel
 * thickness on HiDPI canvases.
 *
 * Standard-density screens keep the existing stroke widths. On `devicePixelRatio > 1`, selected
 * geometry overlays switch to a `1.5 px` visual stroke, which means scaling that width back up
 * into the canvas backing-store coordinate system.
 *
 * @param {number} standardCssPx
 * @returns {number}
 */
function getPanelOverlayStrokeWidth(standardCssPx) {
  const dpr = Math.max(1, Math.min(2, Number(globalThis.devicePixelRatio) || 1));
  return dpr > 1 ? (1.5 * dpr) : standardCssPx;
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
    setStatus(t("status.openCvLoading"));
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
    state.frames.stabilizedCache.clear();
    state.frames.stabilizationMatchData = null;
    state.frames.stabilizationPairwise = null;
    state.frames.stabilizationAverageReference = null;
    state.frames.stabilizationOffsets = null;
    state.geometry.frameCount = result.frames.length;
    state.geometry.alignmentInfo = result.alignmentInfo;
    releaseRectifiedCvCache();
    state.geometry.baseRectifiedCanvas = result.rectifiedCanvas;
    state.geometry.baseRectifiedPageCanvas = result.pagePreviewCanvas;
    state.geometry.pagePreviewGridQuad = result.pagePreviewGridQuad;
    state.source.rawPageContour = result.pageQuadPoints;
    stashOriginalMarkerDetections(state.geometry.alignmentInfo);
    applyManualMarkerOverrides(state.geometry.alignmentInfo);
    if (state.geometry.manualMarkerOverrides.size > 0) {
      state.frames.base = new Array(result.frames.length);
      state.frames.stabilizedCache.clear();
      state.frames.stabilizationMatchData = null;
      state.frames.stabilizationPairwise = null;
      state.frames.stabilizationAverageReference = null;
      state.frames.stabilizationOffsets = null;
    }
    syncAlignmentMarkerUi();
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
    if (config.alignmentPipeline === "markerless") {
      scheduleMarkerlessStabilizationWarmup(requestId);
    }
  } catch (error) {
    if (error?.name !== "ProcessAbortedError") {
      if (error?.partialResult?.pageQuadPoints) {
        state.source.rawPageContour = error.partialResult.pageQuadPoints;
        renderRawPreview();
      }
      clearDerivedOutputsForDetectionFailure();
      console.error(error);
      updateExportButtonLabel();
      setStatus(t("status.pageBoundaryFailure"));
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
  const diagnosticSource = rectifiedCanvas;
  const displayCanvas = state.preview.showRectifiedDiagnostic
    ? getRectifiedConvolutionCanvas(diagnosticSource)
    : rectifiedCanvas;
  updateMobileRectifiedAspectRatio(displayCanvas);
  renderCanvasFit(displayCanvas, dom.rectifiedCanvas);
  const targetCanvas = dom.rectifiedCanvas;
  const scale = Math.min(targetCanvas.width / displayCanvas.width, targetCanvas.height / displayCanvas.height);
  const drawW = displayCanvas.width * scale;
  const drawH = displayCanvas.height * scale;
  const offsetX = (targetCanvas.width - drawW) * 0.5;
  const offsetY = (targetCanvas.height - drawH) * 0.5;
  const ctx = targetCanvas.getContext("2d");
  const config = readConfig();

  ctx.save();
  if (config.alignmentPipeline === "markerless" && !state.preview.showRectifiedDiagnostic) {
    const insetPx = Math.max(
      0,
      Math.min(
        Math.floor(displayCanvas.width * 0.5) - 1,
        Math.min(Math.floor(displayCanvas.height * 0.5) - 1, config.paperMarginPx || 0)
      )
    );
    ctx.strokeStyle = "rgb(0, 90, 220)";
    ctx.lineWidth = getPanelOverlayStrokeWidth(1);
    ctx.strokeRect(
      offsetX + (insetPx * scale),
      offsetY + (insetPx * scale),
      Math.max(1, drawW - (2 * insetPx * scale)),
      Math.max(1, drawH - (2 * insetPx * scale))
    );
  }
  drawOmittedFrameQuads(ctx, offsetX, offsetY, scale);
  const currentFrameQuad = getCurrentPreviewFrameQuad();
  if (currentFrameQuad) {
    // Draw the current frame directly in rectified-sheet pixel coordinates.
    ctx.strokeStyle = "rgb(0, 128, 0)";
    ctx.lineWidth = getPanelOverlayStrokeWidth(1);
    ctx.beginPath();
    ctx.moveTo(offsetX + currentFrameQuad.tl.x * scale, offsetY + currentFrameQuad.tl.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.tr.x * scale, offsetY + currentFrameQuad.tr.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.br.x * scale, offsetY + currentFrameQuad.br.y * scale);
    ctx.lineTo(offsetX + currentFrameQuad.bl.x * scale, offsetY + currentFrameQuad.bl.y * scale);
    ctx.closePath();
    ctx.stroke();
  }
  drawActiveEditedMarkerEdges(ctx, offsetX, offsetY, scale);
  if (
    config.alignmentPipeline === "markerless" &&
    state.runtime.markerlessPhaseDebugVisible &&
    !state.preview.showRectifiedDiagnostic
  ) {
    drawMarkerlessPhaseDebugChart(
      ctx,
      state.geometry.alignmentInfo?.markerlessEstimate?.phaseDebugX || null,
      offsetX,
      offsetY,
      scale,
      drawW,
      drawH,
      displayCanvas.width,
      displayCanvas.height,
    );
  }
  ctx.restore();
}

/**
 * Draw a temporary inset chart showing the left-to-right markerless phase-support metrics.
 *
 * The three plotted curves are the same normalized gutter-support terms used by the phase solver:
 * low darkness, low texture, and low variance. That means likely gutters appear as upward spikes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{positions:number[], darkness:number[], texture:number[], variance:number[], gutter:number[]}|null} phaseDebugX
 * @param {number} imageOffsetX
 * @param {number} imageOffsetY
 * @param {number} imageScale
 * @param {number} imageDrawWidth
 * @param {number} imageDrawHeight
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {void}
 */
function drawMarkerlessPhaseDebugChart(
  ctx,
  phaseDebugX,
  imageOffsetX,
  imageOffsetY,
  imageScale,
  imageDrawWidth,
  imageDrawHeight,
  imageWidth,
  imageHeight,
) {
  const amplitudeScale = 0.25;
  if (
    !phaseDebugX?.positions?.length ||
    !phaseDebugX?.darkness?.length ||
    !phaseDebugX?.texture?.length ||
    !phaseDebugX?.variance?.length ||
    !phaseDebugX?.gutter?.length
  ) return;
  const chartHeight = Math.min(180, Math.max(120, Math.round(imageDrawHeight * 0.28)));
  const chartBottom = imageOffsetY + imageDrawHeight;
  const chartTop = chartBottom - chartHeight;
  const plotX = imageOffsetX;
  const plotY = chartTop;
  const plotW = imageDrawWidth;
  const plotH = chartHeight;
  const curves = [
    { data: phaseDebugX.darkness, color: "#8B0000", label: "darkness", amplitudeScale },
    { data: phaseDebugX.texture, color: "#006400", label: "texture", amplitudeScale },
    { data: phaseDebugX.variance, color: "#0000CD", label: "variance", amplitudeScale },
    { data: normalizeDebugCurveForDisplay(phaseDebugX.gutter), color: "#000000", label: "product", amplitudeScale: 1 },
  ];

  ctx.save();
  ctx.beginPath();
  ctx.rect(imageOffsetX, imageOffsetY, imageDrawWidth, imageDrawHeight);
  ctx.clip();

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fillRect(plotX, plotY, plotW, plotH);

  ctx.strokeStyle = "rgba(32, 33, 36, 0.15)";
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH * 0.5);
  ctx.lineTo(plotX + plotW, plotY + plotH * 0.5);
  ctx.stroke();

  ctx.font = "11px sans-serif";
  ctx.textBaseline = "top";
  let legendX = plotX;
  for (const curve of curves) {
    ctx.fillStyle = curve.color;
    ctx.fillRect(legendX, plotY + 6, 10, 3);
    legendX += 14;
    ctx.fillText(curve.label, legendX, plotY + 1);
    legendX += ctx.measureText(curve.label).width + 14;
  }

  const positions = phaseDebugX.positions;
  for (const curve of curves) {
    const data = curve.data;
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const rectifiedX = Math.max(0, Math.min(imageWidth, Number(positions[i]) || 0));
      const x = imageOffsetX + (rectifiedX * imageScale);
      const y = plotY + plotH - (Math.max(0, Number(data[i]) || 0) * plotH * curve.amplitudeScale);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Normalize one debug curve into 0..1 for chart display only.
 *
 * The combined gutter signal can use a different numeric range than the component terms, so the
 * overlay scales it independently to keep the black curve legible.
 *
 * @param {number[]} data
 * @returns {number[]}
 */
function normalizeDebugCurveForDisplay(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const value of data) {
    const numeric = Number(value) || 0;
    if (numeric < min) min = numeric;
    if (numeric > max) max = numeric;
  }
  const range = Math.max(1e-6, max - min);
  return data.map((value) => ((Number(value) || 0) - min) / range);
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
function getPreviewFrameQuadForSourceIndex(sourceIndex) {
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!alignmentInfo || state.geometry.frameCount <= 0) return null;
  const cols = alignmentInfo.cols;
  const col = sourceIndex % cols;
  const row = Math.floor(sourceIndex / cols);
  if (row < 0 || row >= alignmentInfo.rows) return null;
  const extractionInfo =
    readConfig().alignmentPipeline === "markerless"
      ? buildMarkerlessExtractionInfoForFrame(alignmentInfo, col, row)
      : alignmentInfo;
  const quad = resolveFrameQuadForPreview(extractionInfo, col, row);
  const phaseOffset = getMarkerlessPhaseSourceOffset(readConfig(), alignmentInfo);
  const driftOffset = getMarkerlessVerticalDriftSourceOffset(readConfig(), alignmentInfo, sourceIndex);
  const stabilizationOffset = getFrameStabilizationSourceOffset(sourceIndex);
  const offset = {
    x: phaseOffset.x + stabilizationOffset.x + driftOffset.x,
    y: phaseOffset.y + stabilizationOffset.y + driftOffset.y,
  };
  if (Math.abs(offset.x) < 1e-6 && Math.abs(offset.y) < 1e-6) {
    return quad;
  }
  return {
    tl: { x: quad.tl.x + offset.x, y: quad.tl.y + offset.y },
    tr: { x: quad.tr.x + offset.x, y: quad.tr.y + offset.y },
    br: { x: quad.br.x + offset.x, y: quad.br.y + offset.y },
    bl: { x: quad.bl.x + offset.x, y: quad.bl.y + offset.y },
  };
}

/**
 * Return the frame quad corresponding to the frame currently shown in Animation Preview.
 *
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}} | null}
 */
function getCurrentPreviewFrameQuad() {
  return getPreviewFrameQuadForSourceIndex(getCurrentDisplayedFrameSourceIndex());
}

/**
 * Draw omitted source cells on the Rectified Sheet so users can see which highest-indexed frames
 * have been excluded from playback/export by Number of Frames to Export.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} scale
 * @returns {void}
 */
function drawOmittedFrameQuads(ctx, offsetX, offsetY, scale) {
  const totalFrameCount = Math.max(0, state.geometry.frameCount || 0);
  const includedFrameCount = getIncludedSourceFrameCount();
  if (!state.geometry.alignmentInfo || includedFrameCount >= totalFrameCount) return;
  ctx.save();
  ctx.strokeStyle = "rgb(200, 0, 0)";
  ctx.lineWidth = getPanelOverlayStrokeWidth(1);
  for (let sourceIndex = includedFrameCount; sourceIndex < totalFrameCount; sourceIndex += 1) {
    const quad = getPreviewFrameQuadForSourceIndex(sourceIndex);
    if (!quad) continue;
    ctx.beginPath();
    ctx.moveTo(offsetX + quad.tl.x * scale, offsetY + quad.tl.y * scale);
    ctx.lineTo(offsetX + quad.tr.x * scale, offsetY + quad.tr.y * scale);
    ctx.lineTo(offsetX + quad.br.x * scale, offsetY + quad.br.y * scale);
    ctx.lineTo(offsetX + quad.bl.x * scale, offsetY + quad.bl.y * scale);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offsetX + quad.tr.x * scale, offsetY + quad.tr.y * scale);
    ctx.lineTo(offsetX + quad.bl.x * scale, offsetY + quad.bl.y * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Resolve one currently displayed alignment point for Rectified Sheet overlays.
 *
 * Marker mode reads directly from the live alignment lattice, which already includes in-place
 * override edits. Markerless mode resolves the current displayed corner position after phase,
 * stabilization, and any stored post-stabilization manual nudge.
 *
 * @param {object} alignmentInfo
 * @param {number} col
 * @param {number} row
 * @returns {{x:number,y:number}}
 */
function resolveDisplayedAlignmentPoint(alignmentInfo, col, row) {
  const key = getMarkerKey(col, row);
  if (readConfig().alignmentPipeline === "markerless") {
    const sourceMarker = alignmentInfo?.markerLookup?.get(key);
    if (sourceMarker) {
      const displayed = getMarkerlessDisplayedCorner(sourceMarker, col, row, alignmentInfo);
      return { x: displayed.detectedX, y: displayed.detectedY };
    }
  }
  return resolveFrameMarkerPoint(alignmentInfo, col, row);
}

/**
 * Draw the frame-boundary segments incident to the marker/corner currently being edited.
 *
 * Only the 2-4 connected lattice edges are drawn so the user can see which local frame boundaries
 * are moving while dragging an override.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} scale
 * @returns {void}
 */
function drawActiveEditedMarkerEdges(ctx, offsetX, offsetY, scale) {
  const activeMarker = state.preview.activeEditedMarker;
  const alignmentInfo = state.geometry.alignmentInfo;
  if (!activeMarker || !alignmentInfo) return;

  const { col, row } = activeMarker;
  const segments = [];
  if (col > 0) segments.push([{ col: col - 1, row }, { col, row }]);
  if (col < alignmentInfo.cols) segments.push([{ col, row }, { col: col + 1, row }]);
  if (row > 0) segments.push([{ col, row: row - 1 }, { col, row }]);
  if (row < alignmentInfo.rows) segments.push([{ col, row }, { col, row: row + 1 }]);
  if (!segments.length) return;

  ctx.save();
  ctx.strokeStyle = "rgb(0, 128, 0)";
  ctx.lineWidth = getPanelOverlayStrokeWidth(1);
  for (const [startMarker, endMarker] of segments) {
    const start = resolveDisplayedAlignmentPoint(alignmentInfo, startMarker.col, startMarker.row);
    const end = resolveDisplayedAlignmentPoint(alignmentInfo, endMarker.col, endMarker.row);
    ctx.beginPath();
    ctx.moveTo(offsetX + start.x * scale, offsetY + start.y * scale);
    ctx.lineTo(offsetX + end.x * scale, offsetY + end.y * scale);
    ctx.stroke();
  }
  ctx.restore();
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
  const tlMarker = alignmentInfo.markerLookup?.get(getMarkerKey(0, 0));
  const trMarker = alignmentInfo.markerLookup?.get(getMarkerKey(alignmentInfo.cols, 0));
  const brMarker = alignmentInfo.markerLookup?.get(getMarkerKey(alignmentInfo.cols, alignmentInfo.rows));
  const blMarker = alignmentInfo.markerLookup?.get(getMarkerKey(0, alignmentInfo.rows));
  const bounds = alignmentInfo.gridBounds;
  const srcTl = tlMarker ? { x: tlMarker.detectedX, y: tlMarker.detectedY } : { x: bounds.left, y: bounds.top };
  const srcTr = trMarker ? { x: trMarker.detectedX, y: trMarker.detectedY } : { x: bounds.left + bounds.width, y: bounds.top };
  const srcBr = brMarker ? { x: brMarker.detectedX, y: brMarker.detectedY } : { x: bounds.left + bounds.width, y: bounds.top + bounds.height };
  const srcBl = blMarker ? { x: blMarker.detectedX, y: blMarker.detectedY } : { x: bounds.left, y: bounds.top + bounds.height };
  const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcTl.x, srcTl.y,
    srcTr.x, srcTr.y,
    srcBr.x, srcBr.y,
    srcBl.x, srcBl.y,
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
 * Release the cached rectified-sheet OpenCV mat used for lazy frame extraction.
 *
 * @returns {void}
 */
function releaseRectifiedCvCache() {
  if (state.geometry.baseRectifiedMat) {
    state.geometry.baseRectifiedMat.delete();
    state.geometry.baseRectifiedMat = null;
  }
  if (state.geometry.baseRectifiedGrayMat) {
    state.geometry.baseRectifiedGrayMat.delete();
    state.geometry.baseRectifiedGrayMat = null;
  }
}

/**
 * Invalidate the post-extraction stabilization solve and any derived frame caches.
 *
 * @returns {void}
 */
function invalidateStabilizationCache() {
  state.frames.stabilizedCache.clear();
  state.frames.stabilizationMatchData = null;
  state.frames.stabilizationPairwise = null;
  state.frames.stabilizationAverageReference = null;
  state.frames.stabilizationOffsets = null;
  state.frames.adjustedCache.clear();
}

/**
 * Invalidate stabilized/adjusted frame outputs while keeping the solved pairwise offsets cached.
 *
 * This is used for stabilization-strength scrubbing because the solve does not change, only the
 * applied blend amount does.
 *
 * @returns {void}
 */
function invalidateStabilizedOutputCaches() {
  state.frames.stabilizedCache.clear();
  state.frames.adjustedCache.clear();
}

/**
 * Invalidate only the solved stabilization offsets plus derived frame outputs, while keeping the
 * measured pairwise shifts cached. This is used when lambda changes because the solve changes but
 * the underlying adjacent-frame measurements do not.
 *
 * @returns {void}
 */
function invalidateStabilizationOffsetsCache() {
  state.frames.stabilizationOffsets = null;
  state.frames.stabilizedCache.clear();
  state.frames.adjustedCache.clear();
}

/**
 * Invalidate lazily extracted base frames and any adjusted-frame cache derived from them.
 *
 * @returns {void}
 */
function invalidateFrameCaches() {
  state.frames.base = new Array(state.geometry.frameCount);
  state.frames.stabilizedCache.clear();
  state.frames.stabilizationMatchData = null;
  state.frames.stabilizationPairwise = null;
  state.frames.stabilizationAverageReference = null;
  state.frames.stabilizationOffsets = null;
  state.frames.adjustedCache.clear();
}

/**
 * Invalidate only the currently displayed frame so markerless phase dragging stays responsive.
 *
 * The current stabilization solve is kept during drag. Full frame/stabilization invalidation still
 * happens on slider release so playback and export catch up across the whole sequence.
 *
 * @returns {void}
 */
function invalidateCurrentPreviewFrameCaches() {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 0) return;
  const index = getCurrentDisplayedFrameSourceIndex();
  if (index < 0 || index >= frameCount) return;
  state.frames.base[index] = undefined;
  state.frames.stabilizedCache.delete(index);
  state.frames.adjustedCache.delete(index);
}

/**
 * Invalidate only the currently displayed stabilized/adjusted frame so stabilization-strength
 * dragging can feel responsive without recomputing the global shift solve.
 *
 * @returns {void}
 */
function invalidateCurrentPreviewStabilizationCaches() {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 0) return;
  const index = getCurrentDisplayedFrameSourceIndex();
  if (index < 0 || index >= frameCount) return;
  state.frames.stabilizedCache.delete(index);
  state.frames.adjustedCache.delete(index);
}

/**
 * Invalidate only the currently displayed frame if it is one of the cells touched by an edited
 * corner marker. This keeps markerless corner dragging responsive by avoiding a full
 * stabilization/cache rebuild on every pointermove.
 *
 * @param {number} markerCol
 * @param {number} markerRow
 * @returns {void}
 */
function invalidateCurrentPreviewFrameForMarker(markerCol, markerRow) {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 0) return;
  const index = getCurrentDisplayedFrameSourceIndex();
  if (index < 0 || index >= frameCount) return;
  const affected = getAffectedFrameIndicesForMarker(markerCol, markerRow);
  if (!affected.includes(index)) return;
  state.frames.base[index] = undefined;
  state.frames.stabilizedCache.delete(index);
  state.frames.adjustedCache.delete(index);
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
  state.frames.stabilizedCache.clear();
  state.frames.stabilizationMatchData = null;
  state.frames.stabilizationAverageReference = null;
  state.frames.stabilizationOffsets = null;
  state.frames.stabilizationPairwise = null;
  state.frames.adjustedCache.clear();
  for (const index of getAffectedFrameIndicesForMarker(markerCol, markerRow)) {
    state.frames.base[index] = undefined;
  }
}

/**
 * Invalidate only the frame outputs touched by one markerless post-stabilization corner nudge.
 *
 * The stabilization solve stays valid because markerless corner overrides are applied after that
 * solve, at extraction/display time only.
 *
 * @param {number} markerCol
 * @param {number} markerRow
 * @returns {void}
 */
function invalidateMarkerlessNudgedFramesForMarker(markerCol, markerRow) {
  for (const index of getAffectedFrameIndicesForMarker(markerCol, markerRow)) {
    state.frames.base[index] = undefined;
    state.frames.stabilizedCache.delete(index);
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
  if (!state.geometry.baseRectifiedCanvas) return;
  state.preview.rectifiedCanvas = state.geometry.baseRectifiedCanvas;
  state.preview.rectifiedDiagnosticSourceCanvas = null;
  state.preview.rectifiedDiagnosticDirty = true;
  primeRectifiedDragAsset(state.preview.rectifiedCanvas);
  renderRectifiedPreview(state.preview.rectifiedCanvas);
}

/**
 * Extract one frame from the cached rectified sheet, optionally shifting the source quad before
 * post-crop output transforms are applied. Stabilization uses this path so corrected pixels can
 * come from neighboring sheet content instead of duplicating the already-extracted frame edges.
 *
 * Markerless extraction stacks several source-space adjustments in a fixed order:
 * 1. autocorrelation baseline from the pipeline
 * 2. manual phase offsets (`Horizontal/Vertical Phase Offset`)
 * 3. optional animation-wide vertical drift compensation
 * 4. optional per-frame stabilization translation
 * 5. optional post-stabilization per-corner nudges from Frame Corners overrides
 *
 * Keeping these layers explicit is important because only some of them are allowed to feed back
 * into the stabilization solve. In particular, manual Frame Corners overrides are intentionally
 * post-stabilization nudges in markerless mode.
 *
 * @param {number} index
 * @param {{x:number,y:number}} [sourceOffset={x:0,y:0}]
 * @returns {HTMLCanvasElement | null}
 */
function extractProcessedFrameCanvas(index, sourceOffset = { x: 0, y: 0 }, includeMarkerlessNudges = true, includeMarkerlessDriftCompensation = true) {
  const extractionContext = getFrameExtractionContext(index, includeMarkerlessNudges);
  if (!extractionContext) return null;
  const { config, col, row, alignmentInfo, rectifiedMat } = extractionContext;
  const automaticOffset = getAutomaticMarkerlessSourceOffset(
    config,
    alignmentInfo,
    index,
    includeMarkerlessDriftCompensation
  );
  const frame = extractSingleFrameToCanvas(
    rectifiedMat,
    alignmentInfo,
    col,
    row,
    config.crop,
    getCvInterpolationFlag(config.exportOptions.resampling),
    combineSourceOffsets(automaticOffset, sourceOffset)
  );
  const transformedFrame = transformOutputCanvas(frame, config.postCropGeometry);
  return scaleOutputCanvas(
    transformedFrame,
    getInteractiveOutputWidth(config.exportOptions.outputWidthPx),
    config.exportOptions.resampling
  );
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
  // Extraction stays lazy: pull just this frame from the rectified sheet, then apply post-crop
  // output scaling without forcing the whole animation to be rebuilt.
  const scaledFrame = extractProcessedFrameCanvas(index);
  state.frames.base[index] = scaledFrame;
  return scaledFrame;
}

/**
 * Extract one frame for the stabilization solver, explicitly excluding markerless post-stabilization
 * corner nudges so the solve operates on the underlying automatic extraction.
 *
 * @param {number} index
 * @returns {HTMLCanvasElement | null}
 */
function getStabilizationSourceFrameCanvas(index) {
  return extractProcessedFrameCanvas(index, { x: 0, y: 0 }, false, false);
}

/**
 * Ensure the base rectified-sheet OpenCV mat exists.
 *
 * @returns {cv.Mat | null}
 */
function ensureBaseRectifiedMat() {
  if (!state.geometry.baseRectifiedCanvas) return null;
  if (!state.geometry.baseRectifiedMat) {
    state.geometry.baseRectifiedMat = cv.imread(state.geometry.baseRectifiedCanvas);
  }
  return state.geometry.baseRectifiedMat;
}

/**
 * Resolve the per-frame grid coordinates used by extraction.
 *
 * @param {number} index
 * @param {object} alignmentInfo
 * @returns {{col:number,row:number}}
 */
function getFrameGridCoords(index, alignmentInfo) {
  const cols = alignmentInfo.cols;
  return {
    col: index % cols,
    row: Math.floor(index / cols),
  };
}

/**
 * Return the alignment lattice view used for one extracted frame.
 *
 * Markerless manual overrides are applied by swapping in a lightweight frame-specific view of the
 * four surrounding corners. Marker mode continues to use the shared alignment lattice.
 *
 * @param {ReturnType<typeof readConfig>} config
 * @param {object} alignmentInfo
 * @param {number} col
 * @param {number} row
 * @param {boolean} includeMarkerlessNudges
 * @returns {object}
 */
function getFrameExtractionAlignmentInfo(config, alignmentInfo, col, row, includeMarkerlessNudges) {
  if (config.alignmentPipeline === "markerless" && includeMarkerlessNudges) {
    return buildMarkerlessExtractionInfoForFrame(alignmentInfo, col, row);
  }
  return alignmentInfo;
}

/**
 * Gather the static extraction context for one frame.
 *
 * @param {number} index
 * @param {boolean} includeMarkerlessNudges
 * @returns {{config: ReturnType<typeof readConfig>, col:number, row:number, alignmentInfo:object, rectifiedMat:cv.Mat} | null}
 */
function getFrameExtractionContext(index, includeMarkerlessNudges) {
  const alignmentInfo = state.geometry.alignmentInfo;
  const rectifiedMat = ensureBaseRectifiedMat();
  if (!alignmentInfo || !rectifiedMat) return null;
  const config = readConfig();
  const { col, row } = getFrameGridCoords(index, alignmentInfo);
  return {
    config,
    col,
    row,
    alignmentInfo: getFrameExtractionAlignmentInfo(config, alignmentInfo, col, row, includeMarkerlessNudges),
    rectifiedMat,
  };
}

/**
 * Collect the frame canvases used by the stabilization matcher.
 *
 * @returns {HTMLCanvasElement[] | null}
 */
function collectStabilizationSourceFrames() {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 1) return null;
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const frame = getStabilizationSourceFrameCanvas(i);
    if (!frame) return null;
    frames.push(frame);
  }
  return frames;
}

/**
 * Build or reuse sampled grayscale match data for every pre-stabilization frame.
 *
 * Both stabilization methods use the same sampled/periphery-weighted matcher, so this shared cache
 * avoids rebuilding the reduced luma representation separately for pairwise and average-reference
 * experiments.
 *
 * @returns {{data:Float32Array,weights:Float32Array,width:number,height:number}[] | null}
 */
function getStabilizationMatchDataFrames() {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 1) return null;
  if (state.frames.stabilizationMatchData?.length === frameCount) {
    return state.frames.stabilizationMatchData;
  }
  const frames = collectStabilizationSourceFrames();
  if (!frames) return null;
  const matchData = frames.map((frame) => getFrameMatchData(frame));
  state.frames.stabilizationMatchData = matchData;
  return matchData;
}

/**
 * Build one weighted stabilization edge between two frame indices.
 *
 * @param {Array<HTMLCanvasElement | {data:Float32Array,weights:Float32Array,width:number,height:number}>} frames
 * @param {number} from
 * @param {number} to
 * @param {"horizontal"|"rowBreak"|"vertical"|"seam"} kind
 * @returns {{from:number,to:number,dx:number,dy:number,kind:string,weight:number} | null}
 */
function buildStabilizationEdge(frames, from, to, kind) {
  if (from < 0 || to < 0 || from >= frames.length || to >= frames.length) return null;
  const shift = estimateLoopPairShift(frames[from], frames[to]);
  const edge = {
    from,
    to,
    dx: shift.dx,
    dy: shift.dy,
    kind,
  };
  edge.weight = getStabilizationEdgeWeight(edge);
  return edge;
}

/**
 * Append all within-row horizontal stabilization edges.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {HTMLCanvasElement[]} frames
 * @param {number} cols
 * @param {number} rows
 * @returns {void}
 */
function appendHorizontalStabilizationEdges(edges, frames, cols, rows) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const from = row * cols + col;
      const to = from + 1;
      const edge = buildStabilizationEdge(frames, from, to, "horizontal");
      if (edge) edges.push(edge);
    }
  }
}

/**
 * Append end-of-row discontinuity stabilization edges.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {HTMLCanvasElement[]} frames
 * @param {number} cols
 * @param {number} rows
 * @returns {void}
 */
function appendRowBreakStabilizationEdges(edges, frames, cols, rows) {
  for (let row = 0; row < rows - 1; row++) {
    const from = (row * cols) + (cols - 1);
    const to = from + 1;
    const edge = buildStabilizationEdge(frames, from, to, "rowBreak");
    if (edge) edges.push(edge);
  }
}

/**
 * Append vertical stabilization edges between neighboring sheet rows.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {HTMLCanvasElement[]} frames
 * @param {number} cols
 * @param {number} rows
 * @returns {void}
 */
function appendVerticalStabilizationEdges(edges, frames, cols, rows) {
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const from = row * cols + col;
      const to = (row + 1) * cols + col;
      const edge = buildStabilizationEdge(frames, from, to, "vertical");
      if (edge) edges.push(edge);
    }
  }
}

/**
 * Append the weak loop-seam stabilization edge from the last frame back to the first.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {HTMLCanvasElement[]} frames
 * @returns {void}
 */
function appendSeamStabilizationEdge(edges, frames) {
  const edge = buildStabilizationEdge(frames, frames.length - 1, 0, "seam");
  if (edge) edges.push(edge);
}

/**
 * Build the full stabilization graph for the current frame set.
 *
 * @param {HTMLCanvasElement[]} frames
 * @returns {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]}
 */
function buildStabilizationGraph(frames) {
  const frameCount = frames.length;
  const alignmentInfo = state.geometry.alignmentInfo;
  const cols = Math.max(1, alignmentInfo?.cols || 1);
  const rows = Math.max(1, alignmentInfo?.rows || Math.ceil(frameCount / cols));
  const edges = [];
  appendHorizontalStabilizationEdges(edges, frames, cols, rows);
  // Row-break edges keep the solver aware of the scan order jump between the end of one printed
  // row and the start of the next, but they stay weak enough not to dominate the sheet topology.
  appendRowBreakStabilizationEdges(edges, frames, cols, rows);
  appendVerticalStabilizationEdges(edges, frames, cols, rows);
  if (frameCount > 1) {
    appendSeamStabilizationEdge(edges, frames);
  }
  return edges;
}

/**
 * Build or reuse the average-frame grayscale reference used by the alternate stabilization method.
 *
 * The reference is the pixelwise mean of all pre-stabilization sampled frames. It intentionally
 * does not use any stabilized output, so the average template never feeds back on prior results.
 *
 * @returns {{data:Float32Array,weights:Float32Array,width:number,height:number} | null}
 */
function getAverageReferenceMatchData() {
  const matchFrames = getStabilizationMatchDataFrames();
  if (!matchFrames?.length) return null;
  if (state.frames.stabilizationAverageReference) {
    return state.frames.stabilizationAverageReference;
  }

  const first = matchFrames[0];
  const averageData = new Float32Array(first.data.length);
  // Build the template from the sampled grayscale match data so this alternate method shares the
  // same downsampling and periphery weighting as the pairwise matcher.
  for (const frame of matchFrames) {
    for (let i = 0; i < averageData.length; i++) {
      averageData[i] += frame.data[i];
    }
  }
  const divisor = matchFrames.length;
  for (let i = 0; i < averageData.length; i++) {
    averageData[i] /= divisor;
  }

  const reference = {
    data: averageData,
    weights: first.weights,
    width: first.width,
    height: first.height,
  };
  state.frames.stabilizationAverageReference = reference;
  return reference;
}

/**
 * Measure and cache the pairwise stabilization graph for the current frame set.
 *
 * This is the expensive part of markerless stabilization. It is separated from the final solve so
 * the measurements can be warmed in the background before the user first raises Stabilization
 * Strength above zero.
 *
 * The graph intentionally follows sheet topology rather than pure timeline order:
 * - horizontal edges within each printed row
 * - row-break edges between the end of one row and the start of the next
 * - vertical edges between rows
 * - one weak loop seam from the last frame back to the first
 *
 * That gives the solver access to the printed 2D layout, which is often a better prior for riso
 * sheets than treating the animation as a simple 1D chain.
 *
 * @returns {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[] | null}
 */
function getStabilizationPairwiseMeasurements() {
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 1) return null;
  if (state.frames.stabilizationPairwise?.length) {
    return state.frames.stabilizationPairwise;
  }

  const frames = getStabilizationMatchDataFrames();
  if (!frames) return null;
  const edges = buildStabilizationGraph(frames);
  state.frames.stabilizationPairwise = edges;
  return edges;
}

/**
 * Convert one stabilization edge set into the scalar graph expected by the least-squares solver.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {"x"|"y"} axis
 * @returns {{from:number,to:number,delta:number,weight:number}[]}
 */
function projectStabilizationEdgesForAxis(edges, axis) {
  const key = axis === "x" ? "dx" : "dy";
  return edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    delta: edge[key],
    weight: edge.weight,
  }));
}

/**
 * Return the stabilization translation caps derived from one sample extracted frame.
 *
 * @param {HTMLCanvasElement} sampleFrame
 * @returns {{capX:number, capY:number}}
 */
function getStabilizationOffsetCaps(sampleFrame) {
  return {
    capX: sampleFrame.width * 0.10,
    capY: sampleFrame.height * 0.10,
  };
}

/**
 * Solve one per-frame x/y stabilization offset field from the weighted graph measurements.
 *
 * @param {{from:number,to:number,dx:number,dy:number,kind:string,weight:number}[]} edges
 * @param {number} frameCount
 * @returns {{x:number, y:number}[]}
 */
function solveStabilizationOffsetField(edges, frameCount) {
  const solvedX = solveGraphOffsets(projectStabilizationEdgesForAxis(edges, "x"), frameCount);
  const solvedY = solveGraphOffsets(projectStabilizationEdgesForAxis(edges, "y"), frameCount);
  return solvedX.map((x, index) => ({ x, y: solvedY[index] }));
}

/**
 * Return the post-extraction stabilization offsets for the current frame set.
 *
 * This solves for translation-only per-frame offsets over a small sheet-topology graph:
 * within-row horizontal neighbors, above/below vertical neighbors, and one weak loop-seam edge.
 * The solution is regularized toward zero and then centered so the average offset stays near zero.
 *
 * @returns {{x:number, y:number}[] | null}
 */
function getStabilizationOffsets() {
  const strength = readConfig().stabilizationStrength;
  if (strength <= 0) return null;
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 1) return null;
  if (state.frames.stabilizationOffsets?.length === frameCount) {
    return state.frames.stabilizationOffsets;
  }
  const sampleFrame = getStabilizationSourceFrameCanvas(0);
  if (!sampleFrame) return null;
  const method = readConfig().stabilizationMethod;
  let offsets = null;
  if (method === "difference-from-average") {
    // The alternate method aligns every frame independently against one shared blurry template
    // instead of solving a coupled graph over neighbor-to-neighbor comparisons.
    const reference = getAverageReferenceMatchData();
    const matchFrames = getStabilizationMatchDataFrames();
    if (!reference || !matchFrames?.length) return null;
    offsets = matchFrames.map((frame) => {
      const shift = estimateLoopPairShift(reference, frame);
      return { x: shift.dx, y: shift.dy };
    });
    centerOffsetsAroundZero(offsets);
  } else {
    // The default method keeps the weighted sheet-topology graph and solves one global offset
    // field, which lets neighboring frames share evidence and regularization.
    const edges = getStabilizationPairwiseMeasurements();
    if (!edges?.length) return null;
    offsets = solveStabilizationOffsetField(edges, frameCount);
  }
  const { capX, capY } = getStabilizationOffsetCaps(sampleFrame);
  clampOffsetsInPlace(offsets, capX, capY);
  centerOffsetsAroundZero(offsets);
  state.frames.stabilizationOffsets = offsets;
  return offsets;
}

/**
 * Warm the expensive markerless stabilization measurements after processing so the first
 * stabilization-strength drag does not have to pay the full startup cost.
 *
 * @param {number} requestId
 * @returns {void}
 */
function scheduleMarkerlessStabilizationWarmup(requestId) {
  window.setTimeout(() => {
    if (requestId !== state.processing.requestId) return;
    scheduleCurrentStabilizationWarmup();
  }, 0);
}

/**
 * Warm whichever markerless stabilization method is currently selected without forcing a full solve.
 *
 * This avoids the first stabilization-strength movement from zero having to build all matcher state
 * synchronously on the slider path.
 *
 * @returns {void}
 */
function scheduleCurrentStabilizationWarmup() {
  window.setTimeout(() => {
    if (readConfig().alignmentPipeline !== "markerless") return;
    if (state.processing.active) return;
    try {
      if (readConfig().stabilizationMethod === "difference-from-average") {
        getAverageReferenceMatchData();
      } else if (!state.frames.stabilizationPairwise?.length) {
        getStabilizationPairwiseMeasurements();
      }
    } catch (error) {
      console.error(error);
    }
  }, 0);
}

/**
 * Format the measured pairwise stabilization shifts for the Status panel.
 *
 * @returns {string}
 */
function getStabilizationDebugText() {
  const strength = readConfig().stabilizationStrength;
  if (strength <= 0) return "";
  const edges = state.frames.stabilizationPairwise;
  if (!edges?.length) return "";
  const lines = ["", "Stabilization shifts:"];
  for (const edge of edges) {
    const label =
      edge.kind === "vertical"
        ? "Vertical"
        : edge.kind === "horizontal"
          ? "Horizontal"
          : edge.kind === "rowBreak"
            ? "Row break"
          : "Seam";
    lines.push(`${label} ${edge.from}-${edge.to} dx,dy: ${edge.dx},${edge.dy} w:${edge.weight.toFixed(2)}`);
  }
  return lines.join("\n");
}

/**
 * Return one stabilized base frame canvas when stabilization is enabled.
 *
 * @param {number} index
 * @returns {HTMLCanvasElement | null}
 */
function getStabilizedFrameCanvas(index) {
  const baseFrame = getBaseFrameCanvas(index);
  if (!baseFrame) return null;
  const strength = readConfig().stabilizationStrength;
  const isMarkerless = readConfig().alignmentPipeline === "markerless";
  if (strength <= 0 && !isMarkerless) return baseFrame;
  if (state.frames.stabilizedCache.has(index)) return state.frames.stabilizedCache.get(index);

  if (strength <= 0) {
    // Keep markerless preview continuous at exactly 0% strength by using the same extraction path
    // as the stabilized branch, just with a zero translation. Otherwise 0% can jump to the older
    // precomputed pipeline frame instead of smoothly converging to the same result.
    const unstabilized = extractProcessedFrameCanvas(index, { x: 0, y: 0 });
    if (!unstabilized) return baseFrame;
    state.frames.stabilizedCache.set(index, unstabilized);
    return unstabilized;
  }

  const offsets = getStabilizationOffsets();
  if (!offsets || !offsets[index]) return baseFrame;
  const strengthScale = strength / 100;
  const stabilized = extractProcessedFrameCanvas(index, {
    x: offsets[index].x * strengthScale,
    y: offsets[index].y * strengthScale,
  });
  if (!stabilized) return baseFrame;
  state.frames.stabilizedCache.set(index, stabilized);
  return stabilized;
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
 * During markerless phase scrubbing, render only enough resolution for the live Preview panel.
 * Full output resolution is restored on slider release when caches are invalidated normally.
 *
 * @param {number} outputWidthPx
 * @returns {number}
 */
function getInteractiveOutputWidth(outputWidthPx) {
  if (!state.preview.markerlessPhaseScrubbing) {
    return outputWidthPx;
  }
  const previewWidth = Math.max(
    1,
    Math.round(
      dom.gifPreviewCanvas.width ||
      dom.gifPreviewCanvas.clientWidth ||
      outputWidthPx ||
      1
    )
  );
  if (!outputWidthPx || outputWidthPx <= 0) {
    return previewWidth;
  }
  return Math.min(outputWidthPx, previewWidth);
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
  const baseFrame = getStabilizedFrameCanvas(index);
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
 * Estimate the best translation to align the second frame to the first using a 21x21 search over
 * cumulative absolute pixel differences in luma space.
 *
 * The search is performed on sampled grayscale frames, not full-resolution exports, and the score
 * is perimeter-weighted so relatively static border content influences the match more than the
 * animated center of the frame.
 *
 * @param {HTMLCanvasElement | {data:Float32Array,weights:Float32Array,width:number,height:number}} currentFrame
 * @param {HTMLCanvasElement | {data:Float32Array,weights:Float32Array,width:number,height:number}} nextFrame
 * @returns {{dx:number, dy:number}}
 */
function estimateLoopPairShift(currentFrame, nextFrame) {
  const currentData = currentFrame?.data instanceof Float32Array ? currentFrame : getFrameMatchData(currentFrame);
  const nextData = nextFrame?.data instanceof Float32Array ? nextFrame : getFrameMatchData(nextFrame);
  const maxShiftX = Math.min(10, Math.floor(currentData.width / 2));
  const maxShiftY = Math.min(10, Math.floor(currentData.height / 2));
  let bestDx = 0;
  let bestDy = 0;
  let bestScore = Infinity;

  for (let dy = -maxShiftY; dy <= maxShiftY; dy++) {
    for (let dx = -maxShiftX; dx <= maxShiftX; dx++) {
      const score = computeShiftDifferenceScore(currentData, nextData, currentData.width, currentData.height, dx, dy);
      if (score < bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  return { dx: bestDx, dy: bestDy };
}

/**
 * Convert a frame canvas into sampled grayscale luma for pairwise stabilization matching.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{data:Float32Array, weights:Float32Array, width:number, height:number}}
 */
function getFrameMatchData(canvas) {
  const sampleStep = Math.max(1, Math.ceil(Math.sqrt((canvas.width * canvas.height) / 60000)));
  const sampleWidth = Math.max(1, Math.floor(canvas.width / sampleStep));
  const sampleHeight = Math.max(1, Math.floor(canvas.height / sampleStep));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext("2d");
  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const luma = new Float32Array(sampleWidth * sampleHeight);
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    luma[j] = (0.299 * imageData[i]) + (0.587 * imageData[i + 1]) + (0.114 * imageData[i + 2]);
  }
  return {
    data: luma,
    weights: getFrameMatchWeights(sampleWidth, sampleHeight),
    width: sampleWidth,
    height: sampleHeight,
  };
}

/**
 * Build or reuse a cached radial weight field that emphasizes the frame perimeter over the center.
 *
 * Each sampled pixel receives a weight proportional to its distance from the frame center,
 * normalized by half the smaller frame dimension and clamped to `[0, 1]`.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array}
 */
function getFrameMatchWeights(width, height) {
  const key = `${width}x${height}`;
  const cached = FRAME_MATCH_WEIGHT_CACHE.get(key);
  if (cached) return cached;

  const weights = new Float32Array(width * height);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const radius = Math.max(1e-6, Math.min(width, height) * 0.5);

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dist = Math.sqrt((dx * dx) + (dy * dy));
      weights[(y * width) + x] = Math.max(0, Math.min(1, dist / radius));
    }
  }

  FRAME_MATCH_WEIGHT_CACHE.set(key, weights);
  return weights;
}

/**
 * Score one integer translation between two luma frames using average absolute difference on the
 * overlapping region only.
 *
 * @param {{data:Float32Array,weights:Float32Array,width:number,height:number}} frameA
 * @param {{data:Float32Array,weights:Float32Array,width:number,height:number}} frameB
 * @param {number} width
 * @param {number} height
 * @param {number} dx
 * @param {number} dy
 * @returns {number}
 */
function computeShiftDifferenceScore(frameA, frameB, width, height, dx, dy) {
  const overlapX0 = Math.max(0, -dx);
  const overlapY0 = Math.max(0, -dy);
  const overlapX1 = Math.min(width, width - dx);
  const overlapY1 = Math.min(height, height - dy);
  if (overlapX1 <= overlapX0 || overlapY1 <= overlapY0) return Infinity;

  let diffSum = 0;
  let normSum = 0;
  for (let y = overlapY0; y < overlapY1; y++) {
    const rowA = y * width;
    const rowB = (y + dy) * width;
    for (let x = overlapX0; x < overlapX1; x++) {
      const indexA = rowA + x;
      const indexB = rowB + x + dx;
      const weight = 0.5 * (frameA.weights[indexA] + frameB.weights[indexB]);
      diffSum += Math.abs(frameA.data[indexA] - frameB.data[indexB]) * weight;
      normSum += weight;
    }
  }
  return diffSum / Math.max(1e-6, normSum);
}

/**
 * Solve per-frame offsets from a general graph of pairwise displacement constraints with an L2
 * penalty on the absolute offsets.
 *
 * Each edge contributes a constraint of the form:
 * `p[to] - p[from] ~= delta`
 * and the regularized normal equations keep the absolute offsets modest overall.
 *
 * @param {{from:number,to:number,delta:number,weight?:number}[]} edges
 * @param {number} count
 * @returns {number[]}
 */
function solveGraphOffsets(edges, count) {
  if (!count || !edges.length) return new Array(count).fill(0);
  const lambda = Math.max(0, readConfig().stabilizationLambda);
  const matrix = Array.from({ length: count }, () => new Array(count).fill(0));
  const rhs = new Array(count).fill(0);

  for (const edge of edges) {
    const from = edge.from;
    const to = edge.to;
    const delta = edge.delta;
    const weight = Math.max(0, Number(edge.weight) || 0);
    if (weight <= 0) continue;
    matrix[from][from] += weight;
    matrix[to][to] += weight;
    matrix[from][to] -= weight;
    matrix[to][from] -= weight;
    rhs[from] -= weight * delta;
    rhs[to] += weight * delta;
  }

  for (let i = 0; i < count; i++) {
    matrix[i][i] += lambda;
  }

  const solved = solveLinearSystem(matrix, rhs);
  if (!solved) {
    return new Array(count).fill(0);
  }
  const mean = solved.reduce((sum, value) => sum + value, 0) / count;
  return solved.map((value) => value - mean);
}

/**
 * Downweight suspicious stabilization matches so row seams and boundary-saturated searches do not
 * dominate the solve.
 *
 * The weights intentionally encode qualitative trust, not strict probabilities:
 * - horizontal within-row comparisons are trusted most
 * - vertical comparisons are helpful but weaker
 * - row breaks and the loop seam are retained at low weight because they are often contaminated
 *   by discontinuities in the artwork or by end-of-row extraction bias
 *
 * @param {{kind:string,dx:number,dy:number}} edge
 * @returns {number}
 */
function getStabilizationEdgeWeight(edge) {
  let weight = 1;
  if (edge.kind === "horizontal") weight = 1.0;
  else if (edge.kind === "vertical") weight = 0.6;
  else if (edge.kind === "rowBreak" || edge.kind === "seam") {
    weight = 0.1;
  }

  const maxAbs = Math.max(Math.abs(edge.dx), Math.abs(edge.dy));
  if (maxAbs >= 10) {
    weight *= 0.2;
  } else if (maxAbs >= 9) {
    weight *= 0.35;
  } else if (maxAbs >= 8) {
    weight *= 0.55;
  }
  return weight;
}

/**
 * Solve a dense linear system with Gaussian elimination and partial pivoting.
 *
 * The stabilization system is tiny (one unknown per frame), so a simple dense solver is
 * sufficient and keeps the implementation dependency-free.
 *
 * @param {number[][]} matrix
 * @param {number[]} rhs
 * @returns {number[] | null}
 */
function solveLinearSystem(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, rowIndex) => [...row, rhs[rowIndex]]);

  for (let pivot = 0; pivot < n; pivot++) {
    let bestRow = pivot;
    let bestValue = Math.abs(a[pivot][pivot]);
    for (let row = pivot + 1; row < n; row++) {
      const value = Math.abs(a[row][pivot]);
      if (value > bestValue) {
        bestValue = value;
        bestRow = row;
      }
    }
    if (bestValue < 1e-9) {
      return null;
    }
    if (bestRow !== pivot) {
      const temp = a[pivot];
      a[pivot] = a[bestRow];
      a[bestRow] = temp;
    }

    const pivotValue = a[pivot][pivot];
    for (let col = pivot; col <= n; col++) {
      a[pivot][col] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      if (Math.abs(factor) < 1e-12) continue;
      for (let col = pivot; col <= n; col++) {
        a[row][col] -= factor * a[pivot][col];
      }
    }
  }

  return a.map((row) => row[n]);
}

/**
 * Clamp solved offsets to the allowed translation limits while preserving their overall structure.
 *
 * @param {{x:number,y:number}[]} offsets
 * @param {number} capX
 * @param {number} capY
 * @returns {void}
 */
function clampOffsetsInPlace(offsets, capX, capY) {
  const maxAbsX = Math.max(...offsets.map((offset) => Math.abs(offset.x)), 0);
  const maxAbsY = Math.max(...offsets.map((offset) => Math.abs(offset.y)), 0);
  const scaleX = maxAbsX > capX && maxAbsX > 1e-6 ? (capX / maxAbsX) : 1;
  const scaleY = maxAbsY > capY && maxAbsY > 1e-6 ? (capY / maxAbsY) : 1;
  for (const offset of offsets) {
    offset.x *= scaleX;
    offset.y *= scaleY;
  }
}

/**
 * Keep the average correction near zero after any clamping/scaling step.
 *
 * @param {{x:number,y:number}[]} offsets
 * @returns {void}
 */
function centerOffsetsAroundZero(offsets) {
  if (!offsets.length) return;
  const meanX = offsets.reduce((sum, offset) => sum + offset.x, 0) / offsets.length;
  const meanY = offsets.reduce((sum, offset) => sum + offset.y, 0) / offsets.length;
  for (const offset of offsets) {
    offset.x -= meanX;
    offset.y -= meanY;
  }
}

/**
 * Convert the markerless manual phase sliders into a source-quad offset in rectified-sheet
 * pixels. The autocorrelation estimate remains the baseline; these sliders shift extraction
 * relative to that baseline by up to half a nominal frame cell in each direction.
 *
 * @param {ReturnType<typeof readConfig>} config
 * @param {object | null} alignmentInfo
 * @returns {{x:number,y:number}}
 */
function getMarkerlessPhaseSourceOffset(config, alignmentInfo) {
  if (!alignmentInfo || config.alignmentPipeline !== "markerless") {
    return { x: 0, y: 0 };
  }
  const cellWidth = alignmentInfo.gridBounds.width / Math.max(1, alignmentInfo.cols);
  const cellHeight = alignmentInfo.gridBounds.height / Math.max(1, alignmentInfo.rows);
  return {
    x: cellWidth * (config.markerlessPhaseX || 0),
    y: cellHeight * (config.markerlessPhaseY || 0),
  };
}

/**
 * Add two source-space extraction offsets together.
 *
 * @param {{x:number,y:number}} baseOffset
 * @param {{x:number,y:number}} extraOffset
 * @returns {{x:number,y:number}}
 */
function combineSourceOffsets(baseOffset, extraOffset) {
  return {
    x: (Number(baseOffset?.x) || 0) + (Number(extraOffset?.x) || 0),
    y: (Number(baseOffset?.y) || 0) + (Number(extraOffset?.y) || 0),
  };
}

/**
 * Convert the markerless vertical drift-compensation slider into a frame-distributed vertical source offset.
 *
 * This is a post-stabilization extraction nudge intended to counter vertical drift. The slider
 * value represents the total compensation over the full animation, measured as a fraction of one
 * frame height. That total is distributed evenly from the first frame to the last frame.
 *
 * @param {ReturnType<typeof readConfig>} config
 * @param {object | null} alignmentInfo
 * @param {number} frameIndex
 * @returns {{x:number,y:number}}
 */
function getMarkerlessVerticalDriftSourceOffset(config, alignmentInfo, frameIndex) {
  if (!alignmentInfo || config.alignmentPipeline !== "markerless") {
    return { x: 0, y: 0 };
  }
  const cellHeight = alignmentInfo.gridBounds.height / Math.max(1, alignmentInfo.rows);
  const totalDrift = cellHeight * (config.verticalDriftCompensation || 0);
  const frameCount = Math.max(1, alignmentInfo.rows * alignmentInfo.cols);
  const frameDenominator = Math.max(1, frameCount - 1);
  const frameFactor = frameIndex / frameDenominator;
  return {
    x: 0,
    y: totalDrift * frameFactor,
  };
}

/**
 * Return the automatic markerless extraction offset before any explicit caller-supplied shift.
 *
 * This combines the autocorrelation-based phase offset with optional drift compensation. Frame-
 * specific stabilization is supplied separately by the caller so that different extraction paths
 * can opt in or out without duplicating the automatic baseline logic.
 *
 * @param {ReturnType<typeof readConfig>} config
 * @param {object | null} alignmentInfo
 * @param {number} frameIndex
 * @param {boolean} includeDriftCompensation
 * @returns {{x:number,y:number}}
 */
function getAutomaticMarkerlessSourceOffset(config, alignmentInfo, frameIndex, includeDriftCompensation = true) {
  const phaseOffset = getMarkerlessPhaseSourceOffset(config, alignmentInfo);
  if (!includeDriftCompensation) {
    return phaseOffset;
  }
  const driftOffset = getMarkerlessVerticalDriftSourceOffset(config, alignmentInfo, frameIndex);
  return combineSourceOffsets(phaseOffset, driftOffset);
}

/**
 * Average the applied per-frame stabilization offsets for the frames sharing one markerless corner.
 *
 * Markerless stabilization is solved per frame, but the Frame Corners panel displays one tile per
 * shared corner location. Averaging the neighboring frame translations gives one practical display
 * position for that shared corner that matches the currently stabilized extraction regime.
 *
 * @param {number} col
 * @param {number} row
 * @param {object | null} alignmentInfo
 * @returns {{x:number,y:number}}
 */
function getMarkerlessCornerStabilizationOffset(col, row, alignmentInfo) {
  if (!alignmentInfo || readConfig().alignmentPipeline !== "markerless") {
    return { x: 0, y: 0 };
  }
  const offsets = getStabilizationOffsets();
  const strengthScale = readConfig().stabilizationStrength / 100;
  if (!offsets?.length || strengthScale <= 0) {
    return { x: 0, y: 0 };
  }
  const samples = [];
  const frameCoords = [
    { col: col - 1, row: row - 1 },
    { col, row: row - 1 },
    { col: col - 1, row },
    { col, row },
  ];
  for (const frame of frameCoords) {
    if (frame.col < 0 || frame.row < 0 || frame.col >= alignmentInfo.cols || frame.row >= alignmentInfo.rows) {
      continue;
    }
    const index = frame.row * alignmentInfo.cols + frame.col;
    const offset = offsets[index];
    if (!offset) continue;
    samples.push(offset);
  }
  if (!samples.length) {
    return { x: 0, y: 0 };
  }
  const meanX = samples.reduce((sum, offset) => sum + offset.x, 0) / samples.length;
  const meanY = samples.reduce((sum, offset) => sum + offset.y, 0) / samples.length;
  return {
    x: meanX * strengthScale,
    y: meanY * strengthScale,
  };
}

/**
 * Return the current per-frame stabilization translation applied during markerless extraction.
 *
 * @param {number} index
 * @returns {{x:number,y:number}}
 */
function getFrameStabilizationSourceOffset(index) {
  const offsets = getStabilizationOffsets();
  const strengthScale = readConfig().stabilizationStrength / 100;
  if (!offsets?.[index] || strengthScale <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: offsets[index].x * strengthScale,
    y: offsets[index].y * strengthScale,
  };
}

/**
 * Return the stored post-stabilization nudge for one markerless corner override.
 *
 * In markerless mode, manual overrides are interpreted as extraction/display-space deltas relative
 * to the automatically estimated corner position after phase and stabilization have been applied.
 *
 * @param {number} col
 * @param {number} row
 * @returns {{x:number,y:number}}
 */
function getMarkerlessCornerManualNudge(col, row) {
  if (readConfig().alignmentPipeline !== "markerless") {
    return { x: 0, y: 0 };
  }
  const override = state.geometry.manualMarkerOverrides.get(getMarkerKey(col, row));
  if (!override) return { x: 0, y: 0 };
  return {
    x: Number.isFinite(override.x) ? override.x : 0,
    y: Number.isFinite(override.y) ? override.y : 0,
  };
}

/**
 * Build the markerless display-space corner position shown in the Frame Corners panel.
 *
 * The displayed corner is not just the raw pipeline estimate. It is the current automatic corner
 * position after applying phase offsets and any solved stabilization, plus an optional stored
 * post-stabilization manual nudge.
 *
 * @param {object} sourceMarker
 * @param {number} col
 * @param {number} row
 * @param {object} alignmentInfo
 * @param {boolean} [includeManualNudge=true]
 * @returns {{x:number,y:number,roiCenterX:number,roiCenterY:number,detectedX:number,detectedY:number,autoDetectedX?:number,autoDetectedY?:number}}
 */
function getMarkerlessDisplayedCorner(sourceMarker, col, row, alignmentInfo, includeManualNudge = true) {
  const phaseOffset = getMarkerlessPhaseSourceOffset(readConfig(), alignmentInfo);
  const stabilizationOffset = getMarkerlessCornerStabilizationOffset(col, row, alignmentInfo);
  const manualNudge = includeManualNudge ? getMarkerlessCornerManualNudge(col, row) : { x: 0, y: 0 };
  const totalX = phaseOffset.x + stabilizationOffset.x + manualNudge.x;
  const totalY = phaseOffset.y + stabilizationOffset.y + manualNudge.y;
  return {
    x: sourceMarker.x + totalX,
    y: sourceMarker.y + totalY,
    roiCenterX: (Number.isFinite(sourceMarker.roiCenterX) ? sourceMarker.roiCenterX : sourceMarker.x) + totalX,
    roiCenterY: (Number.isFinite(sourceMarker.roiCenterY) ? sourceMarker.roiCenterY : sourceMarker.y) + totalY,
    detectedX: sourceMarker.detectedX + totalX,
    detectedY: sourceMarker.detectedY + totalY,
    autoDetectedX: Number.isFinite(sourceMarker.autoDetectedX) ? sourceMarker.autoDetectedX + totalX : undefined,
    autoDetectedY: Number.isFinite(sourceMarker.autoDetectedY) ? sourceMarker.autoDetectedY + totalY : undefined,
  };
}

/**
 * Build a lightweight frame-specific extraction view of markerless corner nudges.
 *
 * Markerless manual overrides are post-stabilization extraction nudges, so they should affect only
 * the four corners surrounding the extracted frame and should not feed back into the stabilization
 * solve or the shared alignment lattice.
 *
 * @param {object} alignmentInfo
 * @param {number} col
 * @param {number} row
 * @returns {object}
 */
function buildMarkerlessExtractionInfoForFrame(alignmentInfo, col, row) {
  const keys = [
    getMarkerKey(col, row),
    getMarkerKey(col + 1, row),
    getMarkerKey(col + 1, row + 1),
    getMarkerKey(col, row + 1),
  ];
  const markerLookup = new Map();
  for (const key of keys) {
    const marker = alignmentInfo.markerLookup.get(key);
    if (!marker) continue;
    const [markerCol, markerRow] = key.split(",").map(Number);
    const nudge = getMarkerlessCornerManualNudge(markerCol, markerRow);
    markerLookup.set(key, {
      ...marker,
      detectedX: marker.detectedX + nudge.x,
      detectedY: marker.detectedY + nudge.y,
    });
  }
  return {
    ...alignmentInfo,
    markerLookup,
  };
}

/**
 * Ensure a grayscale rectified-sheet mat is cached for markerless corner-tile rendering.
 *
 * @returns {cv.Mat | null}
 */
function ensureRectifiedGrayMat() {
  if (!state.geometry.baseRectifiedCanvas) return null;
  if (!state.geometry.baseRectifiedMat) {
    state.geometry.baseRectifiedMat = cv.imread(state.geometry.baseRectifiedCanvas);
  }
  if (!state.geometry.baseRectifiedGrayMat) {
    state.geometry.baseRectifiedGrayMat = new cv.Mat();
    cv.cvtColor(state.geometry.baseRectifiedMat, state.geometry.baseRectifiedGrayMat, cv.COLOR_RGBA2GRAY);
  }
  return state.geometry.baseRectifiedGrayMat;
}

/**
 * Build one grayscale diagnostic tile centered on a frame corner, padding with edge pixels when
 * the shifted markerless corner falls outside the rectified sheet.
 *
 * @param {cv.Mat} grayMat
 * @param {{x:number,y:number,col:number,row:number}} expected
 * @param {object} alignmentInfo
 * @param {number} crossRoiScale
 * @returns {object}
 */
function buildMarkerlessCornerTile(grayMat, expected, alignmentInfo, crossRoiScale) {
  const cellW = alignmentInfo.gridBounds.width / alignmentInfo.cols;
  const cellH = alignmentInfo.gridBounds.height / alignmentInfo.rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.18 * crossRoiScale));
  const side = Math.max(1, roiHalf * 2 + 1);
  const roi = new cv.Mat();
  const roiCenter = (side - 1) * 0.5;
  const tx = roiCenter - expected.x;
  const ty = roiCenter - expected.y;
  const affine = cv.matFromArray(2, 3, cv.CV_64F, [1, 0, tx, 0, 1, ty]);
  try {
    cv.warpAffine(grayMat, roi, affine, new cv.Size(side, side), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    const canvas = document.createElement("canvas");
    canvas.width = roi.cols;
    canvas.height = roi.rows;
    cv.imshow(canvas, roi);
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    return {
      ...expected,
      kind: "markerless",
      markerType: "markerless",
      roiCenterX: expected.x,
      roiCenterY: expected.y,
      detectedX: expected.x,
      detectedY: expected.y,
      dx: 0,
      dy: 0,
      darkFrac: 0,
      confidence: 1,
      accepted: true,
      localX: roiCenter,
      localY: roiCenter,
      canvas,
    };
  } finally {
    affine.delete();
    roi.delete();
  }
}

/**
 * Build a display-only alignment view for markerless mode that incorporates the current manual
 * phase offset while leaving the underlying stored marker coordinates unphased.
 *
 * @param {object | null} alignmentInfo
 * @returns {object | null}
 */
function getDisplayAlignmentInfo(alignmentInfo) {
  if (!alignmentInfo) return null;
  const config = readConfig();
  if (config.alignmentPipeline !== "markerless") {
    return alignmentInfo;
  }
  const grayMat = ensureRectifiedGrayMat();
  if (!grayMat) return alignmentInfo;
  const crossRoiScale = config.crossRoiScale;
  const markerLookup = new Map();
  const crossRoiTiles = [];

  for (let row = 0; row <= alignmentInfo.rows; row++) {
    for (let col = 0; col <= alignmentInfo.cols; col++) {
      const key = getMarkerKey(col, row);
      const sourceMarker = alignmentInfo.markerLookup.get(key);
      if (!sourceMarker) continue;
      const displayed = getMarkerlessDisplayedCorner(sourceMarker, col, row, alignmentInfo);
      const displayMarker = { ...sourceMarker, ...displayed };
      markerLookup.set(key, displayMarker);
      const tile = buildMarkerlessCornerTile(grayMat, {
        col,
        row,
        x: displayMarker.roiCenterX,
        y: displayMarker.roiCenterY,
      }, alignmentInfo, crossRoiScale);
      tile.detectedX = displayMarker.detectedX;
      tile.detectedY = displayMarker.detectedY;
      tile.autoDetectedX = displayMarker.autoDetectedX;
      tile.autoDetectedY = displayMarker.autoDetectedY;
      tile.manualOverride = state.geometry.manualMarkerOverrides.has(key);
      crossRoiTiles.push(tile);
    }
  }

  return {
    ...alignmentInfo,
    requestedMarkerType: "markerless",
    resolvedMarkerType: "markerless",
    markerLookup,
    crossRoiTiles,
    crossRoiTileMap: new Map(crossRoiTiles.map((tile) => [getMarkerKey(tile.col, tile.row), tile])),
  };
}

/**
 * Render the raw photo preview and overlay the detected page quad in lime.
 *
 * @returns {void}
 */
function renderRawPreview() {
  updateMobileRawAspectRatio();
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
  ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
  ctx.lineWidth = getPanelOverlayStrokeWidth(3);
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
  const displayAlignmentInfo = getDisplayAlignmentInfo(alignmentInfo);
  renderCrossRoiGridViaEditor({
    dom,
    state,
    alignmentInfo: displayAlignmentInfo,
    getMarkerKey,
    syncMarkerEditingUi,
    onApplyOverride: applyMarkerOverride,
    onRestoreOverride: restoreMarkerOverride,
  });
  syncMobileMarkerGridLayout();
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
  const roiCenterX = Number.isFinite(tile.roiCenterX) ? tile.roiCenterX : tile.x;
  const roiCenterY = Number.isFinite(tile.roiCenterY) ? tile.roiCenterY : tile.y;
  let detectedX = roiCenterX + (local.x - center);
  let detectedY = roiCenterY + (local.y - center);
  const config = readConfig();
  const isMarkerless = config.alignmentPipeline === "markerless";
  const key = getMarkerKey(tile.col, tile.row);
  if (isMarkerless && state.geometry.alignmentInfo) {
    const sourceMarker = state.geometry.alignmentInfo.markerLookup.get(key);
    if (sourceMarker) {
      const displayed = getMarkerlessDisplayedCorner(sourceMarker, tile.col, tile.row, state.geometry.alignmentInfo, false);
      state.geometry.manualMarkerOverrides.set(key, {
        x: detectedX - displayed.detectedX,
        y: detectedY - displayed.detectedY,
      });
    }
  } else {
    state.geometry.manualMarkerOverrides.set(key, { x: detectedX, y: detectedY });
  }
  state.preview.activeEditedMarker = finalize ? null : { col: tile.col, row: tile.row };
  if (state.geometry.alignmentInfo && !isMarkerless) {
    // Manual overrides patch the already-detected alignment object in place, which lets preview/extraction
    // update lazily from the edited marker positions without another CV pass.
    applyManualMarkerOverrides(state.geometry.alignmentInfo);
  }
  revokeGifUrl();
  if (!finalize) {
    if (isMarkerless) {
      beginMarkerOverrideScrub();
    } else {
      state.preview.markerOverrideScrubbing = true;
    }
  }
  if (isMarkerless && !finalize) {
    invalidateCurrentPreviewFrameForMarker(tile.col, tile.row);
  } else if (isMarkerless) {
    invalidateMarkerlessNudgedFramesForMarker(tile.col, tile.row);
  } else {
    invalidateFramesForMarker(tile.col, tile.row);
  }
  syncMarkerEditingUi();
  if (finalize) {
    if (isMarkerless) {
      endMarkerOverrideScrub();
    } else {
      state.preview.markerOverrideScrubbing = false;
    }
    renderCrossRoiGrid(state.geometry.alignmentInfo);
    scheduleStabilizationPreviewUpdate();
    return;
  }
  scheduleStabilizationPreviewUpdate();
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
  state.preview.activeEditedMarker = null;
  const isMarkerless = readConfig().alignmentPipeline === "markerless";
  if (state.geometry.alignmentInfo && !isMarkerless) {
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
  if (isMarkerless) {
    invalidateMarkerlessNudgedFramesForMarker(tile.col, tile.row);
  } else {
    invalidateFramesForMarker(tile.col, tile.row);
  }
  syncMarkerEditingUi();
  renderCrossRoiGrid(state.geometry.alignmentInfo);
  scheduleStabilizationPreviewUpdate();
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
 * Localized page-boundary failures should surface immediately even if the user had collapsed
 * Status, but only once an image is actually loaded.
 *
 * @param {string} text
 * @returns {void}
 */
function setStatus(text) {
  syncStatusText(dom, state, text);
  const hasLoadedImage = Boolean(state.source.filename || state.source.canvas);
  const showWarning = Boolean(state.runtime.pageBoundaryWarningVisible);
  if (hasLoadedImage && showWarning && dom.statusGroup) {
    dom.statusGroup.open = true;
  }
}
