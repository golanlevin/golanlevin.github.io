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
 * Test whether a dropped/selected file should be treated as an image source.
 *
 * @param {File | null | undefined} file
 * @returns {boolean}
 */
function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i.test(file.name || "");
}

/**
 * Test whether a dropped/selected file is a companion settings manifest.
 *
 * @param {File | null | undefined} file
 * @returns {boolean}
 */
function isSettingsFile(file) {
  if (!file) return false;
  return /_settings\.txt$/i.test(file.name || "");
}

/**
 * Convert an image filename like `mySrcImage.jpg` into `mySrcImage_settings.txt`.
 *
 * @param {string} filename
 * @returns {string}
 */
function getExpectedSettingsFilename(filename) {
  return (filename || "").replace(/\.[^.]+$/, "") + "_settings.txt";
}

/**
 * Load an image selected by the user from a File object.
 *
 * @param {File} file
 * @param {FileList | File[] | null} [files=null]
 * @param {{
 *   state: import("./dom-state.js").state,
 *   loadImageSource: (src:string, filename?:string, mimeType?:string, settingsFile?:File | null) => Promise<void>,
 *   applySettingsFile: (file: File) => Promise<void>
 * }} deps
 * @returns {Promise<void>}
 */
export async function handleFile(file, files = null, { state, loadImageSource, applySettingsFile }) {
  const allFiles = [...(files || [file])].filter(Boolean);
  const imageFile = allFiles.find(isImageFile) || (isImageFile(file) ? file : null);
  if (imageFile) {
    releaseOwnedSourceUrl(state);
    const url = URL.createObjectURL(imageFile);
    const settingsFilename = getExpectedSettingsFilename(imageFile.name || "");
    const siblingSettingsFile = allFiles.find((candidate) => candidate && isSettingsFile(candidate) && candidate.name === settingsFilename) || null;
    await loadImageSource(url, imageFile.name || "", imageFile.type || "image/jpeg", siblingSettingsFile);
    return;
  }

  const settingsFile = allFiles.find(isSettingsFile) || (isSettingsFile(file) ? file : null);
  if (settingsFile) {
    await applySettingsFile(settingsFile);
  }
}

/**
 * Load an image from a URL, reset dependent state, and kick off processing.
 *
 * @param {{
 *   src: string,
 *   filename?: string,
 *   mimeType?: string,
 *   settingsFile?: File | null,
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   setStatus: (text:string) => void,
 *   collapseAllPanels: () => void,
 *   resetNonLayoutControls: () => void,
 *   revokeGifUrl: () => void,
 *   clearAllPreviews: () => void,
 *   renderRawPreview: () => void,
 *   loadCompanionSettingsText: (src:string, filename:string, settingsFile?:File | null) => Promise<string>,
 *   applyLoadedSettingsText: (settingsText:string) => void,
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
  settingsFile = null,
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
  const settingsText = await loadCompanionSettingsText(src, filename, settingsFile);

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
      const loadedWhat = settingsText ? "Loaded image and settings." : "Loaded image.";
      if (settingsText) {
        applyLoadedSettingsText(settingsText);
      }
      invalidateAppearanceCache();
      setStatus(`${loadedWhat}\nAnalyzing page…`);
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
