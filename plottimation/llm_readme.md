# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based tool for turning a photo or scan of a plotted frame-sheet into:

- a live animated preview
- an exported animated GIF
- an exported H.264 MP4
- a ZIP of PNG frames plus settings
- a standalone settings text file

It is currently optimized for desktop browsers and is explicitly not yet mobile-friendly.

## Active sheet format

The active CV pipeline assumes an all-cross registration system:

- the frame grid is defined by a complete `(cols + 1) x (rows + 1)` lattice of small dark `+` markers
- the outer four grid corners are also `+` markers
- the coarse frame-grid bounds are found from the cross-kernel convolution response on the rectified page

There is UI groundwork for filled-dot markers (`Alignment Marker Type`), but `Dots` is disabled and not yet supported in the active pipeline.

Legacy circle-based code still exists in `js/pipeline.js` as `_old` helpers, but it is preserved only for reference and is not the current detector path.

## Main directories

- `plottimation_webtool/`
  Current app.
- `plottimation_webtool/demo/`
  Demo images, optional sibling settings files, and `index.json` manifest.
- `plottimation_webtool/js/`
  Main browser code.
- `plottimation_webtool/js/vendor/`
  Vendored third-party browser modules.

## Important demo/runtime assets

- `demo/index.json`
  Demo-image manifest for the `Load Demo` pulldown.
- `js/opencv.js`
  Local OpenCV runtime.
- `js/gif.js`
  Local GIF encoder frontend.
- `js/gif.worker.js`
  Local GIF worker.
- `js/vendor/mp4-muxer.esm.js`
  Vendored MP4 muxer used with `WebCodecs` for offline MP4 export.

## Current JS module layout

- `js/app.js`
  Main orchestrator. Owns:
  - startup
  - support probing
  - config reading
  - status updates
  - raw/rectified preview rendering
  - marker-grid rendering
  - marker manual overrides
  - settings import/export
  - GIF / MP4 / ZIP export flows
  - lazy frame and appearance cache glue

- `js/dom-state.js`
  Shared DOM handles and grouped app state.

- `js/settings-defaults.js`
  Canonical startup/reset defaults for all non-Layout settings.

- `js/preview-controller.js`
  Preview-only behavior:
  - heading text sync
  - play/pause button state
  - frame ordering for reverse/ping-pong
  - RAF preview loop
  - current preview draw

- `js/load-controller.js`
  Source loading:
  - file/demo image loading
  - busy spinner state
  - object URL ownership
  - paint-yield before heavy CV work
  - best-effort sibling settings loading

- `js/drag-assets.js`
  Desktop drag/export behavior:
  - drag raw photo
  - drag rectified sheet
  - drag exported GIF
  - preview drag cue animation

- `js/ui-controls.js`
  Event wiring, tooltips, reset buttons, and keyboard shortcuts.

- `js/appearance.js`
  Appearance pipeline:
  - OKLab brightness/contrast/vibrance
  - Bradford-style color temperature
  - unsharp mask
  - invert

- `js/pipeline.js`
  CV pipeline:
  - page detection
  - page warps
  - coarse frame-grid detection
  - marker localization
  - frame extraction

- `js/canvas-view.js`
  Canvas sizing and fit-rendering helpers.

- `js/zip-builder.js`
  Small local store-only ZIP writer.

## Shared state highlights

Defined in `js/dom-state.js`.

- `state.runtime`
  - `cvReady`
  - `tooltipsEnabled`
  - `busy`
  - `markerEditingEnabled`
  - `outputWidthPx`
  - `outputHeightPx`
  - `outputSizeAuto`
  - `outputSizeAnchor`
  - `mp4ExportSupported`
  - `mp4Codec`

- `state.source`
  - `image`
  - `filename`
  - `mimeType`
  - `dragUrl`
  - `ownedObjectUrl`
  - `canvas`
  - `rawPageContour`

- `state.geometry`
  - `alignmentInfo`
  - `baseRectifiedCanvas`
  - `baseRectifiedPageCanvas`
  - `pagePreviewGridQuad`
  - `frameCount`
  - `manualMarkerOverrides`

- `state.frames`
  - `base`
  - `adjustedCache`

