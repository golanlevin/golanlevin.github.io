# Plottimation Web Tool: LLM Handoff

## Purpose

`plottimation_webtool/` is a browser-based tool for turning a photo or scan of a frame-sheet into:

- a live animated preview
- an exported animated GIF
- an exported H.264 MP4
- a ZIP of PNG frames plus settings
- a standalone settings text file

It now has a first-pass mobile layout in addition to the desktop interface:

- desktop keeps the original sidebar + four simultaneous viewer panels
- narrow screens switch to a single-column layout with one viewer tab visible at a time
- mobile intentionally hides or simplifies several advanced controls
- mobile marker inspection is currently read-only

## Active sheet format

The app now supports two alignment pipelines:

- `Markers`
  - intended for sheets whose frames are separated by explicit crosses or dots
  - uses ROI-based marker localization to refine the nominal frame lattice
- `Markerless`
  - intended for sheets whose frames are separated by empty gutters and do not use registration marks
  - estimates a straight frame lattice directly from the rectified sheet
  - still emits synthetic frame-corner intersections so the existing marker/corner editor can be reused

Within the `Markers` pipeline, the active CV path supports three alignment-marker modes:

- `Crosses`
  - the frame grid is refined from a complete `(cols + 1) x (rows + 1)` lattice of dark `+` markers
  - coarse frame-grid bounds are found from the cross-kernel convolution response on the rectified page
- `Dots`
  - the same nominal marker lattice is used, but each marker is a small filled dark dot
  - each ROI is Otsu-thresholded locally, the largest blob is chosen, and the marker center is the
    centroid of that blob’s white pixels
  - dot ROIs can self-recenter a few times toward an off-center blob while staying bounded near the
    nominal ROI location
- `Auto`
  - estimates whether the sheet uses crosses or dots by measuring median blob circularity across the
    nominal marker ROIs
  - current threshold: `medianCircularity >= 0.3` resolves to `Dots`

`Light-on-dark design` is now a first-class detection setting shared by both pipelines:

- in `Markers` mode:
  - the raw input is inverted only for the CV path
  - page detection, page-warp vision mats, and marker localization all run on that inverted source
  - styled rectified previews and extracted frames remain in the original colors
- in `Markerless` mode:
  - the darkness contribution inside the gutter metric is inverted so darker gutters are favored
    instead of lighter ones

Legacy `_old` helpers still exist in `js/pipeline.js` for reference, but the active detector path is
the markers system above plus the separate markerless branch.

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
- `js/vendor/opencv.js`
  Local OpenCV runtime.
- `js/vendor/gif.js`
  Local GIF encoder frontend.
- `js/vendor/gif.worker.js`
  Local GIF worker.
- `js/vendor/mp4-muxer.esm.js`
  Vendored MP4 muxer used with `WebCodecs` for offline MP4 export.

## Current JS module layout

All project-owned JS files now begin with a short responsibility block comment so future refactors
can identify module boundaries more quickly.

- `js/app.js`
  Main orchestrator. Owns:
  - startup
  - support probing
  - locale bootstrap
  - config reading
  - responsive desktop/mobile shell state
  - raw/rectified preview rendering
  - marker manual overrides
  - lightweight page-boundary preview while dragging `Thresholding Offset`
  - lazy frame and appearance cache glue
  - coordination across the narrower controller modules

- `js/dom-state.js`
  Shared DOM handles and grouped app state.

- `js/settings-defaults.js`
  Canonical startup/reset defaults for all non-Layout settings.

- `js/settings-io.js`
  Settings-file helpers:
  - sibling settings lookup
  - settings TSV parsing/application
  - settings TSV serialization
  - standalone settings filename generation

- `js/marker-editor.js`
  Frame Alignment Markers UI:
  - tile-grid rendering
  - reticle overlay drawing
  - pointer drag editing
  - double-click restore
  - marker tooltip text

- `js/status-controller.js`
  Status and non-preview heading helpers:
  - Status panel text
  - page-boundary warning state
  - `Page & Grid Detection` warning heading
  - `Raw Photo` warning heading state
  - `Rectified Sheet` heading text

- `js/export-controller.js`
  Export helpers:
  - GIF generation
  - WebCodecs + mp4-muxer MP4 generation
  - ZIP frame archive generation
  - export filename construction
  - standalone settings-file download
  - export-button label text and GIF URL cleanup

- `js/preview-controller.js`
  Preview-only behavior:
  - heading text sync
  - play/pause button state
  - frame ordering for reverse / boustrophedon / ping-pong playback
  - RAF preview loop
  - current preview draw

