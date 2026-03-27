---
'@tenphi/glaze': patch
---

Apply `darkCurve` to relative lightness deltas in dark auto mode so subtle near-white differences (e.g. surface vs surface-2) are expanded by the power curve instead of collapsing to near-black.
