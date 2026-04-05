/**
 * UI event wiring helpers.
 *
 * This module attaches button, slider, checkbox, keyboard, and tooltip behavior so the main app
 * can supply callbacks without carrying the full DOM-listener implementation inline.
 */
import { t } from "./i18n.js";
/**
 * Wire a small header reset button without toggling the parent details element.
 *
 * @param {HTMLButtonElement | null} button
 * @param {() => void} onReset
 * @returns {void}
 */
export function attachResetButton(button, onReset) {
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onReset();
  });
}

/**
 * Enable or disable native browser tooltips across the registered controls.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   enabled: boolean,
 *   previewTooltipText: string
 * }} deps
 * @returns {void}
 */
export function setTooltipsEnabled({ dom, state, enabled, previewTooltipText }) {
  state.runtime.tooltipsEnabled = enabled;
  for (const [element, text] of state.runtime.tooltipRegistry || []) {
    if (element === dom.exportMp4Button && !state.runtime.mp4ExportSupported) {
      element.title = t("panels.mp4Unsupported");
      continue;
    }
    if (enabled && String(text || "").trim()) {
      element.title = text;
    } else {
      element.removeAttribute("title");
    }
  }
  dom.gifPreviewCanvas.title = previewTooltipText || "";
  if (!state.runtime.mp4ExportSupported) {
    dom.exportMp4Button.title = t("panels.mp4Unsupported");
  }
  dom.tooltipToggleButton.textContent = enabled ? t("panels.disableTooltips") : t("panels.enableTooltips");
}

/**
 * Register tooltip text for major UI controls and keep them disabled by default.
 *
 * @param {{
 *   tooltipText: Record<string, string>,
 *   state: import("./dom-state.js").state,
 *   dom: import("./dom-state.js").dom,
 *   applyTooltipState: (enabled: boolean) => void
 * }} deps
 * @returns {void}
 */
