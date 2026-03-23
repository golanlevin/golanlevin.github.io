# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based desktop tool for building an animated GIF from a photo or scan of a plotted frame-sheet.

Intended user workflow:

1. Load a photographed or scanned frame-sheet.
2. Detect the paper boundary in the raw image.
3. Rectify the page.
4. Detect the frame-grid region inside the page.
5. Detect and optionally refine the `+` registration crosses.
6. Extract each frame.
7. Preview the animation live in the browser.
8. Export an animated GIF.

This tool is the current browser successor to the older `plottimation_GIF_generator/` prototype.

## Current registration-mark assumption

The current preferred format is all-cross:

- the frame-sheet contains a full `(cols + 1) x (rows + 1)` lattice of small dark `+` crosses
- the four outer corners of the frame grid are also `+` crosses
- there are no special corner circles in the current preferred path
- regions outside the frame grid are expected to be mostly blank paper

Legacy circle-based code still exists in `js/pipeline.js` with `_old` helper names, but it is not the active detector path.

## Important directories

- `plottimation_webtool/`
  Current web app.
- `plottimation_GIF_generator/`
  Older proof-of-concept.
- `grid-animation-svg-generator/`
  Generates plotted frame-sheet artwork.

Useful demo/debug assets in `plottimation_webtool/demo/`:

- `mySrcImage.jpg`
  Main demo image in the current all-cross format.
- `convolved-rectified-sheet.png`
  Reference image for the page-level cross-kernel convolution view.
- `left-sweep.tsv`
  Historic debug profile data from coarse boundary detection work.
- `profile.png`
  ImageJ chart of the left-edge profile.
- `debug.png`
  Diagnostic screenshot of the rectified page plus overlays.

## File layout

- `index.html`
  App markup and DOM IDs.
- `style.css`
  Layout, typography, empty-state stripes, button animations, etc.
- `js/app.js`
  Main controller. UI wiring, config reading, cache invalidation, preview rendering, load/export flow, tooltip system.
- `js/dom-state.js`
  DOM references and grouped shared state.
- `js/appearance.js`
  Appearance processing.
- `js/canvas-view.js`
  Canvas sizing/drawing helpers.
- `js/pipeline.js`
  Vision pipeline and frame extraction.
- `js/gif.js`
  Main-thread GIF API.
- `js/gif.worker.js`
  Worker encoder. Contains a local fix for the serpentine-dithering left-edge bug.
- `js/opencv.js`
  Local OpenCV.js runtime.

## Architecture summary

The app is modularized, but still fairly stateful.

### `js/dom-state.js`

Shared state is grouped by concern:

- `runtime`
  OpenCV ready flag, tooltips enabled, busy flag.
- `source`
  Original image, filename, raw source canvas, detected raw page contour.
- `geometry`
  Alignment data, rectified canvases, preview grid quad, frame count.
- `frames`
  Lazy base-frame cache and adjusted-frame cache.
- `preview`
  Rectified diagnostic canvas, current frame index, animation timing, resize timers, paused state, etc.
- `processing`
  Request IDs, debounce timer, active/pending flags.
- `export`
  Exported GIF blob URL and filename.

### `js/app.js`

Owns:

- event listeners
- default/reset behavior
- reading config from DOM
- busy/loading UI
- preview rendering
- lazy frame extraction/appearance caching
- exported GIF lifecycle
- tooltips
- accordion behavior

### `js/pipeline.js`

Owns:

- paper detection
- page rectification
- active cross-only coarse frame-grid detection
- cross localization and acceptance logic
- alignment bounds refinement from corner crosses
- frame extraction

### `js/appearance.js`

Owns:

- Brightness in OKLab
- Contrast in OKLab
- Vibrance in OKLab
- Color Temperature via Bradford chromatic adaptation
- Unsharp Mask
- Invert

## High-level runtime pipeline

## 1. Image loading

User can:

- drag/drop a file
- choose a file
- click `Load Demo`

Current load behavior in `js/app.js`:

- all collapsible subpanels are closed
- all non-Layout settings are reset to defaults
- all preview panels are cleared to striped empty states
- the incoming filename is shown immediately in `Raw Photo`
- busy spinners appear in `Status` and `Raw Photo`
- status shows `Loading image…`
- after the image element loads, the raw image is drawn immediately
- then the app yields one browser paint before running the heavier pipeline

This was added to avoid the previous “the app appears hung for several seconds” UX.

## 2. Paper detection

Implemented in `runPipeline(...)` in `js/pipeline.js`.

