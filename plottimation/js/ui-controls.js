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
 * Wire the top-level marker/markerless pipeline switch.
 *
 * The listeners update labels/visibility on `input` so the UI feels immediate, then let the
 * normal processing path rerun because changing pipelines affects alignment semantics broadly.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   scheduleProcess: (delayMs?: number) => void,
 *   syncAlignmentMarkerUi: () => void
 * }} deps
 * @returns {void}
 */
function attachAlignmentPipelineControls({
  dom,
  revokeGifUrl,
  updateSliderReadouts,
  scheduleProcess,
  syncAlignmentMarkerUi,
}) {
  const alignmentDom = dom.alignment;
  [alignmentDom.alignmentPipelineMarkerless, alignmentDom.alignmentPipelineMarkers].forEach((input) => {
    input.addEventListener("input", () => {
      syncAlignmentMarkerUi();
      revokeGifUrl();
      updateSliderReadouts();
      scheduleProcess();
    });
    input.addEventListener("change", () => {
      syncAlignmentMarkerUi();
      revokeGifUrl();
      scheduleProcess();
    });
  });
}

/**
 * Wire the markerless stabilization-method radio group.
 *
 * Switching methods invalidates different caches from the same frame set, so the handler warms
 * the newly selected path before clearing the busy cursor. That keeps the first strength drag from
 * paying the full matcher setup cost on the interaction path.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   setGeometryProcessingCursor: (active: boolean) => void,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   invalidateStabilizationCache: () => void,
 *   scheduleStabilizationPreviewUpdate: () => void,
 *   syncAlignmentMarkerUi: () => void,
 *   warmCurrentStabilizationMethod: () => void
 * }} deps
 * @returns {void}
 */
function attachStabilizationMethodControls({
  dom,
  setGeometryProcessingCursor,
  revokeGifUrl,
  updateSliderReadouts,
  invalidateStabilizationCache,
  scheduleStabilizationPreviewUpdate,
  syncAlignmentMarkerUi,
  warmCurrentStabilizationMethod,
}) {
  const alignmentDom = dom.alignment;
  [alignmentDom.stabilizationMethodPairwise, alignmentDom.stabilizationMethodAverage].forEach((input) => {
    if (!input) return;
    const applyMethodChange = () => {
      // Switching methods changes which stabilization caches are valid, so invalidate them
      // immediately and warm the newly selected path before the user starts dragging strength.
      setGeometryProcessingCursor(true);
      syncAlignmentMarkerUi();
      revokeGifUrl();
      updateSliderReadouts();
      invalidateStabilizationCache();
      requestAnimationFrame(() => {
        warmCurrentStabilizationMethod();
        scheduleStabilizationPreviewUpdate();
        setGeometryProcessingCursor(false);
      });
    };
    input.addEventListener("input", applyMethodChange);
    input.addEventListener("change", applyMethodChange);
  });
}

/**
 * Wire the marker-type selector used only by the marker pipeline.
 *
 * The helper intentionally skips reprocessing when the requested marker type merely matches the
 * already-resolved `Auto` result from the current alignment data.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   scheduleProcess: (delayMs?: number) => void,
 *   syncAlignmentMarkerUi: () => void
 * }} deps
 * @returns {void}
 */
function attachAlignmentMarkerTypeControls({
  dom,
  state,
  revokeGifUrl,
  updateSliderReadouts,
  scheduleProcess,
  syncAlignmentMarkerUi,
}) {
  const alignmentDom = dom.alignment;
  const shouldSkipMarkerTypeReprocess = () => {
    if (alignmentDom.alignmentPipelineMarkerless.checked) return false;
    const requestedMarkerType = alignmentDom.alignmentMarkerType.value || "crosses";
    const lastAlignmentInfo = state.geometry.alignmentInfo;
    if (!lastAlignmentInfo) return false;
    return (
      requestedMarkerType !== "auto" &&
      lastAlignmentInfo.requestedMarkerType === "auto" &&
      lastAlignmentInfo.resolvedMarkerType === requestedMarkerType
    );
  };

  alignmentDom.alignmentMarkerType.addEventListener("input", () => {
    syncAlignmentMarkerUi();
    if (shouldSkipMarkerTypeReprocess()) return;
    revokeGifUrl();
    updateSliderReadouts();
    scheduleProcess();
  });
  alignmentDom.alignmentMarkerType.addEventListener("change", () => {
    syncAlignmentMarkerUi();
    if (shouldSkipMarkerTypeReprocess()) return;
    revokeGifUrl();
    scheduleProcess();
  });
}