- `js/i18n.js`
  Locale dictionaries + helpers:
  - query-string locale override (`?lang=...`)
  - browser-language auto-detection
  - fallback to English for missing keys
  - translation of `data-i18n*` markup
  - localized tooltip lookup table

Responsive viewer behavior currently lives in `js/app.js` + `js/ui-controls.js`:
- desktop keeps all four large viewer panels visible
- narrow screens (`<= 960px`) switch to a single-column layout with viewer tabs
- mobile shows one of `Raw / Rectified / Markers / Preview` at a time
- mobile moves the collapsible control groups below the viewer and moves `Status` to the bottom
- `Frame Alignment Markers` is currently read-only on mobile; override buttons are hidden there
- mobile disables the Rectified Sheet convolution toggle
- mobile marker tiles are scaled to fit width instead of requiring scrollbars
- mobile control sections now use a horizontal tab strip (`Layout / Page / Markers / Filters / Crop / Export`)
  instead of stacked accordions

Debug/maintenance note:
- the old convolution debug view code is still present but currently unreachable in normal UI flow
- the dot-blob debug toggle code is also still present, but its button is permanently hidden
- both are candidates for future deletion if those diagnostics are not being brought back

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
  - `mobileSingleViewerMode`
  - `activeViewerTab`
  - `activeMobileControlTab`
  - `markerBlobDebugVisible`
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
  - `cvMat`
  - `grayMat`

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
   - `Triangle`
   - `Adaptive`
3. detect largest bright quad
4. order corners

The detected page quad is shown in the `Raw Photo` panel as a green outline.

Notes:
- `Adaptive` is not OpenCV’s stock `adaptiveThreshold(...)`. It estimates a slow illumination field
  by heavily downsampling, blurring, then upsampling a grayscale copy, and compares the original
  grayscale image against that pixelwise threshold field.
- while dragging `Thresholding Offset`, the app now runs only this lighter threshold + largest-quad
  pass and updates the `Raw Photo` overlay/warning state live

### 2. Page warps

There are two page warps:

- `Detection warp`
  - long edge fixed to about `1100 px`
  - used for stable coarse detection

- `Extraction warp`
  - estimated from detected page area
  - constrained by the paper aspect ratio
  - capped by:
    - `floor(0.90 * sqrt(sourceWidth^2 + sourceHeight^2))`

Important: paper size is now treated only as an aspect-ratio hint. It no longer directly sets extraction resolution.

### 3. Coarse frame-grid detection

Active method:

1. rectify the full page
2. convert to grayscale
3. convolve with the unnormalized 25x25 `crossKernel`
4. clamp convolution to `[0,255]`
5. perform 1D boundary sweeps from each side inside the `Search Inset Margin`

Markerless mode does not use this coarse cross-convolution boundary detector to locate the frame
grid. It branches earlier, immediately after page rectification.

### 3b. Markerless grid estimation

Markerless mode is implemented as a separate alignment branch, not a small variation of the marker
pipeline.

What it uses:

- the rectified sheet image
- `Frame Columns` / `Frame Rows`
- `Search Inset Margin`

What it does not use:

- `Boundary Threshold`
- `Boundary Persistence`

Implementation outline:

1. convert the rectified-sheet ROI to grayscale
2. downsample it to a manageable working size (long edge about `720 px`)
3. blur it lightly
4. estimate `pitchX` and `pitchY` from seeded horizontal/vertical autocorrelation
   - the seed period comes from the inset ROI:
     - `(rectifiedWidth - 2*searchInsetMargin) / nCols`
     - `(rectifiedHeight - 2*searchInsetMargin) / nRows`
5. build 1D gutter profiles from several cues
   - darkness
   - edge energy
   - local variance / texture
6. estimate the periodic phase of the lattice from those gutter profiles
7. allow modest replicate padding so the inferred outer frame boundaries may fall slightly outside
   the visible sheet when a page has been tightly trimmed
8. emit `(cols + 1) x (rows + 1)` synthetic frame-corner intersections

Important implementation detail:

- markerless mode returns its inferred corners in the same `markerLookup` / ROI-tile structure used
  by the marker pipeline
- this is why the app can reuse the existing `Frame Corners` / override UI instead of maintaining a
  second editing system
- the gutter support signal currently multiplies its enabled component cues rather than summing them
  - current default cues are:
    - darkness
    - edge / texture
    - local variance
  - the phase-support band width is currently fixed at `3 px` in the reduced blurred grayscale image

