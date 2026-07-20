---
'@tenphi/glaze': patch
---

Fix relative `tone` with `autoFlip`: when mirroring an overshooting delta still leaves `[0, 100]`, keep the original direction and clamp instead of pinning to the wrong extreme.
