---
'@tenphi/glaze': minor
---

Add palette authoring round-trip (`palette.export()` / `glaze.paletteFrom()`), a restore triad with `glaze.themeFrom` (and `glaze.from` as alias), `kind`/`version` on all authoring exports, palette theme introspection (`theme` / `themes` / `list` / `primary`), and export type guards. Authoring `.export(override?)` freezes `getConfig() ∪ instance local ∪ override` at call time (nested color `base` exports receive the same override). Live themes and color tokens keep a sparse local override and track live `configure()` for omitted fields. Remove `pastel` from `glaze.configure()` / `GlazeConfig` — set it per-theme, per-token, or per-color instead.
