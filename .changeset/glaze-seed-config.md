---
'@tenphi/glaze': patch
---

`glaze({ hue, saturation, darkHue?, darkSaturation? }, config)` now applies the config override. Before, the object form read the override only from the third argument, so the documented two-argument call silently dropped it. `glaze(seed, undefined, config)` still works but is deprecated.
