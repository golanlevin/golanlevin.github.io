const Core = GelSightCore;
const APP_VERSION = "1.035";
const PREFERRED_CAMERA_FRAME_RATE = 30;
const CAMERA_RESOLUTION_OPTIONS = [
  { label: "640×480", width: 640, height: 480 },
  { label: "958×720", width: 958, height: 720 },
  { label: "1640×1232", width: 1640, height: 1232 },
  { label: "3280×2464", width: 3280, height: 2464 },
];
const DEFAULT_CAMERA_RESOLUTION = CAMERA_RESOLUTION_OPTIONS.find(
  (option) => option.width === 958 && option.height === 720,
);
const EXPORT_CAMERA_WIDTH = 3280;
const EXPORT_CAMERA_HEIGHT = 2464;
const EXPORT_CAMERA_FRAME_RATE = 15;
const ONNX_MODEL_PATHS = {
  fp32: "models/nnmini.onnx",
  quant: "models/nnmini_quant_int8.onnx",
};
const WASM_MLP_MODEL_MODE = "wasm";
const WASM_MLP_WEIGHT_PATH = "models/nnmini_mlp_weights.bin";
const WASM_MLP_FP16_MODEL_MODE = "wasm-fp16";
const WASM_MLP_FP16_WEIGHT_PATH = "models/nnmini_mlp_weights_fp16.bin";
const WASM_MLP_ASSET_VERSION = "nancheck1";
const DEFAULT_ONNX_MODEL_MODE = WASM_MLP_MODEL_MODE;
const DEFAULT_ONNX_PROVIDER_MODE = "wasm";
const DEFAULT_PREPROCESS_MODE = "webgl";
const DEFAULT_LIVE_INFERENCE_MODE = "half";
const LIVE_INFERENCE_WIDTH = 160;
const LIVE_INFERENCE_HEIGHT = 120;
const LIVE_INFERENCE_PIXELS = LIVE_INFERENCE_WIDTH * LIVE_INFERENCE_HEIGHT;
const HIGH_RESOLUTION_CAPTURE_FORMATS = {
  jpeg: {
    filename: "capture_highres.jpg",
    mimeType: "image/jpeg",
    quality: 0.92,
  },
  png: {
    filename: "capture_highres.png",
    mimeType: "image/png",
    quality: null,
  },
};
const DEFAULT_HIGH_RESOLUTION_CAPTURE_FORMAT = "jpeg";
const BASELINE_FRAME_TARGET = 50;
const EXPORT_OBJ_Z_SCALE = 1;
const MESH_LINE_WIDTH = 1;
const MESH_STEP = 2;
const MESH_SURFACE_TEXTURE_STEP = 1;
const MESH_FALLBACK_STEP = 5;
const MESH_USE_P5_WIREFRAME_FALLBACK = false;
const MESH_WIRE_OVERLAY_STEP_MULTIPLIER = 8;
const DEFAULT_INPUT_SMOOTHING_ALPHA = 0.6;
const DEFAULT_POISSON_LAMBDA = 0.0005;
const MAX_POISSON_LAMBDA = 0.01;
const DEPTH_DISPLAY_PERCENTILE_LOW = 1;
const DEPTH_DISPLAY_PERCENTILE_HIGH = 99;
const DEFAULT_DEPTH_DISPLAY_HEADROOM = 0.05;
const DEPTH_DISPLAY_EXPAND_ALPHA = 0.35;
const DEPTH_DISPLAY_CONTRACT_ALPHA = 0.004;
const DEPTH_DISPLAY_CENTER_ALPHA = 0.12;
const DEPTH_DISPLAY_MIN_SPAN = 1.0;
const DEPTH_DISPLAY_FLAT_LOCK_PERCENTILE_SPAN = 0.75;
const DEPTH_DISPLAY_FLAT_LOCK_CENTER = 0;
const DEPTH_DISPLAY_FLAT_LOCK_DISPLAY_SPAN = 5.0;
const RESOLUTION_PROBE_CANDIDATES = [
  [3280, 2464],
  [2592, 1944],
  [1640, 1232],
  [1920, 1080],
  [1600, 1200],
  [1280, 960],
  [1280, 720],
  [960, 720],
  [958, 720],
  [800, 600],
  [640, 480],
  [320, 240],
];

const state = {
  status: "Loading runtimes...",
  cv: null,
  session: null,
  onnxModelMode: null,
  onnxModelPath: null,
  onnxProviderMode: null,
  onnxExecutionProvider: null,
  onnxProviderAttempts: [],
  video: null,
  stream: null,
  cameraEnabled: false,
  devices: [],
  cameraCapabilities: null,
  cameraSettings: null,
  cameraResolution: {
    width: DEFAULT_CAMERA_RESOLUTION.width,
    height: DEFAULT_CAMERA_RESOLUTION.height,
  },
  exportCameraSettings: null,
  exportCaptureIncluded: false,
  exportHighResolutionCapture: null,
  exportSolverDepthEncoding: null,
  captureFullFrameRequested: false,
  preprocessMode: null,
  liveInferenceMode: null,
  preprocess: null,
  cvPreprocess: null,
  webglPreprocess: null,
  featureBuffers: null,
  liveInferenceFeatureBuffers: null,
  gradientUpsampleBuffers: null,
  captureCanvas: null,
  captureCtx: null,
  exportCaptureCanvas: null,
  exportCaptureCtx: null,
  depthCanvas: null,
  depthCtx: null,
  depthImageBuffers: null,
  depthDisplayHistogram: null,
  depthDisplayRange: null,
  meshLayer: null,
  meshGl: null,
  busy: false,
  lastFrameMs: 0,
  profile: {
    last: null,
    ema: {},
    alpha: 0.18,
  },
  lastDepth: null,
  lastImageData: null,
  lastCropInfo: null,
  lastGradientSanitize: null,
  stats: null,
  baseline: null,
  baselineAccum: null,
  baselineCount: 0,
  calibrationDirty: false,
  calibrating: false,
  liveConfiguration: null,
  frameIndex: 0,
  lastVideoFrameId: null,
  sampleImage: null,
  inputSmoothingBuffer: null,
  cropFraction: 0.12,
  cropRect: {
    x: 0.12,
    y: 0.12,
    w: 0.76,
    h: 0.76,
  },
  frameRect: null,
  cropHandleRects: {
    move: null,
    scale: null,
  },
  cropDrag: {
    mode: null,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  },
  meshRect: null,
  meshPointer: {
    x: -1,
    y: -1,
    px: -1,
    py: -1,
    movedX: 0,
    movedY: 0,
    pressed: false,
    button: "none",
    wheelDeltaY: 0,
  },
};
window.__gelsightState = state;
window.__gelsightProbeResolutions = probeSelectedCameraResolutions;
window.__gelsightBenchmarkWasmMlp = benchmarkWasmMlp;

const ui = {};

/**
 * Initialize canvases, runtimes, UI controls, and globally exposed debug hooks.
 */
function setup() {
  pixelDensity(2);
  updateAppVersionLabel();
  const mainCanvas = createCanvas(windowWidth, windowHeight);
  mainCanvas.elt.addEventListener("contextmenu", (event) => {
    if (
      pointInRect(event.offsetX, event.offsetY, state.meshRect) ||
      pointInRect(event.offsetX, event.offsetY, state.frameRect)
    ) {
      event.preventDefault();
    }
  });
  mainCanvas.elt.addEventListener("pointerdown", handleCanvasPointerDown);
  mainCanvas.elt.addEventListener("pointermove", handleCanvasPointerMove);
  mainCanvas.elt.addEventListener("pointerup", handleCanvasPointerUp);
  mainCanvas.elt.addEventListener("pointercancel", handleCanvasPointerUp);
  mainCanvas.elt.addEventListener(
    "wheel",
    (event) => {
      if (pointInRect(event.offsetX, event.offsetY, state.meshRect)) {
        // p5's orbitControl runs inside an offscreen WEBGL graphics layer, so
        // wheel input from the visible canvas has to be forwarded explicitly.
        state.meshPointer.wheelDeltaY += event.deltaY;
        event.preventDefault();
      }
    },
    { passive: false },
  );
  state.preprocessMode = getPreprocessMode();
  state.liveInferenceMode = getLiveInferenceMode();
  state.preprocess = Core.makePreprocessCanvases();
  state.cvPreprocess = makeOpenCvPreprocessState();
  state.webglPreprocess = makeWebGlPreprocessState();
  state.featureBuffers = Core.makeFeatureBuffers();
  state.liveInferenceFeatureBuffers = Core.makeFeatureBuffers(
    LIVE_INFERENCE_WIDTH,
    LIVE_INFERENCE_HEIGHT,
  );
  state.gradientUpsampleBuffers = Core.makeGradientUpsampleBuffers();
  state.captureCanvas = document.createElement("canvas");
  state.captureCtx = state.captureCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  state.exportCaptureCanvas = document.createElement("canvas");
  state.exportCaptureCtx = state.exportCaptureCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  state.depthCanvas = document.createElement("canvas");
  state.depthCanvas.width = Core.WIDTH;
  state.depthCanvas.height = Core.HEIGHT;
  state.depthCtx = state.depthCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  state.depthImageBuffers = Core.makeDepthImageBuffers();
  state.depthDisplayHistogram = new Uint32Array(state.depthImageBuffers.bins);
  state.meshLayer = createGraphics(520, 360, WEBGL);
  state.meshLayer.pixelDensity(2);
  resetMeshView();
  createToolbar();
  initRuntimes();
}

/**
 * Keep the p5 canvas matched to the browser viewport.
 */
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/**
 * Main p5 animation loop: process live frames, draw panels, and update cursors.
 */
function draw() {
  const drawStart = performance.now();
  background("#111418");
  maybeProcessLiveFrame();
  const afterProcessKickoff = performance.now();
  drawPanels();
  const afterPanels = performance.now();
  updateMeshCursor();
  const afterCursor = performance.now();
  state.profile.drawLast = {
    drawTotal: afterCursor - drawStart,
    drawAfterProcessKickoff: afterProcessKickoff - drawStart,
    drawPanels: afterPanels - afterProcessKickoff,
    drawCursor: afterCursor - afterPanels,
  };
}

/**
 * Reset the 3D mesh camera when the mesh panel is double-clicked.
 */
function doubleClicked() {
  if (!pointInRect(mouseX, mouseY, state.meshRect)) {
    return undefined;
  }
  resetMeshView();
  return false;
}

/**
 * Handle keyboard diagnostics without affecting normal interaction.
 */
function keyPressed() {
  if (key === "p" || key === "P") {
    logProfileToConsole();
  }
}

/**
 * Build the fixed top toolbar and floating preview controls.
 */
function createToolbar() {
  ui.toolbar = createDiv().addClass("toolbar").parent("app");
  ui.deviceSelect = createSelect()
    .parent(ui.toolbar)
    .changed(() => startSelectedDevice());
  ui.deviceSelect.option("No camera selected", "");
  ui.cameraResolutionSelect = createSelect()
    .addClass("camera-resolution-select")
    .parent(ui.toolbar)
    .changed(handleCameraResolutionChange);
  for (const option of CAMERA_RESOLUTION_OPTIONS) {
    ui.cameraResolutionSelect.option(
      option.label,
      `${option.width}x${option.height}`,
    );
  }
  ui.cameraResolutionSelect.selected(
    `${state.cameraResolution.width}x${state.cameraResolution.height}`,
  );
  ui.enableButton = createButton("Enable Camera")
    .parent(ui.toolbar)
    .mousePressed(enableCamera);
  ui.qualityLabel = createElement("label").parent(ui.toolbar);
  ui.inferenceSelect = createSelect()
    .addClass("quality-select")
    .parent(ui.qualityLabel)
    .changed(handleInferenceQualityChange);
  ui.inferenceSelect.option("Fast (160×120)", "half");
  ui.inferenceSelect.option("Full (320×240)", "full");
  ui.inferenceSelect.selected(state.liveInferenceMode);
  ui.lambdaLabel = createElement("label").parent(ui.toolbar);
  createSpan("Lambda").parent(ui.lambdaLabel);
  ui.poissonLambda = createSlider(
    0,
    MAX_POISSON_LAMBDA,
    DEFAULT_POISSON_LAMBDA,
    0.0005,
  )
    .parent(ui.lambdaLabel)
    .input(handlePoissonLambdaInput);
  ui.calibrateButton = createButton("Calibrate")
    .parent(ui.toolbar)
    .mousePressed(startCalibration);
  ui.calibrateButton.attribute("disabled", "");
  ui.exportButton = createButton("Export")
    .parent(ui.toolbar)
    .mousePressed(exportCurrentCapture);
  ui.exportButton.attribute("disabled", "");
  ui.sampleDemo = createButton("Demo")
    .parent(ui.toolbar)
    .mousePressed(toggleDemoLiveMode);

  ui.alphaLabel = createElement("label").parent(ui.toolbar);
  createSpan("Alpha").parent(ui.alphaLabel);
  ui.inputSmoothingAlpha = createSlider(
    0,
    0.99,
    DEFAULT_INPUT_SMOOTHING_ALPHA,
    0.01,
  )
    .parent(ui.alphaLabel)
    .input(resetInputSmoothing);

  ui.zControl = createDiv().addClass("z-scale-floating").parent("app");
  createSpan("Z").parent(ui.zControl);
  ui.zScale = createSlider(1, 30, 9, 1).parent(ui.zControl);

  ui.meshInterpolationControl = createDiv()
    .addClass("mesh-interpolation-floating")
    .parent("app");
  ui.meshBilinear = createCheckbox("", true).parent(ui.meshInterpolationControl);
  createSpan("#").parent(ui.meshInterpolationControl);

  createDiv().addClass("spacer").parent(ui.toolbar);
  ui.status = createDiv(state.status).addClass("status").parent(ui.toolbar);
}

/**
 * Render the current application version and byline in the header.
 */
function updateAppVersionLabel() {
  const label = document.getElementById("app-version");
  if (label) {
    const sourceLink = document.createElement("a");
    sourceLink.href = "https://github.com/CreativeInquiry/gelsight-mini-browser-tool";
    sourceLink.textContent = "Source";
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    label.replaceChildren(
      document.createTextNode(`v. ${APP_VERSION} • by Golan Levin, 2026 • `),
      sourceLink,
    );
  }
}

/**
 * Load OpenCV, initialize inference, and discover camera devices.
 */
async function initRuntimes() {
  try {
    state.cv = typeof cv?.then === "function" ? await cv : cv;
    if (
      typeof state.cv.dct !== "function" ||
      typeof state.cv.idct !== "function"
    ) {
      throw new Error("OpenCV.js loaded, but dct/idct are missing.");
    }

    state.session = await createInferenceSession();

    setStatus(
      `Ready (${state.onnxExecutionProvider}). Load a sample or enable the GelSight camera.`,
    );
    updateToolbarAvailability();
    await refreshDevices();
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

/**
 * Create the requested inference backend, either custom WASM or ONNX Runtime.
 */
async function createInferenceSession() {
  const requestedMode = getRequestedModelMode();
  if (
    requestedMode === WASM_MLP_MODEL_MODE ||
    requestedMode === WASM_MLP_FP16_MODEL_MODE
  ) {
    return createWasmMlpSession(requestedMode);
  }
  return createOnnxSession(requestedMode);
}

/**
 * Create and warm up an ONNX Runtime session for the GelSight model.
 */
async function createOnnxSession() {
  await ensureOnnxRuntime();
  const candidates = getOnnxExecutionProviderCandidates();
  const modelPath = getOnnxModelPath(getRequestedModelMode());
  const attempts = [];
  for (const provider of candidates) {
    if (provider === "webgpu" && !navigator.gpu) {
      attempts.push({
        provider,
        ok: false,
        error: "navigator.gpu is unavailable",
      });
      continue;
    }

    try {
      setStatus(`Loading ONNX model with ${provider}...`);
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: [provider],
        graphOptimizationLevel: "all",
      });
      await warmupOnnxSession(session);
      attempts.push({ provider, ok: true });
      state.onnxExecutionProvider = provider;
      state.onnxProviderAttempts = attempts;
      console.info(`GelSight ONNX execution provider: ${provider}`);
      return session;
    } catch (error) {
      console.info(`GelSight ONNX ${provider} provider failed.`, error);
      attempts.push({
        provider,
        ok: false,
        error: error.message || String(error),
      });
    }
  }

  state.onnxProviderAttempts = attempts;
  throw new Error(
    `Could not initialize ONNX model with ${candidates.join(" or ")}.`,
  );
}

/**
 * Load ONNX Runtime only for experimental ONNX model modes.
 */
