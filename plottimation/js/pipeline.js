/**
 * Computer-vision pipeline.
 *
 * This module implements both alignment branches used by the app:
 * - marker-based alignment, which finds crosses or dots between frames
 * - markerless alignment, which estimates a straight frame lattice directly from the sheet image
 *
 * The markerless branch deliberately emits synthetic frame-corner intersections in the same shape
 * as the marker pipeline's lookup data. That keeps the manual-corner editor and diagnostics shared
 * across both modes instead of maintaining a second parallel editing model.
 */
import { t } from "./i18n.js";
const IGNORE_PX = 8;
const DOT_DIM_PCT_COLS = 0.03;
const DOT_DIM_PCT_ROWS = 0.02;
const GUTTER_PCT = 0.01;
const MIN_CROSS_DETECTION_RATIO = 0.5;
const MIN_CROSS_DETECTIONS_ABS = 4;
const PAGE_WARP_LOW_LONG_EDGE_PX = 1100;
const MARKERLESS_WORKING_LONG_EDGE_PX = 720;
const MARKERLESS_AUTOCORR_SEARCH_FRAC = 0.25;
const MARKERLESS_MIN_PITCH_PX = 12;
const MARKERLESS_PADDING_FRAC = 0.35;
const MARKERLESS_PHASE_BAND_WIDTH = 3;
// High-resolution extraction should track the real source-image resolution instead of a fixed
// paper-size number. The long edge of the extraction warp is capped at 90% of the source-image
// diagonal so extraction preserves more detail while still preventing pathological warp sizes.
const PAGE_WARP_HIGH_DIAGONAL_CAP_SCALE = 0.90;

// Unnormalized matched-filter kernel for dark "+" registration marks on bright paper.
// The negative total sum suppresses blank page areas while rewarding the orthogonal cross strokes.
const crossKernel = [
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-4,-8,-4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-8,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4],
  [-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8,-8],
  [-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-8,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4],
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-4,-8,-4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2],
  [2,2,2,2,2,2,2,2,2,2,-1,-4,-8,-4,-1,2,2,2,2,2,2,2,2,2,2]
];

/**
 * Estimate the square ROI size used for cross-region inspection and detection.
 *
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @param {number} cols
 * @param {number} rows
 * @param {number} crossRoiScale
 * @param {number} fallbackWidth
 * @param {number} fallbackHeight
 * @returns {number}
 */
export function estimateCrossRoiSidePx(gridWidth, gridHeight, cols, rows, crossRoiScale, fallbackWidth, fallbackHeight) {
  const effectiveWidth = gridWidth || fallbackWidth;
  const effectiveHeight = gridHeight || fallbackHeight;
  const cellW = effectiveWidth / Math.max(1, cols);
  const cellH = effectiveHeight / Math.max(1, rows);
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.18 * crossRoiScale));
  return roiHalf * 2 + 1;
}

/**
 * Build a diagnostic image using the same monochrome + cross-kernel convolution path as the coarse detector.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {HTMLCanvasElement} targetCanvas
 * @returns {HTMLCanvasElement}
 */
export function buildCrossConvolutionCanvas(sourceCanvas, targetCanvas) {
  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const src32 = new cv.Mat();
  const conv32 = new cv.Mat();
  const conv8 = new cv.Mat();
  const kernelMat = cv.matFromArray(25, 25, cv.CV_32F, crossKernel.flat());

  try {
    // Match the coarse detector exactly so the diagnostic view is a faithful preview of the sweep signal.
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    gray.convertTo(src32, cv.CV_32F);
    cv.filter2D(src32, conv32, cv.CV_32F, kernelMat, new cv.Point(-1, -1), 0, cv.BORDER_CONSTANT);

    // The kernel sum is negative, so a bright blank page produces a large negative response.
    // For diagnostics we want the same "bright cross hits, dark background" signal used by the sweeps,
    // not the absolute value, which would turn the whole page white.
    clampPositiveConvolutionToUint8(conv32, conv8);
    cv.imshow(targetCanvas, conv8);
    return targetCanvas;
  } finally {
    src.delete();
    gray.delete();
    src32.delete();
    conv32.delete();
    conv8.delete();
    kernelMat.delete();
  }
}

/**
 * Recompute only the page threshold and largest page quadrilateral for lightweight Raw-panel
 * feedback while the user drags the threshold offset slider.
 *
 * @param {cv.Mat} grayImg
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {string} thresholdMethod
 * @param {number} thresholdOffset
 * @returns {{threshVal:number, pageQuadPoints:{x:number,y:number}[] | null}}
 */
export function previewPageBoundary(grayImg, sourceWidth, sourceHeight, thresholdMethod, thresholdOffset) {
  const thresh = new cv.Mat();
  try {
    const threshVal = applyPaperThreshold(grayImg, thresh, thresholdMethod, thresholdOffset);
    let pageQuadPoints = null;
    try {
      pageQuadPoints = findLargestQuad(thresh, sourceWidth * sourceHeight).points;
    } catch {
      pageQuadPoints = null;
    }
    return { threshVal, pageQuadPoints };
  } finally {
    thresh.delete();
  }
}

/**
 * Convert a float convolution image into an 8-bit display/sweep image by clamping negative values to 0
 * and positive values to 255.
 *
 * @param {cv.Mat} conv32
 * @param {cv.Mat} target8
 * @returns {void}
 */
function clampPositiveConvolutionToUint8(conv32, target8) {
  target8.create(conv32.rows, conv32.cols, cv.CV_8UC1);
  const src = conv32.data32F;
  const dst = target8.data;
  for (let i = 0; i < src.length; i++) {
    const value = src[i];
    dst[i] = value <= 0 ? 0 : (value >= 255 ? 255 : Math.round(value));
  }
}

/**
 * Run the full page-detection, rectification, alignment, and frame-extraction pipeline.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {object} config
 * @param {number} requestId
 * @param {(requestId:number) => void} throwIfAborted
 * @returns {{
 *   frames: HTMLCanvasElement[],
 *   rectifiedCanvas: HTMLCanvasElement,
 *   pagePreviewCanvas: HTMLCanvasElement,
 *   pagePreviewGridQuad: {tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}} | null,
 *   alignmentInfo: object,
 *   statusText: string,
 *   pageQuadPoints: {x:number, y:number}[]
 * }}
 */
export function runPipeline(sourceCanvas, config, requestId, throwIfAborted) {
  const visionSrc = cv.imread(sourceCanvas);
  const styledSrc = cv.imread(sourceCanvas);
  const grayImg = new cv.Mat();
  const thresh = new cv.Mat();
  let pageQuad = null;
  let pageWarpLow = null;
  let pageWarpHigh = null;
  let rectifiedWarp = null;
  let pageWarpPreviewCanvas = null;

  try {
    const useMarkerlessAlignment = config.alignmentPipeline === "markerless";
    const useInvertedMarkerVision = !useMarkerlessAlignment && config.lightOnDarkDesign;
    if (useInvertedMarkerVision) {
      // Marker mode normally assumes dark artwork / markers on a lighter page. For light ink on
      // dark paper, invert only the CV input so page detection and marker localization can keep
      // using the normal detector path. The styled image stays untouched so previews and extracted
      // frames retain the original artwork colors.
      cv.bitwise_not(visionSrc, visionSrc);
    }

    // Segment the paper sheet from the surroundings. In light-on-dark marker mode the vision image
    // has already been inverted, so this stage still sees a bright page against darker surroundings.
    cv.cvtColor(visionSrc, grayImg, cv.COLOR_RGBA2GRAY);
    const threshVal = applyPaperThreshold(grayImg, thresh, config.thresholdMethod, config.thresholdOffset);
    throwIfAborted(requestId);

    // Detect the page quadrilateral in raw-photo coordinates.
    pageQuad = findLargestQuad(thresh, sourceCanvas.width * sourceCanvas.height);
    const ordered = orderCorners(pageQuad.points);
    throwIfAborted(requestId);

    // Build a stable low-res page warp and a denser extraction warp from aspect ratio alone.
    // Paper dimensions are treated only as aspect-ratio hints, not literal output pixels.
    const pageSizeLow = estimatePageWarpSizeFromAspect(config.paperAspect, PAGE_WARP_LOW_LONG_EDGE_PX);
    const pageSizeHigh = estimateHighResPageWarpSize(
      pageQuad.quadAreaPx,
      config.paperAspect,
      pageSizeLow,
      sourceCanvas.width,
      sourceCanvas.height
    );
    pageWarpLow = perspectiveWarp(visionSrc, styledSrc, ordered, pageSizeLow);
    pageWarpHigh = perspectiveWarp(visionSrc, styledSrc, ordered, pageSizeHigh);
    pageWarpPreviewCanvas = matToCanvas(pageWarpHigh.styledMat);
    throwIfAborted(requestId);

    const useRectifiedAsSource = config.useRectifiedAsSource;
    rectifiedWarp = useMarkerlessAlignment
      ? buildFrameGridRectification_withoutMarkers(pageWarpHigh)
      : buildFrameGridRectification_fromCrosses(
          visionSrc,
          styledSrc,
          pageWarpHigh,
          config,
          useRectifiedAsSource
        );
    throwIfAborted(requestId);

    // Resolve the marker lattice if enabled; otherwise keep the nominal grid and unrefined ROI views.
    const alignmentInfo = config.useCrossAlignment
      ? (
        useMarkerlessAlignment
          ? buildMarkerlessAlignmentData(
              rectifiedWarp.visionMat,
              config.frameCols,
              config.frameRows,
              config.crossRoiScale,
              rectifiedWarp.gridBounds,
              config.paperMarginPx,
              {
                useDarkness: config.markerlessUseDarkness,
                useTexture: config.markerlessUseTexture,
                useVariance: config.markerlessUseVariance,
                lightOnDark: config.lightOnDarkDesign,
              },
            )
          : buildCrossAlignmentData(
              rectifiedWarp.visionMat,
              config.frameCols,
              config.frameRows,
              config.crossRoiScale,
              rectifiedWarp.gridBounds,
              {
                markerType: config.alignmentMarkerType,
                includeCornerCrosses: rectifiedWarp.includeCornerCrosses,
                detectCrossesWithConvolution: config.detectCrossesWithConvolution,
              }
            )
      )
      : buildUnrefinedCrossRegionInfo(
          rectifiedWarp.visionMat,
          config.frameCols,
          config.frameRows,
          "disabled",
          rectifiedWarp.gridBounds,
          config.crossRoiScale,
          {
            markerType: config.alignmentMarkerType,
            includeCornerCrosses: rectifiedWarp.includeCornerCrosses,
          }
        );
    // In the all-cross format, the coarse quad is only approximate; use the detected corner crosses
    // to tighten the working grid bounds before frame extraction.
    if (rectifiedWarp.includeCornerCrosses) {
      refineAlignmentBoundsFromCornerCrosses(alignmentInfo);
    }
    throwIfAborted(requestId);

    // Extract each animation frame from the styled rectified sheet with the chosen interpolation mode.
    const frames = sliceRectifiedToCanvases(
      rectifiedWarp.styledMat,
      alignmentInfo,
      config.crop,
      getCvInterpolationFlag(config.exportOptions.resampling),
      requestId,
      throwIfAborted
    );
    const rectifiedCanvas = matToCanvas(rectifiedWarp.styledMat);
    const statusText = buildStatusText({
      threshVal,
      rawWidth: sourceCanvas.width,
      rawHeight: sourceCanvas.height,
      pageAreaPct: pageQuad.areaPct,
      pageWarpWidth: pageSizeLow.width,
      pageWarpHeight: pageSizeLow.height,
      highPageWarpWidth: pageSizeHigh.width,
      highPageWarpHeight: pageSizeHigh.height,
      alignmentInfo,
      frameCount: frames.length,
      expectedFrameCount: config.frameCols * config.frameRows,
      rectifiedWidth: rectifiedWarp.styledMat.cols,
      rectifiedHeight: rectifiedWarp.styledMat.rows,
      animationWidth: frames[0]?.width || 0,
      animationHeight: frames[0]?.height || 0,
      gridDetector: "cross-only",
    });

    return {
      frames,
      rectifiedCanvas,
      pagePreviewCanvas: pageWarpPreviewCanvas,
      pagePreviewGridQuad: rectifiedWarp.previewGridQuad || null,
      alignmentInfo,
      statusText,
      pageQuadPoints: pageQuad.points,
    };
  } catch (error) {
    if (error?.name !== "ProcessAbortedError") {
      error.partialResult = {
        pageQuadPoints: pageQuad?.points || null,
        rectifiedCanvas: pageWarpPreviewCanvas,
      };
    }
    throw error;
  } finally {
    rectifiedWarp?.visionMat?.delete();
    rectifiedWarp?.styledMat?.delete();
    pageWarpLow?.visionMat?.delete();
    pageWarpLow?.styledMat?.delete();
    pageWarpHigh?.visionMat?.delete();
    pageWarpHigh?.styledMat?.delete();
    visionSrc.delete();
    styledSrc.delete();
    grayImg.delete();
    thresh.delete();
  }
}

