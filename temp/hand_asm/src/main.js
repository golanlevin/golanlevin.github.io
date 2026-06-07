/**
 * Browser demo orchestration for the hand PDM/ASM runtime.
 *
 * Frame pipeline:
 *   1. Draw the webcam frame into the visible canvas.
 *   2. Run the exact JS MediaPipe hand detector.
 *   3. Fit the 151-vertex PDM to MediaPipe landmarks.
 *   4. Extract the 95-point native boundary contour.
 *   5. Prepare an ROI-limited gradient/chroma image.
 *   6. Run ASM-style normal search to find image-edge contour candidates.
 *   7. Blend PDM contour toward ASM candidates to form the Final Contour.
 *   8. TPS-warp the 151-vertex mesh so the boundary follows the Final Contour.
 *   9. Build Frankenmesh2 by overriding five TPS vertices with MediaPipe points.
 *  10. Draw selected debug layers and timing metrics.
 */

import { ContourAsm, RoiGradient, computeHandRoi, extractContour } from "./contour-asm.js?v=20260607-30";
import { Frankenmesh2Builder } from "./frankenmesh2-builder.js?v=20260607-28";
import { HandModelLoader } from "./model-loader.js?v=20260607-28";
import { MediaPipeHandAdapter } from "./mediapipe-adapter.js?v=20260607-28";
import { PdmFitter } from "./pdm-fitter.js?v=20260607-28";
import { RollingMedian } from "./math.js?v=20260607-28";
import { TpsDeformer, triangleStats } from "./tps-deform.js?v=20260607-28";
import {
  drawContour,
  drawLandmarks,
  drawMesh,
  drawVideoFullFrame,
} from "./render.js?v=20260607-28";

const els = {
  video: document.getElementById("video"),
  view: document.getElementById("view"),
  work: document.getElementById("work"),
  status: document.getElementById("status"),
  perf: document.getElementById("perf"),
  modelPreset: document.getElementById("modelPreset"),
  edgeSnapAmount: document.getElementById("edgeSnapAmount"),
  searchRadius: document.getElementById("searchRadius"),
  distancePenalty: document.getElementById("distancePenalty"),
  skinWeight: document.getElementById("skinWeight"),
  offsetSmoothing: document.getElementById("offsetSmoothing"),
  curvatureWeight: document.getElementById("curvatureWeight"),
  temporalWeight: document.getElementById("temporalWeight"),
  temporalGain: document.getElementById("temporalGain"),
  mirrorVideo: document.getElementById("mirrorVideo"),
  edgeSnapAmountValue: document.getElementById("edgeSnapAmountValue"),
  searchRadiusValue: document.getElementById("searchRadiusValue"),
  distancePenaltyValue: document.getElementById("distancePenaltyValue"),
  skinWeightValue: document.getElementById("skinWeightValue"),
  offsetSmoothingValue: document.getElementById("offsetSmoothingValue"),
  curvatureWeightValue: document.getElementById("curvatureWeightValue"),
  temporalWeightValue: document.getElementById("temporalWeightValue"),
  temporalGainValue: document.getElementById("temporalGainValue"),
};

const toggles = {
  showLandmarks: document.getElementById("showLandmarks"),
  showPdmMesh: document.getElementById("showPdmMesh"),
  showRawContour: document.getElementById("showRawContour"),
  showHybridContour: document.getElementById("showHybridContour"),
  showFinalMesh: document.getElementById("showFinalMesh"),
  showFrankenmesh2: document.getElementById("showFrankenmesh2"),
};

const ctx = els.view.getContext("2d");
const workCtx = els.work.getContext("2d", { willReadFrequently: true });
const loader = new HandModelLoader();
const fitter = new PdmFitter();
const asm = new ContourAsm(128);
const gradient = new RoiGradient();
const tps = new TpsDeformer();
const frankenmesh2Builder = new Frankenmesh2Builder();
const mp = new MediaPipeHandAdapter({ maxHands: 1, delegate: "GPU" });

let model = null;
let running = false;
let pdmContour = null;
let finalMesh = null;
let canvasWidth = 1280;
let canvasHeight = 720;

const timers = {
  mediaPipe: new RollingMedian(60),
  pdmFit: new RollingMedian(60),
  roiPrep: new RollingMedian(60),
  asmSearch: new RollingMedian(60),
  blend: new RollingMedian(60),
  tps: new RollingMedian(60),
  frankenmesh2: new RollingMedian(60),
  render: new RollingMedian(60),
  total: new RollingMedian(60),
};

/**
 * Set the status text in the side panel.
 *
 * @param {string} text - User-visible status.
 */
function status(text) {
  els.status.textContent = text;
}

