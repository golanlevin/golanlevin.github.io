# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based desktop tool for turning a photo or scan of a plotted frame-sheet into:

- a live animation preview
- an exported animated GIF
- a ZIP archive of PNG frames plus settings

The current active workflow assumes an all-cross sheet format:

- the frame grid is delineated by a complete `(cols + 1) x (rows + 1)` lattice of small dark `+` markers
- the outer frame-grid corners are also `+` markers
- no special corner circles are used in the active path

There is now UI groundwork for an alternate filled-dot marker mode, but the active CV path is still cross-based. Legacy circle-based code also still exists in `js/pipeline.js` as `_old` helpers, but it is not the active detector.

## Important directories

- `plottimation_webtool/`
  Current app.
- `plottimation_GIF_generator/`
  Older prototype.
- `grid-animation-svg-generator/`
  Generates frame-sheet artwork.

Useful assets in `plottimation_webtool/demo/`:

- demo images are now listed through `demo/index.json`
- example current names include:
  - `1_dmawer.jpg`
  - `2_concentric.jpg`
  - `3_spinnyrect.jpg`
  - `grid_with_circles.jpg`
- some demo images have sibling settings files like:
  - `<imagename>_settings.txt`

## Current JS module layout

- `js/app.js`
  Main orchestrator and glue.
  Owns:
  - startup
  - config reading
  - current status text updates
  - rectified preview rendering
  - raw preview rendering
  - frame-alignment marker grid rendering
  - marker manual-override logic
  - settings import/export serialization
  - GIF export flow
  - ZIP export flow
  - lazy frame extraction / appearance-cache glue

- `js/dom-state.js`
  DOM lookups plus shared grouped state.

- `js/settings-defaults.js`
  Canonical defaults for all non-Layout settings.
  Includes:
  - `SETTINGS_DEFAULTS`
  - `applyAppearanceDefaults(...)`
  - `applyCropGeometryDefaults(...)`
  - `applyNonLayoutDefaults(...)`

- `js/preview-controller.js`
  Animation-preview-specific behavior:
  - preview heading sync
  - preview play/pause button sync
  - ordered frame count/index mapping
  - RAF animation loop
  - current preview frame draw
  - rerendering visible previews after resize

- `js/load-controller.js`
  Image-load flow:
  - busy spinner state
  - object-URL ownership for raw source
  - file ingestion
  - image load/reset flow
  - yield-a-paint before heavy processing
  - best-effort sibling settings file support

- `js/drag-assets.js`
  Desktop drag/download behavior:
  - raw-photo drag asset hookup
  - rectified-sheet drag blob caching
  - exported GIF drag hookup
  - live-preview drag cue / export-button ring animation
  - rectified filename helper

- `js/ui-controls.js`
  DOM event wiring and tooltip plumbing:
  - `attachUi(...)`
  - tooltip registration
  - tooltip enable/disable
  - reset-button wiring
  - keyboard arrow stepping while preview is paused

- `js/appearance.js`
  Appearance pipeline.

- `js/canvas-view.js`
  Canvas sizing/drawing helpers.

- `js/pipeline.js`
  CV pipeline and frame extraction.

- `js/zip-builder.js`
  Local store-only ZIP writer used for frame export.

- `js/gif.js`
  Main-thread GIF encoder API.

- `js/gif.worker.js`
  Worker encoder with a local patch for the serpentine-dithering left-edge bug.

- `js/opencv.js`
  Local OpenCV runtime.

## Shared state shape

Defined in `js/dom-state.js`.

- `runtime`
  - `cvReady`
  - `tooltipsEnabled`
  - `busy`
  - `markerEditingEnabled`
  - `lastMarkerClickKey`
  - `lastMarkerClickTime`

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
  - `manualMarkerOverrides`
    - `Map<string, {x:number, y:number}>`
    - key format is `"col,row"`

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

The detected page quad is shown over `Raw Photo` in semi-transparent lime.

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
- old experimental grid-size auto-detection code was intentionally removed
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

Important current behavior:

- `Rectified Sheet` is always shown from the unadjusted base rectified page
- Appearance controls do **not** recolor it

### 5. Marker localization

The current actual detector still localizes crosses.

After coarse rectification, the app samples square ROIs at expected lattice positions.

Modes:

- `Do subpixel alignment using markers` checked:
  refine marker positions and use them
- unchecked:
  do not refine; still show ROI tiles centered on the nominal positions actually used

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

### 6. Frame Alignment Markers panel

