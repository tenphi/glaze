---
'@tenphi/glaze': minor
---

Redesigned ColorDef API: unified `l`/`contrast` into `lightness` (supports absolute numbers or relative strings), renamed `ensureContrast` to `contrast`, added per-color `hue` override, and renamed `sat` to `saturation`. Removed unsigned auto-flip behavior for contrast deltas.
