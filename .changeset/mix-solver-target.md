---
'@tenphi/glaze': major
---

`FindValueForMixContrastOptions` no longer has `targetLinearRgb` (a type-level removal: delete it from direct `findValueForMixContrast` calls). The solver never read it; the mix is described entirely by `luminanceAtValue`, so results are unchanged.
