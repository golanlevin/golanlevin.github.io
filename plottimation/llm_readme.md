# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based desktop tool that builds an animated GIF from a photograph or scan of a plotted animation frame-sheet.

The intended workflow is:

1. User loads a photo or scan of a plotted sheet.
2. App detects the paper quadrilateral in the raw image.
3. App rectifies the full page.
4. App detects the frame-grid region inside that rectified page.
5. App detects the registration crosses on the grid.
6. App extracts each animation frame with subpixel geometric correction.
7. App previews the animation.
8. App exports an animated GIF.

This tool is the current browser successor to the older `plottimation_GIF_generator/` p5/OpenCV sketch.

## Current registration-mark assumption

This is important because the project used to be different.

Current assumption:

- the frame-sheet uses a complete `(cols + 1) x (rows + 1)` lattice of small dark `+` crosses
- the four outer frame-grid corners are crosses too
- there are no special corner circles in the current preferred pipeline
- the areas above, below, left, and right of the frame grid are expected to be blank-ish paper with low variance

Legacy assumption still preserved in code:

- old sheets had 4 circular corner markers plus interior `+` marks
- the old detector used a tuned "dip + gutter" system to find those circles

The new default path is the all-cross pipeline. The old circle-based path is still kept in `js/pipeline.js` with `_old` helpers for reference / fallback.

## Related directories

- `grid-animation-svg-generator/`
  Generates plotted frame sheets.
- `plottimation_GIF_generator/`
  Older p5.js/OpenCV proof-of-concept.
- `plottimation_webtool/`
  Current tool.

Useful demo assets inside `plottimation_webtool/demo/`:

- `mySrcImage.jpg`
  Main demo photo for the current all-cross format.
- `convolved-rectified-sheet.png`
  Ground-truth style reference for the cross-kernel convolution.
- `left-sweep.tsv`
  Recorded left-edge 1D profile data used to tune boundary threshold/persistence.
- `profile.png`
  ImageJ chart of the left-edge profile.
- `debug.png`
  Screenshot of the rectified-page convolution view with detection overlay.

## Architecture summary

The app is now modularized. Main files:

- `plottimation_webtool/index.html`
  UI structure and DOM IDs.
- `plottimation_webtool/style.css`
  Layout and styling.
- `plottimation_webtool/js/app.js`
  Main controller: UI wiring, config reading, caching, preview rendering, GIF export, tooltip system.
- `plottimation_webtool/js/dom-state.js`
  DOM handles, paper presets, grouped shared state.
- `plottimation_webtool/js/appearance.js`
  Appearance adjustments: OKLab brightness/contrast/vibrance, Bradford temperature adaptation, invert.
- `plottimation_webtool/js/canvas-view.js`
  Canvas fit/draw/resize helpers.
- `plottimation_webtool/js/pipeline.js`
  CV pipeline: page detection, rectification, cross-only coarse detector, cross alignment, frame extraction.
- `plottimation_webtool/js/gif.js`
  Main-thread GIF API.
- `plottimation_webtool/js/gif.worker.js`
  Worker used by `gif.js` for encoding. This file contains a local patch for a serpentine-dithering bug.
- `plottimation_webtool/js/opencv.js`
  Local OpenCV.js runtime.

## High-level pipeline

### 1. Load source image

The user can:

- drag/drop a file
- choose a file from disk
- click `Load Demo` to load `demo/mySrcImage.jpg`

The source image is loaded into:

- `state.source.image`
- `state.source.filename`
- `state.source.canvas`

`state.source.canvas` is the full-resolution raw source canvas. Preview canvases are separate and smaller.

### 2. Detect the paper in the raw photo

Implemented in `js/pipeline.js` `runPipeline(...)`.

Steps:

1. Convert raw photo to grayscale.
2. Estimate a threshold using:
   - `Offset Peak`, or
   - `Otsu`
3. Apply threshold to segment bright paper from darker surroundings.
4. Find the largest external contour.
5. Approximate it to 4 points.
6. Order the corners.

The detected page contour is drawn on the `Raw Photo` panel as a semi-transparent lime quad.

### 3. Build page warps

Two page warps are still used:

- `Detection warp`
  fixed at `paperWidth * 100` by `paperHeight * 100`
  This stable lower-resolution warp was kept because the old corner-dot logic was scale-sensitive.