### 4. Marker localization

- `Crosses`
  - each ROI is Otsu-thresholded locally
  - center is estimated from weighted horizontal/vertical stroke profiles
  - optional convolution-based cross localization still exists behind `Detect crosses with convolution`
- `Dots`
  - each ROI is Otsu-thresholded locally with inversion
  - contours are traced, the largest blob is chosen, and the centroid is computed from blob pixels
  - if the centroid is far from ROI center, the ROI recenters toward it and retries
- `Auto`
  - measures median blob circularity first, reports it in Status, then resolves to `Crosses` or `Dots`

Markerless mode does not localize physical markers. Instead it synthesizes one corner position per
lattice intersection and builds grayscale diagnostic tiles centered on those inferred corners.

### 5. Markerless stabilization and post-extraction nudges

Markerless mode adds a second-stage extraction model after the autocorrelation lattice is estimated.

Stabilization:

- translation only
- no rotation / scale / shear / perspective correction
- the UI now exposes two markerless stabilization methods:
  - `Neighbor Comparison`
    - internal id: `pairwise-cyclic`
    - solves one regularized global offset field from a small graph of frame comparisons:
      - horizontal neighbors within each row
      - row-break neighbors between rows
      - vertical neighbors between rows
      - one weak loop seam from `N-1 -> 0`
  - `Average-Frame Comparison`
    - internal id: `difference-from-average`
    - builds one blurry grayscale average frame from all pre-stabilization sampled frames
    - aligns each frame independently against that shared reference
- both methods reuse the same sampled grayscale matcher:
  - comparisons run on reduced grayscale frames, not full-resolution outputs
  - matching is perimeter-weighted so border content contributes more than the animated center
- both methods zero-center their solved offsets and then clamp them before final extraction
- `Stabilization Rigidity` only affects `Neighbor Comparison`; it is not used by
  `Average-Frame Comparison`
- settings files now persist the selected method as:
  - `stabilization_method\tpairwise-cyclic`
  - or `stabilization_method\tdifference-from-average`

Markerless extraction adjustments currently stack in this order:

1. autocorrelation baseline
2. `Horizontal Phase Offset` / `Vertical Phase Offset`
3. `Vertical Drift Compensation`
4. solved stabilization translation
5. manual `Frame Corners` overrides

Important behavior:

- markerless `Frame Corners` overrides are post-stabilization extraction nudges
- they must not feed back into the stabilization solve

### 6. Frame extraction + preview

- extraction uses the resolved marker lookup, including dot centroids and manual overrides
- the `Rectified Sheet` panel now shows the extraction-space rectified canvas directly, so the green
  animated frame quad can be drawn in the same coordinate system without remapping distortions
- paused arrow-key stepping ignores reverse / boustrophedon / ping-pong ordering and instead inspects
  the physical frame grid directly

Markerless-specific notes:

- `Search Inset Margin` is visualized on `Rectified Sheet` as a blue ROI rectangle
- `Frame Corners` tiles display the currently shown corner positions after phase offset and
  stabilization have been applied
- markerless manual overrides affect only the local extracted frame geometry around the edited
  corner(s)
- the left-to-right gutter debug-chart code still exists in `js/app.js` / `js/pipeline.js` but is
  currently hidden from the UI and no longer toggled by keyboard

Marker-mode note:

- the lightweight `Thresholding Offset` preview in `js/app.js` mirrors the same light-on-dark
  inversion used by the full marker pipeline, so the Raw Photo page-boundary preview stays
  consistent while dragging detection controls

## Internationalization

- locales currently implemented:
  - `en`
  - `fr`
  - `es`
  - `it`
  - `ja`
  - `zh`
  - `zh-hant`
  - `ko`
  - `pt`
  - `de`
- locale selection order:
  1. query-string override, e.g. `?lang=fr`
  2. browser language (`navigator.languages` / `navigator.language`)
  3. fallback to English
- locale aliases currently handled:
  - `zh-TW`, `zh-HK`, `zh-MO` -> `zh-hant`
  - `pt-BR`, `pt-PT` -> `pt`
- practical query-string examples:
  - Simplified Chinese: `?lang=zh`
  - Traditional Chinese: `?lang=zh-hant`
  - Japanese: `?lang=ja`
  - Korean: `?lang=ko`
  - Portuguese: `?lang=pt`
  - German: `?lang=de`
- both static HTML strings and dynamic runtime strings now route through `js/i18n.js`
- tooltip text is also localized
- missing keys fall back to English rather than breaking the UI
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