/**
 * Wire `Search Inset Margin`.
 *
 * In markerless mode this slider behaves like a scrubbed preview control: dragging updates only
 * the rectified-sheet ROI overlay immediately, while the expensive reprocess waits until release.
 * In marker mode it stays a regular geometry-affecting control.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   beginMarkerlessPhaseScrub: () => void,
 *   endMarkerlessPhaseScrub: () => void,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   renderRectifiedPreview: (canvas: HTMLCanvasElement) => void,
 *   scheduleProcess: (delayMs?: number) => void
 * }} deps
 * @returns {void}
 */
function attachMarkerlessSearchInsetControls({
  dom,
  state,
  beginMarkerlessPhaseScrub,
  endMarkerlessPhaseScrub,
  revokeGifUrl,
  updateSliderReadouts,
  renderRectifiedPreview,
  scheduleProcess,
}) {
  const alignmentDom = dom.alignment;
  const pageDetectionDom = dom.pageDetection;
  const isMarkerless = () => alignmentDom.alignmentPipelineMarkerless.checked;
  const paperMargin = pageDetectionDom.paperMargin;

  paperMargin.addEventListener("pointerdown", () => {
    if (!isMarkerless()) return;
    beginMarkerlessPhaseScrub();
  });
  paperMargin.addEventListener("pointerup", () => {
    if (!isMarkerless()) return;
    endMarkerlessPhaseScrub();
  });
  paperMargin.addEventListener("pointercancel", () => {
    if (!isMarkerless()) return;
    endMarkerlessPhaseScrub();
  });
  paperMargin.addEventListener("blur", () => {
    if (!isMarkerless()) return;
    endMarkerlessPhaseScrub();
  });
  paperMargin.addEventListener("input", () => {
    revokeGifUrl();
    updateSliderReadouts();
    if (isMarkerless()) {
      beginMarkerlessPhaseScrub();
      if (state.preview.rectifiedCanvas) {
        renderRectifiedPreview(state.preview.rectifiedCanvas);
      }
      return;
    }
    scheduleProcess();
  });
  paperMargin.addEventListener("change", () => {
    revokeGifUrl();
    if (isMarkerless()) {
      endMarkerlessPhaseScrub();
    }
    scheduleProcess();
  });
}

/**
 * Wire the markerless stabilization sliders.
 *
 * Both sliders scrub against already-computed matcher state. `Strength` only changes how much of
 * the solved offset field is applied, while `Rigidity` invalidates the offset solve itself.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   beginStabilizationStrengthScrub: () => void,
 *   endStabilizationStrengthScrub: () => void,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   invalidateCurrentPreviewStabilizationCaches: () => void,
 *   invalidateStabilizedOutputCaches: () => void,
 *   invalidateStabilizationOffsetsCache: () => void,
 *   scheduleStabilizationPreviewUpdate: () => void
 * }} deps
 * @returns {void}
 */
function attachStabilizationControls({
  dom,
  beginStabilizationStrengthScrub,
  endStabilizationStrengthScrub,
  revokeGifUrl,
  updateSliderReadouts,
  invalidateCurrentPreviewStabilizationCaches,
  invalidateStabilizedOutputCaches,
  invalidateStabilizationOffsetsCache,
  scheduleStabilizationPreviewUpdate,
}) {
  const alignmentDom = dom.alignment;
  const bindSlider = (input, onChangeInvalidate) => {
    input.addEventListener("pointerdown", beginStabilizationStrengthScrub);
    input.addEventListener("pointerup", endStabilizationStrengthScrub);
    input.addEventListener("pointercancel", endStabilizationStrengthScrub);
    input.addEventListener("blur", endStabilizationStrengthScrub);
    input.addEventListener("input", () => {
      beginStabilizationStrengthScrub();
      revokeGifUrl();
      updateSliderReadouts();
      invalidateCurrentPreviewStabilizationCaches();
      scheduleStabilizationPreviewUpdate();
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      updateSliderReadouts();
      onChangeInvalidate();
      scheduleStabilizationPreviewUpdate();
      endStabilizationStrengthScrub();
    });
  };

  bindSlider(alignmentDom.stabilizationStrength, invalidateStabilizedOutputCaches);
  bindSlider(alignmentDom.stabilizationLambda, invalidateStabilizationOffsetsCache);
}

/**
 * Wire the markerless post-lattice adjustment sliders.
 *
 * Dragging uses the fast current-frame path; release promotes the change to a full frame-cache
 * rebuild because phase and drift alter the extraction geometry seen by all frames.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   beginMarkerlessPhaseScrub: () => void,
 *   endMarkerlessPhaseScrub: () => void,
 *   setGeometryProcessingCursor: (active: boolean) => void,
 *   revokeGifUrl: () => void,
 *   updateSliderReadouts: () => void,
 *   invalidateCurrentPreviewFrameCaches: () => void,
 *   invalidateFrameCaches: () => void,
 *   scheduleMarkerlessPhasePreviewUpdate: () => void,
 *   drawCurrentGifPreview: () => void
 * }} deps
 * @returns {void}
 */
