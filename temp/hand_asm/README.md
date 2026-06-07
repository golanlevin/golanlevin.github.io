# Hand PDM Runtime Notes For Future LLM Agents

This directory contains the browser-compatible runtime prototype for the hand
PDM/ASM pipeline. It is intentionally separate from the offline Python training
and evaluation scripts. Do not retrain models or run Python MediaPipe from this
runtime folder.

## Current Purpose

The page in `index.html` runs the same JavaScript MediaPipe Tasks Vision hand
detector intended for the final interactive experience, fits an exported
151-vertex statistical hand model, refines the 95-point contour with local image
evidence, and displays experimental mesh outputs.

The runtime is still a research prototype. Preserve explicit stage boundaries
and diagnostic controls unless the user asks for cleanup.

## Run Locally

From the repository root:

```bash
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/hand_pdm_runtime/
```

The camera starts automatically. Browser module caching is aggressive, so this
project uses query-string cachebusters in `index.html` and module imports.
Whenever you edit a JS module imported by `main.js`, bump:

- the import query in `src/main.js`
- the `<script type="module" ...>` query in `index.html`

Whenever you edit CSS, bump the stylesheet query in `index.html`.

## Model Files

Runtime models are loaded from paths relative to this page:

```text
../model_out/runtime/hand_full_mesh_model_11m.json
../model_out/runtime/hand_full_mesh_model_20m.json
../model_out/runtime/hand_full_mesh_model_30m.json
../model_out/runtime/hand_contour_model_11m.json
../model_out/runtime/hand_contour_model_20m.json
../model_out/runtime/hand_contour_model_30m.json
../model_out/mediapipe_correspondence_learned.json
```

The UI currently defaults to the quality `30m` model. The model JSONs are
already in the upright canonical orientation selected offline:

```json
{
  "source_width": 1024,
  "source_height": 768,
  "transform": "rotate_90_cw",
  "output_width": 768,
  "output_height": 1024
}
```

For webcam runtime use, MediaPipe landmarks are treated as already being in the
display/canvas coordinate system. The runtime does not rotate or scale them into
dataset coordinates.

## Geometry Contracts

Full mesh:

- 151 vertices
- 205 triangles
- packed JS arrays use `[x0, y0, x1, y1, ...]`
- triangle indices refer to native 151-vertex mesh indices

Contour:

- 95 native mesh boundary vertices
- contour is not arc-length resampled
- contour vertex order comes from `hand_contour_model_*m.json`
- preserving native vertex indices matters for semantic correspondence

Important semantic vertex ranges:

```text
thumb:     0-20
pinky:     21-41
ring:      42-62
middle:    63-83
index:     84-104
wrist:     105-116
palm:      117-143
thumb web: 144-150
```

Important current vertices:

```text
MP0 wrist / palm base center: vertex 115
MP17 pinky MCP crown:        vertex 137
MP13 ring MCP crown:         vertex 139
MP9 middle MCP crown:        vertex 141
MP5 index MCP crown:         vertex 143
```

## Frame Pipeline

The main loop in `src/main.js` is deliberately linear:

1. Draw webcam frame full-size into the visible canvas.
2. Run JavaScript MediaPipe on the video frame.
3. Fit the full 151-point PDM to the 21 MediaPipe landmarks.
4. Extract the 95-point PDM boundary contour.
5. Compute a hand ROI and prepare grayscale/gradient/chroma maps only in that ROI.
6. Run ASM-style normal search around each contour vertex.
7. Blend PDM contour toward ASM candidates to create the `Final Contour`.
8. TPS-warp the full 151-point mesh so its boundary follows the Final Contour.
9. Build `Frankenmesh2` from the TPS mesh by overriding five vertices with MediaPipe.
10. Render selected debug layers and rolling median timings.

## Live Output Layers

The current display defaults are:

- MediaPipe landmarks: visible
- raw ASM contour: visible, blue
- Final Contour: visible, lime, 2px
- Frankenmesh2: visible, cyan at low opacity
- PDM mesh: hidden by default
- TPS mesh: hidden by default, magenta when enabled

Removed UI controls were removed deliberately:

- Start Camera button: camera starts automatically.
- Wrist Snapping checkbox: wrist snapping is hardcoded off.
- ROI checkbox: ROI still exists internally but is not displayed.
- Confidence checkbox: confidence still affects contour blending but is not displayed.
- Displacement arrows checkbox: removed from live UI.

## Core Source Files

`src/main.js`

- Orchestrates the browser frame loop.
- Owns UI control reading, performance text, and debug rendering.
- Keep the pipeline explicit unless the user asks for abstraction.

`src/mediapipe-adapter.js`

- Loads `@mediapipe/tasks-vision@0.10.22-rc.20250304`.
- Converts normalized MediaPipe landmarks into canvas pixels.
- Mirrors x coordinates when the displayed webcam is mirrored.

`src/model-loader.js`

- Loads full/contour model JSON and learned correspondence JSON.
- Converts JSON arrays into typed arrays.
- Precomputes boundary `prev`/`next` loop indices and anatomical boundary regions.

`src/pdm-fitter.js`

