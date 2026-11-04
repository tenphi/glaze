---
'@tenphi/glaze': minor
---

Export `apcaLuminanceFromLinearRgb`, the APCA screen luminance (`Ys`) the contrast solver feeds `apcaContrast`, so `apcaContrast(apcaLuminanceFromLinearRgb(text), apcaLuminanceFromLinearRgb(bg))` reproduces the solver's own Lc for a resolved pair.

Hex parsing is now strict: `parseHex` / `parseHexAlpha` reject any character that isn't a hex digit. Before, the 6- and 8-digit forms checked only the first digit of each pair, so `'#1z2z3z'` read as `#010203` and `'#-1-2-3'` produced negative channels. `glaze.color()`, `glaze.fromHex()`, a theme color's `from`, and the `bg` / `fg` of `glaze.shadow()` / `glaze.glow()` now throw `glaze: invalid hex color "…".` for such input.
