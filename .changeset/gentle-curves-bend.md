---
'@tenphi/glaze': patch
---

Add `darkCurve` config option for perceptual dark-theme lightness inversion using a power curve. Expands subtle near-white distinctions in dark mode. Default `0.5`; set to `1` for legacy linear behavior. Widen contrast solver search range to `[0, 1]` so contrast targets are met regardless of dark lightness window.