/**
 * New frame-grid detector based only on the cross lattice.
 *
 * @param {cv.Mat} visionSrc
 * @param {cv.Mat} styledSrc
 * @param {{visionMat:cv.Mat, styledMat:cv.Mat, inverseTransform:number[]}} pageWarpHigh
 * @param {object} config
 * @param {boolean} useRectifiedAsSource
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, gridBounds:{left:number, top:number, width:number, height:number}, includeCornerCrosses:boolean}}
 */
function buildFrameGridRectification_fromCrosses(visionSrc, styledSrc, pageWarpHigh, config, useRectifiedAsSource) {
  // New path: detect the frame-grid bounds directly from cross activity instead of corner circles.
  const coarseGridQuadHigh = findFrameGridQuadFromCrosses(
    pageWarpHigh.visionMat,
    config.frameCols,
    config.frameRows,
    {
      paperMarginPx: config.paperMarginPx,
      boundarySensitivity: config.boundarySensitivity,
      boundaryPersistencePx: config.boundaryPersistencePx,
    }
  );
  const rectifiedSize = estimateRectifiedSizeFromQuad(coarseGridQuadHigh);
  const detectionPadding = estimateDetectionPadding(
    rectifiedSize.width,
    rectifiedSize.height,
    config.frameCols,
    config.frameRows,
    config.crossRoiScale
  );
  const finalGridQuad = useRectifiedAsSource
    ? coarseGridQuadHigh
    : mapQuadThroughHomography(coarseGridQuadHigh, pageWarpHigh.inverseTransform);
  const finalVisionSource = useRectifiedAsSource ? pageWarpHigh.visionMat : visionSrc;
  const finalStyledSource = useRectifiedAsSource ? pageWarpHigh.styledMat : styledSrc;
  // Rectify the coarse grid region itself; later cross localization refines the exact lattice inside it.
  const rectifiedWarp = rectifyByQuad(
    finalVisionSource,
    finalStyledSource,
    finalGridQuad,
    rectifiedSize,
    detectionPadding
  );
  return { ...rectifiedWarp, includeCornerCrosses: true, previewGridQuad: coarseGridQuadHigh };
}

/**
 * Markerless mode skips the coarse cross-boundary detector and treats the full rectified page as
 * the working sheet. A later autocorrelation pass fits the interior lattice directly.
 *
 * @param {{visionMat:cv.Mat, styledMat:cv.Mat}} pageWarpHigh
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, gridBounds:{left:number, top:number, width:number, height:number}, includeCornerCrosses:boolean, previewGridQuad:null}}
 */
function buildFrameGridRectification_withoutMarkers(pageWarpHigh) {
  const visionMat = pageWarpHigh.visionMat.clone();
  const styledMat = pageWarpHigh.styledMat.clone();
  return {
    visionMat,
    styledMat,
    gridBounds: { left: 0, top: 0, width: visionMat.cols, height: visionMat.rows },
    includeCornerCrosses: true,
    previewGridQuad: null,
  };
}

/**
 * Estimate the grayscale threshold used to isolate the page.
 *
 * Supported methods:
 * - `offset-peak`: histogram peak plus offset
 * - `otsu`: Otsu automatic threshold plus offset
 * - `triangle`: Triangle automatic threshold plus offset
 * - `adaptive`: heavily blurred local threshold field plus offset
 *
 * @param {cv.Mat} grayImg
 * @param {string} [method="offset-peak"]
 * @param {number} [offset=-20]
 * @returns {number}
 */
function estimatePaperThreshold(grayImg, method = "offset-peak", offset = -20) {
  if (method === "otsu") {
    const scratch = new cv.Mat();
    try {
      const otsu = cv.threshold(grayImg, scratch, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      return Math.max(0, Math.min(255, Math.round(otsu + offset)));
    } finally {
      scratch.delete();
    }
  }
  if (method === "triangle") {
    const scratch = new cv.Mat();
    try {
      const triangle = cv.threshold(grayImg, scratch, 0, 255, cv.THRESH_BINARY | cv.THRESH_TRIANGLE);
      return Math.max(0, Math.min(255, Math.round(triangle + offset)));
    } finally {
      scratch.delete();
    }
  }

  const images = new cv.MatVector();
  const hist = new cv.Mat();
  images.push_back(grayImg);
  cv.calcHist(images, [0], new cv.Mat(), hist, [256], [0, 256]);
  const { maxLoc } = cv.minMaxLoc(hist);
  const peakBin = (hist.rows > 1) ? maxLoc.y : maxLoc.x;
  images.delete();
  hist.delete();
  return Math.max(0, Math.min(255, peakBin + offset));
}

/**
 * Fill a binary page mask using either a global threshold or a slowly varying adaptive threshold.
 *
 * Adaptive mode estimates the illumination field at low resolution, blurs it heavily, upscales it
 * back to full size, offsets it by the user threshold bias, then compares the full-resolution
 * grayscale page against that per-pixel threshold image.
 *
 * @param {cv.Mat} grayImg
 * @param {cv.Mat} dst
 * @param {string} [method="offset-peak"]
 * @param {number} [offset=-20]
 * @returns {number}
 */
function applyPaperThreshold(grayImg, dst, method = "offset-peak", offset = -20) {
  if (method !== "adaptive") {
    const threshVal = estimatePaperThreshold(grayImg, method, offset);
    cv.threshold(grayImg, dst, threshVal, 255, cv.THRESH_BINARY);
    return threshVal;
  }

  const reduced = new cv.Mat();
  const reducedBlurred = new cv.Mat();
  const thresholdField = new cv.Mat();
  const thresholdFieldShifted = new cv.Mat();
  const minSide = 24;
  const reducedWidth = Math.max(minSide, Math.round(grayImg.cols / 32));
  const reducedHeight = Math.max(minSide, Math.round(grayImg.rows / 32));
  const blurKernelWidth = Math.max(3, (Math.floor(reducedWidth / 6) * 2) + 1);
  const blurKernelHeight = Math.max(3, (Math.floor(reducedHeight / 6) * 2) + 1);

  try {
    cv.resize(grayImg, reduced, new cv.Size(reducedWidth, reducedHeight), 0, 0, cv.INTER_AREA);
    cv.GaussianBlur(
      reduced,
      reducedBlurred,
      new cv.Size(blurKernelWidth, blurKernelHeight),
      0,
      0,
      cv.BORDER_REPLICATE
    );
    cv.resize(reducedBlurred, thresholdField, new cv.Size(grayImg.cols, grayImg.rows), 0, 0, cv.INTER_LINEAR);
    thresholdField.convertTo(thresholdFieldShifted, thresholdField.type(), 1, offset);
    cv.compare(grayImg, thresholdFieldShifted, dst, cv.CMP_GT);
    return cv.mean(thresholdFieldShifted)[0];
  } finally {
    reduced.delete();
    reducedBlurred.delete();
    thresholdField.delete();
    thresholdFieldShifted.delete();
  }
}

/**
 * Find the largest quadrilateral contour in a binary paper mask.
 *
 * @param {cv.Mat} binaryMat
 * @param {number} totalArea
 * @returns {{points:{x:number,y:number}[], areaPx:number, quadAreaPx:number, areaPct:number}}
 */
function findLargestQuad(binaryMat, totalArea) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const approx = new cv.Mat();

  try {
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (contours.size() === 0) {
      throw new Error("No page contour found.");
    }

    let largest = contours.get(0);
    let maxArea = cv.contourArea(largest);
    for (let i = 1; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > maxArea) {
        maxArea = area;
        largest = contour;
      }
    }

    const peri = cv.arcLength(largest, true);
    cv.approxPolyDP(largest, approx, 0.02 * peri, true);
    if (approx.rows !== 4) {
      throw new Error(`Expected 4 page corners, got ${approx.rows}.`);
    }
    if (!cv.isContourConvex(approx)) {
      throw new Error("Expected a convex page quadrilateral.");
    }

    const points = [];
    for (let i = 0; i < 4; i++) {
      const pt = approx.intPtr(i, 0);
      points.push({ x: pt[0], y: pt[1] });
    }

    return {
      points,
      areaPx: maxArea,
      quadAreaPx: getPolygonArea(points),
      areaPct: maxArea / totalArea,
    };
  } finally {
    contours.delete();
    hierarchy.delete();
    approx.delete();
  }
}

/**
 * Estimate a higher-resolution page warp size from the raw quad area while never going below the low-res warp.
 *
 * @param {number} quadAreaPx
 * @param {number} aspect
 * @param {number} longEdgePx
 * @returns {cv.Size}
 */
function estimatePageWarpSizeFromAspect(aspect, longEdgePx) {
  const safeAspect = Math.max(0.25, Math.min(4.0, aspect || 1));
  const safeLongEdge = Math.max(1, Math.round(longEdgePx || PAGE_WARP_LOW_LONG_EDGE_PX));
  if (safeAspect >= 1) {
    return new cv.Size(safeLongEdge, Math.max(1, Math.round(safeLongEdge / safeAspect)));
  }
  return new cv.Size(Math.max(1, Math.round(safeLongEdge * safeAspect)), safeLongEdge);
}

/**
 * Estimate a higher-resolution page warp from the detected page area while keeping the long edge
 * in a source-dependent reasonable range.
 *
 * Paper dimensions are treated only as aspect-ratio hints. Actual extraction resolution now comes
 * from two things:
 * - the detected page-quad area in the source image
 * - a cap derived from the source-image diagonal
 *
 * @param {number} quadAreaPx
 * @param {number} aspect
 * @param {cv.Size} pageSizeLow
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @returns {cv.Size}
 */
function estimateHighResPageWarpSize(quadAreaPx, aspect, pageSizeLow, sourceWidth, sourceHeight) {
  const safeAspect = Math.max(0.25, Math.min(4.0, aspect || 1));
  let widthFromArea = Math.max(1, Math.round(Math.sqrt(Math.max(1, quadAreaPx) * safeAspect)));
  let heightFromArea = Math.max(1, Math.round(Math.sqrt(Math.max(1, quadAreaPx) / safeAspect)));
  const sourceDiagonal = Math.sqrt(
    Math.max(1, sourceWidth) * Math.max(1, sourceWidth) +
    Math.max(1, sourceHeight) * Math.max(1, sourceHeight)
  );
  const maxLongEdge = Math.max(
    PAGE_WARP_LOW_LONG_EDGE_PX,
    Math.floor(PAGE_WARP_HIGH_DIAGONAL_CAP_SCALE * sourceDiagonal)
  );
  const longEdge = Math.max(widthFromArea, heightFromArea);
  if (longEdge > maxLongEdge) {
    const scale = maxLongEdge / longEdge;
    widthFromArea = Math.max(1, Math.round(widthFromArea * scale));
    heightFromArea = Math.max(1, Math.round(heightFromArea * scale));
  }
  return new cv.Size(
    Math.max(pageSizeLow.width, widthFromArea),
    Math.max(pageSizeLow.height, heightFromArea)
  );
}

/**
 * Scale a dot rectangle from one page-warp size into another.
 *
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} dotRect
 * @param {cv.Size} fromSize
 * @param {cv.Size} toSize
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function scaleDotRect(dotRect, fromSize, toSize) {
  const sx = toSize.width / fromSize.width;
  const sy = toSize.height / fromSize.height;
  return {
    tl: { x: dotRect.tl.x * sx, y: dotRect.tl.y * sy },
    tr: { x: dotRect.tr.x * sx, y: dotRect.tr.y * sy },
    br: { x: dotRect.br.x * sx, y: dotRect.br.y * sy },
    bl: { x: dotRect.bl.x * sx, y: dotRect.bl.y * sy },
  };
}

/**
 * Compute polygon area with the shoelace formula.
 *
 * @param {{x:number, y:number}[]} points
 * @returns {number}
 */
function getPolygonArea(points) {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area2 += (p.x * q.y) - (q.x * p.y);
  }
  return Math.abs(area2) * 0.5;
}

/**
 * Warp the raw page quad into a fronto-parallel page image and retain both homography directions.
 *
 * @param {cv.Mat} visionSrc
 * @param {cv.Mat} styledSrc
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} ordered
 * @param {cv.Size} size
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, forwardTransform:number[], inverseTransform:number[]}}
 */
function perspectiveWarp(visionSrc, styledSrc, ordered, size) {
  const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered.tl.x, ordered.tl.y,
    ordered.tr.x, ordered.tr.y,
    ordered.br.x, ordered.br.y,
    ordered.bl.x, ordered.bl.y,
  ]);
  const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    size.width, 0,
    size.width, size.height,
    0, size.height,
  ]);
  const transform = cv.getPerspectiveTransform(srcCorners, dstCorners);
  const inverseTransform = cv.getPerspectiveTransform(dstCorners, srcCorners);
  const visionMat = new cv.Mat();
  const styledMat = new cv.Mat();
  cv.warpPerspective(visionSrc, visionMat, transform, size);
  cv.warpPerspective(styledSrc, styledMat, transform, size);
  const forwardArray = homographyMatToArray(transform);
  const inverseArray = homographyMatToArray(inverseTransform);
  srcCorners.delete();
  dstCorners.delete();
  transform.delete();
  inverseTransform.delete();
  return {
    visionMat,
    styledMat,
    forwardTransform: forwardArray,
    inverseTransform: inverseArray,
  };
}