async function ensureOnnxRuntime() {
  if (typeof ort !== "undefined" && ort?.InferenceSession) {
    configureOnnxRuntime();
    return;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "node_modules/onnxruntime-web/dist/ort.all.min.js";
    script.onload = resolve;
    script.onerror = () => {
      reject(
        new Error(
          "ONNX Runtime is unavailable. The default custom WASM model does not need Node/npm; ONNX model modes require running npm install in gelsight_p5 first.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  configureOnnxRuntime();
}

/**
 * Point ONNX Runtime at its optional npm-installed WASM helper files.
 */
function configureOnnxRuntime() {
  ort.env.wasm.wasmPaths = new URL(
    "node_modules/onnxruntime-web/dist/",
    location.href,
  ).href;
  ort.env.wasm.numThreads = 1;
  if (ort.env.webgpu) {
    ort.env.webgpu.powerPreference = "high-performance";
  }
}

/**
 * Read the requested model mode from the URL or default settings.
 */
function getRequestedModelMode() {
  const requestedMode =
    new URLSearchParams(location.search).get("model") ||
    DEFAULT_ONNX_MODEL_MODE;
  return requestedMode.toLowerCase();
}

/**
 * Return true when the active model mode uses the custom WASM MLP path.
 */
function isWasmMlpMode(mode = state.onnxModelMode) {
  return mode === WASM_MLP_MODEL_MODE || mode === WASM_MLP_FP16_MODEL_MODE;
}

/**
 * Resolve a model mode to the model or weight file loaded by the app.
 */
function getOnnxModelPath(mode) {
  const path = ONNX_MODEL_PATHS[mode];
  if (path) {
    state.onnxModelMode = mode;
    state.onnxModelPath = path;
    return path;
  }

  console.info(
    `Unknown ONNX model mode "${mode}"; using ${DEFAULT_ONNX_MODEL_MODE}.`,
  );
  state.onnxModelMode = DEFAULT_ONNX_MODEL_MODE;
  state.onnxModelPath = ONNX_MODEL_PATHS[DEFAULT_ONNX_MODEL_MODE];
  return state.onnxModelPath;
}

/**
 * Load WASM MLP weights, allocate runtime buffers, and expose gradient inference methods.
 */
async function createWasmMlpSession(requestedMode = WASM_MLP_MODEL_MODE) {
  if (typeof GelSightMlpWasm !== "function") {
    throw new Error("WASM MLP loader did not initialize.");
  }

  const useFp16Weights = requestedMode === WASM_MLP_FP16_MODEL_MODE;
  const weightPath = useFp16Weights
    ? WASM_MLP_FP16_WEIGHT_PATH
    : WASM_MLP_WEIGHT_PATH;
  const weightBytesPerValue = useFp16Weights
    ? Uint16Array.BYTES_PER_ELEMENT
    : Float32Array.BYTES_PER_ELEMENT;
  setStatus(
    useFp16Weights
      ? "Loading custom WASM MLP with fp16 weights..."
      : "Loading custom WASM MLP...",
  );
  const wasmModule = await GelSightMlpWasm({
    locateFile(path) {
      return `wasm/${path}?v=${WASM_MLP_ASSET_VERSION}`;
    },
  });
  const response = await fetch(weightPath);
  if (!response.ok) {
    throw new Error(`Could not load ${weightPath}.`);
  }

  const weightBytes = new Uint8Array(await response.arrayBuffer());
  const expectedFloatCount = wasmModule._mlp_get_weight_count();
  if (weightBytes.byteLength !== expectedFloatCount * weightBytesPerValue) {
    throw new Error(
      `WASM MLP weights are ${weightBytes.byteLength} bytes; expected ${
        expectedFloatCount * weightBytesPerValue
      }.`,
    );
  }

  const weightPtr = wasmModule._malloc(weightBytes.byteLength);
  wasmModule.HEAPU8.set(weightBytes, weightPtr);
  const loaded = useFp16Weights
    ? wasmModule._mlp_load_f16(
        weightPtr,
        weightBytes.byteLength / Uint16Array.BYTES_PER_ELEMENT,
      )
    : wasmModule._mlp_load(
        weightPtr,
        weightBytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
  freeWasmPointer(wasmModule, weightPtr);
  if (!loaded) {
    throw new Error("WASM MLP rejected the packed weights.");
  }

  const featureByteCount =
    Core.PIXELS * Core.FEATURE_COUNT * Float32Array.BYTES_PER_ELEMENT;
  const gradientByteCount = Core.PIXELS * Float32Array.BYTES_PER_ELEMENT;
  const featurePtr = wasmModule._malloc(featureByteCount);
  const gxPtr = wasmModule._malloc(gradientByteCount);
  const gyPtr = wasmModule._malloc(gradientByteCount);

  const runWasmGradients = (features, pixels, runFunction) => {
    if (pixels > Core.PIXELS) {
      throw new Error(
        `WASM MLP can process at most ${Core.PIXELS} pixels per call.`,
      );
    }
    const copyStart = performance.now();
    wasmModule.HEAPF32.set(features, featurePtr >> 2);
    const afterCopy = performance.now();
    runFunction(featurePtr, gxPtr, gyPtr, pixels);
    const afterRun = performance.now();
    const gx = wasmModule.HEAPF32.subarray(gxPtr >> 2, (gxPtr >> 2) + pixels);
    const gy = wasmModule.HEAPF32.subarray(gyPtr >> 2, (gyPtr >> 2) + pixels);
    const afterViews = performance.now();
    return {
      gx,
      gy,
      timings: {
        wasmFeatureCopy: afterCopy - copyStart,
        wasmMlpRun: afterRun - afterCopy,
        wasmOutputView: afterViews - afterRun,
        wasmMlpUsPerPixel: ((afterRun - afterCopy) * 1000) / pixels,
      },
    };
  };

  const session = {
    runGradients(features, pixels = Core.PIXELS) {
      return runWasmGradients(
        features,
        pixels,
        wasmModule._mlp_run_gradients,
      );
    },
    runGradientsUnchecked(features, pixels = Core.PIXELS) {
      if (typeof wasmModule._mlp_run_gradients_unchecked !== "function") {
        throw new Error("Unchecked WASM MLP diagnostic function is unavailable.");
      }
      return runWasmGradients(
        features,
        pixels,
        wasmModule._mlp_run_gradients_unchecked,
      );
    },
    dispose() {
      freeWasmPointer(wasmModule, featurePtr);
      freeWasmPointer(wasmModule, gxPtr);
      freeWasmPointer(wasmModule, gyPtr);
    },
  };

  await warmupWasmMlpSession(session);
  state.onnxModelMode = requestedMode;
  state.onnxModelPath = weightPath;
  state.onnxProviderMode = "custom-wasm";
  state.onnxExecutionProvider = useFp16Weights
    ? "custom-wasm-mlp-fp16-weights"
    : "custom-wasm-mlp";
  state.onnxProviderAttempts = [
    { provider: state.onnxExecutionProvider, ok: true },
  ];
  console.info(`GelSight MLP execution provider: ${state.onnxExecutionProvider}`);
  return session;
}

/**
 * Safely release a WASM allocation when the module exposes a usable free function.
 */
function freeWasmPointer(wasmModule, ptr) {
  if (!ptr || typeof wasmModule?._free !== "function") {
    return;
  }
  try {
    wasmModule._free(ptr);
  } catch (error) {
    console.info("WASM free is unavailable; leaving a small startup allocation.");
    wasmModule._free = null;
  }
}

/**
 * Run one inference pass to validate and warm the custom WASM MLP.
 */
async function warmupWasmMlpSession(session) {
  const warmupFeatures = Core.makeFeatureBuffers().features;
  const output = await session.runGradients(warmupFeatures);
  if (!output.gx || !output.gy || output.gx.length !== Core.PIXELS) {
    throw new Error("WASM MLP warmup produced unexpected gradient buffers.");
  }
}

/**
 * Choose ONNX Runtime execution providers from URL parameters.
 */
function getOnnxExecutionProviderCandidates() {
  const requestedMode =
    new URLSearchParams(location.search).get("onnx") ||
    DEFAULT_ONNX_PROVIDER_MODE;
  const mode = requestedMode.toLowerCase();
  state.onnxProviderMode = mode;

  if (mode === "webgpu" || mode === "auto") {
    return ["webgpu", "wasm"];
  }
  if (mode === "wasm") {
    return ["wasm"];
  }

  console.info(
    `Unknown ONNX provider mode "${requestedMode}"; using ${DEFAULT_ONNX_PROVIDER_MODE}.`,
  );
  state.onnxProviderMode = DEFAULT_ONNX_PROVIDER_MODE;
  return ["wasm"];
}

/**
 * Choose the crop/resize preprocessing path from URL parameters.
 */
function getPreprocessMode() {
  const requestedMode =
    new URLSearchParams(location.search).get("preprocess") ||
    DEFAULT_PREPROCESS_MODE;
  const mode = requestedMode.toLowerCase();
  if (mode === "canvas" || mode === "opencv" || mode === "webgl") {
    return mode;
  }

  console.info(
    `Unknown preprocess mode "${requestedMode}"; using ${DEFAULT_PREPROCESS_MODE}.`,
  );
  return DEFAULT_PREPROCESS_MODE;
}

/**
 * Choose fast or full live inference from URL parameters.
 */
function getLiveInferenceMode() {
  const requestedMode =
    new URLSearchParams(location.search).get("inference") ||
    DEFAULT_LIVE_INFERENCE_MODE;
  const mode = requestedMode.toLowerCase();
  if (mode === "half" || mode === "full") {
    return mode;
  }

  console.info(
    `Unknown live inference mode "${requestedMode}"; using ${DEFAULT_LIVE_INFERENCE_MODE}.`,
  );
  return DEFAULT_LIVE_INFERENCE_MODE;
}

/**
 * Run one ONNX inference pass to validate model inputs and outputs.
 */
async function warmupOnnxSession(session) {
  const warmupFeatures = Core.makeFeatureBuffers().features;
  const input = new ort.Tensor("float32", warmupFeatures, [
    Core.PIXELS,
    Core.FEATURE_COUNT,
  ]);
  const output = await session.run({ features: input });
  const outputTensor = output.normal_xy || Object.values(output)[0];
  if (!outputTensor?.data || outputTensor.data.length !== Core.PIXELS * 2) {
    throw new Error("ONNX warmup produced an unexpected output tensor.");
  }
}

/**
 * Request browser camera permission and start the best available GelSight-like camera.
 */
async function enableCamera() {
  try {
    setStatus("Requesting camera permission...");
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    permissionStream.getTracks().forEach((track) => track.stop());
    state.cameraEnabled = true;
    updateToolbarAvailability();
    await refreshDevices();
    const best = chooseGelSightDevice(state.devices);
    if (best) {
      ui.deviceSelect.selected(best.deviceId);
      await startSelectedDevice();
    } else {
      setStatus("Camera permission granted. Choose a video device.");
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

/**
 * Refresh the camera list shown in the device selector.
 */
async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    setStatus("This browser does not expose mediaDevices.");
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  state.devices = devices.filter((device) => device.kind === "videoinput");
  ui.deviceSelect.html("");
  ui.deviceSelect.option("Select camera", "");
  for (let i = 0; i < state.devices.length; i += 1) {
    const device = state.devices[i];
    const label = formatCameraLabel(device.label) || `Camera ${i + 1}`;
    ui.deviceSelect.option(label, device.deviceId);
  }

  const best = chooseGelSightDevice(state.devices);
  if (best) {
    ui.deviceSelect.selected(best.deviceId);
  }
}

/**
 * Pick the most likely GelSight camera from available video inputs.
 */
function chooseGelSightDevice(devices) {
  return (
    devices.find((device) => /gelsight|gel sight|mini/i.test(device.label)) ||
    devices.find((device) => /uvc|usb/i.test(device.label)) ||
    devices[0]
  );
}

/**
 * Resolve a camera device id to a readable label.
 */
function deviceLabelForId(deviceId) {
  const index = state.devices.findIndex(
    (device) => device.deviceId === deviceId,
  );
  if (index === -1) {
    return "selected camera";
  }
  return formatCameraLabel(state.devices[index].label) || `Camera ${index + 1}`;
}

/**
 * Remove browser-supplied parenthetical device ids from camera labels.
 */
function formatCameraLabel(label) {
  return (label || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Read the selected capture resolution and store it in app state.
 */
function selectedCameraResolution() {
  const selected = ui.cameraResolutionSelect?.value();
  const option =
    CAMERA_RESOLUTION_OPTIONS.find(
      (resolution) => `${resolution.width}x${resolution.height}` === selected,
    ) || DEFAULT_CAMERA_RESOLUTION;
  state.cameraResolution = {
    width: option.width,
    height: option.height,
  };
  return state.cameraResolution;
}

/**
 * Apply a capture-resolution change and invalidate calibration state.
 */
async function handleCameraResolutionChange() {
  const previous = state.cameraResolution;
  const next = selectedCameraResolution();
  if (previous.width === next.width && previous.height === next.height) {
    return;
  }

  state.baseline = null;
  state.baselineAccum = null;
  state.baselineCount = 0;
  state.calibrationDirty = false;
  state.calibrating = false;
  resetInputSmoothing();
  resetDepthDisplayRange();
  if (state.cameraEnabled && !state.sampleImage && ui.deviceSelect.value()) {
    setStatus(`Switching camera to ${next.width}x${next.height}...`);
    try {
      await startSelectedDevice();
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    }
  } else {
    setStatus(`Camera size set to ${next.width}x${next.height}.`);
  }
}

/**
 * Start or restart the selected camera stream at the selected resolution.
 */
async function startSelectedDevice() {
  const deviceId = ui.deviceSelect.value();
  if (!deviceId) {
    return;
  }
  const cameraResolution = selectedCameraResolution();

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  resetInputSmoothing();
  resetDepthDisplayRange();
  state.lastVideoFrameId = null;

  state.video ??= document.createElement("video");
  state.video.playsInline = true;
  state.video.muted = true;
  document.body.appendChild(state.video);

  state.stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: cameraResolution.width },
      height: { ideal: cameraResolution.height },
      frameRate: { ideal: PREFERRED_CAMERA_FRAME_RATE },
    },
    audio: false,
  });
  await requestPreferredCameraResolution(state.stream);
  state.video.srcObject = state.stream;
  await state.video.play();
  await waitForVideoDimensions(state.video);
  rememberCameraTrackInfo(state.stream);
  state.cameraEnabled = true;
  state.sampleImage = null;
  updateSampleDemoButton();
  updateToolbarAvailability();
  setStatus(
    `Live camera active: ${state.cameraSettings?.width ?? state.video.videoWidth}x${
      state.cameraSettings?.height ?? state.video.videoHeight
    }`,
  );
}

/**
 * Ensure a live camera stream exists before calibration or live capture work.
 */
async function ensureLiveCamera() {
  if (state.stream && !state.sampleImage) {
    return true;
  }

  if (!ui.deviceSelect.value()) {
    await refreshDevices();
  }

  if (!ui.deviceSelect.value()) {
    const best = chooseGelSightDevice(state.devices);
    if (best) {
      ui.deviceSelect.selected(best.deviceId);
    }
  }

  if (!ui.deviceSelect.value()) {
    setStatus("Choose a camera before calibrating.");
    return false;
  }

  await startSelectedDevice();
  return true;
}

/**
 * Ask the current camera track for the selected live capture resolution.
 */
async function requestPreferredCameraResolution(stream) {
  const cameraResolution = selectedCameraResolution();
  await requestCameraResolution(
    stream,
    cameraResolution.width,
    cameraResolution.height,
    PREFERRED_CAMERA_FRAME_RATE,
    true,
  );
}

/**
 * Temporarily ask the camera for the high-resolution export capture size.
 */
async function requestExportCameraResolution(stream) {
  return requestCameraResolution(
    stream,
    EXPORT_CAMERA_WIDTH,
    EXPORT_CAMERA_HEIGHT,
    EXPORT_CAMERA_FRAME_RATE,
    true,
  );
}

/**
 * Apply exact or ideal MediaStreamTrack constraints for resolution and frame rate.
 */
async function requestCameraResolution(
  stream,
  width,
  height,
  frameRate,
  exactFirst,
) {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities || !track.applyConstraints) {
    return false;
  }

  const capabilities = track.getCapabilities();
  state.cameraCapabilities = summarizeCameraCapabilities(capabilities);
  const exactConstraints = {};
  if (
    capabilities.width &&
    isCapabilityValueAllowed(width, capabilities.width)
  ) {
    exactConstraints.width = { exact: width };
  }
  if (
    capabilities.height &&
    isCapabilityValueAllowed(height, capabilities.height)
  ) {
    exactConstraints.height = { exact: height };
  }
  if (capabilities.frameRate?.max) {
    exactConstraints.frameRate = {
      ideal: Math.min(frameRate, capabilities.frameRate.max),
    };
  }

  if (
    exactFirst &&
    exactConstraints.width &&
    exactConstraints.height &&
    Object.keys(exactConstraints).length > 0
  ) {
    try {
      await track.applyConstraints(exactConstraints);
      return true;
    } catch (error) {
      console.warn("Could not apply exact camera resolution.", error);
    }
  }

  const idealConstraints = {};
  if (capabilities.width) {
    idealConstraints.width = {
      ideal: clampCapabilityValue(width, capabilities.width),
    };
  }
  if (capabilities.height) {
    idealConstraints.height = {
      ideal: clampCapabilityValue(height, capabilities.height),
    };
  }
  if (capabilities.frameRate?.max) {
    idealConstraints.frameRate = {
      ideal: Math.min(frameRate, capabilities.frameRate.max),
    };
  }

  if (Object.keys(idealConstraints).length === 0) {
    return false;
  }

  try {
    await track.applyConstraints(idealConstraints);
    return true;
  } catch (error) {
    console.warn("Could not apply camera resolution.", error);
    return false;
  }
}

/**
 * Store current camera settings and capabilities for UI/debug/export metadata.
 */
function rememberCameraTrackInfo(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    state.cameraSettings = null;
    return;
  }
  if (track.getCapabilities) {
    state.cameraCapabilities = summarizeCameraCapabilities(
      track.getCapabilities(),
    );
  }
  state.cameraSettings = track.getSettings
    ? summarizeCameraSettings(track.getSettings())
    : null;
}

/**
 * Clamp a requested camera setting into a capability range.
 */
function clampCapabilityValue(value, capability) {
  const minValue = capability.min ?? value;
  const maxValue = capability.max ?? value;
  return Math.max(minValue, Math.min(maxValue, value));
}

/**
 * Check whether a requested camera setting is supported by the track.
 */
function isCapabilityValueAllowed(value, capability) {
  const minValue = capability.min ?? value;
  const maxValue = capability.max ?? value;
  return value >= minValue && value <= maxValue;
}

/**
 * Convert verbose MediaTrackCapabilities into export-friendly metadata.
 */
function summarizeCameraCapabilities(capabilities) {
  return {
    width: summarizeCapabilityRange(capabilities.width),
    height: summarizeCapabilityRange(capabilities.height),
    frameRate: summarizeCapabilityRange(capabilities.frameRate),
    aspectRatio: summarizeCapabilityRange(capabilities.aspectRatio),
  };
}

/**
 * Normalize a single camera capability into a simple JSON-safe value.
 */
function summarizeCapabilityRange(capability) {
  if (!capability) {
    return null;
  }
  return {
    min: capability.min ?? null,
    max: capability.max ?? null,
    step: capability.step ?? null,
  };
}

/**
 * Convert MediaTrackSettings into export-friendly metadata.
 */
function summarizeCameraSettings(settings) {
  return {
    width: settings.width ?? null,
    height: settings.height ?? null,
    frameRate: settings.frameRate ?? null,
    aspectRatio: settings.aspectRatio ?? null,
  };
}

/**
 * Try known camera resolutions and report what the browser actually grants.
 */
async function probeSelectedCameraResolutions(
  candidates = RESOLUTION_PROBE_CANDIDATES,
) {
  const deviceId = ui.deviceSelect?.value();
  if (!deviceId) {
    throw new Error("Select or enable a camera before probing resolutions.");
  }

  const results = [];
  for (const [width, height] of candidates) {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { exact: width },
          height: { exact: height },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings
        ? summarizeCameraSettings(track.getSettings())
        : {};
      results.push({
        width,
        height,
        supported: true,
        actualWidth: settings.width ?? null,
        actualHeight: settings.height ?? null,
        frameRate: settings.frameRate ?? null,
      });
    } catch (error) {
      results.push({
        width,
        height,
        supported: false,
        error: error.name || error.message,
      });
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }
  console.table(results);
  return results;
}

/**
 * Wait until a video element exposes nonzero dimensions.
 */
async function waitForVideoDimensions(video) {
  if (video.videoWidth && video.videoHeight) {
    return;
  }
  await new Promise((resolve) => {
    const finish = () => {
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("resize", finish);
      resolve();
    };
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("resize", finish, { once: true });
    setTimeout(finish, 1000);
  });
}

/**
 * Wait for a distinct camera frame when the browser supports it.
 */
async function waitForNextVideoFrame(video) {
  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 500);
      video.requestVideoFrameCallback(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Begin baseline collection from distinct live camera frames.
 */
async function startCalibration() {
  try {
    const liveReady = await ensureLiveCamera();
    if (!liveReady) {
      return;
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message);
    return;
  }

  state.baseline = null;
  state.baselineAccum = new Float32Array(Core.PIXELS);
  state.baselineCount = 0;
  state.calibrationDirty = false;
  state.calibrating = true;
  resetInputSmoothing();
  resetDepthDisplayRange();
  setStatus("Zeroing depth: keep the gel untouched.");
}

/**
 * Snapshot live camera and calibration state before entering demo mode.
 */
function rememberLiveConfiguration() {
  if (state.sampleImage) {
    return;
  }

  const deviceId = ui.deviceSelect?.value?.() || null;
  state.liveConfiguration = {
    deviceId,
    cameraResolution: {
      width: state.cameraResolution.width,
      height: state.cameraResolution.height,
    },
    liveInferenceMode: state.liveInferenceMode,
    cropFraction: state.cropFraction,
    cropRect: { ...state.cropRect },
    inputSmoothingAlpha: inputSmoothingAlpha(),
    poissonLambda: poissonLambda(),
    baseline: state.baseline ? new Float32Array(state.baseline) : null,
    baselineCount: state.baseline ? state.baselineCount : 0,
    calibrationDirty: state.calibrationDirty,
    cameraWasEnabled: state.cameraEnabled,
  };
}

/**
 * Switch between demo ZIP mode and the most recently saved live configuration.
 */
async function toggleDemoLiveMode() {
  if (state.sampleImage) {
    await restoreLiveConfiguration();
    return;
  }
  rememberLiveConfiguration();
  await loadSampleZip("captures/gelsight_demo.zip");
}

/**
 * Return from demo mode to the saved live camera, crop, controls, and baseline.
 */
async function restoreLiveConfiguration() {
  const saved = state.liveConfiguration;
  if (!saved) {
    state.sampleImage = null;
    updateSampleDemoButton();
    await enableCamera();
    return;
  }

  try {
    setStatus("Returning to live camera...");
    state.sampleImage = null;
    state.cropFraction = saved.cropFraction;
    state.cropRect = { ...saved.cropRect };
    state.liveInferenceMode = saved.liveInferenceMode;
    ui.inferenceSelect?.selected?.(saved.liveInferenceMode);
    ui.cameraResolutionSelect?.selected?.(
      `${saved.cameraResolution.width}x${saved.cameraResolution.height}`,
    );
    state.cameraResolution = { ...saved.cameraResolution };
    ui.inputSmoothingAlpha?.value?.(saved.inputSmoothingAlpha);
    ui.poissonLambda?.value?.(saved.poissonLambda);

    await refreshDevices();
    if (saved.deviceId) {
      ui.deviceSelect?.selected?.(saved.deviceId);
    }

    if (saved.cameraWasEnabled || saved.deviceId) {
      await startSelectedDevice();
      state.baseline = saved.baseline
        ? new Float32Array(saved.baseline)
        : null;
      state.baselineCount = saved.baseline ? saved.baselineCount : 0;
      state.calibrationDirty = !!saved.calibrationDirty;
      state.baselineAccum = null;
      state.calibrating = false;
      resetInputSmoothing();
      resetDepthDisplayRange();
      updateToolbarAvailability();
      updateSampleDemoButton();
      setStatus("Live camera restored.");
      return;
    }

    updateToolbarAvailability();
    updateSampleDemoButton();
    setStatus("Enable the camera to leave demo mode.");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

/**
 * Keep the Demo button label synchronized with demo/live mode.
 */
function updateSampleDemoButton() {
  if (!ui.sampleDemo) {
    return;
  }
  ui.sampleDemo.html(state.sampleImage ? "Live" : "Demo");
}

/**
 * Load a single image sample and process it as a static source.
 */
async function loadSample(path) {
  try {
    rememberLiveConfiguration();
    const sampleImg = new Image();
    sampleImg.decoding = "async";
    sampleImg.src = path;
    await sampleImg.decode();
    state.sampleImage = sampleImg;
    updateSampleDemoButton();
    updateToolbarAvailability();
    resetInputSmoothing();
    resetDepthDisplayRange();
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    await processSourceFrame(sampleImg);
    setStatus(`Sample: ${path.split("/").pop()}`);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

/**
 * Load an exported demo ZIP, including its capture image and baseline depth.
 */
async function loadSampleZip(path) {
  try {
    rememberLiveConfiguration();
    setStatus("Loading sample export...");
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load sample export: ${path}`);
    }

    const zipBytes = await GelSightExport.blobToBytes(await response.blob());
    const entries = GelSightExport.readStoredZip(zipBytes);
    const captureBytes = requireZipEntry(entries, "capture.png");
    const baselineBytes = requireZipEntry(entries, "baseline_16bit.png");
    const metadataBytes = entries.get("metadata.json");
    const metadata = metadataBytes
      ? JSON.parse(new TextDecoder().decode(metadataBytes))
      : null;
    const baseline = GelSightExport.decodeDepthPng16(baselineBytes);
    if (baseline.width !== Core.WIDTH || baseline.height !== Core.HEIGHT) {
      throw new Error(
        `Sample baseline is ${baseline.width}x${baseline.height}; expected ${Core.WIDTH}x${Core.HEIGHT}.`,
      );
    }

    const sampleImg = await imageFromBytes(captureBytes, "image/png");
    applySampleMetadata(metadata, sampleImg);
    state.sampleImage = sampleImg;
    updateSampleDemoButton();
    updateToolbarAvailability();
    resetInputSmoothing();
    resetDepthDisplayRange();
    state.baseline = baseline.depth;
    state.baselineCount =
      metadata?.calibration?.frameCount ||
      metadata?.baselineFrameCount ||
      metadata?.computerVision?.calibration?.baselineFrameCount ||
      BASELINE_FRAME_TARGET;
    state.baselineAccum = null;
    state.calibrationDirty = false;
    state.calibrating = false;
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    await processSourceFrame(sampleImg);
    setStatus(`Sample export: ${path.split("/").pop()}`);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

/**
 * Restore crop and compatible UI settings from an exported demo ZIP metadata file.
 */
function applySampleMetadata(metadata, sampleImg) {
  if (!metadata) {
    return;
  }

  const dimensions = sourceDimensions(sampleImg);
  const savedResolution =
    metadata.camera?.selectedResolution ||
    metadata.source?.synchronizedCaptureDimensions ||
    metadata.source?.sourceDimensions ||
    null;
  if (savedResolution) {
    applySavedCameraResolution(savedResolution);
  }

  const savedCrop =
    metadata.crop?.rectNormalized ||
    metadata.preprocessing?.cropRect ||
    null;
  if (savedCrop && dimensions) {
    state.cropRect = clampCropRect(
      savedCrop,
      dimensions.sourceWidth,
      dimensions.sourceHeight,
    );
    state.cropFraction = Math.max(0, (1 - state.cropRect.w) / 2);
  }

  const savedInferenceMode =
    metadata.inference?.quality ||
    metadata.computerVision?.imagePreprocessing?.liveInferenceMode;
  if (savedInferenceMode === "half" || savedInferenceMode === "full") {
    state.liveInferenceMode = savedInferenceMode;
    ui.inferenceSelect?.selected?.(savedInferenceMode);
  }

  const savedAlpha =
    metadata.controls?.alpha?.value ??
    metadata.preprocessing?.temporalInputSmoothing?.alpha ??
    metadata.computerVision?.imagePreprocessing?.temporalInputSmoothing?.alpha;
  if (Number.isFinite(savedAlpha)) {
    ui.inputSmoothingAlpha?.value?.(Math.max(0, Math.min(0.99, savedAlpha)));
  }

  const savedLambda =
    metadata.controls?.lambda?.value ??
    metadata.poissonIntegration?.regularizationLambda ??
    metadata.computerVision?.poissonIntegration?.regularizationLambda;
  if (Number.isFinite(savedLambda)) {
    ui.poissonLambda?.value?.(
      Math.max(0, Math.min(MAX_POISSON_LAMBDA, savedLambda)),
    );
  }
}

/**
 * Restore the capture-resolution selector from demo metadata when it matches an option.
 */
function applySavedCameraResolution(savedResolution) {
  const width = Number(savedResolution.width);
  const height = Number(savedResolution.height);
  const option = CAMERA_RESOLUTION_OPTIONS.find(
    (candidate) => candidate.width === width && candidate.height === height,
  );
  if (!option) {
    return;
  }

  state.cameraResolution = {
    width: option.width,
    height: option.height,
  };
  ui.cameraResolutionSelect?.selected?.(`${option.width}x${option.height}`);
}

/**
 * Fetch a required file from a ZIP entry map or throw a clear error.
 */
function requireZipEntry(entries, name) {
  const bytes = entries.get(name);
  if (!bytes) {
    throw new Error(`Sample export is missing ${name}.`);
  }
  return bytes;
}

/**
 * Decode image bytes into an HTMLImageElement.
 */
async function imageFromBytes(bytes, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const decodedImage = new Image();
    decodedImage.decoding = "async";
    decodedImage.src = url;
    await decodedImage.decode();
    return decodedImage;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Kick off processing only when a new live camera frame is available.
 */
function maybeProcessLiveFrame() {
  if (!state.session || !state.cv || state.busy || state.sampleImage) {
    return;
  }
  if (
    !state.video ||
    state.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return;
  }
  const frameId = currentVideoFrameId(state.video);
  if (frameId !== null && frameId === state.lastVideoFrameId) {
    return;
  }
  state.lastVideoFrameId = frameId;
  state.frameIndex += 1;
  processSourceFrame(state.video);
}

/**
 * Return a stable frame identity for duplicate-frame suppression.
 */
function currentVideoFrameId(video) {
  const quality =
    typeof video.getVideoPlaybackQuality === "function"
      ? video.getVideoPlaybackQuality()
      : null;
  if (quality?.totalVideoFrames > 0) {
    return `frames:${quality.totalVideoFrames}`;
  }
  if (Number.isFinite(video.currentTime)) {
    return `time:${video.currentTime.toFixed(5)}`;
  }
  return null;
}

/**
 * Read and clamp the temporal input smoothing alpha control.
 */
function inputSmoothingAlpha() {
  const value = Number(ui.inputSmoothingAlpha?.value?.());
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : DEFAULT_INPUT_SMOOTHING_ALPHA;
}

/**
 * Read and clamp the Poisson regularization lambda control.
 */
function poissonLambda() {
  const value = Number(ui.poissonLambda?.value?.());
  return Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_POISSON_LAMBDA, value))
    : DEFAULT_POISSON_LAMBDA;
}

/**
 * Flag the live baseline as stale when the Poisson regularization changes.
 */
function handlePoissonLambdaInput() {
  resetDepthDisplayRange();
  markLiveCalibrationDirty();
}

/**
 * Clear the temporal input smoothing buffer after source or parameter changes.
 */
function resetInputSmoothing() {
  state.inputSmoothingBuffer = null;
}

/**
 * Clear the smoothed display normalization range after source or parameter changes.
 */
function resetDepthDisplayRange() {
  state.depthDisplayRange = null;
}

/**
 * Compute robust p01/p99 depth display bounds with headroom and temporal smoothing.
 */
function updateDepthDisplayRange(depth) {
  const percentileRange = Core.percentileRange(
    depth,
    DEPTH_DISPLAY_PERCENTILE_LOW,
    DEPTH_DISPLAY_PERCENTILE_HIGH,
    state.depthImageBuffers?.bins ?? 512,
    state.depthDisplayHistogram,
  );
  let low = percentileRange.low;
  let high = percentileRange.high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    low = state.stats?.min ?? -DEPTH_DISPLAY_MIN_SPAN / 2;
    high = state.stats?.max ?? DEPTH_DISPLAY_MIN_SPAN / 2;
  }
  if (high < low) {
    [low, high] = [high, low];
  }

  const percentileSpan = Math.max(0, high - low);
  const headroom = DEFAULT_DEPTH_DISPLAY_HEADROOM;
  const flatLocked =
    percentileSpan < DEPTH_DISPLAY_FLAT_LOCK_PERCENTILE_SPAN;
  let targetMin;
  let targetMax;
  if (flatLocked) {
    // When the gel is idle, p01/p99 mostly describes sensor/model noise. Lock
    // the display target to a deliberately wide zero-centered range so the
    // preview and mesh colors do not amplify idle sensor/model noise.
    const halfSpan = DEPTH_DISPLAY_FLAT_LOCK_DISPLAY_SPAN * 0.5;
    targetMin = DEPTH_DISPLAY_FLAT_LOCK_CENTER - halfSpan;
    targetMax = DEPTH_DISPLAY_FLAT_LOCK_CENTER + halfSpan;
  } else {
    // Headroom is part of the target range before smoothing, so the temporal
    // filter stabilizes the range the user actually sees.
    targetMin = low - percentileSpan * headroom;
    targetMax = high + percentileSpan * headroom;
  }
  ({ min: targetMin, max: targetMax } = enforceDepthDisplayMinSpan(
    targetMin,
    targetMax,
  ));

  const previous = state.depthDisplayRange;
  let displayMin = targetMin;
  let displayMax = targetMax;
  if (previous) {
    // Smooth center and span separately. Independent min/max smoothing allowed
    // the span to collapse as input averaging settled, which caused contrast
    // bloom in the grayscale preview and mesh colors.
    const previousCenter = (previous.min + previous.max) * 0.5;
    const targetCenter = (targetMin + targetMax) * 0.5;
    const displayCenter =
      previousCenter * (1 - DEPTH_DISPLAY_CENTER_ALPHA) +
      targetCenter * DEPTH_DISPLAY_CENTER_ALPHA;
    const previousSpan = Math.max(DEPTH_DISPLAY_MIN_SPAN, previous.max - previous.min);
    const targetSpan = Math.max(DEPTH_DISPLAY_MIN_SPAN, targetMax - targetMin);
    const spanAlpha =
      targetSpan > previousSpan
        ? DEPTH_DISPLAY_EXPAND_ALPHA
        : DEPTH_DISPLAY_CONTRACT_ALPHA;
    const displaySpan = previousSpan * (1 - spanAlpha) + targetSpan * spanAlpha;
    displayMin = displayCenter - displaySpan * 0.5;
    displayMax = displayCenter + displaySpan * 0.5;
  }
  ({ min: displayMin, max: displayMax } = enforceDepthDisplayMinSpan(
    displayMin,
    displayMax,
  ));

  return {
    min: displayMin,
    max: displayMax,
    span: displayMax - displayMin,
    percentileLow: low,
    percentileHigh: high,
    percentileSpan,
    targetMin,
    targetMax,
    percentileLowPercent: DEPTH_DISPLAY_PERCENTILE_LOW,
    percentileHighPercent: DEPTH_DISPLAY_PERCENTILE_HIGH,
    flatLocked,
    flatLockPercentileSpan: DEPTH_DISPLAY_FLAT_LOCK_PERCENTILE_SPAN,
    flatLockCenter: DEPTH_DISPLAY_FLAT_LOCK_CENTER,
    flatLockDisplaySpan: DEPTH_DISPLAY_FLAT_LOCK_DISPLAY_SPAN,
    headroom,
    expandAlpha: DEPTH_DISPLAY_EXPAND_ALPHA,
    contractAlpha: DEPTH_DISPLAY_CONTRACT_ALPHA,
    centerAlpha: DEPTH_DISPLAY_CENTER_ALPHA,
    minSpan: DEPTH_DISPLAY_MIN_SPAN,
  };
}

/**
 * Ensure the live display range never collapses into excessive contrast.
 */
function enforceDepthDisplayMinSpan(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      min: -DEPTH_DISPLAY_MIN_SPAN / 2,
      max: DEPTH_DISPLAY_MIN_SPAN / 2,
    };
  }
  if (max < min) {
    [min, max] = [max, min];
  }
  const span = max - min;
  if (span >= DEPTH_DISPLAY_MIN_SPAN) {
    return { min, max };
  }
  const center = (min + max) * 0.5;
  const halfSpan = DEPTH_DISPLAY_MIN_SPAN * 0.5;
  return { min: center - halfSpan, max: center + halfSpan };
}

/**
 * Render depth values into grayscale using the stabilized display range.
 */
function depthToImageDataWithRange(depth, range, width, height, buffers) {
  if (!buffers || buffers.width !== width || buffers.height !== height) {
    buffers = Core.makeDepthImageBuffers(width, height);
  }
  const min = range?.min ?? -DEPTH_DISPLAY_MIN_SPAN / 2;
  const span = Math.max(DEPTH_DISPLAY_MIN_SPAN, (range?.max ?? 0) - min);
  const imageData = buffers.imageData;
  const rgba = imageData.data;
  for (let i = 0; i < depth.length; i += 1) {
    const value = Number.isFinite(depth[i]) ? depth[i] : min;
    const normalized = Math.max(0, Math.min(1, (value - min) / span));
    const gray = Math.round(normalized * 255);
    const j = i * 4;
    rgba[j] = gray;
    rgba[j + 1] = gray;
    rgba[j + 2] = gray;
    rgba[j + 3] = 255;
  }
  return imageData;
}

/**
 * Apply temporal smoothing to the preprocessed RGBA input frame.
 */
function applyInputSmoothing(imageData) {
  const alpha = inputSmoothingAlpha();
  if (alpha <= 0) {
    resetInputSmoothing();
    return imageData;
  }

  const source = imageData.data;
  let buffer = state.inputSmoothingBuffer;
  if (!buffer || buffer.length !== source.length) {
    buffer = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
      buffer[i] = source[i];
    }
    state.inputSmoothingBuffer = buffer;
    return imageData;
  }

  const inputWeight = 1 - alpha;
  // Only smooth color channels. Alpha remains opaque and does not carry useful
  // sensor information.
  for (let i = 0; i < source.length; i += 4) {
    buffer[i] = alpha * buffer[i] + inputWeight * source[i];
    buffer[i + 1] = alpha * buffer[i + 1] + inputWeight * source[i + 1];
    buffer[i + 2] = alpha * buffer[i + 2] + inputWeight * source[i + 2];
    source[i] = buffer[i];
    source[i + 1] = buffer[i + 1];
    source[i + 2] = buffer[i + 2];
  }
  return imageData;
}

/**
 * Run the full frame pipeline from image/camera source to depth, preview, and profiling.
 */
async function processSourceFrame(source) {
  if (state.busy || !state.session || !state.cv) {
    return;
  }
  state.busy = true;
  const start = performance.now();
  const timings = {};
  let stageStart = start;
  const markStage = (name) => {
    const now = performance.now();
    timings[name] = now - stageStart;
    stageStart = now;
  };

  try {
    // The preprocessed frame is the canonical 320x240 RGBA input for feature
    // extraction, temporal smoothing, depth preview, and synchronized export.
    const preprocessResult = preprocessSourceFrame(source);
    Object.assign(timings, preprocessResult.timings);
    stageStart = performance.now();
    if (!preprocessResult.imageData) {
      return;
    }
    state.lastCropInfo = preprocessResult.cropInfo;
    const smoothingStart = performance.now();
    const imageData = applyInputSmoothing(preprocessResult.imageData);
    timings.inputSmoothing = performance.now() - smoothingStart;

    const captureStart = performance.now();
    if (state.sampleImage || state.captureFullFrameRequested) {
      updateHighResolutionCapture(source);
      state.captureFullFrameRequested = false;
    }
    timings.captureCopy = performance.now() - captureStart;
    stageStart = performance.now();

    const featureResult = Core.updateFeaturesFromRgba(
      imageData,
      state.featureBuffers,
    );
    state.featureBuffers = featureResult.buffers;
    let { features } = featureResult;
    const { markerMask } = featureResult;
    const useLiveHalfInference = shouldUseLiveHalfInference(source);
    let inferenceWidth = Core.WIDTH;
    let inferenceHeight = Core.HEIGHT;
    let inferencePixels = Core.PIXELS;
    if (useLiveHalfInference) {
      const sampleStart = performance.now();
      const sampledFeatureResult = Core.updateSampledFeaturesFromRgba(
        imageData,
        state.liveInferenceFeatureBuffers,
        Core.WIDTH,
        Core.HEIGHT,
        LIVE_INFERENCE_WIDTH,
        LIVE_INFERENCE_HEIGHT,
      );
      state.liveInferenceFeatureBuffers = sampledFeatureResult.buffers;
      features = sampledFeatureResult.features;
      inferenceWidth = LIVE_INFERENCE_WIDTH;
      inferenceHeight = LIVE_INFERENCE_HEIGHT;
      inferencePixels = LIVE_INFERENCE_PIXELS;
      timings.inferenceFeatureSample = performance.now() - sampleStart;
    }
    timings.inferencePixels = inferencePixels;
    timings.inferenceWidth = inferenceWidth;
    timings.inferenceHeight = inferenceHeight;
    markStage("features");
    let gx;
    let gy;
    if (isWasmMlpMode()) {
      const gradientOutput = state.session.runGradients(
        features,
        inferencePixels,
      );
      gx = gradientOutput.gx;
      gy = gradientOutput.gy;
      if (gradientOutput.timings) {
        Object.assign(timings, gradientOutput.timings);
      }
      markStage("inference");
      if (useLiveHalfInference) {
        const upsampleStart = performance.now();
        const upsampled = Core.upsampleGradientsBilinear(
          gx,
          gy,
          inferenceWidth,
          inferenceHeight,
          Core.WIDTH,
          Core.HEIGHT,
          state.gradientUpsampleBuffers,
        );
        state.gradientUpsampleBuffers = upsampled.buffers;
        gx = upsampled.gx;
        gy = upsampled.gy;
        timings.gradientUpsample = performance.now() - upsampleStart;
      }
      Core.applyMarkerMaskToGradients(
        gx,
        gy,
        markerMask,
        Core.WIDTH,
        Core.HEIGHT,
      );
    } else {
      const output = await runOnnxSession(features);
      const normalXY = output.normal_xy?.data || Object.values(output)[0].data;
      markStage("inference");
      ({ gx, gy } = Core.normalsToGradients(
        normalXY,
        markerMask,
        Core.WIDTH,
        Core.HEIGHT,
        true,
      ));
    }
    const sanitizeStart = performance.now();
    state.lastGradientSanitize = Core.sanitizeGradients(
      gx,
      gy,
      Core.WIDTH,
      Core.HEIGHT,
    );
    timings.gradientSanitize = performance.now() - sanitizeStart;
    timings.gradientInvalidCount = state.lastGradientSanitize.invalid;
    timings.gradientClampCount = state.lastGradientSanitize.clamped;
    markStage("gradients");
    timings.poissonLambda = poissonLambda();
    const rawDepth = Core.poissonDctNeumann(
      state.cv,
      gx,
      gy,
      Core.WIDTH,
      Core.HEIGHT,
      timings.poissonLambda,
    );
    markStage("poisson");

    if (state.calibrating) {
      // Average raw reconstructed depth before subtracting any baseline. The
      // caller processes only distinct camera frames, so duplicate draw calls
      // do not overweight calibration.
      for (let i = 0; i < rawDepth.length; i += 1) {
        state.baselineAccum[i] += rawDepth[i];
      }
      state.baselineCount += 1;
      setStatus(`Zeroing depth: ${state.baselineCount}/50`);
      if (state.baselineCount >= BASELINE_FRAME_TARGET) {
        state.baseline = new Float32Array(rawDepth.length);
        for (let i = 0; i < rawDepth.length; i += 1) {
          state.baseline[i] = state.baselineAccum[i] / state.baselineCount;
        }
        state.calibrationDirty = false;
        state.calibrating = false;
        resetDepthDisplayRange();
        setStatus("Sensor is ready.");
      }
    }
    markStage("calibration");

    const depth = Core.subtractBaseline(rawDepth, state.baseline);
    state.lastImageData = imageData;
    state.lastDepth = depth;
    state.stats = Core.stats(depth);
    state.depthDisplayRange = updateDepthDisplayRange(depth);
    markStage("depthStats");
    state.depthCtx.putImageData(
      depthToImageDataWithRange(
        depth,
        state.depthDisplayRange,
        Core.WIDTH,
        Core.HEIGHT,
        state.depthImageBuffers,
      ),
      0,
      0,
    );
    markStage("depthImage");
    state.lastFrameMs = performance.now() - start;
    timings.total = state.lastFrameMs;
    recordProfile(timings);
    updateToolbarAvailability();
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  } finally {
    state.busy = false;
  }
}

/**
 * Decide whether the fast 160x120 WASM inference path applies.
 */
function shouldUseLiveHalfInference(source) {
  return (
    state.liveInferenceMode === "half" &&
    isWasmMlpMode() &&
    source === state.video &&
    !state.sampleImage
  );
}

/**
 * Dispatch frame crop/resize to the selected preprocessing backend.
 */
function preprocessSourceFrame(source) {
  if (state.preprocessMode === "webgl") {
    return preprocessSourceFrameWebGl(source);
  }
  if (state.preprocessMode === "opencv") {
    return preprocessSourceFrameOpenCv(source);
  }
  return preprocessSourceFrameCanvas(source);
}

/**
 * Crop and resize with Canvas2D, then read back RGBA pixels.
 */
function preprocessSourceFrameCanvas(source) {
  const timings = {};
  const dimensions = sourceDimensions(source);
  if (!dimensions) {
    return { imageData: null, cropInfo: null, timings };
  }

  const cropStart = performance.now();
  const cropInfo = cropInfoForCurrentCrop(
    dimensions.sourceWidth,
    dimensions.sourceHeight,
  );
  state.preprocess.ctx.drawImage(
    source,
    cropInfo.cropLeft,
    cropInfo.cropTop,
    cropInfo.cropWidth,
    cropInfo.cropHeight,
    0,
    0,
    state.preprocess.width,
    state.preprocess.height,
  );
  timings.cropDraw = performance.now() - cropStart;

  const readbackStart = performance.now();
  const imageData = Core.readPreprocessImageData(state.preprocess);
  timings.cropReadback = performance.now() - readbackStart;
  timings.cropResize = timings.cropDraw + timings.cropReadback;
  return { imageData, cropInfo, timings };
}

/**
 * Crop and resize with WebGL, then read back RGBA pixels for inference.
 */
function preprocessSourceFrameWebGl(source) {
  const timings = {};
  const dimensions = sourceDimensions(source);
  if (!dimensions) {
    return { imageData: null, cropInfo: null, timings };
  }

  const webglState = state.webglPreprocess;
  if (!webglState?.gl) {
    console.info("WebGL preprocessing is unavailable; using canvas.");
    state.preprocessMode = "canvas";
    return preprocessSourceFrameCanvas(source);
  }

  const { sourceWidth, sourceHeight } = dimensions;
  const cropInfo = cropInfoForCurrentCrop(
    sourceWidth,
    sourceHeight,
  );
  const gl = webglState.gl;
  gl.useProgram(webglState.program);
  gl.viewport(0, 0, Core.WIDTH, Core.HEIGHT);

  const uploadStart = performance.now();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, webglState.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  try {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
  } catch (error) {
    console.info("WebGL video upload failed; using canvas.", error);
    state.preprocessMode = "canvas";
    return preprocessSourceFrameCanvas(source);
  }
  timings.webglUpload = performance.now() - uploadStart;

  const drawStart = performance.now();
  updateWebGlCropTexCoords(webglState, cropInfo);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  timings.webglDraw = performance.now() - drawStart;

  const readbackStart = performance.now();
  gl.readPixels(
    0,
    0,
    Core.WIDTH,
    Core.HEIGHT,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    webglState.readPixels,
  );
  timings.webglReadback = performance.now() - readbackStart;

  const rowFlipStart = performance.now();
  copyBottomUpRgbaToImageData(webglState.readPixels, webglState.imageData);
  timings.webglRowFlip = performance.now() - rowFlipStart;

  const displayStart = performance.now();
  state.preprocess.ctx.putImageData(webglState.imageData, 0, 0);
  timings.webglDisplayCopy = performance.now() - displayStart;
  timings.cropDraw = timings.webglUpload + timings.webglDraw;
  timings.cropReadback =
    timings.webglReadback + timings.webglRowFlip + timings.webglDisplayCopy;
  timings.cropResize = timings.cropDraw + timings.cropReadback;
  return { imageData: webglState.imageData, cropInfo, timings };
}

/**
 * Crop and resize with OpenCV.js, using Canvas2D for source readback.
 */
function preprocessSourceFrameOpenCv(source) {
  const timings = {};
  const dimensions = sourceDimensions(source);
  if (!dimensions) {
    return { imageData: null, cropInfo: null, timings };
  }

  const { sourceWidth, sourceHeight } = dimensions;
  ensureOpenCvPreprocessSize(sourceWidth, sourceHeight);

  const drawStart = performance.now();
  state.cvPreprocess.sourceCtx.drawImage(
    source,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  timings.sourceDraw = performance.now() - drawStart;

  const readbackStart = performance.now();
  const sourceImageData = state.cvPreprocess.sourceCtx.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  timings.sourceReadback = performance.now() - readbackStart;

  const cropInfo = cropInfoForCurrentCrop(
    sourceWidth,
    sourceHeight,
  );
  const opencvStart = performance.now();
  state.cvPreprocess.srcMat.data.set(sourceImageData.data);
  const roi = state.cvPreprocess.srcMat.roi(
    new state.cv.Rect(
      cropInfo.cropLeft,
      cropInfo.cropTop,
      cropInfo.cropWidth,
      cropInfo.cropHeight,
    ),
  );
  try {
    state.cv.resize(
      roi,
      state.cvPreprocess.dstMat,
      state.cvPreprocess.dstSize,
      0,
      0,
      state.cv.INTER_AREA,
    );
  } finally {
    roi.delete();
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(state.cvPreprocess.dstMat.data),
    Core.WIDTH,
    Core.HEIGHT,
  );
  state.preprocess.ctx.putImageData(imageData, 0, 0);
  timings.opencvResize = performance.now() - opencvStart;
  timings.cropDraw = timings.sourceDraw + timings.opencvResize;
  timings.cropReadback = timings.sourceReadback;
  timings.cropResize =
    timings.sourceDraw + timings.sourceReadback + timings.opencvResize;
  return { imageData, cropInfo, timings };
}

/**
 * Read pixel dimensions from a video, image, or canvas source.
 */
function sourceDimensions(source) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight =
    source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }
  return { sourceWidth, sourceHeight };
}

/**
 * Convert the normalized crop rectangle into source pixel coordinates.
 */
function cropInfoForCurrentCrop(sourceWidth, sourceHeight) {
  const cropRect = clampCropRect(state.cropRect, sourceWidth, sourceHeight);
  state.cropRect = cropRect;
  const cropLeft = Math.round(sourceWidth * cropRect.x);
  const cropTop = Math.round(sourceHeight * cropRect.y);
  const cropWidth = Math.max(1, Math.round(sourceWidth * cropRect.w));
  const cropHeight = Math.max(1, Math.round(sourceHeight * cropRect.h));
  return {
    sourceWidth,
    sourceHeight,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    cropRect: { ...cropRect },
    targetWidth: Core.WIDTH,
    targetHeight: Core.HEIGHT,
  };
}

/**
 * Constrain crop rectangles to the source bounds, aspect ratio, and minimum size.
 */
function clampCropRect(rect, sourceWidth = null, sourceHeight = null) {
  const minSize = minimumCropRectSize(sourceWidth, sourceHeight);
  const size = Math.max(
    minSize,
    Math.min(1, rect?.w ?? 1, rect?.h ?? 1),
  );
  const x = Math.max(0, Math.min(1 - size, rect?.x ?? (1 - size) / 2));
  const y = Math.max(0, Math.min(1 - size, rect?.y ?? (1 - size) / 2));
  return { x, y, w: size, h: size };
}

/**
 * Set a centered crop rectangle from the legacy crop fraction value.
 */
function setCenteredCropFromFraction(fraction) {
  const size = Math.max(minimumCropRectSize(), Math.min(1, 1 - 2 * fraction));
  state.cropRect = clampCropRect({
    x: (1 - size) / 2,
    y: (1 - size) / 2,
    w: size,
    h: size,
  });
}

/**
 * Compute the smallest crop that can still fill the reconstruction resolution.
 */
function minimumCropRectSize(sourceWidth = null, sourceHeight = null) {
  const dimensions =
    sourceWidth && sourceHeight
      ? { sourceWidth, sourceHeight }
      : currentCropSourceDimensions();
  return Math.min(
    1,
    Math.max(
      Core.WIDTH / dimensions.sourceWidth,
      Core.HEIGHT / dimensions.sourceHeight,
    ),
  );
}

/**
 * Return the source dimensions currently relevant for crop calculations.
 */
function currentCropSourceDimensions() {
  const source = currentFrameDisplaySource();
  const dimensions = source ? sourceDimensions(source) : null;
  if (dimensions) {
    return dimensions;
  }
  if (state.lastCropInfo?.sourceWidth && state.lastCropInfo?.sourceHeight) {
    return {
      sourceWidth: state.lastCropInfo.sourceWidth,
      sourceHeight: state.lastCropInfo.sourceHeight,
    };
  }
  if (state.cameraSettings?.width && state.cameraSettings?.height) {
    return {
      sourceWidth: state.cameraSettings.width,
      sourceHeight: state.cameraSettings.height,
    };
  }
  return {
    sourceWidth: state.cameraResolution.width,
    sourceHeight: state.cameraResolution.height,
  };
}

/**
 * Create the offscreen WebGL program used for crop/resize preprocessing.
 */
function makeWebGlPreprocessState() {
  const canvas = document.createElement("canvas");
  canvas.width = Core.WIDTH;
  canvas.height = Core.HEIGHT;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    stencil: false,
  });
  if (!gl) {
    return { canvas, gl: null };
  }

  const vertexShader = compileWebGlShader(
    gl,
    gl.VERTEX_SHADER,
    `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`,
  );
  const fragmentShader = compileWebGlShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;

void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`,
  );
  const program = linkWebGlProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  const webglTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, webglTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  gl.clearColor(0, 0, 0, 1);

  return {
    canvas,
    gl,
    program,
    texture: webglTexture,
    texCoordBuffer,
    readPixels: new Uint8Array(Core.PIXELS * 4),
    imageData: new ImageData(Core.WIDTH, Core.HEIGHT),
    lastTexCoordKey: "",
  };
}

/**
 * Compile a WebGL shader and log compilation failures.
 */
function compileWebGlShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`Could not compile WebGL preprocess shader: ${message}`);
  }
  return shader;
}

/**
 * Link a WebGL program and log link failures.
 */
function linkWebGlProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program error";
    gl.deleteProgram(program);
    throw new Error(`Could not link WebGL preprocess program: ${message}`);
  }
  return program;
}

/**
 * Update crop texture coordinates for the WebGL preprocessing quad.
 */
function updateWebGlCropTexCoords(webglState, cropInfo) {
  const gl = webglState.gl;
  const left = cropInfo.cropLeft / cropInfo.sourceWidth;
  const right =
    (cropInfo.cropLeft + cropInfo.cropWidth) / cropInfo.sourceWidth;
  const top = 1 - cropInfo.cropTop / cropInfo.sourceHeight;
  const bottom =
    1 - (cropInfo.cropTop + cropInfo.cropHeight) / cropInfo.sourceHeight;
  const key = `${left},${right},${top},${bottom}`;
  if (key === webglState.lastTexCoordKey) {
    return;
  }

  webglState.lastTexCoordKey = key;
  gl.bindBuffer(gl.ARRAY_BUFFER, webglState.texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([left, bottom, right, bottom, left, top, right, top]),
    gl.DYNAMIC_DRAW,
  );
}

/**
 * Flip WebGL readPixels output into top-down ImageData order.
 */
function copyBottomUpRgbaToImageData(sourcePixels, imageData) {
  const targetPixels = imageData.data;
  const rowBytes = Core.WIDTH * 4;
  for (let y = 0; y < Core.HEIGHT; y += 1) {
    const sourceOffset = (Core.HEIGHT - 1 - y) * rowBytes;
    const targetOffset = y * rowBytes;
    targetPixels.set(
      sourcePixels.subarray(sourceOffset, sourceOffset + rowBytes),
      targetOffset,
    );
  }
}

/**
 * Create canvases and bookkeeping for OpenCV.js preprocessing.
 */
function makeOpenCvPreprocessState() {
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  return {
    sourceCanvas,
    sourceCtx,
    sourceWidth: 0,
    sourceHeight: 0,
    srcMat: null,
    dstMat: null,
    dstSize: null,
  };
}

/**
 * Resize OpenCV Mats when the source camera dimensions change.
 */
function ensureOpenCvPreprocessSize(sourceWidth, sourceHeight) {
  const stateCv = state.cvPreprocess;
  if (
    stateCv.sourceWidth === sourceWidth &&
    stateCv.sourceHeight === sourceHeight &&
    stateCv.srcMat &&
    stateCv.dstMat
  ) {
    return;
  }

  stateCv.srcMat?.delete();
  stateCv.dstMat?.delete();
  stateCv.sourceCanvas.width = sourceWidth;
  stateCv.sourceCanvas.height = sourceHeight;
  stateCv.sourceWidth = sourceWidth;
  stateCv.sourceHeight = sourceHeight;
  stateCv.srcMat = new state.cv.Mat(
    sourceHeight,
    sourceWidth,
    state.cv.CV_8UC4,
  );
  stateCv.dstMat = new state.cv.Mat(Core.HEIGHT, Core.WIDTH, state.cv.CV_8UC4);
  stateCv.dstSize = new state.cv.Size(Core.WIDTH, Core.HEIGHT);
}

/**
 * Store last-frame timings and update exponential moving averages.
 */
function recordProfile(timings) {
  state.profile.last = { ...timings };
  for (const [name, value] of Object.entries(timings)) {
    if (isProfileMetadataField(name)) {
      continue;
    }
    const previous = state.profile.ema[name];
    state.profile.ema[name] =
      previous === undefined
        ? value
        : previous * (1 - state.profile.alpha) + value * state.profile.alpha;
  }
}

/**
 * Identify non-timing profile fields that should not be averaged.
 */
function isProfileMetadataField(name) {
  return (
    name === "inferencePixels" ||
    name === "inferenceWidth" ||
    name === "inferenceHeight" ||
    name === "wasmMlpUsPerPixel" ||
    name === "poissonLambda" ||
    name === "gradientInvalidCount" ||
    name === "gradientClampCount"
  );
}

/**
 * Return the active live inference input resolution metadata.
 */
function liveInferenceResolution() {
  if (state.liveInferenceMode === "half" && isWasmMlpMode()) {
    return {
      width: LIVE_INFERENCE_WIDTH,
      height: LIVE_INFERENCE_HEIGHT,
      pixels: LIVE_INFERENCE_PIXELS,
    };
  }
  return {
    width: Core.WIDTH,
    height: Core.HEIGHT,
    pixels: Core.PIXELS,
  };
}

/**
 * Benchmark the custom WASM MLP inference path from the browser console.
 */
async function benchmarkWasmMlp(mode = "fast", iterations = 10, safety = "safe") {
  if (!state.session?.runGradients || !isWasmMlpMode()) {
    throw new Error("The custom WASM MLP session is not active.");
  }

  const useFull = String(mode).toLowerCase() === "full";
  const width = useFull ? Core.WIDTH : LIVE_INFERENCE_WIDTH;
  const height = useFull ? Core.HEIGHT : LIVE_INFERENCE_HEIGHT;
  const pixels = width * height;
  const features = Core.makeFeatureBuffers(width, height).features;
  for (let i = 0; i < features.length; i += Core.FEATURE_COUNT) {
    features[i] = 0.35;
    features[i + 1] = 0.45;
    features[i + 2] = 0.55;
  }

  const safetyMode = String(safety).toLowerCase();
  const variants =
    safetyMode === "both"
      ? [
          ["safe", state.session.runGradients],
          ["unchecked", state.session.runGradientsUnchecked],
        ]
      : [
          [
            safetyMode === "unchecked" ? "unchecked" : "safe",
            safetyMode === "unchecked"
              ? state.session.runGradientsUnchecked
              : state.session.runGradients,
          ],
        ];
  const rows = [];
  for (const [variant, run] of variants) {
    if (typeof run !== "function") {
      throw new Error(`WASM MLP ${variant} benchmark is unavailable.`);
    }
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now();
      const result = await run(features, pixels);
      const total = performance.now() - start;
      rows.push({
        variant,
        iteration: i,
        pixels,
        totalMs: Number(total.toFixed(3)),
        wasmFeatureCopyMs: Number(result.timings.wasmFeatureCopy.toFixed(3)),
        wasmMlpRunMs: Number(result.timings.wasmMlpRun.toFixed(3)),
        wasmOutputViewMs: Number(result.timings.wasmOutputView.toFixed(3)),
        wasmMlpUsPerPixel: Number(result.timings.wasmMlpUsPerPixel.toFixed(3)),
      });
    }
  }

  console.table(rows);
  return rows;
}

/**
 * Run the ONNX model and return its output tensor map.
 */
async function runOnnxSession(features) {
  const input = new ort.Tensor("float32", features, [
    Core.PIXELS,
    Core.FEATURE_COUNT,
  ]);
  return state.session.run({ features: input });
}

/**
 * Print recent processing and drawing profiles to the browser console.
 */
function logProfileToConsole() {
  if (!state.profile.last) {
    console.log("GelSight profile: no processed frame yet.");
    return;
  }

  const stageOrder = [
    "total",
    "cropResize",
    "cropDraw",
    "cropReadback",
    "webglUpload",
    "webglDraw",
    "webglReadback",
    "webglRowFlip",
    "webglDisplayCopy",
    "sourceDraw",
    "sourceReadback",
    "opencvResize",
    "captureCopy",
    "inputSmoothing",
    "features",
    "inferenceFeatureSample",
    "inference",
    "wasmFeatureCopy",
    "wasmMlpRun",
    "wasmOutputView",
    "gradientUpsample",
    "gradientSanitize",
    "gradients",
    "poisson",
    "calibration",
    "depthStats",
    "depthImage",
  ];
  const rows = stageOrder
    .filter((stageName) => state.profile.last[stageName] !== undefined)
    .map((stageName) => {
      const lastMs = state.profile.last[stageName];
      const emaMs = state.profile.ema[stageName];
      return {
        stage: stageName,
        lastMs: Number(lastMs.toFixed(3)),
        emaMs: Number(emaMs.toFixed(3)),
        emaPercent:
          state.profile.ema.total && stageName !== "total"
            ? Number(((emaMs / state.profile.ema.total) * 100).toFixed(1))
            : null,
      };
    });

  console.group(
    `GelSight profile: ${state.lastFrameMs.toFixed(1)} ms, crop ${Math.round(
      state.cropFraction * 100,
    )}%`,
  );
  console.table(rows);
  if (state.profile.drawLast) {
    console.table([
      ...Object.entries(state.profile.drawLast).map(([stage, ms]) => ({
        stage,
        lastMs: Number(ms.toFixed(3)),
      })),
      ...Object.entries(state.profile.drawPanelsLast || {}).map(
        ([stage, ms]) => ({
          stage,
          lastMs: Number(ms.toFixed(3)),
        }),
      ),
      ...Object.entries(state.profile.drawMeshLast || {}).map(
        ([stage, ms]) => ({
          stage,
          lastMs: Number(ms.toFixed(3)),
        }),
      ),
      ...Object.entries(state.profile.meshGlLast || {}).map(([stage, value]) => {
        const isTiming = stage === "meshGlDepthUpload" || stage === "meshGlDraw";
        return {
          stage,
          lastMs:
            isTiming && typeof value === "number"
              ? Number(value.toFixed(3))
              : null,
          value: isTiming ? null : value,
        };
      }),
    ]);
  }
  console.log({
    frameMs: Number(state.lastFrameMs.toFixed(3)),
    inferencePixels: state.profile.last.inferencePixels ?? null,
    inferenceWidth: state.profile.last.inferenceWidth ?? null,
    inferenceHeight: state.profile.last.inferenceHeight ?? null,
    wasmMlpUsPerPixel: state.profile.last.wasmMlpUsPerPixel ?? null,
    inputSmoothingAlpha: inputSmoothingAlpha(),
    poissonLambda: poissonLambda(),
    lastVideoFrameId: state.lastVideoFrameId,
    gradientSanitize: state.lastGradientSanitize,
    onnxModelMode: state.onnxModelMode,
    onnxModelPath: state.onnxModelPath,
    onnxProviderMode: state.onnxProviderMode,
    onnxExecutionProvider: state.onnxExecutionProvider,
    onnxProviderAttempts: state.onnxProviderAttempts,
    preprocessMode: state.preprocessMode,
    liveInferenceMode: state.liveInferenceMode,
    liveInferenceResolution:
      state.liveInferenceMode === "half"
        ? [LIVE_INFERENCE_WIDTH, LIVE_INFERENCE_HEIGHT]
        : [Core.WIDTH, Core.HEIGHT],
    sourceFrame: {
      crop: state.lastCropInfo,
      cropRect: state.cropRect,
      videoWidth: state.video?.videoWidth || null,
      videoHeight: state.video?.videoHeight || null,
      sourceReadyState: state.video?.readyState ?? null,
    },
    depth: state.stats,
    depthDisplayRange: state.depthDisplayRange,
    cameraSettings: state.cameraSettings,
  });
  console.groupEnd();
}

/**
 * Apply fast/full inference changes and invalidate dependent state.
 */
async function handleInferenceQualityChange() {
  const nextMode = ui.inferenceSelect.value();
  if (nextMode === state.liveInferenceMode) {
    return;
  }

  state.liveInferenceMode = nextMode;
  resetInputSmoothing();
  resetDepthDisplayRange();
  if (!state.sampleImage) {
    state.baseline = null;
    state.baselineAccum = null;
    state.baselineCount = 0;
    state.calibrationDirty = false;
    state.calibrating = false;
    setStatus("Inference quality changed. Calibrate before measuring depth.");
  } else {
    setStatus("Inference quality changed.");
  }
  if (state.sampleImage) {
    await processSourceFrame(state.sampleImage);
  }
}

/**
 * Copy the uncropped source frame into an export canvas.
 */
function updateHighResolutionCapture(
  source,
  canvas = state.captureCanvas,
  ctx = state.captureCtx,
) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight =
    source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) {
    return;
  }

  if (canvas.width !== sourceWidth || canvas.height !== sourceHeight) {
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
  }
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
}

