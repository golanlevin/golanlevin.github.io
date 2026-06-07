/**
 * Canvas debug drawing helpers.
 *
 * These functions intentionally do not own state; callers pass all geometry and
 * toggle decisions from `main.js`. Some helpers are currently unused but kept as
 * debugging utilities for future ASM calibration work.
 */

/**
 * Draw video with cover-fit behavior.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {HTMLVideoElement} video - Source video.
 * @param {number} width - Canvas width.
 * @param {number} height - Canvas height.
 * @param {boolean} mirror - Whether to mirror horizontally.
 * @returns {{x:number,y:number,width:number,height:number}} Drawn video rectangle.
 */
export function drawVideoCover(ctx, video, width, height, mirror) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, dx, dy, dw, dh);
  } else {
    ctx.drawImage(video, dx, dy, dw, dh);
  }
  ctx.restore();
  return { x: dx, y: dy, width: dw, height: dh };
}

/**
 * Draw video stretched exactly to the canvas frame.
 *
 * This is the current mode: the canvas is resized to match the webcam frame, so
 * no aspect-ratio distortion is introduced.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {HTMLVideoElement} video - Source video.
 * @param {number} width - Canvas width.
 * @param {number} height - Canvas height.
 * @param {boolean} mirror - Whether to mirror horizontally.
 * @returns {{x:number,y:number,width:number,height:number}} Drawn video rectangle.
 */
export function drawVideoFullFrame(ctx, video, width, height, mirror) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  ctx.restore();
  return { x: 0, y: 0, width, height };
}

/**
 * Draw a triangle mesh as wireframe.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {Float64Array} mesh - Packed mesh coordinates.
 * @param {number[][]} triangles - Triangle vertex index list.
 * @param {string} color - CSS stroke color.
 * @param {number} [lineWidth=0.5] - Stroke width.
 * @param {number} [alpha=0.9] - Global opacity.
 */
export function drawMesh(ctx, mesh, triangles, color, lineWidth = 0.5, alpha = 0.9) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  for (const tri of triangles) {
    const a = tri[0] * 2;
    const b = tri[1] * 2;
    const c = tri[2] * 2;
    ctx.beginPath();
    ctx.moveTo(mesh[a], mesh[a + 1]);
    ctx.lineTo(mesh[b], mesh[b + 1]);
    ctx.lineTo(mesh[c], mesh[c + 1]);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a closed packed contour.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {Float64Array} contour - Packed contour coordinates.
 * @param {string} color - CSS stroke color.
 * @param {number} [lineWidth=2] - Stroke width.
 * @param {number} [alpha=1] - Global opacity.
 */
export function drawContour(ctx, contour, color, lineWidth = 2, alpha = 1) {
  const n = contour.length / 2;
  if (!n) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(contour[0], contour[1]);
  for (let i = 1; i < n; i += 1) ctx.lineTo(contour[2 * i], contour[2 * i + 1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw MediaPipe landmarks with numeric labels.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {Array<{x:number,y:number}>} landmarks - 21 pixel-space landmarks.
 */
export function drawLandmarks(ctx, landmarks) {
  ctx.save();
  ctx.fillStyle = "#10b981";
  ctx.strokeStyle = "#06110d";
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui";
  for (let i = 0; i < landmarks.length; i += 1) {
    const p = landmarks[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillText(String(i), p.x + 5, p.y - 4);
  }
  ctx.restore();
}

/**
 * Draw the current gradient-preparation ROI.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {{x:number,y:number,width:number,height:number}} roi - ROI rectangle.
 */
export function drawRoi(ctx, roi) {
  ctx.save();
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(roi.x, roi.y, roi.width, roi.height);
  ctx.restore();
}

/**
 * Draw per-contour-vertex confidence bubbles.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {Float64Array} contour - Packed contour coordinates.
 * @param {Float64Array} confidence - Per-vertex confidence values in `[0,1]`.
 */
export function drawConfidence(ctx, contour, confidence) {
  ctx.save();
  for (let i = 0; i < contour.length / 2; i += 1) {
    const c = confidence[i];
    ctx.fillStyle = `rgba(${Math.round(255 * c)}, ${Math.round(120 + 100 * c)}, 40, 0.9)`;
    ctx.beginPath();
    ctx.arc(contour[2 * i], contour[2 * i + 1], 2.5 + 3 * c, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw displacement arrows between two packed contours.
 *
 * @param {CanvasRenderingContext2D} ctx - Output canvas context.
 * @param {Float64Array} from - Packed source contour.
 * @param {Float64Array} to - Packed target contour.
 * @param {number} [stride=3] - Draw every Nth arrow.
 */
export function drawArrows(ctx, from, to, stride = 3) {
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
  ctx.fillStyle = "#f59e0b";
  ctx.lineWidth = 1;
  for (let i = 0; i < from.length / 2; i += stride) {
    const x0 = from[2 * i];
    const y0 = from[2 * i + 1];
    const x1 = to[2 * i];
    const y1 = to[2 * i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.hypot(dx, dy) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x1, y1, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
