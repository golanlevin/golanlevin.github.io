# Plottimation Web Tool: Technical Handoff

This file is a technical handoff for future agents. Additionally:

* Repo-level rules, workflow expectations, and durable invariants live in [AGENTS.md](/Users/gl/Desktop/plottimation/plottimation_webtool/AGENTS.md).
* User-facing explanations belong in [documentation.md](/Users/gl/Desktop/plottimation/plottimation_webtool/documentation.md).

## Purpose

`plottimation_webtool/` is a browser app that turns a photo or scan of a frame-sheet into:

- a live animated preview
- an exported animated GIF
- an exported H.264 MP4
- a ZIP of PNG frames plus settings
- a standalone settings text file

## Current Pipelines

### Markers

Used when frames are separated by explicit crosses or dots.

- page detection runs on a page-localization CV image
- coarse grid bounds are found from cross-convolution / boundary sweeps
- marker ROIs refine the nominal frame lattice
- `Auto` marker type resolves between `Crosses` and `Dots`

### Markerless

Used when frames are separated by empty gutters and there are no registration marks.

- branches immediately after page rectification
- does not use `Boundary Threshold` or `Boundary Persistence`
- estimates a straight lattice from the rectified sheet
- emits synthetic corner intersections into the same `markerLookup` structure used by the marker pipeline

This shared output structure is why the same editing panel can be reused as:

- `Frame Alignment Markers` in marker mode
- `Frame Alignment Centers` / `Corners` in markerless mode

## Light-on-dark design

`Light-on-dark design` is shared by both pipelines.

### Markers

- the raw source is inverted only for the CV path
- page detection and marker localization use the inverted image
- display and extracted frames remain in the original colors

### Markerless

- only the darkness contribution inside the gutter metric is inverted
- darker gutters are favored instead of lighter ones

## Markerless Grid Estimation

Implemented in [js/pipeline.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/pipeline.js).

### Pitch

- rectified sheet ROI -> grayscale
- reduced to a manageable working size
- blurred
- horizontal and vertical pitch estimated from seeded autocorrelation

The seed period uses the inset ROI:

- `(rectifiedWidth - 2*searchInsetMargin) / nCols`
- `(rectifiedHeight - 2*searchInsetMargin) / nRows`

### Phase

The phase solver works from 1D gutter-support profiles, currently built from:

- darkness
- texture / edge energy
- local variance

Current combination rule:

- enabled terms are multiplied together

Current support width:

- fixed markerless phase band width of `3 px` in the reduced blurred grayscale image

The phase is not found by local peak picking. It is found by testing periodic lattice starts and
choosing the one whose expected gutter positions land on the strongest combined gutter signal.

### Search Inset Margin

In markerless mode:

- `Search Inset Margin` is used to define the ROI that seeds pitch estimation
- it is visualized in `Rectified Sheet` as a blue rectangle
- a value of `0` is valid and is the markerless default

## Markerless Stabilization

Stabilization is translation-only.

No rotation, scale, shear, or perspective correction is applied.

Two methods currently exist:

### Neighbor Comparison

Internal id:

- `pairwise-cyclic`

Behavior:

- compares nearby frames in the sheet/loop
- solves a weighted global offset field
- `Stabilization Rigidity` affects this method only

### Median-Frame Comparison

Internal id:

- `difference-from-average`

Behavior:

- builds one grayscale median reference frame from all pre-stabilization sampled frames
- aligns each frame independently against that reference
- does not use `Stabilization Rigidity`

### Shared matcher

Both methods reuse the same sampled grayscale matcher:

- reduced grayscale frames
- translation search window
- uniform-weight absolute-difference metric

The older radial/periphery weighting code is still retained in `js/app.js`, but it is currently
unused.

### Post-lattice adjustment stack

Markerless extraction adjustments currently stack in this order:

1. autocorrelation baseline
2. `Horizontal Phase Offset` / `Vertical Phase Offset`
3. `Vertical Drift Compensation`
4. solved stabilization translation
5. manual `Frame Corners` overrides

Important:

- markerless corner overrides are post-stabilization extraction nudges
- they must not feed back into the stabilization solve

## Preview / Export Ordering

Ordering logic lives primarily in [js/preview-controller.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/preview-controller.js).

Current behavior:

- preview and export both operate from the same ordered source-frame logic
- `Reverse Order`, `Boustrophedon Order`, and `Ping-Pong` apply to that ordered source list
- `Frames in Export` limits the included source frames before those order modifiers are applied
- omitted frames are always the highest-indexed source cells
- paused raw-grid inspection still respects `Frames in Export`, but it intentionally ignores
  playback ordering so arrow-key stepping can inspect the physical printed grid directly
- vertical paused stepping wraps within the valid cells of the current column, which matters when
  the last printed row is incomplete because `Frames in Export` omits trailing cells

The rectified-sheet overlays must stay consistent with this ordering logic:

- green quad = currently displayed frame
- red omitted quads = source cells excluded by `Frames in Export`

This is a fragile integration point. If playback/export order changes, check:

- preview playback
- paused stepping
- rectified-sheet green quad
- omitted red quads
- GIF/MP4/ZIP frame counts

## Rectified Sheet Behavior

The `Rectified Sheet` panel renders the extraction-space rectified page directly.

For large images, the visible panel image may be a downscaled preview canvas while extraction still
uses the full-resolution `state.geometry.baseRectifiedMat`. Overlay geometry therefore has to be
mapped from full rectified coordinates into the displayed preview size.

The `Rectified Sheet` header link is sourced from the full-resolution rectified image, not from the
display preview:

- if the rectified sheet long edge is `<= 3000 px`, a full-resolution download URL may be prepared
  eagerly
- otherwise the full-resolution asset is generated on demand from `state.geometry.baseRectifiedMat`
- the visible panel preview and the downloadable asset are intentionally different representations

Overlays currently include:

- blue inset ROI rectangle in markerless mode
- green current-frame quad
- green connected edge preview while actively editing a marker/corner override
- red omitted-frame quads with a diagonal slash

Hidden-but-retained debug code still exists for the markerless gutter chart:

- left-to-right darkness / texture / variance / product curves
- code remains in `js/app.js` and `js/pipeline.js`
- the UI toggle and keyboard shortcut are currently disabled

## Settings Notes

Settings TSV support lives in [js/settings-io.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/settings-io.js).

Recent important keys:

- `alignment_pipeline`
- `stabilization_method`
- `stabilization_strength`
- `light_on_dark_design`
- `post_rotation_deg`
- `vertical_drift_compensation`
- `frame_count_to_export`
- `output_width`
- `output_height`
- `source_credit`
- `stabilization_enabled`

Backward-compatibility note:

- legacy settings files may omit newer fields
- UI sync helpers are expected to supply correct defaults in that case
- in particular, a missing `frame_count_to_export` field should resolve to the full grid size, not
  to a one-frame export
- `source_credit` is optional metadata shown in the Raw Photo header when present
- if `source_credit` is absent, the Raw Photo header falls back to the loaded source filename
- when a settings file supplies both `output_width` and `output_height`, treat them as an exact
  stored pair during restore instead of recalculating one dimension from the other

## Memory Notes

Recent large-image work changed the internal image model:

- the `styled` CV branch is now BGR, not RGBA
- the `vision` CV branch is now grayscale, not color
- the lightweight Thresholding Offset preview keeps only grayscale caches; the old persistent raw
  `source.cvMat` cache was removed

To reduce peak memory during consecutive large reprocesses:

- `trimCachesBeforeReprocess()` drops old rectified Mats and large frame/stabilization caches
  before the next `runPipeline()` begins
- the `Rectified Sheet` panel uses a bounded preview canvas instead of materializing another
  full-size RGBA display copy for very large rectified pages