/**
 * Convert a 3x3 OpenCV homography into a flat JavaScript array.
 *
 * @param {cv.Mat} mat
 * @returns {number[]}
 */
function homographyMatToArray(mat) {
  const values = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      values.push(mat.doubleAt(row, col));
    }
  }
  return values;
}

/**
 * Apply a homography to a single point.
 *
 * @param {{x:number, y:number}} point
 * @param {number[]} homography
 * @returns {{x:number, y:number}}
 */
function applyHomographyToPoint(point, homography) {
  const x = point.x;
  const y = point.y;
  const w = (homography[6] * x) + (homography[7] * y) + homography[8];
  const safeW = Math.abs(w) > 1e-9 ? w : 1e-9;
  return {
    x: ((homography[0] * x) + (homography[1] * y) + homography[2]) / safeW,
    y: ((homography[3] * x) + (homography[4] * y) + homography[5]) / safeW,
  };
}

/**
 * Map a full corner-dot rectangle through a homography.
 *
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} dotRect
 * @param {number[]} homography
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function mapQuadThroughHomography(quad, homography) {
  return {
    tl: applyHomographyToPoint(quad.tl, homography),
    tr: applyHomographyToPoint(quad.tr, homography),
    br: applyHomographyToPoint(quad.br, homography),
    bl: applyHomographyToPoint(quad.bl, homography),
  };
}

/**
 * Coarsely locate the frame-grid rectangle using only the cross lattice.
 *
 * @param {cv.Mat} pageMat
 * @param {number} cols
 * @param {number} rows
 * @param {{paperMarginPx?:number, boundarySensitivity?:number, boundaryPersistencePx?:number}} [options={}]
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function findFrameGridQuadFromCrosses(pageMat, cols, rows, options = {}) {
  const gray = toGrayNoBlur(pageMat);
  const src32 = new cv.Mat();
  const conv32 = new cv.Mat();
  const kernelMat = cv.matFromArray(25, 25, cv.CV_32F, crossKernel.flat());
  let roi = null;

  try {
    const insetPx = Math.max(0, Math.min(256, options.paperMarginPx ?? 80));
    const roiWidth = Math.max(1, gray.cols - insetPx * 2);
    const roiHeight = Math.max(1, gray.rows - insetPx * 2);
    // Ignore a tunable paper margin so page-edge clutter does not pollute the boundary sweeps.
    roi = gray.roi(new cv.Rect(insetPx, insetPx, roiWidth, roiHeight));
    roi.convertTo(src32, cv.CV_32F);
    // Keep the cross kernel unnormalized so true cross matches produce the strongest response.
    cv.filter2D(src32, conv32, cv.CV_32F, kernelMat, new cv.Point(-1, -1), 0, cv.BORDER_CONSTANT);

    // Sweep the 1D profiles across the convolution response to locate the first outer cross band on each side.
    const profiles = computeCrossActivityProfilesFromConvolution(conv32);
    const riseOptions = {
      insetPx: 0,
      sustainPx: options.boundaryPersistencePx ?? 7,
      thresholdValue: options.boundarySensitivity ?? 8,
    };
    const left = findFirstRiseFromEdge(profiles.colActivity, "left", riseOptions);
    const right = findFirstRiseFromEdge(profiles.colActivity, "right", riseOptions);
    const top = findFirstRiseFromEdge(profiles.rowActivity, "top", riseOptions);
    const bottom = findFirstRiseFromEdge(profiles.rowActivity, "bottom", riseOptions);

    // Keep the first threshold crossings as the coarse frame bounds; later ROI logic already
    // adds the extra breathing room needed for outer cross inspection.
    const coarseLeft = left;
    const coarseRight = right;
    const coarseTop = top;
    const coarseBottom = bottom;

    return {
      tl: { x: insetPx + coarseLeft, y: insetPx + coarseTop },
      tr: { x: insetPx + coarseRight, y: insetPx + coarseTop },
      br: { x: insetPx + coarseRight, y: insetPx + coarseBottom },
      bl: { x: insetPx + coarseLeft, y: insetPx + coarseBottom },
    };
  } finally {
    roi?.delete();
    gray.delete();
    src32.delete();
    conv32.delete();
    kernelMat.delete();
  }
}

/**
 * Build row/column activity profiles from the cross-kernel convolution response.
 *
 * The kernel is intentionally unnormalized, so clamp the response into 0..255
 * before averaging in order to keep extreme values from dominating the sweeps.
 *
 * @param {cv.Mat} conv32
 * @returns {{colActivity: Float64Array, rowActivity: Float64Array}}
 */
function computeCrossActivityProfilesFromConvolution(conv32) {
  const width = conv32.cols;
  const height = conv32.rows;
  const colActivity = new Float64Array(width);
  const rowActivity = new Float64Array(height);
  const data = conv32.data32F;

  // Collapse the 2D convolution image into one average-response profile per axis.
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const value = Math.max(0, Math.min(255, data[idx]));
      colActivity[x] += value;
      rowActivity[y] += value;
    }
  }

  // Convert sums into average grayscale response per column/row so thresholds are less image-size dependent.
  for (let x = 0; x < width; x++) {
    colActivity[x] /= Math.max(1, height);
  }
  for (let y = 0; y < height; y++) {
    rowActivity[y] /= Math.max(1, width);
  }

  return {
    colActivity,
    rowActivity,
  };
}

/**
 * Find the first sustained activation rise from one edge of a 1D profile.
 *
 * @param {ArrayLike<number>} profile
 * @param {"left"|"right"|"top"|"bottom"} edge
 * @param {{insetPx?:number, sustainPx?:number, thresholdValue?:number}} [options={}]
 * @returns {number}
 */
function findFirstRiseFromEdge(profile, edge, options = {}) {
  const n = profile.length;
  const insetPx = options.insetPx ?? 50;
  const sustainPx = options.sustainPx ?? Math.max(4, Math.round(n * 0.01));
  const threshold = Math.max(0, options.thresholdValue ?? 8);
  const forward = (edge === "left") || (edge === "top");
  const start = forward ? insetPx : (n - 1 - insetPx);
  const stop = forward ? (n - sustainPx) : (sustainPx - 1);
  const step = forward ? 1 : -1;

  // Accept the first run of consecutive samples that all exceed the chosen threshold.
  for (let i = start; forward ? (i <= stop) : (i >= stop); i += step) {
    let active = true;
    for (let k = 0; k < sustainPx; k++) {
      const j = i + k * step;
      if ((j < 0) || (j >= n) || (profile[j] < threshold)) {
        active = false;
        break;
      }
    }
    if (active) {
      return i;
    }
  }

  throw new Error("Could not locate frame grid from " + edge + " edge.");
}

/**
 * Estimate the rectified grid size from a generic quadrilateral.
 *
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} quad
 * @returns {cv.Size}
 */
function estimateRectifiedSizeFromQuad(quad) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Average opposite sides so minor residual skew or paper curl does not dominate the output size.
  return new cv.Size(
    Math.round((dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) * 0.5),
    Math.round((dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) * 0.5)
  );
}

/**
 * Compute how much padding to add so cross ROIs near the sheet edge remain centered.
 *
 * @param {number} rectifiedWidth
 * @param {number} rectifiedHeight
 * @param {number} cols
 * @param {number} rows
 * @param {number} crossRoiScale
 * @returns {number}
 */
function estimateDetectionPadding(rectifiedWidth, rectifiedHeight, cols, rows, crossRoiScale) {
  const cellW = rectifiedWidth / cols;
  const cellH = rectifiedHeight / rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.18 * crossRoiScale));
  return roiHalf + 4;
}

/**
 * Rectify an arbitrary axis-aligned frame-grid quadrilateral into working coordinates.
 *
 * @param {cv.Mat} pageVision
 * @param {cv.Mat} pageStyled
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} quad
 * @param {cv.Size} size
 * @param {number} [padding=0]
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, gridBounds:{left:number, top:number, width:number, height:number}}}
 */
function rectifyByQuad(pageVision, pageStyled, quad, size, padding = 0) {
  const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ]);
  const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    padding, padding,
    padding + size.width, padding,
    padding + size.width, padding + size.height,
    padding, padding + size.height,
  ]);
  const transform = cv.getPerspectiveTransform(srcCorners, dstCorners);
  const visionMat = new cv.Mat();
  const styledMat = new cv.Mat();
  const expandedSize = new cv.Size(size.width + padding * 2, size.height + padding * 2);
  // Replicated borders keep the outer ROI windows valid even when a cross lands on the rectified edge.
  cv.warpPerspective(pageVision, visionMat, transform, expandedSize, cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  cv.warpPerspective(pageStyled, styledMat, transform, expandedSize, cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  srcCorners.delete();
  dstCorners.delete();
  transform.delete();
  return {
    visionMat,
    styledMat,
    gridBounds: {
      left: padding,
      top: padding,
      width: size.width,
      height: size.height,
    },
  };
}

/**
 * Translate a UI interpolation mode string into an OpenCV interpolation flag.
 *
 * @param {string} mode
 * @returns {number}
 */
export function getCvInterpolationFlag(mode) {
  if (mode === "area" && typeof cv.INTER_AREA !== "undefined") return cv.INTER_AREA;
  if (mode === "cubic" && typeof cv.INTER_CUBIC !== "undefined") return cv.INTER_CUBIC;
  if (mode === "lanczos" && typeof cv.INTER_LANCZOS4 !== "undefined") return cv.INTER_LANCZOS4;
  if (mode === "nearest" && typeof cv.INTER_NEAREST !== "undefined") return cv.INTER_NEAREST;
  return cv.INTER_LINEAR;
}

/**
 * Extract all frames from the rectified sheet.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {object} extractionInfo
 * @param {{left:number,right:number,top:number,bottom:number}} crop
 * @param {number} interpolation
 * @param {number} requestId
 * @param {(requestId:number) => void} throwIfAborted
 * @returns {HTMLCanvasElement[]}
 */
function sliceRectifiedToCanvases(rectifiedMat, extractionInfo, crop, interpolation, requestId, throwIfAborted) {
  const frames = [];
  for (let row = 0; row < extractionInfo.rows; row++) {
    for (let col = 0; col < extractionInfo.cols; col++) {
      throwIfAborted(requestId);
      frames.push(extractSingleFrameToCanvas(rectifiedMat, extractionInfo, col, row, crop, interpolation));
    }
  }
  return frames;
}

/**
 * Extract one frame by warping its resolved quadrilateral into a rectangular output image.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {object} extractionInfo
 * @param {number} col
 * @param {number} row
 * @param {{left:number,right:number,top:number,bottom:number}} crop
 * @param {number} interpolation
 * @param {{x:number,y:number}} [sourceOffset={x:0,y:0}]
 * @returns {HTMLCanvasElement}
 */
export function extractSingleFrameToCanvas(rectifiedMat, extractionInfo, col, row, crop, interpolation, sourceOffset = { x: 0, y: 0 }) {
  const gridBounds = extractionInfo.gridBounds;
  const cellWidth = gridBounds.width / extractionInfo.cols;
  const cellHeight = gridBounds.height / extractionInfo.rows;
  const nominalWidth = Math.max(1, cellWidth - crop.left - crop.right);
  const nominalHeight = Math.max(1, cellHeight - crop.top - crop.bottom);
  const outW = Math.max(1, Math.round(nominalWidth));
  const outH = Math.max(1, Math.round(nominalHeight));
  const quad = resolveFrameQuad(extractionInfo, col, row);
  const u0 = crop.left / cellWidth;
  const u1 = 1 - (crop.right / cellWidth);
  const v0 = crop.top / cellHeight;
  const v1 = 1 - (crop.bottom / cellHeight);
  // Compute the cropped source quad by bilinearly interpolating inside the full frame quad.
  const srcTL = bilerpQuad(quad, u0, v0);
  const srcTR = bilerpQuad(quad, u1, v0);
  const srcBR = bilerpQuad(quad, u1, v1);
  const srcBL = bilerpQuad(quad, u0, v1);
  const offsetX = Number(sourceOffset?.x) || 0;
  const offsetY = Number(sourceOffset?.y) || 0;
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcTL.x + offsetX, srcTL.y + offsetY,
    srcTR.x + offsetX, srcTR.y + offsetY,
    srcBR.x + offsetX, srcBR.y + offsetY,
    srcBL.x + offsetX, srcBL.y + offsetY,
  ]);
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    Math.max(0, outW - 1), 0,
    Math.max(0, outW - 1), Math.max(0, outH - 1),
    0, Math.max(0, outH - 1),
  ]);
  const perspective = cv.getPerspectiveTransform(srcPts, dstPts);
  const patch = new cv.Mat();
  try {
    cv.warpPerspective(rectifiedMat, patch, perspective, new cv.Size(outW, outH), interpolation, cv.BORDER_REPLICATE, new cv.Scalar());
    return matToCanvas(patch);
  } finally {
    srcPts.delete();
    dstPts.delete();
    perspective.delete();
    patch.delete();
  }
}