export function initializeTooltips({ tooltipText, state, dom, applyTooltipState }) {
  const tooltipMap = new Map();
  for (const [selector, text] of Object.entries(tooltipText)) {
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
  dom.gifPreviewCanvas.title = tooltipText["#gifPreviewCanvas"] || "";
  applyTooltipState(false);
}

/**
 * Attach all DOM event listeners and classify controls by what they invalidate.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   makeCanvasDraggable: (canvas: HTMLCanvasElement, getDragAsset: () => any) => void,
 *   makeRectifiedFilename: (sourceFilename: string) => string,
 *   makeLivePreviewDragCue: () => void,
 *   makeGifImageDraggable: () => void,
 *   handleFile: (file: File, files?: FileList | File[] | null) => Promise<void>,
 *   loadSelectedDemo: (filename: string) => void,
 *   renderRectifiedPreview: (rectifiedCanvas: HTMLCanvasElement) => void,
 *   resetAppearanceControls: () => void,
 *   resetTrimControls: () => void,
 *   resetExportControls: () => void,
 *   toggleTooltips: () => void,
 *   togglePreviewPaused: () => void,
 *   stepPausedPreviewFrame: (direction: number) => void,
 *   toggleMarkerBlobView: () => void,
 *   toggleMarkerEditing: () => void,
 *   clearMarkerEdits: () => void,
 *   syncOutputSizeFromWidthInput: () => void,
 *   syncOutputSizeFromHeightInput: () => void,
 *   previewPageBoundaryForThresholdOffset: () => void,
 *   syncPaperPresetUi: () => void,
 *   syncAlignmentMarkerUi: () => void,
 *   setActiveViewerTab: (view:string) => void,
 *   updateSliderReadouts: () => void,
 *   scheduleProcess: () => void,
 *   revokeGifUrl: () => void,
 *   invalidateAppearanceCache: () => void,
 *   scheduleAppearancePreviewUpdate: (includeRectified?: boolean) => void,
 *   cancelInFlightProcessing: () => void,
 *   invalidateFrameCaches: () => void,
 *   drawCurrentGifPreview: () => void,
 *   exportGif: () => Promise<void>,
 *   exportMp4: () => Promise<void>,
 *   exportZip: () => Promise<void>,
 *   saveSettingsFile: () => void
 * }} deps
 * @returns {void}
 */
export function attachUi({
  dom,
  state,
  makeCanvasDraggable,
  makeRectifiedFilename,
  makeLivePreviewDragCue,
  makeGifImageDraggable,
  handleFile,
  loadSelectedDemo,
  renderRectifiedPreview,
  resetAppearanceControls,
  resetTrimControls,
  resetExportControls,
  toggleTooltips,
  togglePreviewPaused,
  stepPausedPreviewFrame,
  toggleMarkerBlobView,
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
  scheduleAppearancePreviewUpdate,
  cancelInFlightProcessing,
  invalidateFrameCaches,
  drawCurrentGifPreview,
  exportGif,
  exportMp4,
  exportZip,
  saveSettingsFile,
}) {
  const shouldSkipMarkerTypeReprocess = () => {
    const requestedMarkerType = dom.alignmentMarkerType.value || "crosses";
    const lastAlignmentInfo = state.geometry.alignmentInfo;
    if (!lastAlignmentInfo) return false;
    return (
      requestedMarkerType !== "auto" &&
      lastAlignmentInfo.requestedMarkerType === "auto" &&
      lastAlignmentInfo.resolvedMarkerType === requestedMarkerType
    );
  };

  makeCanvasDraggable(dom.rawCanvas, () => {
    if (state.source.dragUrl && state.source.filename) {
      return {
        url: state.source.dragUrl,
        filename: state.source.filename,
        mimeType: state.source.mimeType || "image/jpeg",
      };
    }
    return {
      canvas: state.source.canvas,
      filename: state.source.filename || "raw-photo.png",
      mimeType: "image/png",
    };
  });

  makeCanvasDraggable(dom.rectifiedCanvas, () => {
    if (state.preview.rectifiedDragUrl) {
      return {
        url: state.preview.rectifiedDragUrl,
        filename: makeRectifiedFilename(state.source.filename),
        mimeType: "image/png",
      };
    }
    return {
      canvas: state.preview.rectifiedCanvas,
      filename: makeRectifiedFilename(state.source.filename),
      mimeType: "image/png",
    };
  });

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
    if (file) void handleFile(file, event.dataTransfer?.files || null);
  });
  dom.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file, event.target.files || null);
  });
  dom.loadDemoSelect.addEventListener("change", () => {
    const filename = dom.loadDemoSelect.value;
    if (!filename) return;
    loadSelectedDemo(filename);
    dom.loadDemoSelect.value = "";
  });
  [dom.viewerTabRaw, dom.viewerTabRectified, dom.viewerTabMarkers, dom.viewerTabPreview].forEach((button) => {
    button?.addEventListener("click", () => {
      setActiveViewerTab(button.dataset.view || "preview");
    });
  });
  dom.rectifiedCanvas.addEventListener("click", () => {
    // Keep the convolution debug renderer available in code, but disable the direct canvas click
    // affordance for switching into that view.
  });

  attachResetButton(dom.resetAppearanceButton, resetAppearanceControls);
  attachResetButton(dom.resetTrimButton, resetTrimControls);
  attachResetButton(dom.resetExportButton, resetExportControls);
  dom.tooltipToggleButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTooltips();
  });
  dom.previewPlayPauseButton.addEventListener("click", togglePreviewPaused);
  dom.toggleMarkerBlobViewButton?.addEventListener("click", toggleMarkerBlobView);
  dom.toggleMarkerEditingButton.addEventListener("click", toggleMarkerEditing);
  dom.clearMarkerEditsButton.addEventListener("click", clearMarkerEdits);

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    // Arrow-key scrubbing should not interfere with typing or with native select navigation,
    // but it should still work if a button currently holds focus.
    if (target instanceof HTMLElement && target.closest("input, textarea, select")) {
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      togglePreviewPaused();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepPausedPreviewFrame(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepPausedPreviewFrame(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      stepPausedPreviewFrame(-state.geometry.alignmentInfo?.cols || -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      stepPausedPreviewFrame(state.geometry.alignmentInfo?.cols || 1);
    }
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
  [dom.paperOrientationLandscape, dom.paperOrientationPortrait].forEach((input) => {
    input.addEventListener("input", () => {
      syncPaperPresetUi();
      updateSliderReadouts();
      scheduleProcess();
    });
    input.addEventListener("change", () => {
      syncPaperPresetUi();
      scheduleProcess();
    });
  });

  dom.alignmentMarkerType.addEventListener("input", () => {
    syncAlignmentMarkerUi();
    if (shouldSkipMarkerTypeReprocess()) return;
    revokeGifUrl();
    updateSliderReadouts();
    scheduleProcess();
  });
  dom.alignmentMarkerType.addEventListener("change", () => {
    syncAlignmentMarkerUi();
    if (shouldSkipMarkerTypeReprocess()) return;
    revokeGifUrl();
    scheduleProcess();
  });

  const appearanceInputs = [
    dom.brightness,
    dom.contrast,
    dom.vibrance,
    dom.temperature,
    dom.unsharpRadius,
    dom.unsharpAmount,
    dom.invert
  ];
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
    dom.paperMargin,
    dom.boundarySensitivity,
    dom.boundaryPersistence,
    dom.detectCrossesWithConvolution,
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

  dom.crossRoiScale.addEventListener("input", () => {
    updateSliderReadouts();
  });
  dom.crossRoiScale.addEventListener("change", () => {
    revokeGifUrl();
    updateSliderReadouts();
    scheduleProcess();
  });

  dom.thresholdOffset.addEventListener("input", () => {
    // While the slider is dragged, update only the readout plus the lightweight Raw Photo page-quad
    // preview. The full pipeline still waits for the `change` event on release.
    updateSliderReadouts();
    previewPageBoundaryForThresholdOffset();
  });
  dom.thresholdOffset.addEventListener("change", () => {
    revokeGifUrl();
    updateSliderReadouts();
    scheduleProcess();
  });

  const lazyFrameInputs = [
    dom.gifResampling,
    dom.outputWidth,
    dom.outputHeight,
    dom.cropLeft,
    dom.cropRight,
    dom.cropTop,
    dom.cropBottom,
    dom.flipHorizontal,
    dom.flipVertical,
    dom.rotate90Cw,
    dom.fps,
    dom.loopCount,
    dom.gifQuality,
    dom.gifDither,
    dom.gifGlobalPalette,
    dom.reverseOrder,
    dom.boustrophedonOrder,
    dom.pingPong
  ];
  lazyFrameInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (input === dom.outputWidth) syncOutputSizeFromWidthInput();
      if (input === dom.outputHeight) syncOutputSizeFromHeightInput();
      revokeGifUrl();
      updateSliderReadouts();
      if (
        (input === dom.gifResampling) ||
        (input === dom.outputWidth) ||
        (input === dom.outputHeight) ||
        (input === dom.cropLeft) ||
        (input === dom.cropRight) ||
        (input === dom.cropTop) ||
        (input === dom.cropBottom) ||
        (input === dom.flipHorizontal) ||
        (input === dom.flipVertical) ||
        (input === dom.rotate90Cw)
      ) invalidateFrameCaches();
      drawCurrentGifPreview();
    });
    input.addEventListener("change", () => {
      if (input === dom.outputWidth) syncOutputSizeFromWidthInput();
      if (input === dom.outputHeight) syncOutputSizeFromHeightInput();
      revokeGifUrl();
      if (
        (input === dom.gifResampling) ||
        (input === dom.outputWidth) ||
        (input === dom.outputHeight) ||
        (input === dom.cropLeft) ||
        (input === dom.cropRight) ||
        (input === dom.cropTop) ||
        (input === dom.cropBottom) ||
        (input === dom.flipHorizontal) ||
        (input === dom.flipVertical) ||
        (input === dom.rotate90Cw)
      ) invalidateFrameCaches();
      drawCurrentGifPreview();
    });
  });

  dom.exportButton.addEventListener("click", () => {
    void exportGif();
  });
  dom.exportMp4Button.addEventListener("click", () => {
    void exportMp4();
  });
  dom.exportZipButton.addEventListener("click", () => {
    void exportZip();
  });
  dom.saveSettingsButton.addEventListener("click", saveSettingsFile);
}
