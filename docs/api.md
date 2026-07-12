# API Reference

Full reference for every public method, option, and type exported by `@tenphi/glaze`. Organized for lookup, not for reading top-to-bottom — see [methodology.md](methodology.md) for a guided walkthrough of how to use these primitives to build a real palette.

## Contents

- [Theme creation](#theme-creation)
- [Theme methods](#theme-methods)
- [Color definitions](#color-definitions)
- [Standalone color tokens](#standalone-color-tokens)
- [Shadows](#shadows)
- [Mix colors](#mix-colors)
- [Palette](#palette)
- [Output formats](#output-formats)
- [Adaptation modes](#adaptation-modes)
- [Light / dark scheme mapping](#light--dark-scheme-mapping)
- [Configuration](#configuration)
- [Output modes](#output-modes)
- [Validation](#validation)
- [Color math utilities](#color-math-utilities)

---

## Theme creation

| Method | Description |
|---|---|
| `glaze(hue, saturation?, config?)` | Create a theme from hue (0–360) and saturation (0–100). Optional `config` overrides the global config for this theme. |
| `glaze({ hue, saturation }, config?)` | Create a theme from an options object, with optional per-theme config override. |
| `glaze.from(data)` | Create a theme from an exported configuration (`theme.export()` snapshot). |
| `glaze.fromHex(hex)` | Create a theme from a hex color (`#rgb` or `#rrggbb`). Extracts hue and saturation. |
| `glaze.fromRgb(r, g, b)` | Create a theme from RGB values (0–255). Extracts hue and saturation. |

```ts
const a = glaze(280, 80);
const b = glaze({ hue: 280, saturation: 80 });
const c = glaze.fromHex('#7a4dbf');
const d = glaze.fromRgb(122, 77, 191);
const e = glaze.from(a.export());

// Per-theme config override:
const rawTheme = glaze(280, 80, { lightTone: false, darkTone: false });
```

The optional `config` parameter is a `GlazeConfigOverride` — see [Per-instance config override](#per-instance-config-override).

---

## Theme methods

A `GlazeTheme` exposes:

| Method | Description |
|---|---|
| `theme.hue` (readonly) | The hue seed (0–360). |
| `theme.saturation` (readonly) | The saturation seed (0–100). |
| `theme.colors(defs)` | Add/replace colors (additive merge — adds new, overwrites existing by name, doesn't remove others). |
| `theme.color(name)` | Get a color definition by name. |
| `theme.color(name, def)` | Set a single color definition. |
| `theme.remove(name \| names[])` | Remove one or more color definitions. |
| `theme.has(name)` | Check if a color is defined. |
| `theme.list()` | List all defined color names. |
| `theme.reset()` | Clear all color definitions. |
| `theme.export()` | Export the theme configuration as a JSON-safe object. |
| `theme.extend(options)` | Create a child theme inheriting all color definitions (see [`extend`](#themeextendoptions) below). |
| `theme.resolve()` | Resolve all colors and return a `Map<string, ResolvedColor>`. |
| `theme.tokens(options?)` | Export as a flat token map grouped by scheme variant. |
| `theme.tasty(options?)` | Export as Tasty style-to-state bindings. |
| `theme.json(options?)` | Export as plain JSON. |
| `theme.css(options?)` | Export as CSS custom property declarations. |

### `theme.colors(defs)`

```ts
theme.colors({ surface: { tone: 97 } });
theme.colors({ text: { tone: 30 } });
// Both 'surface' and 'text' are now defined.
```

### `theme.color(name) / theme.color(name, def)`

```ts
theme.color('surface', { tone: 97, saturation: 0.75 });    // set
const def = theme.color('surface');                              // get
```

### `theme.extend(options)`

Creates a new theme inheriting all color definitions, optionally replacing the hue / saturation seed, color overrides, and config:

```ts
const danger = primary.extend({
  hue: 23,
  colors: { 'accent-fill': { tone: 48, mode: 'fixed' } },
});

// Inherit parent's config override and widen the dark window further:
const highSat = base.extend({ config: { darkTone: [10, 100] } });
```

`GlazeExtendOptions`:

| Field | Type | Description |
|---|---|---|
| `hue` | `number` | Replace the hue seed. Defaults to the parent's hue. |
| `saturation` | `number` | Replace the saturation seed. Defaults to the parent's saturation. |
| `colors` | `ColorMap` | Per-theme overrides (additive merge over the inherited map). |
| `config` | `GlazeConfigOverride` | Config override for the child. Shallow-merged with the parent's override — child fields win. |

Colors marked with `inherit: false` on the parent are **not** copied into the child.

### `theme.tokens(options?)`

Flat token map grouped by scheme variant.

```ts
theme.tokens()
// → { light: { surface: 'oklch(...)' }, dark: { surface: 'oklch(...)' } }
```

`GlazeJsonOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'oklch'` | Output color format. One of `'rgb' \| 'hsl' \| 'oklch'`. `'okhsl'` and `'okhst'` throw — use `tasty()` for those. |
| `modes` | `{ dark: true, highContrast: false }` (or global config) | Which scheme variants to include. |

### `theme.tasty(options?)`

Tasty style-to-state bindings for the [Tasty style system](https://tasty.style/docs). Uses `#name` color token keys and state aliases. By default the dark and high-contrast variants are keyed by media-query states (`'@media(prefers-color-scheme: dark)'`, `'@media(prefers-contrast: more)'`) so tokens work without registering custom states.

```ts
theme.tasty()
// → {
//   '#surface': { '': 'okhsl(...)', '@media(prefers-color-scheme: dark)': 'okhsl(...)' },
//   ...
// }
```

`GlazeTokenOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'okhsl'` | Output color format. `'okhsl'` and `'okhst'` are supported here (Tasty-only spaces). |
| `modes` | global config | Which scheme variants to include. |
| `states.dark` | `'@media(prefers-color-scheme: dark)'` (or global config) | State alias for dark mode tokens. |
| `states.highContrast` | `'@media(prefers-contrast: more)'` (or global config) | State alias for high-contrast tokens. |
| `splitHue` | `false` | Emit hue as a separate custom property (`$name-hue` token + `var()` in `oklch` values). Requires `format: 'oklch'` and every color to be pastel. |
| `name` | `'theme'` | Base name for the theme-level hue var (`$theme-hue` / `--theme-hue`). Palette export auto-derives this from the theme name. |
| `prefix` | (palette only) | See [Palette](#palette). |

When both `dark` and `highContrast` modes are enabled, dark high-contrast variants are emitted under the combined key `<dark> & <highContrast>` (e.g. `'@media(prefers-color-scheme: dark) & @media(prefers-contrast: more)'`).

### `theme.json(options?)`

Per-color JSON map.

```ts
theme.json()
// → {
//   surface: { light: 'oklch(...)', dark: 'oklch(...)' },
//   text:    { light: 'oklch(...)', dark: 'oklch(...)' },
// }
```

Same options as `tokens()`.

### `theme.css(options?)`

CSS custom property declaration strings, grouped by scheme variant.

```ts
theme.css();
// → {
//   light: '--surface-color: rgb(...);\n--text-color: rgb(...);',
//   dark:  '--surface-color: rgb(...);\n--text-color: rgb(...);',
//   lightContrast: '...',
//   darkContrast:  '...',
// }
```

`GlazeCssOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'rgb'` | Output color format. `'okhsl'` and `'okhst'` throw — use `tasty()` for those. |
| `suffix` | `'-color'` | Suffix appended to each CSS property name. Pass `''` for bare property names. |
| `splitHue` | `false` | Emit hue as a separate `--*-hue` custom property referenced via `var()` in `oklch` color values. Requires `format: 'oklch'` and every color to be pastel. Shadow/mix colors stay inline (blended hue; they do not follow `--hue` rotation). |
| `name` | `'theme'` | Base name for the theme-level hue var (`--theme-hue`). Palette export auto-derives this from the theme name. |

`GlazeCssResult` always contains all four keys (`light`, `dark`, `lightContrast`, `darkContrast`); empty if no colors are defined for that variant.

### `theme.dtcg(options?)`

W3C [Design Tokens Format Module (2025.10)](https://www.designtokens.org/) documents — the vendor-neutral JSON format consumed by Figma, Tokens Studio, Style Dictionary v4+, Terrazzo, Penpot, and every DTCG-compatible tool. Returns one spec-conformant token tree per scheme variant.

```ts
theme.dtcg()
// → {
//   light: {
//     surface: {
//       $type: 'color',
//       $value: { colorSpace: 'srgb', components: [0.96, 0.94, 0.98], hex: '#f5f0fa' },
//     },
//   },
//   dark: {
//     surface: {
//       $type: 'color',
//       $value: { colorSpace: 'srgb', components: [0.16, 0.14, 0.2], hex: '#292333' },
//     },
//   },
// }
```

Write each document to its own `.tokens.json` file — one file per scheme is the most tool-compatible convention (one per Style Dictionary theme / Tokens Studio set / Figma variable mode).

`GlazeDtcgOptions`:

| Option | Default | Description |
|---|---|---|
| `colorSpace` | `'srgb'` | Color space for `$value`. `'srgb'` emits gamma sRGB `components` (0–1) plus a `hex` hint — universally understood. `'oklch'` emits `[L, C, H]` components with no hex — Glaze-native, wide-gamut. |
| `modes` | global config | Which scheme variants to include. `light` is always present. |

`alpha` is included on `$value` only when the color's opacity is below 1. `$type` is always `'color'`.

### `theme.dtcgResolver(options?)`

A single W3C [DTCG Resolver-Module](https://www.designtokens.org/) document describing **every scheme variant in one file** — an alternative to `dtcg()`'s per-scheme files for tools that resolve sets + modifiers (e.g. Dispersa). The light document becomes `sets.base.sources[0]` (the default context); each other variant becomes a context override on a single `scheme` modifier.

```ts
theme.dtcgResolver({ modes: { highContrast: true } })
// → {
//   version: '2025.10',
//   sets: {
//     base: {
//       sources: [
//         {
//           surface: {
//             $type: 'color',
//             $value: { colorSpace: 'srgb', components: [0.96, 0.94, 0.98], hex: '#f5f0fa' },
//           },
//         },
//       ],
//     },
//   },
//   modifiers: {
//     scheme: {
//       default: 'light',
//       contexts: {
//         light: [],
//         dark: [
//           {
//             surface: {
//               $type: 'color',
//               $value: { colorSpace: 'srgb', components: [0.16, 0.14, 0.2], hex: '#292333' },
//             },
//           },
//         ],
//         lightContrast: [ /* … */ ],
//         darkContrast: [ /* … */ ],
//       },
//     },
//   },
//   resolutionOrder: [
//     { $ref: '#/sets/base' },
//     { $ref: '#/modifiers/scheme' },
//   ],
// }
```

**Why one modifier with four contexts.** Glaze resolves `darkContrast` independently — it is not `dark` + `lightContrast` layered. The resolver model composes modifiers additively (last in `resolutionOrder` wins on conflict), so two independent modifiers (`scheme` × `contrast`) would produce wrong values for the dark + high-contrast permutation. One `scheme` modifier with a context per variant keeps every resolved value exact. Choose `dtcgResolver()` when you want single-file theming and feed it to a resolver tool; choose `dtcg()` for maximum per-file tool compatibility.

`GlazeDtcgResolverOptions` (extends `GlazeDtcgOptions`, so `modes` and `colorSpace` pass through):

| Option | Default | Description |
|---|---|---|
| `colorSpace` | `'srgb'` | Same as `dtcg()` — flows through to every source and context. |
| `modes` | global config | Which scheme variants to emit as contexts. `light` is always present (the default); absent variants are omitted. |
| `setName` | `'base'` | Name of the single set holding the default (light) token tree. |
| `modifierName` | `'scheme'` | Name of the modifier describing the scheme axis. |
| `contextNames` | identity | Override the four context names (`light` / `dark` / `lightContrast` / `darkContrast`) — e.g. `{ dark: 'night' }`. |
| `version` | `'2025.10'` | Resolver document version. |

### `theme.tailwind(options?)`

A Tailwind CSS v4 `@theme` block (light baseline) plus dark / high-contrast overrides under configurable selectors. Returns a single ready-to-paste CSS string. The `--color-*` namespace auto-generates `bg-*` / `text-*` / `border-*` utilities.

```css
@theme {
  --color-surface: oklch(0.96 0.01 280);
  --color-text: oklch(0.3 0.05 280);
}
.dark {
  --color-surface: oklch(0.16 0.01 280);
  --color-text: oklch(0.85 0.05 280);
}
.high-contrast {
  --color-surface: oklch(0.98 0.01 280);
  --color-text: oklch(0.1 0.05 280);
}
.dark.high-contrast {
  --color-surface: oklch(0.05 0.01 280);
  --color-text: oklch(0.95 0.05 280);
}
```

`GlazeTailwindOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'oklch'` | Output color format for the values. |
| `namespace` | `'color-'` | CSS custom property namespace, forming `--<namespace><name>` (e.g. `--color-surface`). Named `namespace` to avoid clashing with the palette theme-prefix option. |
| `darkSelector` | `'.dark'` | Selector wrapping the dark overrides. Pass an at-rule like `'@media (prefers-color-scheme: dark)'` to drive dark mode from the OS preference (it nests `:root` automatically). |
| `highContrastSelector` | `'.high-contrast'` | Selector wrapping the light high-contrast overrides. The combined dark + high-contrast block uses `${darkSelector}${highContrastSelector}` (e.g. `.dark.high-contrast`). |
| `modes` | global config | Which scheme variants to include. The `@theme` block (light) is always emitted when colors exist. |

### `theme.export()`

```ts
const snapshot = theme.export();
// → { hue: 280, saturation: 80, colors: { surface: { ... }, ... } }

const restored = glaze.from(snapshot);
```

The export contains only the configuration — not resolved color values. Resolved values are recomputed on demand.

---

## Color definitions

`ColorDef` is a discriminated union:

```ts
type ColorDef = RegularColorDef | ShadowColorDef | MixColorDef;
```

### `RegularColorDef`

| Field | Type | Description |
|---|---|---|
| `tone` | `HCPair<ToneValue>` | Number = absolute (0–100, contrast-uniform). `'+N'`/`'-N'` = relative to base's tone (requires `base`). `'max'`/`'min'` = forced to the scheme's tone extreme (no `base`). Optional HC pair `[normal, hc]`. |
| `saturation` | `number` | Saturation factor applied to the seed saturation (0–1). Default: `1`. |
| `hue` | `number \| RelativeValue` | Number = absolute (0–360). String (`'+N'`/`'-N'`) = relative to the **theme seed hue** (never to a base color). |
| `base` | `string` | Name of another color in the same theme — makes this a *dependent* color. |
| `contrast` | `HCPair<ContrastSpec>` | Contrast floor against `base`. Requires `base`. See [`contrast`](#contrast-floor). |
| `mode` | `'auto' \| 'fixed' \| 'static'` | Adaptation mode. Default: `'auto'`. See [Adaptation modes](#adaptation-modes). |
| `autoFlip` | `boolean` | Flip out-of-bounds results (relative `tone` overshoot / unmet `contrast`) to the opposite side instead of clamping. Default: the global `autoFlip` (`true`). See [`autoFlip`](#autoflip). |
| `opacity` | `number` | Fixed alpha 0–1. Output includes alpha in the CSS value. Combining with `contrast` is not recommended (a `console.warn` is emitted). |
| `pastel` | `boolean` | Per-color override for the hue-independent "safe" chroma limit used in OKHSL↔sRGB conversions (luminance, contrast solving, output formatting). Falls through to the global / per-theme `pastel` config when omitted. Default: unset. See [Per-color `pastel`](#per-color-pastel). |
| `role` | `RoleInput` | Semantic role against `base` (`'text'` / `'surface'` / `'border'` or an alias). Fixes APCA contrast polarity. Resolved via: explicit `role` → name inference → opposite of the base's role → `'text'`. See [Roles](#roles). |
| `inherit` | `boolean` | Whether this color is inherited by child themes via `extend()`. Default: `true`. Set to `false` to make the color local to the current theme. |

#### Tone values

`tone` (0–100) replaces OKHSL lightness with a contrast-uniform axis — equal tone steps give equal WCAG contrast. See [`docs/okhst.md`](okhst.md) for the math. (To port old `lightness` values, see [migration.md](migration.md).)

| Form | Example | Meaning |
|---|---|---|
| Number (absolute) | `tone: 45` | Absolute tone 0–100. |
| String (relative) | `tone: '-52'` | Relative to base color's tone (requires `base`). |
| Extreme | `tone: 'max'` / `'min'` | Force to the scheme's highest (`'max'` = 100) or lowest (`'min'` = 0) tone. No `base` needed. |
| HC pair | `tone: ['-7', '-20']` | `[normal, high-contrast]`. A single value applies to both. |

**Absolute tone** on a dependent color (`base` set) positions the color independently. In dark mode it is tone-mapped (inverted + windowed) on its own. The `contrast` solver acts as a safety net.

**Relative tone** applies a signed delta to the base color's resolved tone. Because tone is contrast-uniform, a fixed delta yields a fixed contrast step. In dark mode with `mode: 'auto'`, the offset is anchored to the base's per-scheme tone. If `base + delta` falls outside `[0, 100]`, the result is clamped to the boundary, or — with `autoFlip` (default on) — mirrored to the other side of the base.

**Extreme tone** (`'max'` / `'min'`) forces the color to the scheme's tone extreme without a contrast hack or a magic number. `'max'` resolves to author tone 100 and `'min'` to 0; both flow through scheme mapping like an absolute tone, so under `mode: 'auto'` they invert in dark (`'max'` is lightest in light, darkest in dark). Use `mode: 'static'` to pin the same extreme across schemes, or `mode: 'fixed'` to keep the same end without inverting. No `base` required.

A dependent color with `base` but no `tone` inherits the base's tone (equivalent to a delta of 0).

#### `autoFlip`

`autoFlip` governs what happens when a result would fall outside its valid range:

- **Relative `tone` overshoot:** when `base ± delta` exceeds `[0, 100]`, `autoFlip` mirrors the delta to the other side of the base (e.g. `'+30'` becomes `'-30'`) instead of clamping to the boundary.
- **`contrast` direction:** when the requested tone direction can't meet the floor, `autoFlip` lets the solver try the opposite side (the same behavior as the global `autoFlip`).

`autoFlip` defaults to the global `autoFlip` (`true`). Set `autoFlip: false` on a color to clamp instead of mirror — useful when you want a relative offset to stay on the authored side of the base, or to keep an unmet contrast pinned to one direction's extreme.

#### `contrast` (floor)

```ts
type ContrastPreset = 'AA' | 'AAA' | 'AA-large' | 'AAA-large';
type ContrastSpec =
  | number                                  // bare WCAG ratio
  | ContrastPreset                          // named WCAG preset
  | { wcag: HCPair<number | ContrastPreset> }
  | { apca: HCPair<number> };               // APCA Lc target
```

| Preset | WCAG ratio |
|---|---|
| `'AA-large'` | 3 |
| `'AA'` | 4.5 |
| `'AAA-large'` | 4.5 |
| `'AAA'` | 7 |

A bare number or preset means **WCAG**. Use `{ wcag }` / `{ apca }` to pick the metric explicitly. The `[normal, highContrast]` pair may live at the outer level (`[4.5, 7]`, `[{ wcag: 4.5 }, { wcag: 7 }]`) or inside the metric (`{ wcag: [4.5, 7] }`, `{ apca: [45, 60] }`).

```ts
contrast: 4.5                  // WCAG 4.5
contrast: 'AAA'                // WCAG 7
contrast: { wcag: 6 }          // WCAG 6
contrast: { wcag: [4.5, 7] }   // WCAG 4.5 normal / 7 high-contrast (explicit)
contrast: { apca: 60 }         // APCA Lc 60 normal / 75 high-contrast (auto)
contrast: { apca: [45, 60] }   // APCA Lc 45 normal / 60 high-contrast (explicit)
contrast: { apca: 'content' }  // APCA preset -> Lc 60 normal / 75 high-contrast (auto)
contrast: { apca: ['content', 'body'] } // Lc 60 normal / 75 high-contrast (explicit)
```

**WCAG HC auto-promotion:** a bare WCAG preset (no `[normal, hc]` pair at either
the outer `contrast` or inner `wcag` level) is automatically promoted to its
spec-defined "Enhanced" successor in high-contrast mode — `AA` → `AAA` (4.5 → 7)
and `AA-large` → `AAA-large` (3 → 4.5), per WCAG SC 1.4.3 → 1.4.6. `AAA` and
`AAA-large` are already the top WCAG tier and are left unchanged; bare numeric
targets have no successor tier and are also left unchanged. An explicit HC value
via either pair overrides and skips the promotion.

**APCA Enhanced Level (HC auto-boost):** a bare APCA scalar (no `[normal, hc]`
pair at either the outer `contrast` or inner `apca` level) is automatically
boosted by **+15 Lc** in high-contrast mode, the APCA analog of WCAG's
AAA-over-AA step. On by default; an explicit HC value via either pair
overrides it and skips the boost. The enhanced target is clamped to 106 Lc.
For large/bold text (where APCA caps contrast at Lc 90 to avoid glare), pass
an explicit HC pair to hold that ceiling — see
[`docs/okhst.md`](okhst.md) §Enhanced Level.

APCA preset keywords (Bronze Simple Mode conformance levels, role-independent):
`'preferred'` (Lc 90), `'body'` (75), `'content'` (60, ~AA), `'large'` (45, ~3:1),
`'non-text'` (30), `'min'` (15, point of invisibility). See
[`docs/okhst.md`](okhst.md) §APCA.

The floor is applied independently per scheme — if the `tone` already satisfies it the tone is kept, otherwise the solver searches in tone (contrast-uniform → a closed-form WCAG seed and fast convergence) until the target is met.

By default, the solver crosses to the opposite side of the base color when the requested tone direction cannot satisfy the floor. This is controlled per-color by [`autoFlip`](#autoflip) (which defaults to the global `autoFlip`). Set `glaze.configure({ autoFlip: false })` — or `autoFlip: false` on a single color — to keep strict directionality: unmet colors pin to that direction's 0 or 100 tone extreme instead of falling back to the original requested value.

**Full tone spectrum in HC mode:** in high-contrast variants the `lightTone` and `darkTone` window constraints are bypassed entirely (the window is forced to `[0, 100]`). Colors can reach the full range, maximizing perceivable contrast.

**Chromatic drift (verification):** tone is contrast-uniform for grays. A chromatic swatch at a given tone shares its OKHSL lightness with the equivalent gray but drifts in real luminance, so a contrast-floored color may land slightly under its gray-tone expectation. Glaze measures the resolved result against the base and emits a deduped advisory `console.warn` when it drifts below the target. See [`docs/okhst.md`](okhst.md) §Verification.

#### Per-color hue override

```ts
const theme = glaze(280, 80);
theme.colors({
  surface:     { tone: 97 },
  gradientEnd: { tone: 90, hue: '+20' },   // 280 + 20 = 300
  warning:     { tone: 60, hue: 40 },      // absolute
});
```

Relative hue is always relative to the **theme seed hue**, not to a base color.

#### Per-color `pastel`

`pastel: true` on a single color def overrides the global / per-theme `pastel` config for that color only. It toggles the hue-independent "safe" chroma limit used in every OKHSL↔sRGB conversion that touches this color: luminance calculations during contrast solving, gamut clamping during sRGB blend / mix edges, and output formatting. The effective flag is carried on the resolved variant (`ResolvedColorVariant.pastel`) so formatting matches the gamut mapping applied during resolution.

```ts
const theme = glaze(280, 80);
theme.colors({
  plain: { tone: 50, saturation: 1 },
  soft:  { tone: 50, saturation: 1, pastel: true },
});
// theme.resolve().get('soft')!.light.pastel === true
// theme.css().light contains different rgb() triples for `--plain` and `--soft`
```

Omit the field to inherit the global / per-theme `pastel` config — useful for keeping the default behavior while opting a single accent into the pastel gamut.

The flag is part of the def object, so `extend()` copies it through to child themes alongside the rest of the def. Override it again on the child to flip a single color back:

```ts
const parent = glaze(280, 80);
parent.colors({ soft: { tone: 50, saturation: 1, pastel: true } });

const child = parent.extend({
  colors: { soft: { tone: 50, saturation: 1, pastel: false } },
});
// child.resolve().get('soft')!.light.pastel === false
```

> **Note:** Per-color `pastel` is also supported on `ShadowColorDef` and `MixColorDef` (see the tables above). For shadows the math itself happens in OKHSL space, so the flag mainly controls the gamut-mapped output formatting and any luminance verification for that variant.
>
> Standalone `glaze.color()` tokens accept the same `pastel` field on both the structured (`GlazeColorInput`) and value-shorthand (`GlazeColorOverrides`) forms, and it survives the `export()` / `glaze.colorFrom()` round-trip.

#### Roles

A color's `role` describes how it is used against its `base` and fixes **APCA contrast polarity** — which side is the foreground vs the background. APCA is asymmetric (`|apca(a,b)| ≠ |apca(b,a)|`), so the role picks the correct argument order; WCAG is symmetric and unaffected.

| Role | Polarity | Use | Aliases (name inference) |
|---|---|---|---|
| `'text'` | fg | Text / icons / foreground content | `text`, `fg`, `foreground`, `content`, `ink`, `label`, `stroke` |
| `'border'` | fg | Non-text spot elements (borders, dividers, outlines) | `border`, `divider`, `outline`, `separator`, `hairline`, `rule` |
| `'surface'` | bg | Backgrounds / fills | `surface`, `bg`, `background`, `fill`, `canvas`, `paper`, `layer` |

Resolution chain (per color):

1. Explicit `role` (normalized from an alias) wins.
2. Else, when `inferRole` is enabled (default), infer from the color name — the **last** recognized token wins (`button-text` → `text`, `input-bg` → `surface`, `card-outline` → `border`).
3. Else, the opposite of the base's role (a `surface` base ⇒ this is `text`).
4. Else, `'text'` (foreground) — i.e. the base is treated as the background.

```ts
const theme = glaze(280, 60);
theme.colors({
  surface: { tone: 90 },
  text:    { base: 'surface', contrast: { apca: 'content' } }, // inferred text
  border:  { base: 'surface', tone: '-10' },                   // inferred border
});
// role fixes APCA polarity; set `pastel: true` explicitly if a border
// needs the hue-independent safe chroma limit.
```

Disable name inference with `glaze.configure({ inferRole: false })` (the base-opposite and foreground-default fallbacks still apply).

### `ShadowColorDef`

| Field | Type | Description |
|---|---|---|
| `type` | `'shadow'` | Discriminator. |
| `bg` | `string` | Background color name — must reference a non-shadow color in the same theme. |
| `fg` | `string` | Optional foreground color name for tinting and intensity modulation. Must reference a non-shadow color. Omit for an achromatic shadow at full user-specified intensity. |
| `intensity` | `HCPair<number>` | Shadow intensity, 0–100. Supports HC pairs. |
| `tuning` | `ShadowTuning` | Per-color tuning overrides. Merged field-by-field with the global `shadowTuning`. |
| `pastel` | `boolean` | Per-color `pastel` override. See [Per-color `pastel`](#per-color-pastel). |
| `inherit` | `boolean` | Inheritance flag, default `true`. |

See [Shadows](#shadows) below for the algorithm and tuning details.

### `MixColorDef`

| Field | Type | Description |
|---|---|---|
| `type` | `'mix'` | Discriminator. |
| `base` | `string` | "From" color name. |
| `target` | `string` | "To" color name. |
| `value` | `HCPair<number>` | Mix ratio 0–100 (0 = pure base, 100 = pure target). In `'transparent'` blend, this becomes the target's opacity. Supports HC pairs. |
| `blend` | `'opaque' \| 'transparent'` | Default `'opaque'`. |
| `space` | `'okhsl' \| 'srgb'` | Interpolation space for opaque blending. Default `'okhsl'`. Ignored for `'transparent'` (always composites in linear sRGB). |
| `contrast` | `HCPair<ContrastSpec>` | Optional contrast floor against `base` (WCAG or APCA — see [`contrast`](#contrast-floor)). The solver adjusts the mix ratio (opaque) or opacity (transparent). |
| `pastel` | `boolean` | Per-color `pastel` override. See [Per-color `pastel`](#per-color-pastel). |
| `role` | `RoleInput` | Semantic role of the mixed result against `base`. Same semantics as `RegularColorDef.role` (see [Roles](#roles)). |
| `inherit` | `boolean` | Inheritance flag, default `true`. |

See [Mix colors](#mix-colors) below.

---

## Standalone color tokens

`glaze.color()` creates a single color token without a full theme.

```ts
// arg1: the color (four shapes — see below)
// arg2: optional config override (GlazeConfigOverride — see below)
glaze.color(color: GlazeFromInput | GlazeColorInput | GlazeColorValue, config?: GlazeConfigOverride): GlazeColorToken;
```

### Input forms

`glaze.color()` accepts **four input shapes**, discriminated by structure:

| Shape | Example | Notes |
|---|---|---|
| **Bare string** | `'#26fcb2'` | Hex or CSS color function (`rgb()`, `hsl()`, `okhsl()`, `okhst()`, `oklch()`). |
| **Value object** | `{ h: 152, s: 0.95, l: 0.74 }` | OKHSL, OKHST (`{ h, s, t }`), `{ r, g, b }` (sRGB 0–255), or `{ l, c, h }` (OKLCh). |
| **`{ from, ...overrides }`** | `{ from: '#1a1a2e', base: bg, contrast: 'AA' }` | Value + color overrides in one object. |
| **Structured** | `{ hue: 152, saturation: 95, tone: 74 }` | Full theme-style token (hue/saturation in 0–100, tone in 0–100). |

`GlazeColorValue` (bare string or value-object forms) accepts:

| Form | Example | Notes |
|---|---|---|
| Hex | `'#26fcb2'`, `'#26fcb2ff'`, `'#abc'` | 3, 6, or 8 digits. Alpha is dropped with a `console.warn` — use `opacity` instead. |
| `rgb()` | `'rgb(38 252 178)'`, `'rgb(38 252 178 / 0.8)'` | Modern space syntax. Alpha dropped with warning. |
| `hsl()` | `'hsl(152 97% 57%)'` | Modern space syntax. Alpha dropped with warning. |
| `okhsl()` | `'okhsl(152 95% 74%)'` | Glaze's own emit format. Alpha dropped with warning. |
| `okhst()` | `'okhst(152 95% 70%)'` | OKHST tone input (third value is tone 0–100). **Input only** — never emitted. Alpha dropped with warning. |
| `oklch()` | `'oklch(0.85 0.18 152)'` | Glaze's own emit format. Alpha dropped with warning. |
| `OkhslColor` object | `{ h: 152, s: 0.95, l: 0.74 }` | OKHSL shape (h: 0–360, s/l: 0–1). Passing 0–100 for `s`/`l` throws with a hint to use the structured form. |
| `OkhstColor` object | `{ h: 152, s: 0.95, t: 0.70 }` | OKHST shape (h: 0–360, s/t: 0–1). The `t` key disambiguates it from `{ h, s, l }`. **Input only.** |
| `RgbColor` object | `{ r: 38, g: 252, b: 178 }` | sRGB 0–255. RGB tuple `[r, g, b]` is not supported — use this object form. |
| `OklchColor` object | `{ l: 0.85, c: 0.18, h: 152 }` | OKLCh (L/C: 0–1, H: degrees), same semantics as `oklch()` strings. |

`GlazeColorInput` (structured form) is `{ hue, saturation, tone, ... }`:

| Field | Type | Description |
|---|---|---|
| `hue` | `number` | 0–360. |
| `saturation` | `number` | 0–100. |
| `tone` | `HCPair<number \| ExtremeValue>` | 0–100 (contrast-uniform) or `'max'`/`'min'`, optional HC pair. |
| `saturationFactor` | `number` | Multiplier on the seed (0–1). Default: `1`. |
| `mode` | `AdaptationMode` | Default: `'auto'`. |
| `autoFlip` | `boolean` | Flip out-of-bounds results instead of clamping. Default: global `autoFlip`. |
| `opacity` | `number` | Fixed alpha 0–1. |
| `base` | `GlazeColorToken \| GlazeColorValue` | Optional dependency. See [Pairing colors](#pairing-colors). |
| `contrast` | `HCPair<ContrastSpec>` | Contrast floor against `base` (WCAG or APCA). Without `base`, anchored to the literal seed. |
| `pastel` | `boolean` | Per-color `pastel` override. Falls through to the global / per-theme `pastel` config when omitted. See [Per-color `pastel`](#per-color-pastel). |
| `role` | `RoleInput` | Semantic role against `base` / the seed (see [Roles](#roles)). Fixes APCA polarity. |
| `name` | `string` | Debug label for warnings; doesn't change output keys. Reserved names (`'value'`, `'seed'`, `'externalBase'`) are rejected. |

`GlazeFromInput` (from form) is `{ from: GlazeColorValue, ...colorOverrides }`:

| Field | Notes |
|---|---|
| `from` | **Required.** The source color value — same forms as `GlazeColorValue`. |
| `hue` | Number (absolute 0–360) or `'+N'`/`'-N'` (relative to seed, never to `base`). |
| `saturation` | Override seed saturation (0–100). |
| `tone` | Number (absolute 0–100), `'+N'`/`'-N'`, or `'max'`/`'min'`. Without `base`, relative anchors to the seed; with `base`, anchors to `base`'s tone per scheme. |
| `saturationFactor` | Multiplier on the seed (0–1). |
| `mode` | `'auto'` (default) / `'fixed'` / `'static'`. |
| `autoFlip` | Flip out-of-bounds results instead of clamping. Default: global `autoFlip`. |
| `contrast` | Contrast floor (WCAG or APCA). Without `base`, anchored to the literal seed; with `base`, solved per scheme. |
| `base` | `GlazeColorToken` or raw `GlazeColorValue`. See [Pairing colors](#pairing-colors). |
| `opacity` | Fixed alpha 0–1. Combining with `contrast` is not recommended — `console.warn` is emitted. |
| `pastel` | Per-color `pastel` override. Falls through to the global / per-theme `pastel` config when omitted. See [Per-color `pastel`](#per-color-pastel). |
| `role` | Semantic role against `base` / the seed (see [Roles](#roles)). Fixes APCA polarity. |
| `name` | Debug label only — surfaces in warnings/errors. Does not change output keys. |

Named CSS colors (`'red'`, `'blueviolet'`) are not supported.

### Defaults

Every input form defaults to `mode: 'auto'` so the resolved token adapts between light and dark like an ordinary theme color. The config snapshot taken at create time differs by input form:

- **Value-shorthand** (bare strings, value objects, and `{ from, ...overrides }`):
  - Light variant preserves the input tone exactly (`lightTone: false`).
  - All other config fields (`darkTone`, `darkDesaturation`, `autoFlip`) snapshot from `globalConfig` at create time.
- **Structured input** (`{ hue, saturation, tone, ... }`):
  - Both tone windows snapshot from `globalConfig` at create time (same as a theme color).
- All fields are **snapshotted at color-creation time** — later `glaze.configure()` calls don't retroactively change existing tokens.

```ts
// Bare string — adapts automatically
glaze.color('#26fcb2')

// Value-object — same behavior
glaze.color({ h: 152, s: 0.95, l: 0.74 })

// OKHST value-object — tone axis
glaze.color({ h: 152, s: 0.95, t: 0.70 })

// From form — value + color overrides
glaze.color({ from: '#1a1a2e', hue: '+20', contrast: 'AA' })

// Structured form — explicit hue/saturation/tone (0–100)
glaze.color({ hue: 152, saturation: 95, tone: 74 })
```

### Token methods

A `GlazeColorToken` exposes:

| Method | Description |
|---|---|
| `token.resolve()` | Resolve as a `ResolvedColor` (light/dark/lightContrast/darkContrast variants). |
| `token.token(options?)` | Flat token map (no color-name key). Options: `format`, `modes`, `states`. |
| `token.tasty(options?)` | [Tasty](https://tasty.style) state map (no color-name key). Same options as `token.token`. |
| `token.json(options?)` | JSON map (no color-name key). Options: `format`, `modes`. |
| `token.css({ name, format?, suffix? })` | CSS custom property declarations grouped by scheme variant. `name` is **required** and becomes the variable identifier (`'brand'` → `--brand-color`). Defaults: `format: 'rgb'`, `suffix: '-color'` (matches `theme.css`). |
| `token.dtcg(options?)` | DTCG color tokens, one per scheme variant (no color-name key). Each entry is a full `{ $type: 'color', $value }` token. Options: `colorSpace` (`'srgb'` \| `'oklch'`), `modes`. |
| `token.dtcgResolver({ name, ... })` | A single DTCG Resolver-Module document for this color, keyed by `name` across all scheme variants. `name` is **required**. Same options as `theme.dtcgResolver()` plus `name`. |
| `token.tailwind({ name, ... })` | Tailwind v4 `@theme` block + dark / high-contrast overrides for this color. `name` is **required** (forms `--color-<name>`). Same options as `theme.tailwind()` plus `name`. |
| `token.export()` | JSON-safe snapshot — pass to `glaze.colorFrom(...)` to rehydrate. |

### Per-instance config override

The optional `config` second argument (`GlazeConfigOverride`) overrides the resolve-relevant global config fields for a single token or theme. Fields that are omitted fall through to the live global config at create time (and are snapshotted). A tone window can be `[lo, hi]`, `{ lo, hi, eps }`, or `false` (disable clamping).

`GlazeConfigOverride`:

| Field | Default (from global) | Description |
|---|---|---|
| `lightTone` | `[10, 100]` | Light tone window: `[lo, hi]`, `{ lo, hi, eps }`, or `false` (disable clamping). |
| `darkTone` | `[15, 95]` | Dark tone window: `[lo, hi]`, `{ lo, hi, eps }`, or `false` (disable clamping). |
| `darkDesaturation` | `0.1` | Saturation reduction in dark scheme (0–1). |
| `autoFlip` | `true` | Default for each color's `autoFlip`: when solving `contrast` (or applying a relative `tone` that overshoots), allow crossing to the opposite side instead of clamping. |
| `shadowTuning` | `undefined` | Default shadow tuning (meaningful for themes; harmless on color tokens). |

Config overrides apply to both `glaze.color()` tokens and `glaze()` themes:

```ts
// Standalone color — preserve raw tone in both schemes
glaze.color('#26fcb2', { darkTone: false })

// Restore the #000 → white dark flip (full dark range)
glaze.color('#000000', {
  lightTone: false,
  darkTone: [15, 100],
})

// Structured form with config override
glaze.color({ hue: 152, saturation: 95, tone: 74 }, { darkTone: false })

// Theme with config override
const rawTheme = glaze(280, 80, { lightTone: false })
```

The override is **snapshotted at create time** so later `glaze.configure()` calls don't change already-created tokens or themes (for non-overridden fields, the snapshot captured the global value at creation time; for themes, non-overridden fields are re-read from the live global at resolve time — see [Theme config override](#theme-config-override)).

### Theme config override

When a theme is created with a `GlazeConfigOverride`, the override is **merged over the live global config at resolve time**. This means:

- Fields you overrode are fixed — `glaze.configure()` can't change them for this theme.
- Fields you didn't override still react to later `glaze.configure()` calls.

```ts
const t = glaze(280, 80, { lightTone: [0, 50] });
t.colors({ text: { tone: 50, saturation: 1 } });
// text.light lands inside the [0, 50] window — always, regardless of
// global lightTone changes.
// text.dark.s reacts to glaze.configure({ darkDesaturation }) since it's not overridden.
```

`extend` inherits the parent's override and shallow-merges the child's:

```ts
const child = t.extend({ config: { darkTone: false } });
// child: lightTone { lo: 0, hi: 50 } (inherited) + darkTone: false (added)
```

`theme.export()` includes `config`; `glaze.from(data)` restores it.

### `glaze.colorFrom(data)`

Inverse of `token.export()`. The exported snapshot includes the original input, all overrides (with any `base` token recursively serialized), and the full effective config — so later `glaze.configure()` calls don't change rehydrated tokens.

```ts
const text = glaze.color({ from: '#1a1a1a', contrast: 'AA' });
const data = text.export();
const restored = glaze.colorFrom(data);
// restored.resolve() === text.resolve() byte-for-byte
```

Both value-form and structured-form tokens round-trip.

### Pairing colors

Set `base` to anchor a standalone color to another standalone color or raw value. The contrast solver and relative `tone` offsets switch their anchor from the literal seed to the base's resolved variant per scheme — so the same text color automatically lands at AA against its background in light, dark, and high-contrast modes.

```ts
const bg = glaze.color('#1a1a2e');

// Text guaranteed AA against `bg` in every scheme.
const text = glaze.color({ from: '#ffffff', base: bg, contrast: 'AA' });

// Border 8 tone units lighter than `bg` in each scheme.
const border = glaze.color({ from: '#000000',
  base: bg,
  tone: '+8',
  mode: 'fixed',
});

// Raw-value base — Glaze auto-wraps it via `glaze.color(value)`.
const text2 = glaze.color({ from: '#ffffff', base: '#1a1a2e', contrast: 'AA' });
```

Behavior with `base`:

- `contrast` is solved per scheme against `base`'s resolved variant (light / dark / lightContrast / darkContrast).
- Relative `tone: '+N'` / `'-N'` is anchored to `base`'s tone per scheme (matches theme behavior).
- Relative `hue: '+N'` / `'-N'` still anchors to the **seed** (the value passed to `glaze.color()`), not the base.
- `mode` works as a per-pair knob.
- The base token's `.resolve()` is called lazily on the first resolve of the dependent and the result is captured by reference; later mutations to the base don't apply.
- **Structured bases are resolved at full range for linking math**: when a value/`from` color links to a base created via the structured form, the contrast/tone anchor uses the raw input tone (not the windowed output). This ensures the anchor matches what you intended, not what the light window remapped it to. The base's own `.resolve()` output is unaffected.
- When the contrast target is physically unreachable, `glaze` emits a single `console.warn` per `(name, scheme, target)` triple and returns the closest passing variant. Use the `name` override to make the warning identifiable.

Chains compose:

```ts
const bg = glaze.color('#000000');
const surface = glaze.color({ from: '#222222', base: bg, contrast: 'AAA' });
const text = glaze.color({ from: '#ffffff', base: surface, contrast: 'AA' });
```

### `name` is a debug label

The `name` override appears in `console.warn` / Error messages but **does not** change output keys (`.token()`, `.tasty()`, `.json()`, `.css()` still use `''`, `light`, etc.). The CSS variable name comes from `css({ name })`, not from the override.

---

## Shadows

### Defining shadow colors in a theme

```ts
theme.colors({
  surface: { tone: 95 },
  text:    { base: 'surface', tone: '-52', contrast: 'AAA' },

  'shadow-sm': { type: 'shadow', bg: 'surface', fg: 'text', intensity: 5 },
  'shadow-md': { type: 'shadow', bg: 'surface', fg: 'text', intensity: 10 },
  'shadow-lg': { type: 'shadow', bg: 'surface', fg: 'text', intensity: 20 },
});
```

Shadow colors are included in all output methods (`tokens()`, `tasty()`, `css()`, `json()`) alongside regular colors and emit an alpha component:

```
'oklch(0.15 0.009 282 / 0.1)'
'rgb(34 28 42 / 0.1)'
```

### How shadows work

1. **Contrast weight** — when `fg` is provided, shadow strength scales with `|l_bg − l_fg|`. Dark text on a light background produces a strong shadow; near-background-lightness elements produce barely visible shadows.
2. **Pigment color** — hue blended between fg and bg, low saturation, dark lightness.
3. **Alpha** — computed via a `tanh` curve that saturates smoothly toward `alphaMax` (default `1.0`), ensuring well-separated shadow levels even on dark backgrounds.

Omit `fg` for an achromatic shadow at full user-specified intensity:

```ts
theme.colors({
  'drop-shadow': { type: 'shadow', bg: 'surface', intensity: 12 },
});
```

`intensity` supports `[normal, highContrast]` pairs:

```ts
'shadow-card': { type: 'shadow', bg: 'surface', fg: 'text', intensity: [10, 20] },
```

### `ShadowTuning`

Fine-tune behavior per-color or globally via `glaze.configure({ shadowTuning })`. Per-color `tuning` is merged field-by-field with the global one.

| Parameter | Default | Description |
|---|---|---|
| `saturationFactor` | `0.18` | Fraction of fg saturation kept in pigment. |
| `maxSaturation` | `0.25` | Upper clamp on pigment saturation. |
| `lightnessFactor` | `0.25` | Multiplier for bg lightness → pigment lightness. |
| `lightnessBounds` | `[0.05, 0.20]` | Clamp range for pigment lightness. |
| `minGapTarget` | `0.05` | Target minimum gap between pigment and bg lightness. |
| `alphaMax` | `1.0` | Asymptotic maximum alpha. |
| `bgHueBlend` | `0.2` | Blend weight pulling pigment hue toward bg hue. `0` = pure fg hue, `1` = pure bg hue. |

```ts
theme.colors({
  'shadow-soft': {
    type: 'shadow', bg: 'surface', intensity: 10,
    tuning: { alphaMax: 0.3, saturationFactor: 0.1 },
  },
});

glaze.configure({
  shadowTuning: { alphaMax: 0.5, bgHueBlend: 0.3 },
});
```

### Standalone shadow computation

`glaze.shadow(input)` computes a shadow outside of a theme. `bg` and `fg` accept any `GlazeColorValue`:

```ts
const v = glaze.shadow({
  bg: '#f0eef5',
  fg: '#1a1a2e',
  intensity: 10,
});
// → { h: 280, s: 0.14, l: 0.2, alpha: 0.1 }

const css = glaze.format(v, 'oklch');
// → 'oklch(0.15 0.014 280 / 0.1)'
```

`GlazeShadowInput`:

| Field | Type | Description |
|---|---|---|
| `bg` | `GlazeColorValue` | Background. Any `GlazeColorValue` form. Alpha components dropped with warning. |
| `fg` | `GlazeColorValue` | Optional foreground. Same forms as `bg`. |
| `intensity` | `number` | 0–100. |
| `tuning` | `ShadowTuning` | Optional. |

### Fixed opacity (regular colors)

For a simple fixed-alpha color (no shadow algorithm), use `opacity` on a regular color:

```ts
theme.colors({
  overlay: { tone: 0, opacity: 0.5 },
});
// → 'oklch(0 0 0 / 0.5)'
```

---

## Mix colors

### Opaque mix

Produces a solid color by interpolating between `base` and `target`:

```ts
theme.colors({
  surface: { tone: 95 },
  accent:  { tone: 30 },
  tint:    { type: 'mix', base: 'surface', target: 'accent', value: 30 },
});
```

- `value: 0` = pure base, `value: 100` = pure target.
- Result has alpha = 1.
- Adapts to light/dark/HC schemes automatically via the resolved base and target.

### Transparent mix

Produces the target color with controlled opacity — useful for hover overlays:

```ts
theme.colors({
  surface: { tone: 95 },
  black:   { tone: 0, saturation: 0 },
  hover: {
    type: 'mix', base: 'surface', target: 'black',
    value: 8, blend: 'transparent',
  },
});
// hover → black with alpha = 0.08
```

The output color has `h`, `s`, `l` from the target and `alpha = value / 100`.

### Blend space (opaque only)

| `space` | Behavior | Best for |
|---|---|---|
| `'okhsl'` (default) | Perceptually uniform OKHSL interpolation. | Design token derivation. |
| `'srgb'` | Linear sRGB channel interpolation. | Matching browser compositing of CSS color-mix / overlay. |

Transparent blending always composites in linear sRGB (matches browser alpha compositing).

### Contrast solving on mixes

Mix colors support the same `contrast` prop as regular colors. The solver adjusts the mix ratio (opaque) or opacity (transparent) to meet the WCAG target:

```ts
'tint': {
  type: 'mix', base: 'surface', target: 'accent',
  value: 10, contrast: 'AA',
},
'overlay': {
  type: 'mix', base: 'surface', target: 'accent',
  value: 5, blend: 'transparent', contrast: 3,
},
```

Both `value` and `contrast` support `[normal, highContrast]` pairs.

### Achromatic colors

When mixing with achromatic colors (saturation near zero, e.g. white or black) in `okhsl` space, the hue comes from whichever color has saturation. Matches CSS `color-mix()` "missing component" behavior. For purely achromatic mixes prefer `space: 'srgb'` where hue is irrelevant.

### Mix chaining

Mix colors can reference other mix colors:

```ts
theme.colors({
  white: { tone: 100, saturation: 0 },
  black: { tone: 0, saturation: 0 },
  gray:  { type: 'mix', base: 'white', target: 'black', value: 50, space: 'srgb' },
  lightGray: { type: 'mix', base: 'white', target: 'gray', value: 50, space: 'srgb' },
});
```

Mix colors **cannot** reference shadow colors (same restriction as regular dependent colors).

---

## Palette

`glaze.palette(themes, options?)` composes multiple themes into a single token namespace.

```ts
const palette = glaze.palette({ primary, danger, success, warning });
const palette = glaze.palette(
  { primary, danger, success },
  { primary: 'primary' },
);
```

`GlazePaletteOptions`:

| Option | Description |
|---|---|
| `primary` | Name of the primary theme. The primary's tokens are duplicated **without** prefix in all exports, providing convenient short aliases alongside the prefixed versions. Throws if the name doesn't match any theme. |

A `GlazePalette` exposes:

| Method | Description |
|---|---|
| `palette.tokens(options?)` | Flat token map grouped by scheme variant. |
| `palette.tasty(options?)` | Tasty style-to-state bindings. |
| `palette.json(options?)` | Per-theme JSON map (no prefix needed — keyed by theme name). |
| `palette.css(options?)` | CSS custom property declaration strings. |

### `GlazePaletteExportOptions`

Shared by `tokens`, `tasty`, and `css`:

| Option | Default | Description |
|---|---|---|
| `prefix` | `true` (= `"<themeName>-"`) | `false` disables prefixing. Or pass a custom map: `{ primary: 'brand-', danger: 'error-' }`. |
| `primary` | inherits from palette creation | `string` to override, `false` to disable for this call. |

Each export method also accepts its own format/options shape:

| Method | Additional options |
|---|---|
| `palette.tokens(options?)` | `format`, `modes` |
| `palette.tasty(options?)` | `format`, `modes`, `states` |
| `palette.css(options?)` | `format`, `suffix` |

`palette.css()` does not accept `modes`; it always returns all four CSS strings (`light`, `dark`, `lightContrast`, `darkContrast`).

### Prefix behavior

By default all palette tokens are prefixed:

```ts
palette.tokens();
// → {
//   light: { 'primary-surface': 'okhsl(...)', 'danger-surface': 'okhsl(...)' },
//   dark:  { 'primary-surface': 'okhsl(...)', 'danger-surface': 'okhsl(...)' },
// }
```

Custom map (any theme not listed falls back to `"<themeName>-"`):

```ts
palette.tokens({ prefix: { primary: 'brand-', danger: 'error-' } });
```

Disable prefixing:

```ts
palette.tokens({ prefix: false });
```

### Collision detection

When two themes produce the same output key (via `prefix: false`, custom prefix maps, or primary unprefixed aliases), the **first-written value wins** and a `console.warn` is emitted:

```
glaze: token "surface" from theme "b" collides with theme "a" — skipping.
```

### Primary theme aliases

The primary theme's tokens are duplicated without prefix:

```ts
const palette = glaze.palette(
  { primary, danger, success },
  { primary: 'primary' },
);
palette.tokens();
// → {
//   light: {
//     'primary-surface': 'okhsl(...)',
//     'danger-surface':  'okhsl(...)',
//     'success-surface': 'okhsl(...)',
//     'surface':         'okhsl(...)',  // unprefixed alias
//   },
// }
```

Override per-export:

```ts
palette.tokens({ primary: 'danger' });
palette.tokens({ primary: false });
```

The primary alias works alongside any prefix mode — when using a custom map, primary tokens are still duplicated without prefix:

```ts
palette.tokens({ prefix: { primary: 'p-', danger: 'd-' } });
// → 'p-surface' + 'surface' (alias) + 'd-surface'
```

### `palette.json()`

JSON export groups by theme name (no prefix needed):

```ts
palette.json();
// → {
//   primary: { surface: { light: 'okhsl(...)', dark: 'okhsl(...)' } },
//   danger:  { surface: { light: 'okhsl(...)', dark: 'okhsl(...)' } },
// }
```

### `palette.css()`

```ts
const css = palette.css();
const stylesheet = `
:root { ${css.light} }
@media (prefers-color-scheme: dark) {
  :root { ${css.dark} }
}
`;
```

`palette.css()` accepts the same `GlazeCssOptions` as `theme.css()` plus `GlazePaletteExportOptions`.
It does not accept `modes`; all four result fields are always returned.

### `palette.dtcg()`

DTCG export for a palette. Prefix defaults to `true` and the palette-level `primary` is honored (the primary theme's tokens are duplicated without prefix as aliases).

```ts
palette.dtcg()
// → {
//   light: {
//     'primary-surface': { $type: 'color', $value: { ... } },
//     'surface':         { $type: 'color', $value: { ... } },  // unprefixed alias
//     'danger-surface':  { $type: 'color', $value: { ... } },
//   },
//   dark: { ... },
// }
```

Accepts `GlazeDtcgOptions` plus `GlazePaletteExportOptions`.

### `palette.dtcgResolver()`

Resolver-Module export for a palette. Same as `theme.dtcgResolver()` but merges every theme (with prefix / `primary` aliasing) into the single `sets.base` source and each `scheme` context. Prefix defaults to `true`; the palette-level `primary` is honored.

```ts
palette.dtcgResolver()
// → {
//   version: '2025.10',
//   sets: { base: { sources: [ { 'primary-surface': {…}, 'surface': {…}, 'danger-surface': {…} } ] } },
//   modifiers: { scheme: { default: 'light', contexts: { light: [], dark: [ {…} ] } } },
//   resolutionOrder: [ { $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' } ],
// }
```

Accepts `GlazeDtcgResolverOptions` plus `GlazePaletteExportOptions`.

### `palette.tailwind()`

Tailwind export for a palette. All themes are merged into a single `@theme` block (plus dark / high-contrast overrides), so each color is reachable as a Tailwind utility. Prefix defaults to `true`.

```ts
const css = palette.tailwind();
// @theme {
//   --color-primary-surface: oklch(...);
//   --color-surface: oklch(...);          /* unprefixed alias */
//   --color-danger-surface: oklch(...);
// }
// .dark { ... }
```

Accepts `GlazeTailwindOptions` plus `GlazePaletteExportOptions`. The palette `prefix` option (theme prefixing) is separate from `GlazeTailwindOptions.namespace` (the `--color-*` CSS namespace).

---

## Output formats

Control the color format with the `format` option on any export method:

| Format | Output (alpha = 1) | Output (alpha < 1) | Notes |
|---|---|---|---|
| `'okhsl'` (default for `tasty()`) | `okhsl(H S% L%)` | `okhsl(H S% L% / A)` | Glaze's native format, not a CSS function. **Tasty-only** (`tasty()`, `token()`, `.tasty()`). |
| `'okhst'` | `okhst(H S% T%)` | `okhst(H S% T% / A)` | OKHST tone axis. **Tasty-only** — same restriction as `okhsl`. |
| `'oklch'` (default for `tokens()` / `json()`) | `oklch(L C H)` | `oklch(L C H / A)` | OKLab-based LCH. Native CSS. Required for `splitHue`. |
| `'rgb'` (default for `css()`) | `rgb(R G B)` | `rgb(R G B / A)` | Rounded integers, modern space syntax. |
| `'hsl'` | `hsl(H S% L%)` | `hsl(H S% L% / A)` | Modern space syntax. |

```ts
theme.tokens();                    // 'oklch(0.965 0.0123 280)'  (default)
theme.tokens({ format: 'rgb' });   // 'rgb(244 240 250)'
theme.tasty();                     // 'okhsl(280 60% 97%)'       (default)
theme.tasty({ format: 'okhst' });  // 'okhst(280 60% 97%)'
```

All numeric output strips trailing zeros for cleaner CSS (e.g. `95` not `95.0`).

The `format` option works on CSS-string exports: `theme.tokens()`, `theme.tasty()`, `theme.json()`, `theme.css()`, `theme.tailwind()`, the same on `palette`, and on `token.token()` / `.tasty()` / `.json()` / `.css()` / `.tailwind()`. **`okhsl` and `okhst` throw on non-Tasty exports** (`tokens`, `json`, `css`, `tailwind`) — they are not native CSS color spaces.

### Hue channel splitting (`splitHue`)

On `theme.css()`, `theme.tasty()`, `palette.css()`, `palette.tasty()`, and standalone `color.css()` with `format: 'oklch'`, set `splitHue: true` to emit hue as its own custom property so consumers can re-skin at runtime:

```css
/* theme.css({ format: 'oklch', splitHue: true, name: 'brand' }) */
--brand-hue: 240;
--accent-hue: calc(var(--brand-hue) + 20);
--surface-color: oklch(0.52 0.06 var(--brand-hue));
--accent-color: oklch(0.62 0.03 var(--accent-hue));
```

**Requirements:** every exported color must be pastel (`pastel: true` globally or per-color). Pastel mode bounds chroma by the hue-independent safe chroma at each lightness, so emitted `C` stays in sRGB for any rotated hue. Non-pastel palettes throw rather than emit values that would clip under rotation.

**Limitations:** `oklch` only (native CSS `var()` in the hue slot). Shadow and mix colors stay inline (blended hue). Standalone `.token()` / `.tasty()` do not support `splitHue` (return shape cannot carry the `$name-hue` declaration).

`theme.dtcg()` / `theme.dtcgResolver()` / `palette.dtcg()` / `palette.dtcgResolver()` ignore `format` — DTCG emits structured `$value` objects, not CSS strings. Use the `colorSpace` option (`'srgb'` or `'oklch'`) to pick the color representation instead.

---

## Adaptation modes

`mode` controls how a color adapts across schemes:

| Mode | Behavior |
|---|---|
| `'auto'` (default) | Full adaptation. Dark is a single tone inversion (`100 − t`) remapped into the dark window. High-contrast uses the full range. |
| `'fixed'` | Color stays recognizable. Tone is *mapped* (not inverted) into the dark window. Use for brand buttons, CTAs, status banners. |
| `'static'` | No adaptation. Same tone in every scheme. |

### How relative tone adapts

**`auto`** — the offset is anchored to the base's per-scheme tone:

```
Light: surface tone=97, text tone='-52' → tone 45 (dark text on light bg)
Dark:  surface inverts to a low tone; the '-52' offset re-anchors to the
       base's light tone and maps into the dark window (light text on dark bg)
```

**`fixed`** — tone is mapped (not inverted), relative sign preserved:

```
Light: accent-fill tone=52, accent-text tone='+20' → lighter than the fill
Dark:  accent-fill maps into the dark window, sign preserved
```

Offsets that would push past `[0, 100]` clamp to the boundary, or — with `autoFlip` (default on) — mirror to the other side of the base. Set `autoFlip: false` to keep the authored side and clamp instead.

**`static`** — no adaptation, same tone in every scheme.

---

## Light / dark scheme mapping

The mapping is now a single tone pipeline; there is no Möbius curve. See [`docs/okhst.md`](okhst.md) for the full math and the calibrated default constants.

### Light scheme

An authored tone (0–100) is remapped into the `lightTone` window. The window's `lo`/`hi` are OKHSL-lightness endpoints (0–100); the tone is positioned within the window's tone interval and converted to a final OKHSL lightness. `static` mode and HC variants use the full range.

```
window      = lightTone               // default [10, 100]
finalTone   = remap(authorTone, window)
finalL      = fromTone(finalTone)     // OKHSL lightness
```

### Dark scheme

**`auto`** — invert the tone, then remap into the dark window:

```
window    = darkTone                  // default [15, 95]
inverted  = 100 - authorTone
finalTone = remap(inverted, window)
```

Because tone is contrast-uniform, the inversion preserves contrast steps without a fitted curve — the asymmetry between light and dark lives entirely in the two windows' `(lo, hi, eps)` scalars (`eps` defaults to the reference `0.05`).

**`fixed`** — remap into the dark window without inversion:

```
finalTone = remap(authorTone, darkTone)
```

In high-contrast variants both windows are bypassed (forced to the full `[0, 100]` range): `auto` still inverts, `fixed`/`static` do not.

### Dark scheme — saturation

`darkDesaturation` reduces saturation for all colors in dark scheme:

```ts
S_dark = S_light * (1 - darkDesaturation) // default: 0.1
```

`static` mode skips desaturation.

---

## Configuration

```ts
glaze.configure({
  lightTone: [10, 100], // [lo, hi]; or { lo, hi, eps } / false to disable clamping
  darkTone: [15, 95],   // [lo, hi]; or { lo, hi, eps } / false to disable clamping
  darkDesaturation: 0.1,
  states: {
    dark: '@media(prefers-color-scheme: dark)',
    highContrast: '@media(prefers-contrast: more)',
  },
  modes: {
    dark: true,
    highContrast: false,
  },
  shadowTuning: {
    alphaMax: 0.6,
    bgHueBlend: 0.2,
  },
});
```

A `ToneWindow` is `[lo, hi]` (OKHSL-lightness endpoints, reference eps — the common form), `{ lo, hi, eps }` (advanced: explicit per-mode render eps), or `false` to disable clamping (full range `[0, 100]` at the reference eps). `false` removes the *boundaries*, not the contrast-uniform tone curve.

`GlazeConfig`:

| Field | Default | Description |
|---|---|---|
| `lightTone` | `[10, 100]` | Light scheme tone window: `[lo, hi]`, `{ lo, hi, eps }`, or `false` to disable clamping. Bypassed in HC. |
| `darkTone` | `[15, 95]` | Dark scheme tone window: `[lo, hi]`, `{ lo, hi, eps }`, or `false` to disable clamping. Bypassed in HC. |
| `darkDesaturation` | `0.1` | Saturation reduction in dark scheme (0–1). |
| `states.dark` | `'@media(prefers-color-scheme: dark)'` | State alias for dark mode tokens (Tasty export). Defaults to a media query so tokens react to the OS preference without registering custom states. |
| `states.highContrast` | `'@media(prefers-contrast: more)'` | State alias for HC tokens (Tasty export). |
| `modes.dark` | `true` | Include dark variants in exports. |
| `modes.highContrast` | `false` | Include HC variants. |
| `shadowTuning` | `undefined` | Default tuning for all shadow colors. Per-color tuning merges field-by-field. |
| `autoFlip` | `true` | Default for each color's `autoFlip`. When solving `contrast` (or applying a relative `tone` that overshoots `[0, 100]`), allow crossing to the opposite side instead of clamping. With `false`, only the requested direction is considered; unmet contrasts pin the tone to that direction's extreme (and emit a warning) and overshooting offsets clamp to the boundary. Override per color via [`autoFlip`](#autoflip). |
| `pastel` | `false` | Hue-independent "safe" chroma limit across all colors so scaling saturation never exceeds the sRGB boundary at any hue for the given lightness. Override per color via [`pastel`](#per-color-pastel). |
| `inferRole` | `true` | Infer each color's [`role`](#roles) from its name when no explicit `role` is set. Set to `false` to opt out of name-based inference (the base-opposite and foreground-default fallbacks still apply). |

| Method | Description |
|---|---|
| `glaze.configure(config)` | Merge into the global config. Bumps a config version that invalidates theme caches. |
| `glaze.getConfig()` | Snapshot the current resolved config (shallow copy). |
| `glaze.resetConfig()` | Reset to defaults (also bumps the version counter). |

Standalone `glaze.color()` tokens snapshot the resolve-relevant fields at create time, so later `configure()` calls don't change already-created tokens. Themes merge the live global at resolve time for fields not overridden via `GlazeConfigOverride`.

---

## Output modes

Control which scheme variants appear in `tokens()` / `tasty()` / `json()` exports:

```ts
// Light only
palette.tokens({ modes: { dark: false, highContrast: false } });

// Light + dark (default)
palette.tokens({ modes: { highContrast: false } });

// All four variants
palette.tokens({ modes: { dark: true, highContrast: true } });
// → { light, dark, lightContrast, darkContrast }
```

Resolution priority (highest first):

1. Per-call `modes` option on `tokens` / `tasty` / `json`.
2. `glaze.configure({ modes })` — global config.
3. Built-in default: `{ dark: true, highContrast: false }`.

---

## Validation

| Condition | Behavior |
|---|---|
| `contrast` without `base` in a **theme** color | Validation error |
| Relative `tone` without `base` in a **theme** color | Validation error |
| `contrast` without `base` in `glaze.color()` | Anchors against the literal seed (no error) |
| Relative `tone` without `base` in `glaze.color()` | Anchors against the literal seed (no error) |
| Relative `tone` overshoots `[0, 100]` | Mirror to the other side of the base (`autoFlip` on, default), or clamp to the boundary (`autoFlip` off) |
| `tone` resolves outside 0–100 | Clamp silently |
| `'max'` / `'min'` without `base` | Allowed — resolves to the scheme's tone extreme (root color) |
| `saturation` outside 0–1 | Clamp silently |
| Circular `base` references | Validation error |
| `base` references non-existent name | Validation error |
| Shadow `bg` references non-existent color | Validation error |
| Shadow `fg` references non-existent color | Validation error |
| Shadow `bg` references another shadow color | Validation error |
| Shadow `fg` references another shadow color | Validation error |
| Regular color `base` references a shadow color | Validation error |
| Shadow `intensity` outside 0–100 | Clamp silently |
| `contrast` + `opacity` combined | `console.warn` |
| Mix `base` references non-existent color | Validation error |
| Mix `target` references non-existent color | Validation error |
| Mix `base` references a shadow color | Validation error |
| Mix `target` references a shadow color | Validation error |
| Mix `value` outside 0–100 | Clamp silently |
| Circular references involving mix colors | Validation error |
| Contrast target physically unreachable | `console.warn` (deduped per `(name, scheme, target)`); closest passing variant returned |

---

## Color math utilities

For advanced use, Glaze re-exports its internal color math.

### Conversions

```ts
import {
  okhslToLinearSrgb,
  okhslToSrgb,
  okhslToOklab,
  oklabToOkhsl,
  srgbToOkhsl,
  hslToSrgb,
  parseHex,
  parseHexAlpha,
  relativeLuminanceFromLinearRgb,
  contrastRatioFromLuminance,
  gamutClampedLuminance,
} from '@tenphi/glaze';
```

| Function | Description |
|---|---|
| `okhslToLinearSrgb(h, s, l)` | OKHSL (h: 0–360, s/l: 0–1) → linear sRGB tuple. |
| `okhslToSrgb(h, s, l)` | OKHSL → gamma-encoded sRGB tuple (0–1 per channel). |
| `okhslToOklab([h, s, l])` | OKHSL → OKLab `[L, a, b]`. |
| `oklabToOkhsl([L, a, b])` | OKLab → OKHSL. |
| `srgbToOkhsl([r, g, b])` | Gamma sRGB (0–1) → OKHSL. |
| `hslToSrgb(h, s, l)` | CSS HSL → sRGB tuple. |
| `parseHex(hex)` | Parse `#rgb` / `#rrggbb` to sRGB tuple. Returns `null` on invalid input. |
| `parseHexAlpha(hex)` | Parse `#rgb` / `#rrggbb` / `#rrggbbaa`; returns `[r, g, b, a?]`. |
| `relativeLuminanceFromLinearRgb(rgb)` | WCAG relative luminance from linear sRGB. |
| `contrastRatioFromLuminance(yA, yB)` | WCAG contrast ratio from two luminances. |
| `gamutClampedLuminance(linearRgb)` | Relative luminance with channel clamping for out-of-gamut colors. |

### Format writers

```ts
import { formatOkhsl, formatRgb, formatHsl, formatOklch } from '@tenphi/glaze';

formatOkhsl(280, 60, 95); // 'okhsl(280 60% 95%)'
formatRgb(280, 60, 95);   // 'rgb(244 240 250)'
formatHsl(280, 60, 95);   // 'hsl(280 60% 95%)'
formatOklch(280, 60, 95); // 'oklch(0.95 ... 280)'
```

To attach an alpha component, use `glaze.format(variant, format)` on a `ResolvedColorVariant` (which carries the `alpha` channel) instead of these raw writers.

### OKHST tone utilities

```ts
import {
  toTone,
  fromTone,
  toneFromY,
  yFromTone,
  okhstToOkhsl,
  okhslToOkhst,
  variantToOkhsl,
  REF_EPS,
} from '@tenphi/glaze';
```

| Function | Description |
|---|---|
| `toTone(l, eps?)` | OKHSL lightness (0–1) → tone (0–100). Defaults to `REF_EPS`. |
| `fromTone(t, eps?)` | Tone (0–100) → OKHSL lightness (0–1). Inverse of `toTone`. |
| `toneFromY(y, eps?)` / `yFromTone(t, eps?)` | Same transfer in luminance space (0–1). |
| `okhstToOkhsl({ h, s, t })` | OKHST → OKHSL (`{ h, s, l }`). |
| `okhslToOkhst({ h, s, l })` | OKHSL → OKHST (`{ h, s, t }`). |
| `variantToOkhsl(variant)` | `ResolvedColorVariant` (stores `t`) → `{ h, s, l, alpha }` for rendering. |
| `REF_EPS` | Reference epsilon (`0.05`) for the canonical tone axis. |

`ResolvedColorVariant` now stores `{ h, s, t, alpha }` (tone, not lightness). Use `variantToOkhsl(variant).l` to recover OKHSL lightness. See [`docs/okhst.md`](okhst.md) for the full model.

### Contrast solver

```ts
import {
  findToneForContrast,
  findValueForMixContrast,
  resolveContrastForMode,
  resolveMinContrast,
  apcaContrast,
} from '@tenphi/glaze';
```

| Function | Description |
|---|---|
| `findToneForContrast(opts)` | Binary-search for the tone (0–1) that meets a contrast floor (WCAG or APCA) against a base color. Returns `{ tone, contrast, met, branch, flipped? }`. |
| `findValueForMixContrast(opts)` | Same, but searches for a mix `value` (0–1) that meets a contrast floor between a base and a target. |
| `resolveContrastForMode(spec, isHC, polarity?, outerExplicitHC?)` | Resolves a `ContrastSpec` to `{ metric: 'wcag' \| 'apca', target }` for the requested mode (picks the normal or HC entry of any pair). In HC, applies the metric's auto-enhancement unless `outerExplicitHC` is set or the inner metric pair carries an explicit HC value: APCA +15 Lc (clamped to 106); WCAG AA → AAA / AA-large → AAA-large (AAA-family and bare numbers unchanged). |
| `resolveMinContrast(value)` | Resolves a `MinContrast` (WCAG preset or number) to a numeric ratio. |
| `apcaContrast(yText, yBg)` | APCA Lc magnitude (0–106) for two relative luminances. |

Exported constants: `APCA_PRESETS`, `APCA_HC_ENHANCEMENT` (`15`, the Enhanced Level delta), `APCA_MAX_LC` (`106`).

`findToneForContrast` options:

| Option | Default | Description |
|---|---|---|
| `hue` | — | Candidate hue (0–360). |
| `saturation` | — | Candidate saturation (0–1). |
| `preferredTone` | — | Preferred candidate tone (0–1). Kept if it already meets the target. |
| `baseLinearRgb` | — | Base color as linear sRGB tuple. |
| `contrast` | — | `ResolvedContrast` (`{ metric, target }`). |
| `toneRange` | `[0, 1]` | Search bounds in tone. |
| `epsilon` | `1e-4` | Convergence threshold. |
| `maxIterations` | `18` | Max binary-search iterations per branch. |
| `initialDirection` | higher-contrast side | Direction to search first (`'lighter'` or `'darker'`). |
| `flip` | `false` | When `true`, try the opposite direction if the initial one doesn't meet the target. When `false`, only the initial direction is searched — unmet contrasts pin the result to that direction's extreme. |

Result: `{ tone, contrast, met, branch: 'lighter' | 'darker' | 'preferred', flipped? }`. `flipped: true` indicates the initial direction failed and the opposite direction satisfied the target.
