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
| `glaze(hue, saturation?)` | Create a theme from hue (0–360) and saturation (0–100). Default saturation: `100`. |
| `glaze({ hue, saturation })` | Create a theme from an options object. |
| `glaze.from(data)` | Create a theme from an exported configuration (`theme.export()` snapshot). |
| `glaze.fromHex(hex)` | Create a theme from a hex color (`#rgb` or `#rrggbb`). Extracts hue and saturation. |
| `glaze.fromRgb(r, g, b)` | Create a theme from RGB values (0–255). Extracts hue and saturation. |

```ts
const a = glaze(280, 80);
const b = glaze({ hue: 280, saturation: 80 });
const c = glaze.fromHex('#7a4dbf');
const d = glaze.fromRgb(122, 77, 191);
const e = glaze.from(a.export());
```

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
theme.colors({ surface: { lightness: 97 } });
theme.colors({ text: { lightness: 30 } });
// Both 'surface' and 'text' are now defined.
```

### `theme.color(name) / theme.color(name, def)`

```ts
theme.color('surface', { lightness: 97, saturation: 0.75 });    // set
const def = theme.color('surface');                              // get
```

### `theme.extend(options)`

Creates a new theme inheriting all color definitions, optionally replacing the hue / saturation seed and merging in per-theme overrides:

```ts
const danger = primary.extend({
  hue: 23,
  colors: { 'accent-fill': { lightness: 48, mode: 'fixed' } },
});
```

`GlazeExtendOptions`:

| Field | Type | Description |
|---|---|---|
| `hue` | `number` | Replace the hue seed. Defaults to the parent's hue. |
| `saturation` | `number` | Replace the saturation seed. Defaults to the parent's saturation. |
| `colors` | `ColorMap` | Per-theme overrides (additive merge over the inherited map). |

Colors marked with `inherit: false` on the parent are **not** copied into the child.

### `theme.tokens(options?)`

Flat token map grouped by scheme variant.

```ts
theme.tokens()
// → { light: { surface: 'okhsl(...)' }, dark: { surface: 'okhsl(...)' } }
```

`GlazeJsonOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'okhsl'` | Output color format. One of `'okhsl' \| 'rgb' \| 'hsl' \| 'oklch'`. |
| `modes` | `{ dark: true, highContrast: false }` (or global config) | Which scheme variants to include. |

### `theme.tasty(options?)`

Tasty style-to-state bindings for the [Tasty style system](https://tasty.style/docs). Uses `#name` color token keys and state aliases (`''`, `@dark`, etc.).

```ts
theme.tasty()
// → {
//   '#surface': { '': 'okhsl(...)', '@dark': 'okhsl(...)' },
//   ...
// }
```

`GlazeTokenOptions`:

