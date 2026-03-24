# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based desktop tool for building an animated GIF from a photo or scan of a plotted frame-sheet.

Typical flow:

1. Load a photo/scan.
2. Detect the paper quad in the raw image.
3. Rectify the page.
4. Detect the frame-grid region inside the page.
5. Detect/refine the `+` crosses.
6. Extract the frames.
7. Preview the animation live.
8. Export the GIF.

The current preferred sheet format is all-cross:

- complete `(cols + 1) x (rows + 1)` lattice of small dark `+` crosses
- outer frame-grid corners are also `+` crosses
- no special corner circles in the active path

Legacy circle-based code still exists in `js/pipeline.js` as `_old` helpers, but is not the active detector.

## Important directories

- `plottimation_webtool/`
  Current app.
- `plottimation_GIF_generator/`
  Older prototype.
- `grid-animation-svg-generator/`
  Generates frame-sheet artwork.

Useful assets in `plottimation_webtool/demo/`:

- `mySrcImage.jpg`
- `test_2_5x4.jpg`
- `convolved-rectified-sheet.png`
- `left-sweep.tsv`
- `profile.png`
- `debug.png`

## Current JS module layout

- `js/app.js`
  Main orchestrator. Still central, but slimmer than before.
  Owns:
  - high-level app startup
  - shared callbacks/glue between modules
  - config reading
  - status text updates
  - reset logic
  - rectified preview rendering
  - raw preview rendering
  - cross-region grid rendering
  - GIF export flow
  - frame extraction / appearance-cache glue

- `js/dom-state.js`
  DOM lookups and grouped shared state.

- `js/settings-defaults.js`
  Central source of truth for non-Layout defaults.
  Includes helpers:
  - `applyAppearanceDefaults(...)`
  - `applyCropGeometryDefaults(...)`
  - `applyNonLayoutDefaults(...)`

- `js/preview-controller.js`
  Animation-preview-specific behavior:
  - preview heading sync
  - preview play/pause button sync
  - ordered frame count/index mapping
  - RAF preview loop
  - drawing current preview frame
  - rerendering previews after resize/display-only changes

- `js/load-controller.js`
  Image-load flow:
  - busy spinner state
  - object-URL ownership for raw source
  - file ingestion
  - source image loading
  - yield-a-paint before heavy processing

- `js/drag-assets.js`
  Desktop drag/download behavior:
  - raw-photo drag asset hookup
  - rectified-sheet drag blob caching
  - exported GIF drag hookup
  - live-preview drag cue / export-button “ring” animation
  - rectified filename helper

- `js/ui-controls.js`
  DOM event wiring and tooltip plumbing:
  - `attachUi(...)`
  - tooltip registration
  - tooltip enable/disable
  - reset-button wiring

- `js/appearance.js`
  Appearance pipeline.

- `js/canvas-view.js`
  Canvas sizing/drawing helpers.

- `js/pipeline.js`
  CV pipeline and frame extraction.

- `js/gif.js`
  Main-thread GIF encoder API.

- `js/gif.worker.js`
  Worker encoder with a local patch for the serpentine-dithering left-edge bug.

- `js/opencv.js`
  Local OpenCV runtime.

## Shared state shape

In `js/dom-state.js`:

- `runtime`
  - `cvReady`
  - `tooltipsEnabled`
  - `busy`

- `source`
  - `image`
  - `filename`
  - `mimeType`
  - `dragUrl`
  - `ownedObjectUrl`
  - `canvas`
  - `rawPageContour`

- `geometry`
  - `alignmentInfo`
  - `baseRectifiedCanvas`
  - `baseRectifiedPageCanvas`
  - `pagePreviewGridQuad`
  - `frameCount`

- `frames`
  - `base`
  - `adjustedCache`

- `preview`
  - `adjustedRectifiedCanvas`
  - `rectifiedDiagnosticCanvas`
  - `rectifiedCanvas`
  - `rectifiedDragUrl`
  - `rectifiedDragBuildId`
  - `showRectifiedDiagnostic`
  - `frameIndex`
  - `lastTime`
  - `paused`
  - `loopHandle`
  - `resizeTimer`
  - `exportButtonRingTimer`
  - `appearancePreviewRaf`
  - `appearancePreviewNeedsRectified`

- `processing`
  - `timer`
  - `active`
  - `requestId`
  - `pending`

- `export`
  - `filename`
  - `url`

## Active CV pipeline

Implemented in `js/pipeline.js`.

### 1. Paper detection

Steps:

1. raw image -> grayscale
2. threshold using:
   - `Offset Peak`, or
   - `Otsu`
3. segment bright paper
4. largest external contour
5. approximate to 4 corners
6. order corners

The page quad is shown over `Raw Photo` in semi-transparent lime.

### 2. Page warps

Two page warps still exist:

- `Detection warp`
  fixed at `paperWidth * 100` by `paperHeight * 100`
- `Extraction warp`
  estimated from raw page-quad area

Status reports both.

### 3. Coarse frame-grid detection

Active detector is cross-only.

Current algorithm:

1. start with rectified full page
2. grayscale
3. inset by `Search Inset Margin`
4. convolve with unnormalized 25x25 `crossKernel`
5. clamp response to `[0,255]` after zeroing negatives
6. build 1D average row/column profiles
7. from each side, find first sustained run above:
   - `Boundary Threshold`
   - for `Boundary Persistence` pixels
8. use those threshold-crossing positions directly

Important:

- no peak refinement anymore
- no extra outward padding anymore
- old experimental grid-size auto-detection code was removed
- no `Detected grid: ...` line remains

### 4. Rectified Sheet panel

Shows the full rectified page, not the final cropped grid image.

Clicking it toggles:

- normal rectified-page view
- page-level cross-kernel convolution diagnostic view

Overlays:

- blue rectangle:
  `Search Inset Margin`
- red quadrilateral:
  coarse frame-grid bounds

### 5. Cross localization

After coarse rectification, the app samples square ROIs at expected lattice positions.

Modes:

- `Use cross-based subpixel alignment` checked:
  refine cross positions and use them
- unchecked:
  do not refine; still show ROIs centered on the nominal positions actually used

Alternate localizer:

- `Detect crosses with convolution`

Unchecked:

- thresholded ROI
- row/column profiles
- weighted peak localization

Checked:

- grayscale ROI
- convolve ROI with same 25x25 `crossKernel`
- `cv.BORDER_CONSTANT` so outside-ROI pixels are zero
- clamp response to `[0,255]`
- row/column profiles from positive response
- weighted peak localization

Acceptance logic is separate from localization.

Current max `darkFrac`:

- normal mode: `0.30`
- convolution mode: `0.50`

### 6. Cross Regions panel

Shows `(cols + 1) x (rows + 1)` ROI tiles.

Behavior:

- corner tiles included in all-cross mode
- when alignment is disabled, tiles remain visible but hover text is suppressed
- tiles render raw, no decorative rounded frame

Tooltip metrics when alignment is enabled:

- accepted/rejected
- `col`
- `row`
- `ink`
- in convolution mode also `conv`

Current `conv` tooltip metric:

1. grayscale ROI
2. zero-padded 25x25 convolution
3. clamp each convolved pixel to `[0,255]`
4. divide by `255`
5. average over ROI area

So `conv` is normalized to `0..1`.

### 7. Frame extraction

Quad-based and subpixel-aware.

Each frame uses four lattice points:

- refined cross if available
- nominal fallback if not

Extraction uses OpenCV perspective warp.

## Appearance pipeline

Implemented in `js/appearance.js`.

Order:

1. Brightness on OKLab `L`
2. Contrast S-curve on OKLab `L`
3. Vibrance on OKLab chroma
4. Color Temperature via Bradford chromatic adaptation after leaving OKLab
5. Unsharp Mask
6. Invert

Current UI controls:

- Brightness
- Contrast
- Vibrance
- Color Temperature
- Unsharp Mask Amount
- Unsharp Mask Radius
- Invert
- Resampling

Defaults are centralized in `js/settings-defaults.js`.

## Lazy preview / export architecture

### Geometry-affecting changes

Rerun the full pipeline:

- layout values
- thresholding and coarse detector controls
- alignment toggles and ROI sizing

### Frame-lazy changes

Do not rerun CV:

- crop values
- flip/rotate
- output scale
- resampling
- reverse order
- ping-pong

### Appearance-lazy changes

Do not rerun CV:

- brightness
- contrast
- vibrance
- temperature
- unsharp mask
- invert

Core frame helpers live in `app.js`:

- `getBaseFrameCanvas(index)`
- `getAdjustedFrameCanvas(index)`

Preview is lazy. Full realization mostly happens during GIF export.

## GIF export

Still orchestrated in `app.js`.

Export options:

- Frame Rate
- Reverse Order
- Ping-Pong (doubles file size)
- Output Scale
- Encoding Quality
- Dithering
- Use Global Palette

`Ping-Pong` sequence is:

- `1, 2, 3, 4, 5, 4, 3, 2`

Endpoints are intentionally not duplicated.

Preview and export both use the same ordered-frame logic from `js/preview-controller.js`.

Export button:

- shows progress like `Export GIF ...50%`

After export:

- panel title becomes `GIF Output`
- actual GIF is shown

After any relevant setting change:

- exported GIF is revoked
- live preview returns
- panel title becomes `Animation Preview`

## Current UI structure

### Non-collapsible sections

- Photo
- Status

### Collapsible sections

- Layout
- Page & Grid Detection
- Frame Alignment
- Appearance
- Crop & Geometry
- GIF Export Options

Accordion behavior:

- opening one closes the others

Loading a new image:

- closes all collapsible panels
- resets all non-Layout controls to defaults
- preserves Layout values

### Photo section

Buttons:

- `Load Demo 1` -> `demo/mySrcImage.jpg`
- `Load Demo 2` -> `demo/test_2_5x4.jpg`

Drop-zone text:

- `Drop a photo or scan here,`
- `or click to choose a file.`
- `Separate frames with small crosses.`
- `Page should be in landscape orientation.`

### Page & Grid Detection

- Thresholding Method
- Thresholding Offset
- Search Inset Margin
- Boundary Threshold
- Boundary Persistence

