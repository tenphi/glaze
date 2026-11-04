---
'@tenphi/glaze': patch
---

Fix the contrast solver's auto-flip so a solved color keeps its 1% (WCAG) / 0.5 Lc (APCA) safety margin and lands on the side it reports. Before, with `autoFlip` on (the default), the opposite side's search could start from the first side's gray seed or stop on the preferred tone itself, returning a color that met the floor with no margin (4.500001:1 for `'AA'`) and calling it a flip to the other side. Affected colors, depending on hue and base, now resolve with the margin, about 0.3 tone further from their base. A color with no tone of its own on a mid-tone base, where both sides pass at the same distance, now keeps the side it searched first instead of a side picked by search noise.

`findValueForMixContrast` no longer takes `targetLinearRgb`. The solver never read it; the mix is described entirely by `luminanceAtValue`. Remove the option from direct calls.
