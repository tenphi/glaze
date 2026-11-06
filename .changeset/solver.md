---
'@tenphi/glaze': major
---

Fix the contrast solver's auto-flip so a solved color keeps its 1% (WCAG) / 0.5 Lc (APCA) safety margin and lands on the side it reports. Before, with `autoFlip` on (the default), the opposite side's search could start from the first side's gray seed or stop on the preferred tone itself, returning a color that met the floor with no margin (4.500001:1 for `'AA'`) and calling it a flip to the other side. Affected colors, depending on hue and base, now resolve with the margin, about 0.3 tone further from their base. A color with no tone of its own on a mid-tone base, where both sides pass at the same distance, now keeps the side it searched first instead of a side picked by search noise.

Direct `findToneForContrast` calls now return a preferred tone that clears the floor but not the margin as met, with `branch: 'preferred'`, whenever the search can't improve on it: no searched side meets the floor, or the starting side's only position is the preferred tone itself (it sits on that side's bound). Before, it was labelled with the side that had been searched, which could name a side of the base it doesn't sit on. A WCAG search that started away from it — from a bound, or with a forced `initialDirection` and no `flip` — lost it to the far extreme instead: white clearing a 7.2:1 floor at 7.24:1 against a tone-35 gray came back as black at 2.9:1, unmet. And with no room to search (`toneRange`), it came back `met: false`.

The WCAG gray seed is now only the search's first probe, not a bound. Saturated hues that read darker than their gray tone (blues, violets, reds, oranges) used to stop at the seed with more contrast than asked for (5.03:1 for `'AA'` at hue 280 on a light gray surface); they now land on their own crossing at the margin (about 4.55:1), up to about 5 tones nearer their authored tone in any scheme.

A contrast-solved color with no tone of its own on a gray base at tone 50 now always starts darker: black and white score the same against that base, and float noise used to pick the side.

Contrast-solved colors can therefore resolve to different tones than in 2.x: apart from the side changes above, most by less than half a tone; re-check pinned values (see "3.0 — other changes to resolved colors" in `docs/migration.md`).