- `state.preview`
  - `rectifiedDiagnosticCanvas`
  - `rectifiedDiagnosticSourceCanvas`
  - `rectifiedDiagnosticDirty`
  - `rectifiedCanvas`
  - `rectifiedDragUrl`
  - `showRectifiedDiagnostic`
  - `frameIndex`
  - `paused`
  - `loopHandle`
  - `appearancePreviewRaf`

- `state.export`
  - `filename`
  - `url`
  Only used for GIF output preview state; MP4 is exported directly as a download and does not replace the live preview panel.

## Active CV pipeline

Implemented in `js/pipeline.js`.

### 1. Paper detection

Steps:

1. raw image -> grayscale
2. threshold by:
   - `Offset Peak`, or
   - `Otsu`
3. detect largest bright quad
4. order corners

The detected page quad is shown in the `Raw Photo` panel as a green outline.

### 2. Page warps

There are two page warps:

- `Detection warp`
  - long edge fixed to about `1100 px`
  - used for stable coarse detection

- `Extraction warp`
  - estimated from detected page area
  - constrained by the paper aspect ratio
  - capped by:
    - `floor(0.75 * sqrt(sourceWidth^2 + sourceHeight^2))`

Important: paper size is now treated only as an aspect-ratio hint. It no longer directly sets extraction resolution.

### 3. Coarse frame-grid detection

Active method:

1. rectify the full page
2. convert to grayscale
3. convolve with the unnormalized 25x25 `crossKernel`
4. clamp convolution to `[0,255]`
5. perform 1D boundary sweeps from each side inside the `Search Inset Margin`
6. use `Boundary Threshold` + `Boundary Persistence` to detect first sustained rise

There is no later peak-refinement step for the outer boundary.

### 4. Marker localization

Within the frame-grid region, markers are refined in ROIs sized by `Alignment Marker Region Size`.

Supported localization modes for crosses:

- default profile-based localizer
- optional convolution-based localizer (`Detect crosses with convolution`)

Each marker stores:

- detected position
- acceptance state
- diagnostic metrics
- optional convolution score

### 5. Manual marker overrides

The `Frame Alignment Markers` panel supports manual overrides:

- `Enable Overrides`
- drag a marker tile to move its reticle
- overrides apply live during drag
- green reticle/border indicates manual override
- double-click a manually edited tile to restore the auto-detected position
- `Clear Edits` appears only when saved overrides exist

Overrides are stored in rectified-sheet coordinates in:

- `state.geometry.manualMarkerOverrides`

and they are serialized into settings files as:

- `marker_override_<col>_<row>\t<x>,<y>`

### 6. Frame extraction

Each frame is extracted lazily from the high-resolution rectified grid image.

Order of per-frame processing:

1. extract frame geometry from rectified sheet
2. crop
3. post-crop geometry
   - flip H
   - flip V
   - rotate 90 CW
4. output-size scaling
5. appearance adjustments (cached lazily)

## Rectified Sheet panel behavior

The `Rectified Sheet` panel shows the full rectified page, not just the cropped grid.

Overlays:

- blue inset rectangle for `Search Inset Margin`
- red quadrilateral for coarse detected frame-grid bounds
- dark green quadrilateral for the currently previewed frame

The current-frame quad:

- updates during playback
- stays fixed when preview is paused
- updates live while marker overrides are being dragged

Clicking the panel toggles between:

- normal rectified page view
- cross-kernel convolution diagnostic view

The convolution diagnostic canvas is cached so playback does not force repeated expensive recomputation.

## Preview behavior

Live panel title:

- `Preview`

After GIF export:

- heading changes to `GIF Output`
- actual exported GIF image is shown instead of the live preview canvas

Any settings change that invalidates the GIF returns the panel to the live preview.

Keyboard when paused:

- `Space`: play/pause
- `Left` / `Right`: previous / next frame
- `Up` / `Down`: jump by one row of frames

## Export options

Current export controls:

- `Output Width`
- `Output Height`
- `Frame Rate`
- `Loops in Export`
- `Reverse Order`
- `Ping-Pong`
- `Encoding Quality`
- `Resampling`
- `GIF Dithering`
- `Use Global Palette`
- `Save Settings file`

`Output Width` and `Output Height`:

- stay proportional
- clamp to `1..1999`
- reset to native 100% output size when `Export Options` reset is pressed

### Shared encoding-quality slider

The UI now has one slider:

- `Encoding Quality`
- range `1..100`

