---
'@tenphi/glaze': patch
---

Add `darkShadowCurve` tuning parameter to dampen shadow alpha in dark scheme via a power curve, keeping low/mid intensities closer to their light-mode counterparts while preserving full alphaMax at high intensity.