## Layout UI Notes

- Switching `Paper Aspect` between a preset and `Custom` should not trigger reprocessing if the
  effective sheet width/height did not actually change.
- `Sheet Width` and `Sheet Height` typing is intentionally debounced in the UI, while pressing
  `Enter` commits immediately.
- `Post-Rotation` is a page-detection-stage control: it rotates the rectified sheet after page
  rectification and before marker detection or markerless autocorrelation.
- `Post-Rotation` positive values are intentionally clockwise in both the scrub preview and the
  final processed result.
- While scrubbing `Post-Rotation`, playback pauses and the app shows a preview-only rotated
  `Rectified Sheet` plus preview-only Panel 3 tile updates. The expensive CV pipeline still runs
  only on release.
- The scrub preview is delta-based relative to the last processed rotation, not an absolute redraw
  from zero. This avoids double-applying an already-committed rotation when dragging from a
  nonzero starting value.

These are interaction expectations, not just implementation details. Regressions here make the app
feel frozen because page processing is expensive.

## Busy-Cursor Expectations

Some controls deliberately defer full recomputation until release, but they should still show the
geometry-processing cursor before the synchronous rebuild begins. Current examples:

- `Horizontal Phase Offset`
- `Vertical Phase Offset`
- `Vertical Drift Compensation`
- `Post-Rotation`
- `Enable Stabilization`
- `Stabilization Method`

If these controls are touched, preserve the "show busy cursor, yield one paint, then recompute"
behavior.

## Current Module Roles

Only the roles most relevant to future editing are listed here. See `AGENTS.md` for the broader file map.

- `js/app.js`
  - main orchestration
  - config reading
  - preview rendering
  - rectified-sheet overlays
  - extraction/stabilization integration
  - cache invalidation

- `js/pipeline.js`
  - CV pipeline
  - markerless pitch/phase estimation
  - marker localization

- `js/preview-controller.js`
  - playback order
  - ping-pong expansion
  - current preview draw loop

- `js/export-controller.js`
  - GIF/MP4/ZIP export
  - exported frame count reporting

- `js/i18n.js`
  - locale tables
  - tooltip selector registry
  - mode-shared tooltips that sometimes need runtime overrides

## Common Failure Modes

- stale mode-switched labels or tooltips
  - some controls are shared between pipelines but need different text

- cache invalidation bugs
  - especially when scrubbing markerless controls or changing stabilization mode

- preview/export desynchronization
  - when ordering logic changes in one place but not another

- settings regressions for newly added controls
  - especially with legacy settings files that omit those fields

## Vendor Assets

Third-party runtime assets live in:

- [js/vendor/opencv.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/vendor/opencv.js)
- [js/vendor/gif.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/vendor/gif.js)
- [js/vendor/gif.worker.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/vendor/gif.worker.js)
- [js/vendor/mp4-muxer.esm.js](/Users/gl/Desktop/plottimation/plottimation_webtool/js/vendor/mp4-muxer.esm.js)

## TODO

- Consider a later refactor that extracts the source/rectified image-buffer ownership code from
  `js/app.js` into `js/image-buffer-lifecycle.js`.
  - Purpose:
    - make large-image memory policy easier to reason about
    - keep OpenCV Mat lifetime / deletion rules in one place
    - reduce how much `js/app.js` has to know about source/rectified buffer ownership
  - Likely contents:
    - `releaseSourceCvCaches()`
    - `ensureSourceCvCaches()`
    - `releaseRectifiedCvCache()`
    - `ensureBaseRectifiedMat()`
    - `ensureRectifiedGrayMat()`
    - `trimCachesBeforeReprocess()`
  - Scope note:
    - keep this focused on source and rectified image buffers, grayscale derivatives, and
      pre-reprocess memory trimming
    - do not move frame-output, stabilization, preview-order, or export logic into that file