/**
 * Encode the optional high-resolution export frame as JPEG or PNG.
 */
async function encodeHighResolutionCapture(canvas) {
  const format =
    HIGH_RESOLUTION_CAPTURE_FORMATS[
      DEFAULT_HIGH_RESOLUTION_CAPTURE_FORMAT
    ] || HIGH_RESOLUTION_CAPTURE_FORMATS.jpeg;
  const bytes =
    format.mimeType === "image/jpeg"
      ? await GelSightExport.canvasToJpegBytes(canvas, format.quality)
      : await GelSightExport.canvasToPngBytes(canvas);

  return {
    bytes,
    filename: format.filename,
    mimeType: format.mimeType,
    quality: format.quality,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Create the ZIP export containing images, OBJ mesh, baseline, and metadata.
 */
async function exportCurrentCapture() {
  if (!state.lastDepth) {
    setStatus("Nothing to export yet.");
    return;
  }

  if (!(await prepareSynchronousCaptureForExport())) {
    return;
  }

  if (!state.captureCanvas?.width || !state.captureCanvas?.height) {
    setStatus("No synchronized capture frame is available yet.");
    return;
  }

  if (state.busy) {
    setStatus("Waiting for current frame...");
    await waitForProcessingIdle(2000);
    if (state.busy) {
      setStatus("Frame processing is still busy. Try Export again.");
      return;
    }
  }

  state.busy = true;
  try {
    ui.exportButton.attribute("disabled", "");
    state.exportCameraSettings = null;
    state.exportCaptureIncluded = false;
    state.exportHighResolutionCapture = null;
    setStatus("Exporting ZIP...");
    const now = new Date();
    const stamp = GelSightExport.timestampForFilename(now);
    const capturePng = await GelSightExport.canvasToPngBytes(
      state.captureCanvas,
    );
    const hasHighResolutionCapture = await captureExportFrameIfLive();
    state.exportCaptureIncluded = hasHighResolutionCapture;
    const highResolutionCapture = hasHighResolutionCapture
      ? await encodeHighResolutionCapture(state.exportCaptureCanvas)
      : null;
    state.exportHighResolutionCapture = highResolutionCapture;
    const depthPng = GelSightExport.encodeDepthPng16(
      state.lastDepth,
      Core.WIDTH,
      Core.HEIGHT,
    );
    const solverDepthPng = GelSightExport.encodeDepthSolverUnitsPng16(
      state.lastDepth,
      Core.WIDTH,
      Core.HEIGHT,
    );
    state.exportSolverDepthEncoding = {
      filename: "depth_solver_units_16bit.png",
      scale: solverDepthPng.scale,
      offset: solverDepthPng.offset,
      min: solverDepthPng.min,
      max: solverDepthPng.max,
      clippedLow: solverDepthPng.clippedLow,
      clippedHigh: solverDepthPng.clippedHigh,
      nonFinite: solverDepthPng.nonFinite,
    };
    const obj = GelSightExport.depthToObj(
      state.lastDepth,
      Core.WIDTH,
      Core.HEIGHT,
      EXPORT_OBJ_Z_SCALE,
    );
    const files = [
      {
        name: "capture.png",
        data: capturePng,
        date: now,
      },
      {
        name: "depth_16bit.png",
        data: depthPng,
        date: now,
      },
      {
        name: "depth_solver_units_16bit.png",
        data: solverDepthPng.bytes,
        date: now,
      },
    ];
    if (highResolutionCapture) {
      files.push({
        name: highResolutionCapture.filename,
        data: highResolutionCapture.bytes,
        date: now,
      });
    }
    if (state.baseline) {
      files.push({
        name: "baseline_16bit.png",
        data: GelSightExport.encodeDepthPng16(
          state.baseline,
          Core.WIDTH,
          Core.HEIGHT,
        ),
        date: now,
      });
    }
    files.push(
      {
        name: "mesh.obj",
        data: obj,
        date: now,
      },
      {
        name: "metadata.json",
        data: new TextEncoder().encode(
          `${JSON.stringify(createExportMetadata(now), null, 2)}\n`,
        ),
        date: now,
      },
    );
    const zip = GelSightExport.createZip(files);
    GelSightExport.downloadBytes(
      zip,
      `gelsight_${stamp}.zip`,
      "application/zip",
    );
    setStatus(`Exported gelsight_${stamp}.zip`);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  } finally {
    state.busy = false;
    updateToolbarAvailability();
  }
}

/**
 * Force one current source frame through processing before ZIP export.
 */
async function prepareSynchronousCaptureForExport() {
  if (state.sampleImage) {
    return true;
  }
  if (!state.stream || !state.video) {
    return true;
  }

  if (state.busy) {
    setStatus("Waiting for current frame...");
    await waitForProcessingIdle(2000);
  }
  if (state.busy) {
    setStatus("Frame processing is still busy. Try Export again.");
    return false;
  }
  if (state.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    setStatus("Camera frame is not ready yet.");
    return false;
  }

  setStatus("Capturing synchronized export frame...");
  state.captureFullFrameRequested = true;
  await processSourceFrame(state.video);
  if (state.captureFullFrameRequested) {
    state.captureFullFrameRequested = false;
    return false;
  }
  return true;
}

/**
 * Wait briefly for an in-flight frame to finish processing.
 */
async function waitForProcessingIdle(timeoutMs) {
  const start = performance.now();
  while (state.busy && performance.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Optionally capture a separate high-resolution live camera frame for export.
 */
async function captureExportFrameIfLive() {
  if (!state.stream || state.sampleImage || !state.video) {
    return false;
  }

  if (synchronousCaptureIsExportResolution()) {
    state.exportCameraSettings = state.cameraSettings;
    return false;
  }

  const track = state.stream.getVideoTracks()[0];
  if (!track?.applyConstraints) {
    updateHighResolutionCapture(
      state.video,
      state.exportCaptureCanvas,
      state.exportCaptureCtx,
    );
    return false;
  }

  let captured = false;
  try {
    setStatus(
      `Capturing ${EXPORT_CAMERA_WIDTH}x${EXPORT_CAMERA_HEIGHT} export frame...`,
    );
    // This happens after the synchronized depth frame. It is intentionally an
    // inspection still, not the image used to compute depth or OBJ geometry.
    await requestExportCameraResolution(state.stream);
    await waitForVideoDimensions(state.video);
    await waitForNextVideoFrame(state.video);
    await waitForNextVideoFrame(state.video);
    state.exportCameraSettings = track.getSettings
      ? summarizeCameraSettings(track.getSettings())
      : null;
    updateHighResolutionCapture(
      state.video,
      state.exportCaptureCanvas,
      state.exportCaptureCtx,
    );
    captured = true;
  } finally {
    await requestPreferredCameraResolution(state.stream);
    await waitForNextVideoFrame(state.video);
    rememberCameraTrackInfo(state.stream);
  }

  return captured;
}

/**
 * Check whether the depth-synchronous capture is already high resolution.
 */
function synchronousCaptureIsExportResolution() {
  return (
    state.captureCanvas?.width === EXPORT_CAMERA_WIDTH &&
    state.captureCanvas?.height === EXPORT_CAMERA_HEIGHT
  );
}

/**
 * Enable or disable camera-dependent toolbar buttons.
 */
function updateToolbarAvailability() {
  if (!ui.calibrateButton || !ui.exportButton) {
    return;
  }
  setButtonDisabled(
    ui.calibrateButton,
    !state.cameraEnabled || !state.session || !state.cv,
  );
  updateCalibrateButtonPulse();
  setButtonDisabled(ui.exportButton, !state.cameraEnabled || !state.lastDepth);
}

/**
 * Pulse the Calibrate button when live camera data has no baseline or a stale baseline.
 */
function updateCalibrateButtonPulse() {
  const shouldPulse =
    state.cameraEnabled &&
    !state.sampleImage &&
    !state.calibrating &&
    (!state.baseline || state.calibrationDirty) &&
    !!state.session &&
    !!state.cv;
  ui.calibrateButton.elt.classList.toggle("calibrate-pulse", shouldPulse);
}

/**
 * Mark live calibration as stale after controls that change the solver geometry/math.
 */
function markLiveCalibrationDirty() {
  if (state.sampleImage) {
    return;
  }
  state.calibrationDirty = true;
  updateToolbarAvailability();
}

/**
 * Set a p5 button disabled state using DOM attributes.
 */
function setButtonDisabled(button, disabled) {
  if (disabled) {
    button.attribute("disabled", "");
  } else {
    button.removeAttribute("disabled");
  }
}

/**
 * Build the metadata.json object included in each ZIP export.
 */
function createExportMetadata(date) {
  const liveResolution = liveInferenceResolution();
  const cropSourceDimensions = currentCropSourceDimensions();
  return {
    schema: "gelsight-mini-export-v2",
    version: APP_VERSION,
    timestamp: date.toISOString(),
    app: {
      name: "GelSight-Mini View/Export Tool",
      version: APP_VERSION,
      defaultModelMode: DEFAULT_ONNX_MODEL_MODE,
      defaultPreprocessMode: DEFAULT_PREPROCESS_MODE,
      defaultLiveInferenceMode: DEFAULT_LIVE_INFERENCE_MODE,
      versionPolicy:
        "Increment APP_VERSION by 0.001 for every app change.",
    },
    source: createSourceMetadata(),
    files: {
      capture: {
        filename: "capture.png",
        width: state.captureCanvas.width,
        height: state.captureCanvas.height,
        sourceMode: currentSourceMode(),
        depthSynchronous: true,
        description:
          currentSourceMode() === "demo"
            ? "Demo/sample image frame used to compute depth_16bit.png, depth_solver_units_16bit.png, and mesh.obj."
            : "Live camera frame captured synchronously with depth_16bit.png, depth_solver_units_16bit.png, and mesh.obj.",
      },
      highResolutionCapture: {
        included: state.exportCaptureIncluded,
        liveOnly: true,
        skippedBecauseCaptureAlreadyHighResolution:
          synchronousCaptureIsExportResolution(),
        skippedBecauseSourceIsDemo: !!state.sampleImage,
        skippedReason:
          !state.exportCaptureIncluded && state.sampleImage
            ? "Demo/sample exports already use the sample image as capture.png."
            : !state.exportCaptureIncluded && synchronousCaptureIsExportResolution()
            ? "capture.png was already captured at the high-resolution export size."
            : null,
        filename: state.exportHighResolutionCapture?.filename ?? null,
        width: state.exportHighResolutionCapture?.width ?? null,
        height: state.exportHighResolutionCapture?.height ?? null,
        mimeType: state.exportHighResolutionCapture?.mimeType ?? null,
        quality: state.exportHighResolutionCapture?.quality ?? null,
        defaultFormat: DEFAULT_HIGH_RESOLUTION_CAPTURE_FORMAT,
        availableFormats: Object.fromEntries(
          Object.entries(HIGH_RESOLUTION_CAPTURE_FORMATS).map(
            ([name, format]) => [
              name,
              {
                filename: format.filename,
                mimeType: format.mimeType,
                quality: format.quality,
              },
            ],
          ),
        ),
        depthSynchronous: false,
        description:
          "Temporary high-resolution camera-mode grab captured after the depth-synchronous frame.",
      },
      normalizedDepth: {
        filename: "depth_16bit.png",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        bitDepth: 16,
        colorType: "grayscale",
        units: "solver_units",
        normalizedPerCapture: true,
        encoding:
          "uint16 = round((depth - DepthMin) / (DepthMax - DepthMin) * 65535)",
        decoding:
          "depth = uint16 / 65535 * (DepthMax - DepthMin) + DepthMin",
        depthMin: state.stats?.min ?? null,
        depthMax: state.stats?.max ?? null,
        note:
          "This export encoding uses true per-capture min/max depth, not the smoothed live display normalization range.",
      },
      solverUnitsDepth: {
        filename: "depth_solver_units_16bit.png",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        bitDepth: 16,
        colorType: "grayscale",
        units: "solver_units",
        normalizedPerCapture: false,
        encoding:
          "uint16 = clamp(round(depth * 1000 + 32768), 0, 65535)",
        decoding: "depth = (uint16 - 32768) / 1000",
        scale: state.exportSolverDepthEncoding?.scale ?? 1000,
        offset: state.exportSolverDepthEncoding?.offset ?? 32768,
        depthMin: state.exportSolverDepthEncoding?.min ?? -32.768,
        depthMax: state.exportSolverDepthEncoding?.max ?? 32.767,
        zeroValue: 32768,
        clippedLow: state.exportSolverDepthEncoding?.clippedLow ?? null,
        clippedHigh: state.exportSolverDepthEncoding?.clippedHigh ?? null,
        nonFinite: state.exportSolverDepthEncoding?.nonFinite ?? null,
      },
      baseline: {
        included: !!state.baseline,
        filename: state.baseline ? "baseline_16bit.png" : null,
        width: state.baseline ? Core.WIDTH : null,
        height: state.baseline ? Core.HEIGHT : null,
        bitDepth: state.baseline ? 16 : null,
        colorType: state.baseline ? "grayscale" : null,
        normalizedPerBaselineCapture: !!state.baseline,
        encoding: state.baseline
          ? "uint16 = round((baselineDepth - BaselineMin) / (BaselineMax - BaselineMin) * 65535)"
          : null,
      },
      mesh: {
        filename: "mesh.obj",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        vertexCount: Core.PIXELS,
        triangleCount: (Core.WIDTH - 1) * (Core.HEIGHT - 1) * 2,
        zScale: EXPORT_OBJ_Z_SCALE,
        previewZSliderAffectsExport: false,
      },
    },
    camera: {
      selectedDeviceId: ui.deviceSelect?.value?.() || null,
      selectedDeviceLabel: ui.deviceSelect?.elt?.selectedOptions?.[0]?.text || null,
      selectedResolution: {
        width: state.cameraResolution.width,
        height: state.cameraResolution.height,
      },
      selectableResolutions: CAMERA_RESOLUTION_OPTIONS.map((option) => ({
        label: option.label,
        width: option.width,
        height: option.height,
      })),
      requestedFrameRate: PREFERRED_CAMERA_FRAME_RATE,
      actualSettings: state.cameraSettings,
      capabilities: state.cameraCapabilities,
      highResolutionExportRequest: {
        width: EXPORT_CAMERA_WIDTH,
        height: EXPORT_CAMERA_HEIGHT,
        frameRate: EXPORT_CAMERA_FRAME_RATE,
        skippedWhenSelectedCaptureResolutionMatches: true,
      },
      highResolutionExportSettings: state.exportCameraSettings,
    },
    exportProcess: {
      sourceMode: currentSourceMode(),
      synchronizedFrameCapturedBeforeZip: true,
      highResolutionFrameCapturedAfterSynchronizedFrame:
        state.exportCaptureIncluded,
      highResolutionFrameMayBeOneFrameStaleRelativeToDepth:
        state.exportCaptureIncluded,
      depthAndObjGeneratedFromSameDepthBuffer: true,
      exportObjZScale: EXPORT_OBJ_Z_SCALE,
    },
    crop: {
      rectNormalized: { ...state.cropRect },
      fractionEquivalent: state.cropFraction,
      aspectRatio: "4:3",
      sourceDimensions: cropSourceDimensions,
      sourcePixelRect: state.lastCropInfo
        ? {
            x: state.lastCropInfo.cropLeft,
            y: state.lastCropInfo.cropTop,
            width: state.lastCropInfo.cropWidth,
            height: state.lastCropInfo.cropHeight,
          }
        : null,
      minimumRule:
        "minimum normalized crop size = max(reconstructionWidth / sourceWidth, reconstructionHeight / sourceHeight)",
      minimumSize: minimumCropRectSize(
        cropSourceDimensions.sourceWidth,
        cropSourceDimensions.sourceHeight,
      ),
      ui: {
        draggableRectangle: true,
        moveHandle: "top-left",
        scaleHandle: "bottom-right",
        cropSliderRemoved: true,
        changingRequiresRecalibration: true,
      },
    },
    preprocessing: {
      mode: state.preprocessMode,
      defaultMode: DEFAULT_PREPROCESS_MODE,
      sourcePixelOrder: "browser canvas RGBA uint8",
      resizeTarget: { width: Core.WIDTH, height: Core.HEIGHT },
      webglCropResizeAvailable: !!state.webglPreprocess?.gl,
      temporalInputSmoothing: {
        enabled: inputSmoothingAlpha() > 0,
        alpha: inputSmoothingAlpha(),
        formula:
          "runningAvg = alpha * runningAvg + (1 - alpha) * input",
        appliedTo: "preprocessed 320x240 RGBA frame before BGR feature extraction",
      },
    },
    inference: {
      quality: state.liveInferenceMode,
      selectableQualities: [
        { label: "Fast (160×120)", mode: "half", width: 160, height: 120 },
        { label: "Full (320×240)", mode: "full", width: 320, height: 240 },
      ],
      modelMode: state.onnxModelMode,
      modelPath: state.onnxModelPath,
      runtime: isWasmMlpMode() ? "custom-wasm-mlp" : "onnxruntime-web",
      providerMode: state.onnxProviderMode,
      executionProvider: state.onnxExecutionProvider,
      providerAttempts: state.onnxProviderAttempts,
      inputResolution: liveResolution,
      reconstructionResolution: { width: Core.WIDTH, height: Core.HEIGHT },
      gradientUpsample:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? "bilinear 160x120 gradients to 320x240 before marker fill and Poisson"
          : null,
    },
    poissonIntegration: {
      method: "DCT Neumann Poisson solve",
      regularizationLambda: poissonLambda(),
      formula: "depthDct = -divergenceDct / (laplacianEigenvalue + lambda)",
      defaultLambda: DEFAULT_POISSON_LAMBDA,
      maxLambda: MAX_POISSON_LAMBDA,
      boundaryCondition: "Neumann",
      meanCentering: "Subtract reconstructed depth mean after inverse DCT.",
      implementation: "OpenCV.js dct/idct in GelSightCore.poissonDctNeumann",
    },
    calibration: {
      applied: !!state.baseline,
      dirty: state.calibrationDirty,
      dirtyReason:
        state.calibrationDirty
          ? "A live control that affects baseline compatibility changed after calibration."
          : null,
      targetFrameCount: BASELINE_FRAME_TARGET,
      frameCount: state.baseline ? state.baselineCount : 0,
      frameSampling: {
        distinctCameraFramesOnly: true,
        frameIdSource:
          "HTMLVideoElement.getVideoPlaybackQuality().totalVideoFrames with currentTime fallback",
      },
      operation: "depth = rawDepth - baselineDepth",
      exportedWhenAvailable: !!state.baseline,
    },
    depthStats: {
      min: state.stats?.min ?? null,
      max: state.stats?.max ?? null,
      mean: state.stats?.mean ?? null,
      finite: state.stats?.finite ?? null,
      units: "solver_units",
      displayNormalization: createDepthDisplayNormalizationMetadata(),
    },
    liveDisplay: {
      depthPreviewCanvas: {
        width: Core.WIDTH,
        height: Core.HEIGHT,
        normalization: createDepthDisplayNormalizationMetadata(),
      },
      meshColorUsesSameRangeAsDepthPreview: true,
    },
    performance: {
      lastProfileMs: roundProfileValues(state.profile.last),
      profileEmaMs: roundProfileValues(state.profile.ema),
      lastDrawProfileMs: roundProfileValues(state.profile.drawLast),
      lastDrawPanelProfileMs: roundProfileValues(state.profile.drawPanelsLast),
      lastDrawMeshProfileMs: roundProfileValues(state.profile.drawMeshLast),
      lastMeshGlProfile: roundProfileValues(state.profile.meshGlLast),
    },
    realtime: createRealtimeMetadata(),
    controls: createControlMetadata(),
    meshPreview: createMeshPreviewMetadata(),
    computerVision: createComputerVisionMetadata(),
  };
}

/**
 * Round timing metadata while preserving non-timing profile fields.
 */
function roundProfileValues(profile) {
  if (!profile) {
    return null;
  }

  const rounded = {};
  for (const [name, value] of Object.entries(profile)) {
    if (isProfileMetadataField(name)) {
      rounded[name] = value;
      continue;
    }
    if (typeof value === "number") {
      rounded[name] = Number(value.toFixed(3));
    } else if (Array.isArray(value)) {
      rounded[name] = value.map((item) =>
        typeof item === "number" ? Number(item.toFixed(3)) : item,
      );
    } else {
      rounded[name] = value;
    }
  }
  return rounded;
}

/**
 * Return whether the current source is live camera or demo/sample.
 */
function currentSourceMode() {
  return state.sampleImage ? "demo" : "live";
}

/**
 * Describe the active frame source and synchronized capture dimensions.
 */
function createSourceMetadata() {
  const sourceWidth =
    state.sampleImage?.naturalWidth ||
    state.video?.videoWidth ||
    state.captureCanvas?.width ||
    null;
  const sourceHeight =
    state.sampleImage?.naturalHeight ||
    state.video?.videoHeight ||
    state.captureCanvas?.height ||
    null;
  return {
    mode: currentSourceMode(),
    isDemo: !!state.sampleImage,
    liveCameraEnabled: state.cameraEnabled,
    streamActive: !!state.stream,
    sourceDimensions: {
      width: sourceWidth,
      height: sourceHeight,
    },
    synchronizedCaptureDimensions: {
      width: state.captureCanvas?.width || null,
      height: state.captureCanvas?.height || null,
    },
    lastVideoFrameId: state.lastVideoFrameId,
    demoRestoreAvailable: !!state.liveConfiguration,
  };
}

/**
 * Describe live processing cadence, busy state, and temporal smoothing.
 */
function createRealtimeMetadata() {
  return {
    processingTrigger:
      "Live processing is launched from draw() only when a distinct camera frame is observed.",
    distinctFrameDetection: {
      primary:
        "HTMLVideoElement.getVideoPlaybackQuality().totalVideoFrames",
      fallback: "HTMLVideoElement.currentTime rounded to 5 decimals",
      lastVideoFrameId: state.lastVideoFrameId,
      processedFrameCount: state.frameIndex,
    },
    cameraFrameRate: state.cameraSettings?.frameRate ?? null,
    lastFrameMs: state.lastFrameMs,
    estimatedProcessingFps:
      state.lastFrameMs > 0 ? 1000 / state.lastFrameMs : null,
    busy: state.busy,
    calibrating: state.calibrating,
    alphaInputSmoothing: {
      alpha: inputSmoothingAlpha(),
      enabled: inputSmoothingAlpha() > 0,
      defaultAlpha: DEFAULT_INPUT_SMOOTHING_ALPHA,
      maxAlpha: 0.99,
      formula: "runningAvg = alpha * runningAvg + (1 - alpha) * input",
    },
  };
}

/**
 * Describe live display-only depth normalization and its current range.
 */
function createDepthDisplayNormalizationMetadata() {
  return {
    appliesTo: ["live grayscale depth preview", "mesh color depth range"],
    affectsDepthValues: false,
    percentileLow: DEPTH_DISPLAY_PERCENTILE_LOW,
    percentileHigh: DEPTH_DISPLAY_PERCENTILE_HIGH,
    headroomPerSide: DEFAULT_DEPTH_DISPLAY_HEADROOM,
    headroomAppliedBeforeSmoothing: true,
    minimumRangeDescription:
      `Minimum display span is ${DEPTH_DISPLAY_MIN_SPAN} solver units, i.e. +/- ${(DEPTH_DISPLAY_MIN_SPAN / 2).toFixed(3)} around center.`,
    smoothingModel:
      "Smooth range center separately from span; expand span quickly and contract span slowly. Flat idle frames lock to a wider zero-centered range so display contrast does not chase sensor noise.",
    expandAlpha: DEPTH_DISPLAY_EXPAND_ALPHA,
    contractAlpha: DEPTH_DISPLAY_CONTRACT_ALPHA,
    centerAlpha: DEPTH_DISPLAY_CENTER_ALPHA,
    minSpan: DEPTH_DISPLAY_MIN_SPAN,
    flatLock: {
      enabled: true,
      percentileSpanThreshold: DEPTH_DISPLAY_FLAT_LOCK_PERCENTILE_SPAN,
      center: DEPTH_DISPLAY_FLAT_LOCK_CENTER,
      displaySpan: DEPTH_DISPLAY_FLAT_LOCK_DISPLAY_SPAN,
      currentActive: !!state.depthDisplayRange?.flatLocked,
    },
    range: state.depthDisplayRange
      ? {
          min: state.depthDisplayRange.min,
          max: state.depthDisplayRange.max,
          span: state.depthDisplayRange.span,
          percentileLow: state.depthDisplayRange.percentileLow,
          percentileHigh: state.depthDisplayRange.percentileHigh,
          percentileSpan: state.depthDisplayRange.percentileSpan,
          flatLocked: state.depthDisplayRange.flatLocked,
          targetMin: state.depthDisplayRange.targetMin,
          targetMax: state.depthDisplayRange.targetMax,
        }
      : null,
  };
}

/**
 * Describe current UI control values and which controls affect export.
 */
function createControlMetadata() {
  return {
    cameraResolution: {
      selected: `${state.cameraResolution.width}x${state.cameraResolution.height}`,
      options: CAMERA_RESOLUTION_OPTIONS.map((option) => option.label),
    },
    inferenceQuality: {
      selected: state.liveInferenceMode,
      options: [
        { label: "Fast (160×120)", mode: "half" },
        { label: "Full (320×240)", mode: "full" },
      ],
    },
    alpha: {
      value: inputSmoothingAlpha(),
      min: 0,
      max: 0.99,
      step: 0.01,
      defaultValue: DEFAULT_INPUT_SMOOTHING_ALPHA,
    },
    lambda: {
      value: poissonLambda(),
      min: 0,
      max: MAX_POISSON_LAMBDA,
      step: 0.0005,
      defaultValue: DEFAULT_POISSON_LAMBDA,
      changingRequiresRecalibration: true,
    },
    zPreviewScale: {
      value: Number(ui.zScale?.value?.() ?? 9),
      min: 1,
      max: 30,
      step: 1,
      affectsExportObj: false,
    },
    meshBilinearPreview: {
      value: meshBilinearEnabled(),
      defaultValue: true,
      label: "#",
      affectsExportObj: false,
    },
    demoLiveToggle: {
      buttonShows: state.sampleImage ? "Live" : "Demo",
      demoLoaded: !!state.sampleImage,
      restoresLastLiveConfiguration: true,
    },
    removedControls: {
      refreshButtonRemoved: true,
      cropSliderRemoved: true,
      temporaryHeadroomSliderRemoved: true,
    },
  };
}

/**
 * Describe the WebGL mesh preview renderer and current camera state.
 */
function createMeshPreviewMetadata() {
  return {
    renderer:
      "custom WebGL filled heightfield with sparse wire overlay; checkbox toggles texture-bilinear smooth surface vs faceted indexed surface",
    fallbackRenderer:
      "p5 immediate-mode TRIANGLE_STRIP wireframe retained in renderMeshLayer()",
    automaticP5FallbackEnabled: MESH_USE_P5_WIREFRAME_FALLBACK,
    reconstructionResolution: { width: Core.WIDTH, height: Core.HEIGHT },
    meshStep: MESH_STEP,
    surfaceTextureStep: MESH_SURFACE_TEXTURE_STEP,
    bilinearPreviewEnabled: meshBilinearEnabled(),
    renderedSurfaceMode: state.profile.meshGlLast?.meshGlSurfaceMode ?? null,
    smoothSurfaceAvailable: !!state.meshGl?.smoothSurfaceReady,
    checkboxLabel: "#",
    previewOnly: true,
    exportObjUnaffected: true,
    colorDepthRange: state.depthDisplayRange
      ? {
          min: state.depthDisplayRange.min,
          max: state.depthDisplayRange.max,
          source: "smoothed display normalization range",
        }
      : null,
    surfaceDepthSampling:
      state.profile.meshGlLast?.meshGlSurfaceDepthSampling ??
      (meshBilinearEnabled()
        ? "manual bilinear float texture sampling in vertex shader"
        : "per-vertex depth attribute"),
    surfaceNormals:
      state.profile.meshGlLast?.meshGlSurfaceSmoothNormals
        ? "smooth finite-difference normals sampled from neighboring depth texels"
        : "faceted triangle geometry with interpolated depth color",
    fallbackMeshStep: MESH_FALLBACK_STEP,
    wireOverlayStepMultiplier: MESH_WIRE_OVERLAY_STEP_MULTIPLIER,
    wireOverlayPixelPitch: MESH_STEP * MESH_WIRE_OVERLAY_STEP_MULTIPLIER,
    requestedLineWidth: MESH_LINE_WIDTH,
    lineWidthRange:
      state.profile.meshGlLast?.meshGlLineWidthRange ?? null,
    vertices: state.profile.meshGlLast?.meshGlVertices ?? null,
    surfaceVertices: state.profile.meshGlLast?.meshGlSurfaceVertices ?? null,
    surfaceTriangles: state.profile.meshGlLast?.meshGlSurfaceTriangles ?? null,
    triangleIndices: state.profile.meshGlLast?.meshGlTriangleIndices ?? null,
    lineIndices: state.profile.meshGlLast?.meshGlLineIndices ?? null,
    camera: currentMeshCameraMetadata(),
  };
}

/**
 * Serialize the p5 mesh camera for export metadata.
 */
function currentMeshCameraMetadata() {
  const cam = state.meshLayer?._renderer?.states?.curCamera;
  if (!cam) {
    return null;
  }
  return {
    eyeX: cam.eyeX,
    eyeY: cam.eyeY,
    eyeZ: cam.eyeZ,
    centerX: cam.centerX,
    centerY: cam.centerY,
    centerZ: cam.centerZ,
    upX: cam.upX,
    upY: cam.upY,
    upZ: cam.upZ,
    cameraFOV: cam.cameraFOV,
    cameraNear: cam.cameraNear,
    cameraFar: cam.cameraFar,
  };
}

/**
 * Describe model, preprocessing, gradients, Poisson integration, and export CV details.
 */
function createComputerVisionMetadata() {
  return {
    model: {
      path: state.onnxModelPath,
      mode: state.onnxModelMode,
      availableModes: {
        ...ONNX_MODEL_PATHS,
        [WASM_MLP_MODEL_MODE]: WASM_MLP_WEIGHT_PATH,
        [WASM_MLP_FP16_MODEL_MODE]: WASM_MLP_FP16_WEIGHT_PATH,
      },
      runtime: isWasmMlpMode() ? "custom-wasm-mlp" : "onnxruntime-web",
      executionProviderMode: state.onnxProviderMode,
      executionProvidersRequested:
        isWasmMlpMode()
          ? ["custom-wasm-mlp"]
          : getOnnxExecutionProviderCandidates(),
      executionProviderSelected: state.onnxExecutionProvider,
      executionProviderAttempts: state.onnxProviderAttempts,
      inputName: "features",
      outputName: "normal_xy",
      inputShape: [Core.PIXELS, Core.FEATURE_COUNT],
      liveInputShape:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? [LIVE_INFERENCE_PIXELS, Core.FEATURE_COUNT]
          : [Core.PIXELS, Core.FEATURE_COUNT],
      inputDType: "float32",
      fullResolutionOutputShape: [Core.PIXELS, 2],
      liveRawOutputShape:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? [LIVE_INFERENCE_PIXELS, 2]
          : [Core.PIXELS, 2],
      reconstructionOutputShape: [Core.PIXELS, 2],
      outputDType: "float32",
      architecture:
        "GelSight RGB2NormNet MLP: 5 input features, 3 hidden layers of 64 ReLU units, 2 normal outputs",
    },
    imagePreprocessing: {
      sourcePixelOrder: "browser canvas RGBA uint8",
      modelFeatureOrder: ["B/255", "G/255", "R/255", "y/height", "x/width"],
      colorOrderWarning:
        "The GelSight model expects OpenCV-style BGR feature order. Supplying RGB causes false depth artifacts.",
      reconstructionWidth: Core.WIDTH,
      reconstructionHeight: Core.HEIGHT,
      reconstructionPixels: Core.PIXELS,
      liveInferenceMode: state.liveInferenceMode,
      liveInferenceResolution:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? [LIVE_INFERENCE_WIDTH, LIVE_INFERENCE_HEIGHT]
          : [Core.WIDTH, Core.HEIGHT],
      liveInferenceGradientUpsample:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? "bilinear 160x120 gradients to 320x240 before marker fill and Poisson"
          : null,
      featureCount: Core.FEATURE_COUNT,
      staticFeatureColumnsPrecomputed: ["y/height", "x/width"],
      preprocessMode: state.preprocessMode,
      temporalInputSmoothing: {
        enabled: inputSmoothingAlpha() > 0,
        alpha: inputSmoothingAlpha(),
        formula:
          "runningAvg = alpha * runningAvg + (1 - alpha) * input",
        appliedTo: "preprocessed 320x240 RGBA frame before BGR feature extraction",
      },
      cropFraction: state.cropFraction,
      cropRect: state.cropRect,
      cropMinimumRule:
        "minimum normalized crop size = max(reconstructionWidth / sourceWidth, reconstructionHeight / sourceHeight)",
      cropMinimumSize: minimumCropRectSize(),
      cropMinimumSourceDimensions: currentCropSourceDimensions(),
      resizeTarget: [Core.WIDTH, Core.HEIGHT],
      capturePngIsDepthSynchronous: true,
      capturePngSource:
        currentSourceMode() === "demo"
          ? "capture.png is the demo/sample frame used for depth_16bit.png and mesh.obj."
          : "capture.png is the live camera frame synchronized to depth_16bit.png and mesh.obj.",
      highResolutionCaptureExportedUncropped: state.exportCaptureIncluded,
      highResolutionCaptureNote:
        state.exportCaptureIncluded
          ? "The high-resolution capture is a separate one-frame camera grab for still inspection and is not depth-synchronous."
          : "No separate high-resolution capture was included for this export.",
    },
    markerFill: {
      enabled: true,
      thresholdLowInclusive: Core.MARKER_THRESHOLD_LOW,
      thresholdHighInclusive: Core.MARKER_THRESHOLD_HIGH,
      grayscaleWeightsAppliedToBgr: Core.MARKER_GRAYSCALE_WEIGHTS_BGR,
      interpolationMethod:
        "Browser approximation of Python nearest-neighbor marker gradient fill.",
    },
    normalsAndGradients: {
      normalOutput: {
        components: ["normal_x", "normal_y"],
        implicitNormalZ:
          "normal_z = sqrt(max(minNormalZ^2, 1 - normal_x^2 - normal_y^2))",
        maxNormalXYMagnitude: 0.995,
        minNormalZ: 0.01,
      },
      gradientConversion: {
        formulaX: "gx = -normal_x / normal_z",
        formulaY: "gy = -normal_y / normal_z",
        markerFillAppliedBeforeSanitize: true,
        sanitizeAppliedBeforePoisson: true,
        maxGradientAbs: Core.MAX_GRADIENT_ABS,
        lastSanitize: state.lastGradientSanitize,
      },
      liveHalfInference:
        state.liveInferenceMode === "half" && isWasmMlpMode()
          ? {
              inferenceResolution: {
                width: LIVE_INFERENCE_WIDTH,
                height: LIVE_INFERENCE_HEIGHT,
                pixels: LIVE_INFERENCE_PIXELS,
              },
              upsample:
                "Bilinear gradient upsample to 320x240 before marker fill and Poisson.",
            }
          : null,
    },
    poissonIntegration: {
      method: "DCT Neumann Poisson solve",
      implementation: "GelSightCore.poissonDctNeumann using OpenCV.js dct/idct",
      boundaryCondition: "Neumann",
      regularizationLambda: poissonLambda(),
      formula: "depthDct = -divergenceDct / (laplacianEigenvalue + lambda)",
      defaultLambda: DEFAULT_POISSON_LAMBDA,
      maxLambda: MAX_POISSON_LAMBDA,
      meanCentering: "Subtract reconstructed depth mean after inverse DCT.",
      inputGradientUnits: "solver_units_per_pixel",
    },
    realtime: createRealtimeMetadata(),
    calibration: {
      baselineTargetFrameCount: BASELINE_FRAME_TARGET,
      baselineApplied: !!state.baseline,
      baselineDirty: state.calibrationDirty,
      baselineFrameCount: state.baseline ? state.baselineCount : 0,
      baselineFrameSampling:
        "Calibration counts distinct camera frames using getVideoPlaybackQuality().totalVideoFrames when available, with currentTime fallback.",
      baselineOperation: "depth = rawDepth - baselineDepth",
      baselineExportedWhenAvailable: !!state.baseline,
    },
    export: {
      depthPng: {
        filename: "depth_16bit.png",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        bitDepth: 16,
        colorType: "grayscale",
        normalizedToDepthMinMax: true,
      },
      solverUnitsDepthPng: {
        filename: "depth_solver_units_16bit.png",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        bitDepth: 16,
        colorType: "grayscale",
        normalizedToDepthMinMax: false,
        units: "solver_units",
        encoding:
          "uint16 = clamp(round(depth * 1000 + 32768), 0, 65535)",
        decoding: "depth = (uint16 - 32768) / 1000",
        scale: state.exportSolverDepthEncoding?.scale ?? 1000,
        offset: state.exportSolverDepthEncoding?.offset ?? 32768,
        min: state.exportSolverDepthEncoding?.min ?? -32.768,
        max: state.exportSolverDepthEncoding?.max ?? 32.767,
        zeroValue: 32768,
        clippedLow: state.exportSolverDepthEncoding?.clippedLow ?? null,
        clippedHigh: state.exportSolverDepthEncoding?.clippedHigh ?? null,
        nonFinite: state.exportSolverDepthEncoding?.nonFinite ?? null,
      },
      baselinePng: {
        filename: "baseline_16bit.png",
        included: !!state.baseline,
        bitDepth: 16,
        colorType: "grayscale",
      },
      obj: {
        filename: "mesh.obj",
        width: Core.WIDTH,
        height: Core.HEIGHT,
        vertexCount: Core.PIXELS,
        triangleCount: (Core.WIDTH - 1) * (Core.HEIGHT - 1) * 2,
        zScale: EXPORT_OBJ_Z_SCALE,
        previewZSliderAffectsExport: false,
      },
    },
  };
}

/**
 * Lay out and draw the three main preview panels and telemetry.
 */
function drawPanels() {
  const top = 116;
  const margin = 18;
  const panelGap = 16;
  const panelWidth = Math.max(
    220,
    Math.min(380, (width - margin * 2 - panelGap * 2) / 3),
  );
  const panelHeight = panelWidth * (Core.HEIGHT / Core.WIDTH);
  const x0 = margin;
  const x1 = x0 + panelWidth + panelGap;
  const x2 = x1 + panelWidth + panelGap;

  drawPanelLabel("Frame", x0, top - 24);
  drawPanelLabel("Depth", x1, top - 24);
  drawPanelLabel("Mesh", x2, top - 24);

  const frameStart = performance.now();
  drawFrame(x0, top, panelWidth, panelHeight);
  const depthStart = performance.now();
  drawDepth(x1, top, panelWidth, panelHeight);
  const meshStart = performance.now();
  drawMesh(x2, top, panelWidth, panelHeight);
  const captionStart = performance.now();
  drawPanelCaption("Live GelSight Mini Camera", x0, top + panelHeight + 8);
  drawPanelCaption("Estimated Depth Image", x1, top + panelHeight + 8);
  drawPanelCaption("3D Mesh View", x2, top + panelHeight + 8);
  drawTelemetry(margin, top + panelHeight + 38);
  positionMeshInterpolationControl(x2 + panelWidth + 8, top);
  positionZScaleControl(x2 + panelWidth + 8, top + panelHeight);
  const done = performance.now();
  state.profile.drawPanelsLast = {
    drawFrame: depthStart - frameStart,
    drawDepth: meshStart - depthStart,
    drawMesh: captionStart - meshStart,
    drawLabelsTelemetry: done - captionStart,
  };
}

/**
 * Position the floating vertical Z scale slider next to the mesh panel.
 */
function positionZScaleControl(x, bottom) {
  if (!ui.zControl) {
    return;
  }
  const controlHeight = 132;
  const controlWidth = 28;
  const left = Math.min(width - controlWidth - 8, Math.max(0, x));
  const top = Math.max(104, bottom - controlHeight);
  ui.zControl.position(left, top);
}

/**
 * Position the floating bilinear/faceted mesh checkbox.
 */
function positionMeshInterpolationControl(x, top) {
  if (!ui.meshInterpolationControl) {
    return;
  }
  const controlWidth = 28;
  const left = Math.min(width - controlWidth - 8, Math.max(0, x));
  ui.meshInterpolationControl.position(left, Math.max(104, top));
}

/**
 * Draw a small label above a preview panel.
 */
function drawPanelLabel(label, x, y) {
  noStroke();
  fill("#aeb9c1");
  textSize(12);
  textAlign(LEFT, BASELINE);
  text(label, x, y);
}

/**
 * Draw a small caption below a preview panel.
 */
function drawPanelCaption(label, x, y) {
  noStroke();
  fill("#8b949b");
  textSize(10);
  textStyle(NORMAL);
  textAlign(LEFT, TOP);
  text(label, x, y);
}

/**
 * Draw the live/demo source frame and crop/calibration overlays.
 */
function drawFrame(x, y, w, h) {
  state.frameRect = { x, y, w, h };
  drawPanelBack(x, y, w, h);
  const source = currentFrameDisplaySource();
  if (source) {
    drawingContext.drawImage(source, x, y, w, h);
  } else if (state.lastImageData) {
    drawingContext.drawImage(state.preprocess.canvas, x, y, w, h);
  }
  drawCropOverlay(x, y, w, h);
  if (state.calibrating) {
    drawCalibrationOverlay(x, y, w, h);
  }
}

/**
 * Return the best available source to show in the frame panel.
 */
function currentFrameDisplaySource() {
  if (state.sampleImage) {
    return state.sampleImage;
  }
  if (state.video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return state.video;
  }
  return null;
}

/**
 * Draw the draggable crop rectangle and its handles.
 */
function drawCropOverlay(x, y, w, h) {
  const cropRect = clampCropRect(state.cropRect);
  state.cropRect = cropRect;
  const cropX = x + cropRect.x * w;
  const cropY = y + cropRect.y * h;
  const cropW = cropRect.w * w;
  const cropH = cropRect.h * h;
  const handleSize = 5;
  const halfHandle = handleSize / 2;
  // Top-left handle moves the crop rectangle; bottom-right handle scales it.
  // The rectangle itself is always clamped back to a 4:3 valid crop.

  push();
  noFill();
  stroke(0);
  strokeWeight(0.5);
  rect(cropX, cropY, cropW, cropH);
  noStroke();
  fill(0);
  rect(cropX - halfHandle, cropY - halfHandle, handleSize, handleSize);
  rect(
    cropX + cropW - halfHandle,
    cropY + cropH - halfHandle,
    handleSize,
    handleSize,
  );
  pop();

  state.cropHandleRects.move = {
    x: cropX - halfHandle,
    y: cropY - halfHandle,
    w: handleSize,
    h: handleSize,
  };
  state.cropHandleRects.scale = {
    x: cropX + cropW - halfHandle,
    y: cropY + cropH - halfHandle,
    w: handleSize,
    h: handleSize,
  };
}

/**
 * Draw the red do-not-touch calibration overlay.
 */
function drawCalibrationOverlay(x, y, w, h) {
  push();
  noStroke();
  fill(255, 0, 0, 128);
  textAlign(CENTER, CENTER);
  textFont("sans-serif");
  textStyle(BOLD);
  textSize(20);
  textLeading(24);
  const count = Math.min(state.baselineCount, BASELINE_FRAME_TARGET);
  text(
    `CALIBRATING: ${count}/${BASELINE_FRAME_TARGET}\nDO NOT TOUCH`,
    x + w / 2,
    y + h / 2,
  );
  pop();
}

/**
 * Draw the stabilized grayscale depth preview.
 */
function drawDepth(x, y, w, h) {
  drawPanelBack(x, y, w, h);
  if (state.lastDepth) {
    drawingContext.drawImage(state.depthCanvas, x, y, w, h);
  }
}

/**
 * Render the offscreen mesh layer and copy it into the main canvas.
 */
function drawMesh(x, y, w, h) {
  state.meshRect = { x, y, w, h };
  drawPanelBack(x, y, w, h);
  if (!state.lastDepth) {
    return;
  }
  const renderStart = performance.now();
  renderMeshLayer();
  const imageStart = performance.now();
  drawingContext.drawImage(state.meshLayer.elt, x, y, w, h);
  const done = performance.now();
  state.profile.drawMeshLast = {
    drawMeshRender: imageStart - renderStart,
    drawMeshImageCopy: done - imageStart,
  };
}

/**
 * Draw the dark panel background behind previews.
 */
function drawPanelBack(x, y, w, h) {
  noStroke();
  fill("#171d22");
  rect(x, y, w, h, 6);
}

/**
 * Render the 3D mesh preview into the offscreen p5 WEBGL layer.
 */
function renderMeshLayer() {
  const pg = state.meshLayer;
  const depth = state.lastDepth;
  const meshStep = MESH_STEP;
  const zScale = ui.zScale.value();

  pg.background("#171d22");
  syncMeshOrbitControlState(pg);
  p5.prototype.orbitControl.call(pg, 1, 1, 1);

  if (renderMeshLayerWebGl(pg, depth, meshStep, zScale)) {
    return;
  }
  if (!MESH_USE_P5_WIREFRAME_FALLBACK) {
    state.profile.meshGlLast = {
      meshGlUnavailable: true,
      meshGlFallbackDisabled: true,
      meshGlRequestedStep: MESH_STEP,
      meshGlFallbackStep: MESH_FALLBACK_STEP,
    };
    return;
  }
  const fallbackStep = MESH_FALLBACK_STEP;

  pg.push();
  pg.noFill();
  pg.stroke("#72d0d1");
  pg.strokeWeight(MESH_LINE_WIDTH);
  pg.translate(-Core.WIDTH / 2, -Core.HEIGHT / 2, -18);

  for (let y = 0; y < Core.HEIGHT - fallbackStep; y += fallbackStep) {
    pg.beginShape(TRIANGLE_STRIP);
    for (let x = 0; x < Core.WIDTH; x += fallbackStep) {
      const i0 = y * Core.WIDTH + x;
      const i1 = (y + fallbackStep) * Core.WIDTH + x;
      pg.vertex(x, y, finiteDepthZ(depth[i0], zScale));
      pg.vertex(x, y + fallbackStep, finiteDepthZ(depth[i1], zScale));
    }
    pg.endShape();
  }

  pg.pop();
}

/**
 * Render the mesh with the custom WebGL filled-surface and wire overlay path.
 */
function renderMeshLayerWebGl(pg, depth, meshStep, zScale) {
  const renderer = pg?._renderer;
  const gl = renderer?.GL;
  if (!gl) {
    return false;
  }

  const meshGl = ensureMeshGlRenderer(gl, meshStep);
  if (!meshGl) {
    return false;
  }

  const useSmoothSurface = meshBilinearEnabled() && meshGl.smoothSurfaceReady;
  const updateStart = performance.now();
  for (let i = 0; i < meshGl.vertexCount; i += 1) {
    meshGl.depthData[i] = finiteDepthZ(
      depth[meshGl.depthIndices[i]],
      1,
    );
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.depthBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, meshGl.depthData);
  if (useSmoothSurface) {
    // Smooth mode uploads all 320x240 depths as a float texture. The shader
    // does manual bilinear sampling, avoiding dependence on float linear
    // filtering support.
    for (let i = 0; i < Core.PIXELS; i += 1) {
      meshGl.depthTextureData[i * 4] = finiteDepthZ(depth[i], 1);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, meshGl.depthTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      Core.WIDTH,
      Core.HEIGHT,
      gl.RGBA,
      gl.FLOAT,
      meshGl.depthTextureData,
    );
  }
  const afterUpdate = performance.now();

  renderer.states.uPMatrix.set(renderer.states.curCamera.projMatrix);
  renderer.states.uViewMatrix.set(renderer.states.curCamera.cameraMatrix);

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);
  if (useSmoothSurface) {
    drawMeshGlSmoothSurface(gl, meshGl, renderer, zScale);
  } else {
    // The unchecked # mode deliberately returns to the previous indexed,
    // faceted surface path while retaining the sparse wire overlay.
    drawMeshGlFacetedSurface(gl, meshGl, renderer, zScale);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(meshGl.lineProgram);
  gl.uniformMatrix4fv(
    meshGl.lineUniforms.projection,
    false,
    renderer.states.uPMatrix.mat4,
  );
  gl.uniformMatrix4fv(
    meshGl.lineUniforms.view,
    false,
    renderer.states.uViewMatrix.mat4,
  );
  gl.uniform1f(meshGl.lineUniforms.zScale, zScale);
  gl.uniform4f(meshGl.lineUniforms.color, 0.06, 0.09, 0.1, 0.55);

  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.positionBuffer);
  gl.enableVertexAttribArray(meshGl.lineAttributes.position);
  gl.vertexAttribPointer(meshGl.lineAttributes.position, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.depthBuffer);
  gl.enableVertexAttribArray(meshGl.lineAttributes.depth);
  gl.vertexAttribPointer(meshGl.lineAttributes.depth, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshGl.lineIndexBuffer);
  gl.lineWidth(MESH_LINE_WIDTH);
  gl.drawElements(gl.LINES, meshGl.lineIndexCount, gl.UNSIGNED_SHORT, 0);
  gl.disable(gl.BLEND);

  disableMeshGlVertexAttribArray(gl, meshGl.smoothSurfaceAttributes.position);
  disableMeshGlVertexAttribArray(gl, meshGl.facetedSurfaceAttributes.position);
  disableMeshGlVertexAttribArray(gl, meshGl.facetedSurfaceAttributes.depth);
  disableMeshGlVertexAttribArray(gl, meshGl.lineAttributes.position);
  disableMeshGlVertexAttribArray(gl, meshGl.lineAttributes.depth);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  gl.useProgram(null);

  const done = performance.now();
  state.profile.meshGlLast = {
    meshGlDepthUpload: afterUpdate - updateStart,
    meshGlDraw: done - afterUpdate,
    meshGlLineWidthRequested: MESH_LINE_WIDTH,
    meshGlLineWidthRange: Array.from(
      gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE),
    ),
    meshGlSurfaceMode: useSmoothSurface ? "texture-bilinear" : "faceted",
    meshGlBilinearRequested: meshBilinearEnabled(),
    meshGlVertices: meshGl.vertexCount,
    meshGlSurfaceVertices: useSmoothSurface
      ? meshGl.surfaceVertexCount
      : meshGl.vertexCount,
    meshGlSurfaceTriangles: useSmoothSurface
      ? meshGl.surfaceVertexCount / 3
      : meshGl.triangleIndexCount / 3,
    meshGlSurfaceDepthSampling: useSmoothSurface ? "texture-bilinear" : "vertex-attribute",
    meshGlSurfaceSmoothNormals: useSmoothSurface,
    meshGlWireOverlayStepMultiplier: MESH_WIRE_OVERLAY_STEP_MULTIPLIER,
    meshGlWireOverlayPixelPitch: meshStep * MESH_WIRE_OVERLAY_STEP_MULTIPLIER,
    meshGlIndexType: "UNSIGNED_SHORT",
    meshGlTriangleIndices: meshGl.triangleIndexCount,
    meshGlLineIndices: meshGl.lineIndexCount,
  };
  return true;
}

/**
 * Read the preview checkbox that toggles smooth bilinear surface rendering.
 */
function meshBilinearEnabled() {
  return ui.meshBilinear?.checked?.() ?? true;
}

/**
 * Disable a vertex attribute only when its location is valid.
 */
function disableMeshGlVertexAttribArray(gl, location) {
  if (location >= 0) {
    gl.disableVertexAttribArray(location);
  }
}

/**
 * Draw the texture-displaced smooth heightfield preview surface.
 */
function drawMeshGlSmoothSurface(gl, meshGl, renderer, zScale) {
  gl.useProgram(meshGl.smoothSurfaceProgram);

  gl.uniformMatrix4fv(
    meshGl.smoothSurfaceUniforms.projection,
    false,
    renderer.states.uPMatrix.mat4,
  );
  gl.uniformMatrix4fv(
    meshGl.smoothSurfaceUniforms.view,
    false,
    renderer.states.uViewMatrix.mat4,
  );
  gl.uniform1f(meshGl.smoothSurfaceUniforms.zScale, zScale);
  gl.uniform2f(
    meshGl.smoothSurfaceUniforms.depthRange,
    currentDepthDisplayRange().min,
    currentDepthDisplayRange().max,
  );
  gl.uniform2f(
    meshGl.smoothSurfaceUniforms.depthTextureSize,
    Core.WIDTH,
    Core.HEIGHT,
  );
  gl.uniform3f(meshGl.smoothSurfaceUniforms.lightDirection, 0.35, -0.45, 0.82);
  gl.uniform1i(meshGl.smoothSurfaceUniforms.depthTexture, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.surfacePositionBuffer);
  gl.enableVertexAttribArray(meshGl.smoothSurfaceAttributes.position);
  gl.vertexAttribPointer(
    meshGl.smoothSurfaceAttributes.position,
    2,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.drawArrays(gl.TRIANGLES, 0, meshGl.surfaceVertexCount);
}

/**
 * Return the stabilized display range, falling back to current stats.
 */
function currentDepthDisplayRange() {
  if (state.depthDisplayRange) {
    return state.depthDisplayRange;
  }
  return enforceDepthDisplayMinSpan(
    state.stats?.min ?? -DEPTH_DISPLAY_MIN_SPAN / 2,
    state.stats?.max ?? DEPTH_DISPLAY_MIN_SPAN / 2,
  );
}

/**
 * Draw the previous indexed faceted heightfield preview surface.
 */
function drawMeshGlFacetedSurface(gl, meshGl, renderer, zScale) {
  gl.useProgram(meshGl.facetedSurfaceProgram);

  gl.uniformMatrix4fv(
    meshGl.facetedSurfaceUniforms.projection,
    false,
    renderer.states.uPMatrix.mat4,
  );
  gl.uniformMatrix4fv(
    meshGl.facetedSurfaceUniforms.view,
    false,
    renderer.states.uViewMatrix.mat4,
  );
  gl.uniform1f(meshGl.facetedSurfaceUniforms.zScale, zScale);
  gl.uniform2f(
    meshGl.facetedSurfaceUniforms.depthRange,
    currentDepthDisplayRange().min,
    currentDepthDisplayRange().max,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.positionBuffer);
  gl.enableVertexAttribArray(meshGl.facetedSurfaceAttributes.position);
  gl.vertexAttribPointer(
    meshGl.facetedSurfaceAttributes.position,
    2,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, meshGl.depthBuffer);
  gl.enableVertexAttribArray(meshGl.facetedSurfaceAttributes.depth);
  gl.vertexAttribPointer(
    meshGl.facetedSurfaceAttributes.depth,
    1,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshGl.triangleIndexBuffer);
  gl.drawElements(gl.TRIANGLES, meshGl.triangleIndexCount, gl.UNSIGNED_SHORT, 0);
}

/**
 * Create or reuse custom WebGL buffers, shaders, textures, and indices.
 */
function ensureMeshGlRenderer(gl, meshStep) {
  const existing = state.meshGl;
  if (existing?.gl === gl && existing.meshStep === meshStep) {
    return existing;
  }

  const smoothSurfaceSupported = meshGlSupportsFloatVertexTextures(gl);
  const smoothSurfaceProgram = smoothSurfaceSupported
    ? createMeshGlSmoothSurfaceProgram(gl)
    : null;
  const facetedSurfaceProgram = createMeshGlFacetedSurfaceProgram(gl);
  const lineProgram = createMeshGlLineProgram(gl);
  if (!facetedSurfaceProgram || !lineProgram) {
    return null;
  }

  const xs = gridCoordinates(Core.WIDTH, meshStep);
  const ys = gridCoordinates(Core.HEIGHT, meshStep);
  const vertexCount = xs.length * ys.length;
  // Keep indexed geometry under 65,535 vertices so it works without uint32
  // element-index extensions. The dense smooth surface is drawn unindexed.
  if (vertexCount > 65535) {
    console.info("Mesh WebGL renderer fell back: too many uint16 vertices.");
    return null;
  }

  const positions = new Float32Array(vertexCount * 2);
  const depthIndices = new Uint32Array(vertexCount);
  let out = 0;
  for (const y of ys) {
    for (const x of xs) {
      positions[out * 2] = x;
      positions[out * 2 + 1] = y;
      depthIndices[out] = y * Core.WIDTH + x;
      out += 1;
    }
  }

  const surfacePositions = smoothSurfaceProgram
    ? createMeshGlSurfacePositions(
        Core.WIDTH,
        Core.HEIGHT,
        MESH_SURFACE_TEXTURE_STEP,
      )
    : new Float32Array(0);
  const surfaceVertexCount = surfacePositions.length / 2;

  const triangleIndices = [];
  // These indices drive the faceted surface path and the OBJ-like topology
  // preview. Smooth mode uses a separate unindexed dense triangle list.
  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let col = 0; col < xs.length - 1; col += 1) {
      const a = row * xs.length + col;
      const b = a + 1;
      const c = a + xs.length;
      const d = c + 1;
      triangleIndices.push(a, c, b, b, c, d);
    }
  }

  const lineIndices = [];
  const overlayStep = Math.max(1, MESH_WIRE_OVERLAY_STEP_MULTIPLIER);
  // The line overlay is sparse on purpose; a dense wireframe shimmered badly
  // in WebGL and made the surface harder to inspect.
  for (let row = 0; row < ys.length; row += overlayStep) {
    for (let col = 0; col < xs.length - 1; col += 1) {
      const i = row * xs.length + col;
      lineIndices.push(i, i + 1);
    }
  }
  for (let col = 0; col < xs.length; col += overlayStep) {
    for (let row = 0; row < ys.length - 1; row += 1) {
      const i = row * xs.length + col;
      lineIndices.push(i, i + xs.length);
    }
  }
  if ((ys.length - 1) % overlayStep !== 0) {
    const row = ys.length - 1;
    for (let col = 0; col < xs.length - 1; col += 1) {
      const i = row * xs.length + col;
      lineIndices.push(i, i + 1);
    }
  }
  if ((xs.length - 1) % overlayStep !== 0) {
    const col = xs.length - 1;
    for (let row = 0; row < ys.length - 1; row += 1) {
      const i = row * xs.length + col;
      lineIndices.push(i, i + xs.length);
    }
  }
  const triangles = new Uint16Array(triangleIndices);
  const lines = new Uint16Array(lineIndices);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const surfacePositionBuffer = smoothSurfaceProgram ? gl.createBuffer() : null;
  if (surfacePositionBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, surfacePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, surfacePositions, gl.STATIC_DRAW);
  }

  const depthBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, depthBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexCount * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);

  const depthTextureData = smoothSurfaceProgram
    ? new Float32Array(Core.PIXELS * 4)
    : null;
  if (depthTextureData) {
    for (let i = 0; i < Core.PIXELS; i += 1) {
      depthTextureData[i * 4 + 3] = 1;
    }
  }
  const depthTexture = depthTextureData
    ? createMeshGlDepthTexture(gl, depthTextureData)
    : null;
  const smoothSurfaceReady = !!(smoothSurfaceProgram && depthTexture);
  if (smoothSurfaceProgram && !smoothSurfaceReady) {
    console.info(
      "Mesh WebGL smooth surface unavailable; using faceted surface path.",
    );
  }

  const triangleIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);

  const lineIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lines, gl.STATIC_DRAW);

  state.meshGl = {
    gl,
    meshStep,
    smoothSurfaceProgram,
    facetedSurfaceProgram,
    lineProgram,
    surfacePositionBuffer,
    positionBuffer,
    depthBuffer,
    depthTexture,
    depthTextureData,
    triangleIndexBuffer,
    lineIndexBuffer,
    depthData: new Float32Array(vertexCount),
    depthIndices,
    vertexCount,
    surfaceVertexCount,
    smoothSurfaceReady,
    triangleIndexCount: triangles.length,
    lineIndexCount: lines.length,
    smoothSurfaceAttributes: {
      position: smoothSurfaceProgram
        ? gl.getAttribLocation(smoothSurfaceProgram, "aPosition")
        : -1,
    },
    smoothSurfaceUniforms: {
      projection: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uProjectionMatrix")
        : null,
      view: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uViewMatrix")
        : null,
      zScale: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uZScale")
        : null,
      depthRange: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uDepthRange")
        : null,
      depthTexture: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uDepthTexture")
        : null,
      depthTextureSize: smoothSurfaceProgram
        ? gl.getUniformLocation(
            smoothSurfaceProgram,
            "uDepthTextureSize",
          )
        : null,
      lightDirection: smoothSurfaceProgram
        ? gl.getUniformLocation(smoothSurfaceProgram, "uLightDirection")
        : null,
    },
    facetedSurfaceAttributes: {
      position: gl.getAttribLocation(facetedSurfaceProgram, "aPosition"),
      depth: gl.getAttribLocation(facetedSurfaceProgram, "aDepth"),
    },
    facetedSurfaceUniforms: {
      projection: gl.getUniformLocation(
        facetedSurfaceProgram,
        "uProjectionMatrix",
      ),
      view: gl.getUniformLocation(facetedSurfaceProgram, "uViewMatrix"),
      zScale: gl.getUniformLocation(facetedSurfaceProgram, "uZScale"),
      depthRange: gl.getUniformLocation(
        facetedSurfaceProgram,
        "uDepthRange",
      ),
    },
    lineAttributes: {
      position: gl.getAttribLocation(lineProgram, "aPosition"),
      depth: gl.getAttribLocation(lineProgram, "aDepth"),
    },
    lineUniforms: {
      projection: gl.getUniformLocation(lineProgram, "uProjectionMatrix"),
      view: gl.getUniformLocation(lineProgram, "uViewMatrix"),
      zScale: gl.getUniformLocation(lineProgram, "uZScale"),
      color: gl.getUniformLocation(lineProgram, "uColor"),
    },
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  return state.meshGl;
}

