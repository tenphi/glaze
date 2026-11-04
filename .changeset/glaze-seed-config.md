---
'@tenphi/glaze': major
---

`glaze({ hue, saturation, darkHue?, darkSaturation? }, config)` now applies the config override. Before, the object form read the override only from the third argument, so the documented two-argument call silently dropped it, and themes created that way now resolve differently. `glaze(seed, undefined, config)` still works but is deprecated.
