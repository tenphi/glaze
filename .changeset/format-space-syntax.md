---
'@tenphi/glaze': major
---

Switch `formatRgb` and `formatHsl` from comma syntax to modern CSS space syntax

`rgb(R, G, B)` → `rgb(R G B)` and `hsl(H, S%, L%)` → `hsl(H S% L%)`. `rgb` output now uses rounded integers instead of fractional values. This enables alpha support via the `/ alpha` separator and aligns with modern CSS (supported since Chrome 65+, Firefox 52+, Safari 12.1+).

Downstream code that parses Glaze's CSS output using comma-separated patterns must update to space-separated syntax.