/**
 * Convert an OpenCV mat into an HTML canvas.
 *
 * @param {cv.Mat} mat
 * @returns {HTMLCanvasElement}
 */
function matToCanvas(mat) {
  const canvas = document.createElement("canvas");
  const rgba = new cv.Mat();
  try {
    if (mat.type() === cv.CV_8UC4) {
      mat.copyTo(rgba);
    } else if (mat.type() === cv.CV_8UC3) {
      cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
    } else if (mat.type() === cv.CV_8UC1) {
      cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
    } else {
      throw new Error("Unsupported Mat type: " + mat.type());
    }
    canvas.width = rgba.cols;
    canvas.height = rgba.rows;
    const ctx = canvas.getContext("2d");
    const imageData = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    rgba.delete();
  }
}

/**
 * Order four points into top-left, top-right, bottom-right, bottom-left.
 *
 * @param {{x:number, y:number}[]} pts
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function orderCorners(pts) {
  const sum = (p) => p.x + p.y;
  const diff = (p) => p.y - p.x;
  const tl = pts.reduce((a, b) => (sum(a) < sum(b)) ? a : b);
  const br = pts.reduce((a, b) => (sum(a) > sum(b)) ? a : b);
  const tr = pts.reduce((a, b) => (diff(a) < diff(b)) ? a : b);
  const bl = pts.reduce((a, b) => (diff(a) > diff(b)) ? a : b);
  return { tl, tr, br, bl };
}

/**
 * Convert to grayscale and lightly blur to stabilize profile-based detection.
 *
 * @param {cv.Mat} inMat
 * @returns {cv.Mat}
 */
function toLightnessGray(inMat) {
  const grayMat = new cv.Mat();
  if (inMat.type() === cv.CV_8UC4) {
    cv.cvtColor(inMat, grayMat, cv.COLOR_RGBA2GRAY);
  } else if (inMat.type() === cv.CV_8UC3) {
    cv.cvtColor(inMat, grayMat, cv.COLOR_BGR2GRAY);
  } else {
    throw new Error("Expected a 3- or 4-channel Mat.");
  }
  const k = Math.max(3, (Math.min(grayMat.rows, grayMat.cols) / 400) | 1);
  cv.GaussianBlur(grayMat, grayMat, new cv.Size(k, k), 0, 0, cv.BORDER_REPLICATE);
  return grayMat;
}

/**
 * Convert to grayscale without any additional blur.
 *
 * @param {cv.Mat} inMat
 * @returns {cv.Mat}
 */
function toGrayNoBlur(inMat) {
  const grayMat = new cv.Mat();
  if (inMat.type() === cv.CV_8UC4) {
    cv.cvtColor(inMat, grayMat, cv.COLOR_RGBA2GRAY);
  } else if (inMat.type() === cv.CV_8UC3) {
    cv.cvtColor(inMat, grayMat, cv.COLOR_BGR2GRAY);
  } else {
    throw new Error("Expected a 3- or 4-channel Mat.");
  }
  return grayMat;
}

/**
 * Sum a grayscale image along columns.
 *
 * @param {cv.Mat} grayImg
 * @returns {Float64Array}
 */
function columnSums(grayImg) {
  const col = new cv.Mat();
  cv.reduce(grayImg, col, 0, cv.REDUCE_SUM, cv.CV_64F);
  const data = new Float64Array(col.data64F);
  col.delete();
  return data;
}

/**
 * Sum a grayscale image along rows.
 *
 * @param {cv.Mat} grayImg
 * @returns {Float64Array}
 */
function rowSums(grayImg) {
  const row = new cv.Mat();
  cv.reduce(grayImg, row, 1, cv.REDUCE_SUM, cv.CV_64F);
  const data = new Float64Array(row.data64F);
  row.delete();
  return data;
}

/**
 * Refine a corner-circle center by thresholding a local ROI and centroiding the largest dark blob.
 *
 * @param {cv.Mat} grayMat
 * @param {number} cx
 * @param {number} cy
 * @param {number} w
 * @param {number} h
 * @param {number} [dscale=2.0]
 * @returns {{x:number, y:number}}
 */
function refineDotCentroid(grayMat, cx, cy, w, h, dscale = 2.0) {
  const rw = Math.round(Math.max(8, w) * dscale);
  const rh = Math.round(Math.max(8, h) * dscale);
  const x0 = Math.max(0, Math.round(cx - rw / 2));
  const y0 = Math.max(0, Math.round(cy - rh / 2));
  const x1 = Math.min(grayMat.cols, x0 + rw);
  const y1 = Math.min(grayMat.rows, y0 + rh);
  const roi = grayMat.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
  const mask = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.threshold(roi, mask, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (contours.size() === 0) throw new Error("No dot found in ROI.");

    let best = contours.get(0);
    let bestArea = cv.contourArea(best);
    for (let i = 1; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > bestArea) {
        best = contour;
        bestArea = area;
      }
    }

    const moments = cv.moments(best);
    return {
      x: x0 + (moments.m10 / moments.m00),
      y: y0 + (moments.m01 / moments.m00),
    };
  } finally {
    roi.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Smooth a 1D signal with a centered moving average.
 *
 * @param {ArrayLike<number>} arr
 * @param {number} [win=5]
 * @returns {Float64Array}
 */
function smooth1D(arr, win = 5) {
  win = Math.max(1, win | 0);
  if ((win % 2) === 0) win += 1;
  const out = new Float64Array(arr.length);
  const half = (win - 1) >> 1;
  for (let i = 0; i < arr.length; i++) {
    let acc = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(arr.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      acc += arr[j];
      count++;
    }
    out[i] = acc / count;
  }
  return out;
}

/**
 * Estimate a bright-edge baseline from a short band near one edge of a 1D profile.
 *
 * @param {ArrayLike<number>} profile
 * @param {string} [edge="left"]
 * @param {number} [inset=6]
 * @param {number} [bandFrac=0.08]
 * @returns {number}
 */
function edgeBaseline(profile, edge = "left", inset = 6, bandFrac = 0.08) {
  const n = profile.length;
  const band = Math.max(inset + 4, Math.min(n, Math.round(n * bandFrac)));
  const values = [];
  if ((edge === "left") || (edge === "top")) {
    for (let i = inset; i < band; i++) values.push(profile[i]);
  } else {
    for (let i = n - band; i < n - inset; i++) values.push(profile[i]);
  }
  values.sort((a, b) => a - b);
  return values[Math.max(0, Math.min(values.length - 1, Math.round(0.95 * (values.length - 1))))];
}

/**
 * Scan inward from one edge, looking for the first dark dip followed by a sustained blank gutter.
 *
 * @param {ArrayLike<number>} profile
 * @param {"left"|"right"|"top"|"bottom"} edge
 * @param {{insetPx?:number, depthFrac?:number, gutterLenFrac?:number, gutterTolFrac?:number, smoothWin?:number}} [options={}]
 * @returns {{center:number, width:number, left:number, right:number, baseline:number, minVal:number}}
 */
function findFirstDipFromEdge(profile, edge, options = {}) {
  const n = profile.length;
  const insetPx = options.insetPx ?? 8;
  const depthFrac = options.depthFrac ?? 0.04;
  const gutterLenFrac = options.gutterLenFrac ?? 0.01;
  const gutterTolFrac = options.gutterTolFrac ?? 0.01;

  const smooth = smooth1D(profile, options.smoothWin ?? 1);
  const baseline = edgeBaseline(smooth, edge, insetPx, 0.08);
  const dipThresh = baseline * (1 - Math.max(0.01, depthFrac));
  const gutterLen = Math.max(3, Math.round(n * gutterLenFrac));
  const gutterThresh = baseline * (1 - Math.max(0, gutterTolFrac));
  const forward = (edge === "left") || (edge === "top");
  const start = forward ? insetPx : (n - 1 - insetPx);
  const step = forward ? 1 : -1;
  const stop = forward ? (n - gutterLen - 1) : gutterLen;

  let stateName = "SEEK_DROP";
  let left = -1;
  let right = -1;
  let minVal = Infinity;

  // State machine: seek dip -> traverse dip -> verify the blank gutter after it.
  for (let i = start; forward ? (i < stop) : (i > stop); i += step) {
    const value = smooth[i];
    if (stateName === "SEEK_DROP") {
      if (value <= dipThresh) {
        stateName = "IN_DIP";
        left = i;
        minVal = value;
      }
    } else if (stateName === "IN_DIP") {
      if (value < minVal) minVal = value;
      const leaveThresh = (dipThresh + baseline) * 0.5;
      if (value >= leaveThresh) {
        right = i;
        stateName = "SEEK_GUTTER";
      }
    } else {
      let ok = true;
      for (let k = 0; k < gutterLen; k++) {
        const j = i + k * step;
        if ((j < 0) || (j >= n) || (smooth[j] < gutterThresh)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const a = Math.min(left, right);
        const b = Math.max(left, right);
        return { center: Math.round((a + b) / 2), width: b - a + 1, left: a, right: b, baseline, minVal };
      }
      if (value <= dipThresh) {
        right = i;
        stateName = "IN_DIP";
        if (value < minVal) minVal = value;
      }
    }
  }

  throw new Error("Could not locate corner dots from " + edge + " edge.");
}

/**
 * Build nominal frame geometry when cross alignment is unavailable.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {number} cols
 * @param {number} rows
 * @param {string} [reason="fallback"]
 * @param {{left:number, top:number, width:number, height:number} | null} [gridBounds=null]
 * @param {object | null} [detectedInfo=null]
 * @returns {object}
 */
function buildFallbackFrameExtractionData(rectifiedMat, cols, rows, reason = "fallback", gridBounds = null, detectedInfo = null, options = {}) {
  const markerType = options.markerType || "crosses";
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const includeCornerMarkers = includeCornerCrosses || (markerType === "circles");
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerMarkers);
  const anchorDots = includeCornerMarkers ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
  const markerLookup = buildMarkerLookup(expectedCrosses, [], anchorDots, cols, rows);
  return {
    ok: false,
    reason,
    includeCornerCrosses,
    rectifiedWidth: rectifiedMat.cols,
    rectifiedHeight: rectifiedMat.rows,
    gridBounds: bounds,
    cols,
    rows,
    expectedCount: expectedCrosses.length,
    detectedCount: detectedInfo?.detectedCount ?? 0,
    expectedCrosses,
    anchorDots,
    detectedCrosses: detectedInfo?.detectedCrosses ?? [],
    rejectedCrosses: detectedInfo?.rejectedCrosses ?? [],
    markerLookup,
    frameDebugQuads: buildFrameDebugQuads(markerLookup, cols, rows, bounds),
    crossRoiTiles: detectedInfo?.crossRoiTiles ?? [],
    crossRoiTileMap: detectedInfo?.crossRoiTileMap ?? new Map(),
  };
}

/**
 * Build cross-region tiles centered on the nominal lattice without refining marker positions.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {number} cols
 * @param {number} rows
 * @param {string} [reason="disabled"]
 * @param {{left:number, top:number, width:number, height:number} | null} [gridBounds=null]
 * @param {number} [crossRoiScale=0.75]
 * @returns {object}
 */
function buildUnrefinedCrossRegionInfo(rectifiedMat, cols, rows, reason = "disabled", gridBounds = null, crossRoiScale = 0.75, options = {}) {
  const requestedMarkerType = options.markerType || "crosses";
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const markerTypeAnalysis = (requestedMarkerType === "auto")
    ? classifyAlignmentMarkerType(rectifiedMat, cols, rows, crossRoiScale, bounds, includeCornerCrosses)
    : null;
  const markerType = markerTypeAnalysis?.resolvedMarkerType || requestedMarkerType;
  const includeCornerMarkers = includeCornerCrosses || (markerType === "circles");
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerMarkers);
  const anchorDots = includeCornerMarkers ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
  const markerLookup = buildMarkerLookup(expectedCrosses, [], anchorDots, cols, rows);
  const crossRoiTiles = expectedCrosses.map((expected) =>
    buildUnrefinedCrossRegionTile(rectifiedMat, expected, rectifiedMat.cols, rectifiedMat.rows, cols, rows, crossRoiScale, markerType)
  );
  return {
    ok: false,
    reason,
    includeCornerCrosses,
    requestedMarkerType,
    resolvedMarkerType: markerType,
    markerTypeMedianCircularity: markerTypeAnalysis?.medianCircularity ?? null,
    rectifiedWidth: rectifiedMat.cols,
    rectifiedHeight: rectifiedMat.rows,
    gridBounds: bounds,
    cols,
    rows,
    expectedCount: expectedCrosses.length,
    detectedCount: 0,
    expectedCrosses,
    anchorDots,
    detectedCrosses: [],
    rejectedCrosses: [],
    markerLookup,
    frameDebugQuads: buildFrameDebugQuads(markerLookup, cols, rows, bounds),
    crossRoiTiles,
    crossRoiTileMap: new Map(crossRoiTiles.map((tile) => [getMarkerKey(tile.col, tile.row), tile])),
  };
}

