---
'@tenphi/glaze': patch
---

Internal refactor: split the 2636-line `src/glaze.ts` into focused, flat
modules (`config`, `hc-pair`, `shadow`, `warnings`, `scheme-mapping`,
`validation`, `resolver`, `formatters`, `theme`, `palette`,
`color-token`) and dedupe a few parallel structures:

- The resolver's four-pass loop is now a single `runPass()` + `seedField()`
  helper called four times.
- The palette `tokens` / `tasty` / `css` exporters share a
  `buildPaletteOutput()` driver instead of duplicating the
  per-theme loop / prefix resolution / collision filtering /
  primary-duplication logic.
- The default-config literal is no longer duplicated between module
  init and `resetConfig()`; both call a shared `defaultConfig()`.
- `theme` exports now cache the resolve result and invalidate it on
  any def mutation or `configure()` / `resetConfig()` call (via a
  new `configVersion` counter), so back-to-back exports don't
  re-run the four-pass resolver.

No public API or behavior changes.
