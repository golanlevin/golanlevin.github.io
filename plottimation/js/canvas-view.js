/**
 * Copy an HTML image element into a canvas at native resolution.
 *
 * @param {HTMLImageElement} image
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
export function drawImageToCanvas(image, canvas) {
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

/**
 * Render one canvas into another while preserving aspect ratio and centering.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {HTMLCanvasElement} targetCanvas
 * @returns {void}
 */
export function renderCanvasFit(sourceCanvas, targetCanvas) {
  resizeCanvasToBox(targetCanvas);
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  const scale = Math.min(targetCanvas.width / sourceCanvas.width, targetCanvas.height / sourceCanvas.height);
  const drawW = sourceCanvas.width * scale;
  const drawH = sourceCanvas.height * scale;
  const offsetX = (targetCanvas.width - drawW) * 0.5;
  const offsetY = (targetCanvas.height - drawH) * 0.5;
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);
}

/**
 * Resize a canvas backing store to match its CSS display box in device-independent pixels.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
export function resizeCanvasToBox(canvas) {
  const box = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  if ((canvas.width !== width) || (canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
}