This used to be called `Cross Regions`.

Shows `(cols + 1) x (rows + 1)` ROI tiles.

Behavior:

- corner tiles included in all-cross mode
- when alignment is disabled, tiles remain visible but hover text is suppressed
- tile image and reticle are now separated:
  - `pipeline.js` returns the plain ROI image
  - `app.js` draws the overlay reticle in the UI layer

Tooltip metrics when alignment is enabled:

- accepted/rejected
- `col`
- `row`
- `ink`
- in convolution mode also `conv`
- if manually edited:
  - tooltip appends `manual override`

Current `conv` tooltip metric:

1. grayscale ROI
2. zero-padded 25x25 convolution
3. clamp each convolved pixel to `[0,255]`
4. divide by `255`
5. average over ROI area

So `conv` is normalized to `0..1`.

### 7. Manual marker editing

Implemented in `js/app.js` as a manual-override layer on top of auto-detection.

UI:

- `Enable Editing` / `Disable Editing` button in `Frame Alignment Markers`
- `Clear Edits` button appears only when saved marker overrides exist

Behavior:

- when editing is enabled, dragging inside a marker tile repositions its reticle
- marker overrides are stored in rectified-sheet coordinates
- edits update the live preview during mouse drag, not just on mouse-up
- edited markers are shown in green
- edited marker border is green
- double-clicking an edited marker tile restores it to the original auto-detected position
- `Clear Edits` restores all original auto-detected positions immediately from cached values

Persistence:

- manual edits are saved into standalone settings export
- manual edits are saved into ZIP `settings.txt`
- manual edits are loaded back from settings files
- edit mode itself is **not** saved

Implementation notes:

- original auto-detected positions are stashed as `autoDetectedX/Y`
- current overrides live in `state.geometry.manualMarkerOverrides`
- after a fresh pipeline run, overrides are re-applied to:
  - `alignmentInfo.markerLookup`
  - `alignmentInfo.crossRoiTileMap`
- if overrides are loaded from a settings file, the initial pre-sliced frames are discarded so lazy frame extraction uses the edited marker positions

### 8. Frame extraction

Quad-based and subpixel-aware.

Each frame uses four lattice points:

- refined marker if available
- nominal fallback if not
- manual override if present

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
- settings-file-driven changes to those fields

### Frame-lazy changes

Do not rerun CV:

- crop values
- flip/rotate
- output scale
- resampling
- reverse order
- ping-pong
- manual marker edits

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

Preview is lazy. Full realization mostly happens during GIF export and ZIP export.

## Export features

### GIF export

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

### ZIP export

Implemented in `app.js` using `js/zip-builder.js`.

Behavior:

- `Export ZIP` button in the preview header
- zip filename:
  - `<base>_anim_YYYYMMDD_HHMMSS.zip`
- root folder inside zip:
  - same timestamped archive stem
- contents:
  - `frames/`
  - `<base>_settings.txt`

Frame naming:

- `frames/<base>_anim_000.png`
- `frames/<base>_anim_001.png`
- etc.

ZIP export obeys:

- reverse order
- ping-pong

### Standalone settings export

Implemented in `app.js`.

Export Options panel has:

- `Save Settings file`

Filename:

- `<imagename>_settings.txt`

Contents are identical to the settings manifest included in ZIP export.

## Settings file behavior

Settings manifests are tab-separated:

- `setting<TAB>value`

Important behavior:

- loading an image resets non-Layout controls to built-in defaults first
- if a matching settings file is found, those settings are then applied
- pressing `Reset` always restores built-in defaults, **not** the loaded settings file values

Autoload behavior:

- URL/demo images:
  - app attempts to fetch sibling `<imagename>_settings.txt`
- dropped image plus sibling settings file in same drag payload:
  - settings file is applied
- dropped settings file onto already loaded image:
  - settings are applied and image is re-analyzed

Browser limitation:

- if the user chooses only one local image file from disk, the app cannot inspect the rest of that directory for sibling files unless the browser provides them

Status messages now distinguish:

- `Loaded image.`
- `Loaded settings file.`
- `Loaded image and settings.`

## Current UI structure

### Non-collapsible sections

- Photo
- Status

### Collapsible sections

- Layout
- Page & Grid Detection
- Automatic Frame Alignment
- Appearance
- Crop & Geometry
- Export Options

Accordion behavior:

- opening one closes the others

Loading a new image:

- closes all collapsible panels
- resets all non-Layout controls to defaults
- preserves Layout values