/**
 * Load the currently selected model preset and allocate model-sized buffers.
 *
 * @returns {Promise<void>}
 */
async function loadSelectedModel() {
  status("loading model");
  model = await loader.load(els.modelPreset.value);
  pdmContour = new Float64Array(model.boundary.length * 2);
  finalMesh = new Float64Array(model.nVertices * 2);
  status(`${model.preset} ${model.nModes}m ready`);
}

/**
 * Read all UI controls into a plain object for the current frame.
 *
 * @returns {object} Runtime control state.
 */
function controls() {
  return {
    snapPreset: "direct",
    edgeSnapAmount: Number.parseFloat(els.edgeSnapAmount.value),
    searchRadiusPercent: Number.parseFloat(els.searchRadius.value),
    distancePenalty: Number.parseFloat(els.distancePenalty.value),
    profileWidth: 7,
    skinWeight: Number.parseFloat(els.skinWeight?.value ?? "0.35"),
    offsetSmoothing: Number.parseFloat(els.offsetSmoothing?.value ?? "0.35"),
    curvatureWeight: Number.parseFloat(els.curvatureWeight?.value ?? "0.25"),
    temporalWeight: Number.parseFloat(els.temporalWeight?.value ?? "0.12"),
    temporalGain: Number.parseFloat(els.temporalGain?.value ?? "0.20"),
    mirrorVideo: els.mirrorVideo.checked,
    snapWrist: false,
  };
}

/**
 * Synchronize slider readouts with their current numeric values.
 */
function updateSliderLabels() {
  const edge = Number.parseFloat(els.edgeSnapAmount.value).toFixed(2);
  const radius = `${Number.parseFloat(els.searchRadius.value).toFixed(1)}%`;
  const penalty = Number.parseFloat(els.distancePenalty.value).toFixed(3);
  const skin = Number.parseFloat(els.skinWeight?.value ?? "0.35").toFixed(2);
  const offsetSmoothing = Number.parseFloat(els.offsetSmoothing?.value ?? "0.35").toFixed(2);
  const curvatureWeight = Number.parseFloat(els.curvatureWeight?.value ?? "0.25").toFixed(2);
  const temporalWeight = Number.parseFloat(els.temporalWeight?.value ?? "0.12").toFixed(2);
  const temporalGain = Number.parseFloat(els.temporalGain?.value ?? "0.20").toFixed(2);
  els.edgeSnapAmountValue.value = edge;
  els.edgeSnapAmountValue.textContent = edge;
  els.searchRadiusValue.value = radius;
  els.searchRadiusValue.textContent = radius;
  els.distancePenaltyValue.value = penalty;
  els.distancePenaltyValue.textContent = penalty;
  if (els.skinWeightValue) {
    els.skinWeightValue.value = skin;
    els.skinWeightValue.textContent = skin;
  }
  if (els.offsetSmoothingValue) {
    els.offsetSmoothingValue.value = offsetSmoothing;
    els.offsetSmoothingValue.textContent = offsetSmoothing;
  }
  if (els.curvatureWeightValue) {
    els.curvatureWeightValue.value = curvatureWeight;
    els.curvatureWeightValue.textContent = curvatureWeight;
  }
  if (els.temporalWeightValue) {
    els.temporalWeightValue.value = temporalWeight;
    els.temporalWeightValue.textContent = temporalWeight;
  }
  if (els.temporalGainValue) {
    els.temporalGainValue.value = temporalGain;
    els.temporalGainValue.textContent = temporalGain;
  }
}

/**
 * Estimate hand scale from MediaPipe landmarks for percent-based ASM radius.
 *
 * The scale is the max distance from MP0 wrist to any other landmark.
 *
 * @param {Array<{x:number,y:number}>} landmarks - MediaPipe landmarks.
 * @returns {number} Estimated hand size in pixels.
 */
function estimateHandSize(landmarks) {
  if (!landmarks?.length) return 300;
  const wrist = landmarks[0];
  let maxDist = 1;
  for (let i = 1; i < landmarks.length; i += 1) {
    const p = landmarks[i];
    const d = Math.hypot(p.x - wrist.x, p.y - wrist.y);
    if (Number.isFinite(d)) maxDist = Math.max(maxDist, d);
  }
  return maxDist;
}

/**
 * Request webcam access, initialize MediaPipe, and start the animation loop.
 *
 * @returns {Promise<void>}
 */
