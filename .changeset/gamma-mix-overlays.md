---
'@tenphi/glaze': patch
---

Fix `contrast` on transparent mixes: the solver now composites the way browsers do (`source-over` on gamma-encoded sRGB) instead of in linear light. Previously a white overlay on a dark surface could render well below its floor (an `'AA'` overlay painted at ~2.4:1), and black overlays on light surfaces overshot theirs with roughly twice the needed opacity. Transparent mixes with `contrast` now resolve to different, correct alpha values.
