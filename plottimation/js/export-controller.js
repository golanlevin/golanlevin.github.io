/**
 * Export-controller helpers.
 *
 * This module owns export-file naming, blob downloads, GIF/MP4/ZIP generation, and the small
 * bits of export UI state that are tightly coupled to those flows.
 */
import { createStoredZip } from "./zip-builder.js";

const MP4_MUXER_MODULE_URL = "./vendor/mp4-muxer.esm.js";
let mp4MuxerModulePromise = null;

/**
 * Set the Export GIF button label, optionally with an in-progress percentage suffix.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {number | null} [progressPercent=null]
 * @returns {void}
 */
export function updateExportButtonLabel(dom, progressPercent = null) {
  dom.exportButton.textContent = (typeof progressPercent === "number")
    ? `Export GIF ...${progressPercent}%`
    : "Export GIF";
}

/**
 * Revoke and hide any previously exported GIF URL.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   updateAnimationPreviewHeading: () => void,
 * }} deps
 * @returns {void}
 */
export function revokeGifUrl({ dom, state, updateAnimationPreviewHeading }) {
  if (!state.export.url) return;
  URL.revokeObjectURL(state.export.url);
  state.export.url = "";
  state.export.filename = "";
  dom.gifPreviewCanvas.hidden = false;
  dom.gifImage.classList.add("hidden");
  dom.gifImage.hidden = true;
  dom.gifImage.removeAttribute("src");
  dom.gifPreviewCanvas.parentElement?.classList.add("is-empty");
  updateAnimationPreviewHeading();
}

/**
 * Strip unsupported characters from a filename stem.
 *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilenameBase(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "frame_sheet";
}

/**
 * Trigger a download for an in-memory blob with a caller-supplied filename.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {void}
 */
