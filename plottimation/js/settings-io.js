/**
 * Settings manifest I/O helpers.
 *
 * This module loads sibling settings files, applies TSV settings manifests into the current DOM,
 * and serializes the current app configuration back out to TSV.
 */
/**
 * Build the standalone settings-manifest filename stored next to a source image.
 *
 * @param {string} sourceFilename
 * @param {(filename:string) => string} sanitizeFilenameBase
 * @returns {string}
 */
export function makeSettingsFilename(sourceFilename, sanitizeFilenameBase) {
  return `${sanitizeFilenameBase(sourceFilename || "frame_sheet")}_settings.txt`;
}

/**
 * Best-effort loader for a sibling settings file that matches a source image.
 *
 * For URL-based demo/server images, this fetches `<imagename>_settings.txt` from the same
 * directory. For dropped local files, it can consume an explicitly provided sibling settings file.
 *
 * @param {{
 *   src: string,
 *   filename: string,
 *   settingsFile?: File | null,
 *   makeSettingsFilename: (sourceFilename:string) => string,
 * }} deps
 * @returns {Promise<string>}
 */
export async function loadCompanionSettingsText({
  src,
  filename,
  settingsFile = null,
  makeSettingsFilename,
}) {
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
 * Apply a tab-separated settings manifest to the current DOM and marker-override state.
 *
 * Unknown keys are ignored so newer settings files can add fields without breaking older code.
 *
 * @param {{
 *   settingsText: string,
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   settingsDefaults: import("./settings-defaults.js").SETTINGS_DEFAULTS,
 *   getMarkerKey: (col:number, row:number) => string,
 *   syncOutputSizeFromLoadedValues?: (width:number, height:number) => void,
 *   syncOutputSizeFromWidthInput: () => void,
 *   syncOutputSizeFromHeightInput: () => void,
 *   syncPaperPresetUi: () => void,
 *   syncAlignmentMarkerUi: () => void,
 *   syncMarkerEditingUi: () => void,
 *   syncRawPhotoCreditDisplay?: () => void,
 *   updateSliderReadouts: () => void,
 * }} deps
 * @returns {void}
 */
export function applyLoadedSettingsText({
  settingsText,
  dom,
  state,
  settingsDefaults,
  getMarkerKey,
  syncOutputSizeFromLoadedValues,
  syncOutputSizeFromWidthInput,
  syncOutputSizeFromHeightInput,
  syncPaperPresetUi,
  syncAlignmentMarkerUi,
  syncMarkerEditingUi,
  syncRawPhotoCreditDisplay,
  updateSliderReadouts,
}) {
  if (!settingsText.trim()) return;
  state.geometry.manualMarkerOverrides.clear();
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

  state.source.sourceCredit = entries.get("source_credit") || "";

  setIfPresent("paper_preset", dom.paperPreset);
  if (entries.get("paper_orientation") === "portrait") {
    dom.paperOrientationPortrait.checked = true;
  } else if (entries.has("paper_orientation")) {
    dom.paperOrientationLandscape.checked = true;
  }
  setIfPresent("paper_width", dom.paperWidth);
  setIfPresent("paper_height", dom.paperHeight);
  setIfPresent("frame_cols", dom.frameCols);
  setIfPresent("frame_rows", dom.frameRows);
  setIfPresent("threshold_method", dom.thresholdMethod);
  setIfPresent("threshold_offset", dom.thresholdOffset);
  setCheckedIfPresent("light_on_dark_design", dom.lightOnDarkDesign);
  setIfPresent("search_inset_margin_px", dom.paperMargin);
  setIfPresent("boundary_threshold", dom.boundarySensitivity);
  setIfPresent("boundary_persistence_px", dom.boundaryPersistence);
  setIfPresent("post_rotation_deg", dom.postRotation);
  const pipeline = entries.get("alignment_pipeline");
  const markerType = entries.get("alignment_marker_type");
  const useMarkerlessPipeline =
    pipeline === "markerless" ||
    (pipeline !== "markers" && markerType === "none");
  dom.alignmentPipelineMarkerless.checked = useMarkerlessPipeline;
  dom.alignmentPipelineMarkers.checked = !useMarkerlessPipeline;
  const stabilizationMethod = entries.get("stabilization_method");
  if (dom.stabilizationMethodAverage && dom.stabilizationMethodPairwise) {
    const useAverageMethod = stabilizationMethod === "difference-from-average";
    dom.stabilizationMethodAverage.checked = useAverageMethod;
    dom.stabilizationMethodPairwise.checked = !useAverageMethod;
  }
  setCheckedIfPresent("stabilization_enabled", dom.stabilizationEnabled);
  setIfPresent("stabilization_strength", dom.stabilizationStrength);
  dom.alignmentMarkerType.value =
    markerType === "auto" || markerType === "circles" || markerType === "crosses"
      ? markerType
      : settingsDefaults.alignmentMarkerType;
  setIfPresent("alignment_marker_region_scale_pct", dom.crossRoiScale);
  setIfPresent("stabilization_lambda", dom.stabilizationLambda);
  setIfPresent("markerless_phase_x", dom.markerlessPhaseX);
  setIfPresent("markerless_phase_y", dom.markerlessPhaseY);
  setIfPresent("vertical_drift_compensation", dom.verticalDriftCompensation);
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
  setIfPresent("loop_count", dom.loopCount);
  setIfPresent("frame_count_to_export", dom.frameCountToExport);
  if (!entries.has("frame_count_to_export") && dom.frameCountToExport) {
    // Legacy settings files may omit this key. Clear any stale previous-grid value so the later
    // sync treats the field as "use all cells" for the newly loaded frame rows/cols.
    dom.frameCountToExport.value = "";
  }
  setCheckedIfPresent("reverse_order", dom.reverseOrder);
  setCheckedIfPresent("boustrophedon_order", dom.boustrophedonOrder);
  setCheckedIfPresent("ping_pong", dom.pingPong);
  const hasOutputWidth = entries.has("output_width");
  const hasOutputHeight = entries.has("output_height");
  if (hasOutputWidth) {
    dom.outputWidth.value = String(entries.get("output_width"));
  }
  if (hasOutputHeight) {
    dom.outputHeight.value = String(entries.get("output_height"));
  }
  // Restore output sizing into runtime state exactly once. When both dimensions are present, keep
  // that pair intact until geometry exists instead of forcing one dimension to become the anchor.
  if (hasOutputWidth && hasOutputHeight && syncOutputSizeFromLoadedValues) {
    syncOutputSizeFromLoadedValues(
      Number(entries.get("output_width")),
      Number(entries.get("output_height")),
    );
  } else if (hasOutputWidth) {
    syncOutputSizeFromWidthInput();
  } else if (hasOutputHeight) {
    syncOutputSizeFromHeightInput();
  }
  if (entries.has("encoding_quality")) {
    dom.gifQuality.value = String(
      Math.max(
        1,
        Math.min(100, Math.round(Number(entries.get("encoding_quality")) || settingsDefaults.gifExport.quality))
      )
    );
  }
  setIfPresent("dither", dom.gifDither);
  setIfPresent("resampling", dom.gifResampling);
  setCheckedIfPresent("use_global_palette", dom.gifGlobalPalette);

  // Manual marker overrides are stored as their own sparse TSV rows so settings files can preserve
  // only the edited markers instead of serializing the whole marker lattice.
  for (const [key, value] of entries.entries()) {
    const match = /^marker_override_(\d+)_(\d+)$/.exec(key);
    if (!match) continue;
    const [xText, yText] = String(value || "").split(",");
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    state.geometry.manualMarkerOverrides.set(getMarkerKey(Number(match[1]), Number(match[2])), { x, y });
  }

  syncPaperPresetUi();
  syncAlignmentMarkerUi();
  syncMarkerEditingUi();
  syncRawPhotoCreditDisplay?.();
  if (dom.frameCountToExport) {
    const cols = Math.max(1, Math.min(20, Math.round(Number(dom.frameCols.value) || settingsDefaults.layout.frameCols)));
    const rows = Math.max(1, Math.min(20, Math.round(Number(dom.frameRows.value) || settingsDefaults.layout.frameRows)));
    const maxFrameCount = Math.max(1, cols * rows);
    dom.frameCountToExport.min = "1";
    dom.frameCountToExport.max = String(maxFrameCount);
    state.runtime.lastFrameExportCountMax = maxFrameCount;
  }
  updateSliderReadouts();
}

/**
 * Serialize the current app settings into a tab-separated manifest.
 *
 * Each line uses `setting<TAB>value`.
 *
 * @param {{
 *   config: object,
 *   sourceFilename: string,
 *   sourceCredit?: string,
 *   manualMarkerOverrides: Map<string, {x:number, y:number}>,
 *   sanitizeFilenameBase: (filename:string) => string,
 * }} deps
 * @returns {string}
 */
export function buildSettingsTsv({
  config,
  sourceFilename,
  sourceCredit = "",
  manualMarkerOverrides,
  sanitizeFilenameBase,
}) {
  const rows = [
    ["source_filename", sourceFilename || ""],
    ["source_credit", sourceCredit || ""],
    ["paper_preset", config.paperPreset],
    ["paper_orientation", config.paperOrientation],
    ["paper_width", String(config.paperWidthIn)],
    ["paper_height", String(config.paperHeightIn)],
    ["frame_cols", String(config.frameCols)],
    ["frame_rows", String(config.frameRows)],
    ["threshold_method", config.thresholdMethod],
    ["threshold_offset", String(config.thresholdOffset)],
    ["light_on_dark_design", String(config.lightOnDarkDesign)],
    ["search_inset_margin_px", String(config.paperMarginPx)],
    ["boundary_threshold", String(config.boundarySensitivity)],
    ["boundary_persistence_px", String(config.boundaryPersistencePx)],
    ["post_rotation_deg", String(config.postRotationDeg)],
    ["alignment_pipeline", String(config.alignmentPipeline)],
    ["stabilization_method", String(config.stabilizationMethod)],
    ["stabilization_enabled", String(config.stabilizationEnabled)],
    ["stabilization_strength", String(config.stabilizationStrengthPct)],
    ["alignment_marker_type", config.alignmentMarkerType],
    ["alignment_marker_region_scale_pct", String(config.crossRoiScalePct)],
    ["stabilization_lambda", String(config.stabilizationLambda)],
    ["markerless_phase_x", String(config.markerlessPhaseX)],
    ["markerless_phase_y", String(config.markerlessPhaseY)],
    ["vertical_drift_compensation", String(config.verticalDriftCompensation)],
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
    ["loop_count", String(config.exportOptions.loopCount)],
    ["frame_count_to_export", String(config.exportOptions.frameCountToExport)],
    ["reverse_order", String(config.exportOptions.reverseOrder)],
    ["boustrophedon_order", String(config.exportOptions.boustrophedonOrder)],
    ["ping_pong", String(config.exportOptions.pingPong)],
    ["output_width", String(config.exportOptions.outputWidthPx)],
    ["output_height", String(config.exportOptions.outputHeightPx)],
    ["encoding_quality", String(config.exportOptions.encodingQuality)],
    ["dither", String(config.exportOptions.dither || "off")],
    ["resampling", String(config.exportOptions.resampling)],
    ["use_global_palette", String(config.exportOptions.globalPalette)],
  ];
  const overrideRows = [...manualMarkerOverrides.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, point]) => {
      const [col, row] = key.split(",");
      return [`marker_override_${col}_${row}`, `${point.x},${point.y}`];
    });
  return [...rows, ...overrideRows].map(([key, value]) => `${key}\t${value}`).join("\n") + "\n";
}
