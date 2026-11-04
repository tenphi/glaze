---
'@tenphi/glaze': major
---

Fix `contrast` on transparent mixes: the solver now composites the way browsers do (`source-over` on gamma-encoded sRGB) instead of in linear light. Previously a white overlay on a dark surface could render well below its floor (an `'AA'` overlay painted at about 2.3:1), and black overlays on light surfaces overshot theirs with roughly twice the needed opacity. Transparent mixes with `contrast` now resolve to different, correct alpha values; re-check pinned ones (see "3.0 — other changes to resolved colors" in `docs/migration.md`).