export function downloadBlobWithFilename(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Build a timestamped archive stem shared by ZIP exports and other animation-file outputs.
 *
 * @param {string} sourceFilename
 * @param {number} [width=0]
 * @param {number} [height=0]
 * @returns {string}
 */
export function makeArchiveStem(sourceFilename, width = 0, height = 0) {
  const base = sanitizeFilenameBase(sourceFilename || "frame_sheet");
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const safeWidth = Math.max(1, Math.round(width || 0));
  const safeHeight = Math.max(1, Math.round(height || 0));
  const sizePart = (safeWidth > 0 && safeHeight > 0) ? `_${safeWidth}x${safeHeight}` : "";
  return `${base}_anim_${yy}${mm}${dd}${hh}${mi}${ss}${sizePart}`;
}

/**
 * Build a friendly exported GIF filename from the source name, compact timestamp, size, and quality.
 *
 * @param {string} sourceFilename
 * @param {number} [quality=75]
 * @param {number} [width=0]
 * @param {number} [height=0]
 * @returns {string}
 */
export function makeGifFilename(sourceFilename, quality = 75, width = 0, height = 0) {
  return `${makeArchiveStem(sourceFilename, width, height)}_q${quality}.gif`;
}

/**
 * Build an MP4 filename parallel to the GIF export naming scheme.
 *
 * @param {string} sourceFilename
 * @param {number} [quality=75]
 * @param {number} [width=0]
 * @param {number} [height=0]
 * @returns {string}
 */
export function makeMp4Filename(sourceFilename, quality = 75, width = 0, height = 0) {
  return `${makeArchiveStem(sourceFilename, width, height)}_q${quality}.mp4`;
}

/**
 * Build a ZIP filename for frame export.
 *
 * @param {string} sourceFilename
 * @param {number} [width=0]
 * @param {number} [height=0]
 * @returns {string}
 */
export function makeZipFilename(sourceFilename, width = 0, height = 0) {
  return `${makeArchiveStem(sourceFilename, width, height)}.zip`;
}

/**
 * Lazy-load the vendored mp4-muxer ESM module the first time MP4 export is requested.
 *
 * @returns {Promise<typeof import("./vendor/mp4-muxer.esm.js")>}
 */
function loadMp4MuxerModule() {
  if (!mp4MuxerModulePromise) {
    mp4MuxerModulePromise = import(MP4_MUXER_MODULE_URL);
  }
  return mp4MuxerModulePromise;
}

/**
 * Ensure tiny exported GIFs are still legible in the on-page preview panel.
 *
 * The file itself is unchanged; this only sets CSS display size for the previewed `<img>`.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {number} width
 * @param {number} height
 * @returns {void}
 */
function applyGifPreviewDisplaySize(dom, width, height) {
  const safeWidth = Math.max(1, Math.round(width || 1));
  const safeHeight = Math.max(1, Math.round(height || 1));
  const minDisplay = 32;
  const scale = (Math.min(safeWidth, safeHeight) < minDisplay)
    ? (minDisplay / Math.min(safeWidth, safeHeight))
    : 1;
  dom.gifImage.style.width = `${Math.max(minDisplay, Math.round(safeWidth * scale))}px`;
  dom.gifImage.style.height = `${Math.max(minDisplay, Math.round(safeHeight * scale))}px`;
}

/**
 * Estimate a target H.264 bitrate from dimensions, frame rate, and the shared quality slider.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 * @param {number} quality
 * @returns {number}
 */
function estimateMp4Bitrate(width, height, fps, quality) {
  const q = Math.max(0, Math.min(100, quality)) / 100;
  const bitsPerPixelPerFrame = 0.75 + (q * 3.25);
  return Math.max(500_000, Math.round(width * height * fps * bitsPerPixelPerFrame));
}

/**
 * Clamp MP4 export dimensions to be at least 16x16 and even-valued for H.264 friendliness.
 *
 * @param {HTMLCanvasElement | null} sourceCanvas
 * @returns {{width:number, height:number}}
 */
function getMp4ExportDimensions(sourceCanvas) {
  const safeWidth = Math.max(1, Math.round(sourceCanvas?.width || 1));
  const safeHeight = Math.max(1, Math.round(sourceCanvas?.height || 1));
  const minEdge = 16;
  const minCurrentEdge = Math.min(safeWidth, safeHeight);
  const scale = minCurrentEdge < minEdge ? (minEdge / minCurrentEdge) : 1;
  const evenize = (value) => {
    const rounded = Math.max(minEdge, Math.round(value));
    return (rounded % 2 === 0) ? rounded : (rounded + 1);
  };
  return {
    width: evenize(safeWidth * scale),
    height: evenize(safeHeight * scale),
  };
}

/**
 * Draw one prepared animation frame into the staging canvas used for MP4 encoding.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {HTMLCanvasElement} targetCanvas
 * @returns {void}
 */
function drawFrameIntoMp4Canvas(sourceCanvas, targetCanvas) {
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
}

/**
 * Encode a canvas as PNG bytes for ZIP frame export.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Uint8Array>}
 */
async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Could not encode PNG frame.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Materialize all adjusted frames and hand them off to gif.js for encoding.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   readConfig: () => any,
 *   getExportOrderedFrameCount: () => number,
 *   getExportOrderedFrameIndex: (index:number) => number,
 *   getAdjustedFrameCanvas: (index:number) => HTMLCanvasElement | null,
 *   revokeGifUrl: () => void,
 *   updateAnimationPreviewHeading: () => void,
 *   updateExportControlsAvailability: (forceDisabled?:boolean) => void,
 *   setStatus: (text:string) => void,
 * }} deps
 * @returns {Promise<void>}
 */