/**
 * Check whether the context can sample float textures in vertex shaders.
 */
function meshGlSupportsFloatVertexTextures(gl) {
  const hasVertexTextures =
    gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
  const isWebGl2 =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext;
  const hasFloatTexture = isWebGl2 || !!gl.getExtension("OES_texture_float");
  return hasVertexTextures && hasFloatTexture;
}

/**
 * Allocate the float depth texture used by smooth mesh displacement.
 */
function createMeshGlDepthTexture(gl, depthTextureData) {
  const isWebGl2 =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext;
  const depthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    isWebGl2 ? gl.RGBA32F : gl.RGBA,
    Core.WIDTH,
    Core.HEIGHT,
    0,
    gl.RGBA,
    gl.FLOAT,
    depthTextureData,
  );
  const error = gl.getError();
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (error !== gl.NO_ERROR) {
    console.info(`Mesh WebGL depth texture allocation failed: ${error}.`);
    gl.deleteTexture(depthTexture);
    return null;
  }
  return depthTexture;
}

/**
 * Build an unindexed dense triangle list for smooth surface rendering.
 */
function createMeshGlSurfacePositions(width, height, step) {
  const xs = gridCoordinates(width, step);
  const ys = gridCoordinates(height, step);
  const cellCount = (xs.length - 1) * (ys.length - 1);
  const positions = new Float32Array(cellCount * 6 * 2);
  let out = 0;

  for (let row = 0; row < ys.length - 1; row += 1) {
    const y0 = ys[row];
    const y1 = ys[row + 1];
    for (let col = 0; col < xs.length - 1; col += 1) {
      const x0 = xs[col];
      const x1 = xs[col + 1];
      out = writeMeshGlPosition(positions, out, x0, y0);
      out = writeMeshGlPosition(positions, out, x0, y1);
      out = writeMeshGlPosition(positions, out, x1, y0);
      out = writeMeshGlPosition(positions, out, x1, y0);
      out = writeMeshGlPosition(positions, out, x0, y1);
      out = writeMeshGlPosition(positions, out, x1, y1);
    }
  }

  return positions;
}

