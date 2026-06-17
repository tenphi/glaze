---
'@tenphi/glaze': minor
---

Replace the OKHSL lightness axis with a contrast-uniform **tone** axis (OKHST) and remove the Möbius dark-mode curve.

**Breaking changes**

- The `lightness` authoring prop is gone. Use `tone` (0–100, contrast-uniform) everywhere — theme colors, `glaze.color()` structured input, and relative offsets. Equal tone steps now give equal WCAG contrast, so numeric values won't map to the same OKHSL lightness as before; re-check absolute mid-range values.
- Config windows changed: `lightLightness` / `darkLightness` → `lightTone` / `darkTone`. A window is `[lo, hi]` (reference eps — the common form), `{ lo, hi, eps }` (advanced eps tuning), or `false` to disable clamping. `false` removes the boundaries (full `[0, 100]` range) but keeps the contrast-uniform tone curve. `darkCurve` was removed.
- `ResolvedColorVariant` now stores `{ h, s, t, alpha }` (tone) instead of `{ h, s, l }`. Use the new `variantToOkhsl()` helper to recover OKHSL lightness.
- Export snapshots now carry `lightTone` / `darkTone` windows.
- Relative `tone` offsets that overshoot `[0, 100]` now mirror to the other side of the base by default (the new `flip`, inheriting `autoFlip`) instead of clamping. Set `flip: false` (or `autoFlip: false`) to restore clamping.

**New**

- `tone: 'max'` / `'min'` forces a color to the scheme's tone extreme (lightest / darkest) with no `base` and no contrast hack; under `mode: 'auto'` they invert in dark like any tone.
- `flip` per-color prop (default: global `autoFlip`): mirrors out-of-bounds relative `tone` overshoot and unmet `contrast` to the opposite side of the base, or clamps when `false`.
- Tone windows accept the `[lo, hi]` array shorthand alongside `{ lo, hi, eps }` and `false`.
- `contrast` accepts a metric selector: a bare number/preset is WCAG, `{ wcag }` / `{ apca }` picks the metric, and the `[normal, hc]` pair may live at the outer level or inside the metric (`{ wcag: [4.5, 7] }`).
- APCA Lc contrast solving alongside WCAG, plus an APCA-based drift verification warning for chromatic swatches.
- OKHST input: `okhst(H S% T%)` strings and `{ h, s, t }` objects (input only — never emitted).
- `saturationTaper` config knob (default `0.15`) gently rolls off saturation toward the tone extremes.
- New exports: `toTone`, `fromTone`, `toneFromY`, `yFromTone`, `okhstToOkhsl`, `okhslToOkhst`, `variantToOkhsl`, `REF_EPS`, `findToneForContrast`, `resolveContrastForMode`, `apcaContrast`, and the `ContrastSpec` / `OkhstColor` / `ToneWindow` / `ExtremeValue` / `ToneValue` types.
