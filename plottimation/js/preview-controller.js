/**
 * Live preview controller helpers.
 *
 * This module owns the animation-preview heading state, play/pause button state, playback order,
 * RAF loop, and the drawing of the current preview frame into the Preview panel.
 */
import { renderCanvasFit, resizeCanvasToBox } from "./canvas-view.js";
import { t } from "./i18n.js";

/**
 * Keep the Preview panel title fixed.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updateAnimationPreviewHeading(dom, state) {
  dom.animationPreviewHeading.textContent = t("panels.preview");
}

/**
 * Keep the preview playback button synchronized with the current play/pause state.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updatePreviewPlayPauseButton(dom, state) {
  const hasFrames = state.geometry.frameCount > 0;
  const paused = !!state.preview.paused;
  dom.previewPlayPauseButton.disabled = !hasFrames;
  dom.previewPlayPauseButton.textContent = paused ? "\u23f5" : "\u23f8";
  dom.previewPlayPauseButton.setAttribute("aria-label", paused ? t("aria.playAnimation") : t("aria.pauseAnimation"));
}

/**
 * Return the length of the logical playback/export sequence after reverse/ping-pong are applied.
 *
 * @param {import("./dom-state.js").state} state
 * @param {() => ReturnType<import("./app.js")["readConfig"]>} readConfig
 * @returns {number}
 */
export function getOrderedFrameCount(state, readConfig) {
  const frameCount = getIncludedSourceFrameCount(state, readConfig);
  if (frameCount <= 0) return 0;
  if (readConfig().exportOptions.pingPong) {
    return (frameCount <= 1) ? frameCount : ((frameCount * 2) - 2);
  }
  return frameCount;
}

/**
 * Map the running preview/export index to the actual source-frame index, optionally reversed
 * and optionally expanded into a ping-pong sequence.
 *
 * @param {number} previewIndex
 * @param {import("./dom-state.js").state} state
 * @param {() => ReturnType<import("./app.js")["readConfig"]>} readConfig
 * @returns {number}
 */
export function getOrderedFrameIndex(previewIndex, state, readConfig) {
  const orderedSources = getBaseOrderedSourceFrameIndices(state, readConfig);
  const frameCount = orderedSources.length;
  if (frameCount <= 0) return 0;
  const exportOptions = readConfig().exportOptions;
  const orderedFrameCount = getOrderedFrameCount(state, readConfig);
  const clamped = ((previewIndex % orderedFrameCount) + orderedFrameCount) % orderedFrameCount;
  let sequencePosition = clamped;
  if (exportOptions.pingPong && frameCount > 1) {
    sequencePosition = (clamped < frameCount)
      ? clamped
      : ((frameCount - 2) - (clamped - frameCount));
  }
  return orderedSources[sequencePosition] ?? 0;
}

/**
 * Clamp the user-requested export/playback frame count to the number of extracted source cells.
 *
 * @param {import("./dom-state.js").state} state
 * @param {() => ReturnType<import("./app.js")["readConfig"]>} readConfig
 * @returns {number}
 */
function getIncludedSourceFrameCount(state, readConfig) {
  const sourceFrameCount = Math.max(0, state.geometry.frameCount || 0);
  if (sourceFrameCount <= 0) return 0;
  const requested = Math.round(Number(readConfig().exportOptions.frameCountToExport) || sourceFrameCount);
  return Math.max(1, Math.min(sourceFrameCount, requested));
}

/**
 * Build the one-loop ordered list of source-frame indices after omission, boustrophedon ordering,
 * and reverse order have been applied.
 *
 * @param {import("./dom-state.js").state} state
 * @param {() => ReturnType<import("./app.js")["readConfig"]>} readConfig
 * @returns {number[]}
 */
function getBaseOrderedSourceFrameIndices(state, readConfig) {
  const exportOptions = readConfig().exportOptions;
  const frameCount = getIncludedSourceFrameCount(state, readConfig);
  if (frameCount <= 0) return [];
  const cols = Math.max(1, state.geometry.alignmentInfo?.cols || 1);
  const ordered = [];
  if (exportOptions.boustrophedonOrder) {
    for (let rowStart = 0, row = 0; rowStart < frameCount; rowStart += cols, row += 1) {
      const rowEnd = Math.min(frameCount, rowStart + cols);
      const rowIndices = [];
      for (let index = rowStart; index < rowEnd; index += 1) {
        rowIndices.push(index);
      }
      if (row % 2 === 1) {
        rowIndices.reverse();
      }
      ordered.push(...rowIndices);
    }
  } else {
    for (let index = 0; index < frameCount; index += 1) {
      ordered.push(index);
    }
  }
  if (exportOptions.reverseOrder) {
    ordered.reverse();
  }
  return ordered;
}

/**
 * Drive the live animation preview at the configured frame rate.
 *
 * @param {{
 *   state: import("./dom-state.js").state,
 *   readConfig: () => ReturnType<import("./app.js")["readConfig"]>,
 *   drawCurrentGifPreview: () => void
 * }} deps
 * @returns {void}
 */
export function startGifPreviewLoop({ state, readConfig, drawCurrentGifPreview }) {
  const loop = (time) => {
    const orderedFrameCount = getOrderedFrameCount(state, readConfig);
    if (orderedFrameCount > 0 && !state.preview.paused) {
      const fps = readConfig().fps;
      const frameDelay = 1000 / fps;
      if ((time - state.preview.lastTime) >= frameDelay) {
        state.preview.lastTime = time;
        state.preview.frameIndex = (state.preview.frameIndex + 1) % orderedFrameCount;
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
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   getAdjustedFrameCanvas: (index:number) => HTMLCanvasElement | null,
 *   getDisplayFrameIndex: () => number
 * }} deps
 * @returns {void}
 */
export function drawCurrentGifPreview({ dom, state, getAdjustedFrameCanvas, getDisplayFrameIndex }) {
  if (state.export.url) {
    // After export, this panel becomes a GIF viewer until some setting invalidates that GIF.
    dom.gifPreviewCanvas.hidden = true;
    dom.gifPreviewCanvas.parentElement?.classList.remove("is-empty");
    updateAnimationPreviewHeading(dom, state);
    return;
  }
  dom.gifPreviewCanvas.hidden = false;
  updateAnimationPreviewHeading(dom, state);
  const frame = getAdjustedFrameCanvas(getDisplayFrameIndex());
  if (!frame) {
    const ctx = dom.gifPreviewCanvas.getContext("2d");
    resizeCanvasToBox(dom.gifPreviewCanvas);
    ctx.clearRect(0, 0, dom.gifPreviewCanvas.width, dom.gifPreviewCanvas.height);
    dom.gifPreviewCanvas.parentElement?.classList.add("is-empty");
    return;
  }
  dom.gifPreviewCanvas.parentElement?.classList.remove("is-empty");
  renderCanvasFit(frame, dom.gifPreviewCanvas);
}

/**
 * Rerender all visible previews after a resize or other display-only change.
 *
 * @param {{
 *   state: import("./dom-state.js").state,
 *   renderRawPreview: () => void,
 *   renderRectifiedPreview: (canvas: HTMLCanvasElement) => void,
 *   drawCurrentGifPreview: () => void
 * }} deps
 * @returns {void}
 */
export function rerenderPreviews({ state, renderRawPreview, renderRectifiedPreview, drawCurrentGifPreview }) {
  if (state.source.image) renderRawPreview();
  if (state.preview.rectifiedCanvas) renderRectifiedPreview(state.preview.rectifiedCanvas);
  drawCurrentGifPreview();
}
