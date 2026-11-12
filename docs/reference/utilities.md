---
title: Utilities
description: glaze.format and glaze.formatHdr, standalone glaze.shadow and glaze.glow, the color math, tone, contrast-solver, role, and guard functions Glaze exports for custom pipelines, and the measuring module behind the agent tools.
---

Most code only needs `glaze()` and its output methods. The functions on this page are for formatting single values, computing an overlay outside a theme, and building your own pipeline on Glaze's math. Everything here is exported from `'@tenphi/glaze'`, except the [measuring module](#measuring-module), which has its own subpath.

**Scales.** Hue is 0–360 everywhere. Saturation, OKHSL lightness, and stored tone are **0–1** in every converter, writer, and `ResolvedColorVariant`. Only the tone transfers `toTone` / `fromTone` / `toneFromY` / `yFromTone` speak the 0–100 tone axis that authoring uses. See [Scales](./index.md#scales).

## `glaze.format(variant, format?, pastel?)`

Formats one resolved variant as a color string, alpha included.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `ResolvedColorVariant` | — | `{ h, s, t, alpha, pastel? }` from `resolve()`, `glaze.shadow()`, or `glaze.glow()`. |
| `format` | `GlazeColorFormat` | `'oklch'` | `'oklch'`, `'rgb'`, `'hsl'`, `'okhsl'`, or `'okhst'`. Syntax per format: [Color formats](./output.md#color-formats). |
| `pastel` | `boolean` | `false` | Gamut mapping for a variant that carries no `pastel` flag. A variant's own `pastel` always wins. |

- All five formats are accepted. The native-format guard applies to the output methods, not to `glaze.format()`.
- An `alpha` below 1 is appended as `/ A` (up to 4 decimals).

```ts
import { glaze } from '@tenphi/glaze';

const shade = glaze.shadow({ bg: '#ffffff', intensity: 6 });

glaze.format(shade); // 'oklch(0 0 0 / 0.0814)'
glaze.format(shade, 'rgb'); // 'rgb(0 0 0 / 0.0814)'
glaze.format(shade, 'okhst'); // 'okhst(0 0% 0% / 0.0814)'

const accent = glaze.color(
  { hue: 280, saturation: 80, tone: 60 },
  { pastel: true },
);
const light = accent.resolve().light; // light.pastel === true

glaze.format(light); // 'oklch(0.6542 0.089 280)'

const plain = { ...light, pastel: undefined }; // read as non-pastel
glaze.format(plain); // 'oklch(0.6542 0.1604 280)'
```

`glaze.format()` writes the SDR color only. A glow's HDR value has its own writer, below.

## `glaze.formatHdr(variant, hdrFormat?)`

Formats a variant's HDR value, the [`hdr`](./color-definitions.md#hdr-values-resolvedhdr) a glow carries when its step passes SDR white with a `headroom` above 0.

```ts
glaze.formatHdr(
  variant: ResolvedColorVariant,
  hdrFormat?: GlazeHdrFormat,
): string | undefined
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `ResolvedColorVariant` | — | A variant from `resolve()` or `glaze.glow()`. |
| `hdrFormat` | `GlazeHdrFormat` | `'srgb'` | `type GlazeHdrFormat = 'srgb' \| 'srgb-linear'`. |

- `'srgb'` writes extended sRGB, `color(srgb R G B)`: the sRGB curve continued past 1, so `1` is SDR white and the brightest channel is above it. Every string exporter writes this form, and DTCG's `hdr.value` carries the same channels.
- `'srgb-linear'` writes the same color in linear light, `color(srgb-linear R G B)`: the base's linear sRGB times `2^exposure`.
- Both use 4 decimals, don't clamp, and carry no alpha: the value is opaque.
- Returns `undefined` for a variant without `hdr`.
- Any other `hdrFormat` throws `glaze: unknown HDR format "oklch". Use 'srgb' or 'srgb-linear'.` OKLCH lightness clamps at parse time, and `rgb()` / `hsl()` can't go past white. Why extended sRGB: [Extended sRGB](../hdr.mdx#extended-srgb).

```ts
import { glaze } from '@tenphi/glaze';

const v = glaze.glow({
  bg: '#ffffff',
  intensity: 12,
  tuning: { headroom: 1 },
});

glaze.format(v); // 'oklch(1 0 0)' — SDR, pinned at white
v.hdr; // → { h: 0, s: 0, t: 1, exposure: 0.5489… }
glaze.formatHdr(v); // 'color(srgb 1.1813 1.1813 1.1813)'
glaze.formatHdr(v, 'srgb-linear');
// → 'color(srgb-linear 1.4631 1.4631 1.4631)'

const shade = glaze.shadow({ bg: '#ffffff', intensity: 6 });
glaze.formatHdr(shade); // undefined
```

`'#ffffff'` parses a hair below tone 100 (99.9999994), so the white pigment pins at α 1 and SDR is opaque white. A theme's `tone: 100` surface, or `bg: { h: 0, s: 0, t: 1 }`, is exact white: SDR stays transparent (α 0), and the HDR value is the same.

Theme output carries HDR values only with `modes.hdr`; see [HDR output](./output.md#hdr-output).

## `hdrToSrgb(hdr)` / `hdrToLinearSrgb(hdr)`

The channels of an HDR value as numbers, for APIs that take channels instead of a CSS string.

```ts
hdrToSrgb(hdr: ResolvedHdr): [number, number, number]
hdrToLinearSrgb(hdr: ResolvedHdr): [number, number, number]
```

| Function | Returns |
| --- | --- |
| `hdrToSrgb(hdr)` | Extended sRGB channels: the numbers in `glaze.formatHdr()`'s default `color(srgb …)`. A WebGPU `'srgb'` canvas, Apple's extended sRGB, and Android's `EXTENDED_SRGB` take them as they are. |
| `hdrToLinearSrgb(hdr)` | Linear sRGB channels: the base's linear sRGB times `2^exposure`, the numbers in `color(srgb-linear …)`. |

- `hdr` is a variant's [`ResolvedHdr`](./color-definitions.md#hdr-values-resolvedhdr), not the variant.
- Neither clamps nor rounds. `1` is SDR white; the brightest channel is above it, and the others can stay below.
- Write them as strings with [`formatSrgb` / `formatSrgbLinear`](#format-writers). Which platform takes which: [Where it shows](../hdr.mdx#where-it-shows).

```ts
import { hdrToSrgb, hdrToLinearSrgb } from '@tenphi/glaze';

// v: the 12-tone glow on white above
hdrToSrgb(v.hdr!); // [1.1812…, 1.1812…, 1.1812…]
hdrToLinearSrgb(v.hdr!); // [1.4630…, 1.4630…, 1.4630…]
```

## `glaze.shadow(input)` / `glaze.glow(input)`

Compute a shadow or glow overlay over one surface, outside a theme. The result is the pigment and the opacity that lands the composite exactly `intensity × k` tones darker (`shadow`) or lighter (`glow`) than `bg`, the same solve a theme runs per scheme. How it works: [Shadows and glows](../shadows-and-glows.mdx).

```ts
glaze.shadow(input: GlazeShadowInput): ResolvedColorVariant
glaze.glow(input: GlazeGlowInput): ResolvedColorVariant
```

`GlazeShadowInput` is an alias of `GlazeLightingInput`; `GlazeGlowInput` extends it with glow tuning (`tuning?: GlowTuning`):

| Field | Type | Description |
| --- | --- | --- |
| `bg` | `GlazeColorValue` | The surface. Any [color value](./color-tokens.md) form: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()` / `hsl()` / `okhsl()` / `okhst()` / `oklch()` strings, or `{ r, g, b }` / `{ h, s, l }` / `{ h, s, t }` / `{ l, c, h }` objects. An alpha component is dropped with a warning. |
| `fg` | `GlazeColorValue` | Optional. The object casting the shadow or emitting the glow. Same forms. Without it, `k = 1`. |
| `intensity` | `number` | The tone step, 0–100. Clamped. |
| `tuning` | `ShadowTuning` / `GlowTuning` | Optional. Merges field by field over the global `shadowTuning` / `glowTuning` and the defaults. Fields: [`LightingTuning`](./color-definitions.md#lightingtuning). A glow's can set `headroom`; a shadow's `headroom` throws `glaze: glaze.shadow() tuning.headroom is not supported — …`. |

- The object factor is `k = max(0, 1 + β · d · (t_bg − t_fg) / 100)`, with `d = +1` for a shadow, `−1` for a glow, and `β = objectInfluence`.
- There are no schemes here: call it once per surface you composite onto. Per-instance config overrides don't apply; only the global tuning does.
- The result is `{ h, s, t, alpha }` with no `pastel` flag. Format it with `glaze.format()`.
- Compositing is modeled the way browsers paint (`source-over` on gamma-encoded sRGB), and the pigment is an sRGB color, so the result itself can't go past sRGB white. With a `headroom` (from `tuning` or the global `glowTuning`), a glow whose step would pass white also returns [`hdr`](./color-definitions.md#hdr-values-resolvedhdr); format it with [`glaze.formatHdr()`](#glazeformathdrvariant-hdrformat), or read its channels with [`hdrToSrgb()`](#hdrtosrgbhdr--hdrtolinearsrgbhdr).
- An out-of-reach step pins to the pigment's strongest composite and warns `glaze: glaze.glow() cannot reach a 5.0-tone step …`. A glow whose HDR value covers the step doesn't warn; one capped by its `headroom` warns `… even with 1 stop of headroom (reached 22.0). …` ([details](./configuration.md#shadow-or-glow-out-of-reach)).

```ts
glaze.shadow({ bg: '#ffffff', intensity: 6 });
// → { h: 0, s: 0, t: 0, alpha: 0.0814… }

// The same 6-tone step needs more opacity on darker surfaces:
const mid = { h: 0, s: 0, t: 0.5 };
const deep = { h: 0, s: 0, t: 0.1 };
glaze.shadow({ bg: mid, intensity: 6 }).alpha; // 0.1066…
glaze.shadow({ bg: deep, intensity: 6 }).alpha; // 0.4769…

const lift = glaze.glow({ bg: '#1e1e22', fg: '#3a3a44', intensity: 4 });
glaze.format(lift); // 'oklch(1 0 0 / 0.0466)'

glaze.glow({
  bg: 'oklch(0.3 0.02 280)',
  intensity: 6,
  tuning: { tint: 0.3, reach: 0.85 },
});
// → { h: 280, s: 0.3, t: 0.8712…, alpha: 0.0745… }

// A 12-tone glow on a tone-95 gray passes white: SDR pins at
// opaque white, HDR lands tone 107
glaze.glow({
  bg: { h: 0, s: 0, t: 0.95 },
  intensity: 12,
  tuning: { headroom: 1 },
});
// → {
//   h: 0,
//   s: 0,
//   t: 1,
//   alpha: 1,
//   hdr: { h: 0, s: 0, t: 1, exposure: 0.3212… },
// }
```

## Color math

Glaze's color science, exported as plain functions over tuples. `pastel` (default `false`) selects the hue-independent "safe" chroma bound instead of the per-hue sRGB gamut, matching a color's [`pastel`](./color-definitions.md#per-color-pastel) flag.

### Conversions

| Function | Returns | Description |
| --- | --- | --- |
| `okhslToLinearSrgb(h, s, l, pastel?)` | `[r, g, b]` | OKHSL → linear sRGB. Channels can leave 0–1 near the gamut edge; clamp if you need to. |
| `okhslToSrgb(h, s, l, pastel?)` | `[r, g, b]` | OKHSL → gamma-encoded sRGB, clamped to 0–1. |
| `okhslToOklab(h, s, l, pastel?)` | `[L, a, b]` | OKHSL → OKLab. |
| `okhslToOklch(h, s, l, pastel?)` | `[L, C, H]` | OKHSL → OKLCh (`L` 0–1, `C` chroma, `H` degrees). Same math as the `oklch` output. |
| `oklabToOkhsl([L, a, b], pastel?)` | `[h, s, l]` | OKLab → OKHSL. Achromatic colors and the black / white extremes return `[0, 0, l]`. |
| `srgbToOkhsl([r, g, b], pastel?)` | `[h, s, l]` | Gamma-encoded sRGB (0–1) → OKHSL. A gray comes back with saturation 0: an input whose OKLab chroma is under 1e-6, well above the float residue an exact gray leaves (at most 3.7e-8). |
| `hslToSrgb(h, s, l)` | `[r, g, b]` | CSS HSL (`s`, `l` 0–1) → gamma-encoded sRGB. CSS HSL is not OKHSL; chain with `srgbToOkhsl`. |
| `srgbToHex([r, g, b])` | `` `#${string}` `` | Gamma-encoded sRGB → `#rrggbb`. Channels are clamped and rounded to 8 bits; no alpha. |
| `parseHex(hex)` | `[r, g, b] \| null` | `#rgb` / `#rrggbb` → sRGB 0–1. The `#` is optional and digits are case-insensitive. Returns `null` for a wrong length, forms with alpha, and any character that isn't a hex digit — every digit is checked, so `'#1z2z3z'` and `'#-1-2-3'` are `null`. |
| `parseHexAlpha(hex)` | `{ rgb, alpha? } \| null` | `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa`. `alpha` (0–1) is present only for the alpha forms. Same digit check as `parseHex`. |
| `cuspLightness(h)` | `number` | OKHSL lightness (0.001–0.999) where the sRGB gamut's chroma peaks for hue `h`. Cached per hue. |

```ts
import {
  okhslToSrgb,
  okhslToOklch,
  srgbToOkhsl,
  srgbToHex,
  parseHex,
  parseHexAlpha,
  cuspLightness,
} from '@tenphi/glaze';

okhslToSrgb(280, 0.6, 0.5); // [0.4118…, 0.4221…, 0.7644…]
okhslToOklch(280, 0.6, 0.5); // [0.5688…, 0.1326…, 280]
srgbToOkhsl(parseHex('#7a4dbf')!); // [298.5176…, 0.7040…, 0.4527…]
srgbToHex([122 / 255, 77 / 255, 191 / 255]); // '#7a4dbf'
parseHex('#7a4dbf80'); // null
parseHex('#1z2z3z'); // null
parseHexAlpha('#7a4dbf80');
// → { rgb: [0.4784…, 0.3019…, 0.7490…], alpha: 0.5019… }
cuspLightness(110); // 0.9619… (yellow peaks light)
cuspLightness(265); // 0.3688… (blue peaks dark)
```

### Luminance and contrast

| Function | Returns | Description |
| --- | --- | --- |
| `relativeLuminanceFromLinearRgb([r, g, b])` | `number` | WCAG relative luminance, `0.2126·R + 0.7152·G + 0.0722·B`, with no clamping. |
| `gamutClampedLuminance([r, g, b])` | `number` | The same after gamma-encoding, clamping to 0–1, and linearizing again — the luminance a browser actually paints. Glaze's WCAG solver uses this one. |
| `contrastRatioFromLuminance(yA, yB)` | `number` | WCAG ratio `(lighter + 0.05) / (darker + 0.05)`. Argument order doesn't matter. |
| `apcaLuminanceFromLinearRgb([r, g, b])` | `number` | APCA screen luminance `Ys`: gamma-encode, clamp to 0–1, then `0.2126·R^2.4 + 0.7152·G^2.4 + 0.0722·B^2.4`. Glaze's APCA solver uses this one. |

```ts
gamutClampedLuminance([1.2, 0.5, -0.1]); // 0.5702
relativeLuminanceFromLinearRgb([1.2, 0.5, -0.1]); // 0.6054…
apcaLuminanceFromLinearRgb([1.2, 0.5, -0.1]); // 0.5545…
contrastRatioFromLuminance(1, 0); // 21
```

APCA contrast is [`apcaContrast`](#apcacontrastytext-ybg) below.

### Format writers

Write one OKHSL (or OKHST) color as a string. Every writer but `formatSrgb` and `formatSrgbLinear` takes `h` on 0–360 and `s` / `l` / `t` on **0–1** — the scale every converter returns — and scales to percentages itself.

| Function | Output |
| --- | --- |
| `formatOkhsl(h, s, l, pastel?)` | `okhsl(H S% L%)` |
| `formatOkhst(h, s, t, pastel?)` | `okhst(H S% T%)` — `t` is stored tone on 0–1 |
| `formatRgb(h, s, l, pastel?)` | `rgb(R G B)`, channels 0–255 with up to 2 decimals |
| `formatHsl(h, s, l, pastel?)` | `hsl(H S% L%)` |
| `formatOklch(h, s, l, pastel?)` | `oklch(L C H)`, `L` / `C` to 4 decimals, `H` to 2 |
| `formatSrgb([r, g, b])` | `color(srgb R G B)`, extended sRGB channels to 4 decimals, unclamped (below) |
| `formatSrgbLinear([r, g, b])` | `color(srgb-linear R G B)`, linear channels to 4 decimals, unclamped (below) |

```ts
import {
  formatOkhsl,
  formatOkhst,
  formatRgb,
  formatHsl,
  formatOklch,
} from '@tenphi/glaze';

formatOkhsl(280, 0.6, 0.95); // 'okhsl(280 60% 95%)'
formatOkhst(280, 0.6, 0.95); // 'okhst(280 60% 95%)'
formatRgb(280, 0.6, 0.95); // 'rgb(238.45 239.95 251.1)'
formatHsl(280, 0.6, 0.95); // 'hsl(232.92 61.87% 95.99%)'
formatOklch(280, 0.6, 0.95); // 'oklch(0.9571 0.015 280)'
formatOklch(0, 0, 0.5); // 'oklch(0.5688 0 0)'
```

- With `pastel: true`, `formatOkhsl` and `formatOkhst` re-express the saturation as its standard OKHSL equivalent, so parsers that don't know about pastel render the same color: `formatOkhsl(280, 0.6, 0.6, true)` → `'okhsl(280 34.46% 60%)'`. The other writers convert the pastel color directly.
- The writers emit no alpha. For a string with alpha, use [`glaze.format()`](#glazeformatvariant-format-pastel) on a variant.
- A value above 1 means pre-2.0 percentage input: each writer warns once per process ([Percentage scale](./configuration.md#percentage-scale)) and still formats the value.

`formatSrgb(rgb)` and `formatSrgbLinear(rgb)` are the odd ones out: they take sRGB channels, not OKHSL. `formatSrgb` takes **extended sRGB** (gamma-encoded, the curve continued past 1) and writes `color(srgb R G B)`; `formatSrgbLinear` takes **linear sRGB** and writes `color(srgb-linear R G B)`. Both use 4 decimals and don't convert between the two. They don't clamp and don't warn above 1, because that is their job: `1` is SDR white, and one stop above it is `1.3533` extended or `2` linear. They are the writers behind [`glaze.formatHdr()`](#glazeformathdrvariant-hdrformat): `formatSrgb` for its default `'srgb'`, `formatSrgbLinear` for `'srgb-linear'`.

```ts
import { formatSrgb, formatSrgbLinear } from '@tenphi/glaze';

formatSrgb([1.3533, 1.3533, 1.3533]); // 'color(srgb 1.3533 1.3533 1.3533)'
formatSrgbLinear([2, 2, 2]); // 'color(srgb-linear 2 2 2)'
formatSrgb([1.2, 0.5, -0.1]); // 'color(srgb 1.2 0.5 -0.1)'
formatSrgbLinear([1.2, 0.5, -0.1]); // 'color(srgb-linear 1.2 0.5 -0.1)'
```

A resolved variant composes with the writers directly; `variantToOkhsl` turns its tone into OKHSL lightness:

```ts
import {
  glaze,
  variantToOkhsl,
  formatOkhst,
  formatOkhsl,
  formatRgb,
} from '@tenphi/glaze';

const v = glaze.color('#7A4DBF').resolve().light;
const { h, s, l } = variantToOkhsl(v);

formatOkhst(v.h, v.s, v.t); // 'okhst(298.52 70.41% 45.02%)'
formatOkhsl(h, s, l); // 'okhsl(298.52 70.41% 45.27%)'
formatRgb(h, s, l); // 'rgb(122 77 191)'
```

## OKHST tone utilities

The tone transfer behind OKHST. The model and why `eps` is `0.05`: [Tone and OKHST](../okhst.mdx).

| Export | Description |
| --- | --- |
| `toTone(l, eps = REF_EPS)` | OKHSL lightness (0–1) → tone (**0–100**). Divide by 100 for `formatOkhst` or a variant's `t`. |
| `fromTone(t, eps = REF_EPS)` | Tone (**0–100**) → OKHSL lightness (0–1). Inverse of `toTone`. |
| `toneFromY(y, eps = REF_EPS)` | Luminance → tone: `100 · ln((y + eps) / eps) / ln((1 + eps) / eps)`. Luminance 0–1 maps to tone 0–100, unclamped: `Y` above 1 (HDR) gives a tone above 100 (`Y` 2 → 121.98). |
| `yFromTone(t, eps = REF_EPS)` | Tone → luminance. Inverse of `toneFromY`, unclamped past tone 100. |
| `okhstToOkhsl({ h, s, t })` | OKHST (`t` 0–1) → `{ h, s, l }`. |
| `okhslToOkhst({ h, s, l })` | OKHSL → `{ h, s, t }` (`t` 0–1). |
| `variantToOkhsl(variant)` | A `ResolvedColorVariant` → `{ h, s, l }` for rendering. `alpha` and `pastel` stay on the variant. |
| `REF_EPS` | `0.05` — the reference eps of the canonical tone axis. |

`toTone` / `fromTone` measure luminance as a gray of that lightness, so they are exact for neutrals; a chromatic color's real luminance drifts slightly from its tone.

```ts
import {
  toTone,
  fromTone,
  toneFromY,
  yFromTone,
  okhslToOkhst,
} from '@tenphi/glaze';

toTone(0.5); // 50.6998…
fromTone(50); // 0.4941…
toneFromY(0.18); // 50.12…
yFromTone(50); // 0.1791…
okhslToOkhst({ h: 280, s: 0.6, l: 0.5 });
// → { h: 280, s: 0.6, t: 0.5069… }
```

## Contrast solver

The solver Glaze runs for `contrast` floors, exported for tools that work outside a theme. Concepts: [Contrast solving](../contrast.mdx). The spec forms (`ContrastSpec`, presets, high-contrast pairs) are defined in [`ContrastSpec`](./contrast.md#contrastspec).

### Resolving a spec

| Function | Returns | Description |
| --- | --- | --- |
| `resolveMinContrast(value)` | `number` | A `MinContrast` → WCAG ratio. Presets: `'AA'` 4.5, `'AAA'` 7, `'AA-large'` 3, `'AAA-large'` 4.5. Numbers below 1 become 1. |
| `resolveApcaTarget(value)` | `number` | An APCA Lc number or `ApcaPreset` → Lc. Numbers are taken as magnitudes (`-60` → `60`). |
| `resolveContrastForMode(spec, isHighContrast, polarity?, outerExplicitHC?)` | `ResolvedContrast` | One `ContrastSpec` (already picked from any outer pair) → `{ metric, target, polarity? }` for normal or high contrast. Picks the entry of an inner `{ wcag: [...] }` / `{ apca: [...] }` pair. |
| `resolveContrastForLevel(spec, level, polarity?)` | `ResolvedContrast` | An `HCPair<ContrastSpec>` at a manual contrast level (0–100). Resolves both ends with `resolveContrastForMode` and interpolates the target linearly. |

High-contrast escalation in `resolveContrastForMode`, applied only when `isHighContrast` is `true`, `outerExplicitHC` is not set, and the spec has no inner pair:

- WCAG `'AA'` → `'AAA'` (7) and `'AA-large'` → `'AAA-large'` (4.5). AAA presets and bare numbers are unchanged.
- APCA: `+APCA_HC_ENHANCEMENT` (15) Lc, capped at `APCA_MAX_LC` (106); a target already above 106 is kept.

`polarity` (`'fg'` default, or `'bg'`) is copied onto APCA results; WCAG results have no `polarity`. `resolveContrastForLevel` returns the plain normal / high-contrast result at levels 0 and 100, and throws for any level in between when the two ends use different metrics (`glaze: a "contrast" pair cannot switch metric between its normal (wcag) and high-contrast (apca) entry — …`).

```ts
import {
  resolveContrastForMode,
  resolveContrastForLevel,
} from '@tenphi/glaze';

resolveContrastForMode('AA', false);
// → { metric: 'wcag', target: 4.5 }
resolveContrastForMode('AA', true);
// → { metric: 'wcag', target: 7 }
resolveContrastForMode('AA', true, undefined, true);
// → { metric: 'wcag', target: 4.5 }
resolveContrastForMode({ wcag: ['AA', 'AA'] }, true);
// → { metric: 'wcag', target: 4.5 }
resolveContrastForMode({ apca: 75 }, true);
// → { metric: 'apca', target: 90, polarity: 'fg' }
resolveContrastForMode({ apca: 'preferred' }, true, 'bg');
// → { metric: 'apca', target: 105, polarity: 'bg' }
resolveContrastForMode({ apca: [60, 80] }, true);
// → { metric: 'apca', target: 80, polarity: 'fg' }

resolveContrastForLevel('AA', 50);
// → { metric: 'wcag', target: 5.75 }
resolveContrastForLevel({ apca: 60 }, 50, 'bg');
// → { metric: 'apca', target: 67.5, polarity: 'bg' }
```

### `apcaContrast(yText, yBg)`

APCA lightness contrast (APCA-W3 0.1.9, simplified) for two screen luminances. Signed: positive for dark text on a light background, negative for light text on a dark one, `0` below the noise floor.

```ts
import { apcaContrast } from '@tenphi/glaze';

apcaContrast(0, 1); // 106.04… (black on white)
apcaContrast(1, 0); // -107.88… (white on black)
```

The inputs are APCA screen luminance `Ys`, not WCAG relative luminance. Compute them with [`apcaLuminanceFromLinearRgb`](#luminance-and-contrast), the same function the solver and the drift check use, so the score you get is the solver's own. Re-scoring a resolved pair:

```ts
import {
  glaze,
  apcaContrast,
  apcaLuminanceFromLinearRgb,
  okhslToLinearSrgb,
  variantToOkhsl,
} from '@tenphi/glaze';
import type { ResolvedColorVariant } from '@tenphi/glaze';

const theme = glaze({ hue: 265, saturation: 70 });
theme.colors({
  surface: { tone: 97 },
  text: { base: 'surface', tone: 60, contrast: { apca: 75 } },
});
const resolved = theme.resolve();

const ys = (v: ResolvedColorVariant) => {
  const { h, s, l } = variantToOkhsl(v);
  return apcaLuminanceFromLinearRgb(okhslToLinearSrgb(h, s, l, v.pastel));
};

const text = resolved.get('text')!;
const surface = resolved.get('surface')!;
apcaContrast(ys(text.light), ys(surface.light)); // 75.5060…
apcaContrast(ys(text.dark), ys(surface.dark)); // -75.5011…
```

Both land just past 75.5 rather than at 75: the search aims 0.5 Lc beyond the target (see [`findToneForContrast`](#findtoneforcontrastoptions)). The sign is the polarity — dark text on the light surface, light text on the dark one.

### `findToneForContrast(options)`

Searches tone for the value nearest `preferredTone` that meets a floor against a base color. All tones are on 0–1.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `hue` | `number` | — | Candidate hue, 0–360. |
| `saturation` | `number` | — | Candidate OKHSL saturation, 0–1. |
| `preferredTone` | `number` | — | Starting tone. Returned as is if it already clears the overshoot (see below), and kept when it clears the bare target and nothing searched does better (see `branch`). |
| `baseLinearRgb` | `[r, g, b]` | — | The base color, linear sRGB. |
| `contrast` | `ResolvedContrast` | — | `{ metric, target, polarity? }`, e.g. from `resolveContrastForMode`. |
| `toneRange` | `[number, number]` | `[0, 1]` | Search bounds. Glaze itself searches the full `[0, 1]` and only clamps `preferredTone` into the scheme's tone window (`'max'` / `'min'` excepted), so a floor can push a color past the window. |
| `epsilon` | `number` | `1e-4` | Convergence threshold. |
| `maxIterations` | `number` | `18` | Binary-search iterations per side. |
| `initialDirection` | `'lighter' \| 'darker'` | Side whose bound scores higher; a tie within float noise (a gray base at tone 50) starts `'darker'` | Side to search first. When `preferredTone` sits on a bound, the only open side. |
| `flip` | `boolean` | `false` | Also search the opposite side. Without it, a side that can't reach the target pins the result to that side's bound, unless `preferredTone` itself clears the bare target: it is then kept, met, with `branch: 'preferred'`. When both sides pass, the result nearer `preferredTone` wins; a tie keeps `initialDirection`. |
| `preferInitial` | `boolean` | `false` | With `flip`, when both sides pass, keep `initialDirection` instead of the result nearer `preferredTone`. The manual contrast level uses it so a color keeps its side across the ramp. |
| `pastel` | `boolean` | `false` | Use the pastel gamut for the candidate. |

`FindToneForContrastResult`:

| Field | Type | Description |
| --- | --- | --- |
| `tone` | `number` | The chosen tone, 0–1. |
| `contrast` | `number` | The achieved score: WCAG ratio or APCA Lc magnitude. |
| `met` | `boolean` | Whether `contrast` reaches the target. |
| `branch` | `'lighter' \| 'darker' \| 'preferred'` | The side the result was found on; a met result sits on that side of the base. `'preferred'` whenever a met result is `preferredTone` itself: it already cleared the overshoot, or it clears the bare target and no search could improve on it (no searched side met the floor, or the starting side's only position was `preferredTone`, on that side's bound). Also `'preferred'` when `toneRange` leaves no room to search and no `initialDirection` is given, met or not (with one, an unmet result names that direction). An unmet result otherwise names the side whose bound it pinned to. |
| `flipped` | `true` (optional) | Present when the result is on the side opposite `initialDirection`. |

The search aims slightly past the target (WCAG ×1.01, APCA +0.5 Lc) to absorb rounding in the output formats; `met` is judged against the exact target. WCAG scores use `gamutClampedLuminance`, APCA scores use `Ys` with `polarity` deciding which side is the text.

The two sides meet at `preferredTone`. Once it misses the overshoot target it sits between the passing tones on either side of the base, so each side can only reach its own: a met `'darker'` result sits below the base and a `'lighter'` one above it, and clears the overshoot unless it is that side's bound. A side that can't reach the target reports its bound, never a tone next to `preferredTone`. When no searched side reaches the floor but `preferredTone` clears the bare target (it sits on a bound, or `flip` is off and `initialDirection` points away from it), `preferredTone` wins over the unmet bound: it is returned met, with `branch: 'preferred'`. White against a tone-35 gray at a 7.2:1 floor comes back as `{ tone: 1, contrast: 7.23…, met: true, branch: 'preferred' }`.

For WCAG, the first side measures the closed-form gray seed (the gray tone at exactly the target ratio) before it bisects. The seed is only a probe: it narrows the search but never bounds it, so a chromatic color still lands on its own crossing nearest `preferredTone`, at about the overshoot (4.546:1 for a 4.5 floor). Without `initialDirection`, the search starts toward the bound that scores higher, and a float-noise tie between the two (a gray base at tone 50) starts darker. With `flip`, two passing sides whose distances from `preferredTone` differ by no more than twice the search resolution (`epsilon`, or the solver's 0.0001 tone step if coarser) count as a tie. A neutral color whose `preferredTone` is the base's own tone sits exactly as far from either crossing, so without that margin search noise would pick its side.

```ts
import {
  findToneForContrast,
  okhslToLinearSrgb,
  fromTone,
} from '@tenphi/glaze';

const surface = okhslToLinearSrgb(280, 0.1, fromTone(97));

findToneForContrast({
  hue: 280,
  saturation: 0.6,
  preferredTone: 0.9,
  baseLinearRgb: surface,
  contrast: { metric: 'wcag', target: 4.5 },
});
// → { tone: 0.4846…, contrast: 4.54…, met: true, branch: 'darker' }

findToneForContrast({
  hue: 280,
  saturation: 0.6,
  preferredTone: 0.9,
  baseLinearRgb: surface,
  contrast: { metric: 'wcag', target: 4.5 },
  initialDirection: 'lighter',
});
// → { tone: 1, contrast: 1.09…, met: false, branch: 'lighter' }

// …with flip: true
// → {
//   tone: 0.4846…,
//   contrast: 4.54…,
//   met: true,
//   branch: 'darker',
//   flipped: true,
// }
```

### `findValueForMixContrast(options)`

The same search over a mix parameter (0–1) between a base and a target — what [mix](../mixes.mdx) colors with `contrast` run.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preferredValue` | `number` | — | Starting mix value, 0–1. Returned as-is if it already clears the overshoot (WCAG ×1.01, APCA +0.5 Lc). |
| `baseLinearRgb` | `[r, g, b]` | — | The base color, linear sRGB. Contrast is measured against it. |
| `contrast` | `ResolvedContrast` | — | The floor. |
| `luminanceAtValue` | `(t: number) => number` | — | Luminance of the mixed color at `t`, in the metric's basis (WCAG Y or APCA `Ys`). The solver sees the mix's target color, blend, and color space only through this function. |
| `epsilon` | `number` | `1e-4` | Convergence threshold. |
| `maxIterations` | `number` | `20` | Binary-search iterations per side. |
| `flip` | `boolean` | `false` | Also search the opposite side of `preferredValue`. |

It starts toward whichever end (0 or 1) scores higher (a tie starts toward 0), or toward the only open side when `preferredValue` is 0 or 1, and on failure pins to the end it started toward. As with tone, the two sides meet at `preferredValue`, and a side that can't reach the target reports its end, never a value next to `preferredValue`. When no searched side reaches the floor but `preferredValue` itself clears the bare target, it is kept, met. So a mix at value 1 keeps a pure target that clears the floor, even inside the overshoot, and pins to 0, the pure base, only when the pure target misses. `FindValueForMixContrastResult` is `{ value, contrast, met, flipped? }`. The options have no `targetLinearRgb`: the solver sees the target only through `luminanceAtValue`.

```ts
import {
  findValueForMixContrast,
  okhslToLinearSrgb,
  relativeLuminanceFromLinearRgb,
  fromTone,
} from '@tenphi/glaze';

const base = okhslToLinearSrgb(280, 0.1, fromTone(97));
const target = okhslToLinearSrgb(280, 0.6, fromTone(30));
const lerp = (t: number) =>
  base.map((c, i) => c + (target[i] - c) * t) as [number, number, number];

findValueForMixContrast({
  preferredValue: 0.1,
  baseLinearRgb: base,
  contrast: { metric: 'wcag', target: 3 },
  luminanceAtValue: (t) => relativeLuminanceFromLinearRgb(lerp(t)),
});
// → { value: 0.766…, contrast: 3.03…, met: true }

// A pure target at 4.52:1 against white: inside the overshoot,
// above the bare 4.5, so value 1 is kept
const yTarget = 1.05 / 4.52 - 0.05;
findValueForMixContrast({
  preferredValue: 1,
  baseLinearRgb: [1, 1, 1],
  contrast: { metric: 'wcag', target: 4.5 },
  luminanceAtValue: (t) => 1 + (yTarget - 1) * t,
});
// → { value: 1, contrast: 4.52, met: true }
```

### Constants and types

| Export | Value |
| --- | --- |
| `APCA_PRESETS` | `{ preferred: 90, body: 75, content: 60, large: 45, 'non-text': 30, min: 15 }` — use cases in [APCA presets](./contrast.md#apca-presets). |
| `APCA_HC_ENHANCEMENT` | `15` — Lc added to a bare APCA target in high contrast. |
| `APCA_MAX_LC` | `106` — cap on an escalated APCA target. |

| Type | Shape |
| --- | --- |
| `ContrastPreset` | `'AA' \| 'AAA' \| 'AA-large' \| 'AAA-large'` |
| `ApcaPreset` | `'preferred' \| 'body' \| 'content' \| 'large' \| 'non-text' \| 'min'` |
| `ResolvedContrast` | `{ metric: 'wcag' \| 'apca'; target: number; polarity?: 'fg' \| 'bg' }` — `target` is a WCAG ratio or an APCA Lc magnitude. |
| `FindToneForContrastOptions` / `FindToneForContrastResult` | [`findToneForContrast`](#findtoneforcontrastoptions) |
| `FindValueForMixContrastOptions` / `FindValueForMixContrastResult` | [`findValueForMixContrast`](#findvalueformixcontrastoptions) |

## Role helpers

A color's role fixes its APCA polarity. How Glaze picks one: [Roles and APCA polarity](../contrast.mdx#roles-and-apca-polarity). The `Role` and `RoleInput` types are in [Roles](./color-definitions.md#roles).

| Function | Returns | Description |
| --- | --- | --- |
| `normalizeRole(input)` | `Role \| undefined` | A role or alias → `'text'`, `'surface'`, or `'border'`. `undefined` for unknown strings and `undefined`. |
| `inferRoleFromName(name)` | `Role \| undefined` | Splits the name on non-alphanumerics and lowercase-to-uppercase humps and matches each token against the role keywords. The **last** match wins. |
| `roleToPolarity(role)` | `Polarity` | `'surface'` → `'bg'` (the base is the text); `'text'` and `'border'` → `'fg'`. |
| `oppositeRole(role)` | `Role` | `'surface'` → `'text'`; `'text'` and `'border'` → `'surface'`. Used for a dependent color with no role of its own. |

`Polarity` is `'fg' | 'bg'`.

```ts
import {
  normalizeRole,
  inferRoleFromName,
  roleToPolarity,
  oppositeRole,
} from '@tenphi/glaze';

normalizeRole('ink'); // 'text'
normalizeRole('rule'); // 'border'
inferRoleFromName('button-text'); // 'text'
inferRoleFromName('inputBg'); // 'surface'
inferRoleFromName('card_border-outline'); // 'border'
inferRoleFromName('text-on-surface'); // 'surface' — last match wins
inferRoleFromName('BGColor'); // undefined — an all-caps run isn't split
inferRoleFromName('accent'); // undefined
roleToPolarity('border'); // 'fg'
oppositeRole('border'); // 'surface'
```

## Export guards

The checks the output methods run, exported for custom exporters.

| Function | Throws when |
| --- | --- |
| `assertNativeFormat(format, method)` | `format` is `'okhsl'` or `'okhst'`. `undefined` and native formats pass. `method` names the caller in the message. |
| `assertAllPastel(resolved, modes)` | Any variant included by `modes` is not pastel. `resolved` is a `Map<string, ResolvedColor>` (`theme.resolve()`); `modes` must have both `dark` and `highContrast` set. `light` is always checked, `dark` with `modes.dark`, `lightContrast` with `modes.highContrast`, `darkContrast` with both. |

```ts
import {
  glaze,
  assertNativeFormat,
  assertAllPastel,
} from '@tenphi/glaze';

assertNativeFormat('okhst', 'css');
// throws:
// glaze: okhst output is only supported by tasty() (not a native CSS
//   color space).
// Use tasty({ format: 'okhst' }) or pick a native format (oklch|hsl|rgb)
//   for css().

const theme = glaze(280, 80);
theme.colors({
  surface: { tone: 97 },
  accent: { tone: 50, pastel: true },
});
assertAllPastel(theme.resolve(), { dark: true, highContrast: false });
// throws:
// glaze: splitHue requires every color to be pastel (…).
// Non-pastel: surface.
// Set pastel: true (per-theme, per-token, or per-color) or drop splitHue.
```

Where the output methods apply them: [Color formats](./output.md#color-formats) and [`splitHue` requirements](./output.md#requirements).

## Snapshot type guards

`isThemeExport`, `isColorTokenExport`, and `isPaletteExport` are exported as named functions and as `glaze.*` statics. They tell authoring snapshots apart by `kind` (or by shape for legacy snapshots) and don't validate `version`. Exact rules: [Type guards](./index.md#type-guards).

```ts
import { isThemeExport, glaze } from '@tenphi/glaze';

const data: unknown = JSON.parse(saved);
if (isThemeExport(data)) glaze.themeFrom(data);
```

The `splitHue` planning types `HuePlan`, `HueDeclaration`, and `ChannelCtx` are documented in [Output formats](./output.md#planning-types).

## Measuring module

`@tenphi/glaze/harness/measure` is the module the agent tools of Glaze's harness measure with: `glaze:inspect`, `glaze:color` and `glaze:contrast`. Import it to build your own tool on top, such as a token lookup for a design system's palette. It is ESM only, ships its types, and follows semver like the rest of the API.

Every function that resolves or measures takes the Glaze module first. Pass the instance your themes come from: Glaze's config lives in that instance.

```ts
import * as g from '@tenphi/glaze';
import {
  inspectColor,
  inspectTheme,
  missesOf,
} from '@tenphi/glaze/harness/measure';

const report = inspectTheme(g, theme, 'default');
missesOf([report]); // every missed floor, per scheme

inspectColor(g, '#2563eb', { base: '#ffffff', contrast: 'AA' }).schemes.dark;
// → { value: '#5486ed', hue: 262.9, saturation: 85.2, tone: 59.6, alpha: 1,
//     base: '#222222', wcag: 4.55, apca: 37.1, target: 4.5, pass: true }
// (numbers rounded here)
```

| Export | Returns | Description |
| --- | --- | --- |
| `inspectTheme(g, theme, name, format?)` | `InspectedTheme` | Every color of a theme in the four schemes, and each color with a `base` measured against it. A color with a `contrast` floor gets `pass` per scheme. |
| `filterThemes(themes, { themes?, colors? })` | `InspectedTheme[]` | Keeps the named themes and, in each, the colors whose name contains any of the parts, plus the base each is measured against. Throws on an unknown theme or when no color matches. |
| `missesOf(themes)` | `Miss[]` | Every missed floor: theme, color, scheme label, metric, value, target. |
| `inspectColor(g, input, options?)` | `InspectedColorToken` | One color as `glaze.color()` resolves it: each scheme's value, hue, saturation and tone (0–100), and with a `base` its WCAG and APCA contrast there. Options: `base`, `contrast` (both replace the input's own), `format`. |
| `measurePair(g, text, background)` | `MeasuredPair` | WCAG ratio and signed APCA Lc of two literal colors, and the presets the pair passes. |
| `parseColor(g, value)` | `ResolvedColorVariant` | The exact light variant of a color value. |
| `formatVariant(g, variant, format?, pastel?)` | `string` | Hex (with an alpha byte when translucent) or a `glaze.format()` format. |
| `roleOf(g, name, defs, inferRole)` | `Role` | The role a theme gives a color: explicit, else by name, else the opposite of its base's, else `'text'`. |
| `themesFromSnapshot(g, data, name?)`, `themesFromObject(value, name?)` | `[name, GlazeTheme][]` | The themes of a theme or palette snapshot, or of a theme or palette object. |
| `kindOf(value)` | `'theme' \| 'palette' \| undefined` | Tells a theme from a palette, by shape. |
| `SCHEMES`, `WCAG_PRESETS`, `FORMATS` | Constants | The four schemes in display order, the WCAG presets, and the print formats. |

Contrast is measured the way the solver measures it: in the metric's own luminance, with each variant's `pastel` flag, and with APCA polarity from the color's role (`apca` is the Lc magnitude). A translucent color or base is not measured: its scheme has `translucent: true`.