export async function exportGif(deps) {
  const {
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
  } = deps;
  const orderedFrameCount = getExportOrderedFrameCount();
  if (!orderedFrameCount) return;
  updateExportControlsAvailability(true);
  updateExportButtonLabel(dom, 0);
  setStatus("Encoding GIF…");

  const config = readConfig();
  const firstFrame = getAdjustedFrameCanvas(getExportOrderedFrameIndex(0));
  if (!firstFrame) {
    updateExportControlsAvailability();
    updateExportButtonLabel(dom);
    return;
  }

  const gif = new GIF({
    workers: 2,
    quality: config.exportOptions.quality,
    width: firstFrame.width,
    height: firstFrame.height,
    repeat: 0,
    dither: config.exportOptions.dither,
    globalPalette: config.exportOptions.globalPalette,
    workerScript: "js/gif.worker.js",
  });

  const delay = Math.max(1, Math.round(1000 / config.fps));
  for (let i = 0; i < orderedFrameCount; i++) {
    gif.addFrame(getAdjustedFrameCanvas(getExportOrderedFrameIndex(i)), { copy: true, delay });
  }

  gif.on("finished", (blob) => {
    revokeGifUrl();
    state.export.filename = makeGifFilename(
      state.source.filename,
      config.exportOptions.encodingQuality,
      firstFrame.width,
      firstFrame.height
    );
    state.export.url = URL.createObjectURL(blob);
    dom.gifImage.src = state.export.url;
    applyGifPreviewDisplaySize(dom, firstFrame.width, firstFrame.height);
    dom.gifPreviewCanvas.hidden = true;
    dom.gifImage.classList.remove("hidden");
    dom.gifImage.hidden = false;
    dom.gifPreviewCanvas.parentElement?.classList.remove("is-empty");
    updateAnimationPreviewHeading();
    downloadBlobWithFilename(blob, state.export.filename);
    updateExportControlsAvailability();
    updateExportButtonLabel(dom);
    setStatus("GIF ready.\nFrame count: " + state.geometry.frameCount);
  });
  gif.on("progress", (progress) => {
    const progressPercent = Math.round(progress * 100);
    updateExportButtonLabel(dom, progressPercent);
    setStatus("Encoding GIF…\n" + progressPercent + "%");
  });
  gif.render();
}

/**
 * Encode the ordered frame sequence as an H.264 MP4 using WebCodecs plus mp4-muxer.
 *
 * @param {{
 *   state: import("./dom-state.js").state,
 *   readConfig: () => any,
 *   getExportOrderedFrameCount: () => number,
 *   getExportOrderedFrameIndex: (index:number) => number,
 *   getAdjustedFrameCanvas: (index:number) => HTMLCanvasElement | null,
 *   updateExportControlsAvailability: (forceDisabled?:boolean) => void,
 *   setStatus: (text:string) => void,
 * }} deps
 * @returns {Promise<void>}
 */
export async function exportMp4(deps) {
  const {
    state,
    readConfig,
    getExportOrderedFrameCount,
    getExportOrderedFrameIndex,
    getAdjustedFrameCanvas,
    updateExportControlsAvailability,
    setStatus,
  } = deps;
  if (!state.runtime.mp4ExportSupported) return;
  const orderedFrameCount = getExportOrderedFrameCount();
  if (!orderedFrameCount) return;
  updateExportControlsAvailability(true);
  setStatus("Encoding MP4…");

  const config = readConfig();
  const firstFrame = getAdjustedFrameCanvas(getExportOrderedFrameIndex(0));
  if (!firstFrame) {
    updateExportControlsAvailability();
    return;
  }

  const mp4Size = getMp4ExportDimensions(firstFrame);
  const encoderCanvas = document.createElement("canvas");
  encoderCanvas.width = mp4Size.width;
  encoderCanvas.height = mp4Size.height;
  drawFrameIntoMp4Canvas(firstFrame, encoderCanvas);

  try {
    const { Muxer, ArrayBufferTarget } = await loadMp4MuxerModule();
    const bitrate = estimateMp4Bitrate(mp4Size.width, mp4Size.height, config.fps, config.exportOptions.mp4Quality);
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      fastStart: "in-memory",
      video: {
        codec: "avc",
        width: mp4Size.width,
        height: mp4Size.height,
      },
    });
    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        encoderError = error;
      },
    });
    encoder.configure({
      codec: state.runtime.mp4Codec,
      width: mp4Size.width,
      height: mp4Size.height,
      bitrate,
      framerate: config.fps,
      avc: { format: "avc" },
      latencyMode: "quality",
    });

    const frameDurationUs = Math.max(1, Math.round(1_000_000 / config.fps));
    const keyframeInterval = 2;
    for (let i = 0; i < orderedFrameCount; i++) {
      const frameCanvas = getAdjustedFrameCanvas(getExportOrderedFrameIndex(i));
      if (!frameCanvas) {
        throw new Error("Could not prepare one or more frames for MP4 export.");
      }
      drawFrameIntoMp4Canvas(frameCanvas, encoderCanvas);
      const timestampUs = i * frameDurationUs;
      const frame = new VideoFrame(encoderCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });
      encoder.encode(frame, { keyFrame: i === 0 || (i % keyframeInterval) === 0 });
      frame.close();
      if (encoderError) {
        throw encoderError;
      }
      setStatus(`Encoding MP4…\n${Math.round(((i + 1) / orderedFrameCount) * 100)}%`);
    }
    await encoder.flush();
    if (encoderError) {
      throw encoderError;
    }
    encoder.close();
    muxer.finalize();
    const mp4Blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    downloadBlobWithFilename(
      mp4Blob,
      makeMp4Filename(
        state.source.filename,
        config.exportOptions.encodingQuality,
        mp4Size.width,
        mp4Size.height
      )
    );
    setStatus(`MP4 ready.\nFrame count: ${orderedFrameCount}`);
  } catch (error) {
    console.error(error);
    setStatus(`MP4 export failed.\n(${error?.message || String(error)})`);
  } finally {
    updateExportControlsAvailability();
  }
}