| Option | Default | Description |
|---|---|---|
| `format` | `'okhsl'` | Output color format. |
| `modes` | global config | Which scheme variants to include. |
| `states.dark` | `'@dark'` (or global config) | State alias for dark mode tokens. |
| `states.highContrast` | `'@high-contrast'` (or global config) | State alias for high-contrast tokens. |
| `prefix` | (palette only) | See [Palette](#palette). |

When both `dark` and `highContrast` modes are enabled, dark high-contrast variants are emitted under the combined key `<dark> & <highContrast>` (e.g. `'@dark & @high-contrast'`).

### `theme.json(options?)`

Per-color JSON map.

```ts
theme.json()
// → {
//   surface: { light: 'okhsl(...)', dark: 'okhsl(...)' },
//   text:    { light: 'okhsl(...)', dark: 'okhsl(...)' },
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
| `format` | `'rgb'` | Output color format. |
| `suffix` | `'-color'` | Suffix appended to each CSS property name. Pass `''` for bare property names. |

`GlazeCssResult` always contains all four keys (`light`, `dark`, `lightContrast`, `darkContrast`); empty if no colors are defined for that variant.

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
| `lightness` | `HCPair<number \| RelativeValue>` | Number = absolute (0–100). String (`'+N'`/`'-N'`) = relative to base's lightness (requires `base`). Optional HC pair `[normal, hc]`. |
| `saturation` | `number` | Saturation factor applied to the seed saturation (0–1). Default: `1`. |
| `hue` | `number \| RelativeValue` | Number = absolute (0–360). String (`'+N'`/`'-N'`) = relative to the **theme seed hue** (never to a base color). |
| `base` | `string` | Name of another color in the same theme — makes this a *dependent* color. |
| `contrast` | `HCPair<MinContrast>` | WCAG contrast floor against `base`. Requires `base`. |
| `mode` | `'auto' \| 'fixed' \| 'static'` | Adaptation mode. Default: `'auto'`. See [Adaptation modes](#adaptation-modes). |
| `opacity` | `number` | Fixed alpha 0–1. Output includes alpha in the CSS value. Combining with `contrast` is not recommended (a `console.warn` is emitted). |
| `inherit` | `boolean` | Whether this color is inherited by child themes via `extend()`. Default: `true`. Set to `false` to make the color local to the current theme. |

#### Lightness values

| Form | Example | Meaning |
|---|---|---|
| Number (absolute) | `lightness: 45` | Absolute lightness 0–100. |
| String (relative) | `lightness: '-52'` | Relative to base color's lightness (requires `base`). |
| HC pair | `lightness: ['-7', '-20']` | `[normal, high-contrast]`. A single value applies to both. |

**Absolute lightness** on a dependent color (`base` set) positions the color independently. In dark mode it is dark-mapped on its own. The `contrast` solver acts as a safety net.

**Relative lightness** applies a signed delta to the base color's resolved lightness. In dark mode with `mode: 'auto'`, the sign flips automatically so a `'-52'` light-mode offset becomes a `+52` dark-mode offset.

A dependent color with `base` but no `lightness` inherits the base's lightness (equivalent to a delta of 0).

#### `contrast` (WCAG floor)

```ts
type MinContrast = number | 'AA' | 'AAA' | 'AA-large' | 'AAA-large';
```

| Preset | Ratio |
|---|---|
| `'AA-large'` | 3 |
| `'AA'` | 4.5 |
| `'AAA-large'` | 4.5 |
| `'AAA'` | 7 |

You can also pass any numeric ratio directly (e.g., `contrast: 4.5`, `contrast: 11`). The constraint is applied independently for each scheme — if the `lightness` already satisfies the floor it's kept, otherwise the solver adjusts lightness until the target is met.

**Full lightness spectrum in HC mode:** in high-contrast variants the `lightLightness` and `darkLightness` window constraints are bypassed entirely. Colors can reach the full 0–100 range, maximizing perceivable contrast.

#### Per-color hue override

```ts
const theme = glaze(280, 80);
theme.colors({
  surface:     { lightness: 97 },
  gradientEnd: { lightness: 90, hue: '+20' },   // 280 + 20 = 300
  warning:     { lightness: 60, hue: 40 },      // absolute
});
```

Relative hue is always relative to the **theme seed hue**, not to a base color.

### `ShadowColorDef`

| Field | Type | Description |
|---|---|---|
| `type` | `'shadow'` | Discriminator. |
| `bg` | `string` | Background color name — must reference a non-shadow color in the same theme. |
| `fg` | `string` | Optional foreground color name for tinting and intensity modulation. Must reference a non-shadow color. Omit for an achromatic shadow at full user-specified intensity. |
| `intensity` | `HCPair<number>` | Shadow intensity, 0–100. Supports HC pairs. |
| `tuning` | `ShadowTuning` | Per-color tuning overrides. Merged field-by-field with the global `shadowTuning`. |
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
| `contrast` | `HCPair<MinContrast>` | Optional WCAG floor against `base`. The solver adjusts the mix ratio (opaque) or opacity (transparent). |
| `inherit` | `boolean` | Inheritance flag, default `true`. |

See [Mix colors](#mix-colors) below.

---

## Standalone color tokens

`glaze.color()` creates a single color token without a full theme. Two overloads:

```ts
glaze.color(input: GlazeColorInput, scaling?: GlazeColorScaling): GlazeColorToken;
glaze.color(value: GlazeColorValue, overrides?: GlazeColorOverrides, scaling?: GlazeColorScaling): GlazeColorToken;
```

### Input forms

`GlazeColorValue` (the value-shorthand input) accepts:

| Form | Example | Notes |
|---|---|---|
| Hex | `'#26fcb2'`, `'#26fcb2ff'`, `'#abc'` | 3, 6, or 8 digits. Alpha components are dropped with a `console.warn` — use `opacity` instead. |
| `rgb()` | `'rgb(38 252 178)'`, `'rgb(38 252 178 / 0.8)'` | Modern space syntax. Alpha dropped with warning. |
| `hsl()` | `'hsl(152 97% 57%)'` | Modern space syntax. Alpha dropped with warning. |
| `okhsl()` | `'okhsl(152 95% 74%)'` | Glaze's own emit format. Alpha dropped with warning. |
| `oklch()` | `'oklch(0.85 0.18 152)'` | Glaze's own emit format. Alpha dropped with warning. |
| `OkhslColor` object | `{ h: 152, s: 0.95, l: 0.74 }` | Glaze's native shape (h: 0–360, s/l: 0–1). Passing 0–100 for `s`/`l` throws with a hint to use the structured form. |
| RGB tuple | `[38, 252, 178]` | 0–255, same range as `glaze.fromRgb`. |

`GlazeColorInput` (the structured input) is `{ hue, saturation, lightness, ... }`:

| Field | Type | Description |
|---|---|---|
| `hue` | `number` | 0–360. |
| `saturation` | `number` | 0–100. |
| `lightness` | `HCPair<number>` | 0–100, optional HC pair. |
| `saturationFactor` | `number` | Multiplier on the seed (0–1). Default: `1`. |
| `mode` | `AdaptationMode` | Default: `'auto'`. |
| `opacity` | `number` | Fixed alpha 0–1. |
| `base` | `GlazeColorToken \| GlazeColorValue` | Optional dependency. See [Pairing colors](#pairing-colors). |
| `contrast` | `HCPair<MinContrast>` | WCAG floor against `base` (requires `base`). |
| `name` | `string` | Debug label for warnings; doesn't change output keys. Reserved names (`'value'`, `'seed'`, `'externalBase'`) are rejected. |

Named CSS colors (`'red'`, `'blueviolet'`) are not supported.

### Defaults

Every input form defaults to `mode: 'auto'` so the resolved token adapts between light and dark like an ordinary theme color. The *scaling* snapshot taken at create time differs by input form:

- **String value-shorthand** (`'#000'`, `'rgb(...)'`, etc.):
  - Light variant preserves the input lightness exactly (`lightLightness: false`).
  - Dark variant is Möbius-inverted into `[globalConfig.darkLightness[0], 100]`, so `glaze.color('#000')` renders as `#fff` in dark mode and `glaze.color('#fff')` falls to the dark `lo` floor (default `0.15`).
- **Object / tuple / structured inputs**:
  - Both light and dark variants are mapped through `globalConfig.lightLightness` / `globalConfig.darkLightness` (defaults `[10, 100]` / `[15, 95]`) — the same windows a theme color uses.
- All windows are **snapshotted at color-creation time** so later `glaze.configure()` calls don't retroactively change exported tokens. `token.export()` round-trips byte-for-byte.

To opt back into the legacy fixed-linear default (no Möbius inversion), pass `{ mode: 'fixed' }` as the second arg, or supply an explicit `scaling` (see [`GlazeColorScaling`](#glazecolorscaling)).

### `GlazeColorOverrides`

Overrides for the value-shorthand overload's second argument:

| Option | Notes |
|---|---|
| `hue` | Number (absolute 0–360) or `'+N'`/`'-N'` (relative to seed — never to `base`). |
| `saturation` | Override seed saturation (0–100). |
| `lightness` | Number (absolute 0–100) or `'+N'`/`'-N'`. Without `base`, relative is anchored to the literal seed; with `base`, anchored to `base`'s lightness per scheme. Supports `[normal, hc]` pairs. |
| `saturationFactor` | Multiplier on the seed (0–1). Default: `1`. |
| `mode` | `'auto'` (default for every input form) / `'fixed'` / `'static'`. |
| `contrast` | WCAG floor. Without `base`, anchored to the literal seed; with `base`, solved per scheme against `base`'s resolved variant. When the target can't be met, a `console.warn` is emitted and the closest passing variant is returned. |
| `base` | `GlazeColorToken` **or** raw `GlazeColorValue`. Raw values are auto-wrapped via `glaze.color(value)`. When set, `contrast` and relative `lightness` anchor to it per scheme; relative `hue` still anchors to the seed. |
| `opacity` | Fixed alpha 0–1 applied to every variant. Combining with `contrast` is not recommended — `console.warn` is emitted. |
| `name` | Debug label only — surfaces in `console.warn` / Error messages. Does not change output keys. |

### `GlazeColorScaling`

Per-call lightness-window override. Mirrors `GlazeConfig`'s field names:

| Key | Default for string input | Default for object / tuple / structured input | Effect |
|---|---|---|---|
| `lightLightness` | `false` | `globalConfig.lightLightness` (snapshotted) | `false` = preserve input. Pass `[lo, hi]` to opt into a remap window. |
| `darkLightness` | `[globalConfig.darkLightness[0], 100]` (snapshotted) | `globalConfig.darkLightness` (snapshotted) | `false` = preserve input in dark too. Pass `[lo, hi]` to override the window. |

Passing `scaling` is **all-or-nothing** — both fields are replaced. To keep one field's default while overriding the other, restate the default explicitly.

```ts
// Preserve raw lightness in dark mode too
glaze.color('#26fcb2', undefined, { darkLightness: false });

// Opt back into a theme-style window
glaze.color('#26fcb2', undefined, {
  lightLightness: [10, 100],
  darkLightness: [15, 95],
});

// Structured form takes scaling as the second positional arg
glaze.color({ hue: 152, saturation: 95, lightness: 74 }, { darkLightness: false });
```

### Token methods

A `GlazeColorToken` exposes:

| Method | Description |
|---|---|
| `token.resolve()` | Resolve as a `ResolvedColor` (light/dark/lightContrast/darkContrast variants). |
| `token.token(options?)` | Flat token map (no color-name key). Options: `format`, `modes`, `states`. |
| `token.tasty(options?)` | Tasty state map (no color-name key). Same options as `token.token`. |
| `token.json(options?)` | JSON map (no color-name key). Options: `format`, `modes`. |
| `token.css({ name, format?, suffix? })` | CSS custom property declarations grouped by scheme variant. `name` is **required** and becomes the variable identifier (`'brand'` → `--brand-color`). Defaults: `format: 'rgb'`, `suffix: '-color'` (matches `theme.css`). |
| `token.export()` | JSON-safe snapshot — pass to `glaze.colorFrom(...)` to rehydrate. |

### `glaze.colorFrom(data)`

Inverse of `token.export()`. Captures the original input value, all overrides (with any `base` token recursively serialized), and the effective `scaling` so later `glaze.configure()` calls don't change exported tokens.

```ts
const text = glaze.color('#1a1a1a', { contrast: 'AA' });
const data = text.export();
const restored = glaze.colorFrom(data);
// restored.resolve() === text.resolve() byte-for-byte
```

Both value-form and structured-form tokens round-trip.

### Pairing colors

Set `base` to anchor a standalone color to another standalone color or raw value. The WCAG contrast solver and relative `lightness` offsets switch their anchor from the literal seed to the base's resolved variant per scheme — so the same text color automatically lands at AA against its background in light, dark, and high-contrast modes.

```ts
const bg = glaze.color('#1a1a2e');

// Text guaranteed AA against `bg` in every scheme.
const text = glaze.color('#ffffff', { base: bg, contrast: 'AA' });

// Border 8 lightness units lighter than `bg` in each scheme.
const border = glaze.color('#000000', {
  base: bg,
  lightness: '+8',
  mode: 'fixed',
});

// Raw-value base — Glaze auto-wraps it via `glaze.color(value)`.
const text2 = glaze.color('#ffffff', { base: '#1a1a2e', contrast: 'AA' });
```

Behavior with `base`:

- `contrast` is solved per scheme against `base`'s resolved variant (light / dark / lightContrast / darkContrast).
- Relative `lightness: '+N'` / `'-N'` is anchored to `base`'s lightness per scheme (matches theme behavior).
- Relative `hue: '+N'` / `'-N'` still anchors to the **seed** (the value passed to `glaze.color()`), not the base.
- `mode` works as a per-pair knob.
- The base token's `.resolve()` is called lazily on the first resolve of the dependent and the result is captured by reference; later mutations to the base don't apply.
- Raw-value bases inherit the same string-vs-object scaling defaults. To skip auto-invert on the base, wrap it yourself: `base: glaze.color(value, undefined, { darkLightness: false })`.
- When the contrast target is physically unreachable, `glaze` emits a single `console.warn` per `(name, scheme, target)` triple and returns the closest passing variant. Use the `name` override to make the warning identifiable.

Chains compose:

```ts
const bg = glaze.color('#000000');
const surface = glaze.color('#222222', { base: bg, contrast: 'AAA' });
const text = glaze.color('#ffffff', { base: surface, contrast: 'AA' });
```

### `name` is a debug label

The `name` override appears in `console.warn` / Error messages but **does not** change output keys (`.token()`, `.tasty()`, `.json()`, `.css()` still use `''`, `light`, etc.). The CSS variable name comes from `css({ name })`, not from the override.

---

## Shadows

### Defining shadow colors in a theme

```ts
theme.colors({
  surface: { lightness: 95 },
  text:    { base: 'surface', lightness: '-52', contrast: 'AAA' },

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
  overlay: { lightness: 0, opacity: 0.5 },
});
// → 'oklch(0 0 0 / 0.5)'
```

---

## Mix colors

### Opaque mix

Produces a solid color by interpolating between `base` and `target`:

```ts
theme.colors({
  surface: { lightness: 95 },
  accent:  { lightness: 30 },
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
  surface: { lightness: 95 },
  black:   { lightness: 0, saturation: 0 },
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
  white: { lightness: 100, saturation: 0 },
  black: { lightness: 0, saturation: 0 },
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

---

## Output formats

Control the color format with the `format` option on any export method:

| Format | Output (alpha = 1) | Output (alpha < 1) | Notes |
|---|---|---|---|
| `'okhsl'` (default for tokens/tasty/json) | `okhsl(H S% L%)` | `okhsl(H S% L% / A)` | Glaze's native format, not a CSS function. |
| `'rgb'` (default for css) | `rgb(R G B)` | `rgb(R G B / A)` | Rounded integers, modern space syntax. |
| `'hsl'` | `hsl(H S% L%)` | `hsl(H S% L% / A)` | Modern space syntax. |
| `'oklch'` | `oklch(L C H)` | `oklch(L C H / A)` | OKLab-based LCH. |

```ts
theme.tokens();                    // 'okhsl(280 60% 97%)'
theme.tokens({ format: 'rgb' });   // 'rgb(244 240 250)'
theme.tokens({ format: 'hsl' });   // 'hsl(270.5 45.2% 95.8%)'
theme.tokens({ format: 'oklch' }); // 'oklch(0.965 0.0123 280)'
```

All numeric output strips trailing zeros for cleaner CSS (e.g. `95` not `95.0`).

The `format` option works on every export: `theme.tokens()`, `theme.tasty()`, `theme.json()`, `theme.css()`, the same on `palette`, and on `token.token()` / `.tasty()` / `.json()` / `.css()`.

---

## Adaptation modes

`mode` controls how a color adapts across schemes:

| Mode | Behavior |
|---|---|
| `'auto'` (default) | Full adaptation. Light ↔ dark inversion via the Möbius curve. High-contrast boost. |
| `'fixed'` | Color stays recognizable. Lightness is *mapped* (not inverted) into the dark window. Use for brand buttons, CTAs, status banners. |
| `'static'` | No adaptation. Same value in every scheme. |

### How relative lightness adapts

**`auto`** — relative lightness sign flips in dark scheme:

```
Light: surface L=97, text lightness='-52' → L=45 (dark text on light bg)
Dark:  surface inverts to L≈20 (Möbius), sign flips → L=20+52=72
       contrast solver may push further (light text on dark bg)
```

**`fixed`** — lightness is mapped (not inverted), relative sign preserved:

```
Light: accent-fill L=52, accent-text lightness='+48' → L=100 (white on brand)
Dark:  accent-fill maps to L≈51.6, sign preserved → L≈99.6
```

**`static`** — no adaptation, same value in every scheme.

---

## Light / dark scheme mapping

### Light scheme — lightness

Absolute lightness values (root colors and dependent colors with absolute lightness) are mapped linearly within the configured `lightLightness` window:

```ts
const [lo, hi] = lightLightness; // default: [10, 100]
const mappedL = (lightness * (hi - lo)) / 100 + lo;
```

Both `auto` and `fixed` modes use the same linear formula. `static` mode and HC variants bypass the mapping (identity: `mappedL = l`).

| Color | Raw L | Mapped L (default `[10, 100]`) |
|---|---|---|
| surface (L=97) | 97 | 97.3 |
| accent-fill (L=52) | 52 | 56.8 |
| near-black (L=0) | 0 | 10 |

### Dark scheme — lightness

**`auto`** — inverted with a Möbius transformation within the configured window:

```ts
const [lo, hi] = darkLightness; // default: [15, 95]
const t = (100 - lightness) / 100;
const invertedL = lo + (hi - lo) * t / (t + darkCurve * (1 - t));
// darkCurve default: 0.5
```

The `darkCurve` parameter (default `0.5`, range 0–1) controls how much the dark-mode inversion expands lightness deltas. Lower values produce stronger expansion; `1` gives linear (legacy) behavior. Accepts `[normal, highContrast]` pairs (e.g. `darkCurve: [0.5, 0.3]`).

Unlike a power curve, the Möbius transformation provides **proportional expansion** — small and large deltas are scaled by similar ratios, preserving the visual hierarchy of the light theme.

**`fixed`** — mapped without inversion (not affected by `darkCurve`):

```ts
const mappedL = (lightness * (hi - lo)) / 100 + lo;
```

| Color | Light L | Auto (curve=0.5) | Auto (curve=1, linear) | Fixed (mapped) |
|---|---|---|---|---|
| surface (L=97) | 97 | 19.7 | 17.4 | 92.6 |
| accent-fill (L=52) | 52 | 66.9 | 53.4 | 56.6 |
| accent-text (L=100) | 100 | 15 | 15 | 95 |

In high-contrast variants the `darkLightness` window is bypassed — `auto` uses the Möbius curve over the full `[0, 100]` range, `fixed` uses identity.

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
  lightLightness: [10, 100],
  darkLightness: [15, 95],
  darkDesaturation: 0.1,
  darkCurve: 0.5,                   // or [normal, hc] pair
  states: {
    dark: '@dark',
    highContrast: '@high-contrast',
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

`GlazeConfig`:

| Field | Default | Description |
|---|---|---|
| `lightLightness` | `[10, 100]` | Light scheme lightness window `[lo, hi]`. Bypassed in HC. |
| `darkLightness` | `[15, 95]` | Dark scheme lightness window. Bypassed in HC. |
| `darkDesaturation` | `0.1` | Saturation reduction in dark scheme (0–1). |
| `darkCurve` | `0.5` | Möbius beta for dark `auto`-inversion (0–1). Accepts `[normal, hc]` pair. |
| `states.dark` | `'@dark'` | State alias for dark mode tokens (Tasty export). |
| `states.highContrast` | `'@high-contrast'` | State alias for HC tokens. |
| `modes.dark` | `true` | Include dark variants in exports. |
| `modes.highContrast` | `false` | Include HC variants. |
| `shadowTuning` | `undefined` | Default tuning for all shadow colors. Per-color tuning merges field-by-field. |

| Method | Description |
|---|---|
| `glaze.configure(config)` | Merge into the global config. Bumps a config version that invalidates theme caches. |
| `glaze.getConfig()` | Snapshot the current resolved config (shallow copy). |
| `glaze.resetConfig()` | Reset to defaults (also bumps the version counter). |

Standalone `glaze.color()` tokens snapshot the relevant fields at create time, so later `configure()` calls don't change already-created tokens.

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
| `contrast` without `base` | Validation error |
| Relative `lightness` without `base` | Validation error |
| `lightness` resolves outside 0–100 | Clamp silently |
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

### Contrast solver

```ts
import {
  findLightnessForContrast,
  findValueForMixContrast,
  resolveMinContrast,
} from '@tenphi/glaze';
```

| Function | Description |
|---|---|
| `findLightnessForContrast(opts)` | Binary-search for the OKHSL lightness that meets a WCAG contrast floor against a base color. Returns `{ lightness, contrast, met, branch }`. |
| `findValueForMixContrast(opts)` | Same, but searches for a mix `value` (0–1) that meets a contrast floor between a base and a target. |
| `resolveMinContrast(value)` | Resolves a `MinContrast` (preset or number) to a numeric ratio. |

`findLightnessForContrast` options:

| Option | Default | Description |
|---|---|---|
| `hue` | — | Candidate hue (0–360). |
| `saturation` | — | Candidate saturation (0–1). |
| `preferredLightness` | — | Preferred candidate lightness (0–1). Kept if it already meets the target. |
| `baseLinearRgb` | — | Base color as linear sRGB tuple. |
| `contrast` | — | WCAG floor (`MinContrast`). |
| `lightnessRange` | `[0, 1]` | Search bounds. |
| `epsilon` | `1e-4` | Convergence threshold. |
| `maxIterations` | `14` | Max binary-search iterations per branch. |

Result: `{ lightness, contrast, met, branch: 'lighter' | 'darker' | 'preferred' }`.
