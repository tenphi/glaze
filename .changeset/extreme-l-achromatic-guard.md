---
'@tenphi/glaze': patch
---

Fix `srgbToOkhsl` (and downstream `glaze.color()`) returning a bogus saturated hue/saturation for pure white (`#FFFFFF`) and other colors at the OKHSL lightness extremes. Floating-point residue from `linearSrgbToOklab` slipped past the existing chroma epsilon, sending the chromatic path through a degenerate gamut where saturation divides by ~zero. White now correctly resolves to `okhsl(0 0% 100%)` (light) / `okhsl(0 0% 15%)` (dark) instead of `okhsl(89.88 55.83% 100%)`.