### Frame Alignment

- Cross Region Size
- Use cross-based subpixel alignment
- Detect crosses with convolution

### Crop & Geometry

- crop left/right/top/bottom
- Aspect Ratio readout
- Flip Horizontal
- Flip Vertical
- Rotate 90° CW

Aspect ratio readout:

- below crop fields
- 3 decimals
- includes dimensions
- respects rotation

### Animation Preview header

- play/pause button
- Export GIF button

Play/pause button uses:

- pause `⏸` while playing
- play `⏵` while paused

## Load behavior

Now largely owned by `js/load-controller.js`.

When loading a new image:

- busy spinners appear in `Status` and `Raw Photo`
- Status shows `Loading image…`
- raw header filename updates immediately
- all preview panels clear to striped empty states
- image is drawn to `Raw Photo` as soon as it loads
- then the app yields one paint before starting heavy processing

This was done to avoid the old “the app seems frozen” UX.

## Drag / download behavior

Now largely owned by `js/drag-assets.js`.

### Raw Photo

- draggable
- prefers original source URL/file when available
- therefore drag is fast and filename is the original one

### Rectified Sheet

- draggable
- has no original source file, so a cached PNG blob URL is built in advance
- dragging uses the cached blob instead of synchronous canvas encoding
- exported filename is source filename with `-rectified` inserted before extension

### Animation Preview live canvas

- not downloadable
- drag is cancelled
- Export GIF button performs a “ring” animation cue

### Exported GIF image

- draggable
- uses friendly sanitized GIF filename

## Tooltips

Tooltip strings still live in `TOOLTIP_TEXT` in `js/app.js`.

Registration and enable/disable plumbing now live in `js/ui-controls.js`.

Behavior:

- most controls/headings/buttons/panels have entries
- empty string means no tooltip
- global tooltips can be toggled
- exception:
  live preview canvas always keeps its tooltip

## Status panel

Status text is still composed in `js/pipeline.js` and written by `app.js`.

May include:

- raw photo size
- paper threshold
- largest contour area
- detection warp
- extraction warp
- rectified sheet size
- animation size
- frame source
- frames extracted `actual/expected`
- cross alignment summary

Notable current behavior:

- uses `×`, not `x`
- no `Grid detector: cross-only` line anymore
- page-detection failure wording is:
  `Unable to find page boundary. Try adjusting the Thresholding Offset and/or the Thresholding Method.`
- low-level detail is appended in parentheses

## Empty states

Striped empty states exist for:

- Raw Photo
- Rectified Sheet
- Cross Regions
- Animation Preview

On new image load:

- all four panels reset immediately to stripes

## Current defaults source

Defaults are now centralized in `js/settings-defaults.js`.

This is the first step toward making mobile-specific defaults or modes easier later.

Important defaults:

- Frame Columns: `5`
- Frame Rows: `4`
- Paper preset: `letter`

Detection:

- Threshold method: `offset-peak`
- Threshold offset: `-20`
- Search Inset Margin: `80`
- Boundary Threshold: `8.0`
- Boundary Persistence: `7`
- Cross ROI slider: `52`
- cross alignment: `true`
- convolution localization: `false`

Appearance:

- brightness/contrast/vibrance/temperature: `0`
- unsharp amount: `0`
- unsharp radius: `1.0`
- invert: `false`
- resampling: `linear`

Crop & Geometry:

- all crop values `0`
- all geometry toggles `false`

GIF export:

- fps: `20`
- reverse order: `false`
- ping-pong: `false`
- output scale: `1.00`
- quality: `10`
- dithering: `FloydSteinberg-serpentine`
- global palette: `false`

## Mobile-friendly roadmap

Still relevant.

Best next phases:

1. Responsive layout
   - collapse 2x2 workspace into 1-column on narrow screens
   - sidebar becomes top section

2. Touch-first UX
   - reduce hover dependence
   - larger touch targets
   - possibly hide diagnostics like Cross Regions by default

3. Performance guardrails
   - large-image warnings / optional downscaling
   - more explicit long-operation feedback
   - mobile-friendly export limits

4. Simplified control model
   - `Basic` vs `Advanced`
   - keep only essential controls visible by default on phones

The recent refactors were done specifically to support this direction:

- `settings-defaults.js`
- `preview-controller.js`
- `load-controller.js`
- `drag-assets.js`
- `ui-controls.js`

## Good next files to edit

- new CV behavior:
  `js/pipeline.js`
- appearance math:
  `js/appearance.js`
- preview behavior:
  `js/preview-controller.js`
- load behavior:
  `js/load-controller.js`
- drag/download behavior:
  `js/drag-assets.js`
- control wiring/tooltips:
  `js/ui-controls.js`
- defaults:
  `js/settings-defaults.js`
- remaining app orchestration:
  `js/app.js`

## Main caution areas

- `app.js` is smaller than before, but still central
- cache invalidation bugs remain easy to introduce
- `gif.worker.js` contains a local bugfix; do not casually replace it
- page-level cross-kernel convolution and ROI-level convolution are separate concepts
- old grid-size auto-detection experiments were intentionally removed
