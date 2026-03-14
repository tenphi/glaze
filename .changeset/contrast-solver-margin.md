---
'@tenphi/glaze': patch
---

Add +0.01 margin to the contrast solver's internal search target to prevent floating-point rounding from producing contrast ratios like 4.4999… that fail Lighthouse's exact WCAG AA threshold check.