- `Extraction warp`
  estimated from the raw page-quad area so it preserves more source detail than the fixed `*100` heuristic

The app currently still computes both, even though the cross-only detector is the preferred path.

The `Rectified Sheet` panel does **not** show the final extracted frame grid by default. It shows the full rectified page, with overlays.

### 4. Detect the frame-grid region inside the rectified page

This is the newest major change.

Current default path:

- `bUseCrossOnlyGridDetection = true` in `js/pipeline.js`

Current algorithm:

1. Take the already-rectified full page.
2. Convert it to grayscale with **no blur**.
3. Trim inward by `Search Inset Margin`.
   This avoids paper-edge contamination from dark background encroaching around curled paper edges.
4. Convolve the trimmed grayscale page with a custom unnormalized 25x25 `crossKernel`.
5. Clamp the convolution response:
   - negative values -> `0`
   - values above `255` -> `255`
6. Compute 1D average-response profiles:
   - one per column
   - one per row
7. From left/right/top/bottom, find the first sustained run above:
   - `Boundary Threshold`
   - for `Boundary Persistence` consecutive pixels
8. Use those first threshold crossings directly as the coarse frame-grid bounds.

Important:

- there is **no peak-refinement step anymore**
- there is **no extra outward padding step** in the coarse detector anymore
- the red overlay in `Rectified Sheet` now reflects those direct threshold crossings

The old circle-based detector still exists as:

- `buildFrameGridRectification_old(...)`
- `findDotRect_old(...)`
- `estimateRectifiedSize_old(...)`
- `rectifyByDots_old(...)`

But the active path is:

- `buildFrameGridRectification_fromCrosses(...)`
- `findFrameGridQuadFromCrosses(...)`

### 5. Rectify the coarse frame-grid region

After the coarse frame-grid quad is found, the app rectifies that quad into working coordinates using `rectifyByQuad(...)`.

Important details:

- border mode is `cv.BORDER_REPLICATE`
- this is deliberate so cross ROIs at the outer edges remain centered and valid
- downstream cross detection uses the resulting rectified grid image

This rectified-grid image is what frame extraction operates on.

### 6. Detect cross centers

After coarse rectification:

- if `Use cross-based subpixel alignment` is enabled:
  - the app refines actual cross centers from square ROIs around each expected lattice point
- if disabled:
  - the app does **not** refine cross positions
  - it still builds and shows cross-region diagnostics centered on the nominal lattice positions

Important behaviors:

- cross-region ROIs are square
- edge/corner ROIs remain centered because the rectified grid has detection padding and replicated borders
- in the current all-cross mode, the corner tiles are real cross tiles too
- when alignment is disabled, the Cross Regions panel still shows the regions, but the red crosshair sits at the nominal center and no accepted/rejected hover text is shown

The alignment data object contains:

- rectified dimensions
- grid bounds
- detected marker data
- ROI tile canvases for the `Cross Regions` panel
- whether corner crosses are included

In all-cross mode, after cross detection:

- `refineAlignmentBoundsFromCornerCrosses(...)`
  tightens the working grid bounds from the actual detected corner crosses

### 7. Extract animation frames

Frame extraction is now quad-based and subpixel-aware.

Important history:

- earlier versions used only per-frame translation
- then affine extraction
- now full 4-point perspective warp per frame is used

Each frame uses its four surrounding lattice points:

- detected cross if available
- nominal lattice fallback if a cross is missing
- no special corner-dot anchor logic in all-cross mode

Per-frame extraction is done in OpenCV with `cv.warpPerspective`.

### 8. Appearance pipeline

Implemented in `js/appearance.js`.

Current order:

1. `Brightness`
   in OKLab on `L`
2. `Contrast`
   midpoint-preserving S-curve on OKLab `L`
3. `Vibrance`
   adaptive chroma change in OKLab
4. `Color Temperature`
   after returning from OKLab, apply Bradford chromatic adaptation in linear/XYZ space
5. `Invert`
   final RGB inversion `255 - x`

Notes:

- if Brightness, Contrast, Vibrance, Temperature are all zero and Invert is off, no appearance pass is done
- appearance adjustments are lazy in preview and do not force full geometry recomputation
- `Color Temperature` is intended to be a higher-quality warm/cool control, not a naive RGB tint

