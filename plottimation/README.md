# Plottimation Tool

This tool builds an animated GIF from a photo or scan of a plotted frame-sheet.<br/>
Version 1.06 • March 2026 • By Golan Levin

![plottimation_ui.png](doc/plottimation_ui.png)

## Quickstart

1. Open `https://golanlevin.github.io/plottimation/` in a browser.
2. Drag in a photo or scan of your plotted sheet, or click `Load Demo`.
3. Set `Frame Columns` and `Frame Rows` to match your layout.
4. Choose the correct paper size.
5. If needed: adjust detection, appearance, crop, or export settings.
6. Review the `Preview`.
7. Click `Export GIF` to generate and download your GIF animation.

---

## Preparing A Good Input Image

Your input photo or scan should:

- show the entire sheet of paper
- be surrounded by a darker background 
- contain a complete grid of small, dark, regularly-spaced `+` crosses separating the frames of your animation

Those small crosses are important. They define the frame grid and are used for alignment.

## An Example Output

![plottimation_ui.png](doc/mySrcImage_anim_20260315_103518_q10.gif)

---

## Detailed Documentation

### Layout

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

### Page & Grid Detection

Use `Page & Grid Detection` to help the app find the paper and the outer boundary of the frame grid.

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

### Automatic Frame Alignment

Use `Automatic Frame Alignment` to refine the frame corners using the small markers printed between frames.

- `Alignment Marker Type`
  Chooses the type of registration markers.
  - `Crosses`
    The currently supported mode.
  - `Dots (not yet supported)`
    Present in the UI, but not active in the current detector.
- `Alignment Marker Region Size`
  Sets the size of the square ROI used to inspect each alignment marker.
- `Do subpixel alignment using markers`
  When enabled, the app uses the detected markers to refine frame extraction beyond a purely nominal equal-spaced grid.
- `Detect crosses with convolution`
  When enabled, each marker ROI is localized using a convolution-based cross detector instead of the default profile-based method.

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

### Appearance

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

### Crop & Geometry

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

### Export Options

Use `Export Options` to control the size, timing, and encoding of the exported animation.

- `Output Width`
  Final export width in pixels.
- `Output Height`
  Final export height in pixels.

These two fields stay proportional:

- typing one updates the other
- values are clamped to `1...1999`

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

### Preview Header Buttons

The `Preview` panel header contains the export actions.

- `Play/Pause`
  Starts or stops the live preview animation.
- `Export ZIP`
  Downloads a ZIP archive containing:
  - PNG frames in a `frames/` folder
  - a settings text file
- `Export MP4`
  Downloads an H.264 MP4 when the current browser supports WebCodecs + MP4 muxing.
- `Export GIF`
  Generates and downloads an animated GIF.

The exported filename includes:

- the source image name
- a compact timestamp
- output dimensions
- quality for GIF/MP4

### Status

The `Status` panel reports the current state of the pipeline.

Typical messages include:

- image loading
- page analysis
- frame extraction counts
- export progress
- failure details

It also surfaces page-detection failures and other diagnostic information.

### Viewer Panels

The four main viewer panels are:

- `1. Raw Photo`
  Shows the source photo, with the detected page outline drawn in green.
- `2. Rectified Sheet`
  Shows the rectified page used for frame extraction, along with the current frame quad.
- `3. Frame Alignment Markers`
  Shows the marker ROI tiles used for frame alignment.
- `4. Preview`
  Shows the live animation preview, or `GIF Output` after a GIF has been exported.

Desktop notes:

- Clicking `Rectified Sheet` toggles the convolution diagnostic view.
- Dragging the `Raw Photo`, `Rectified Sheet`, or exported GIF can download those assets directly.

Mobile notes:

- the interface switches to a single-column layout with tabs for `Raw`, `Rectified`, `Markers`, and `Preview`
- some advanced controls are hidden
- the marker panel is read-only
- the `Status` panel moves to the bottom

### Sibling Settings Files

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
