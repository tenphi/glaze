---
'@tenphi/glaze': patch
---

A mix whose `contrast` floor is out of reach now warns, once per scheme and deduplicated like a regular color: `glaze: mix "<name>" cannot meet WCAG 4.50 against its base in light scheme (got …)`. Before, it settled at the pure target (or the pure base at `value: 100`) silently. The same slack applies, so a miss by rounding stays quiet.

An unmet floor on a regular color now logs only its "cannot meet" warning. The chromatic drift advisory no longer repeats it for the same scheme with the same measured value, and it no longer fires for achromatic (saturation 0) colors, whose tone is exact.
