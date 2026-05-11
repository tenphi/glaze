---
'@tenphi/glaze': minor
---

`glaze.color()` now defaults to `mode: 'auto'` across every input form, so non-string inputs adapt between light and dark like an ordinary theme color instead of being preserved verbatim with a linear dark mapping.

- **Object value-shorthand** (`{ h, s, l }`), **RGB tuple** (`[r, g, b]`), and **structured form** (`{ hue, saturation, lightness, ... }`) now default to `mode: 'auto'` with snapshotted scaling `{ lightLightness: globalConfig.lightLightness, darkLightness: globalConfig.darkLightness }`. The dark variant is Möbius-inverted into `globalConfig.darkLightness` (default `[15, 95]`), and the light variant is mapped through `globalConfig.lightLightness` (default `[10, 100]`) — exactly the same windows a theme color uses.
- **String value-shorthand** (hex / `rgb()` / `hsl()` / `okhsl()` / `oklch()`) is unchanged. It already defaulted to `mode: 'auto'` with `{ lightLightness: false, darkLightness: [lo, 100] }`, preserving the `#000` ↔ `#fff` flip.

**Behavior change (minor bump):**

- `glaze.color({ hue: H, saturation: S, lightness: 80 }).resolve()` (and the equivalent object / tuple forms) now produces a near-dark `dark.l` (e.g. ~`0.42` for `lightness: 80` under defaults) instead of staying near `0.79`.
- `light.l` for object / tuple / structured inputs is now mapped through `globalConfig.lightLightness` rather than preserved verbatim (e.g. `lightness: 0` now resolves to `light.l ≈ 0.10` by default).
- To restore the previous fixed-linear behavior, pass `{ mode: 'fixed' }` on the input or in the overrides. To restore the previous "preserve light lightness verbatim" behavior, pass `{ lightLightness: false }` as the trailing `scaling` argument.

The new scaling shape is also reflected in `token.export()` snapshots — object / tuple / structured tokens now serialize `{ lightLightness: [10, 100], darkLightness: [15, 95] }` (with the live `globalConfig` values frozen at create time) instead of `{ lightLightness: false, darkLightness: [15, 95] }`. Rehydration via `glaze.colorFrom()` round-trips byte-for-byte.