- Fits the 151-point PDM to MediaPipe landmarks.
- Alternates similarity-transform estimation and regularized PCA coefficient solve.
- Does not use image evidence or contour constraints.

`src/contour-asm.js`

- Refines the 95-point contour using local image-edge evidence.
- Builds ROI-local gradient/chroma maps.
- Searches along contour normals.
- Uses 7-tap tangent support by default.
- Uses temporal offset priors to reduce flicker.
- Uses semantic signed-curvature repair at fingertips and crotches.

`src/tps-deform.js`

- Warps the full PDM mesh so its boundary follows the Final Contour.
- Used as the base for Frankenmesh2.

`src/frankenmesh2-builder.js`

- Current experimental final mesh policy.
- Copies the TPS mesh exactly.
- Overrides only five vertices:
  - MP0 -> 115
  - MP17 -> 137
  - MP13 -> 139
  - MP9 -> 141
  - MP5 -> 143

`src/frankenmesh-builder.js`

- Disabled legacy experiment.
- Port of the old C++ HandMeshBuilder contour-driven approach.
- Kept for reference, not imported by `main.js`.

`src/render.js`

- Stateless canvas drawing helpers.
- Some helpers are currently unused but useful for debug restoration.

`src/math.js`

- Small numeric helpers and dense linear solver.

## ASM Details

The ASM stage starts from the PDM contour, not from the image alone. For each
boundary vertex:

1. Compute tangent from previous/next contour points.
2. Compute a perpendicular normal.
3. Search along the normal within a radius based on hand size.
4. Score candidates using:
   - ROI-local gradient magnitude
   - tangent-kernel support
   - skin chroma transition
   - distance penalty from PDM contour
   - temporal offset prior
5. Keep the best credible candidate or fall back to the PDM point.

After raw search, offsets are regularized:

- Crotches are smoothing barriers.
- Fingertips receive reduced smoothing.
- Wrist vertices are low-confidence and downweighted.
- Signed curvature repair preserves semantic curvature signs at:
  - fingertips: `19, 40, 61, 82, 103`
  - crotches/webs: `138, 140, 142, 0, 146, 147`
- Crotch vertices also get a secondary search along the local PDM curvature
  vector, because the true concave valley is not always reachable by the
  single normal line alone.
- The three between-finger crotches also get a one-sided MediaPipe-guided
  search ray toward adjacent MCP midpoints:
  - pinky/ring web `138` -> midpoint of MP17 and MP13
  - ring/middle web `140` -> midpoint of MP13 and MP9
  - middle/index web `142` -> midpoint of MP9 and MP5

The signed curvature repair exists because finger crotches are semantically
important concavities. Generic smoothing tends to flatten or erase them.

## Current Defaults

Important defaults in `index.html`:

```text
model preset: quality 30m
edge snap amount: 1.00
search radius: 5.0% of MediaPipe hand size
distance penalty: 0.060
skin chroma weight: 0.30
offset smoothing: 0.35
curvature preserve: 0.25
temporal weight: 0.12
minimum temporal gain: 0.20
mirror webcam: enabled
```

Hardcoded defaults in `main.js`:

```text
snapPreset: direct
profileWidth: 7
snapWrist: false
```

## Design Warnings

- Do not resample the 95-point contour unless the user explicitly asks. Native
  boundary vertex correspondence is important.
- Do not use Python MediaPipe for browser-runtime calibration. The runtime must
  use the JS MediaPipe version listed above.
- Do not train models in this folder. Training/export scripts live at repo root.
- Wrist contour is unreliable because it often represents an arbitrary forearm
  cutoff, not a stable anatomical boundary.
- MediaPipe fingertips are not identical to contour apexes. Be careful before
  hard-snapping fingertip contour vertices to MediaPipe fingertip points.
- Full-frame gradient prep was intentionally avoided. Keep gradient/chroma
  preparation ROI-limited unless profiling proves otherwise.
- `Frankenmesh2` is not a PDM-representable shape guarantee. It is an output
  policy layered on top of the TPS mesh.

## Suggested Debug Workflow

When changing fitting/refinement behavior:

1. Keep MediaPipe landmarks visible.
2. Toggle PDM mesh on to inspect the statistical fit.
3. Toggle TPS mesh on to inspect boundary-constrained deformation.
4. Compare raw ASM contour and Final Contour near finger crotches.
5. Watch triangle flip counts in the performance panel.
6. If browser behavior looks stale, bump cache query strings first.

When changing geometry:

- Run `node --check` on modified JS modules.
- If adding a new mesh policy, dry-test that it still outputs 151 packed points.
- Validate that boundary vertices still align with the 95-point Final Contour if
  that policy is intended to preserve the outline.

## Known Open Questions

- The signed-curvature crotch repair is heuristic and may need tuning after
  visual testing.
- Search confidence is no longer displayed, but it still affects Final Contour
  unless `snapPreset` remains `direct`.
- Frankenmesh2 may create local triangle stress around the five overridden
  vertices; watch `flips TPS/F2` in the performance panel.
- The old Frankenmesh builder may still be useful as a reference for procedural
  topology, but it is not the current preferred output path.
