---
'@tenphi/glaze': patch
---

Remove spurious warning when a color has both absolute `lightness` and `base`. This is a valid configuration — `base` is still used for minimum contrast calculation.
