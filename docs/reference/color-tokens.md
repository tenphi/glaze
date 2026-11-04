---
title: Color tokens
description: glaze.color() standalone tokens — input forms, color values, defaults, methods, config overrides, pairing, and snapshots.
---

`glaze.color()` creates a single adaptive color without a theme. A token resolves the same four variants as a theme color (`light`, `dark`, `lightContrast`, `darkContrast`) and has the same output methods. For a guided introduction, see [Getting started](../getting-started.mdx#one-color-without-a-theme); for contrast between tokens, see [Contrast solving](../contrast.mdx#pairing-standalone-colors).

```ts
import { glaze } from '@tenphi/glaze';
import type {
  GlazeColorToken,
  GlazeColorValue,
  GlazeColorInput,
  GlazeFromInput,
} from '@tenphi/glaze';
```

## `glaze.color(input, config?)`

```ts
glaze.color(
  input: GlazeColorValue | GlazeFromInput | GlazeColorInput,
  config?: GlazeConfigOverride,
): GlazeColorToken;
```

The first argument is the color, in one of four shapes told apart by structure. The optional second argument is a [config override](#config-overrides) and works with every shape.

| Shape | Recognized by | Example | Form |
| --- | --- | --- | --- |
| Bare string | A string | `'#26fcb2'`, `'oklch(0.85 0.18 152)'` | Value |
| Value object | Any other object | `{ h: 152, s: 0.95, l: 0.74 }`, `{ r: 38, g: 252, b: 178 }` | Value |
| `{ from, ...overrides }` | Has a `from` key | `{ from: '#1a1a2e', base: bg, contrast: 'AA' }` | Value |
| Structured | Has a `hue` key | `{ hue: 152, saturation: 95, tone: 74 }` | Structured |

```ts
// bare string
glaze.color('#26fcb2');
// OKHSL value object
glaze.color({ h: 152, s: 0.95, l: 0.74 });
// OKHST value object (tone axis)
glaze.color({ h: 152, s: 0.95, t: 0.7 });
// value + overrides
glaze.color({ from: '#1a1a2e', hue: '+20', contrast: 'AA' });
// structured, 0–100 scales
glaze.color({ hue: 152, saturation: 95, tone: 74 });
```

The three **value** forms start from a literal color and take [`GlazeColorOverrides`](#glazecoloroverrides). The **structured** form is a theme-style definition on 0–100 scales; see [`GlazeColorInput`](#glazecolorinput).

## `GlazeColorValue`

```ts
type GlazeColorValue =
  | string
  | OkhslColor
  | OkhstColor
  | RgbColor
  | OklchColor;
// An editor hint; strings are validated at runtime.
type HexColor = `#${string}`;

interface OkhslColor { h: number; s: number; l: number }
interface OkhstColor { h: number; s: number; t: number }
interface RgbColor { r: number; g: number; b: number }
interface OklchColor { l: number; c: number; h: number }
```

The literal color forms. They are accepted by `glaze.color()`, by [`from`](./color-definitions.md#from) on a theme color, by a token's [`base`](#pairing-colors), and by `glaze.shadow()` / `glaze.glow()`.

| Form | Example | Notes |
| --- | --- | --- |
| Hex | `'#26fcb2'`, `'#abc'`, `'#26fcb2ff'`, `'#abcd'` | 3, 4, 6, or 8 digits after `#`. |
| `rgb()` / `rgba()` | `'rgb(38 252 178)'`, `'rgba(38, 252, 178, 0.8)'` | Channels 0–255 or percentages. |
| `hsl()` / `hsla()` | `'hsl(152 97% 57%)'` | Saturation and lightness as percentages. |
| `okhsl()` | `'okhsl(152 95% 74%)'` | OKHSL, Glaze's own output format. |
| `okhst()` | `'okhst(152 95% 70%)'` | OKHST: the third value is tone (`70%` = tone 70). Not a native CSS color; [Tasty](https://tasty.style) output can carry it. |
| `oklch()` | `'oklch(0.85 0.18 152)'` | L 0–1 (or a percentage), C (a percentage maps `100%` to 0.4), H in degrees. |
| `OkhslColor` | `{ h: 152, s: 0.95, l: 0.74 }` | `h` 0–360; `s`, `l` 0–1. |
| `OkhstColor` | `{ h: 152, s: 0.95, t: 0.7 }` | `h` 0–360; `s`, `t` 0–1. The `t` key tells it apart from OKHSL. |
| `RgbColor` | `{ r: 38, g: 252, b: 178 }` | sRGB, 0–255. |
| `OklchColor` | `{ l: 0.85, c: 0.18, h: 152 }` | Same meaning as `oklch()`: L and C 0–1, H in degrees. |

- Function names are case-insensitive. Components can be separated by spaces or commas.
- An alpha component (`#rrggbbaa`, `#rgba`, `/ 0.8`, or a fourth comma value) is dropped with `console.warn`: `glaze: alpha component dropped from "<input>" (standalone color has no opacity field).` Use [`opacity`](#glazecoloroverrides) instead.
- Value objects are recognized by their keys: `r`, `g`, `b` → RGB; `l`, `c`, `h` → OKLCh; `h`, `s`, `t` → OKHST; otherwise OKHSL.
- Not supported: named colors (`'red'`), relative color syntax, angle units other than bare degrees, and `[r, g, b]` tuples.

| Input | Error |
| --- | --- |
| `'red'` | `glaze: unsupported color string "red".` |
| `'#12'` | `glaze: invalid hex color "#12".` |
| `'rgb(38 252)'` | `glaze: expected 3 components in "rgb(38 252)".` |
| `{ h: 152, s: 95, l: 74 }` | `glaze.color: OkhslColor s/l must be in 0–1 range. Did you mean the structured form { hue, saturation, tone } (which uses 0–100)?` |
| `[38, 252, 178]` | `glaze.color: RGB tuple [r, g, b] is no longer supported — use { r, g, b } instead.` |
| `{ r: 300, g: 0, b: 0 }` | `glaze.color: RgbColor r must be a finite number in 0–255 (got 300).` |

The OKHSL, OKHST, and OKLCh object checks reject `s`, `l`, `t`, or `c` above 1.5, which catches 0–100 input meant for the structured form.

## `GlazeColorOverrides`

The fields a value form can carry next to its color. `GlazeFromInput` is `GlazeColorOverrides` plus a required `from: GlazeColorValue`; a bare string or value object is the same with no overrides.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `hue` | `number \| RelativeValue` | The value's hue | Absolute (0–360) replaces the hue. `'+N'` / `'-N'` is relative to the value's own hue, never to `base`. |
| `saturation` | `number` | The value's saturation | Saturation seed, 0–100. Replaces the value's saturation. |
| `saturationFactor` | `number` | `1` | Multiplier (0–1) on the saturation seed. |
| `tone` | `HCPair<ToneValue>` | The value's tone | Absolute (0–100), a tone delta (`'+N'` / `'-N'`), or `'max'` / `'min'`. A delta is measured from the value's own tone, or, with `base`, from the base. Under `mode: 'auto'` the dark variants mirror it; see [Pairing colors](#pairing-colors). |
| `darkHue` | `number \| RelativeValue` | `hue` | Hue for the dark variants. Absolute, or relative to the seed hue (the value's hue, or an absolute `hue` override). |
| `darkSaturation` | `number` | `saturation` | Dark saturation seed, 0–100. When set, `darkDesaturation` is not applied on top. |
| `darkSaturationFactor` | `number` | The light factor | Dark multiplier (0–1) on the dark seed. When set, `darkDesaturation` is not applied on top. |
| `mode` | `AdaptationMode` | `'auto'` | `'fixed'` maps without inverting; `'static'` keeps the same tone in every variant. See [`mode`](./color-definitions.md#mode). |
| `autoFlip` | `boolean` | The config's `autoFlip` | Mirror out-of-range results instead of clamping. See [`autoFlip`](./color-definitions.md#autoflip). |
| `contrast` | `HCPair<ContrastSpec>` | — | Contrast floor. Without `base`, measured against the input value itself; with `base`, against the base in each scheme. See [Contrast and high contrast](./contrast.md#contrastspec). |
| `base` | `GlazeColorToken \| GlazeColorValue` | — | The color this token's contrast and tone delta are measured against. See [Pairing colors](#pairing-colors). |
| `opacity` | `number` | `1` | Fixed alpha, 0–1. Out of range throws. With `contrast`, emits a `console.warn`. |
| `pastel` | `boolean` | The config override's `pastel` (`false`) | See [Per-color `pastel`](./color-definitions.md#per-color-pastel). |
| `role` | `RoleInput` | Inferred | Fixes APCA polarity. See [Roles on tokens](#roles-on-tokens). |
| `name` | `string` | — | Debug label. See [`name`](#name). |

```ts
// hue 282.9 → 302.9
glaze.color({ from: '#1a1a2e', hue: '+20' });
// saturation 0.375 → 0.5
glaze.color({ from: '#1a1a2e', saturation: 50 });
// saturation 0.375 → 0.187
glaze.color({ from: '#1a1a2e', saturationFactor: 0.5 });
```

## `GlazeColorInput`

The structured form: the same definition a theme color would have, with its own seed. Hue is in degrees; saturation and tone are on 0–100.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `hue` | `number` | — | Hue seed, 0–360. Required. |
| `saturation` | `number` | — | Saturation seed, 0–100. Required. |
| `tone` | `HCPair<number \| ExtremeValue>` | — | Tone 0–100, or `'max'` / `'min'`. Required. Tone deltas aren't accepted. |
| `saturationFactor` | `number` | `1` | Multiplier (0–1) on the seed. |
| `darkHue` | `number \| RelativeValue` | `hue` | Dark hue: absolute, or relative to `hue`. |
| `darkSaturation` | `number` | `saturation` | Dark saturation seed, 0–100. |
| `darkSaturationFactor` | `number` | The light factor | Dark multiplier (0–1) on the dark seed. |
| `mode` | `AdaptationMode` | `'auto'` | Adaptation mode. |
| `autoFlip` | `boolean` | The config's `autoFlip` | Mirror out-of-range results instead of clamping. |
| `opacity` | `number` | `1` | Fixed alpha, 0–1. |
| `base` | `GlazeColorToken \| GlazeColorValue` | — | See [Pairing colors](#pairing-colors). |
| `contrast` | `HCPair<ContrastSpec>` | — | Without `base`, measured against the token's own input color (`hue`, `saturation`, normal `tone`). |
| `pastel` | `boolean` | The config override's `pastel` (`false`) | Per-color `pastel`. |
| `role` | `RoleInput` | Inferred | Fixes APCA polarity. |
| `name` | `string` | — | Debug label. |

Out-of-range numbers throw before anything resolves, for example `glaze.color: structured saturation must be a finite number in 0–100 (got 120).` or `glaze.color: structured tone must be a finite number in 0–100 or 'max'/'min' (got +5).` `hue` and `darkHue` must be finite; the saturation seeds 0–100; the factors and `opacity` 0–1.

## Defaults

- Every form defaults to `mode: 'auto'`, so a token adapts between light and dark like a theme color.
- **Value forms** (bare strings, value objects, and `{ from, ... }`) keep the input tone exactly in the light variant: they resolve with a local `lightTone: false`. Pass `lightTone` in the config override to change that.
- **The structured form** uses the live global tone windows, like a theme color.
- Every other config field follows the live global config at resolve time, unless the [config override](#config-overrides) sets it. `pastel` is instance-only: it comes from the override or the color's `pastel`, never from `glaze.configure()`.

```ts
const brand = glaze.color('#26fcb2');
brand.resolve().light; // renders exactly #26fcb2
brand.json();
// → {
//   light: 'oklch(0.8789 0.1857 162.47)',
//   dark: 'oklch(0.3446 0.066 162.47)',
// }
```

## Token methods

| Method | Returns | Description |
| --- | --- | --- |
| `token.resolve()` | `ResolvedColor` | The four variants. `name` is the [`name`](#name), or `'value'` without one. |
| `token.token(options?)` | `Record<string, string>` | One color's state map, keyed by state alias: `''`, the dark state, the high-contrast state, and the two combined. Options: `format`, `modes`, `states`. |
| `token.tasty(options?)` | `Record<string, string>` | The same map as `token.token()`, for [Tasty](https://tasty.style). |
| `token.json(options?)` | `Record<string, string>` | `{ light, dark, lightContrast?, darkContrast? }`. Options: `format`, `modes`. |
| `token.css(options)` | `GlazeCssResult` | CSS custom property declarations, one string per variant. Always all four. Options: [`GlazeColorCssOptions`](#glazecolorcssoptions). |
| `token.dtcg(options?)` | `GlazeColorDtcgResult` | One W3C DTCG token (`{ $type: 'color', $value }`) per variant, under `light`, `dark?`, `lightContrast?`, `darkContrast?`. Options: `colorSpace` (`'srgb'` default, or `'oklch'`), `modes`. |
| `token.dtcgResolver(options)` | `GlazeDtcgResolverDocument` | One DTCG Resolver-Module document with the color under `name`. Options: `name` (required) plus the [`theme.dtcgResolver()` options](./output.md#dtcgresolveroptions). |
| `token.tailwind(options)` | `string` | A Tailwind v4 `@theme` block for `--color-<name>` plus dark and high-contrast overrides. Options: `name` (required) plus the [`theme.tailwind()` options](./output.md#tailwindoptions). |
| `token.export(override?)` | `GlazeColorTokenExport` | JSON-safe authoring snapshot. See [Snapshots](#tokenexportoverride--glazecolorfromdata). |

```ts
const brand = glaze.color('#26fcb2');

brand.token();
// → {
//     '': 'oklch(0.8789 0.1857 162.47)',
//     '@media(prefers-color-scheme: dark)': 'oklch(0.3446 0.066 162.47)',
//   }

brand.css({ name: 'brand' }).light;
// → '--brand-color: oklch(0.8789 0.1857 162.47);'

brand.tailwind({ name: 'brand' });
// → '@theme {\n' +
//   '  --color-brand: oklch(0.8789 0.1857 162.47);\n' +
//   '}\n\n.dark {\n' +
//   '  --color-brand: oklch(0.3446 0.066 162.47);\n' +
//   '}'
```

- Every output that takes `format` defaults to `'oklch'`; `dtcg()` and `dtcgResolver()` take a `colorSpace` instead (`'srgb'` by default). `json()`, `css()`, and `tailwind()` accept only the native CSS formats (`'oklch'`, `'rgb'`, `'hsl'`) and throw on `'okhsl'` / `'okhst'`; `token()` and `tasty()` accept all five. See [Color formats](./output.md#color-formats).
- `modes` and `states` default to the global config, as on themes. `css()` ignores `modes`. See [Output modes](./output.md#output-modes).
- The output methods share their option types with themes; full shapes are in [Output formats](./output.md).

### `GlazeColorCssOptions`

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | — | Required. The custom property name without `--`: `'brand'` gives `--brand-color`. |
| `format` | `GlazeColorFormat` | `'oklch'` | Native formats only. |
| `suffix` | `string` | `'-color'` | Appended to `name`, matching `theme.css()`. |
| `splitHue` | `boolean` | `false` | Emit the hue as a separate `--<name>-hue` property referenced with `var()`. Applies only with `format: 'oklch'`; other formats ignore it and emit the color inline. Throws when the token isn't pastel. See [`splitHue`](./output.md#hue-channel-splitting-splithue). |

```ts
const brand = glaze.color('#26fcb2', { pastel: true });
brand.css({ name: 'brand', splitHue: true }).light;
// → '--brand-hue: 162.4653546883244;\n' +
//   '--brand-color: oklch(0.8789 0.0572 var(--brand-hue));'
```

`GlazeColorTailwindOptions` is `GlazeTailwindOptions` plus a required `name`; `GlazeColorDtcgResolverOptions` is `GlazeDtcgResolverOptions` plus a required `name`.

## Config overrides

The second argument of `glaze.color()` is a `GlazeConfigOverride`, the same type a theme takes: the resolve-relevant subset of the global config plus the instance-only `pastel`. The fields are listed in [`GlazeConfigOverride`](./configuration.md#glazeconfigoverride). It is sparse: fields it sets are fixed for the token, and fields it omits follow the live global config at resolve time; the details are in [Merge rules](./configuration.md#merge-rules).

On a token specifically:

- Value forms resolve with a local `lightTone: false`; a `lightTone` in the override replaces it (see [Defaults](#defaults)).
- `shadowTuning` and `glowTuning` are accepted but have no effect: a token has no shadows.
- A `contrastLevel` moves only this token. On a token with a `base`, set it on both; see [Clearing it, exporting it, base links](./contrast.md#clearing-it-exporting-it-base-links).
- `modes` and `states` aren't part of the override. Pass them to the output methods or set them globally.

```ts
// Let black flip all the way to white in dark.
glaze.color('#000000', { lightTone: false, darkTone: [15, 100] });
// dark: #ffffff (with the default darkTone, #f1f1f1)

// The structured form takes an override too.
glaze.color(
  { hue: 152, saturation: 95, tone: 74 },
  { darkTone: false, pastel: true },
);
```

## Pairing colors

Set `base` to anchor a token to another token or a raw color value. `contrast` and a tone delta then measure against the base's resolved variant in each scheme instead of against the token's own input, so text keeps its floor against its background in light, dark, and high contrast.

```ts
const bg = glaze.color('#1a1a2e');

// AA against bg in every scheme.
const text = glaze.color({ from: '#ffffff', base: bg, contrast: 'AA' });
// light: #ffffff on #1a1a2e (17.06:1); dark: #222222 on #dadbec (11.58:1)

// 8 tones lighter than bg, except in darkContrast: bg sits at tone 93
// there, so autoFlip mirrors the step to 8 tones darker.
const border = glaze.color({
  from: '#000000',
  base: bg,
  tone: '+8',
  mode: 'fixed',
});

// A raw value is wrapped with glaze.color(value), so this equals `text`.
const text2 = glaze.color({
  from: '#ffffff',
  base: '#1a1a2e',
  contrast: 'AA',
});
```

With `base`:

- `contrast` is solved against the base's `light`, `dark`, `lightContrast`, and `darkContrast` variant in turn.
- A tone delta (`'+N'` / `'-N'`) is measured from the base, as for a theme's [dependent colors](./color-definitions.md#tone-values). In light and high contrast the step is exact. Under `mode: 'auto'` the dark variant applies the delta to the base's light tone, then inverts and remaps the result through the dark window, so the step flips direction and shrinks: an `'auto'` version of `border` above is 6.93 tones darker than `bg` in dark. `'fixed'` and `'static'` apply it to the base's tone in each scheme, sign kept.
- A relative `hue` still anchors to the token's own seed (the value passed to `glaze.color()`), not to the base.
- `mode` applies to the pair: `'auto'` mirrors the relationship in dark, `'fixed'` keeps its sign.
- The base is resolved lazily, when the dependent first resolves.
- **A structured base is linked at full range.** When a value-form token uses a structured token as its base, the anchor is the base's raw input tone, not its windowed output: a structured base at tone 5 renders at tone 9.7 in light, but a `tone: '+10'` dependent lands at 15. The base's own `resolve()` output is unchanged.
- An unreachable floor pins the token to the extreme of the side the solver searched first and emits a `console.warn`, such as `glaze: color "value" cannot meet WCAG 4.50 in dark scheme (got <ratio>). …`, deduplicated by color, scheme, target, and measured value. Set [`name`](#name) to make the warning identifiable.

Chains compose:

```ts
const page = glaze.color('#000000');
const surface = glaze.color({
  from: '#222222',
  base: page,
  contrast: 'AAA',
});
const label = glaze.color({
  from: '#ffffff',
  base: surface,
  contrast: 'AA',
});
```

### Roles on tokens

The [role](./color-definitions.md#roles) chain applies to tokens, with these inputs:

- An explicit `role` wins.
- With `inferRole` on, the [`name`](#name) is used for inference: `name: 'brand-bg'` resolves as a surface.
- With a `base` token, the base is treated as the background, so the token defaults to `'text'`.
- Without a `base`, a `contrast` floor or tone delta is measured against a hidden copy of the input color. That copy resolves as `'text'`, so the token defaults to `'surface'`.

APCA results depend on the role, so set `role` explicitly on any token with an `{ apca }` floor.

## `name`

`name` is a debug label. It appears in warnings and errors instead of `"value"`, and as `resolve().name`. It doesn't change output keys: `token()`, `tasty()`, and `json()` stay keyed by scheme, and the custom property name comes from `css({ name })`. It also feeds [role inference](#roles-on-tokens).

| Invalid `name` | Error |
| --- | --- |
| `''` or whitespace | ``glaze.color: name must be a non-empty string. Omit `name` if you do not want to set a debug label.`` |
| `'value'`, `'seed'`, `'externalBase'` | `glaze.color: name "value" is reserved (used internally). Reserved names are: "value", "seed", "externalBase". Pick a different name.` |

## `token.export(override?)` / `glaze.colorFrom(data)`

`token.export()` returns a JSON-safe authoring snapshot: the original input, the overrides (with a token `base` exported recursively), and the effective config frozen at call time. `glaze.colorFrom()` rebuilds the token from it and pins the frozen config, so later `glaze.configure()` calls don't change the restored token.

```ts
const bg = glaze.color('#1a1a2e');
const text = glaze.color({ from: '#ffffff', base: bg, contrast: 'AA' });

const data = text.export();
// → {
//     kind: 'color',
//     version: 2,
//     form: 'value',
//     input: '#ffffff',
//     overrides: {
//       contrast: 'AA',
//       base: {
//         kind: 'color',
//         version: 2,
//         form: 'value',
//         input: '#1a1a2e',
//         config: { … },
//       },
//     },
//     config: {
//       lightTone: false,
//       darkTone: { lo: 15, hi: 95, eps: 0.05 },
//       darkDesaturation: 0.1,
//       autoFlip: true,
//       pastel: false,
//       inferRole: true,
//     },
//   }

const restored = glaze.colorFrom(JSON.parse(JSON.stringify(data)));
// restored.resolve() is identical to text.resolve()
```

- Both the value and the structured forms round-trip.
- `override` merges over the token's own override for the snapshot only, and is passed to a nested `base` export too.
- The config freeze follows the same rules as [`theme.export()`](./theme.md#themeexportoverride): `contrastLevel` is frozen only when set on the token or passed as `override`; `modes` and `states` never are.

`GlazeColorTokenExport`:

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `'color'` | Always written; optional on legacy snapshots. |
| `version` | `number` | `GLAZE_EXPORT_VERSION` (`2`). Always written; optional on legacy snapshots. |
| `form` | `'value' \| 'structured'` | Which input shape created the token. |
| `input` | `GlazeColorValue \| GlazeColorInputExport` | The raw value (`form: 'value'`) or the structured input. |
| `overrides` | `GlazeColorOverridesExport` | The value form's overrides, when any were given. |
| `config` | `GlazeConfigOverride` | The frozen effective config. |

`GlazeColorInputExport` and `GlazeColorOverridesExport` have the same fields as `GlazeColorInput` and `GlazeColorOverrides`, except that a token `base` is stored as its `GlazeColorTokenExport` (a raw-value base is kept as is).

`glaze.colorFrom()` throws when:

| Condition | Error |
| --- | --- |
| `data` isn't an object | `glaze.colorFrom: expected an object from token.export(), got <type>.` |
| `kind` is present and not `'color'` | `glaze.colorFrom: expected kind "color", got "<kind>".` |
| `version` is invalid or newer than the library | See [Restore checks](./index.md#restore-checks). |
| `form` isn't `'value'` or `'structured'` | `glaze.colorFrom: invalid "form" field — expected "value" or "structured" (got <form>).` |
| `input` is missing | `glaze.colorFrom: missing "input" field — expected the original GlazeColorValue.` (or `GlazeColorInput`) |

`glaze.isColorTokenExport(data)` tells a token snapshot apart from theme and palette snapshots; see [Type guards](./index.md#type-guards).