### 9. Preview architecture

This was refactored away from eager all-frame recomputation.

Current model:

- geometry/CV changes:
  rerun the pipeline and rebuild the base geometry/frame context

- appearance changes:
  do **not** rerun geometry
  invalidate only appearance caches

- resampling/output-scale changes:
  do **not** rerun geometry
  invalidate lazy frame caches

Preview now works lazily:

- `getBaseFrameCanvas(index)`
  extracts one base frame on demand from the rectified grid
- `getAdjustedFrameCanvas(index)`
  applies appearance adjustments lazily to one frame and caches it

This means:

- normal preview does **not** need all frames precomputed
- full frame realization happens mainly at GIF export time

### 10. GIF export

Export uses `gif.js` + `gif.worker.js`.

Export flow:

1. Materialize all adjusted frames.
2. Add them to `new GIF(...)`.
3. Encode in a worker.
4. Create a blob URL.
5. Show the actual GIF in the `Animation Preview` panel.
6. Download the GIF automatically with a friendly filename.

Filename format:

- `<sanitized_base>_anim_YYYYMMDD_HHMMSS_q<quality>.gif`

Example:

- `mySrcImage_anim_20260315_012237_q10.gif`

Sanitization:

- extension removed
- spaces and junk replaced with `_`
- only letters, numbers, `.`, `_`, `-` survive

## Important UI behavior

### Photo panel

Current text:

- `Drop a photo or scan here,`
- `or click to choose a file.`
- `Separate frames with small crosses.`
- `Page should be in landscape orientation.`

`Load Demo` button loads `demo/mySrcImage.jpg`.

### Layout panel

Current controls:

- `Frame Columns`
- `Frame Rows`
- `Paper Size (Landscape)`

Paper presets:

- Letter
- Legal
- Tabloid
- 9x12
- 18x12
- 24x18
- 36x24
- A4
- A3
- A2
- A1
- Custom

Only if preset is `Custom` are `Sheet Width` and `Sheet Height` shown.

Absolute units do not matter geometrically; they are mainly used for aspect ratio and the `*100` detection-warp heuristic.

### Detection & Alignment panel

Current controls:

- `Thresholding Method`
  - `Offset Peak`
  - `Otsu`
- `Thresholding Offset`
- `Search Inset Margin`
- `Boundary Threshold`
- `Boundary Persistence`
- `Cross Region Size`
- `Use cross-based subpixel alignment`

Current defaults / ranges:

- `Thresholding Offset`
  - default `-20`
  - range `-128..128`
- `Search Inset Margin`
  - default `80 px`
  - range `0..100`
- `Boundary Threshold`
  - default `8.0`
  - range `0..20`
  - step `0.1`
- `Boundary Persistence`
  - default `7`
  - range `1..15`
- `Cross Region Size`
  - slider range `18..110`
  - default slider value `52`
  - the displayed `px` value depends on current rectified geometry

Important note:

- `Use rectified as source` was removed from the UI
- code still supports it internally
- `readConfig()` currently hardwires `useRectifiedAsSource: false`

### Appearance panel

Current controls:

- `Brightness`
- `Contrast`
- `Vibrance`
- `Color Temperature`
- `Invert`
- `Resampling`
- `Reset`

Important:

- appearance controls use the lazy preview path
- there should not be a large full-frame recomputation on slider drag
- releasing appearance sliders should stay lazy as well

### Crop Output panel

Current controls:

- `Crop Left`
- `Crop Right`
- `Crop Top`
- `Crop Bottom`
- `Reset`

Cropping happens before `Output Scale`.

### GIF Export Options panel

Current controls:

- `Frame Rate`
- `Output Scale`
- `Encoding Quality (lower is better)`
- `Dithering`
- `Use Global Palette`

Important:

- `Output Scale` is applied after cropping
- preview shows the scaled animation, but panel presentation size does not change
- `Output Scale` label includes scaled dimensions like `1.00 (542×443)`

Current dithering labels:

- `Off`
- `Standard (Floyd-Steinberg)`
- `Smooth (Floyd-Steinberg Serpentine)` (default)
- `Retro (Atkinson)`

Current resampling control:

