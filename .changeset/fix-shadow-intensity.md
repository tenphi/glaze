---
'@tenphi/glaze': patch
---

Fix shadow intensity normalization to properly scale alpha values across different background/foreground contrast pairs. Shadow alpha now correctly reaches alphaMax (default 1.0) at intensity=100 with maximum contrast.