async function startCamera() {
  if (!model) await loadSelectedModel();
  status("starting camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });
  els.video.srcObject = stream;
  await els.video.play();
  resizeCanvasesToVideo();
  if (!mp.handLandmarker) {
    status("loading mediapipe");
    await mp.init();
  }
  running = true;
  status("running");
  requestAnimationFrame(frame);
}

/**
 * Resize visible/work canvases to exactly match the webcam frame.
 */
function resizeCanvasesToVideo() {
  const width = els.video.videoWidth || 1280;
  const height = els.video.videoHeight || 720;
  if (width === canvasWidth && height === canvasHeight) return;
  canvasWidth = width;
  canvasHeight = height;
  els.view.width = canvasWidth;
  els.view.height = canvasHeight;
  els.work.width = canvasWidth;
  els.work.height = canvasHeight;
}

/**
 * Draw all enabled debug layers for the current frame.
 *
 * @param {object} state - Geometry and landmark state for rendering.
 */
function renderDebug(state) {
  const renderStart = performance.now();
  if (toggles.showPdmMesh.checked) drawMesh(ctx, state.pdmMesh, model.triangles, "#2563eb", 0.55, 0.28);
  if (toggles.showFinalMesh.checked) drawMesh(ctx, state.finalMesh, model.triangles, "#ff3bd5", 0.7, 0.5);
  if (toggles.showFrankenmesh2?.checked) drawMesh(ctx, state.frankenmesh2, model.triangles, "cyan", 0.85, 0.37);
  if (toggles.showRawContour.checked) drawContour(ctx, state.rawContour, "rgb(0,0,255)", 1.3, 0.95);
  if (toggles.showHybridContour.checked) drawContour(ctx, state.hybridContour, "rgb(0,255,0)", 2, 0.95);
  if (toggles.showLandmarks.checked) drawLandmarks(ctx, state.landmarks);
  timers.render.push(performance.now() - renderStart);
}

/**
 * Format the rolling timing and diagnostic text panel.
 *
 * @param {object} [extra] - Per-frame diagnostic fields.
 * @returns {string} Multiline panel text.
 */
function perfText(extra) {
  return [
    `model: ${model?.preset ?? "-"} (${model?.nModes ?? "-"} modes)`,
    "snap: direct ASM",
    `hand: ${extra?.handedness ?? "-"} score ${extra?.score?.toFixed?.(3) ?? "-"}`,
    `hand size: ${extra?.handSize?.toFixed?.(1) ?? "-"} px`,
    `search radius: ${extra?.searchRadiusPx ?? "-"} px`,
    `profile width: ${extra?.profileWidth ?? "-"} taps`,
    `skin chroma: ${extra?.skinSamples ?? "-"} pts`,
    `offset smooth: ${extra?.offsetSmoothing?.toFixed?.(2) ?? "-"}`,
    `curvature: ${extra?.curvatureWeight?.toFixed?.(2) ?? "-"}`,
    `temporal: ${extra?.temporalWeight?.toFixed?.(2) ?? "-"} / gain ${extra?.temporalGain?.toFixed?.(2) ?? "-"}`,
    `flips TPS/F2: ${extra?.flips ?? "-"} degenerate TPS/F2: ${extra?.degenerates ?? "-"}`,
    "",
    `MediaPipe       ${timers.mediaPipe.value().toFixed(2)} ms`,
    `PDM fit         ${timers.pdmFit.value().toFixed(2)} ms`,
    `ROI gradient    ${timers.roiPrep.value().toFixed(2)} ms`,
    `ASM search      ${timers.asmSearch.value().toFixed(2)} ms`,
    `hybrid blend    ${timers.blend.value().toFixed(2)} ms`,
    `TPS deform      ${timers.tps.value().toFixed(2)} ms`,
    `Frankenmesh2    ${timers.frankenmesh2.value().toFixed(2)} ms`,
    `render          ${timers.render.value().toFixed(2)} ms`,
    `total           ${timers.total.value().toFixed(2)} ms`,
  ].join("\n");
}

/**
 * Draw a small no-hand message and update timing when MediaPipe finds no hand.
 *
 * @param {{x:number,y:number,width:number,height:number}} rect - Drawn video rectangle.
 * @param {number} mediaPipeMs - MediaPipe elapsed time.
 */
function drawNoHand(rect, mediaPipeMs) {
  timers.mediaPipe.push(mediaPipeMs ?? 0);
  ctx.fillStyle = "rgba(8, 10, 14, 0.65)";
  ctx.fillRect(12, 12, 170, 32);
  ctx.fillStyle = "#eef2f6";
  ctx.font = "13px system-ui";
  ctx.fillText("No hand detected", 24, 33);
  els.perf.textContent = perfText();
}

/**
 * Main animation-frame callback.
 *
 * This function is intentionally linear and explicit. The runtime is still in a
 * research/prototyping phase, so keeping the stage boundaries visible is more
 * valuable than abstracting the pipeline into many tiny dispatch layers.
 */
function frame() {
  if (!running) return;
  const totalStart = performance.now();
  const c = controls();
  resizeCanvasesToVideo();
  const videoRect = drawVideoFullFrame(ctx, els.video, canvasWidth, canvasHeight, c.mirrorVideo);
  workCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  workCtx.drawImage(els.view, 0, 0);

  const detection = mp.detect(els.video, videoRect, c.mirrorVideo);
  if (!detection?.hands?.length) {
    drawNoHand(videoRect, detection?.mediaPipeMs);
    timers.total.push(performance.now() - totalStart);
    requestAnimationFrame(frame);
    return;
  }
  timers.mediaPipe.push(detection.mediaPipeMs);
  const hand = detection.hands[0];
  const handSize = estimateHandSize(hand.landmarks);
  const searchRadiusPx = Math.max(1, Math.round((c.searchRadiusPercent / 100) * handSize));

  const pdmStart = performance.now();
  const fit = fitter.fit(model, hand.landmarks);
  timers.pdmFit.push(performance.now() - pdmStart);
  extractContour(fit.mesh, model, pdmContour);

  const roi = computeHandRoi(pdmContour, canvasWidth, canvasHeight, searchRadiusPx + 32);
  const roiStart = performance.now();
  gradient.prepare(els.work, roi);
  const skinModel = gradient.estimateSkinModel(hand.landmarks);
  timers.roiPrep.push(performance.now() - roiStart);

  const asmStart = performance.now();
  const search = asm.search(pdmContour, model, gradient, {
    searchRadius: searchRadiusPx,
    distancePenalty: c.distancePenalty,
    profileWidth: c.profileWidth,
    skinWeight: c.skinWeight,
    offsetSmoothing: c.offsetSmoothing,
    curvatureWeight: c.curvatureWeight,
    temporalWeight: c.temporalWeight,
    temporalGain: c.temporalGain,
    landmarks: hand.landmarks,
  });
  timers.asmSearch.push(performance.now() - asmStart);

  const blendStart = performance.now();
  const blend = asm.blend(pdmContour, model, c.snapPreset, {
    edgeSnapAmount: c.edgeSnapAmount,
    snapWrist: c.snapWrist,
  });
  timers.blend.push(performance.now() - blendStart);

  const tpsStart = performance.now();
  tps.build(pdmContour, blend.hybridContour);
  finalMesh = tps.apply(fit.mesh, finalMesh);
  const tri = triangleStats(fit.mesh, finalMesh, model.triangles);
  timers.tps.push(performance.now() - tpsStart);

  const frankenmesh2Start = performance.now();
  const frankenmesh2 = frankenmesh2Builder.build(finalMesh, hand.landmarks);
  const franken2Tri = triangleStats(fit.mesh, frankenmesh2, model.triangles);
  timers.frankenmesh2.push(performance.now() - frankenmesh2Start);

  renderDebug({
    pdmMesh: fit.mesh,
    finalMesh,
    frankenmesh2,
    pdmContour,
    rawContour: search.rawContour,
    hybridContour: blend.hybridContour,
    landmarks: hand.landmarks,
  });
  timers.total.push(performance.now() - totalStart);
  els.perf.textContent = perfText({
    handedness: hand.handedness,
    score: hand.score,
    handSize,
    searchRadiusPx,
    profileWidth: c.profileWidth,
    skinSamples: skinModel?.sampleCount ?? 0,
    offsetSmoothing: c.offsetSmoothing,
    curvatureWeight: c.curvatureWeight,
    temporalWeight: c.temporalWeight,
    temporalGain: c.temporalGain,
    flips: `${tri.flips} / F2 ${franken2Tri.flips}`,
    degenerates: `${tri.degenerates} / F2 ${franken2Tri.degenerates}`,
  });
  requestAnimationFrame(frame);
}

if (els.modelPreset) {
  els.modelPreset.addEventListener("change", () => {
    loadSelectedModel().catch((err) => {
      console.error(err);
      status("model error");
    });
  });
}

for (const slider of [
  els.edgeSnapAmount,
  els.searchRadius,
  els.distancePenalty,
  els.skinWeight,
  els.offsetSmoothing,
  els.curvatureWeight,
  els.temporalWeight,
  els.temporalGain,
]) {
  if (!slider) continue;
  slider.addEventListener("input", updateSliderLabels);
  slider.addEventListener("change", updateSliderLabels);
}

updateSliderLabels();
startCamera().catch((err) => {
  console.error(err);
  status("camera error");
  els.perf.textContent = err.stack ?? String(err);
});
