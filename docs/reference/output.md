---
title: Output formats
description: Every output method (tokens, tasty, json, css, dtcg, dtcgResolver, tailwind), its options, color formats, output modes, state aliases, splitHue, and HDR output.
---

Output methods turn a resolved theme or palette into color strings or token documents. They exist on [themes](./theme.md) and [palettes](./palette.md) with the same options, except that palette `tasty()` and `css()` have no `name` (each theme's hue var is named after the theme); palettes add [prefix and primary options](./palette.md#glazepaletteexportoptions). Standalone [color tokens](./color-tokens.md) have single-color versions of the same methods. For choosing an export and wiring it into an app, see [Exporting and integration](../exporting.mdx).

Examples on this page use this theme:

```ts
import { glaze } from '@tenphi/glaze';

const theme = glaze(280, 80);
theme.colors({
  surface: { tone: 97 },
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
  accent: { tone: 52, mode: 'fixed' },
});
```

## Output methods at a glance

| Method | Returns | Options type | Honors `modes` |
| --- | --- | --- | --- |
| [`tokens()`](#tokensoptions) | `{ light: { name: value }, dark: {…}, … }` | `GlazeJsonOptions` | Yes |
| [`tasty()`](#tastyoptions) | `{ '#name': { '': value, [state]: value } }` | `GlazeTastyOptions` | Yes |
| [`json()`](#jsonoptions) | `{ name: { light: value, dark: value, … } }` | `GlazeJsonOptions` | Yes |
| [`css()`](#cssoptions) | `GlazeCssResult` (four strings) | `GlazeCssOptions` | No: all four, and its own `hdr` option |
| [`dtcg()`](#dtcgoptions) | `GlazeDtcgResult` (one document per variant) | `GlazeDtcgOptions` | Yes |
| [`dtcgResolver()`](#dtcgresolveroptions) | `GlazeDtcgResolverDocument` | `GlazeDtcgResolverOptions` | Yes |
| [`tailwind()`](#tailwindoptions) | `string` (CSS) | `GlazeTailwindOptions` | Yes |

With `modes.hdr`, every method also emits the HDR values of glows past SDR white, next to the SDR ones. See [HDR output](#hdr-output).

[`format`](#color-formats) applies to every method except `dtcg()` and `dtcgResolver()`: `'oklch'`, `'rgb'`, or `'hsl'`, and on `tasty()` also the Tasty-only `'okhsl'` and `'okhst'`. The two DTCG methods emit structured values and take `colorSpace` instead.

Every method resolves the theme first (results are cached; see [`theme.resolve()`](./theme.md#themeresolve)). Tokens are emitted in dependency order.

## Scheme variants

Glaze always resolves four variants per color. `ResolvedColor` and the results of `tokens()`, `json()`, `css()`, and `dtcg()` key them by the names below. `tasty()` keys them by [state alias](#state-aliases), `tailwind()` by selector, and `dtcgResolver()` uses the names as its default context names, which `contextNames` can rename.

| Variant | Scheme | Emitted when |
| --- | --- | --- |
| `light` | Light, normal contrast | Always. |
| `dark` | Dark, normal contrast | `modes.dark` |
| `lightContrast` | Light, high contrast | `modes.highContrast` |
| `darkContrast` | Dark, high contrast | `modes.dark` and `modes.highContrast` |

How the variants are computed is in [Light, dark, and high contrast](../schemes.mdx).

## Output modes

`GlazeOutputModes` controls which variants `tokens()`, `tasty()`, `json()`, `dtcg()`, `dtcgResolver()`, and `tailwind()` emit, and whether they add HDR values. `css()` has no `modes` option: it always returns all four strings, and its own [`hdr`](#cssoptions) option falls back to the global `modes.hdr`.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `dark` | `boolean` | `true` | Include the `dark` variant (and `darkContrast` when `highContrast` is on). |
| `highContrast` | `boolean` | `false` | Include `lightContrast` (and `darkContrast` when `dark` is on). |
| `hdr` | `boolean` | `false` | Add the HDR values of glows past SDR white, for the variants the other two fields include. Off, every output is byte-identical to SDR, even with a `headroom` set. See [HDR output](#hdr-output). |

```ts
// Light only
theme.tokens({ modes: { dark: false } });

// Light + dark (the default)
theme.tokens({ modes: { highContrast: false } });

// All four variants
theme.tokens({ modes: { dark: true, highContrast: true } });
// → { light, dark, lightContrast, darkContrast }

// Light + light high contrast
theme.tokens({ modes: { dark: false, highContrast: true } });
// → { light, lightContrast }
```

Each field resolves separately, highest priority first:

1. A **global** [`contrastLevel`](./contrast.md#manual-contrast-level) of `100` forces `highContrast: false`, even against an explicit per-call `highContrast: true`. At that level the normal variants already *are* the high-contrast ones, so the tier would duplicate them. Its HDR maps and blocks go with it. Any other level leaves `highContrast` alone.
2. The per-call `modes` option.
3. `glaze.configure({ modes })` — the global config ([Configuration](./configuration.md)).
4. The built-in default `{ dark: true, highContrast: false, hdr: false }`.

`modes` is global or per call only — it is not part of a theme's config override. A `contrastLevel` set on one theme or token (rather than globally) never changes which modes are emitted: its high-contrast variants are still emitted when requested, with values equal to its normal ones at level `100`. With a global level of `100`, `css()` still returns all four strings, and `lightContrast` / `darkContrast` equal `light` / `dark`.

## Color formats

The `format` option picks the color string syntax for `tokens()`, `tasty()`, `json()`, `css()`, and `tailwind()` on themes and palettes, and for the [color token](./color-tokens.md) methods `token()`, `tasty()`, `json()`, `css()`, and `tailwind()`. The default is `'oklch'`.

| `format` | Output (alpha = 1) | Output (alpha < 1) | Notes |
| --- | --- | --- | --- |
| `'oklch'` (default) | `oklch(L C H)` | `oklch(L C H / A)` | Native CSS. `L` and `C` to 4 decimals, `H` to 2. An achromatic color is `oklch(L 0 0)`. Required for [`splitHue`](#hue-channel-splitting-splithue). |
| `'rgb'` | `rgb(R G B)` | `rgb(R G B / A)` | Channels 0–255 with up to 2 decimals — not rounded to integers, so 8-bit quantization can't shift a solved contrast. |
| `'hsl'` | `hsl(H S% L%)` | `hsl(H S% L% / A)` | Up to 2 decimals. |
| `'okhsl'` | `okhsl(H S% L%)` | `okhsl(H S% L% / A)` | Glaze's native space; not a CSS function. **[Tasty](https://tasty.style) only** (see the guard below). |
| `'okhst'` | `okhst(H S% T%)` | `okhst(H S% T% / A)` | OKHSL with the [tone](../okhst.mdx) axis. **Tasty only.** |

All values use the modern space-separated syntax and strip trailing zeros (`95`, not `95.0`). Alpha is printed to at most 4 decimals. A glow's HDR value ignores `format`: it is always extended `color(srgb R G B)` (see [HDR strings](#hdr-strings)).

```ts
theme.tokens().light.surface;
// → 'oklch(0.97 0.0128 280)'
theme.tokens({ format: 'rgb' }).light.surface;
// → 'rgb(243.08 244.36 253.89)'
theme.tokens({ format: 'hsl' }).light.surface;
// → 'hsl(232.87 82.96% 97.45%)'
theme.tasty({ format: 'okhsl' })['#surface'][''];
// → 'okhsl(280 80% 96.51%)'
theme.tasty({ format: 'okhst' })['#surface'][''];
// → 'okhst(280 80% 97.15%)'
```

**Native-format guard.** `okhsl` and `okhst` are not CSS color spaces. Only the methods that return Tasty state maps accept them — `tasty()` on themes and palettes, and `token()` / `tasty()` on color tokens. Every other method throws:

```text
glaze: okhst output is only supported by tasty() (not a native CSS
  color space).
Use tasty({ format: 'okhst' }) or pick a native format (oklch|hsl|rgb)
  for css().
```

The guard is exported as [`assertNativeFormat`](./utilities.md#export-guards) for custom pipelines.

**Pastel colors.** For a [`pastel`](./color-definitions.md#per-color-pastel) color, `okhsl` and `okhst` output re-express the saturation as its standard (non-pastel) OKHSL equivalent, so parsers that don't know about `pastel` render the same color. The other formats are computed from the gamut-mapped color directly.

DTCG output doesn't use `format`; it emits structured `$value` objects. Pick their representation with [`colorSpace`](#dtcgoptions).

To format a single resolved variant yourself, use [`glaze.format()`](./utilities.md#glazeformatvariant-format-pastel).

## `tokens(options?)`

A flat token map grouped by scheme variant. Keys are color names (prefixed in palettes).

```ts
theme.tokens();
// → {
//   light: {
//     surface: 'oklch(0.97 0.0128 280)',
//     'surface-text': 'oklch(0.5286 0.1912 280)',
//     accent: 'oklch(0.5961 0.181 280)',
//   },
//   dark: {
//     surface: 'oklch(0.279 0.1015 280)',
//     'surface-text': 'oklch(0.6531 0.144 280)',
//     accent: 'oklch(0.5955 0.1601 280)',
//   },
// }
```

`GlazeJsonOptions`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `GlazeColorFormat` | `'oklch'` | `'oklch'`, `'rgb'`, or `'hsl'`. `'okhsl'` / `'okhst'` throw. |
| `modes` | `GlazeOutputModes` | Global config (`{ dark: true, highContrast: false, hdr: false }`) | Which variants to include. See [Output modes](#output-modes). |

Variant keys that are not emitted are absent from the result. With `modes.hdr`, each emitted variant map is followed by a dense `<variant>Hdr` map (`light`, `lightHdr`, `dark`, `darkHdr`, …); see [HDR output](#hdr-in-each-exporter).

## `tasty(options?)`

Style-to-state bindings for the [Tasty](https://tasty.style) style system. Keys are `#name` color tokens; each value maps state aliases to colors, with `''` as the default (light) state. Spread the result into component styles or register it as a recipe.

```ts
theme.tasty();
// → {
//   '#surface': {
//     '': 'oklch(0.97 0.0128 280)',
//     '@media(prefers-color-scheme: dark)': 'oklch(0.279 0.1015 280)',
//   },
//   '#surface-text': {
//     '': 'oklch(0.5286 0.1912 280)',
//     '@media(prefers-color-scheme: dark)': 'oklch(0.6531 0.144 280)',
//   },
//   '#accent': { … },
// }
```

`GlazeTastyOptions` — `GlazeTokenOptions` (the first five rows, also taken by [`token.tasty()`](./color-tokens.md#token-methods)) plus `splitHue` and `name`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `GlazeColorFormat` | `'oklch'` | Any of the five formats, including the Tasty-only `'okhsl'` and `'okhst'`. |
| `modes` | `GlazeOutputModes` | Global config | Which variants to include, and whether to add HDR keys. |
| `states.dark` | `string` | Global `states.dark` (`'@media(prefers-color-scheme: dark)'`) | State alias for the dark variant. |
| `states.highContrast` | `string` | Global `states.highContrast` (`'@media(prefers-contrast: more)'`) | State alias for the light high-contrast variant. |
| `states.hdr` | `string` | Global `states.hdr` (`'@media(dynamic-range: high)'`) | State alias for a glow's HDR value. Used only with `modes.hdr`. Experimental; see [HDR output](#hdr-output). |
| `splitHue` | `boolean` | `false` | Emit hue as separate `$name-hue` tokens referenced with `var()`. Throws unless `format` is `'oklch'`. See [`splitHue`](#hue-channel-splitting-splithue). |
| `name` | `string` | `'theme'` | Base name of the theme-level hue var (`$theme-hue` / `--theme-hue`). Used only with `splitHue`. `palette.tasty()` has no `name`: it uses each theme's name. |

### State aliases

`tasty()` is the only output that uses state aliases. The defaults are media-query states, so the tokens follow the operating system preference without registering custom states:

| Variant | State key |
| --- | --- |
| `light` | `''` |
| `dark` | `states.dark` — default `'@media(prefers-color-scheme: dark)'` |
| `lightContrast` | `states.highContrast` — default `'@media(prefers-contrast: more)'` |
| `darkContrast` | `` `${states.dark} & ${states.highContrast}` `` — default `'@media(prefers-color-scheme: dark) & @media(prefers-contrast: more)'` |
| HDR value of any variant | `states.hdr` after `''`, `` `${key} & ${states.hdr}` `` after any other key — default `'@media(dynamic-range: high)'`. Only with `modes.hdr`. |

With `modes.hdr`, a variant that has an HDR value adds its key right after its SDR key, so the order is `''`, hdr, dark, dark & hdr, hc, hc & hdr, dark & hc, dark & hc & hdr, with only the HDR keys that exist. Tasty gives later keys priority, so a dark key still beats the light HDR one. See [HDR output](#hdr-in-each-exporter).

Set them globally with `glaze.configure({ states })` or per call. Custom states such as `@dark` must be registered in your Tasty config:

```ts
glaze.configure({
  states: { dark: '@dark', highContrast: '@hc' },
  modes: { highContrast: true },
});

theme.tasty()['#surface'];
// → {
//   '': 'oklch(0.97 0.0128 280)',
//   '@dark': 'oklch(0.279 0.1015 280)',
//   '@hc': 'oklch(0.9685 0.0134 280)',
//   '@dark & @hc': 'oklch(0.1685 0.0615 280)',
// }
```

A per-call `states` object overrides only the fields it sets; `theme.tasty({ states: { dark: '@night' } })` keeps the global high-contrast alias.

## `json(options?)`

A per-color map of variant values.

```ts
theme.json();
// → {
//   surface: {
//     light: 'oklch(0.97 0.0128 280)',
//     dark: 'oklch(0.279 0.1015 280)',
//   },
//   'surface-text': {
//     light: 'oklch(0.5286 0.1912 280)',
//     dark: 'oklch(0.6531 0.144 280)',
//   },
//   accent: {
//     light: 'oklch(0.5961 0.181 280)',
//     dark: 'oklch(0.5955 0.1601 280)',
//   },
// }
```

Same options as [`tokens()`](#tokensoptions) (`GlazeJsonOptions`). With `modes.hdr`, a variant that has an HDR value adds a `<variant>Hdr` key right after its SDR key (`light`, `lightHdr`, `dark`, …); see [HDR output](#hdr-in-each-exporter). The result holds resolved strings; it is not an authoring snapshot — use [`theme.export()`](./theme.md#themeexportoverride) for that. [`palette.json()`](./palette.md#palettejson) groups by theme name.

## `css(options?)`

CSS custom property declarations, one string per variant. Each string is newline-separated `--<name><suffix>: <value>;` lines, ready to drop into a rule.

```ts
theme.css();
// → {
//   light:
//     '--surface-color: oklch(0.97 0.0128 280);\n' +
//     '--surface-text-color: oklch(0.5286 0.1912 280);\n' +
//     '--accent-color: oklch(0.5961 0.181 280);',
//   dark:
//     '--surface-color: oklch(0.279 0.1015 280);\n' +
//     '--surface-text-color: oklch(0.6531 0.144 280);\n' +
//     '--accent-color: oklch(0.5955 0.1601 280);',
//   lightContrast: '--surface-color: oklch(0.9685 0.0134 280);\n…',
//   darkContrast: '--surface-color: oklch(0.1685 0.0615 280);\n…',
// }
```

`GlazeCssOptions`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `GlazeColorFormat` | `'oklch'` | `'oklch'`, `'rgb'`, or `'hsl'`. `'okhsl'` / `'okhst'` throw. |
| `suffix` | `string` | `'-color'` | Appended to each property name. Pass `''` for bare names (`--surface`). With `splitHue`, a suffix that lands a value on a hue var (`'-hue'`) throws; see [Variable names](#variable-names). |
| `splitHue` | `boolean` | `false` | Emit hue as separate `--*-hue` properties referenced with `var()`. Throws unless `format` is `'oklch'`. See [`splitHue`](#hue-channel-splitting-splithue). |
| `name` | `string` | `'theme'` | Base name of the theme-level hue var (`--theme-hue`). Used only with `splitHue`. `palette.css()` has no `name`: it uses each theme's name. |
| `hdr` | `boolean` | Global `modes.hdr` (`false`) | Add `result.hdr`, the HDR tier. Experimental; see [HDR output](#hdr-output). |

`GlazeCssResult` always has all four keys — `light`, `dark`, `lightContrast`, `darkContrast` — whatever `modes` says. A key is `''` when the theme has no colors. When HDR output is on, it also has `hdr`: a `GlazeCssSchemeBlocks` with the same four keys. Which selectors or media queries to wrap each string in is up to you; [Exporting and integration](../exporting.mdx) shows common setups.

## `dtcg(options?)`

W3C [Design Tokens Format Module (2025.10)](https://www.designtokens.org/) documents — the vendor-neutral JSON format read by Figma, Tokens Studio, Style Dictionary v4+, Terrazzo, Penpot, and other DTCG tools. Returns one spec-conformant token tree per scheme variant.

```ts
theme.dtcg();
// → {
//   light: {
//     surface: {
//       $type: 'color',
//       $value: {
//         colorSpace: 'srgb',
//         components: [0.953256, 0.958291, 0.995646],
//         hex: '#f3f4fe',
//       },
//     },
//     …
//   },
//   dark: {
//     surface: {
//       $type: 'color',
//       $value: {
//         colorSpace: 'srgb',
//         components: [0.130873, 0.118318, 0.346863],
//         hex: '#211e58',
//       },
//     },
//     …
//   },
// }
```

Write each document to its own `.tokens.json` file. One file per scheme is the most tool-compatible convention: one per Style Dictionary theme, Tokens Studio set, or Figma variable mode.

`GlazeDtcgOptions`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `colorSpace` | `DtcgColorSpace` | `'srgb'` | `'srgb'` emits gamma sRGB `components` (0–1) plus a `hex` hint — understood everywhere. `'oklch'` emits `[L, C, H]` components and no `hex` — Glaze-native and wide-gamut. |
| `modes` | `GlazeOutputModes` | Global config | Which variants to include. `light` is always present. |

`GlazeDtcgResult` has `light` (always) and `dark`, `lightContrast`, `darkContrast`, each `undefined` when its mode is off.

Token shapes:

| Type | Shape |
| --- | --- |
| `DtcgColorToken` | `{ $type: 'color', $value: DtcgColorValue, $description?: string, $extensions?: GlazeDtcgExtensions }`. `$type` is always `'color'`; Glaze never writes `$description`. `$extensions` carries a glow's HDR value, only with `modes.hdr`; see [DTCG `$extensions`](#dtcg-extensions). |
| `DtcgSrgbColorValue` | `{ colorSpace: 'srgb', components: [r, g, b], hex: '#rrggbb', alpha?: number }`. Components rounded to 6 decimals; `hex` is 6-digit lowercase and never carries alpha. |
| `DtcgOklchColorValue` | `{ colorSpace: 'oklch', components: [L, C, H], alpha?: number }`. `L` and `C` rounded to 6 decimals, `H` to 4. |
| `DtcgColorValue` | `DtcgSrgbColorValue \| DtcgOklchColorValue`. |
| `DtcgDocument` | `Record<string, DtcgColorToken>` — one flat tree per scheme. |

`alpha` (rounded to 6 decimals) is present only when the color's opacity is below 1.

```ts
theme.dtcg({ colorSpace: 'oklch' }).light.surface;
// → {
//   $type: 'color',
//   $value: {
//     colorSpace: 'oklch',
//     components: [0.970004, 0.012759, 280],
//   },
// }
```

## `dtcgResolver(options?)`

One W3C [DTCG Resolver-Module](https://www.designtokens.org/) document that describes **every scheme variant in one file** — an alternative to `dtcg()`'s per-scheme files for tools that resolve sets and modifiers (for example Dispersa). The light document becomes `sets.base.sources[0]`, the default context; each other emitted variant becomes a context override on a single `scheme` modifier.

```ts
theme.dtcgResolver({ modes: { highContrast: true } });
// → {
//   version: '2025.10',
//   sets: {
//     base: {
//       sources: [
//         {
//           surface: {
//             $type: 'color',
//             $value: {
//               colorSpace: 'srgb',
//               components: [0.953256, 0.958291, 0.995646],
//               hex: '#f3f4fe',
//             },
//           },
//           …
//         },
//       ],
//     },
//   },
//   modifiers: {
//     scheme: {
//       default: 'light',
//       contexts: {
//         light: [],
//         dark: [{ surface: { $type: 'color', $value: {…} }, … }],
//         lightContrast: [{ surface: {…}, … }],
//         darkContrast: [{ surface: {…}, … }],
//       },
//     },
//   },
//   resolutionOrder: [
//     { $ref: '#/sets/base' },
//     { $ref: '#/modifiers/scheme' },
//   ],
// }
```

**Why one modifier with four contexts.** Glaze resolves `darkContrast` independently — it is not `dark` plus `lightContrast` layered. The resolver model composes modifiers additively (the last in `resolutionOrder` wins on conflict), so two independent modifiers (`scheme` × `contrast`) would produce wrong values for the dark high-contrast combination. One `scheme` modifier with a context per variant keeps every resolved value exact. Choose `dtcgResolver()` for single-file theming fed to a resolver tool, and `dtcg()` for the widest per-file tool compatibility.

`GlazeDtcgResolverOptions` extends `GlazeDtcgOptions`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `colorSpace` | `DtcgColorSpace` | `'srgb'` | Same as [`dtcg()`](#dtcgoptions); applies to every source and context. |
| `modes` | `GlazeOutputModes` | Global config | Which variants become contexts. `light` is always present (it is the default context, with an empty override list); variants that are off are omitted. |
| `setName` | `string` | `'base'` | Name of the single set holding the light token tree. |
| `modifierName` | `string` | `'scheme'` | Name of the modifier for the scheme axis. |
| `contextNames` | `GlazeDtcgResolverContextNames` | Variant names | Rename any of the four contexts, e.g. `{ dark: 'night' }`. Fields: `light`, `dark`, `lightContrast`, `darkContrast`. |
| `version` | `string` | `'2025.10'` | The document's `version` field. |

`setName` and `modifierName` also flow into `resolutionOrder` (`#/sets/<setName>`, `#/modifiers/<modifierName>`), and a renamed `light` context is also the modifier's `default`.

With `modes.hdr`, the sources and contexts are `dtcg()` documents, so a glow's HDR value rides in `$extensions` in each document that has one. A context replaces whole tokens: a dark token without `$extensions` drops the light HDR value.

Document types:

| Type | Shape |
| --- | --- |
| `GlazeDtcgResolverDocument` | `{ version: string, sets: Record<string, DtcgResolverSet>, modifiers: Record<string, DtcgResolverModifier>, resolutionOrder: DtcgResolverRef[] }` |
| `DtcgResolverSet` | `{ sources: DtcgTokenTree[] }` |
| `DtcgResolverModifier` | `{ default: string, contexts: Record<string, DtcgTokenTree[]> }` |
| `DtcgResolverRef` | `{ $ref: string }` — a JSON pointer. |
| `DtcgTokenTree` | `{ [key: string]: DtcgColorToken \| DtcgTokenTree }`. Glaze's flat `DtcgDocument` is a valid shallow tree. |

## `tailwind(options?)`

A Tailwind CSS v4 `@theme` block (the light baseline) plus dark and high-contrast overrides under configurable selectors, returned as one ready-to-paste CSS string. The `--color-*` namespace makes Tailwind generate `bg-*`, `text-*`, `border-*`, and the other color utilities.

```css
/* theme.tailwind({ modes: { highContrast: true } }) */
@theme {
  --color-surface: oklch(0.97 0.0128 280);
  --color-surface-text: oklch(0.5286 0.1912 280);
  --color-accent: oklch(0.5961 0.181 280);
}

.dark {
  --color-surface: oklch(0.279 0.1015 280);
  --color-surface-text: oklch(0.6531 0.144 280);
  --color-accent: oklch(0.5955 0.1601 280);
}

.high-contrast {
  --color-surface: oklch(0.9685 0.0134 280);
  --color-surface-text: oklch(0.4567 0.1819 280);
  --color-accent: oklch(0.5784 0.1853 280);
}

.dark.high-contrast {
  --color-surface: oklch(0.1685 0.0615 280);
  --color-surface-text: oklch(0.7012 0.1258 280);
  --color-accent: oklch(0.5784 0.1633 280);
}
```

`GlazeTailwindOptions`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `GlazeColorFormat` | `'oklch'` | `'oklch'`, `'rgb'`, or `'hsl'`. `'okhsl'` / `'okhst'` throw. |
| `namespace` | `string` | `'color-'` | Custom property namespace, forming `--<namespace><name>` (e.g. `--color-surface`). Named `namespace` so it doesn't clash with the palette's theme `prefix` option. |
| `darkSelector` | `string` | `'.dark'` | Selector wrapping the dark overrides. An at-rule such as `'@media (prefers-color-scheme: dark)'` drives dark mode from the OS preference. |
| `highContrastSelector` | `string` | `'.high-contrast'` | Selector wrapping the light high-contrast overrides. |
| `hdrSelector` | `string` | `'@media (dynamic-range: high)'` | Selector wrapping the HDR overrides, emitted only with `modes.hdr`. Experimental; see [HDR output](#hdr-output). |
| `modes` | `GlazeOutputModes` | Global config | Which override blocks to include. The `@theme` block is always emitted when the theme has colors. |

How the override blocks are built:

- Blocks appear in the order `@theme`, dark, high contrast, dark high contrast, separated by blank lines. With `modes.hdr`, the HDR blocks follow all of them, in the same order: `hdrSelector`, then combined with `darkSelector`, with `highContrastSelector`, and with both.
- The dark high-contrast block combines both selectors. Class-like selectors concatenate into one compound selector (`.dark.high-contrast`).
- An at-rule (any selector starting with `@`) wraps the block instead: Glaze nests the remaining selectors inside it, or `:root` when there are none.
- Empty blocks are skipped, and a theme with no colors returns `''`.

```ts
theme.tailwind({
  darkSelector: '@media (prefers-color-scheme: dark)',
  modes: { highContrast: true },
});
```

```css
/* The override blocks only; the @theme block is unchanged. */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: oklch(0.279 0.1015 280);
    /* … */
  }
}

.high-contrast {
  --color-surface: oklch(0.9685 0.0134 280);
  /* … */
}

@media (prefers-color-scheme: dark) {
  .high-contrast {
    --color-surface: oklch(0.1685 0.0615 280);
    /* … */
  }
}
```

## Hue channel splitting (`splitHue`)

With `splitHue: true` and `format: 'oklch'`, Glaze emits hue as its own custom property and references it with `var()` in the color values, so you can re-skin colors at runtime by changing one variable.

Supported on `theme.css()`, `theme.tasty()`, `palette.css()`, `palette.tasty()`, and the standalone [`token.css()`](./color-tokens.md). Not supported on `token.token()` / `token.tasty()`, whose return shape can't carry the hue declaration, nor on `tokens()`, `json()`, `dtcg()`, `dtcgResolver()`, or `tailwind()`; their option types have no `splitHue`.

```ts
const theme = glaze(
  { hue: 240, saturation: 18, darkHue: 200 },
  { pastel: true },
);
theme.colors({
  surface: { tone: 97 },
  accent: { tone: 52, hue: '+20' },
});

theme.css({ splitHue: true, name: 'brand' });
```

```css
/* light */
--brand-hue: 240;
--accent-hue: calc(var(--brand-hue) + 20);
--surface-color: oklch(0.97 0.0025 var(--brand-hue));
--accent-color: oklch(0.5961 0.0182 var(--accent-hue));

/* dark */
--brand-hue: 200;
--accent-hue: calc(var(--brand-hue) + 20);
--surface-color: oklch(0.279 0.0077 var(--brand-hue));
--accent-color: oklch(0.5699 0.0157 var(--accent-hue));
```

### Requirements

- **`format: 'oklch'`.** CSS `var()` can stand in for the hue slot of `oklch()` only, so any other format throws before anything is emitted:

  ```text
  glaze: splitHue requires format 'oklch' (got 'rgb').
  Use format: 'oklch' or drop splitHue.
  ```
- **Every exported color is pastel.** Set `pastel: true` on the theme or token override, or per color. Pastel mode bounds chroma by the hue-independent safe chroma at each lightness, so the emitted `C` stays inside sRGB for any rotated hue. A non-pastel color in any emitted variant throws rather than emit values that would clip under rotation:

  ```text
  glaze: splitHue requires every color to be pastel (hue rotation is
    only clip-free when chroma is bounded by the hue-independent safe
    chroma).
  Non-pastel: surface, accent.
  Set pastel: true (per-theme, per-token, or per-color) or drop splitHue.
  ```

  The check is exported as [`assertAllPastel`](./utilities.md#export-guards).

### Variable names

| Variable | CSS name | Tasty token |
| --- | --- | --- |
| Theme hue | `--<name>-hue` (`name` defaults to `'theme'`) | `$<name>-hue` |
| Per-color hue | `--<prefix><color>-hue` | `$<prefix><color>-hue` |
| Color value (`css()` only) | `--<prefix><color><suffix>` | `#<prefix><color>` |

In `tasty()` the hue declarations become `$…-hue` keys next to the `#color` keys, with the same state map shape. In palettes `<name>` is the theme name and `<prefix>` the theme's prefix; see [`splitHue` in palettes](./palette.md#splithue-in-palettes).

Theme hue vars, per-color hue vars, and `css()` value properties share one namespace. A color named the same as `name` (a `brand` color with `name: 'brand'`) that sets its own hue would declare `--brand-hue` a second time, and one declaration would silently override the other, so the export throws instead:

```text
glaze: splitHue would declare "--brand-hue" twice: for the theme hue
  (name: 'brand') and for color "brand"'s own hue.
One would silently override the other.
Rename the color or pass a different `name`.
```

A same-named color without its own hue, or one achromatic in light, is fine: it declares no per-color var.

A `css()` value property can land on a hue var too: `suffix: '-hue'` puts `--accent-hue` on a color's own hue var, and `suffix: ''` does the same for a color named `accent-hue`. That throws rather than emit a `var()` cycle:

```text
glaze: splitHue would declare "--accent-hue" twice: for color "accent"'s
  own hue and for color "accent"'s value.
One would silently override the other.
Rename the color, or pass a different `suffix` or `name`.
```

`tasty()` is not affected: a `#accent` token compiles to `--accent-color`. Palettes run the same checks across themes; see [`splitHue` in palettes](./palette.md#splithue-in-palettes).

### How each color references hue

| Color | Hue reference |
| --- | --- |
| Regular color with no `hue`, `darkHue`, or `from` | `var(--<name>-hue)` directly; no per-color var. |
| Relative `hue: '+N'` / `'-N'` | Per-color var `calc(var(--<name>-hue) + N)` (or `- N`). |
| Absolute `hue: N` | Per-color var set to `N`, normalized to 0–360. |
| Only `darkHue` set | Per-color var: `var(--<name>-hue)` in light, the dark value in dark. A color that authors a hue in either scheme gets its own var in both, so the shared `var()` reference stays valid. |
| `from` literal color | Per-color var pinned to the color's resolved hue, so re-skinning the theme doesn't re-tint a literal brand color. |
| `mode: 'static'` while the theme has a dark seed hue different from `hue` | Per-color var pinned to the resolved hue, so the color doesn't drift with the dark seed. |
| `mode: 'static'` with a `darkHue` | Its light reference in both schemes: a static color has one hue, so its `darkHue` is ignored, as the resolver ignores it. |
| Shadow, glow, and mix colors | Inline full `oklch()` value; they don't follow hue rotation. A glow's HDR value is a literal `color(srgb …)`. |
| Achromatic in light (saturation 0) | Inline in every scheme: `oklch(L 0 0)`, or `oklch()` at its own hue in a scheme where it has chroma (a `darkSaturation`). No per-color var in any scheme. |

The light variant decides whether a color is inline: every scheme renders with the color's light plan.

Every number in a hue declaration — the seed, an authored hue or offset, a resolved hue — is rounded to 2 decimals, the precision of `H` in `oklch()` output: a `from: '#2f5bff'` color gets `--logo-hue: 266.16`.

### Dark hues

Hue vars are scheme-independent unless the theme or a color authors a dark hue (`darkHue` on the [seed](./theme.md#glazethemeseed) or on a [color definition](./color-definitions.md#dark-seed-darkhue--darksaturation)). When the dark set differs from the light one, Glaze re-declares the **whole** hue set for dark: in `css()` at the top of the `dark` and `darkContrast` strings, in `tasty()` under the dark state (only when `modes.dark` is on). The dark set holds only the vars the light plans reference, so a color achromatic in light declares none. The `lightContrast` string never carries hue declarations; it inherits the light ones. The `css()` HDR blocks carry none either: they only re-declare color values.

`--accent-hue` in the example repeats verbatim on purpose. A custom property substitutes `var()` at computed-value time on the element that declares it, so a per-color var has to be re-declared next to the new `--brand-hue` to pick it up.

### Planning types

`HuePlan`, `HueDeclaration`, and `ChannelCtx` are exported for custom pipelines that reproduce this splitting:

| Type | Fields |
| --- | --- |
| `HueDeclaration` | `prop` — the custom property name (`--accent-hue`); `value` — its value (`240`, `calc(var(--theme-hue) + 20)`). |
| `HuePlan` | `hueVar` — the `var()` reference spliced into `oklch(L C <hueVar>)`; `inline` — `true` when the color is emitted as a full inline value; `declarations` — the hue declarations backing it. |
| `ChannelCtx` | `seedHue`, optional `darkSeedHue`, `baseName` (theme var name without `--` / `-hue`), `prefix`, `defs` (the `ColorMap`), `mode` (`'theme'` or `'standalone'`), optional `resolvedHue` (standalone tokens), optional `emitDeclarations` (default `true`; `false` for a pass that only references vars another pass declares, like a palette's primary aliases). |

## Translucent colors

Shadow and glow colors, transparent mixes, and colors with `opacity` resolve with `alpha` below 1. String formats append it as `/ A`; DTCG adds an `alpha` field:

```ts
theme.colors({
  'accent-pressed': { type: 'shadow', bg: 'accent', intensity: 10 },
  scrim: { tone: 0, saturation: 0, mode: 'static', opacity: 0.5 },
});

theme.tokens({ format: 'rgb' }).light;
// → {
//   …,
//   'accent-pressed': 'rgb(0 0 0 / 0.1697)',
//   scrim: 'rgb(0 0 0 / 0.5)',
// }

theme.dtcg().light['accent-pressed'].$value;
// → {
//   colorSpace: 'srgb',
//   components: [0, 0, 0],
//   hex: '#000000',
//   alpha: 0.16972,
// }
```

A shadow's or glow's alpha is solved for its `bg` surface, and a transparent mix's alpha is its `value` (or the value solved for `contrast`) over its `base`; composite each over that color. An `opacity` color carries its authored alpha unchanged in every scheme. See [Shadows and glows](../shadows-and-glows.mdx) and [Mixes and transparency](../mixes.mdx).

## HDR output

With `glowTuning.headroom` above 0 (stops above white), a glow whose target tone passes 100 while its SDR value is pinned at its brightest gets an HDR value next to its SDR one: `variant.hdr`, an opaque base plus an exposure in stops ([`ResolvedHdr`](./color-definitions.md#hdr-values-resolvedhdr)). When that happens and where it shows is covered in [HDR glows](../hdr.mdx); this section covers how the exporters write it.

HDR output is opt-in. With `modes.hdr` off (the default), every exporter's output is byte-identical to SDR, even with a `headroom` set. Turn it on for the export that needs it rather than globally:

```ts
theme.dtcg({ modes: { hdr: true } });
// css() has no modes: its hdr option falls back to the global modes.hdr
theme.css({ hdr: true });
// For every export:
glaze.configure({ modes: { hdr: true } });
```

The data exports (`dtcg()`, `dtcgResolver()`, `json()`, `tokens()`) are what native apps and WebGPU code read. The CSS exports (`css()`'s `hdr` blocks, `tasty()`'s `states.hdr` keys, and `tailwind()`'s `hdrSelector` blocks) are experimental: no browser paints a CSS color past SDR white yet, and their shape may change, for example to CSS `hdr-color()`, once one does. See [Browsers](../hdr.mdx#browsers) for what browsers paint today, and [Fills, not overlays](../hdr.mdx#fills-not-overlays) for where that matters.

### HDR strings

Every string exporter writes an HDR value as extended sRGB, `color(srgb R G B)`: the base's linear sRGB times `2^exposure`, encoded with the sRGB transfer curve continued past 1, so `1` is SDR white and `1.3533` one stop above it. Channels have 4 decimals and are unclamped, with the brightest above 1. This holds whatever `format` is, and the value stays literal under `splitHue`. `oklch()` would clamp its lightness when parsed, and `rgb()` / `hsl()` stop at white.

```ts
const v = glaze.glow({
  bg: '#ffffff',
  intensity: 12,
  tuning: { headroom: 1 },
});

glaze.formatHdr(v); // 'color(srgb 1.1813 1.1813 1.1813)'
glaze.formatHdr(v, 'srgb-linear');
// → 'color(srgb-linear 1.4631 1.4631 1.4631)'
```

[`glaze.formatHdr()`](./utilities.md#glazeformathdrvariant-hdrformat) writes one variant's HDR value, and returns `undefined` for a variant without one. With `'srgb-linear'` it writes the same color in linear light; exporters always write `'srgb'`. For the channels as numbers, [`hdrToSrgb()` / `hdrToLinearSrgb()`](./utilities.md#hdrtosrgbhdr--hdrtolinearsrgbhdr) return the extended sRGB and the linear ones; [`formatSrgb` and `formatSrgbLinear`](./utilities.md#format-writers) write such channels as strings.

A white base keeps its surface's `h` and `s`: in `glaze(280, 80, { glowTuning: { headroom: 1 } })`, a 12-tone glow on a `tone: 100` surface has `hdr` `{ h: 280, s: 0.8, t: 1, exposure: 0.5489… }`, which is still white. Check `t` before reading `s` as chroma.

### HDR in each exporter

| Method | Where the HDR value goes | Colors included |
| --- | --- | --- |
| `tasty()` | A state key right after each SDR key that has one: `states.hdr` after `''`, `` `${key} & ${states.hdr}` `` after any other key. | Sparse |
| `json()` | A `<variant>Hdr` key right after each SDR key that has one. | Sparse |
| `tokens()` | A `<variant>Hdr` map right after each emitted variant map. Always present; `{}` when nothing passes white. | Dense |
| `css()` | `result.hdr`: `{ light, dark, lightContrast, darkContrast }`. Every string is `''` when nothing passes white. | Dense, over all four schemes |
| `tailwind()` | Blocks after every SDR block, under `hdrSelector`, then combined with `darkSelector`, `highContrastSelector`, and both. Empty blocks are skipped. | Dense |
| `dtcg()`, `dtcgResolver()` | `$extensions['me.tenphi.glaze'].hdr` on the token, in each scheme document that has one. `$value` stays SDR. | Per document |

**Sparse** entries exist only for the variants that have an HDR value. **Dense** blocks hold every color with an HDR value in any emitted scheme, re-declared with its SDR value in a scheme that has none, so a dense block layered over the SDR ones can't leak a light HDR value into dark. Only the schemes `modes` emits count; `css()` counts all four.

Order matters too. Wire each `css()` HDR block after the SDR blocks, under the same selector plus `(dynamic-range: high)`: in a dark HDR context both the light and the dark HDR blocks match, and the later dark one wins. `tailwind()` emits its blocks in that order, and `tasty()` emits its keys in the order [State aliases](#state-aliases) lists, so don't sort them.

[HDR glows](../hdr.mdx#output-is-opt-in) shows each export for a theme with two glows: [CSS blocks](../hdr.mdx#css-blocks), [Tasty keys](../hdr.mdx#tasty-keys), [Tailwind blocks](../hdr.mdx#tailwind-blocks), [JSON and tokens](../hdr.mdx#json-and-tokens), and [DTCG](../hdr.mdx#dtcg).

### DTCG `$extensions`

`$value` stays the SDR color: DTCG color components stop at 1. With `modes.hdr`, a token whose variant has an HDR value gains `$extensions` after `$value`, in that scheme's document only. [DTCG](../hdr.mdx#dtcg) shows a full token.

`GlazeDtcgExtensions` is `{ 'me.tenphi.glaze': { hdr: GlazeDtcgHdr } }`.

`GlazeDtcgHdr`:

| Field | Type | Description |
| --- | --- | --- |
| `exposure` | `number` | Gain over `base` in stops, rounded to 6 decimals. |
| `tone` | `number` | Luminance tone of the HDR value, rounded to 4 decimals. Past 100 when the headroom covers the step. A saturated base capped by `headroom` can land below 100. |
| `base` | `DtcgSrgbColorValue` | The opaque base, what SDR paints at its brightest. Always sRGB with a `hex`, whatever `colorSpace`; never pastel; no `alpha`. |
| `value` | `{ colorSpace: 'srgb', components: [r, g, b] }` | The HDR color, `base` times `2^exposure` in linear light, as extended sRGB: the same numbers as the [HDR string](#hdr-strings), to 6 decimals. Only the brightest component is guaranteed above 1. |

Only DTCG carries `base` and `exposure`, which Apple's exposure initializers take; `json()` and `tokens()` carry the string, whose numbers are the extended sRGB channels. [Native apps](../hdr.mdx#native-apps) maps each field onto Apple, Android, and Windows APIs.

### Palettes and color tokens

- Palette HDR entries follow the same prefixes, primary alias, and collision filtering as the SDR ones; see [HDR in palettes](./palette.md#hdr-in-palettes).
- `glaze.color()` tokens are never glows, so they never carry an HDR value: `modes.hdr`, `states.hdr`, and `hdrSelector` change nothing, and `token.css()` has no `hdr` option.