/**
 * Append one 2D mesh vertex position to a packed Float32Array.
 */
function writeMeshGlPosition(positions, out, x, y) {
  positions[out] = x;
  positions[out + 1] = y;
  return out + 2;
}

/**
 * Create grid coordinates including the final pixel edge.
 */
function gridCoordinates(size, step) {
  const values = [];
  for (let value = 0; value < size; value += step) {
    values.push(value);
  }
  const last = size - 1;
  if (values[values.length - 1] !== last) {
    values.push(last);
  }
  return values;
}

/**
 * Generate shared vertex shader source for attribute-depth mesh paths.
 */
function meshGlVertexPositionSource(extraUniforms = "", extraVaryings = "", body = "") {
  return `
    attribute vec2 aPosition;
    attribute float aDepth;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uViewMatrix;
    uniform float uZScale;
    ${extraUniforms}
    ${extraVaryings}
    void main() {
      vec3 position = vec3(
        aPosition.x - ${(Core.WIDTH / 2).toFixed(1)},
        aPosition.y - ${(Core.HEIGHT / 2).toFixed(1)},
        aDepth * uZScale - 18.0
      );
      ${body}
      gl_Position = uProjectionMatrix * uViewMatrix * vec4(position, 1.0);
    }
  `;
}

/**
 * Compile the bilinear texture-sampled smooth surface shader program.
 */