Steps:

1. Convert raw image to grayscale.
2. Estimate threshold using:
   - `Offset Peak`, or
   - `Otsu`
3. Apply threshold to segment bright paper from darker surroundings.
4. Find the largest external contour.
5. Approximate to 4 corners.
6. Order corners.

The ordered page quad is drawn over `Raw Photo` in semi-transparent lime.

If later stages fail, partial debug results can still propagate back:

- raw page contour
- page-warp preview

so failure does not imply paper detection failed.

## 3. Page warps

Two page warps are still used:

- `Detection warp`
  fixed at `paperWidth * 100` by `paperHeight * 100`
- `Extraction warp`
  estimated from raw page-quad area to preserve more source detail

The status panel reports both sizes.

## 4. Coarse frame-grid detection (active path)

Current active detector is cross-only.

Current algorithm:

1. Start with the rectified full page.
2. Convert to grayscale.
3. Inset by `Search Inset Margin`.
4. Convolve with the custom 25x25 unnormalized `crossKernel`.
5. Clamp convolution response to `[0, 255]` after zeroing negatives.
6. Build 1D average profiles over columns and rows.
7. From left/right/top/bottom, find the first sustained run above:
   - `Boundary Threshold`
   - for `Boundary Persistence` pixels
8. Use those threshold-crossing positions directly.

Important:

- there is no peak-refinement step anymore
- there is no extra outward padding step anymore
- earlier experiments with grid-size auto-detection were removed
- no `Detected grid: ...` line is reported anymore
- no grid-dimension sweep console logging remains

## 5. Rectified page preview

The `Rectified Sheet` panel shows the full rectified page, not the final cropped frame-grid image.

Clicking the panel toggles between:

- normal rectified-page preview
- page-level cross-kernel convolution diagnostic view

Overlays on `Rectified Sheet`:

- blue rectangle:
  `Search Inset Margin`
- red quadrilateral:
  detected coarse frame-grid bounds

## 6. Cross localization

After coarse grid rectification, the app samples square cross ROIs at expected lattice locations.

Important modes:

- `Use cross-based subpixel alignment` checked:
  refine cross centers and use them for frame extraction
- unchecked:
  do not refine; show ROIs centered on the nominal lattice locations actually used

Alternate localizer:

- `Detect crosses with convolution` checkbox

When unchecked:

- thresholded ROI
- row/column profiles through the ROI
- weighted peak localization

When checked:

- grayscale ROI
- convolve ROI with same 25x25 `crossKernel`
- use `cv.BORDER_CONSTANT` so outside-ROI pixels are zero, not replicated
- clamp convolution response to `[0,255]`
- build row/column profiles from that positive response
- weighted peak localization on those profiles

Acceptance logic is still separate from localization.

Current acceptance metrics include:

- displacement from expected center
- `colContrast`
- `rowContrast`
- `darkFrac`

Current max `darkFrac`:

- normal mode: `0.30`
- convolution mode: `0.50`

This was loosened because thicker/darker crosses were being correctly localized but rejected for containing “too much dark ink”.

## 7. Cross Regions panel

`Cross Regions` shows `(cols + 1) x (rows + 1)` ROI tiles.

Current behavior:

- all-cross mode includes corner tiles too
- when alignment is disabled, tiles remain visible but hover text is suppressed
- tiles are displayed raw, without decorative rounded frames

Current tile tooltip content when alignment is enabled:

- accepted/rejected
- `col`
- `row`
- `ink`
- and, in convolution mode, `conv`

Current `conv` tooltip metric:

For a given ROI:

1. grayscale ROI
2. 25x25 zero-padded convolution
3. clamp each convolved pixel to `[0,255]`
4. divide each by `255`
5. average over the ROI area

So `conv` is now a normalized `0..1` score and is shown with 4 decimal places.

## 8. Alignment bounds refinement

In all-cross mode, after cross detection:

- `refineAlignmentBoundsFromCornerCrosses(...)`

shrinks/tightens the working bounds from the detected corner crosses.

This affects frame extraction geometry.

## 9. Frame extraction

Frame extraction is quad-based.

Each frame uses four lattice markers:

- refined detected cross if available
- fallback nominal grid point if not

Extraction uses full perspective warp in OpenCV.

## 10. Appearance pipeline

Current order in `js/appearance.js`:

1. Brightness on OKLab `L`
2. Contrast S-curve on OKLab `L`
3. Vibrance on OKLab chroma
4. Color Temperature via Bradford chromatic adaptation after returning from OKLab
5. Unsharp Mask
6. Invert