/**
 * Detect the interior cross lattice and build the marker set used for frame extraction.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @param {{left:number, top:number, width:number, height:number} | null} [gridBounds=null]
 * @returns {object}
 */
function buildCrossAlignmentData(rectifiedMat, cols, rows, crossRoiScale = 0.75, gridBounds = null, options = {}) {
  const requestedMarkerType = options.markerType || "crosses";
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const detectWithConvolution = !!options.detectCrossesWithConvolution;
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const markerTypeAnalysis = (requestedMarkerType === "auto")
    ? classifyAlignmentMarkerType(rectifiedMat, cols, rows, crossRoiScale, bounds, includeCornerCrosses)
    : null;
  const markerType = markerTypeAnalysis?.resolvedMarkerType || requestedMarkerType;
  const includeCornerMarkers = includeCornerCrosses || (markerType === "circles");
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerMarkers);
  if (expectedCrosses.length === 0) {
    return buildFallbackFrameExtractionData(rectifiedMat, cols, rows, "no markers expected", bounds, null, { markerType, includeCornerCrosses });
  }
  const anchorDots = includeCornerMarkers ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
  const grayMat = toLightnessGray(rectifiedMat);
  const detectedCrosses = [];
  const rejectedCrosses = [];
  const crossRoiTiles = [];

  try {
    // Inspect each expected interior lattice point independently so weak detections can be rejected one by one.
    for (const expected of expectedCrosses) {
      const detection = (markerType === "circles")
        ? detectDotAtExpectedPosition(
            grayMat,
            expected,
            rectifiedMat.cols,
            rectifiedMat.rows,
            cols,
            rows,
            crossRoiScale
          )
        : detectCrossAtExpectedPosition(
            grayMat,
            expected,
            rectifiedMat.cols,
            rectifiedMat.rows,
            cols,
            rows,
            crossRoiScale,
            { detectWithConvolution }
          );
      crossRoiTiles.push(detection);
      if (detection.accepted) detectedCrosses.push(detection);
      else rejectedCrosses.push(detection);
    }
  } finally {
    grayMat.delete();
  }

  const minRequired = Math.max(
    Math.min(expectedCrosses.length, MIN_CROSS_DETECTIONS_ABS),
    Math.ceil(expectedCrosses.length * MIN_CROSS_DETECTION_RATIO)
  );
  const ok = detectedCrosses.length >= minRequired;
  const markerLookupDetections = (markerType === "circles")
    ? crossRoiTiles.filter((tile) => tile.hasCentroid)
    : detectedCrosses;
  const markerLookup = buildMarkerLookup(expectedCrosses, markerLookupDetections, anchorDots, cols, rows);
  return {
    ok,
    reason: ok ? "ok" : t("status.markerFallbackTooFewConfidentDetections", {
      count: detectedCrosses.length,
      expected: expectedCrosses.length,
    }),
    includeCornerCrosses,
    requestedMarkerType,
    resolvedMarkerType: markerType,
    markerTypeMedianCircularity: markerTypeAnalysis?.medianCircularity ?? null,
    rectifiedWidth: rectifiedMat.cols,
    rectifiedHeight: rectifiedMat.rows,
    gridBounds: bounds,
    cols,
    rows,
    expectedCount: expectedCrosses.length,
    detectedCount: detectedCrosses.length,
    expectedCrosses,
    anchorDots,
    detectedCrosses,
    rejectedCrosses,
    markerLookup,
    frameDebugQuads: buildFrameDebugQuads(markerLookup, cols, rows, bounds),
    crossRoiTiles,
    crossRoiTileMap: new Map(crossRoiTiles.map((tile) => [getMarkerKey(tile.col, tile.row), tile])),
  };
}

/**
 * Estimate a straight frame grid without registration marks.
 *
 * The grid pitch is inferred from seeded horizontal/vertical autocorrelation on a reduced blurred
 * sheet image. Grid phase is then chosen from low-energy gutter profiles so the inferred
 * intersections can be displayed and edited through the same marker UI used by marked sheets.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @param {{left:number, top:number, width:number, height:number} | null} [gridBounds=null]
 * @returns {object}
 */
function buildMarkerlessAlignmentData(
  rectifiedMat,
  cols,
  rows,
  crossRoiScale = 0.75,
  gridBounds = null,
  paperMarginPx = 0,
  gutterMetricFlags = {},
) {
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const grayMat = toLightnessGray(rectifiedMat);
  const boundedGray = extractBoundsRoi(grayMat, bounds);

  try {
    const estimate = estimateMarkerlessGrid(boundedGray, cols, rows, paperMarginPx, gutterMetricFlags);
    if (!estimate) {
      return buildUnrefinedCrossRegionInfo(
        rectifiedMat,
        cols,
        rows,
        t("status.markerlessEstimationFailed"),
        bounds,
        crossRoiScale,
        { markerType: "crosses", includeCornerCrosses: true }
      );
    }

    // Convert the local grid estimate back into full rectified-sheet coordinates so downstream
    // extraction, overlays, and manual overrides stay in one shared coordinate system.
    const xPositions = estimate.xPositions.map((x) => bounds.left + x);
    const yPositions = estimate.yPositions.map((y) => bounds.top + y);
    const markerLookup = new Map();
    const crossRoiTiles = [];
    const expectedCrosses = [];

    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const x = xPositions[col];
        const y = yPositions[row];
        expectedCrosses.push({ col, row, x, y });
        const marker = {
          kind: "markerless",
          col,
          row,
          x,
          y,
          roiCenterX: x,
          roiCenterY: y,
          detectedX: x,
          detectedY: y,
          dx: 0,
          dy: 0,
          confidence: 1,
          accepted: true,
        };
        markerLookup.set(getMarkerKey(col, row), marker);
        const tile = buildUnrefinedCrossRegionTile(
          rectifiedMat,
          { col, row, x, y },
          rectifiedMat.cols,
          rectifiedMat.rows,
          cols,
          rows,
          crossRoiScale,
          "crosses"
        );
        tile.kind = "markerless";
        tile.accepted = true;
        tile.confidence = 1;
        tile.detectedX = x;
        tile.detectedY = y;
        tile.roiCenterX = x;
        tile.roiCenterY = y;
        crossRoiTiles.push(tile);
      }
    }

    const inferredBounds = {
      left: xPositions[0],
      top: yPositions[0],
      width: xPositions[xPositions.length - 1] - xPositions[0],
      height: yPositions[yPositions.length - 1] - yPositions[0],
    };

    return {
      ok: true,
      reason: "ok",
      includeCornerCrosses: true,
      requestedMarkerType: "markerless",
      resolvedMarkerType: "markerless",
      markerTypeMedianCircularity: null,
      rectifiedWidth: rectifiedMat.cols,
      rectifiedHeight: rectifiedMat.rows,
      gridBounds: inferredBounds,
      cols,
      rows,
      expectedCount: expectedCrosses.length,
      detectedCount: expectedCrosses.length,
      expectedCrosses,
      anchorDots: [],
      detectedCrosses: [...markerLookup.values()],
      rejectedCrosses: [],
      markerLookup,
      frameDebugQuads: buildFrameDebugQuads(markerLookup, cols, rows, inferredBounds),
      crossRoiTiles,
      crossRoiTileMap: new Map(crossRoiTiles.map((tile) => [getMarkerKey(tile.col, tile.row), tile])),
      markerlessEstimate: {
        pitchX: estimate.pitchX,
        pitchY: estimate.pitchY,
        startX: estimate.startX,
        startY: estimate.startY,
        phaseDebugX: estimate.phaseDebugX,
      },
    };
  } finally {
    boundedGray.delete();
    grayMat.delete();
  }
}

/**
 * Estimate a straight grid from seeded autocorrelation and multi-signal gutter scoring.
 *
 * The markerless estimator intentionally splits the problem into pitch and phase:
 * - pitch comes from seeded autocorrelation on a reduced blurred image
 * - phase comes from 1D gutter profiles built from darkness / edge-energy / variance cues
 *
 * Search Inset Margin only changes the pitch seed region. That lets the user ignore large blank
 * page margins without changing the final phase search model.
 *
 * @param {cv.Mat} grayMat
 * @param {number} cols
 * @param {number} rows
 * @param {{useDarkness?:boolean, useTexture?:boolean, useVariance?:boolean, lightOnDark?:boolean}} [gutterMetricFlags={}]
 * @returns {{pitchX:number, pitchY:number, startX:number, startY:number, xPositions:number[], yPositions:number[]} | null}
 */
function estimateMarkerlessGrid(grayMat, cols, rows, paperMarginPx = 0, gutterMetricFlags = {}) {
  const working = new cv.Mat();
  const blurred = new cv.Mat();
  const insetRoi = new cv.Mat();
  const padded = new cv.Mat();
  const longEdge = Math.max(grayMat.cols, grayMat.rows);
  const scale = longEdge > MARKERLESS_WORKING_LONG_EDGE_PX ? (MARKERLESS_WORKING_LONG_EDGE_PX / longEdge) : 1;
  const workingWidth = Math.max(32, Math.round(grayMat.cols * scale));
  const workingHeight = Math.max(32, Math.round(grayMat.rows * scale));

  try {
    cv.resize(grayMat, working, new cv.Size(workingWidth, workingHeight), 0, 0, cv.INTER_AREA);
    const blurKernel = Math.max(3, ((Math.floor(Math.max(working.cols, working.rows) / 90) * 2) + 1));
    cv.GaussianBlur(working, blurred, new cv.Size(blurKernel, blurKernel), 0, 0, cv.BORDER_REPLICATE);

    // Apply Search Inset Margin in the reduced-resolution domain used for seeded autocorrelation.
    // This keeps large outer page margins from dominating the nominal period estimate.
    const insetSmall = Math.max(0, Math.round(Math.max(0, paperMarginPx) * scale));
    const insetWidth = Math.max(1, blurred.cols - (insetSmall * 2));
    const insetHeight = Math.max(1, blurred.rows - (insetSmall * 2));
    const useInsetForPitch =
      insetWidth >= MARKERLESS_MIN_PITCH_PX * Math.max(1, cols) &&
      insetHeight >= MARKERLESS_MIN_PITCH_PX * Math.max(1, rows);
    const pitchSource = useInsetForPitch
      ? blurred.roi(new cv.Rect(insetSmall, insetSmall, insetWidth, insetHeight)).clone()
      : blurred.clone();
    insetRoi.create(pitchSource.rows, pitchSource.cols, pitchSource.type());
    pitchSource.copyTo(insetRoi);
    pitchSource.delete();

    const nominalPitchX = Math.max(MARKERLESS_MIN_PITCH_PX, insetRoi.cols / Math.max(1, cols));
    const nominalPitchY = Math.max(MARKERLESS_MIN_PITCH_PX, insetRoi.rows / Math.max(1, rows));
    // A small replicate padding lets the inferred periodic lattice extend slightly beyond the
    // observed sheet, which matters for tightly trimmed frame sheets whose true outer boundaries
    // would otherwise fall outside the page image.
    const padXSmall = Math.max(1, Math.round(nominalPitchX * MARKERLESS_PADDING_FRAC));
    const padYSmall = Math.max(1, Math.round(nominalPitchY * MARKERLESS_PADDING_FRAC));
    cv.copyMakeBorder(
      insetRoi,
      padded,
      padYSmall,
      padYSmall,
      padXSmall,
      padXSmall,
      cv.BORDER_REPLICATE
    );

    const pitchXSmall = estimateAutocorrelationPitch(padded, "x", nominalPitchX);
    const pitchYSmall = estimateAutocorrelationPitch(padded, "y", nominalPitchY);
    const xProfiles = computeMarkerlessGutterProfile(padded, "x", MARKERLESS_PHASE_BAND_WIDTH, gutterMetricFlags);
    const yProfiles = computeMarkerlessGutterProfile(padded, "y", MARKERLESS_PHASE_BAND_WIDTH, gutterMetricFlags);
    const startXSmall = estimateGridPhase(xProfiles.gutter, pitchXSmall, cols);
    const startYSmall = estimateGridPhase(yProfiles.gutter, pitchYSmall, rows);

    const scaleX = grayMat.cols / blurred.cols;
    const scaleY = grayMat.rows / blurred.rows;
    const pitchX = pitchXSmall * scaleX;
    const pitchY = pitchYSmall * scaleY;
    const insetOffsetX = useInsetForPitch ? (insetSmall * scaleX) : 0;
    const insetOffsetY = useInsetForPitch ? (insetSmall * scaleY) : 0;
    // Phase is solved in padded/inset working coordinates, then translated back into the original
    // bounded rectified-sheet coordinates used by the rest of the pipeline.
    const startX = ((startXSmall - padXSmall) * scaleX) + insetOffsetX;
    const startY = ((startYSmall - padYSmall) * scaleY) + insetOffsetY;
    const xPositions = buildGridPositions(startX, pitchX, cols);
    const yPositions = buildGridPositions(startY, pitchY, rows);
    if (!xPositions || !yPositions) return null;
    return {
      pitchX,
      pitchY,
      startX,
      startY,
      xPositions,
      yPositions,
      phaseDebugX: {
        positions: Array.from({ length: xProfiles.gutter.length }, (_, i) => ((i - padXSmall) * scaleX) + insetOffsetX),
        darkness: Array.from(xProfiles.darkness),
        variance: Array.from(xProfiles.variance),
        texture: Array.from(xProfiles.texture),
        gutter: Array.from(xProfiles.gutter),
      },
    };
  } finally {
    working.delete();
    blurred.delete();
    insetRoi.delete();
    padded.delete();
  }
}