- lives under `Appearance`
- runtime options are populated in JS
- labels are user-friendly:
  - `Balanced (Linear)`
  - `Sharper (Cubic)`
  - `Maximum Detail (Lanczos)` if `cv.INTER_LANCZOS4` exists in the build

### Status panel

Current status includes lines such as:

- raw photo size
- paper threshold
- largest contour area as a percentage
- detection warp size
- extraction warp size
- rectified sheet size
- animation size
- frame source
- detector mode
- frame count
- cross alignment summary

Dimensions use the multiplication symbol `×`, not `x`.

### Main viewer panels

#### Raw Photo

- shows the raw source image
- header shows filename in parentheses
- overlays lime page contour
- drag-downloading is currently **enabled**

#### Rectified Sheet

- shows the **entire rectified page**, not just the cropped frame-grid region
- click toggles between:
  - normal rectified-page view
  - cross-kernel convolution diagnostic view
- overlay colors:
  - blue rectangle: `Search Inset Margin`
  - red quad: coarse frame-grid detection bounds
- drag-downloading is currently **disabled**

#### Cross Regions

- shows the ROI tiles used for cross inspection
- laid out as `(cols + 1) x (rows + 1)`
- no decorative frame around tiles
- intended to display at raw canvas size
- panel scrollbars are acceptable

#### Animation Preview

Behavior:

- before export: shows the live preview canvas
- after export: shows the actual exported GIF only
- if any relevant setting changes: exported GIF is revoked and hidden, live preview returns

Important special behavior:

- live preview canvas is **not** meant to be draggable as a downloadable asset
- if the user tries to drag it before exporting, the drag is cancelled and the `Export GIF` button does a ringing animation
- exported GIF image **is** draggable and uses the friendly filename

## Tooltip system

Tooltips are centralized in:

- `js/app.js`
  `const TOOLTIP_TEXT = { ... }`

Notes:

- tooltips are off by default
- `Enable Tooltips` / `Disable Tooltips` button lives in the Status header
- if a tooltip string is empty, no tooltip is shown
- the live animation preview canvas keeps its tooltip even when tooltips are globally disabled

The live preview tooltip text is:

- `This is a live animation preview. Click 'Export GIF' to generate the GIF.`

## Shared state structure

Defined in `js/dom-state.js`.

### `state.runtime`

- `cvReady`
- `tooltipsEnabled`
- `tooltipRegistry`

### `state.source`

- `image`
- `filename`
- `canvas`
- `rawPageContour`

### `state.geometry`

- `alignmentInfo`
- `baseRectifiedCanvas`
  rectified grid image used for frame extraction
- `baseRectifiedPageCanvas`
  full rectified page image used for preview
- `pagePreviewGridQuad`
  red overlay quad shown on full rectified page
- `frameCount`

### `state.frames`

- `base`
  lazy cache of extracted base frames
- `adjustedCache`
  lazy cache of appearance-adjusted frames

### `state.preview`

- `adjustedRectifiedCanvas`
- `rectifiedDiagnosticCanvas`
- `rectifiedCanvas`
- `showRectifiedDiagnostic`
- `frameIndex`
- `lastTime`
- `loopHandle`
- `resizeTimer`
- `exportButtonRingTimer`
- `appearancePreviewRaf`
- `appearancePreviewNeedsRectified`

### `state.processing`

- `timer`
- `active`
- `requestId`
- `pending`

### `state.export`

- `filename`
- `url`

## Important functions

### `js/pipeline.js`

Key exports:

- `runPipeline(...)`
- `estimateCrossRoiSidePx(...)`
- `buildCrossConvolutionCanvas(...)`
- `getCvInterpolationFlag(...)`
- `extractSingleFrameToCanvas(...)`

Important current helpers:

- `buildFrameGridRectification_fromCrosses(...)`
- `findFrameGridQuadFromCrosses(...)`
- `computeCrossActivityProfilesFromConvolution(...)`
- `findFirstRiseFromEdge(...)`
- `rectifyByQuad(...)`
- `buildCrossAlignmentData(...)`
- `buildUnrefinedCrossRegionInfo(...)`
- `refineAlignmentBoundsFromCornerCrosses(...)`
- `buildMarkerLookup(...)`

Known critical bug that was fixed:

