---
'@tenphi/glaze': major
---

`shadow` is rebuilt and `glow` is added: both are translucent overlays whose opacity is solved per surface so `intensity` is an exact **tone step**. The composite lands `intensity` tones darker (`shadow`) or lighter (`glow`) than `bg` on every surface and in every scheme, modeled the way browsers composite (`source-over` on gamma-encoded sRGB). Direction is fixed per type.

Breaking changes:

- **`shadow` `intensity` is a tone step.** In 2.x the same intensity darkened white by 9 tones, a tone-35 surface by 13.9 and a tone-6 surface by 4.4. Shadows on light surfaces keep roughly their look (old `10` ≈ 9 tones on white). Shadows on dark surfaces get stronger.
- **`fg` is the object casting the shadow, not a contrast reference.** The step is scaled by `k = max(0, 1 + β·d·(t_bg − t_fg)/100)` (`β = tuning.objectInfluence`, default `0.5`), so a darker object casts a deeper shadow and an object at the surface's tone, or no `fg`, gives exactly `intensity`. Drop `fg: 'text'`, or point `fg` at the element.
- **The pigment is pure black (`shadow`) / white (`glow`)** by default, so the surface keeps its hue.
- **`ShadowTuning` is replaced** by the shared `LightingTuning` (`objectInfluence`, `tint`, `reach`, `hueBleed`), also exported as `ShadowTuning` / `GlowTuning`. The old knobs (`saturationFactor`, `maxSaturation`, `lightnessFactor`, `lightnessBounds`, `minGapTarget`, `alphaMax`, `bgHueBlend`) are gone. Global config gains `glowTuning`.
- **`GLAZE_EXPORT_VERSION` is 2.** Version-1 theme / palette snapshots that contain shadow colors or `shadowTuning` now throw on restore; re-author the shadows and export again. Snapshots without shadows load unchanged.
- **`ColorDef` gains `GlowColorDef`.** Add a `'glow'` branch to exhaustive switches.

New: `{ type: 'glow', bg, fg?, intensity }` and `glaze.glow()`. Out-of-reach steps (a glow on white, a deep shadow on near-black) pin to the strongest composite and emit a deduped warning. See "3.0 — shadows and glows" in `docs/migration.md`.