function attachMarkerlessPhaseControls({
  dom,
  beginMarkerlessPhaseScrub,
  endMarkerlessPhaseScrub,
  setGeometryProcessingCursor,
  revokeGifUrl,
  updateSliderReadouts,
  invalidateCurrentPreviewFrameCaches,
  invalidateFrameCaches,
  scheduleMarkerlessPhasePreviewUpdate,
  drawCurrentGifPreview,
}) {
  const alignmentDom = dom.alignment;
  [
    alignmentDom.markerlessPhaseX,
    alignmentDom.markerlessPhaseY,
    alignmentDom.verticalDriftCompensation,
  ].forEach((input) => {
    input.addEventListener("pointerdown", beginMarkerlessPhaseScrub);
    input.addEventListener("pointerup", endMarkerlessPhaseScrub);
    input.addEventListener("pointercancel", endMarkerlessPhaseScrub);
    input.addEventListener("blur", endMarkerlessPhaseScrub);
    input.addEventListener("input", () => {
      beginMarkerlessPhaseScrub();
      revokeGifUrl();
      updateSliderReadouts();
      invalidateCurrentPreviewFrameCaches();
      scheduleMarkerlessPhasePreviewUpdate();
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      updateSliderReadouts();
      setGeometryProcessingCursor(true);
      requestAnimationFrame(() => {
        invalidateFrameCaches();
        drawCurrentGifPreview();
        endMarkerlessPhaseScrub();
        setGeometryProcessingCursor(false);
      });
    });
  });
}

/**
 * Wire the temporary markerless gutter-metric toggles plus the shared light-on-dark switch.
 *
 * These switches change the lattice-estimation signals themselves, so they still require a full
 * processing rerun rather than any preview-only cache path.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   revokeGifUrl: () => void,
 *   scheduleProcess: (delayMs?: number) => void
 * }} deps
 * @returns {void}
 */
