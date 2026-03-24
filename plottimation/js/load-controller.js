/**
 * Toggle the small busy spinners used during image loading and processing.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @param {boolean} busy
 * @returns {void}
 */
export function setBusyState(dom, state, busy) {
  state.runtime.busy = !!busy;
  dom.statusBusy.hidden = !busy;
  dom.rawBusy.hidden = !busy;
}

/**
 * Yield long enough for the browser to paint any newly drawn preview canvases.
 *
 * @returns {Promise<void>}
 */
export async function waitForNextPaint() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Release any blob URL that the app currently owns for raw-photo drag/download behavior.
 *
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function releaseOwnedSourceUrl(state) {
  if (!state.source.ownedObjectUrl) return;
  URL.revokeObjectURL(state.source.ownedObjectUrl);
  state.source.ownedObjectUrl = "";
}

/**
 * Load an image selected by the user from a File object.
 *
 * @param {File} file
 * @param {{
 *   state: import("./dom-state.js").state,
 *   loadImageSource: (src:string, filename?:string, mimeType?:string) => Promise<void>
 * }} deps
 * @returns {Promise<void>}
 */
export async function handleFile(file, { state, loadImageSource }) {
  releaseOwnedSourceUrl(state);
  const url = URL.createObjectURL(file);
  await loadImageSource(url, file.name || "", file.type || "image/jpeg");
}

/**
 * Load an image from a URL, reset dependent state, and kick off processing.
 *
 * @param {{
 *   src: string,
 *   filename?: string,
 *   mimeType?: string,
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   setStatus: (text:string) => void,
 *   collapseAllPanels: () => void,
 *   resetNonLayoutControls: () => void,
 *   revokeGifUrl: () => void,
 *   clearAllPreviews: () => void,
 *   renderRawPreview: () => void,
 *   invalidateAppearanceCache: () => void,
 *   processCurrentImage: () => Promise<void>,
 *   drawImageToCanvas: (image: HTMLImageElement, canvas: HTMLCanvasElement) => void,
 * }} deps
 * @returns {Promise<void>}
 */
export async function loadImageSource({
  src,
  filename = "",
  mimeType = "image/jpeg",
  dom,
  state,
  setStatus,
  collapseAllPanels,
  resetNonLayoutControls,
  revokeGifUrl,
  clearAllPreviews,
  renderRawPreview,
  invalidateAppearanceCache,
  processCurrentImage,
  drawImageToCanvas,
}) {
  releaseOwnedSourceUrl(state);
  if (src.startsWith("blob:")) {
    state.source.ownedObjectUrl = src;
  }
  setBusyState(dom, state, true);
  setStatus("Loading image…");
  collapseAllPanels();
  resetNonLayoutControls();
  revokeGifUrl();
  state.source.dragUrl = "";
  state.source.mimeType = "";
  dom.rawPhotoName.textContent = filename ? `(${filename})` : "";
  clearAllPreviews();

  const image = new Image();
  image.onload = async () => {
    try {
      document.body.classList.add("has-loaded-image");
      state.source.image = image;
      state.source.filename = filename || "";
      state.source.mimeType = mimeType || "image/jpeg";
      state.source.dragUrl = src;
      state.source.rawPageContour = null;
      drawImageToCanvas(image, state.source.canvas);
      renderRawPreview();
      invalidateAppearanceCache();
      setStatus("Image loaded.\nAnalyzing page…");
      await waitForNextPaint();
      await processCurrentImage();
    } finally {
      if (!state.processing.active && !state.processing.pending) {
        setBusyState(dom, state, false);
      }
    }
  };
  image.onerror = () => {
    setBusyState(dom, state, false);
    state.source.dragUrl = "";
    state.source.mimeType = "";
    state.source.filename = "";
    releaseOwnedSourceUrl(state);
    setStatus("Failed to load the selected image.");
  };
  image.src = src;
}
