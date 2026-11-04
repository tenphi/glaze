---
title: Themes
description: Create themes with glaze(), restore them from snapshots, and manage their color definitions with the theme methods.
---

A theme is one hue/saturation seed plus a map of named color definitions. Glaze resolves every definition against the seed into four scheme variants (`light`, `dark`, `lightContrast`, `darkContrast`). For a guided introduction, see [Getting started](../getting-started.mdx) and [Designing a palette](../methodology.mdx).

## Creating a theme

| Call | Description |
| --- | --- |
| `glaze(hue, saturation?, config?)` | Theme from a hue (0–360) and saturation (0–100). `saturation` defaults to `100`. |
| `glaze(seed, config?)` | Theme from a [`GlazeThemeSeed`](#glazethemeseed) object, which can also carry a dark seed. |
| `glaze.fromHex(hex)` | Theme seeded with the hue and saturation of a hex color. |
| `glaze.fromRgb(r, g, b)` | Theme seeded with the hue and saturation of an sRGB color (0–255 per channel). |
| `glaze.themeFrom(data)` | Theme restored from a [`theme.export()`](#themeexportoverride) snapshot. |
| `glaze.from(data)` | Alias for `glaze.themeFrom`, kept for compatibility. |

```ts
import { glaze } from '@tenphi/glaze';

const a = glaze(280, 80);
const b = glaze({ hue: 280, saturation: 80 });
const c = glaze({
  hue: 280,
  saturation: 80,
  darkHue: 268,
  darkSaturation: 65,
});
const d = glaze.fromHex('#7a4dbf');
const e = glaze.fromRgb(122, 77, 191);
const f = glaze.themeFrom(a.export());

// Per-theme config override (last argument in both forms):
const raw = glaze(280, 80, { lightTone: false, darkTone: false });
const rawSeed = glaze({ hue: 280, saturation: 80 }, { pastel: true });
```

### `glaze(hue, saturation?, config?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `hue` | `number` | Hue seed, 0–360. |
| `saturation` | `number` | Saturation seed, 0–100. Default `100`. |
| `config` | `GlazeConfigOverride` | Optional per-theme config override. See [Per-theme config override](#per-theme-config-override). |

### `glaze(seed, config?)`

The object form takes a `GlazeThemeSeed` first and an optional `GlazeConfigOverride` second. The older spelling `glaze(seed, undefined, config)` still works but is deprecated.

### `GlazeThemeSeed`

| Field | Type | Description |
| --- | --- | --- |
| `hue` | `number` | Light-scheme hue seed, 0–360. Required. |
| `saturation` | `number` | Light-scheme saturation seed, 0–100. Required. |
| `darkHue` | `number` | Hue seed for the `dark` and `darkContrast` variants, 0–360. Defaults to `hue`. |
| `darkSaturation` | `number` | Saturation seed for the `dark` and `darkContrast` variants, 0–100. Defaults to `saturation`. When set, the global `darkDesaturation` reduction is not applied on top. A [`from`](./color-definitions.md#from) color without its own `saturation` or `darkSaturation` doesn't read this seed, so it is still reduced. |

How a dark seed combines with per-color `hue` / `darkHue` / `saturation` / `darkSaturation` is in [Color definitions](./color-definitions.md#dark-seed-darkhue--darksaturation); the concept is in [Dark seed](../schemes.mdx#dark-seed).

### `glaze.fromHex(hex)` / `glaze.fromRgb(r, g, b)`

Both convert the color to OKHSL and seed the theme with its hue and saturation (OKHSL saturation × 100). The color's lightness is discarded: tones come from the color definitions you add.

- `fromHex` accepts `#rgb` or `#rrggbb`; the leading `#` is optional. Hex with alpha (`#rgba`, `#rrggbbaa`) and any other string throw `glaze: invalid hex color "<hex>".` (`glaze.color()` and `from` do accept alpha hex and drop the alpha with a warning.)
- `fromRgb` takes gamma-encoded sRGB channels on 0–255.
- Neither accepts a config override. Use `glaze(theme.hue, theme.saturation, config)` with the extracted seed if you need one.

```ts
const brand = glaze.fromHex('#7a4dbf');
brand.hue; // ≈ 298.52
brand.saturation; // ≈ 70.41
```

To keep a literal color's exact tone and saturation instead of only its hue, use the [`from`](./color-definitions.md#from) field on a color definition or a standalone [`glaze.color()`](./color-tokens.md#glazecolorinput-config) token.

### `glaze.themeFrom(data)` / `glaze.from(data)`

Restores a theme from a [`theme.export()`](#themeexportoverride) snapshot (`GlazeThemeExport`). The restored theme pins the snapshot's frozen config as its own override. `glaze.from` is the same function.

`themeFrom` throws when:

| Condition | Error message |
| --- | --- |
| `data` is not an object | `glaze.themeFrom: expected an object from theme.export(), got <type>.` |
| `kind` is present and not `'theme'` | `glaze.themeFrom: expected kind "theme", got "<kind>".` |
| `version` is present and not an integer ≥ 1 | `glaze.themeFrom: invalid "version" field — expected an integer >= 1 (got <value>).` |
| `version` is greater than `GLAZE_EXPORT_VERSION` | `glaze.themeFrom: unsupported export version <n> (this library supports version 2). Upgrade @tenphi/glaze to load this snapshot.` |
| `version` is `1` and the snapshot has shadow colors or a `shadowTuning` | `glaze.themeFrom: this snapshot is export version 1 (Glaze 2) and contains …` — see [Upgrading to 3.0](../migration.md#30--shadows-and-glows). |
| `hue` or `saturation` is not a number | `glaze.themeFrom: expected numeric "hue" and "saturation" fields.` |
| `darkHue` / `darkSaturation` is present and not a number | `glaze.themeFrom: expected "darkHue" to be a number when present (got <value>).` |

Color definitions are not validated on restore; they are validated when the theme first resolves. The versioning rules shared by all snapshot kinds are in [Authoring snapshots](./index.md#authoring-snapshots-and-versioning).

### Per-theme config override

The optional `config` argument is a `GlazeConfigOverride` — the resolve-relevant subset of the global config plus the instance-only `pastel` flag. Its fields are listed in [`GlazeConfigOverride`](./configuration.md#glazeconfigoverride).

- The override is merged over the **live** global config at resolve time. Fields the override doesn't set keep following later `glaze.configure()` calls.
- The override is copied when the theme is created (and by `extend()`), so changing the object or array you passed afterwards has no effect. Its fields are read by property access, so a class instance with getters or a proxy works as an override. Validation still happens at resolve.
- `pastel` is instance-only: it comes from the override (or a per-color `pastel`) and defaults to `false`; `glaze.configure()` can't set it.
- `modes` and `states` are not part of the override. They are global, or per call on the [output methods](./output.md).

## Theme properties

| Member | Type | Description |
| --- | --- | --- |
| `theme.hue` | `number` (readonly) | The hue seed, 0–360. |
| `theme.saturation` | `number` (readonly) | The saturation seed, 0–100. |
| `theme.darkHue` | `number \| undefined` (readonly) | The dark-scheme hue seed, or `undefined` when the theme reuses `hue`. |
| `theme.darkSaturation` | `number \| undefined` (readonly) | The dark-scheme saturation seed, or `undefined` when the theme reuses `saturation`. |
| `theme.getConfig()` | `GlazeConfigResolved` | The effective config this theme resolves with. See [`theme.getConfig()`](#themegetconfig). |

## Theme methods

| Method | Description |
| --- | --- |
| `theme.colors(defs)` | Add or replace color definitions. Additive merge: adds new names, overwrites existing ones, keeps the rest. |
| `theme.color(name)` | Get one color definition, or `undefined`. |
| `theme.color(name, def)` | Set one color definition. |
| `theme.remove(name \| names[])` | Remove one or more color definitions. |
| `theme.has(name)` | Whether a color is defined. |
| `theme.list()` | Defined color names, in insertion order. |
| `theme.reset()` | Remove every color definition. |
| `theme.extend(options)` | Create a child theme that inherits the color definitions. |
| `theme.resolve()` | Resolve every color and return a `Map<string, ResolvedColor>`. |
| `theme.export(override?)` | JSON-safe authoring snapshot, restorable with `glaze.themeFrom()`. |
| `theme.getConfig()` | The effective resolved config. |
| `theme.tokens()` … `theme.tailwind()` | Output methods — see [Output methods](#output-methods). |

### `theme.colors(defs)`

Takes a `ColorMap` (`Record<string, ColorDef>`). The definition shapes are in [Color definitions](./color-definitions.md).

```ts
theme.colors({ surface: { tone: 97 } });
theme.colors({
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
});
// Both 'surface' and 'surface-text' are now defined.
```

### `theme.color(name)` / `theme.color(name, def)`

```ts
theme.color('surface', { tone: 97, saturation: 0.75 }); // set
theme.color('surface'); // get → { tone: 97, saturation: 0.75 }
theme.color('missing'); // → undefined
```

The getter returns the stored definition object itself; replace it with the setter rather than mutating it, so the theme knows to re-resolve.

### `theme.remove(names)`

```ts
theme.remove('accent');
theme.remove(['accent', 'accent-text']);
```

Removing a color that another color uses as `base`, `bg`, `fg`, or `target` makes the next resolve throw, for example `glaze: color "surface-text" references non-existent base "surface".` The full validation table is in [Validation](./configuration.md#validation).

### `theme.has(name)` / `theme.list()` / `theme.reset()`

```ts
theme.list(); // → ['surface', 'surface-text', 'accent']
theme.has('surface'); // → true
theme.reset();
theme.list(); // → []
```

### `theme.extend(options)`

Creates a new theme that inherits the parent's color definitions, optionally replacing the seed, overriding colors, and adding config:

```ts
const danger = primary.extend({
  hue: 23,
  colors: { 'accent-fill': { tone: 48, mode: 'fixed' } },
});

// Inherit the parent's config override and widen the dark window further:
const wide = primary.extend({ config: { darkTone: [10, 100] } });
```

`GlazeExtendOptions`:

| Field | Type | Description |
| --- | --- | --- |
| `hue` | `number` | Replace the hue seed. Defaults to the parent's `hue`. |
| `saturation` | `number` | Replace the saturation seed. Defaults to the parent's `saturation`. |
| `darkHue` | `number` | Replace the dark hue seed. Defaults to the parent's `darkHue`. |
| `darkSaturation` | `number` | Replace the dark saturation seed. Defaults to the parent's `darkSaturation`. |
| `colors` | `ColorMap` | Color overrides for the child, merged additively over the inherited map (same as `theme.colors()`). |
| `config` | `GlazeConfigOverride` | Config override for the child. Shallow-merged over the parent's override; child fields win. |

- Colors defined with `inherit: false` on the parent are **not** copied into the child (see [`inherit`](./color-definitions.md#inherit)).
- The child is independent: later changes to the parent don't reach it.
- Nested objects in `config` (tone windows, `shadowTuning`, `glowTuning`) replace the parent's value wholesale rather than merging field by field: a child `glowTuning` without `headroom` drops the parent's.

Building status themes with `extend` is walked through in [Designing a palette](../methodology.mdx).

### `theme.resolve()`

Resolves the dependency graph and returns `Map<string, ResolvedColor>`, keyed by color name. Entries are in dependency order: definition order, except that a referenced color (`base`, `bg`, `fg`, `target`) not yet placed is inserted just before the first color that references it. With `a` based on `c` and defined as `a`, `b`, `c`, the order is `c`, `a`, `b`. The output methods emit tokens in the same order. Call `resolve()` directly for tests, diagnostics, or a custom output pipeline.

```ts
const resolved = theme.resolve();
const surface = resolved.get('surface');
// surface.light
// → { h: 280, s: 0.8, t: 0.97148…, alpha: 1, pastel: false }
// t is canonical tone on 0–1.
```

`ResolvedColor`:

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | The color name. |
| `light` | `ResolvedColorVariant` | Light, normal contrast. |
| `dark` | `ResolvedColorVariant` | Dark, normal contrast. |
| `lightContrast` | `ResolvedColorVariant` | Light, high contrast. |
| `darkContrast` | `ResolvedColorVariant` | Dark, high contrast. |
| `mode` | `AdaptationMode \| undefined` | The color's adaptation mode (`'auto'` when unset). `undefined` for shadow, glow, and mix colors. |

All four variants are always resolved, whatever `modes` says; `modes` only filters what the output methods emit.

`ResolvedColorVariant` stores OKHST:

| Field | Type | Description |
| --- | --- | --- |
| `h` | `number` | OKHSL hue, 0–360. |
| `s` | `number` | OKHSL saturation, 0–1. |
| `t` | `number` | Canonical [tone](../okhst.mdx), 0–1 (reference eps). |
| `alpha` | `number` | Opacity, 0–1. `1` for opaque colors. |
| `pastel` | `boolean` (optional) | The effective `pastel` flag used while resolving, so formatting applies the same gamut mapping. |
| `hdr` | `ResolvedHdr` (optional) | A glow's HDR value past SDR white, `{ h, s, t, exposure }`: an opaque base plus a gain in stops. Present only on a glow with a `headroom` whose step passes white; see [HDR values](./color-definitions.md#hdr-values-resolvedhdr). |

Format a variant with [`glaze.format()`](./utilities.md#glazeformatvariant-format-pastel) and its HDR value with [`glaze.formatHdr()`](./utilities.md#glazeformathdrvariant-hdrformat); convert tone to OKHSL lightness with `variantToOkhsl` from [OKHST tone utilities](./utilities.md#okhst-tone-utilities).

**Caching.** A theme caches its resolved map. Changing definitions (`colors`, `color(name, def)`, `remove`, `reset`) or calling `glaze.configure()` / `glaze.resetConfig()` invalidates it. `resolve()` returns a new `Map` each call, so adding or deleting entries doesn't affect the cache; the `ResolvedColor` objects inside are shared with it, so treat them as read-only.

### `theme.export(override?)`

Returns a deep-cloned, JSON-safe **authoring snapshot**: the seed, the color definitions, and a frozen copy of the effective config — not resolved color strings. Restore it with [`glaze.themeFrom()`](#glazethemefromdata--glazefromdata). For resolved colors use the [output methods](./output.md); [Exporting and integration](../exporting.mdx) compares the two.

```ts
const snapshot = theme.export();
// → {
//     kind: 'theme',
//     version: 2,
//     hue: 280,
//     saturation: 80,
//     colors: {
//       surface: { tone: 97 },
//       'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
//       accent: { tone: 52, mode: 'fixed' },
//     },
//     config: {
//       lightTone: { lo: 10, hi: 100, eps: 0.05 },
//       darkTone: { lo: 15, hi: 95, eps: 0.05 },
//       darkDesaturation: 0.1,
//       autoFlip: true,
//       pastel: false,
//       inferRole: true,
//     },
//   }

const restored = glaze.themeFrom(JSON.parse(JSON.stringify(snapshot)));
```

`GlazeThemeExport`:

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `'theme'` | Snapshot kind. Always written; optional on legacy or hand-written input. |
| `version` | `number` | Schema version, `GLAZE_EXPORT_VERSION` (`2`). Always written; optional on legacy input. |
| `hue` | `number` | Hue seed. |
| `saturation` | `number` | Saturation seed. |
| `darkHue` | `number` | Dark hue seed. Omitted when the theme reuses `hue`. |
| `darkSaturation` | `number` | Dark saturation seed. Omitted when the theme reuses `saturation`. |
| `colors` | `ColorMap` | Deep clone of the color definitions. |
| `config` | `GlazeConfigOverride` | Frozen effective config (below). May be sparse on legacy input; omitted fields then follow the live global config. |

**What the config freeze contains.** `export()` merges, later wins: the live global config, then the theme's own override, then the `override` argument. From that merge it writes:

| Field | Frozen |
| --- | --- |
| `lightTone`, `darkTone`, `darkDesaturation`, `autoFlip`, `pastel`, `inferRole` | Always. |
| `shadowTuning`, `glowTuning` | When set anywhere in the merge. A nested tuning object replaces the earlier one wholesale. A `glowTuning.headroom` is written clamped to 0–2. |
| `contrastLevel` | Only when the theme's own override or the `override` argument sets it. A global level is a live user preference (an accessibility slider), so it is never frozen. |
| `modes`, `states` | Never — they are export-time choices, not theme data. |

A restored theme pins the frozen fields as its override, so later `glaze.configure()` calls no longer change them; unfrozen fields keep following the global config. The `override` argument affects only the snapshot, not the live theme.

```ts
glaze.configure({ contrastLevel: 40 });
theme.export().config?.contrastLevel;
// → undefined (a global level is not frozen)
theme.export({ contrastLevel: 70 }).config?.contrastLevel;
// → 70
```

### `theme.getConfig()`

Returns the effective `GlazeConfigResolved` the theme resolves with: the live global config with the theme's override merged on top. `pastel` comes only from the override (default `false`); `states` and `modes` are always the global values. The field list is in [`GlazeConfigResolved`](./configuration.md#glazeconfigresolved).

The result is a deep copy: mutating it, nested windows, `states`, `modes`, and tunings included, changes nothing about the theme or the global config.

```ts
const t = glaze(280, 80, { darkTone: [10, 100], pastel: true });
t.getConfig().darkTone; // → [10, 100]
t.getConfig().pastel; // → true
```

## Output methods

Each method resolves the theme (cached) and formats the result. Full options and return shapes are in [Output formats](./output.md).

| Method | Returns |
| --- | --- |
| [`theme.tokens(options?)`](./output.md#tokensoptions) | Flat token map grouped by scheme variant: `{ light: { name: value }, dark: {…} }`. With HDR on, each scheme is followed by its `lightHdr` / `darkHdr` / … map. |
| [`theme.tasty(options?)`](./output.md#tastyoptions) | [Tasty](https://tasty.style) style-to-state bindings: `{ '#name': { '': value, '<dark state>': value } }`. With HDR on, a glow's HDR value adds a key right after its SDR key: `states.hdr`, joined with the scheme's own state outside light. |
| [`theme.json(options?)`](./output.md#jsonoptions) | Per-color JSON: `{ name: { light: value, dark: value } }`. With HDR on, a glow gains `lightHdr` / `darkHdr` / … keys where it has an HDR value. |
| [`theme.css(options?)`](./output.md#cssoptions) | CSS custom property declarations, one string per variant (`GlazeCssResult`). With HDR on, also `hdr: { light, dark, lightContrast, darkContrast }`. |
| [`theme.dtcg(options?)`](./output.md#dtcgoptions) | One W3C DTCG token document per scheme variant. With HDR on, `$value` stays SDR and a glow's HDR value goes in `$extensions['me.tenphi.glaze'].hdr`. |
| [`theme.dtcgResolver(options?)`](./output.md#dtcgresolveroptions) | One DTCG Resolver-Module document holding every scheme variant, with the same `$extensions`. |
| [`theme.tailwind(options?)`](./output.md#tailwindoptions) | A Tailwind CSS v4 `@theme` block plus dark / high-contrast overrides, as one CSS string. With HDR on, HDR blocks follow under `hdrSelector`. |

HDR is on with `modes.hdr` (for `css()`, its own `hdr` option, which defaults to `modes.hdr`). It only adds entries for glows that carry an HDR value ([`glowTuning.headroom`](./configuration.md#glow-headroom)). The HDR value itself is always written as `color(srgb-linear R G B)`, and the dense `tokens()`, `css()`, and `tailwind()` blocks repeat such a glow's SDR value in a scheme where it has none. Off, every method's output is the same as with no headroom set. Shapes and wiring: [HDR output](./output.md#hdr-output).

To combine several themes into one token namespace, use a [palette](./palette.md).
