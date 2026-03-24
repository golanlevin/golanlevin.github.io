/**
 * Revoke the cached blob URL used for fast rectified-sheet drag/download.
 *
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function releaseRectifiedDragUrl(state) {
  if (!state.preview.rectifiedDragUrl) return;
  URL.revokeObjectURL(state.preview.rectifiedDragUrl);
  state.preview.rectifiedDragUrl = "";
}

/**
 * Build a cached PNG blob URL for the current rectified-sheet canvas.
 *
 * This lets drag/download use a prebuilt object URL instead of blocking on synchronous
 * canvas encoding during `dragstart`.
 *
 * @param {import("./dom-state.js").state} state
 * @param {HTMLCanvasElement | null} rectifiedCanvas
 * @returns {void}
 */
export function primeRectifiedDragAsset(state, rectifiedCanvas) {
  state.preview.rectifiedDragBuildId += 1;
  const buildId = state.preview.rectifiedDragBuildId;
  releaseRectifiedDragUrl(state);
  if (!rectifiedCanvas || !rectifiedCanvas.width || !rectifiedCanvas.height) return;
  rectifiedCanvas.toBlob((blob) => {
    if (buildId !== state.preview.rectifiedDragBuildId) return;
    if (!blob) return;
    state.preview.rectifiedDragUrl = URL.createObjectURL(blob);
  }, "image/png");
}

/**
 * Make a preview canvas draggable.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {() => {url?:string, filename:string, mimeType:string, canvas?:HTMLCanvasElement | null} | null} getDragAsset
 * @returns {void}
 */
export function makeCanvasDraggable(canvas, getDragAsset) {
  canvas.draggable = true;
  canvas.addEventListener("dragstart", (event) => {
    try {
      const asset = getDragAsset?.();
      if (!asset) {
        event.preventDefault();
        return;
      }
      let url = asset.url || "";
      const mimeType = asset.mimeType || "image/png";
      const filename = asset.filename || "image.png";
      if (!url) {
        const sourceCanvas = asset.canvas || canvas;
        if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
          event.preventDefault();
          return;
        }
        url = sourceCanvas.toDataURL(mimeType);
      } else {
        url = new URL(url, window.location.href).href;
      }
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/uri-list", url);
      event.dataTransfer.setData("DownloadURL", `${mimeType}:${filename}:${url}`);
    } catch (error) {
      console.error("Could not start canvas drag:", error);
    }
  });
}

/**
 * Make the exported GIF preview image draggable with a friendly filename.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function makeGifImageDraggable(dom, state) {
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
 * Run a brief cartoon-like "ring" animation on the Export GIF button.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function triggerExportButtonAttention(dom, state) {
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
 * Intercept drag attempts on the live preview canvas and point the user toward Export GIF.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function makeLivePreviewDragCue(dom, state) {
  dom.gifPreviewCanvas.draggable = true;
  dom.gifPreviewCanvas.addEventListener("dragstart", (event) => {
    // Only an exported GIF is a real downloadable asset. The live canvas is just a viewer.
    if (state.export.url) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    triggerExportButtonAttention(dom, state);
  });
}

/**
 * Insert a `-rectified` suffix before the source-image extension for rectified-sheet export.
 *
 * @param {string} sourceFilename
 * @returns {string}
 */
export function makeRectifiedFilename(sourceFilename) {
  const trimmed = String(sourceFilename || "").trim();
  if (!trimmed) return "rectified-sheet.png";
  const match = trimmed.match(/^(.*?)(\.[^.]+)$/);
  if (!match) return `${trimmed}-rectified.png`;
  return `${match[1]}-rectified${match[2]}`;
}
