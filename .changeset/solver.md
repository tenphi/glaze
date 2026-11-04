---
'@tenphi/glaze': patch
---

Fix the contrast solver's auto-flip so a solved color keeps its 1% (WCAG) / 0.5 Lc (APCA) safety margin and lands on the side it reports. Before, with `autoFlip` on (the default), the opposite side's search could start from the first side's gray seed or stop on the preferred tone itself, returning a color that met the floor with no margin (4.500001:1 for `'AA'`) and calling it a flip to the other side. Affected colors, depending on hue and base, now resolve with the margin, about 0.3 tone further from their base. A color with no tone of its own on a mid-tone base, where both sides pass at the same distance, now keeps the side it searched first instead of a side picked by search noise.

A mix at `value: 100` whose pure target clears its `contrast` floor by less than that margin now resolves to the pure target. Before, it collapsed to its base (alpha 0 for a transparent mix) and warned that even the pure target falls short. Direct `findToneForContrast` / `findValueForMixContrast` calls get the same rule: when no searched side meets the floor but the preferred position clears it, the preferred position is returned as met (`branch: 'preferred'`) instead of the far extreme.

The WCAG gray seed is now only the search's first probe, not a bound. Saturated hues that read darker than their gray tone (blues, violets, reds, oranges) used to stop at the seed with more contrast than asked for (5.03:1 for `'AA'` at hue 280 on a light gray surface); they now land on their own crossing at the margin (about 4.55:1), up to a few tones nearer their authored tone in every scheme.

A contrast-solved color with no tone of its own on a gray base at tone 50 now always starts darker: black and white score the same against that base, and float noise used to pick the side.
