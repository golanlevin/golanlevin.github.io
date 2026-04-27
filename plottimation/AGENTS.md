# AGENTS.md

## Scope
- `plottimation_webtool/` is the main application.
- Treat this as a browser-first app.
- Do not create a separate desktop/Electron fork unless explicitly requested.

## Architecture
- The app has two alignment pipelines:
  - `Markers`
  - `Markerless`
- `Markerless` currently has two stabilization methods:
  - `Neighbor Comparison`
  - `Median-Frame Comparison`
- Third-party runtime assets live under `js/vendor/`.
- Large-image CV now uses a split image model:
  - styled/full-color Mats are BGR
  - vision/alignment Mats are grayscale
  - the `Rectified Sheet` panel may show a downscaled preview while extraction still uses the full `baseRectifiedMat`

## Key Files
- `index.html`: primary UI markup
- `style.css`: global UI styling
- `js/app.js`: main orchestration, extraction flow, preview logic, rectified-sheet overlays
- `js/pipeline.js`: page detection, marker detection, markerless estimation
- `js/ui-controls.js`: event wiring and interaction behavior
- `js/i18n.js`: locale tables, tooltips, translation helpers
- `js/settings-defaults.js`: canonical reset values
- `js/settings-io.js`: settings load/save compatibility
- `js/preview-controller.js`: playback ordering and preview loop logic
- `js/export-controller.js`: GIF/MP4/ZIP export logic
- `llm_readme.md`: technical handoff and subsystem notes
- `documentation.md`: user-facing documentation

## Behavioral Invariants
- Marker and markerless pipelines intentionally expose different UI semantics.
- Markerless corner overrides are post-stabilization extraction nudges.
- `Light-on-dark design` affects both pipelines.
- `Post-Rotation` is applied after page rectification and before marker detection or markerless autocorrelation.
- `Post-Rotation` positive values are intentionally clockwise in both the scrub preview and the final processed result.
- `Post-Rotation` scrubbing is preview-only while dragging; the expensive full CV reprocess should still happen only on release.
- Saved settings should remain backward-compatible when practical.
- If a settings file omits `frame_count_to_export`, treat that as `Frame Rows × Frame Columns`.
- If a settings file provides both `output_width` and `output_height`, preserve that exact pair instead of re-deriving one dimension from the other during load.
- If `source_credit` is absent, the Raw Photo header should fall back to the loaded source filename.
- `Frames in Export` limits preview and export from the same source-cell subset.
- Preview/export ordering changes must stay consistent with:
  - preview playback
  - paused arrow-key stepping
  - rectified-sheet green current-frame overlay
  - rectified-sheet red omitted-frame overlays
  - exported GIF/MP4/ZIP frame ordering

## Markerless Notes
- Markerless pitch estimation comes from grayscale blurred autocorrelation.
- Markerless phase estimation uses combined gutter evidence.
- The current combined gutter signal is multiplicative.
- Markerless phase support currently uses a fixed band width in `pipeline.js`.
- Markerless stabilization is translation-only.

## Fragile Areas
- Cache invalidation in `js/app.js`
- Mode-switched labels and tooltips
- Rectified-sheet overlays
- Post-Rotation scrub-preview behavior and handoff to the real processed result
- Large-image memory pressure during consecutive reprocesses
- Preview/export frame-order logic
- Settings load/save for newly added controls
- Markerless UI scrubbing behavior for responsive controls
- Layout controls that debounce or suppress redundant reprocessing

## Workflow Expectations
- Use `apply_patch` for manual file edits.
- When adding non-temporary UI controls:
  - wire settings load/save
  - add i18n labels
  - add tooltips
  - update user docs if the control is user-facing
- When adding temporary UI controls:
  - keep them clearly isolated
  - do not wire them into settings or i18n unless explicitly requested
- Prefer small, behavior-preserving refactors over large structural rewrites.

## Verification
- After JS edits, run lightweight parse checks.
- If shared UI changes, check both pipelines.
- If viewer-tab or mobile-control naming changes, check mobile mode behavior.
- If settings-bearing controls change, check settings round-trip behavior.
- If `Rectified Sheet` preview or rectified-image download behavior changes, check both:
  - the visible panel preview on large images
  - the full-resolution header-link download path sourced from `baseRectifiedMat`
- If paper-size / custom-sheet behavior changes, check:
  - preset -> custom with unchanged dimensions
  - debounced width/height typing
  - Enter-to-commit behavior
- If preview/export ordering changes, check:
  - reverse order
  - boustrophedon order
  - ping-pong
  - reduced frame-count export

## Documentation Split
- Put durable repo rules in this file.
- Put deeper implementation notes in `llm_readme.md`.
- Put user-facing explanations in `documentation.md`.
