const IGNORE_PX = 8;
const DOT_DIM_PCT_COLS = 0.03;
const DOT_DIM_PCT_ROWS = 0.02;
const GUTTER_PCT = 0.01;
const MIN_CROSS_DETECTION_RATIO = 0.5;
const MIN_CROSS_DETECTIONS_ABS = 4;
const bUseCrossOnlyGridDetection = true;

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
    // Segment the bright paper sheet from the darker surroundings.
    cv.cvtColor(visionSrc, grayImg, cv.COLOR_RGBA2GRAY);
    const threshVal = estimatePaperThreshold(grayImg, config.thresholdMethod, config.thresholdOffset);
    cv.threshold(grayImg, thresh, threshVal, 255, cv.THRESH_BINARY);
    throwIfAborted(requestId);

    // Detect the page quadrilateral in raw-photo coordinates.
    pageQuad = findLargestQuad(thresh, sourceCanvas.width * sourceCanvas.height);
    const ordered = orderCorners(pageQuad.points);
    throwIfAborted(requestId);

    // Build a stable low-res page warp for tuned dot finding, plus a denser warp for extraction.
    const pageSizeLow = new cv.Size(
      Math.round(config.paperWidthIn * 100),
      Math.round(config.paperHeightIn * 100)
    );
    const pageSizeHigh = estimateHighResPageWarpSize(
      pageQuad.quadAreaPx,
      config.paperWidthIn,
      config.paperHeightIn,
      pageSizeLow
    );
    pageWarpLow = perspectiveWarp(visionSrc, styledSrc, ordered, pageSizeLow);
    pageWarpHigh = perspectiveWarp(visionSrc, styledSrc, ordered, pageSizeHigh);
    pageWarpPreviewCanvas = matToCanvas(pageWarpHigh.styledMat);
    throwIfAborted(requestId);

    // Keep both grid-finding pipelines available while the cross-only detector is being validated.
    const useRectifiedAsSource = config.useRectifiedAsSource;
    rectifiedWarp = bUseCrossOnlyGridDetection
      ? buildFrameGridRectification_fromCrosses(
          visionSrc,
          styledSrc,
          pageWarpHigh,
          config,
          useRectifiedAsSource
        )
      : buildFrameGridRectification_old(
          visionSrc,
          styledSrc,
          pageWarpLow,
          pageWarpHigh,
          config,
          useRectifiedAsSource
        );
    throwIfAborted(requestId);

    // Resolve the cross lattice if enabled; otherwise keep the nominal grid and unrefined ROI views.
    const alignmentInfo = config.useCrossAlignment
      ? buildCrossAlignmentData(
          rectifiedWarp.visionMat,
          config.frameCols,
          config.frameRows,
          config.crossRoiScale,
          rectifiedWarp.gridBounds,
          {
            includeCornerCrosses: rectifiedWarp.includeCornerCrosses,
            detectCrossesWithConvolution: config.detectCrossesWithConvolution,
          }
        )
      : buildUnrefinedCrossRegionInfo(
          rectifiedWarp.visionMat,
          config.frameCols,
          config.frameRows,
          "disabled",
          rectifiedWarp.gridBounds,
          config.crossRoiScale,
          { includeCornerCrosses: rectifiedWarp.includeCornerCrosses }
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
      sourceMode: useRectifiedAsSource ? "rectified" : "raw photo",
      gridDetector: rectifiedWarp.includeCornerCrosses ? "cross-only" : "corner dots",
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
 * Legacy frame-grid detector based on the four circular corner markers.
 *
 * @param {cv.Mat} visionSrc
 * @param {cv.Mat} styledSrc
 * @param {{visionMat:cv.Mat, styledMat:cv.Mat}} pageWarpLow
 * @param {{visionMat:cv.Mat, styledMat:cv.Mat, inverseTransform:number[]}} pageWarpHigh
 * @param {object} config
 * @param {boolean} useRectifiedAsSource
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, gridBounds:{left:number, top:number, width:number, height:number}, includeCornerCrosses:boolean}}
 */
