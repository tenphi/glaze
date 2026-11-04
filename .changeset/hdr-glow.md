---
'@tenphi/glaze': minor
---

HDR glows. A glow can now go past SDR white: set `glowTuning.headroom` (globally, per theme, per color, or on `glaze.glow()`) to the number of stops above white it may use. When a glow's target tone (surface tone + `intensity × k`) passes 100, its resolved variant gains `hdr: { h, s, t, exposure }` — an opaque base, which is exactly what SDR already paints (the glow composited over its surface), plus a gain in stops. The gain lands the exact step (a 12-tone glow on white reaches tone 112, `Y` 1.4631), capped so no channel passes `2^headroom`. Every scheme uses the same headroom, high contrast included, and a manual `contrastLevel` interpolates `intensity` per pass as before.

- Nothing changes at the default `headroom: 0`: no variant carries `hdr`. With headroom set, the SDR variant (`h` / `s` / `t` / `alpha`) and every exporter's output stay byte-identical.
- `glaze.formatHdr(variant, 'srgb-linear')` writes the HDR value as `color(srgb-linear R G B)` with channels above 1 (e.g. `color(srgb-linear 1.4631 1.4631 1.4631)`), or returns `undefined` for a variant without one. `formatSrgbLinear` is exported for linear channels you build yourself.
- `headroom` must be a finite number ≥ 0, otherwise Glaze throws. Values above 2 clamp to 2 with a one-time warning, since headroom counts stops, not a ratio (2 stops is 4× white). A `headroom` on `shadowTuning` or a shadow's `tuning` throws.
- When HDR covers a glow's step, the "cannot reach" warning no longer fires for it. When the headroom cap leaves the step short, a new warning names the headroom and what it reached.
- `GlowTuning` is now its own interface (`LightingTuning` plus `headroom`); `ShadowTuning` is unchanged. New types: `ResolvedHdr`, `GlazeHdrFormat`; `ResolvedColorVariant.hdr` is optional. Snapshots stay at export version 2 and carry `headroom` through `export()` / `themeFrom()`.
