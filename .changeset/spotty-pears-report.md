---
'@tenphi/glaze': minor
---

Add `darkHue` / `darkSaturation` so a palette can seed a different hue and
saturation for the dark schemes instead of relying on the flat
`darkDesaturation` haircut.

Set them on the theme seed for a whole-palette shift, or on a single color to
retune just that token:

```ts
const theme = glaze({
  hue: 280,
  saturation: 80,
  darkHue: 268, // dark schemes seed from 268
  darkSaturation: 65, // and from 65 rather than 80
});

theme.colors({
  accent: { tone: 55, hue: '+20', darkHue: '+35' },
  warning: { tone: 60, saturation: 0.9, darkSaturation: 0.6 },
});
```

Both apply to the `dark` and `darkContrast` variants, and both fall back to
their light counterparts, so existing themes resolve exactly as before. Seed
values use the same units as `hue` / `saturation` (0–360 and 0–100); a color
def's `darkSaturation` is a 0–1 factor like its `saturation`. Relative
`darkHue: '+N'` anchors to the theme's dark seed hue. Authoring any dark
saturation bypasses `darkDesaturation` rather than stacking with it, and
`mode: 'static'` ignores both. Shadows and mixes need no new fields — they
derive their channels from the colors they reference.

`glaze.color()` gains the same controls as `darkHue`, `darkSaturation` (0–100
seed) and `darkSaturationFactor` (0–1), all round-tripping through
`export()` / `glaze.colorFrom()`.

`splitHue` exports stay correct: when a dark hue is authored, the hue custom
properties are re-declared in the dark block and under the Tasty dark state.