Interpretation:

- GIF:
  mapped internally onto gif.js `quality` in inverse `20..1` form
- MP4:
  used directly as the bitrate-driving quality parameter

## GIF export

GIF export still uses local `gif.js` + `gif.worker.js`.

Notes:

- exported GIF replaces the live preview in the panel
- tiny GIFs are displayed no smaller than `32 px` on their smallest dimension in-panel
- dragging the live preview instead of an exported GIF triggers a ring animation on `Export GIF`

## MP4 export

MP4 export now uses:

- `WebCodecs` `VideoEncoder`
- vendored `js/vendor/mp4-muxer.esm.js`

Notes:

- offline-capable; no CDN dependency remains
- H.264 codec selected by probing `VideoEncoder.isConfigSupported(...)`
- MP4 export stays disabled if unsupported, but the button remains visible
- unsupported-state tooltip always says:
  - `Not supported by this browser`
- minimum encoded MP4 size:
  - `16 x 16`
- dimensions are rounded to even numbers for H.264 friendliness
- keyframes are currently inserted every `2` frames

MP4 export does not replace the preview panel with a video element; it downloads directly.

## ZIP export

ZIP export downloads:

- `<archive-stem>.zip`

Archive layout:

- `<archive-stem>/`
- `<archive-stem>/frames/`
- `<archive-stem>/frames/<base>_anim_000.png`
- ...
- `<archive-stem>/<base>_settings.txt`

## Settings files

Standalone settings export:

- `<imagename>_settings.txt`

Load behavior:

- demo/server image loads: app tries to fetch sibling settings file automatically
- drag/drop of image + settings together: supported
- drag/drop of settings file onto an already loaded image: supported
- browser file picker for a lone local image cannot inspect arbitrary sibling files on disk

Reset behavior:

- resets always go back to built-in defaults
- not to any loaded settings file

## Current UI structure

Sidebar panels:

- `Photo`
- `Layout`
- `Page & Grid Detection`
- `Automatic Frame Alignment`
- `Appearance`
- `Crop & Geometry`
- `Export Options`
- `Status`

`Layout` details:

- `Paper Orientation` switches preset labels and effective preset dimensions between landscape and portrait
- when `Paper Size` is `Custom`, the orientation radios are disabled
- paper size is used only as an aspect-ratio hint, not as a literal pixel-resolution request

Accordion behavior:

- collapsible panels behave accordion-style
- `Status` is independent and can stay open

On new image load:

- all collapsible panels are closed
- non-Layout settings reset to defaults
- preview panels clear to striped empty state

## Empty-state / onboarding cues

Before first load:

- `Load Demo` and the drop zone are softly highlighted in pale yellow
- the drop zone has a subtle pulse

These cues disappear after the first successful image load.

## Mobile-friendly roadmap

The app is still desktop-first. The current recommended roadmap is:

1. Responsive layout
   - stack panels on narrow viewports
   - reduce simultaneous visible complexity
   - consider collapsing the right-side viewers into a single active panel on phones
   - keep `Photo` and `Status` easy to reach without long scrolling

2. Touch-first interaction cleanup
   - remove hover-only dependencies for essential actions
   - enlarge touch targets
   - treat desktop drag/export affordances in `drag-assets.js` as optional desktop-only behavior
   - provide tap-accessible alternatives for any preview/debug interactions that currently assume mouse hover or drag

3. Performance safeguards
   - optional preview downscaling on mobile
   - better warnings for very large sources / outputs
   - consider more aggressive caps or defaults for GIF/MP4 export on smaller devices
   - keep the low-res detection path fast, and avoid forcing full-size recomputation from purely UI-side changes

4. UI simplification
   - consider `Basic` vs `Advanced` control grouping
   - preserve the current module split so alternate mobile wiring can live mostly in `ui-controls.js`, `load-controller.js`, and CSS
   - avoid putting mobile-specific branching back into the core CV/export code unless absolutely necessary

The refactor into:

- `settings-defaults.js`
- `preview-controller.js`
- `load-controller.js`
- `drag-assets.js`
- `ui-controls.js`

was done partly to make this future work easier.

## Likely future work

- actual filled-dot marker support
- mobile-friendly layout and interaction model
- possible additional export formats such as Animated WebP or APNG
- further `app.js` decomposition if the orchestration layer grows much more