/**
 * Extract a clipped grayscale ROI from floating-point bounds.
 *
 * @param {cv.Mat} grayMat
 * @param {{left:number, top:number, width:number, height:number}} bounds
 * @returns {cv.Mat}
 */
function extractBoundsRoi(grayMat, bounds) {
  const left = Math.max(0, Math.min(grayMat.cols - 1, Math.round(bounds.left)));
  const top = Math.max(0, Math.min(grayMat.rows - 1, Math.round(bounds.top)));
  const width = Math.max(1, Math.min(grayMat.cols - left, Math.round(bounds.width)));
  const height = Math.max(1, Math.min(grayMat.rows - top, Math.round(bounds.height)));
  return grayMat.roi(new cv.Rect(left, top, width, height)).clone();
}

/**
 * Estimate the cell pitch along one axis by maximizing seeded autocorrelation.
 *
 * @param {cv.Mat} grayMat
 * @param {"x"|"y"} axis
 * @param {number} nominalPitch
 * @returns {number}
 */
function estimateAutocorrelationPitch(grayMat, axis, nominalPitch) {
  const data = grayMat.data;
  const width = grayMat.cols;
  const height = grayMat.rows;
  const maxLagAllowed = Math.max(1, (axis === "x" ? width : height) - 1);
  const pitchMin = Math.min(
    maxLagAllowed,
    Math.max(MARKERLESS_MIN_PITCH_PX, Math.round(nominalPitch * (1 - MARKERLESS_AUTOCORR_SEARCH_FRAC)))
  );
  const pitchMax = Math.min(
    maxLagAllowed,
    Math.max(pitchMin + 1, Math.round(nominalPitch * (1 + MARKERLESS_AUTOCORR_SEARCH_FRAC)))
  );
  const sampleStrideX = Math.max(1, Math.floor(width / 180));
  const sampleStrideY = Math.max(1, Math.floor(height / 180));
  let meanDarkness = 0;
  let meanCount = 0;

  for (let y = 0; y < height; y += sampleStrideY) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += sampleStrideX) {
      meanDarkness += 255 - data[rowOffset + x];
      meanCount++;
    }
  }
  meanDarkness /= Math.max(1, meanCount);

  let bestPitch = Math.round(nominalPitch);
  let bestScore = -Infinity;
  for (let lag = pitchMin; lag <= pitchMax; lag++) {
    let acc = 0;
    let count = 0;
    if (axis === "x") {
      for (let y = 0; y < height; y += sampleStrideY) {
        const rowOffset = y * width;
        for (let x = 0; x < width - lag; x += sampleStrideX) {
          const a = (255 - data[rowOffset + x]) - meanDarkness;
          const b = (255 - data[rowOffset + x + lag]) - meanDarkness;
          acc += a * b;
          count++;
        }
      }
    } else {
      for (let y = 0; y < height - lag; y += sampleStrideY) {
        const rowOffsetA = y * width;
        const rowOffsetB = (y + lag) * width;
        for (let x = 0; x < width; x += sampleStrideX) {
          const a = (255 - data[rowOffsetA + x]) - meanDarkness;
          const b = (255 - data[rowOffsetB + x]) - meanDarkness;
          acc += a * b;
          count++;
        }
      }
    }
    const score = acc / Math.max(1, count);
    if (score > bestScore) {
      bestScore = score;
      bestPitch = lag;
    }
  }
  return bestPitch;
}

/**
 * Build a 1D gutter-likelihood profile by combining darkness, edge energy, and variance over a
 * centered stripe rather than a single pixel row or column.
 *
 * Each enabled cue contributes multiplicatively to the final gutter support. That makes the
 * combined profile act like a soft logical AND: candidate gutters are strongest where all enabled
 * metrics agree that the stripe looks empty and uniform.
 *
 * @param {cv.Mat} grayMat
 * @param {"x"|"y"} axis
 * @param {number} [bandWidth=1]
 * @param {{useDarkness?:boolean, useTexture?:boolean, useVariance?:boolean, lightOnDark?:boolean}} [flags={}]
 * @returns {Float64Array}
 */
function computeMarkerlessGutterProfile(grayMat, axis, bandWidth = 1, flags = {}) {
  const data = grayMat.data;
  const width = grayMat.cols;
  const height = grayMat.rows;
  const length = axis === "x" ? width : height;
  const normalizedBandWidth = Math.max(1, Math.min(11, Math.round(bandWidth) | 1));
  const radius = Math.floor(normalizedBandWidth / 2);
  const darkness = new Float64Array(length);
  const variance = new Float64Array(length);
  const edge = new Float64Array(length);

  if (axis === "x") {
    for (let x = 0; x < width; x++) {
      const bandStart = Math.max(0, x - radius);
      const bandEnd = Math.min(width - 1, x + radius);
      let sum = 0;
      let sumSq = 0;
      let edgeSum = 0;
      let sampleCount = 0;
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let bx = bandStart; bx <= bandEnd; bx++) {
          const value = 255 - data[rowOffset + bx];
          sum += value;
          sumSq += value * value;
          const leftValue = data[rowOffset + Math.max(0, bx - 1)];
          const rightValue = data[rowOffset + Math.min(width - 1, bx + 1)];
          edgeSum += Math.abs(rightValue - leftValue);
          sampleCount++;
        }
      }
      darkness[x] = sum / Math.max(1, sampleCount);
      variance[x] = Math.max(0, (sumSq / Math.max(1, sampleCount)) - darkness[x] * darkness[x]);
      edge[x] = edgeSum / Math.max(1, sampleCount);
    }
  } else {
    for (let y = 0; y < height; y++) {
      const bandStart = Math.max(0, y - radius);
      const bandEnd = Math.min(height - 1, y + radius);
      let sum = 0;
      let sumSq = 0;
      let edgeSum = 0;
      let sampleCount = 0;
      for (let by = bandStart; by <= bandEnd; by++) {
        const rowOffset = by * width;
        const rowOffsetUp = Math.max(0, by - 1) * width;
        const rowOffsetDown = Math.min(height - 1, by + 1) * width;
        for (let x = 0; x < width; x++) {
          const value = 255 - data[rowOffset + x];
          sum += value;
          sumSq += value * value;
          edgeSum += Math.abs(data[rowOffsetDown + x] - data[rowOffsetUp + x]);
          sampleCount++;
        }
      }
      darkness[y] = sum / Math.max(1, sampleCount);
      variance[y] = Math.max(0, (sumSq / Math.max(1, sampleCount)) - darkness[y] * darkness[y]);
      edge[y] = edgeSum / Math.max(1, sampleCount);
    }
  }

  const darknessNorm = normalizeProfile(darkness);
  const varianceNorm = normalizeProfile(variance);
  const edgeNorm = normalizeProfile(edge);
  const useDarkness = flags.useDarkness !== false;
  const useVariance = flags.useVariance !== false;
  const useTexture = flags.useTexture !== false;
  const lightOnDark = flags.lightOnDark === true;
  const darknessSupport = new Float64Array(length);
  const varianceSupport = new Float64Array(length);
  const textureSupport = new Float64Array(length);
  const gutter = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    // In normal mode gutters should be lighter than the artwork. For light ink on dark paper the
    // interpretation flips, so darker stripes become stronger gutter candidates instead.
    darknessSupport[i] = lightOnDark ? darknessNorm[i] : (1 - darknessNorm[i]);
    varianceSupport[i] = 1 - varianceNorm[i];
    textureSupport[i] = 1 - edgeNorm[i];
    let combined = null;
    if (useDarkness) combined = darknessSupport[i];
    if (useVariance) combined = combined === null ? varianceSupport[i] : (combined * varianceSupport[i]);
    if (useTexture) combined = combined === null ? textureSupport[i] : (combined * textureSupport[i]);
    gutter[i] = combined === null ? 0 : combined;
  }
  return {
    darkness: smooth1D(darknessSupport, 7),
    variance: smooth1D(varianceSupport, 7),
    texture: smooth1D(textureSupport, 7),
    gutter: smooth1D(gutter, 7),
  };
}

/**
 * Normalize a 1D numeric profile into the 0..1 range.
 *
 * @param {ArrayLike<number>} profile
 * @returns {Float64Array}
 */
function normalizeProfile(profile) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < profile.length; i++) {
    min = Math.min(min, profile[i]);
    max = Math.max(max, profile[i]);
  }
  const range = Math.max(1e-6, max - min);
  const out = new Float64Array(profile.length);
  for (let i = 0; i < profile.length; i++) {
    out[i] = (profile[i] - min) / range;
  }
  return out;
}

/**
 * Estimate the starting boundary position for a periodic grid by sampling the gutter profile at
 * each candidate series of boundary locations near the nominal centered layout.
 *
 * This is intentionally not a local-peak detector. The solver scores whole boundary lattices, so
 * a start position only wins if the expected series of gutters aligns well across the full sheet.
 *
 * @param {Float64Array} profile
 * @param {number} pitch
 * @param {number} cellCount
 * @returns {number}
 */
function estimateGridPhase(profile, pitch, cellCount) {
  const maxIndex = profile.length - 1;
  const fitPitch = Math.min(pitch, maxIndex / Math.max(1, cellCount));
  const nominalStart = Math.max(0, (maxIndex - fitPitch * cellCount) * 0.5);
  const radius = Math.max(2, Math.round(fitPitch * 0.5));
  const minStart = Math.max(0, Math.floor(nominalStart - radius));
  const maxStart = Math.min(maxIndex, Math.ceil(nominalStart + radius));
  let bestStart = nominalStart;
  let bestScore = -Infinity;

  for (let start = minStart; start <= maxStart; start++) {
    const end = start + fitPitch * cellCount;
    if (end > maxIndex) continue;
    let score = 0;
    for (let i = 0; i <= cellCount; i++) {
      score += sampleProfile(profile, start + fitPitch * i);
    }
    score /= Math.max(1, cellCount + 1);
    score -= Math.abs(start - nominalStart) / Math.max(1, fitPitch * 4);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return bestStart;
}

/**
 * Sample a 1D profile at a floating-point index with linear interpolation.
 *
 * @param {ArrayLike<number>} profile
 * @param {number} position
 * @returns {number}
 */
function sampleProfile(profile, position) {
  const clamped = Math.max(0, Math.min(profile.length - 1, position));
  const left = Math.floor(clamped);
  const right = Math.min(profile.length - 1, left + 1);
  const frac = clamped - left;
  return profile[left] * (1 - frac) + profile[right] * frac;
}

/**
 * Build one ordered list of grid-boundary positions from the chosen start and pitch.
 *
 * @param {number} start
 * @param {number} pitch
 * @param {number} cellCount
 * @returns {number[] | null}
 */
function buildGridPositions(start, pitch, cellCount) {
  const fitPitch = Math.max(1, pitch);
  const positions = [];
  for (let i = 0; i <= cellCount; i++) {
    const position = start + fitPitch * i;
    positions.push(position);
  }
  return positions;
}

/**
 * Generate the nominal interior cross lattice from the rectified sheet bounds.
 *
 * @param {{left:number, top:number, width:number, height:number}} bounds
 * @param {number} cols
 * @param {number} rows
 * @returns {{col:number, row:number, x:number, y:number}[]}
 */
function getExpectedCrossLattice(bounds, cols, rows, includeCornerCrosses = false) {
  const points = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const isCorner = ((col === 0) || (col === cols)) && ((row === 0) || (row === rows));
      if (isCorner && !includeCornerCrosses) continue;
      points.push({ col, row, x: bounds.left + bounds.width * (col / cols), y: bounds.top + bounds.height * (row / rows) });
    }
  }
  return points;
}

/**
 * Return the four rectified corner-circle anchors as fixed marker points.
 *
 * @param {{left:number, top:number, width:number, height:number}} bounds
 * @param {number} cols
 * @param {number} rows
 * @returns {object[]}
 */