function buildFrameGridRectification_old(visionSrc, styledSrc, pageWarpLow, pageWarpHigh, config, useRectifiedAsSource) {
  // Legacy path: find the corner circles in the low-res page warp, then scale them into the extraction warp.
  const lightnessLow = toLightnessGray(pageWarpLow.visionMat);
  const dotRectLow = findDotRect_old(lightnessLow);
  lightnessLow.delete();
  const dotRectHigh = scaleDotRect(dotRectLow, new cv.Size(pageWarpLow.visionMat.cols, pageWarpLow.visionMat.rows), new cv.Size(pageWarpHigh.visionMat.cols, pageWarpHigh.visionMat.rows));
  const rectifiedSize = estimateRectifiedSize_old(dotRectHigh);
  const detectionPadding = estimateDetectionPadding(
    rectifiedSize.width,
    rectifiedSize.height,
    config.frameCols,
    config.frameRows,
    config.crossRoiScale
  );
  const finalDotRect = useRectifiedAsSource
    ? dotRectHigh
    : mapQuadThroughHomography(dotRectHigh, pageWarpHigh.inverseTransform);
  const finalVisionSource = useRectifiedAsSource ? pageWarpHigh.visionMat : visionSrc;
  const finalStyledSource = useRectifiedAsSource ? pageWarpHigh.styledMat : styledSrc;
  const rectifiedWarp = rectifyByDots_old(
    finalVisionSource,
    finalStyledSource,
    finalDotRect,
    rectifiedSize,
    detectionPadding
  );
  return { ...rectifiedWarp, includeCornerCrosses: false, previewGridQuad: dotRectHigh };
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
 * Estimate the grayscale threshold used to isolate the page.
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
 * @param {number} paperWidthIn
 * @param {number} paperHeightIn
 * @param {cv.Size} pageSizeLow
 * @returns {cv.Size}
 */
function estimateHighResPageWarpSize(quadAreaPx, paperWidthIn, paperHeightIn, pageSizeLow) {
  const aspect = Math.max(1e-6, paperWidthIn / paperHeightIn);
  const widthFromArea = Math.max(1, Math.round(Math.sqrt(Math.max(1, quadAreaPx) * aspect)));
  const heightFromArea = Math.max(1, Math.round(Math.sqrt(Math.max(1, quadAreaPx) / aspect)));
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
    const insetPx = Math.max(0, Math.min(150, options.paperMarginPx ?? 80));
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
 * Locate the four corner circles by finding edge dips followed by the required blank gutter.
 *
 * @param {cv.Mat} pageGrayMat
 * @returns {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}}
 */
function findDotRect_old(pageGrayMat) {
  const cols = columnSums(pageGrayMat);
  const rows = rowSums(pageGrayMat);
  // The plot format guarantees a blank gutter outside each corner circle, so we search for a dip then verify the blank run beyond it.
  const leftDip = findFirstDipFromEdge(cols, "left", {
    insetPx: IGNORE_PX,
    depthFrac: DOT_DIM_PCT_COLS,
    gutterLenFrac: GUTTER_PCT,
    gutterTolFrac: 0.01,
  });
  const rightDip = findFirstDipFromEdge(cols, "right", {
    insetPx: IGNORE_PX,
    depthFrac: DOT_DIM_PCT_COLS,
    gutterLenFrac: GUTTER_PCT,
    gutterTolFrac: 0.01,
  });
  const topDip = findFirstDipFromEdge(rows, "top", {
    insetPx: IGNORE_PX,
    depthFrac: DOT_DIM_PCT_ROWS,
    gutterLenFrac: GUTTER_PCT,
    gutterTolFrac: 0.01,
  });
  const bottomDip = findFirstDipFromEdge(rows, "bottom", {
    insetPx: IGNORE_PX,
    depthFrac: DOT_DIM_PCT_ROWS,
    gutterLenFrac: GUTTER_PCT,
    gutterTolFrac: 0.01,
  });

  return {
    tl: refineDotCentroid(pageGrayMat, leftDip.center, topDip.center, leftDip.width, topDip.width, 3.5),
    tr: refineDotCentroid(pageGrayMat, rightDip.center, topDip.center, rightDip.width, topDip.width, 3.5),
    br: refineDotCentroid(pageGrayMat, rightDip.center, bottomDip.center, rightDip.width, bottomDip.width, 3.5),
    bl: refineDotCentroid(pageGrayMat, leftDip.center, bottomDip.center, leftDip.width, bottomDip.width, 3.5),
  };
}

/**
 * Estimate the dot-aligned rectified sheet size from the measured corner-dot spacing.
 *
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} dotRect
 * @returns {cv.Size}
 */
function estimateRectifiedSize_old(dotRect) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return new cv.Size(
    Math.round((dist(dotRect.tl, dotRect.tr) + dist(dotRect.bl, dotRect.br)) * 0.5),
    Math.round((dist(dotRect.tl, dotRect.bl) + dist(dotRect.tr, dotRect.br)) * 0.5)
  );
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
 * Rectify the page from the four corner circles into sheet coordinates.
 *
 * @param {cv.Mat} pageVision
 * @param {cv.Mat} pageStyled
 * @param {{tl:{x:number,y:number}, tr:{x:number,y:number}, br:{x:number,y:number}, bl:{x:number,y:number}}} dotRect
 * @param {cv.Size} size
 * @param {number} [padding=0]
 * @returns {{visionMat:cv.Mat, styledMat:cv.Mat, gridBounds:{left:number, top:number, width:number, height:number}}}
 */
function rectifyByDots_old(pageVision, pageStyled, dotRect, size, padding = 0) {
  return rectifyByQuad(pageVision, pageStyled, dotRect, size, padding);
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
  if (mode === "cubic" && typeof cv.INTER_CUBIC !== "undefined") return cv.INTER_CUBIC;
  if (mode === "lanczos" && typeof cv.INTER_LANCZOS4 !== "undefined") return cv.INTER_LANCZOS4;
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
 * @returns {HTMLCanvasElement}
 */
export function extractSingleFrameToCanvas(rectifiedMat, extractionInfo, col, row, crop, interpolation) {
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
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcTL.x, srcTL.y,
    srcTR.x, srcTR.y,
    srcBR.x, srcBR.y,
    srcBL.x, srcBL.y,
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
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerCrosses);
  const anchorDots = includeCornerCrosses ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
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
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerCrosses);
  const anchorDots = includeCornerCrosses ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
  const markerLookup = buildMarkerLookup(expectedCrosses, [], anchorDots, cols, rows);
  const crossRoiTiles = expectedCrosses.map((expected) =>
    buildUnrefinedCrossRegionTile(rectifiedMat, expected, rectifiedMat.cols, rectifiedMat.rows, cols, rows, crossRoiScale)
  );
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
  const includeCornerCrosses = !!options.includeCornerCrosses;
  const detectWithConvolution = !!options.detectCrossesWithConvolution;
  const bounds = gridBounds || { left: 0, top: 0, width: rectifiedMat.cols, height: rectifiedMat.rows };
  const expectedCrosses = getExpectedCrossLattice(bounds, cols, rows, includeCornerCrosses);
  if (expectedCrosses.length === 0) {
    return buildFallbackFrameExtractionData(rectifiedMat, cols, rows, "no crosses expected", bounds, null, { includeCornerCrosses });
  }
  const anchorDots = includeCornerCrosses ? [] : getRectifiedCornerAnchors_old(bounds, cols, rows);
  const grayMat = toLightnessGray(rectifiedMat);
  const detectedCrosses = [];
  const rejectedCrosses = [];
  const crossRoiTiles = [];

  try {
    // Inspect each expected interior lattice point independently so weak detections can be rejected one by one.
    for (const expected of expectedCrosses) {
      const detection = detectCrossAtExpectedPosition(
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
  const markerLookup = buildMarkerLookup(expectedCrosses, detectedCrosses, anchorDots, cols, rows);
  return {
    ok,
    reason: ok ? "ok" : `too few confident detections (${detectedCrosses.length}/${expectedCrosses.length})`,
    includeCornerCrosses,
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
      canvas: buildCrossRoiCanvas(roi, peakX.position, peakY.position, accepted),
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
function buildUnrefinedCrossRegionTile(grayMat, expected, sheetW, sheetH, cols, rows, crossRoiScale = 0.75) {
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
      detectedX: expected.x,
      detectedY: expected.y,
      dx: 0,
      dy: 0,
      darkFrac: 0,
      confidence: 0,
      accepted: false,
      canvas: buildCrossRoiCanvas(roi, center, center, false),
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
 * Convert a cross ROI into a debug canvas and overlay the chosen crosshair center.
 *
 * @param {cv.Mat} roiMat
 * @param {number} localX
 * @param {number} localY
 * @param {boolean} accepted
 * @returns {HTMLCanvasElement}
 */
function buildCrossRoiCanvas(roiMat, localX, localY, accepted) {
  const canvas = matToCanvas(roiMat);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.strokeStyle = accepted ? "rgba(255, 0, 0, 0.55)" : "rgba(255, 0, 0, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(localX + 0.5, 0);
  ctx.lineTo(localX + 0.5, canvas.height);
  ctx.moveTo(0, localY + 0.5);
  ctx.lineTo(canvas.width, localY + 0.5);
  ctx.stroke();
  ctx.restore();
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
  sourceMode,
  gridDetector,
}) {
  const lines = [
    "Raw photo: " + rawWidth + " × " + rawHeight,
    "Paper threshold: " + threshVal + "/255",
    "Largest contour area: " + (pageAreaPct * 100).toFixed(1) + "%",
    "Detection warp: " + pageWarpWidth + " × " + pageWarpHeight,
    "Extraction warp: " + highPageWarpWidth + " × " + highPageWarpHeight,
    "Rectified sheet: " + rectifiedWidth + " × " + rectifiedHeight,
    "Animation size: " + animationWidth + " × " + animationHeight,
    "Frame source: " + sourceMode,
    "Frames extracted: " + frameCount + "/" + expectedFrameCount,
  ];

  if (alignmentInfo) {
    if (alignmentInfo.ok) {
      lines.push("Cross alignment: " + alignmentInfo.detectedCount + "/" + alignmentInfo.expectedCount + " used");
    } else {
      lines.push("Cross alignment fallback: " + alignmentInfo.reason);
    }
  }

  return lines.join("\n");
}
