---
'@tenphi/glaze': minor
---

Export `apcaLuminanceFromLinearRgb`, the APCA screen luminance (`Ys`) the contrast solver feeds `apcaContrast`, so `apcaContrast(apcaLuminanceFromLinearRgb(text), apcaLuminanceFromLinearRgb(bg))` reproduces the solver's own Lc for a resolved pair.