function getRectifiedCornerAnchors_old(bounds, cols, rows) {
  return [
    { kind: "dot", col: 0, row: 0, x: bounds.left, y: bounds.top, detectedX: bounds.left, detectedY: bounds.top, dx: 0, dy: 0, confidence: 10, accepted: true },
    { kind: "dot", col: cols, row: 0, x: bounds.left + bounds.width, y: bounds.top, detectedX: bounds.left + bounds.width, detectedY: bounds.top, dx: 0, dy: 0, confidence: 10, accepted: true },
    { kind: "dot", col: cols, row: rows, x: bounds.left + bounds.width, y: bounds.top + bounds.height, detectedX: bounds.left + bounds.width, detectedY: bounds.top + bounds.height, dx: 0, dy: 0, confidence: 10, accepted: true },
    { kind: "dot", col: 0, row: rows, x: bounds.left, y: bounds.top + bounds.height, detectedX: bounds.left, detectedY: bounds.top + bounds.height, dx: 0, dy: 0, confidence: 10, accepted: true },
  ];
}

/**
 * Estimate whether marker ROIs contain filled dots or crosses by thresholding each nominal ROI,
 * measuring the circularity of the largest blob, and taking the median across the grid.
 *
 * @param {cv.Mat} rectifiedMat
 * @param {number} cols
 * @param {number} rows
 * @param {number} crossRoiScale
 * @param {{left:number, top:number, width:number, height:number}} bounds
 * @param {boolean} includeCornerCrosses
 * @returns {{resolvedMarkerType:"crosses"|"circles", medianCircularity:number | null, sampleCount:number}}
 */
function classifyAlignmentMarkerType(rectifiedMat, cols, rows, crossRoiScale, bounds, includeCornerCrosses) {
  const grayMat = toLightnessGray(rectifiedMat);
  const circularities = [];
  const expectedMarkers = getExpectedCrossLattice(bounds, cols, rows, includeCornerCrosses);

  try {
    for (const expected of expectedMarkers) {
      const circularity = measureLargestBlobCircularityAtExpectedPosition(
        grayMat,
        expected,
        rectifiedMat.cols,
        rectifiedMat.rows,
        cols,
        rows,
        crossRoiScale
      );
      if (Number.isFinite(circularity)) {
        circularities.push(circularity);
      }
    }
  } finally {
    grayMat.delete();
  }

  const medianCircularity = computeMedian(circularities);
  const resolvedMarkerType = (medianCircularity !== null && medianCircularity >= 0.3) ? "circles" : "crosses";
  return {
    resolvedMarkerType,
    medianCircularity,
    sampleCount: circularities.length,
  };
}

/**
 * Measure the circularity of the largest Otsu-thresholded blob inside one nominal marker ROI.
 *
 * @param {cv.Mat} grayMat
 * @param {{col:number, row:number, x:number, y:number}} expected
 * @param {number} sheetW
 * @param {number} sheetH
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @returns {number | null}
 */
function measureLargestBlobCircularityAtExpectedPosition(grayMat, expected, sheetW, sheetH, cols, rows, crossRoiScale = 0.75) {
  const cellW = sheetW / cols;
  const cellH = sheetH / rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.22 * crossRoiScale));
  const side = Math.max(1, roiHalf * 2 + 1);
  const roi = extractCenteredSquareRoi(grayMat, expected.x, expected.y, side);
  const mask = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.threshold(roi, mask, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (contours.size() === 0) return null;

    let bestContour = null;
    let bestArea = -Infinity;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > bestArea) {
        bestContour?.delete();
        bestContour = contour;
        bestArea = area;
      } else {
        contour.delete();
      }
    }
    if (!bestContour || bestArea <= 0) return null;
    const perimeter = cv.arcLength(bestContour, true);
    bestContour.delete();
    if (perimeter <= 0) return null;
    return (4 * Math.PI * bestArea) / (perimeter * perimeter);
  } finally {
    roi.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Compute the median of a numeric sample set.
 *
 * @param {number[]} values
 * @returns {number | null}
 */
function computeMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) * 0.5;
}

/**
 * Detect one cross near its expected lattice position and estimate its center at subpixel precision.
 *
 * @param {cv.Mat} grayMat
 * @param {{col:number, row:number, x:number, y:number}} expected
 * @param {number} sheetW
 * @param {number} sheetH
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @returns {object}
 */
function detectCrossAtExpectedPosition(grayMat, expected, sheetW, sheetH, cols, rows, crossRoiScale = 0.75, options = {}) {
  const cellW = sheetW / cols;
  const cellH = sheetH / rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.18 * crossRoiScale));
  const side = Math.max(1, roiHalf * 2 + 1);
  const roi = extractCenteredSquareRoi(grayMat, expected.x, expected.y, side);
  const mask = new cv.Mat();
  const detectWithConvolution = !!options.detectWithConvolution;
  const kernelMat = detectWithConvolution ? cv.matFromArray(25, 25, cv.CV_32F, crossKernel.flat()) : null;
  const roi32 = detectWithConvolution ? new cv.Mat() : null;
  const conv32 = detectWithConvolution ? new cv.Mat() : null;

  try {
    // Threshold the ROI, then measure horizontal and vertical stroke energy in central bands.
    cv.threshold(roi, mask, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const roiW = roi.cols;
    const roiH = roi.rows;
    const bandHalfH = Math.max(1, Math.round(roiH * 0.18));
    const bandHalfW = Math.max(1, Math.round(roiW * 0.18));
    const bandY0 = Math.max(0, Math.floor(roiH * 0.5 - bandHalfH));
    const bandY1 = Math.min(roiH, Math.ceil(roiH * 0.5 + bandHalfH));
    const bandX0 = Math.max(0, Math.floor(roiW * 0.5 - bandHalfW));
    const bandX1 = Math.min(roiW, Math.ceil(roiW * 0.5 + bandHalfW));
    const colProfile = new Float64Array(roiW);
    const rowProfile = new Float64Array(roiH);
    const data = mask.data;

    for (let y = 0; y < roiH; y++) {
      const rowOffset = y * roiW;
      for (let x = 0; x < roiW; x++) {
        const value = data[rowOffset + x] / 255.0;
        if ((y >= bandY0) && (y < bandY1)) colProfile[x] += value;
        if ((x >= bandX0) && (x < bandX1)) rowProfile[y] += value;
      }
    }

    let peakX;
    let peakY;
    let convolutionStrength = null;
    if (detectWithConvolution) {
      // Alternate localizer: run the same cross kernel inside the ROI, clamp to positive response,
      // then find the strongest row/column energy around the resulting cross hotspot.
      roi.convertTo(roi32, cv.CV_32F);
      cv.filter2D(roi32, conv32, cv.CV_32F, kernelMat, new cv.Point(-1, -1), 0, cv.BORDER_CONSTANT);
      const convData = conv32.data32F;
      const convColProfile = new Float64Array(roiW);
      const convRowProfile = new Float64Array(roiH);
      let convScoreSum = 0;
      for (let y = 0; y < roiH; y++) {
        const rowOffset = y * roiW;
        for (let x = 0; x < roiW; x++) {
          // Score each ROI pixel by its zero-padded convolution response, clamped into [0, 255]
          // and normalized into [0, 1], then average those scores across the whole ROI.
          const value = Math.max(0, Math.min(255, convData[rowOffset + x]));
          convScoreSum += value / 255;
          convColProfile[x] += value;
          convRowProfile[y] += value;
        }
      }
      peakX = getWeightedPeakIndex(convColProfile);
      peakY = getWeightedPeakIndex(convRowProfile);
      convolutionStrength = convScoreSum / Math.max(1, roiW * roiH);
    } else {
      // Default localizer: weighted peaks from the thresholded horizontal/vertical stroke profiles.
      peakX = getWeightedPeakIndex(smooth1D(colProfile, 5));
      peakY = getWeightedPeakIndex(smooth1D(rowProfile, 5));
    }
    // Report the center in both sheet coordinates and ROI-local coordinates; the latter is used by the
    // editable marker UI so it can draw and drag reticles without baking those marks into the ROI image.
    const roiCenterX = (roiW - 1) * 0.5;
    const roiCenterY = (roiH - 1) * 0.5;
    const detectedX = expected.x + (peakX.position - roiCenterX);
    const detectedY = expected.y + (peakY.position - roiCenterY);
    const dx = detectedX - expected.x;
    const dy = detectedY - expected.y;
    const darkFrac = countNonZeroMask(mask) / (roiW * roiH);
    const colContrast = peakX.value / Math.max(1e-6, averageArrayValue(colProfile));
    const rowContrast = peakY.value / Math.max(1e-6, averageArrayValue(rowProfile));
    const displacementLimit = Math.max(2.0, Math.min(cellW, cellH) * 0.08);
    const maxDarkFrac = detectWithConvolution ? 0.5 : 0.30;
    const accepted =
      Math.hypot(dx, dy) <= displacementLimit &&
      colContrast >= 1.6 &&
      rowContrast >= 1.6 &&
      darkFrac >= 0.002 &&
      darkFrac <= maxDarkFrac;

    return {
      ...expected,
      kind: "cross",
      roiCenterX: expected.x,
      roiCenterY: expected.y,
      detectedX,
      detectedY,
      dx,
      dy,
      colContrast,
      rowContrast,
      darkFrac,
      convolutionStrength,
      confidence: colContrast * rowContrast,
      accepted,
      localX: peakX.position,
      localY: peakY.position,
      canvas: buildCrossRoiCanvas(roi),
    };
  } finally {
    roi.delete();
    mask.delete();
    kernelMat?.delete();
    roi32?.delete();
    conv32?.delete();
  }
}

/**
 * Detect one filled dot near its expected lattice position and centroid the largest thresholded blob.
 *
 * The centroid is computed from the white pixels of the blob mask itself, not from contour moments.
 * To tolerate badly centered dots, the ROI may recenter itself a few times toward that centroid
 * while staying bounded near the original nominal ROI center.
 *
 * @param {cv.Mat} grayMat
 * @param {{col:number, row:number, x:number, y:number}} expected
 * @param {number} sheetW
 * @param {number} sheetH
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @returns {object}
 */
function detectDotAtExpectedPosition(grayMat, expected, sheetW, sheetH, cols, rows, crossRoiScale = 0.75) {
  const cellW = sheetW / cols;
  const cellH = sheetH / rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.22 * crossRoiScale));
  const side = Math.max(1, roiHalf * 2 + 1);
  const mask = new cv.Mat();
  const blobMask = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const roiCenterX = (side - 1) * 0.5;
  const roiCenterY = (side - 1) * 0.5;
  const maxShiftX = side * 0.5;
  const maxShiftY = side * 0.5;
  const maxIterations = 3;
  let roi = null;
  let currentCenterX = expected.x;
  let currentCenterY = expected.y;
  let finalLocalX = roiCenterX;
  let finalLocalY = roiCenterY;
  let finalCount = 0;
  let finalDarkFrac = 0;
  let hasCentroid = false;

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      roi?.delete();
      roi = extractCenteredSquareRoi(grayMat, currentCenterX, currentCenterY, side);
      mask.setTo(new cv.Scalar(0));
      blobMask.setTo(new cv.Scalar(0));

      cv.threshold(roi, mask, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      if (contours.size() === 0) {
        break;
      }

      const contourEntries = [];
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        contourEntries.push({ index: i, area: cv.contourArea(contour) });
        contour.delete();
      }
      contourEntries.sort((a, b) => b.area - a.area);
      const bestIndex = contourEntries[0].index;

      blobMask.create(roi.rows, roi.cols, cv.CV_8UC1);
      blobMask.setTo(new cv.Scalar(0));
      cv.drawContours(blobMask, contours, bestIndex, new cv.Scalar(255), cv.FILLED);

      let sumX = 0;
      let sumY = 0;
      let count = 0;
      const blobData = blobMask.data;
      for (let y = 0; y < roi.rows; y++) {
        const rowOffset = y * roi.cols;
        for (let x = 0; x < roi.cols; x++) {
          if (blobData[rowOffset + x] === 255) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      if (count <= 0) {
        break;
      }

      hasCentroid = true;
      finalCount = count;
      finalLocalX = sumX / count;
      finalLocalY = sumY / count;
      finalDarkFrac = count / Math.max(1, roi.cols * roi.rows);

      const fracX = finalLocalX / Math.max(1, roi.cols - 1);
      const fracY = finalLocalY / Math.max(1, roi.rows - 1);
      // Retry with a shifted ROI when the blob is still noticeably off-center. This keeps dot mode
      // usable even when the nominal lattice is slightly off or the ROI clips one side of the dot.
      const needsRecentering =
        fracX < 0.47 || fracX > 0.53 ||
        fracY < 0.47 || fracY > 0.53;
      if (!needsRecentering || iteration === (maxIterations - 1)) {
        break;
      }

      const desiredShiftX = (finalLocalX - roiCenterX) * 0.75;
      const desiredShiftY = (finalLocalY - roiCenterY) * 0.75;
      const nextOffsetX = Math.max(-maxShiftX, Math.min(maxShiftX, (currentCenterX - expected.x) + desiredShiftX));
      const nextOffsetY = Math.max(-maxShiftY, Math.min(maxShiftY, (currentCenterY - expected.y) + desiredShiftY));
      const nextCenterX = expected.x + nextOffsetX;
      const nextCenterY = expected.y + nextOffsetY;
      const centerShift = Math.abs(nextCenterX - currentCenterX) + Math.abs(nextCenterY - currentCenterY);
      currentCenterX = nextCenterX;
      currentCenterY = nextCenterY;
      if (centerShift < 0.01) {
        break;
      }
    }
    const localX = finalLocalX;
    const localY = finalLocalY;
    const detectedX = currentCenterX + (localX - roiCenterX);
    const detectedY = currentCenterY + (localY - roiCenterY);
    const dx = detectedX - expected.x;
    const dy = detectedY - expected.y;
    const darkFrac = finalDarkFrac;
    // Dot mode now distinguishes between "has a usable centroid" and "counts as accepted" for the
    // confidence summary. Extraction can use any valid centroid, while fallback counts only the
    // stricter accepted subset.
    const accepted =
      hasCentroid &&
      darkFrac >= 0.0005 &&
      darkFrac <= 0.75;
    const roiCanvas = roi ? buildCrossRoiCanvas(roi) : null;

    return {
      ...expected,
      kind: "dot",
      roiCenterX: currentCenterX,
      roiCenterY: currentCenterY,
      hasCentroid,
      detectedX,
      detectedY,
      dx,
      dy,
      colContrast: NaN,
      rowContrast: NaN,
      darkFrac,
      convolutionStrength: null,
      confidence: darkFrac,
      accepted,
      localX,
      localY,
      canvas: roiCanvas || document.createElement("canvas"),
      blobCanvas: buildCrossRoiCanvas(blobMask),
    };
  } finally {
    roi?.delete();
    mask.delete();
    blobMask.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Build a diagnostic tile for one nominal cross position without attempting refinement.
 *
 * @param {cv.Mat} grayMat
 * @param {{col:number, row:number, x:number, y:number}} expected
 * @param {number} sheetW
 * @param {number} sheetH
 * @param {number} cols
 * @param {number} rows
 * @param {number} [crossRoiScale=0.75]
 * @returns {object}
 */
function buildUnrefinedCrossRegionTile(grayMat, expected, sheetW, sheetH, cols, rows, crossRoiScale = 0.75, markerType = "crosses") {
  const cellW = sheetW / cols;
  const cellH = sheetH / rows;
  const roiHalf = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.18 * crossRoiScale));
  const side = Math.max(1, roiHalf * 2 + 1);
  const roi = extractCenteredSquareRoi(grayMat, expected.x, expected.y, side);
  const center = (side - 1) * 0.5;

  try {
    return {
      ...expected,
      kind: "unrefined",
      markerType,
      roiCenterX: expected.x,
      roiCenterY: expected.y,
      detectedX: expected.x,
      detectedY: expected.y,
      dx: 0,
      dy: 0,
      darkFrac: 0,
      confidence: 0,
      accepted: false,
      localX: center,
      localY: center,
      canvas: buildCrossRoiCanvas(roi),
    };
  } finally {
    roi.delete();
  }
}