### Photo section

Uses a manifest-driven demo pulldown:

- `Load Demo`
- populated from `demo/index.json`

Important:

- the app no longer hardcodes demo filenames
- the browser app cannot reliably enumerate a folder directly, so `demo/index.json` is the source of truth for available demos
- parser is tolerant of:
  - strict JSON
  - JSON with trailing commas
  - newline-list style content

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

### Automatic Frame Alignment

- Alignment Marker Type:
  - Crosses
  - Dots
- Alignment Marker Region Size
- Do subpixel alignment using markers
- Detect crosses with convolution
  - shown only when `Crosses` is selected

Important note:

- UI groundwork exists for `Dots`, but actual CV localization/extraction is still cross-based in the active path

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
- Export ZIP button
- Export GIF button

Play/pause button uses:

- pause `⏸` while playing
- play `⏵` while paused

It is disabled whenever there are no valid extracted frames.

While paused:

- `Left Arrow` steps to previous frame
- `Right Arrow` steps to next frame
- stepping wraps around
- keyboard shortcuts are ignored while typing in text/select controls

## Load behavior

Largely owned by `js/load-controller.js`.

When loading a new image:

- busy spinners appear in `Status` and `Raw Photo`
- Status shows load-specific messages
- raw header filename updates immediately
- all preview panels clear to striped empty states
- image is drawn to `Raw Photo` as soon as it loads
- app yields one paint before starting heavy processing

This was done to avoid the old “app seems frozen” UX.

When loading settings onto an existing image:

- status shows `Loaded settings file.` and `Re-analyzing page…`
- busy spinner stays visible during re-analysis

## Drag / download behavior

Largely owned by `js/drag-assets.js`.

### Raw Photo

- draggable
- prefers original source URL/file when available
- drag is fast and filename is the original one
- Raw Photo header filename is shown in monospace

### Rectified Sheet

- draggable
- has no original source file, so a cached PNG blob URL is built in advance
- dragging uses the cached blob instead of synchronous canvas encoding
- exported filename is source filename with `-rectified` inserted before extension

### Animation Preview live canvas

- not downloadable
- drag is cancelled
- Export GIF button performs a ring animation cue
- live preview canvas always has its own tooltip regardless of global tooltip toggle

### Exported GIF image

- draggable
- uses friendly sanitized GIF filename

## Tooltips

Tooltip strings still live in `TOOLTIP_TEXT` in `js/app.js`.

Registration and enable/disable plumbing live in `js/ui-controls.js`.

Behavior:

- most controls/headings/buttons/panels have entries
- empty string means no tooltip
- global tooltips can be toggled
- exception:
  live preview canvas always keeps its tooltip

## Status panel

Status text is composed in `js/pipeline.js` and written by `app.js`.

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
  - `Unable to find page boundary. Try adjusting the Thresholding Offset and/or the Thresholding Method.`
- low-level detail is appended in parentheses

## Empty states

Striped empty states exist for:

- Raw Photo
- Rectified Sheet
- Frame Alignment Markers
- Animation Preview

On new image load:

- all four panels reset immediately to stripes

## Current defaults source

Defaults are centralized in `js/settings-defaults.js`.

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
- alignment marker type: `crosses`
- alignment marker region size slider: `52`
- marker alignment: `true`
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

Export:

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
   - collapse the multi-panel workspace into a single-column stack on narrow screens
   - sidebar becomes top section

2. Touch-first UX
   - reduce hover dependence
   - larger touch targets
   - possibly hide diagnostics like Frame Alignment Markers by default

3. Performance guardrails
   - large-image warnings / optional downscaling
   - more explicit long-operation feedback
   - mobile-friendly export limits

4. Simplified control model
   - `Basic` vs `Advanced`
   - keep only essential controls visible by default on phones

The recent refactors were specifically done to support this direction:

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
- control wiring/tooltips/keyboard:
  `js/ui-controls.js`
- defaults:
  `js/settings-defaults.js`
- remaining app orchestration and marker editing:
  `js/app.js`

## Main caution areas

- `app.js` is still central and stateful
- cache invalidation bugs are easy to introduce
- `gif.worker.js` contains a local bugfix; do not casually replace it
- page-level cross-kernel convolution and ROI-level convolution are separate concepts
- `Dots` UI exists, but the active automatic detector is still cross-based
- demo loading now depends on `demo/index.json`; changing demo assets without updating that manifest will confuse the UI
