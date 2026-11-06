# De-Perspectivizer

Automatic realtime webcam perspective correction. By Golan Levin (2026), based on [*ofxCorrectPerspective* by Haris Usmani](https://harisusmani.com/ofxcp/) (2014) and [*Shape from Angle Regularity*](assets/zaheer.pdf) by Zaheer et al (2012). 

---

## Run

From the repository root:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory web
```

Open **http://127.0.0.1:8080/** in Chrome. The app immediately requests the browser's default camera. Allow Chrome's camera prompt if shown. If the camera cannot be opened, the app shows the building facade instead. Stop the server with Ctrl-C.

The only third-party JavaScript library is p5.js 2.3.4, included locally:

```html
<script src="src/p5.js"></script>
```

All runtime code and assets, including p5.js and the prebuilt approximately 27 KB LSD WASM module, are local. No internet connection, npm installation, build step, OpenFrameworks, OpenCV, or dlib is needed to run the app. Video processing stays on the device. Camera access requires localhost or HTTPS.

## Controls

- **Camera:** choose any available camera. There is no camera-model matching or automatic C920 preference. **Start camera** reopens the selected device; **Stop camera** releases it.
- **Capture:** request 1080p or 720p at 30 fps. Chrome determines the actual delivered format.
- **Input:** choose live camera or the building facade. A failed camera request or a disconnected stream falls back to the facade. `?sample=building` opens the facade directly, without requesting a camera.
- **Horizontal field of view:** ranges from **35° to 120°** and starts at a generic **100° guess**. It stays at the chosen value when changing cameras or inputs. **Reset FOV** returns to 100°. The **C920** tick at **70.42°** is only a reference mark; no profile or calibration data is loaded, and old per-camera saved settings are ignored.
- **Hold correction:** freeze the warp while the video continues. **Reacquire plane:** discard the previous estimate and find a new one.
- **Align axes:** enabled by default. Rotate the corrected plane so its dominant pair of perpendicular directions becomes horizontal and vertical. Uncheck it to compare with perspective correction alone. Hold correction also freezes this rotation.
- **Show detected lines:** green segments support the selected plane; amber segments are other retained detections.

Aim at a plane with visible right-angle structure, such as a tiled surface, facade, window grid, or rectangular design. A face or a blank wall alone generally does not provide sufficient evidence. Supported right-angle pairs, render fps, analysis time, tilt, pan, and axis rotation are consolidated beneath the views. Internal confidence remains part of tracking but is not shown as a percentage.

## Rendering and estimation

Frames are analyzed at up to 480 pixels on either axis, approximately seven times per second when processing is fast enough. Only one frame can be in flight. The original video remains full resolution; the display canvas matches the panel dimensions and renders independently of analysis.

Camera frames are copied at video cadence using `requestVideoFrameCallback` (with timestamp polling as a fallback). Two reusable full-resolution snapshots let a successful copy replace the previous frame atomically; both views and the analyzer use the same retained snapshot. Video readiness gaps or copy failures keep the previous frame visible. p5 uploads each changed snapshot rather than repeatedly uploading a live video texture at render cadence. Desktop diagnostics occupy two fixed rows, preventing status and metric text from resizing and clearing the canvases. Narrow screens can wrap the diagnostics because their panels have independently fixed heights.

For troubleshooting, `window.__deperspectivizer.cameraFrames` exposes copied frames, failed copies, unavailable-frame attempts, and missed video callbacks; `rendering.canvasResizes` counts display resizes after setup. These counters distinguish app-side frame handling and layout changes; they do not validate the camera's image contents.

The detector is the bundled, unmodified LSD 1.6 C implementation. The worker removes short or duplicate line segments, forms nearby intersecting segment pairs with a small gap allowance, samples candidate right-angle pairs, scores normalized transformed-line dot products, and refines the best consensus. The JavaScript optimizer replaces the original dlib dependency. Local angle evidence does not require a global Manhattan-world alignment.

The camera model uses square pixels and a centered principal point. The rectifying transform is `H = K R K^-1`. The whole warped quad is uniformly scaled and centered to the **actual panel width and height**, independently of capture aspect ratio. At least one dimension of its bounding box fills the panel; the whole quad stays visible. The original image is also fit without stretching, with the line overlay aligned to its displayed image region.

Axis alignment measures the rectified directions of unique lines supporting the accepted plane. A robust orientation mode groups perpendicular edges together, weights them by source length, and requires support in both directions. Different grid orientations compete instead of being averaged. Near ties favor the previous orientation, and rotations are unwrapped modulo 90° to prevent quarter-turn flips. Large direction changes require repeated support; rotation is smoothed with the plane normal. The extra rotation is composed into the same homography before fitting the quad, with no extra image pass or dependency.

The shader inverse-maps output pixels to the source texture. Fragment coordinates are converted from drawing-buffer pixels to logical panel pixels so Retina displays do not shrink the correction. `pixelDensity(1)` is set after creating the p5 WebGL renderer, keeping rendering cost proportional to panel size. Plane normals are smoothed, large plane changes require repeated support, and hypotheses with a projective horizon too close to or inside the image are rejected. If evidence is lost during live capture, the previous correction is held briefly and then eased toward the original view.

A single homography corrects the selected plane. Objects on other planes may stretch. Coplanar objects with different orientations cannot all become axis-aligned at once. Alignment chooses the nearest equivalent axes initially and follows them continuously; line geometry cannot determine which way text should face. Lens distortion and rolling shutter are not calibrated.

The native canvas receives its WebGL1 context before being passed to p5's public `createCanvas(..., canvas)` API. This avoids p5 2.x's pre-canvas `setAttributes()` error. Application variable names also avoid p5's reserved-name checker.

## Source

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Compact camera controls, FOV slider, and two panels. |
| `src/app.js` | Camera lifecycle and fallback, p5 rendering, worker scheduling, temporal filtering. |
| `src/video-frames.js` | Shared retained camera snapshots, frame callbacks, copy recovery and cancellation. |
| `src/shaders.js` | Inverse homography warp in panel pixel coordinates. |
| `src/geometry.js` | Camera matrices, pairing, robust plane estimation, maximum panel fit. |
| `src/worker.js` | Grayscale conversion, detection, estimation, overlay data. |
| `src/lsd.js`, `vendor/lsd.wasm` | Minimal WASM interface. |
| `vendor/lsd/` | Original LSD C/header source and license. |
| `tools/lsd-runtime.c`, `tools/wasm-include/` | Small allocation/runtime shim and built-in Math imports. |

The WASM module needs no Emscripten runtime, WASI, threads, shared memory, or special cross-origin isolation headers. Its imports are JavaScript's built-in Math functions and an error callback. Its allocation arena resets before each frame; returned detections are copied before reuse. Memory starts at 32 MB and is limited to 128 MB.

The floor image in the original OF example and the C920 research profile remain as reference/test assets. Neither is a selectable input or runtime dependency.

## Developer checks

Use **Node 20+** for developer checks. Running the browser app itself needs no Node.

From `web/`:

```bash
node --test test/*.test.mjs
node tools/verify-images.mjs
```

The thirteen tests cover safe invertible camera geometry, centered maximum panel fitting with rotation across different aspect ratios, synthetic plane recovery, axis alignment with competing orientations, rotation continuity across 45°, empty/fronto-parallel evidence, actual WASM detection and arena reuse, rasterized perspective-grid recovery, the actual worker protocol with transferred RGBA data and axis estimates, and retained camera frames through unavailable frames, failed copies, resolution changes, and cancellation.

The macOS image check uses the built-in `sips` decoder and the original OF example's image-specific focal-length values. It writes [quantitative results](test-output/image-results.json) and CPU-rendered geometry previews: [floor](test-output/floor-corrected.png), [building](test-output/building-corrected.png), [floor with aligned axes](test-output/floor-aligned.png), [building with aligned axes](test-output/building-aligned.png). These reference checks are separate from the app's generic FOV guess.

To rebuild the distributed WASM binary:

```bash
node tools/build-lsd.mjs
```

Rebuilding requires LLVM Clang with its wasm32 target and wasm-ld linker. The build script finds common MacPorts/Homebrew installations; override with `WASM_CC=/absolute/path/to/clang`. The included LSD source is compiled unchanged.

For optional browser checks, install Playwright in your development environment and run:

```bash
node tools/verify-browser.mjs
```

This uses Chrome's fake camera to verify automatic startup, building fallback when access fails, two 640-pixel panels, input switching, hold, FOV adjustment, and overlays. It emulates a Retina display, checks the canvas density, renders the warp shader at densities 1 and 2 to verify full panel coverage, and checks the title and diagnostics placement. It also changes diagnostic text to check that the canvases do not resize, and simulates missing video readiness to check frame retention. Playwright is a developer tool, not an application dependency. This restricted development runner cannot launch Chrome or bind a local server, so those browser checks require a normal local terminal. Startup logic has additionally been exercised with stubbed camera/DOM APIs for successful capture, explicit camera selection, missing hardware, and permission denial. The user has confirmed the preceding p5/WebGL version works with their camera.

## References and licenses

The browser implementation and runtime shim are distributed under **GNU AGPL v3 or later**; see [LICENSE](LICENSE). LSD's original notices and corresponding source are retained in `vendor/lsd/`, alongside all build/runtime code needed to reproduce the binary.

The approach follows Zaheer, Rashid, and Khan, *Shape from Angle Regularity*, ECCV 2012 (`references_and_libraries/Zaheer.pdf`), and the original `ofxCorrectPerspective` addon by M. Haris Usmani. The browser solver is a new implementation. The reference photographs and expected-result image retain the original [MIT notice](vendor/ofxCorrectPerspective-MIT.txt).

- LSD: Rafael Grompone von Gioi et al., [LSD: a Line Segment Detector](https://www.ipol.im/pub/art/2012/gjmr-lsd/), AGPL v3 or later.
- p5.js: [release 2.3.4](https://github.com/processing/p5.js/releases/tag/v2.3.4), LGPL 2.1.