/**
 * Extract a square ROI centered on a floating-point point, padding with border pixels when needed.
 *
 * @param {cv.Mat} grayMat
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} side
 * @returns {cv.Mat}
 */
function extractCenteredSquareRoi(grayMat, centerX, centerY, side) {
  const roi = new cv.Mat();
  const roiCenter = (side - 1) * 0.5;
  const tx = roiCenter - centerX;
  const ty = roiCenter - centerY;
  const affine = cv.matFromArray(2, 3, cv.CV_64F, [1, 0, tx, 0, 1, ty]);
  try {
    cv.warpAffine(grayMat, roi, affine, new cv.Size(side, side), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
  } finally {
    affine.delete();
  }
  return roi;
}

/**
 * Convert a cross ROI into a plain debug canvas; crosshair overlays are drawn later by the UI.
 *
 * @param {cv.Mat} roiMat
 * @returns {HTMLCanvasElement}
 */
function buildCrossRoiCanvas(roiMat) {
  const canvas = matToCanvas(roiMat);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  return canvas;
}

/**
 * Estimate a subpixel peak position from a 1D response profile.
 *
 * @param {ArrayLike<number>} arr
 * @returns {{position:number, value:number}}
 */
function getWeightedPeakIndex(arr) {
  let maxIdx = 0;
  let maxVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  let acc = 0;
  let wsum = 0;
  for (let i = Math.max(0, maxIdx - 2); i <= Math.min(arr.length - 1, maxIdx + 2); i++) {
    const w = Math.max(0, arr[i]);
    acc += i * w;
    wsum += w;
  }
  return { position: (wsum > 0) ? (acc / wsum) : maxIdx, value: Math.max(0, maxVal) };
}

/**
 * Compute the arithmetic mean of a numeric array-like object.
 *
 * @param {ArrayLike<number>} arr
 * @returns {number}
 */
function averageArrayValue(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return arr.length ? (sum / arr.length) : 0;
}

/**
 * Count non-zero pixels in a binary mask.
 *
 * @param {cv.Mat} maskMat
 * @returns {number}
 */
function countNonZeroMask(maskMat) {
  let count = 0;
  const data = maskMat.data;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) count++;
  return count;
}

/**
 * Build a complete marker lookup by combining nominal crosses, detected crosses, and corner anchors.
 *
 * @param {object[]} expectedCrosses
 * @param {object[]} detectedCrosses
 * @param {object[]} anchorDots
 * @param {number} cols
 * @param {number} rows
 * @returns {Map<string, object>}
 */
function buildMarkerLookup(expectedCrosses, detectedCrosses, anchorDots, cols, rows) {
  const lookup = new Map();
  for (const cross of expectedCrosses) {
    lookup.set(getMarkerKey(cross.col, cross.row), {
      ...cross,
      kind: "fallback",
      detectedX: cross.x,
      detectedY: cross.y,
      confidence: 0,
      accepted: false,
    });
  }
  for (const cross of detectedCrosses) lookup.set(getMarkerKey(cross.col, cross.row), cross);
  if (anchorDots.length >= 4) {
    const corners = [
      { col: 0, row: 0, dot: anchorDots[0] },
      { col: cols, row: 0, dot: anchorDots[1] },
      { col: cols, row: rows, dot: anchorDots[2] },
      { col: 0, row: rows, dot: anchorDots[3] },
    ];
    for (const corner of corners) {
      lookup.set(getMarkerKey(corner.col, corner.row), { ...corner.dot, col: corner.col, row: corner.row });
    }
  }
  return lookup;
}

/**
 * Tighten grid bounds to the detected corner crosses in the all-cross registration mode.
 *
 * @param {object} alignmentInfo
 * @returns {void}
 */
function refineAlignmentBoundsFromCornerCrosses(alignmentInfo) {
  if (!alignmentInfo?.includeCornerCrosses) return;
  const tl = alignmentInfo.markerLookup.get(getMarkerKey(0, 0));
  const tr = alignmentInfo.markerLookup.get(getMarkerKey(alignmentInfo.cols, 0));
  const br = alignmentInfo.markerLookup.get(getMarkerKey(alignmentInfo.cols, alignmentInfo.rows));
  const bl = alignmentInfo.markerLookup.get(getMarkerKey(0, alignmentInfo.rows));
  if (!tl || !tr || !br || !bl) return;

  alignmentInfo.gridBounds = {
    left: (tl.detectedX + bl.detectedX) * 0.5,
    top: (tl.detectedY + tr.detectedY) * 0.5,
    width: ((tr.detectedX - tl.detectedX) + (br.detectedX - bl.detectedX)) * 0.5,
    height: ((bl.detectedY - tl.detectedY) + (br.detectedY - tr.detectedY)) * 0.5,
  };
}

/**
 * Build the string key used for lattice marker lookup.
 *
 * @param {number} col
 * @param {number} row
 * @returns {string}
 */
function getMarkerKey(col, row) {
  return `${col},${row}`;
}

/**
 * Resolve one lattice marker to either a detected point or the nominal fallback position.
 *
 * @param {object} extractionInfo
 * @param {number} col
 * @param {number} row
 * @returns {{x:number, y:number, marker:object | null}}
 */
function resolveMarkerPoint(extractionInfo, col, row) {
  const marker = extractionInfo.markerLookup.get(getMarkerKey(col, row));
  if (marker) {
    return { x: marker.detectedX, y: marker.detectedY, marker };
  }
  const bounds = extractionInfo.gridBounds;
  return {
    x: bounds.left + bounds.width * (col / extractionInfo.cols),
    y: bounds.top + bounds.height * (row / extractionInfo.rows),
    marker: null,
  };
}

/**
 * Resolve the four corner markers surrounding one frame cell.
 *
 * @param {object} extractionInfo
 * @param {number} col
 * @param {number} row
 * @returns {{tl:object, tr:object, br:object, bl:object}}
 */
function resolveFrameQuad(extractionInfo, col, row) {
  const tl = resolveMarkerPoint(extractionInfo, col, row);
  const tr = resolveMarkerPoint(extractionInfo, col + 1, row);
  const br = resolveMarkerPoint(extractionInfo, col + 1, row + 1);
  const bl = resolveMarkerPoint(extractionInfo, col, row + 1);
  return { tl, tr, br, bl };
}

/**
 * Bilinearly interpolate a point inside a quadrilateral.
 *
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} quad
 * @param {number} u
 * @param {number} v
 * @returns {{x:number, y:number}}
 */
function bilerpQuad(quad, u, v) {
  const topX = quad.tl.x * (1 - u) + quad.tr.x * u;
  const topY = quad.tl.y * (1 - u) + quad.tr.y * u;
  const bottomX = quad.bl.x * (1 - u) + quad.br.x * u;
  const bottomY = quad.bl.y * (1 - u) + quad.br.y * u;
  return {
    x: topX * (1 - v) + bottomX * v,
    y: topY * (1 - v) + bottomY * v,
  };
}

/**
 * Build resolved per-frame quads for debugging and inspection.
 *
 * @param {Map<string, object>} markerLookup
 * @param {number} cols
 * @param {number} rows
 * @param {{left:number, top:number, width:number, height:number}} gridBounds
 * @returns {object[]}
 */
function buildFrameDebugQuads(markerLookup, cols, rows, gridBounds) {
  const fakeInfo = { markerLookup, cols, rows, gridBounds };
  const quads = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const quad = resolveFrameQuad(fakeInfo, col, row);
      quads.push({ col, row, tl: quad.tl, tr: quad.tr, br: quad.br, bl: quad.bl });
    }
  }
  return quads;
}

/**
 * Assemble the human-readable status panel text for the latest pipeline run.
 *
 * @param {object} params
 * @returns {string}
 */
function buildStatusText({
  threshVal,
  rawWidth,
  rawHeight,
  pageAreaPct,
  pageWarpWidth,
  pageWarpHeight,
  highPageWarpWidth,
  highPageWarpHeight,
  alignmentInfo,
  frameCount,
  expectedFrameCount,
  rectifiedWidth,
  rectifiedHeight,
  animationWidth,
  animationHeight,
  gridDetector,
}) {
  const lines = [
    t("status.rawPhoto", { width: rawWidth, height: rawHeight }),
    t("status.paperThreshold", { value: Math.round(Number(threshVal)) }),
    t("status.largestContourArea", { value: (pageAreaPct * 100).toFixed(1) }),
    t("status.detectionWarp", { width: pageWarpWidth, height: pageWarpHeight }),
    t("status.extractionWarp", { width: highPageWarpWidth, height: highPageWarpHeight }),
    t("status.rectifiedSheet", { width: rectifiedWidth, height: rectifiedHeight }),
    t("status.animationSize", { width: animationWidth, height: animationHeight }),
    t("status.framesExtracted", { count: frameCount, expected: expectedFrameCount }),
  ];

  if (alignmentInfo) {
    if (alignmentInfo.requestedMarkerType === "markerless" && alignmentInfo.markerlessEstimate) {
      lines.push(
        t("status.markerlessGridPitch", {
          pitchX: alignmentInfo.markerlessEstimate.pitchX.toFixed(1),
          pitchY: alignmentInfo.markerlessEstimate.pitchY.toFixed(1),
        })
      );
    }
    if (alignmentInfo.requestedMarkerType === "auto" && alignmentInfo.markerTypeMedianCircularity !== null) {
      lines.push(
        t("status.markerCircularity", {
          value: alignmentInfo.markerTypeMedianCircularity.toFixed(3),
          type: alignmentInfo.resolvedMarkerType === "circles"
            ? t("status.markerTypeDots")
            : t("status.markerTypeCrosses"),
        })
      );
    }
    if (alignmentInfo.ok) {
      lines.push(t("status.markerAlignment", {
        count: alignmentInfo.detectedCount,
        expected: alignmentInfo.expectedCount,
      }));
    } else {
      lines.push(t("status.markerAlignmentFallback", { reason: alignmentInfo.reason }));
    }
  }

  return lines.join("\n");
}