Important:

- appearance changes are lazy
- they do not rerun geometry/CV
- they only invalidate appearance caches

### Unsharp Mask

Current UI:

- `Unsharp Mask Amount`
- `Unsharp Mask Radius`

Defaults:

- Amount `0.0`
- Radius `1.0`

Range:

- Amount `0..500`
- Radius `0.1..100`

Implemented as a post-color-adjustment RGB unsharp mask using a blurred copy of the image.

## 11. Lazy preview architecture

Preview is intentionally lazy.

### Geometry-affecting controls

These rerun the full pipeline:

- paper detection settings
- cross alignment settings
- frame rows/cols
- paper size

### Frame-lazy controls

These invalidate extracted-frame caches but do not rerun CV:

- resampling
- crop values
- post-crop geometry transforms
- output scale
- reverse order

### Appearance-lazy controls

These invalidate appearance caches only:

- brightness
- contrast
- vibrance
- color temperature
- unsharp
- invert

Core lazy functions in `app.js`:

- `getBaseFrameCanvas(index)`
- `getAdjustedFrameCanvas(index)`

Full materialization of all adjusted frames happens only during GIF export.

## 12. Crop & Geometry

The old `Crop Output` panel is now `Crop & Geometry`.

Controls:

- Crop Left / Right / Top / Bottom
- Aspect Ratio readout
- Flip Horizontal
- Flip Vertical
- Rotate 90° CW

The `Aspect Ratio` readout:

- appears below crop fields
- shows 3 decimal places
- includes dimensions in parentheses
- reflects rotation when `Rotate 90° CW` is checked

Example:

- `Aspect Ratio: 1.214 (489×403)`

Transforms are applied after cropping and before output scaling.

## 13. GIF export and preview

Export uses `gif.js` + `gif.worker.js`.

Current export options:

- Frame Rate
- Reverse Order
- Output Scale
- Encoding Quality (lower is better)
- Dithering
- Use Global Palette

### Reverse Order

- affects both live preview and exported GIF

### Output Scale

- applied after crop + post-crop geometry
- affects preview and export
- preview panel size stays visually the same; the content is just scaled

### Dithering options

Current UI labels:

- `Off`
- `Standard (Floyd-Steinberg)`
- `Smooth (Floyd-Steinberg Serpentine)` default
- `Retro (Atkinson)`

### GIF worker patch

`js/gif.worker.js` contains a local fix for a bug in serpentine dithering where the reverse-row loop skipped `x = 0`, producing alternating black pixels in the leftmost column.

### Export button behavior

- button shows progress while encoding:
  `Export GIF ...50%`
- after export finishes:
  - actual GIF is shown in preview panel
  - panel title changes to `GIF Output`
- when any output-affecting setting changes:
  - exported GIF is revoked and hidden
  - live preview returns
  - panel title changes back to `Animation Preview`

### Animation Preview panel

Current header controls:

- play/pause button
- `Export GIF`

Play/pause button:

- uses Unicode:
  - pause `⏸` while playing
  - play `⏵` while paused
- only affects live preview playback

Live preview drag behavior:

- not downloadable
- drag attempt is cancelled
- `Export GIF` button performs a brief “ring” animation to direct the user

Exported GIF image:

- draggable
- uses friendly filename like `mySrcImage_anim_20260315_012237_q10.gif`

## 14. UI structure and defaults

### Subpanels

Collapsible panels:

- Layout
- Detection & Alignment
- Appearance
- Crop & Geometry
- GIF Export Options

Accordion behavior:

- opening one closes the others

New image load behavior:

- all collapsible panels are closed

### Non-Layout controls reset on new image load

Loading a new image now resets all non-Layout controls to startup defaults.

Layout is preserved:

- Frame Columns
- Frame Rows
- Paper Size / Custom dimensions

Everything else resets.

### Current important defaults

Detection & Alignment:

- Thresholding Method: `Offset Peak`
- Thresholding Offset: `-20`
- Search Inset Margin: `80`
- Boundary Threshold: `8.0`
- Boundary Persistence: `7`
- Cross Region Size slider: `52`
- Use cross-based subpixel alignment: `true`
- Detect crosses with convolution: `false`

Appearance:

- Brightness: `0`
- Contrast: `0`
- Vibrance: `0`
- Color Temperature: `0`
- Unsharp Mask Amount: `0`
- Unsharp Mask Radius: `1.0`
- Invert: `false`
- Resampling: `linear`

Crop & Geometry:

- all crop values `0`
- all geometry toggles `false`

GIF Export Options:

- Frame Rate: `20`
- Reverse Order: `false`
- Output Scale: `1.00`
- Encoding Quality: `10`
- Dithering: `FloydSteinberg-serpentine`
- Use Global Palette: `false`

## 15. Tooltips

Tooltips are centralized in `TOOLTIP_TEXT` in `js/app.js`.

Notes:

- most controls, headings, buttons, and preview surfaces have entries
- if a tooltip string is empty, no tooltip is shown
- tooltips can be globally enabled/disabled with the Status button
- exception:
  `gifPreviewCanvas` always keeps its tooltip, even if tooltips are globally disabled

## 16. Status panel

Status is built in `js/pipeline.js`.

Current status text may include:

- raw photo size
- paper threshold
- largest contour area
- detection warp size
- extraction warp size
- rectified sheet size
- animation size
- frame source
- frames extracted `actual/expected`
- cross alignment summary

Notable changes:

- sizes use `×`, not `x`
- `Grid detector: cross-only` was removed
- old generic error text was replaced with:
  `Unable to find page boundary. Try adjusting the Thresholding Offset and/or the Thresholding Method.`
- low-level error detail is appended in parentheses

## 17. Preview empty states

Preview panels use subtle diagonal stripes for empty states.

Panels affected:

- Raw Photo
- Rectified Sheet
- Cross Regions
- Animation Preview

Current behavior:

- before content is ready, show stripes
- when a new image begins loading, all panels are cleared back to stripes
- if a newly loaded image fails later in the pipeline, stale content is not left on screen

## 18. Raw Photo panel details

- filename appears in header immediately when load starts
- busy spinner appears in header while loading/processing
- drag-downloading of Raw Photo is enabled

## 19. Rectified Sheet details

- drag-downloading is disabled
- click toggles page/convolution view

## 20. Known preserved-but-not-primary code paths

Still in code, but not user-facing:

- old circle-based grid detector
- `useRectifiedAsSource` support in pipeline/config, hardwired to `false` in UI config

## 21. Recent UX improvements

Already implemented:

- busy spinner in `Status`
- busy spinner in `Raw Photo`
- raw image paints before heavy processing starts
- new-image load closes subpanels
- new-image load resets non-Layout settings
- new-image load clears stale previews immediately
- play/pause button in animation preview

## 22. Mobile-friendly roadmap

This app is still desktop-first. A future mobile adaptation should probably proceed in phases.

### Phase 1: Responsive layout

Goals:

- single-column layout on narrow screens
- stacked preview cards
- controls remain readable and tappable

Likely work:

- add breakpoints to `style.css`
- collapse `workspace` from 2x2 grid into 1-column stack on phones
- make sidebar become a top section instead of a left rail

### Phase 2: Touch-first UX

Goals:

- remove reliance on hover for essential understanding
- make upload the primary action
- avoid drag-based assumptions

Likely work:

- move critical guidance into inline text, not only tooltips
- make all buttons/sliders/toggles larger
- consider hiding advanced diagnostics like `Cross Regions` behind a toggle on small screens

### Phase 3: Performance guardrails

Mobile risk is mostly memory and CPU.

Likely work:

- warn on very large input images
- optionally auto-downscale preview/processing resolution on mobile
- reduce worker count or export defaults for mobile
- make long operations more explicit with visible progress UI

### Phase 4: Simplified control model

The desktop UI has many advanced controls.

Likely work:

- create `Basic` vs `Advanced` sections
- keep only essential controls visible by default on mobile:
  - upload
  - frame rows/cols
  - paper size
  - a few detection controls
  - export

### Desktop improvements that also help mobile

Already discussed as worthwhile:

- stronger inline guidance instead of hover-only guidance
- clearer processing/export states
- better large-image guardrails
- more disciplined grouping of advanced controls

## 23. Good next places to modify code

- new UI behavior:
  `js/app.js`
- new DOM/control:
  `index.html`, `js/dom-state.js`, `js/app.js`
- CV / page or cross detector:
  `js/pipeline.js`
- appearance processing:
  `js/appearance.js`
- preview layout / styling:
  `style.css`

## 24. Important caution areas

- `js/app.js` still owns many responsibilities, even after modularization
- cache invalidation bugs are easy to introduce
- `gif.worker.js` contains a local bugfix; do not replace casually
- page-level cross-kernel convolution and ROI-level convolution are separate concerns
- some older experimental code was intentionally removed; do not reintroduce row/column auto-detection without a deliberate decision