function createMeshGlSmoothSurfaceProgram(gl) {
  const vertexShader = compileMeshGlShader(
    gl,
    gl.VERTEX_SHADER,
    `
      precision highp float;
      attribute vec2 aPosition;
      uniform mat4 uProjectionMatrix;
      uniform mat4 uViewMatrix;
      uniform float uZScale;
      uniform vec2 uDepthRange;
      uniform vec2 uDepthTextureSize;
      uniform sampler2D uDepthTexture;
      varying float vDepth;
      varying vec3 vNormal;

      float sampleDepth(vec2 position) {
        vec2 maxPosition = uDepthTextureSize - vec2(1.0);
        vec2 clampedPosition = clamp(position, vec2(0.0), maxPosition);
        vec2 base = floor(clampedPosition);
        vec2 fraction = clampedPosition - base;
        vec2 next = min(base + vec2(1.0), maxPosition);
        vec2 texel = 1.0 / uDepthTextureSize;
        float d00 = texture2D(uDepthTexture, (base + vec2(0.5)) * texel).r;
        float d10 = texture2D(uDepthTexture, (vec2(next.x, base.y) + vec2(0.5)) * texel).r;
        float d01 = texture2D(uDepthTexture, (vec2(base.x, next.y) + vec2(0.5)) * texel).r;
        float d11 = texture2D(uDepthTexture, (next + vec2(0.5)) * texel).r;
        return mix(mix(d00, d10, fraction.x), mix(d01, d11, fraction.x), fraction.y);
      }

      void main() {
        float depth = sampleDepth(aPosition);
        float left = sampleDepth(aPosition - vec2(1.0, 0.0));
        float right = sampleDepth(aPosition + vec2(1.0, 0.0));
        float up = sampleDepth(aPosition - vec2(0.0, 1.0));
        float down = sampleDepth(aPosition + vec2(0.0, 1.0));
        vec3 dx = vec3(2.0, 0.0, (right - left) * uZScale);
        vec3 dy = vec3(0.0, 2.0, (down - up) * uZScale);
        vNormal = normalize(cross(dx, dy));

        float span = max(0.0001, uDepthRange.y - uDepthRange.x);
        vDepth = clamp((depth - uDepthRange.x) / span, 0.0, 1.0);
        vec3 position = vec3(
          aPosition.x - ${(Core.WIDTH / 2).toFixed(1)},
          aPosition.y - ${(Core.HEIGHT / 2).toFixed(1)},
          depth * uZScale - 18.0
        );
        gl_Position = uProjectionMatrix * uViewMatrix * vec4(position, 1.0);
      }
    `,
  );
  const fragmentShader = compileMeshGlShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      varying float vDepth;
      varying vec3 vNormal;
      uniform vec3 uLightDirection;
      void main() {
        vec3 lowColor = vec3(0.10, 0.18, 0.20);
        vec3 highColor = vec3(0.50, 0.86, 0.82);
        vec3 color = mix(lowColor, highColor, vDepth);
        vec3 normal = normalize(vNormal);
        vec3 light = normalize(uLightDirection);
        float diffuse = clamp(dot(normal, light), 0.0, 1.0);
        float rim = pow(1.0 - abs(normal.z), 2.0) * 0.18;
        vec3 shaded = color * (0.46 + diffuse * 0.54) + vec3(rim);
        gl_FragColor = vec4(shaded, 1.0);
      }
    `,
  );
  return linkMeshGlProgram(gl, vertexShader, fragmentShader);
}

/**
 * Compile the indexed faceted surface shader program.
 */
function createMeshGlFacetedSurfaceProgram(gl) {
  const vertexShader = compileMeshGlShader(
    gl,
    gl.VERTEX_SHADER,
    meshGlVertexPositionSource(
      "uniform vec2 uDepthRange;",
      "varying float vDepth;",
      `
        float span = max(0.0001, uDepthRange.y - uDepthRange.x);
        vDepth = clamp((aDepth - uDepthRange.x) / span, 0.0, 1.0);
      `,
    ),
  );
  const fragmentShader = compileMeshGlShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      varying float vDepth;
      void main() {
        vec3 lowColor = vec3(0.10, 0.18, 0.20);
        vec3 highColor = vec3(0.50, 0.86, 0.82);
        vec3 color = mix(lowColor, highColor, vDepth);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  );
  return linkMeshGlProgram(gl, vertexShader, fragmentShader);
}

/**
 * Compile the sparse wire overlay shader program.
 */
function createMeshGlLineProgram(gl) {
  const vertexShader = compileMeshGlShader(
    gl,
    gl.VERTEX_SHADER,
    meshGlVertexPositionSource(),
  );
  const fragmentShader = compileMeshGlShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      uniform vec4 uColor;
      void main() {
        gl_FragColor = uColor;
      }
    `,
  );
  return linkMeshGlProgram(gl, vertexShader, fragmentShader);
}