- when switching to all-cross mode, `buildMarkerLookup()` used to overwrite detected corner crosses with empty anchor-dot placeholders because `anchorDots` was empty
- fix: only install corner anchors if `anchorDots.length >= 4`
- symptom before fix:
  - solid-color preview
  - very slow export
  - corrupted GIF

### `js/app.js`

Important controller functions:

- `init()`
- `attachUi()`
- `initializeTooltips()`
- `setTooltipsEnabled(...)`
- `readConfig()`
- `processCurrentImage(...)`
- `renderRawPreview()`
- `renderRectifiedPreview(...)`
- `renderCrossRoiGrid(...)`
- `getBaseFrameCanvas(...)`
- `getAdjustedFrameCanvas(...)`
- `drawCurrentGifPreview()`
- `exportGif()`
- `revokeGifUrl()`

### `js/appearance.js`

Key functions:

- `hasAppearanceAdjustments(...)`
- `applyVisualAdjustments(...)`
- `applyOklabAppearanceAdjustments(...)`
- `mapTemperatureSliderToMiredShift(...)`
- `makeTemperatureAdaptation(...)`
- `adaptSrgbTemperature(...)`

## GIF worker patch

`js/gif.worker.js` contains a local bug fix.

Problem:

- in serpentine dithering, the reverse-scan loop skipped `x = 0`
- result was an alternating corrupted leftmost pixel column in exported GIFs
- this was especially visible with `Smooth (Floyd-Steinberg Serpentine)`

Fix:

- reverse serpentine loop now includes `x = 0`

Do not casually remove this patch.

## Current drag behaviors

- Raw Photo:
  drag-download enabled
- Rectified Sheet:
  drag-download disabled
- Animation Preview live canvas:
  not really draggable; drag triggers Export-button attention animation
- Exported GIF image:
  draggable and named correctly

## Known sensitivities / likely future work

### 1. Coarse cross-only detector tuning

This is the newest and most likely area for future work.

Current detector depends on:

- `Search Inset Margin`
- `Boundary Threshold`
- `Boundary Persistence`
- the custom `crossKernel`

The current approach is intentionally simpler than the old circle detector:

- no peak refinement
- no gutter logic
- no special circle geometry

If it fails, inspect:

- `Rectified Sheet` convolution view
- blue inset
- red coarse quad
- `Cross Regions`
- demo reference files in `demo/`

### 2. Memory instrumentation

This has been discussed but not implemented yet.

Potential future work:

- track canvas/mat allocations and estimated pixel-buffer memory
- surface that in `Status`

### 3. LLM context drift

The code has moved substantially from the earlier tool:

- no p5
- no active circle detector in normal use
- no eager all-frame preview recomputation
- appearance and export behavior are now more sophisticated

If the code and this README disagree, trust the code first.

## Current defaults snapshot

At the time of this handoff, notable defaults are:

- demo frames: `5 x 4`
- paper preset: `Letter (11×8.5 in)`
- threshold method: `Offset Peak`
- threshold offset: `-20`
- search inset margin: `80 px`
- boundary threshold: `8.0`
- boundary persistence: `7`
- cross region size slider: `52`
- cross alignment: on
- brightness: `0`
- contrast: `0`
- vibrance: `0`
- color temperature: `0`
- invert: off
- output scale: `1.00`
- fps: `20`
- encoding quality: `10`
- dither: `Smooth (Floyd-Steinberg Serpentine)`
- global palette: off

## Practical advice for the next LLM

If you need to resume work quickly:

1. Read `js/pipeline.js` first, especially:
   - `runPipeline(...)`
   - `buildFrameGridRectification_fromCrosses(...)`
   - `findFrameGridQuadFromCrosses(...)`
2. Then read `js/app.js` around:
   - `readConfig()`
   - `processCurrentImage(...)`
   - `getBaseFrameCanvas(...)`
   - `getAdjustedFrameCanvas(...)`
   - `drawCurrentGifPreview()`
   - `exportGif()`
3. Then read `js/appearance.js` for the appearance stack.
4. Use the demo assets in `demo/` for debugging the convolution detector.

The most fragile conceptual boundary in the current app is:

- coarse page/grid detection in `pipeline.js`
  versus
- lazy preview/export realization in `app.js`

Keep those responsibilities separate if you make future changes.
