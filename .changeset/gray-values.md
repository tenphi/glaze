---
'@tenphi/glaze': patch
---

Grays given as values parse as exact grays. An sRGB gray (a hex such as `'#f5f5f5'`, `rgb(250 250 250)`, `hsl(0 0% 98%)`, an `{ r, g, b }` object, a `glaze.fromHex()` / `glaze.fromRgb()` seed, or an `srgb` mix that lands on a gray) used to come out with a small saturation from float residue, at a hue near 90. That saturation grew toward white: `#fefefe` read 1.6e-5 and `rgb(254.999 254.999 254.999)` read 1.6e-2. `srgbToOkhsl()` now returns saturation 0 for an input whose OKLab chroma is under 1e-6, keeping its hue and lightness. What changes:

- An OKHSL mix from a light gray (`'#f1f1f1'` and lighter; in a pastel mix, an `srgb` blend from about `rgb(232 232 232)`), or from a color of a theme seeded with one, keeps the other side's hue instead of sweeping from hue 90. A 50% mix from `'#f5f5f5'` toward a blue accent used to come out teal, and toward a violet one pink.
- A gray with decimal channels near white no longer gives the colors built from it a faint warm tint: up to about 2 of 255 in a channel for `rgb(254.999 254.999 254.999)`, as a `from` value or a `glaze.fromRgb()` seed.
- A shadow or glow `tint` no longer takes the residue hue from such a gray (about `rgb(254.85 254.85 254.85)` and lighter), whether it is the surface, the object (`fg`, with `hueBleed`), or the seed of the surface's theme. It stays neutral, or takes the other side's hue.
- A gray read from a value prints as `oklch(L 0 0)`, its `hsl()` hue term changes, and under `splitHue` it no longer declares a `--<name>-hue` variable.
- A contrast-solved color on a gray base can move by a few hundredths of an rgb channel.

Colors with real chroma, and colors built only from them, paint the same.