/**
 * Export the current ordered animation frames as a ZIP archive of PNG files.
 *
 * @param {{
 *   state: import("./dom-state.js").state,
 *   readConfig: () => any,
 *   getExportOrderedFrameCount: () => number,
 *   getExportOrderedFrameIndex: (index:number) => number,
 *   getAdjustedFrameCanvas: (index:number) => HTMLCanvasElement | null,
 *   buildSettingsTsv: (config:any) => string,
 *   makeSettingsFilename: (sourceFilename:string) => string,
 *   updateExportControlsAvailability: (forceDisabled?:boolean) => void,
 *   setStatus: (text:string) => void,
 *   updateExportButtonLabel: () => void,
 * }} deps
 * @returns {Promise<void>}
 */
export async function exportZip(deps) {
  const {
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
  } = deps;
  const orderedFrameCount = getExportOrderedFrameCount();
  if (!orderedFrameCount) return;
  updateExportControlsAvailability(true);
  setStatus("Preparing ZIP…");

  try {
    const config = readConfig();
    const base = sanitizeFilenameBase(state.source.filename || "frame_sheet");
    const archiveStem = makeArchiveStem(
      state.source.filename,
      config.exportOptions.outputWidthPx,
      config.exportOptions.outputHeightPx
    );
    const rootDir = `${archiveStem}/`;
    const framesDir = `${rootDir}frames/`;
    const settingsBytes = new TextEncoder().encode(buildSettingsTsv(config));
    const entries = [
      { name: rootDir, data: new Uint8Array(0), isDirectory: true },
      { name: framesDir, data: new Uint8Array(0), isDirectory: true },
      { name: `${rootDir}${makeSettingsFilename(state.source.filename)}`, data: settingsBytes },
    ];
    for (let i = 0; i < orderedFrameCount; i++) {
      const frameCanvas = getAdjustedFrameCanvas(getExportOrderedFrameIndex(i));
      if (!frameCanvas) {
        throw new Error("Could not prepare one or more frames for ZIP export.");
      }
      const pngBytes = await canvasToPngBytes(frameCanvas);
      const frameNumber = String(i).padStart(3, "0");
      entries.push({
        name: `${framesDir}${base}_anim_${frameNumber}.png`,
        data: pngBytes,
      });
    }

    const zipBlob = createStoredZip(entries);
    downloadBlobWithFilename(
      zipBlob,
      makeZipFilename(
        state.source.filename,
        config.exportOptions.outputWidthPx,
        config.exportOptions.outputHeightPx
      )
    );
    setStatus(`ZIP ready.\nFrame count: ${orderedFrameCount}`);
  } catch (error) {
    console.error(error);
    setStatus(`ZIP export failed.\n(${error?.message || String(error)})`);
  } finally {
    updateExportControlsAvailability();
    updateExportButtonLabel();
  }
}

/**
 * Download the same settings manifest used inside ZIP export as a standalone text file.
 *
 * @param {{
 *   state: import("./dom-state.js").state,
 *   readConfig: () => any,
 *   buildSettingsTsv: (config:any) => string,
 *   makeSettingsFilename: (sourceFilename:string) => string,
 * }} deps
 * @returns {void}
 */
export function saveSettingsFile(deps) {
  const { state, readConfig, buildSettingsTsv, makeSettingsFilename } = deps;
  if (!state.geometry.frameCount) return;
  const config = readConfig();
  const settingsText = buildSettingsTsv(config);
  const blob = new Blob([settingsText], { type: "text/plain;charset=utf-8" });
  downloadBlobWithFilename(blob, makeSettingsFilename(state.source.filename));
}
