---
'@tenphi/glaze': minor
---

Add mix color type for blending two colors with optional contrast solving

- New `MixColorDef` with `type: 'mix'` — blend two referenced colors via `base` and `target`
- Opaque blend: interpolates in OKHSL or sRGB space, producing a solid color
- Transparent blend: outputs the target color with controlled opacity (alpha = value/100)
- `space` option: `'okhsl'` (default, perceptually uniform) or `'srgb'` (matches browser compositing)
- `contrast` option: adjusts mix ratio or opacity to meet a WCAG contrast floor against the base
- Achromatic hue handling: when mixing with unsaturated colors (e.g. white/black), the hue is taken from the saturated color
- `value` and `contrast` support `[normal, highContrast]` pairs
- Mix colors can reference other mix colors (chaining) but not shadow colors
