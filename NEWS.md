# OpenSketch 0.1.0

- Adopted the OpenGate visual system across the project library and editor,
  including warm light/dark surfaces, orange accents, compact Avenir Next/Inter
  controls, and a persisted theme switch.
- Converted OpenSketch into a static, browser-native GitHub Pages application
  while preserving the version-1 `.OpenSketch` project format and editor
  behavior.
- Added a repository-base-aware Vite build, complete offline PWA cache, and
  automated test/build/deploy workflow for `main`.
- Added production-path, offline reload, and portable-project round-trip
  regression coverage.
- Added the deterministic, public-domain-only NIH BioArt synchronization and
  validation pipeline.
- Added local project persistence, portable `.OpenSketch` files, editable vector
  artwork, text and diagram tools, history, layers, SVG export, and
  DPI-aware PNG export.
- Added smart alignment guides, large-workspace panning, drop-at-pointer insertion,
  equal-gap distribution, and coalesced continuous-edit history.
- Added anchored connectors with arrowhead, line-style, curvature, and endpoint
  controls that persist across local saves and portable projects.
- Added scientific typography controls, gradient-aware tint/saturation/brightness
  adjustments, project descriptions, keyboard-safe dialogs, and stricter project
  and upload validation.
- Added relevance-ranked biological search, late-loading font metric correction,
  and a verified portable example project with provenance-rich SVG output.
- Added fail-closed validation for portable project bounds, Fabric scene
  structure, connector metadata, and embedded media before import persistence.
