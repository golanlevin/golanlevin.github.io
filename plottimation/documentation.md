# Plottimation Documentation

![plottimation_overview.jpg](doc/plottimation_overview.jpg)

**Contents**: 

* [Layout](#layout)
* [Page & Grid Detection](#page--grid-detection)
* [Automatic Frame Alignment](#automatic-frame-alignment)
* [Appearance](#appearance)
* [Crop & Geometry](#crop--geometry)
* [Export Options](#export-options)
* [Preview Panel Header Buttons](#preview-panel-header-buttons)
* [Status](#status)
* [Viewer Panels](#viewer-panels)
* [Sibling Settings Files](#sibling-settings-files)
* [Language Selection](#language-selection)

---

## Layout

Use `Layout` to tell the app how your frame-sheet is organized.

- `Frame Columns`
  Number of animation frames across the sheet.
- `Frame Rows`
  Number of animation frames down the sheet.
- `Paper Orientation`
  Choose `Landscape` or `Portrait`. This changes the displayed width/height order of the paper presets and the effective aspect ratio used by the page warp.
- `Paper Size`
  Select a preset paper format such as `Letter`, `Tabloid`, or `A4`.
- `Custom`
  If `Paper Size` is set to `Custom`, the `Sheet Width` and `Sheet Height` fields appear.
- `Sheet Width`
  Custom paper width, used only as an aspect-ratio hint.
- `Sheet Height`
  Custom paper height, used only as an aspect-ratio hint.

Notes:

- Paper size is not treated as a literal pixel resolution request.
- It is used to guide the aspect ratio of the rectified page.
- `Frame Columns` and `Frame Rows` are clamped to `1...20`.

---

## Page & Grid Detection

Use `Page & Grid Detection` to help the app find the paper and the outer boundary of the frame grid.

- `Light-on-dark design`
  Use this when the artwork is made with light ink on dark paper. In `Markers` mode, the app
  internally inverts the raw photo for page finding and marker localization while keeping the
  displayed rectified sheet and extracted frames in their original colors. In `Markerless` mode,
  the same checkbox flips the darkness cue so darker gutters are favored instead of lighter ones.
- `Thresholding Method`
  Chooses how the grayscale photo is thresholded for page detection.
  - `Offset Peak`
    Uses a simple histogram-peak-based threshold.
  - `Otsu`
    Uses OpenCV's Otsu global threshold.
  - `Triangle`
    Uses OpenCV's Triangle global threshold.
- `Thresholding Offset`
  Nudges the chosen threshold darker or lighter after thresholding. This is often the first setting to try if page detection fails.
- `Search Inset Margin`
  Insets the coarse boundary search away from the page edge to avoid warped borders and background bleed.
- `Boundary Threshold`
  Sets how strong the boundary signal must be before the grid edge is accepted.
- `Boundary Persistence`
  Sets how many consecutive pixels must remain above the threshold before that boundary is trusted.

If the app cannot detect the page correctly, the `Status` panel will show:

`Unable to find page boundary. Try adjusting the Thresholding Offset or other Page & Grid Detection settings.`

and the `Page & Grid Detection` header will display a warning mark.

---

## Automatic Frame Alignment

Plottimation now supports two different alignment pipelines:

- `Markers (crosses, dots)`
  Uses printed registration markers between frames.
- `Markerless (gutters, frames)`
  Estimates the frame grid without registration markers, using the spacing and gutters between frames.

Use `Alignment Pipeline` to choose between these modes.

### Markers Pipeline

In `Markers` mode, `Automatic Frame Alignment` refines the frame corners using the printed registration markers.

This mode assumes the frames are separated by crosses or dots. If those markers are printed as
light ink on dark paper, enable `Light-on-dark design` under `Page & Grid Detection`.

- `Alignment Marker Type`
  Chooses the type of registration markers.
  - `Auto`
    Tries to determine whether the sheet uses crosses or dots.
  - `Crosses`
    Uses cross-shaped markers.
  - `Dots`
    Uses dot-shaped markers.
- `Alignment Marker Region Size`
  Sets the size of the square ROI used to inspect each alignment marker.
- `Do subpixel alignment using markers`
  When enabled, the app uses the detected markers to refine frame extraction beyond a purely nominal equal-spaced grid.
- `Detect crosses with convolution`
  When enabled, each cross-marker ROI is localized using a convolution-based detector instead of the default profile-based method.

The `Frame Alignment Markers` viewer shows the marker ROIs used for this step. Each tile can display:

- whether that marker was accepted or rejected
- contrast metrics
- ink fraction
- convolution score when convolution mode is enabled

Manual overrides are also available on desktop:

- `Enable Overrides`
  Turns on interactive marker editing.
- drag a marker tile
  Repositions that marker's reticle and updates affected frames live.
- double-click an edited marker
  Restores it to the originally detected location.
- `Clear Edits`
  Removes all saved marker overrides.

Override edits are saved into exported settings files.

### Markerless Pipeline

In `Markerless` mode, the same control area is renamed `Stabilization`.

This mode assumes:

- the sheet has no registration markers
- frames are arranged on a straight grid
- neighboring frames are separated by visible empty gutters

The markerless pipeline estimates a nominal grid automatically, then lets you refine it with post-estimation controls:

- `Search Inset Margin`
  In markerless mode, this also defines the inset ROI used to seed the autocorrelation search. Large empty page margins can confuse pitch estimation, so increasing this value can help the app ignore blank borders.
- `Stabilization Method`
  Chooses between the two translation-only stabilization strategies:
  - `Neighbor Comparison`
    Compares frames against neighboring frames in the sheet/loop and solves one weighted global offset field.
  - `Average-Frame Comparison`
    Compares each frame independently against a single blurry average frame built from the whole animation.
- `Stabilization Strength`
  Applies more or less of the solved translation correction after extraction. This now ranges from `0%` to `150%`, so values above `100%` deliberately overshoot the solved correction.
- `Stabilization Rigidity`
  Controls how resistant the neighbor-comparison solver is to large per-frame corrections. This control is inactive when `Average-Frame Comparison` is selected.
- `Horizontal Phase Offset`
  Shifts the extracted grid left or right relative to the automatically estimated phase.
- `Vertical Phase Offset`
  Shifts the extracted grid up or down relative to the automatically estimated phase.
- `Vertical Drift Compensation`
  Applies a post-stabilization vertical correction distributed smoothly over the full animation to counter slow top-to-bottom drift.
- `Frame Corner Region Size`
  Sets the size of the square tiles shown in the corner editor. This does not change the extracted frame size.

In markerless mode:

- `Boundary Threshold` and `Boundary Persistence` are hidden
- the `Rectified Sheet` shows a blue inset rectangle for the current markerless search ROI
- panel `3` is renamed `Frame Alignment Centers` on desktop and `Corners` on mobile
- the mobile `Markers` control tab is renamed `Stabilize`

The `Frame Alignment Centers` viewer shows the current corner locations used for extraction. In markerless mode, these are the stabilized corner positions, not raw marker detections.

Desktop markerless editing:

- `Enable Overrides`
  Turns on interactive corner editing.
- drag a corner tile
  Applies a post-stabilization extraction nudge at that corner.
- double-click an edited corner
  Restores it to the current automatic location.
- `Clear Edits`
  Removes all saved corner overrides.

Markerless overrides are post-stabilization nudges, so they do not feed back into the stabilization solve itself.

Technical summary:

- markerless pitch is estimated from a reduced blurred grayscale version of the rectified sheet
- phase is estimated from a gutter-support metric built from:
  - darkness
  - texture / edge energy
  - variance
- the gutter-support cues are currently combined multiplicatively, which helps emphasize positions where all cues agree on a likely gutter
- stabilization remains translation-only throughout; no rotation, scale, shear, or perspective correction is applied

---

## Appearance

Use `Appearance` to adjust the look of the extracted animation frames after geometry is settled.

- `Brightness`
  Raises or lowers perceptual lightness.
- `Contrast`
  Expands or compresses tonal contrast around the midpoint.
- `Vibrance`
  Boosts muted colors more than already-saturated colors.
- `Color Temperature`
  Shifts the image cooler or warmer.
- `Unsharp Mask Amount`
  Controls how strongly the sharpening effect is applied.
- `Unsharp Mask Radius`
  Controls the blur radius used by the unsharp mask.
- `Invert`
  Inverts the final extracted animation like a negative.
- `Reset`
  Restores all Appearance settings to defaults.

These settings affect:

- the live `Preview`
- exported GIFs
- exported MP4s
- exported ZIP frames

They do not recolor the `Rectified Sheet`, which remains a geometry/debug view.


---

## Crop & Geometry

Use `Crop & Geometry` to trim the extracted frame and apply simple post-crop transforms.

- `Crop Left`
  Removes pixels from the left side of each frame.
- `Crop Right`
  Removes pixels from the right side of each frame.
- `Crop Top`
  Removes pixels from the top of each frame.
- `Crop Bottom`
  Removes pixels from the bottom of each frame.
- `Aspect Ratio`
  Read-only display showing the current post-crop aspect ratio and pixel dimensions.
- `Flip Horizontal`
  Mirrors the output frames left-to-right.
- `Flip Vertical`
  Mirrors the output frames top-to-bottom.
- `Rotate 90° CW`
  Rotates the output frames clockwise.
- `Reset`
  Restores all crop and geometry settings to defaults.

Cropping and geometry changes affect preview and all export formats.

---

## Export Options

Use `Export Options` to control the size, timing, and encoding of the exported animation.

- `Output Width`
  Final export width in pixels.
- `Output Height`
  Final export height in pixels.
- These two fields stay proportional:
  - typing one updates the other
  - values are clamped to `1...1999`

Furthermore: 

- `Frame Rate`
  Playback rate for preview and exported animation files.
- `Loops in Export`
  Repeats the frame sequence in exported files only. It does not change the live preview.
- `Reverse Order`
  Reverses frame order in exported files.
- `Ping-Pong (doubles file size)`
  Exports the sequence forward and backward without duplicating the turnaround endpoints.
- `Encoding Quality`
  Shared `1...100` quality control.
  - for GIF export, this is mapped internally onto gif.js's inverse quality scale
  - for MP4 export, it drives the H.264 bitrate
- `Resampling`
  Chooses the interpolation method used during extraction and output resizing.
  Available options may include:
  - `Linear`
  - `Cubic`
  - `Maximum Detail (Lanczos)` when supported by the OpenCV build
  - `Strong Reduction (Area)`
  - `Pixelated (Nearest Neighbor)`
- `GIF Dithering`
  Chooses the dithering algorithm used during GIF color quantization.
- `Use Global Palette`
  Forces the GIF encoder to use one palette for all frames.
- `Save Settings file`
  Downloads a standalone settings text file.
- `Reset`
  Restores Export Options to defaults and returns output size to the native extracted frame size.
  
---

## Preview Panel Header Buttons

The `Preview & Export` panel header contains the export actions.

- `Play/Pause`
  Starts or stops the live preview animation.
- `↓ZIP`
  Downloads a ZIP archive containing:
  - PNG frames in a `frames/` folder
  - a settings text file
- `↓MP4`
  Downloads an H.264 MP4 when the current browser supports WebCodecs + MP4 muxing.
- `↓GIF`
  Generates and downloads an animated GIF.

The exported filename includes:

- the source image name
- a compact timestamp
- output dimensions
- quality for GIF/MP4

---

## Status

The `Status` panel reports the current state of the pipeline.

Typical messages include:

- image loading
- page analysis
- frame extraction counts
- export progress
- failure details

It also surfaces page-detection failures and other diagnostic information.

The `Enable Tooltips` / `Disable Tooltips` button in the panel header toggles explanatory tooltips for the interface, including pipeline-specific controls in both `Markers` and `Markerless` modes.


---

## Viewer Panels

The four main viewer panels are:

- `1. Raw Photo`
  Shows the source photo, with the detected page outline drawn in green.
- `2. Rectified Sheet`
  Shows the rectified page used for frame extraction, along with the current frame quad.
- `3. Frame Alignment Markers` or `3. Frame Corners`
  In `Markers` mode, this panel shows the marker ROI tiles used for frame alignment.
  In `Markerless` mode, it shows the extracted corner tiles used for corner nudging.
- `4. Preview & Export`
  Shows the live animation preview and the export controls.

Desktop notes:

- Clicking `Rectified Sheet` toggles the convolution diagnostic view.
- Dragging the `Raw Photo`, `Rectified Sheet`, or exported GIF can download those assets directly.

Mobile notes:

- the interface switches to a single-column layout with tabs for `Raw`, `Rectified`, `Markers`/`Corners`, and `Preview`
- in markerless mode, the third mobile control tab is renamed `Stabilize`
- some advanced controls are hidden
- the marker panel is read-only
- the `Status` panel moves to the bottom

---

## Sibling Settings Files

Plottimation can save and reload a companion settings file for a source image.

The filename format is:

- `<imagename>_settings.txt`

For example:

- `myDrawing.jpg`
- `myDrawing_settings.txt`

These settings files store the current UI state, including:

- layout choices
- detection settings
- appearance settings
- crop/export settings
- any manual marker overrides

How they are used:

- when a demo or URL-based image is loaded, the app will try to load a sibling settings file automatically
- if you drag an image and its matching settings file together, both will be loaded
- if you drag a settings file onto an already loaded image, it will override the current settings for that image
- `Save Settings file` downloads the same tab-separated settings manifest used inside ZIP export

Important:

- pressing `Reset` restores built-in defaults, not values from a loaded settings file
- if you choose a lone local image file from the browser file picker, the browser does not let the app inspect the rest of that directory automatically, so a sibling settings file may need to be provided separately

---

## Language Selection

The app supports automatic localization.

- By default, it uses the language preferences reported by your browser.
- If the browser prefers a supported language, the interface will switch automatically.
- If no supported language is detected, the app falls back to English.

You can also force a specific language with the page URL:

- `?lang=en` for English
- `?lang=fr` for French
- `?lang=es` for Spanish
- `?lang=it` for Italian
- `?lang=ja` for Japanese
- `?lang=zh` for Simplified Chinese
- `?lang=zh-hant` for Traditional Chinese
- `?lang=ko` for Korean
- `?lang=pt` for Portuguese
- `?lang=de` for German
- `?lang=pl` for Polish
- `?lang=nb` for Norwegian Bokmal
- `?lang=uk` for Ukrainian

The `?lang=` query parameter overrides browser-language detection.

Examples:

- `.../plottimation_webtool/?lang=en`
- `.../plottimation_webtool/?lang=fr`

---
