---
'@tenphi/glaze': patch
---

Adjust the default tone-window floors: `lightTone` is now `[10, 100]` (was `[13, 100]`) and `darkTone` is now `[15, 95]` (was `[10, 95]`). The OKHST migration made dark schemes bottom out darker than the legacy pipeline for the same input; lifting the dark floor keeps the darkest dark-mode surfaces closer to the previous output, and lowering the light floor widens the usable light range. Override with `lightTone: [13, 100]` / `darkTone: [10, 95]` to restore the prior values.