function attachMarkerlessPhaseMetricToggles({
  dom,
  revokeGifUrl,
  scheduleProcess,
}) {
  const alignmentDom = dom.alignment;
  const pageDetectionDom = dom.pageDetection;
  [
    alignmentDom.markerlessUseDarkness,
    alignmentDom.markerlessUseTexture,
    alignmentDom.markerlessUseVariance,
    pageDetectionDom.lightOnDarkDesign,
  ].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", () => {
      revokeGifUrl();
      scheduleProcess();
    });
  });
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
 *   toggleMarkerlessPhaseDebug: () => void,
 *   toggleMarkerEditing: () => void,
 *   clearMarkerEdits: () => void,
 *   syncOutputSizeFromWidthInput: () => void,
 *   syncOutputSizeFromHeightInput: () => void,
 *   previewPageBoundaryForThresholdOffset: () => void,
 *   syncPaperPresetUi: () => void,
 *   syncAlignmentMarkerUi: () => void,
 *   setActiveViewerTab: (view:string) => void,
 *   updateSliderReadouts: () => void,
 *   setGeometryProcessingCursor: (active:boolean) => void,
 *   scheduleProcess: () => void,
 *   revokeGifUrl: () => void,
 *   invalidateAppearanceCache: () => void,
 *   invalidateStabilizationCache: () => void,
 *   invalidateStabilizedOutputCaches: () => void,
 *   invalidateStabilizationOffsetsCache: () => void,
 *   invalidateCurrentPreviewFrameCaches: () => void,
 *   invalidateCurrentPreviewStabilizationCaches: () => void,
 *   scheduleAppearancePreviewUpdate: (includeRectified?: boolean) => void,
 *   scheduleStabilizationPreviewUpdate: () => void,
 *   scheduleMarkerlessPhasePreviewUpdate: () => void,
 *   warmCurrentStabilizationMethod: () => void,
 *   beginStabilizationStrengthScrub: () => void,
 *   endStabilizationStrengthScrub: () => void,
 *   beginMarkerlessPhaseScrub: () => void,
 *   endMarkerlessPhaseScrub: () => void,
 *   setGeometryProcessingCursor: (active:boolean) => void,
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
  getPaperGeometrySignature,
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
  setGeometryProcessingCursor,
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
  warmCurrentStabilizationMethod,
  beginStabilizationStrengthScrub,
  endStabilizationStrengthScrub,
  beginMarkerlessPhaseScrub,
  endMarkerlessPhaseScrub,
  cancelInFlightProcessing,
  invalidateFrameCaches,
  drawCurrentGifPreview,
  exportGif,
  exportMp4,
  exportZip,
  saveSettingsFile,
}) {
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
  dom.alignment.markerlessPhaseDebug?.addEventListener("change", () => {
    toggleMarkerlessPhaseDebug();
  });
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

  const maybeProcessPaperGeometryChange = () => {
    // Use the currently displayed width/height fields as the "before" snapshot. By the time these
    // events fire, the preset radio/select value has already changed, so `readConfig()` would see
    // the new preset too early and incorrectly conclude that nothing changed.
    const before = `${String(dom.paperWidth.value || "").trim()}x${String(dom.paperHeight.value || "").trim()}`;
    syncPaperPresetUi();
    updateSliderReadouts();
    const after = `${String(dom.paperWidth.value || "").trim()}x${String(dom.paperHeight.value || "").trim()}`;
    if (before !== after) {
      scheduleProcess();
    }
  };

  dom.paperPreset.addEventListener("input", () => {
    maybeProcessPaperGeometryChange();
  });
  dom.paperPreset.addEventListener("change", () => {
    maybeProcessPaperGeometryChange();
  });
  [dom.paperOrientationLandscape, dom.paperOrientationPortrait].forEach((input) => {
    input.addEventListener("input", () => {
      maybeProcessPaperGeometryChange();
    });
    input.addEventListener("change", () => {
      maybeProcessPaperGeometryChange();
    });
  });

  attachAlignmentPipelineControls({
    dom,
    revokeGifUrl,
    updateSliderReadouts,
    scheduleProcess,
    syncAlignmentMarkerUi,
  });
  attachStabilizationMethodControls({
    dom,
    setGeometryProcessingCursor,
    revokeGifUrl,
    updateSliderReadouts,
    invalidateStabilizationCache,
    scheduleStabilizationPreviewUpdate,
    syncAlignmentMarkerUi,
    warmCurrentStabilizationMethod,
  });
  attachAlignmentMarkerTypeControls({
    dom,
    state,
    revokeGifUrl,
    updateSliderReadouts,
    scheduleProcess,
    syncAlignmentMarkerUi,
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
    dom.boundarySensitivity,
    dom.boundaryPersistence,
    dom.detectCrossesWithConvolution,
    dom.useCrossAlignment,
  ];
  geometryInputs.forEach((input) => {
    input.addEventListener("input", () => {
      revokeGifUrl();
      updateSliderReadouts();
      if (input === dom.paperWidth || input === dom.paperHeight) {
        scheduleProcess(380);
      } else {
        scheduleProcess();
      }
    });
    input.addEventListener("change", () => {
      revokeGifUrl();
      if (input === dom.paperWidth || input === dom.paperHeight) {
        scheduleProcess(0);
      } else {
        scheduleProcess();
      }
    });
  });

  [dom.paperWidth, dom.paperHeight].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      revokeGifUrl();
      updateSliderReadouts();
      scheduleProcess(0);
    });
  });

  attachMarkerlessSearchInsetControls({
    dom,
    state,
    beginMarkerlessPhaseScrub,
    endMarkerlessPhaseScrub,
    revokeGifUrl,
    updateSliderReadouts,
    renderRectifiedPreview,
    scheduleProcess,
  });

  dom.crossRoiScale.addEventListener("input", () => {
    updateSliderReadouts();
  });
  dom.crossRoiScale.addEventListener("change", () => {
    revokeGifUrl();
    updateSliderReadouts();
    scheduleProcess();
  });

  attachStabilizationControls({
    dom,
    beginStabilizationStrengthScrub,
    endStabilizationStrengthScrub,
    revokeGifUrl,
    updateSliderReadouts,
    invalidateCurrentPreviewStabilizationCaches,
    invalidateStabilizedOutputCaches,
    invalidateStabilizationOffsetsCache,
    scheduleStabilizationPreviewUpdate,
  });
  attachMarkerlessPhaseControls({
    dom,
    beginMarkerlessPhaseScrub,
    endMarkerlessPhaseScrub,
    setGeometryProcessingCursor,
    revokeGifUrl,
    updateSliderReadouts,
    invalidateCurrentPreviewFrameCaches,
    invalidateFrameCaches,
    scheduleMarkerlessPhasePreviewUpdate,
    drawCurrentGifPreview,
  });
  attachMarkerlessPhaseMetricToggles({
    dom,
    revokeGifUrl,
    scheduleProcess,
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
    dom.frameCountToExport,
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
