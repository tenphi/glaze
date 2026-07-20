---
'@tenphi/glaze': minor
---

Add palette authoring round-trip (`palette.export()` / `glaze.paletteFrom()`), a restore triad with `glaze.themeFrom` (and `glaze.from` as alias), `kind`/`version` on all authoring exports, palette theme introspection (`theme` / `themes` / `list` / `primary`), and export type guards. Theme and color-token exports now freeze the full effective config (including `pastel` / `inferRole`) so restored snapshots ignore later `configure()` calls.
