---
'@tenphi/glaze': patch
---

Apply `darkCurve` power-curve inversion in high-contrast dark mode over the full [0, 100] range, preserving subtle near-white distinctions that were previously collapsed by linear inversion.
