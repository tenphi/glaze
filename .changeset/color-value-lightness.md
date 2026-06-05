---
"@tenphi/glaze": minor
---

**Breaking:** `glaze.color()` value-shorthand changes:

- **Removed** RGB tuple `[r, g, b]` — use `{ r, g, b }` instead.
- **Added** `RgbColor` (`{ r, g, b }`) and `OklchColor` (`{ l, c, h }`) object inputs (also accepted by `glaze.shadow()`).
- **Unified scaling** for all value-shorthand (strings and literal objects): `lightLightness: false`, `darkLightness: globalConfig.darkLightness` (snapshotted). Strings no longer use the extended `[darkLo, 100]` dark window — the default `#000` → white dark flip is gone unless you pass explicit `scaling: { darkLightness: [lo, 100] }`.
- Object/tuple value-shorthand no longer remap light lightness through `globalConfig.lightLightness` (structured `{ hue, saturation, lightness }` still does). Opt back in with `scaling: { lightLightness: [10, 100], ... }`.
