---
'@tenphi/glaze': minor
---

Replace the symmetric saturation taper with a cusp-anchored saturation ceiling, and rename `saturationTaper` → `saturationCeiling`.

**Breaking change**

- `saturationTaper` (a strength, default `0.15`) is replaced by `saturationCeiling` (the global chroma ceiling `s_max`, default `0.9`). To disable the taper, use `saturationCeiling: false` instead of `saturationTaper: 0`. This applies to `glaze.configure()` and per-instance `glaze.color()` / `glaze()` overrides.

**What changed**

- The taper is now anchored at each hue's gamut cusp (the lightness where realizable chroma peaks — warm hues peak light, cool hues peak dark) instead of a fixed mid-lightness, and it is asymmetric per end (toward black vs toward white). It is applied as a ceiling, `s' = min(s, s_max·f)`, so it only tames oversaturated colors and leaves intentionally muted colors untouched.
- It keys on the rendered OKHSL lightness, so the same curve runs in light and dark mode with no per-mode shoulder. The plateau half-widths (`W_DARK = 0.45`, `W_LIGHT = 0.40`) are fixed internal constants.
- Because the taper is now hue-aware, saturated colors rendered near white or black can shift noticeably more than before (e.g. a near-white cool hue desaturates much harder — which is physically correct). Mid-range stops are essentially unchanged.

**New export**

- `cuspLightness(h)` — the OKHSL cusp lightness for a hue.
