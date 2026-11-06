---
'@tenphi/glaze': major
---

Output options are tightened: options a method accepted but never read are removed from its type, and `splitHue` no longer fails silently.

Breaking changes (type-level removals; delete the option, the output is the same):

- `palette.json()` takes `GlazeJsonOptions` only: `prefix` is removed.
- `splitHue` is removed from `palette.tokens()` / `dtcg()` / `dtcgResolver()` / `tailwind()` (it left `GlazePaletteExportOptions`) and from `token.token()` / `token.tasty()`.
- `theme.tasty()` takes the new `GlazeTastyOptions`, without `prefix`. `GlazeTokenOptions` is now only `format`, `modes`, and `states`.
- `palette.tasty()` and `palette.css()` take the new `GlazePaletteTastyOptions` / `GlazePaletteCssOptions`, without `name` (their hue vars are always named after each theme).

Breaking changes (runtime):

- `splitHue` with a `format` other than `'oklch'` throws (`glaze: splitHue requires format 'oklch' (got 'rgb'). Use format: 'oklch' or drop splitHue.`) on `theme.css()` / `tasty()`, `palette.css()` / `tasty()`, and `token.css()`, instead of quietly emitting inline colors.
- A color that sets its own hue and is chromatic in light, under the theme hue var's name (a `brand` color with `name: 'brand'`, or, in an unprefixed palette, a color named after another theme), throws and names both sides, instead of silently rendering at the theme's hue.
- In `css()` with `splitHue`, a color's value property that lands on a hue var — `suffix: '-hue'`, or `suffix: ''` with a color named `*-hue` — throws the same way, instead of emitting a `var()` cycle or replacing a hue var with a color. This covers `theme.css()`, `palette.css()` (primary aliases included), and `token.css()`.

Fixed:

- `splitHue` hue declarations are rounded to 2 decimals like the hue in `oklch()` output, so a `from` color emits `--logo-hue: 266.16` instead of `266.15797905637027`.
- A color achromatic in light no longer emits a dead dark `--*-hue` declaration. It renders as a literal `oklch()` in every scheme, and in an unprefixed palette that declaration could override another theme's hue var in dark.