/**
 * Link a mesh WebGL program and log link failures.
 */
function linkMeshGlProgram(gl, vertexShader, fragmentShader) {
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.info("Mesh WebGL shader link failed.", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Compile a mesh WebGL shader and log compilation failures.
 */
function compileMeshGlShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.info("Mesh WebGL shader compile failed.", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Convert non-finite depth to zero before using it as mesh Z.
 */
function finiteDepthZ(value, zScale) {
  return Number.isFinite(value) ? value * zScale : 0;
}

/**
 * Draw compact live depth, timing, crop, and calibration telemetry.
 */
function drawTelemetry(x, y) {
  noStroke();
  fill("#d7dcdf");
  textSize(13);
  textStyle(NORMAL);
  textAlign(LEFT, TOP);
  const parts = [];
  if (state.stats) {
    parts.push(
      `depth ${state.stats.min.toFixed(2)}..${state.stats.max.toFixed(2)}`,
    );
  }
  if (state.lastFrameMs) {
    const fps = 1000 / state.lastFrameMs;
    parts.push(`${state.lastFrameMs.toFixed(1)}ms`);
    parts.push(`${fps.toFixed(2)}fps`);
  }
  parts.push(`crop ${Math.round(state.cropFraction * 100)}%`);
  parts.push(state.baseline ? "calibrated" : "uncalibrated");
  text(parts.join("  |  "), x, y);
}

/**
 * Update the app status string and toolbar status display.
 */
function setStatus(message) {
  state.status = message;
  if (ui.status) {
    ui.status.html(message);
  }
}

/**
 * Test whether a point lies inside a rectangle object.
 */
function pointInRect(x, y, rect) {
  return (
    !!rect &&
    x >= rect.x &&
    x <= rect.x + rect.w &&
    y >= rect.y &&
    y <= rect.y + rect.h
  );
}

/**
 * Reset the p5 WEBGL mesh camera to the chosen default view.
 */
function resetMeshView() {
  const pg = state.meshLayer;
  if (!pg) {
    return;
  }
  const cam = pg._renderer.states.curCamera;
  cam.camera(
    -15.227326042769901,
    240.13197206859843,
    544.9850401010783,
    -9.540819979158563,
    3.143010160255983,
    -1.462377933240873,
    0,
    1,
    0,
  );
  cam.perspective(0.4426288846955826, pg.width / pg.height, 80, 8000);
  pg._renderer.rotateVelocity.set(0, 0, 0);
  pg._renderer.moveVelocity.set(0, 0);
  pg._renderer.zoomVelocity = 0;
  pg._renderer.executeRotateAndMove = false;
  pg._renderer.executeZoom = false;
}

/**
 * Choose the correct cursor for crop handles, mesh controls, or default state.
 */
function updateMeshCursor() {
  if (state.cropDrag.mode === "move") {
    document.body.style.cursor = "move";
    return;
  }
  if (state.cropDrag.mode === "scale") {
    document.body.style.cursor = "nwse-resize";
    return;
  }
  if (pointInRect(mouseX, mouseY, state.cropHandleRects.move)) {
    document.body.style.cursor = "move";
    return;
  }
  if (pointInRect(mouseX, mouseY, state.cropHandleRects.scale)) {
    document.body.style.cursor = "nwse-resize";
    return;
  }
  if (state.meshPointer.pressed && state.meshPointer.button === "left") {
    document.body.style.cursor = "grabbing";
  } else if (
    state.meshPointer.pressed &&
    state.meshPointer.button === "right"
  ) {
    document.body.style.cursor = "move";
  } else if (pointInRect(mouseX, mouseY, state.meshRect)) {
    document.body.style.cursor = "grab";
  } else {
    document.body.style.cursor = "";
  }
}

/**
 * Route pointer-down events to crop or mesh handlers.
 */
function handleCanvasPointerDown(event) {
  if (handleCropPointerDown(event)) {
    return;
  }
  handleMeshPointerDown(event);
}

/**
 * Route pointer-move events to crop or mesh handlers.
 */
function handleCanvasPointerMove(event) {
  if (state.cropDrag.mode) {
    handleCropPointerMove(event);
    return;
  }
  handleMeshPointerMove(event);
}

/**
 * Route pointer-up events to crop or mesh handlers.
 */
function handleCanvasPointerUp(event) {
  if (state.cropDrag.mode) {
    handleCropPointerUp(event);
    return;
  }
  handleMeshPointerUp(event);
}

/**
 * Start moving or scaling the crop rectangle from a handle.
 */
function handleCropPointerDown(event) {
  if (event.button !== 0) {
    return false;
  }
  const pointerPosition = pointerEventPosition(event);
  const mode = cropHandleModeAt(pointerPosition.x, pointerPosition.y);
  if (!mode) {
    return false;
  }

  const local = normalizedFramePoint(pointerPosition.x, pointerPosition.y);
  if (!local) {
    return false;
  }

  const cropRect = clampCropRect(state.cropRect);
  state.cropRect = cropRect;
  state.cropDrag.mode = mode;
  state.cropDrag.offsetX = local.x - cropRect.x;
  state.cropDrag.offsetY = local.y - cropRect.y;
  state.cropDrag.startX = cropRect.x;
  state.cropDrag.startY = cropRect.y;
  state.cropDrag.startW = cropRect.w;
  state.cropDrag.startH = cropRect.h;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  return true;
}

/**
 * Update the crop rectangle while dragging a crop handle.
 */
function handleCropPointerMove(event) {
  const pointerPosition = pointerEventPosition(event);
  const local = normalizedFramePoint(pointerPosition.x, pointerPosition.y);
  if (!local) {
    return;
  }

  if (state.cropDrag.mode === "move") {
    const size = state.cropDrag.startW;
    state.cropRect = clampCropRect({
      x: local.x - state.cropDrag.offsetX,
      y: local.y - state.cropDrag.offsetY,
      w: size,
      h: size,
    });
  } else if (state.cropDrag.mode === "scale") {
    const available = Math.min(
      1 - state.cropDrag.startX,
      1 - state.cropDrag.startY,
    );
    const requested = Math.max(
      local.x - state.cropDrag.startX,
      local.y - state.cropDrag.startY,
    );
    const size = Math.max(
      minimumCropRectSize(),
      Math.min(available, requested),
    );
    state.cropRect = clampCropRect({
      x: state.cropDrag.startX,
      y: state.cropDrag.startY,
      w: size,
      h: size,
    });
  }

  syncCropSliderFromRect();
  event.preventDefault();
}

/**
 * Finish crop dragging and reprocess a static sample if needed.
 */
async function handleCropPointerUp(event) {
  const changed = cropRectChangedSinceDragStart();
  state.cropDrag.mode = null;
  event.preventDefault();
  if (changed) {
    resetInputSmoothing();
    resetDepthDisplayRange();
    markLiveCalibrationDirty();
  }
  if (state.sampleImage) {
    await processSourceFrame(state.sampleImage);
  }
}

/**
 * Compare the current crop rectangle to the rectangle at pointer-down time.
 */
function cropRectChangedSinceDragStart() {
  const epsilon = 0.000001;
  return (
    Math.abs(state.cropRect.x - state.cropDrag.startX) > epsilon ||
    Math.abs(state.cropRect.y - state.cropDrag.startY) > epsilon ||
    Math.abs(state.cropRect.w - state.cropDrag.startW) > epsilon ||
    Math.abs(state.cropRect.h - state.cropDrag.startH) > epsilon
  );
}

/**
 * Return the crop handle under a point, if any.
 */
function cropHandleModeAt(x, y) {
  if (pointInRect(x, y, state.cropHandleRects.move)) {
    return "move";
  }
  if (pointInRect(x, y, state.cropHandleRects.scale)) {
    return "scale";
  }
  return null;
}

/**
 * Convert a canvas point into normalized coordinates within the frame panel.
 */
function normalizedFramePoint(x, y) {
  if (!state.frameRect) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(1, (x - state.frameRect.x) / state.frameRect.w)),
    y: Math.max(0, Math.min(1, (y - state.frameRect.y) / state.frameRect.h)),
  };
}

/**
 * Legacy no-op retained for old crop-slider call sites.
 */
function syncCropSliderFromRect() {
  const cropRect = clampCropRect(state.cropRect);
  state.cropRect = cropRect;
  state.cropFraction = Math.max(0, (1 - cropRect.w) / 2);
}

/**
 * Capture pointer state for mesh orbit, pan, or zoom gestures.
 */
function handleMeshPointerDown(event) {
  const pointerPosition = pointerEventPosition(event);
  if (!pointInRect(pointerPosition.x, pointerPosition.y, state.meshRect)) {
    return;
  }
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  updateMeshPointer(pointerPosition.x, pointerPosition.y);
  state.meshPointer.pressed = true;
  state.meshPointer.button = pointerButtonName(event.button);
}

/**
 * Update saved pointer position while mesh interaction is active.
 */
function handleMeshPointerMove(event) {
  const pointerPosition = pointerEventPosition(event);
  if (
    !state.meshPointer.pressed &&
    !pointInRect(pointerPosition.x, pointerPosition.y, state.meshRect)
  ) {
    return;
  }
  updateMeshPointer(pointerPosition.x, pointerPosition.y);
  if (state.meshPointer.pressed) {
    event.preventDefault();
  }
}

/**
 * Release mesh pointer capture state.
 */
function handleMeshPointerUp(event) {
  if (state.meshPointer.pressed) {
    event.preventDefault();
  }
  state.meshPointer.pressed = false;
  state.meshPointer.button = "none";
}

/**
 * Normalize pointer button numbers into gesture names.
 */
function pointerButtonName(button) {
  if (button === 2) {
    return "right";
  }
  if (button === 1) {
    return "center";
  }
  return "left";
}

/**
 * Return canvas-relative pointer coordinates for mouse or touch events.
 */
function pointerEventPosition(event) {
  if (Number.isFinite(event.offsetX) && Number.isFinite(event.offsetY)) {
    return { x: event.offsetX, y: event.offsetY };
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

/**
 * Store the latest mesh pointer position for orbitControl forwarding.
 */
function updateMeshPointer(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const pointer = state.meshPointer;
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = x;
  pointer.y = y;
  pointer.movedX = pointer.px >= 0 ? pointer.x - pointer.px : 0;
  pointer.movedY = pointer.py >= 0 ? pointer.y - pointer.py : 0;
}

/**
 * Forward captured pointer and wheel state into the offscreen p5 renderer.
 */
function syncMeshOrbitControlState(pg) {
  const panelRect = state.meshRect;
  const pointer = state.meshPointer;
  if (!panelRect) {
    return;
  }

  const scaleX = finiteNumber(pg.width / panelRect.w, 1);
  const scaleY = finiteNumber(pg.height / panelRect.h, 1);
  const localX = finiteNumber((pointer.x - panelRect.x) * scaleX, -1);
  const localY = finiteNumber((pointer.y - panelRect.y) * scaleY, -1);
  const previousLocalX = finiteNumber(
    (pointer.px - panelRect.x) * scaleX,
    localX,
  );
  const previousLocalY = finiteNumber(
    (pointer.py - panelRect.y) * scaleY,
    localY,
  );

  pg.mouseX = localX;
  pg.mouseY = localY;
  pg.pmouseX = previousLocalX;
  pg.pmouseY = previousLocalY;
  pg.winMouseX = localX;
  pg.winMouseY = localY;
  pg.pwinMouseX = previousLocalX;
  pg.pwinMouseY = previousLocalY;
  pg.movedX = finiteNumber(pointer.movedX * scaleX, 0);
  pg.movedY = finiteNumber(pointer.movedY * scaleY, 0);
  pg.mouseIsPressed = pointer.pressed;
  pg.mouseButton = {
    left: pointer.button === "left",
    right: pointer.button === "right",
    center: pointer.button === "center",
  };
  pg.touches = [];
  pg._renderer.prevTouches ??= [];
  pg._mouseWheelDeltaY = finiteNumber(pointer.wheelDeltaY, 0);
  sanitizeOrbitVelocity(pg);
  pointer.movedX = 0;
  pointer.movedY = 0;
  pointer.wheelDeltaY = 0;
}

/**
 * Clamp or clear non-finite p5 orbit-control velocity values.
 */
function sanitizeOrbitVelocity(pg) {
  const renderer = pg._renderer;
  if (
    !Number.isFinite(renderer.rotateVelocity?.x) ||
    !Number.isFinite(renderer.rotateVelocity?.y) ||
    !Number.isFinite(renderer.rotateVelocity?.z)
  ) {
    renderer.rotateVelocity.set(0, 0, 0);
  }
  if (
    !Number.isFinite(renderer.moveVelocity?.x) ||
    !Number.isFinite(renderer.moveVelocity?.y)
  ) {
    renderer.moveVelocity.set(0, 0);
  }
  if (!Number.isFinite(renderer.zoomVelocity)) {
    renderer.zoomVelocity = 0;
  }
}

/**
 * Return a finite number or a fallback value.
 */
function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
