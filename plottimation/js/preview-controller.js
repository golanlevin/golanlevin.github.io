import { renderCanvasFit, resizeCanvasToBox } from "./canvas-view.js";

/**
 * Keep the Preview panel title in sync with whether it is showing the live canvas
 * or a completed exported GIF.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updateAnimationPreviewHeading(dom, state) {
  dom.animationPreviewHeading.textContent = state.export.url ? "GIF Output" : "Preview";
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
  dom.previewPlayPauseButton.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
}

/**
 * Return the length of the logical playback/export sequence after reverse/ping-pong are applied.
 *
 * @param {import("./dom-state.js").state} state
 * @param {() => ReturnType<import("./app.js")["readConfig"]>} readConfig
 * @returns {number}
 */
export function getOrderedFrameCount(state, readConfig) {
  const frameCount = state.geometry.frameCount;
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
  const frameCount = state.geometry.frameCount;
  if (frameCount <= 0) return 0;
  const exportOptions = readConfig().exportOptions;
  const orderedFrameCount = getOrderedFrameCount(state, readConfig);
  const clamped = ((previewIndex % orderedFrameCount) + orderedFrameCount) % orderedFrameCount;
  let sourceIndex = clamped;
  if (exportOptions.pingPong && frameCount > 1) {
    sourceIndex = (clamped < frameCount)
      ? clamped
      : ((frameCount - 2) - (clamped - frameCount));
  }
  return exportOptions.reverseOrder
    ? (frameCount - 1 - sourceIndex)
    : sourceIndex;
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
 *   readConfig: () => ReturnType<import("./app.js")["readConfig"]>
 * }} deps
 * @returns {void}
 */
export function drawCurrentGifPreview({ dom, state, getAdjustedFrameCanvas, readConfig }) {
  if (state.export.url) {
    // After export, this panel becomes a GIF viewer until some setting invalidates that GIF.
    dom.gifPreviewCanvas.hidden = true;
    dom.gifPreviewCanvas.parentElement?.classList.remove("is-empty");
    updateAnimationPreviewHeading(dom, state);
    return;
  }
  dom.gifPreviewCanvas.hidden = false;
  updateAnimationPreviewHeading(dom, state);
  const frame = getAdjustedFrameCanvas(getOrderedFrameIndex(state.preview.frameIndex, state, readConfig));
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