The `Rectified Sheet` panel now shows the extraction-space rectified sheet directly.

Overlays:

- dark green quadrilateral for the currently previewed frame

The current-frame quad:

- updates during playback
- stays fixed when preview is paused
- updates live while marker overrides are being dragged

On mobile:

- the Rectified Sheet tab auto-sizes to the current sheet aspect ratio
- tapping does not toggle the convolution diagnostic view

Maintenance note:
- `Convolution Debug View` still exists in code as a stale retained diagnostic path, but there is
  currently no normal UI interaction that enables it

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

On mobile:

- the Preview tab auto-sizes to the current output aspect ratio
- the play/pause button is hidden

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

GIF export still uses local `js/vendor/gif.js` + `js/vendor/gif.worker.js`.

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

Desktop viewer panels:

- `1. Raw Photo`
- `2. Rectified Sheet`
- `3. Frame Alignment Markers`
- `4. Preview`

Markerless-mode UI differences:

- the `Alignment Pipeline` radio lives directly under the file target
- `Light-on-dark design` now lives at the top of `Page & Grid Detection` and is saved as
  `light_on_dark_design` in settings files
- the file target guidance changes from crosses/dots to empty gutters
- `Automatic Frame Alignment` is relabeled to `Stabilization`
- `Frame Alignment Markers` is relabeled to `Frame Alignment Centers` on desktop and `Centers` on mobile
- markerless mode hides:
  - `Alignment Marker Type`
  - `Boundary Threshold`
  - `Boundary Persistence`
- markerless mode shows:
  - `Stabilization Strength`
  - `Stabilization Rigidity`
  - `Horizontal Phase Offset`
  - `Vertical Phase Offset`
  - `Vertical Drift Compensation`
  - `Frame Corner Region Size`
- `Search Inset Margin` remains visible in markerless mode because it seeds the autocorrelation ROI

Mobile viewer tabs:

- `Raw`
- `Rectified`
- `Markers`
- `Preview`

`Layout` details:

- `Paper Orientation` switches preset labels and effective preset dimensions between landscape and portrait
- when `Paper Size` is `Custom`, the orientation radios are disabled
- paper size is used only as an aspect-ratio hint, not as a literal pixel-resolution request

Accordion behavior:

- collapsible panels behave accordion-style
- `Status` is independent and can stay open
- on mobile, the accordion panels are moved below the viewer inside a shared light panel
- on mobile, `Status` is moved to the bottom and forced open

On new image load:

- all collapsible panels are closed
- non-Layout settings reset to defaults
- preview panels clear to striped empty state
- `Frame Alignment Markers` also starts striped when empty, then switches to plain `rgb(243,244,246)` once marker tiles are present
- on mobile, the active viewer tab is reset to `Raw`

Failure cue:

- if page-boundary detection fails, the `Page & Grid Detection` heading becomes `Page & Grid Detection ⚠️`

## Empty-state / onboarding cues

Before first load:

- `Load Demo` and the drop zone are softly highlighted in pale yellow
- the drop zone has a subtle pulse

These cues disappear after the first successful image load.

## Current mobile pass

The current mobile interface includes:

- single-column layout
- viewer tabs instead of four simultaneous large panels
- auto-height `Raw`, `Rectified`, `Markers`, and `Preview` tabs
- simplified `Photo` copy:
  - `Choose a photo to begin,`
  - `or load a demo.`
- moved accordion controls below the viewer
- moved `Status` panel to the bottom
- a mobile-only note in the control stack:
  - `Note: use desktop version for advanced controls.`
- hidden advanced controls, including:
  - marker override buttons
  - play/pause
  - ZIP export
  - several advanced export controls
  - several advanced page/grid detection controls
  - some crop/alignment controls

The app is still desktop-first. Recommended next steps are:

1. Touch-first interaction cleanup
   - remove hover-only dependencies for essential actions
   - enlarge touch targets and polish the tab styling/spacing on real devices
   - treat desktop drag/export affordances in `drag-assets.js` as optional desktop-only behavior
   - provide tap-accessible alternatives for any preview/debug interactions that currently assume mouse hover or drag

2. Performance safeguards
   - optional preview downscaling on mobile
   - better warnings for very large sources / outputs
   - consider more aggressive caps or defaults for GIF/MP4 export on smaller devices
   - keep the low-res detection path fast, and avoid forcing full-size recomputation from purely UI-side changes

3. UI simplification
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

---

