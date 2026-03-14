---
'@tenphi/glaze': patch
---

Fix contrast solver computing WCAG luminance from unclamped linear sRGB, which caused it to overestimate contrast for high-saturation colors near gamut boundaries (e.g. lime green). The solver now matches the browser rendering pipeline by gamma-encoding, clamping to sRGB gamut, then linearizing before computing luminance.
