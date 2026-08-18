---
'@tenphi/glaze': major
---

**Breaking:** the `format*` writers now take `s` / `l` / `t` on the 0–1 scale every Glaze producer returns.

`formatOkhsl`, `formatOkhst`, `formatRgb`, `formatHsl`, and `formatOklch` took 0–100 percentages while `resolve()`, `variantToOkhsl`, `srgbToOkhsl`, `oklabToOkhsl`, and `okhslToSrgb` all return 0–1 — so composing a producer with a writer was off by 100x and failed silently, since `0.7` is a legal percentage and the result was a valid CSS string naming a near-black color. The library now speaks one scale end to end.

Drop the `* 100` at the call site (`formatOkhst(v.h, v.s, v.t)`); a leftover one now warns instead of shifting the color quietly. Every export method — `css()`, `tokens()`, `tasty()`, `json()`, `dtcg()`, `tailwind()`, `glaze.format()` — emits the same colors as before: they were compensating internally, and dropping the redundant `×100 ÷100` round-trip only moves float noise (visible nowhere except the meaningless hue term of a fully-desaturated `hsl()` string).
