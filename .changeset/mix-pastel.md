---
'@tenphi/glaze': patch
---

Mixes whose base or target has a different `pastel` flag from the mix's paint what they should, and their contrast floors hold on screen:

- A mix reads such a base or target in its own gamut, through the color that color paints. `value: 0` paints the base and `value: 100` the target exactly when they fit the mix's gamut. A pastel mix caps a vivid color at the pastel limit, keeping its hue and lightness. Before, OKHSL and transparent mixes read one gamut's saturation in the other: in a standard theme, a value-100 mix or overlay toward a pastel accent painted a much more vivid color than the accent.
- The contrast solver measures the color the mix emits. A transparent mix toward a pastel target in a standard theme could paint 2.9:1 under a 3:1 floor, and a pastel `srgb` mix measured its unclamped blend but emitted the clamped one, missing an AA floor at 4.3:1. Both happened with no warning.
- When a pastel mix can't reach its floor because the cap took its target's saturation, the warning says so and suggests `pastel: false` on the mix.

Mixes whose base, target, and the mix itself share a flag resolve exactly as before, except a pastel `srgb` mix with a contrast floor whose blend reaches the pastel limit: it now measures the clamped color it emits.
