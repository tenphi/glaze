---
title: Palettes
description: glaze.palette() — composing themes into one token namespace, prefixes, collisions, the primary alias, and palette snapshots.
---

A palette composes several [themes](./theme.md) into a single token namespace: one `tokens()` / `css()` / `tailwind()` call emits every theme, each under its own prefix. How to choose a prefix strategy for an app is covered in [Exporting and integration](../exporting.mdx).

## `glaze.palette(themes, options?)`

```ts
import { glaze } from '@tenphi/glaze';

const primary = glaze(280, 80);
primary.colors({
  surface: { tone: 97 },
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
  accent: { tone: 52, mode: 'fixed' },
});
const danger = primary.extend({ hue: 23 });
const success = primary.extend({ hue: 145 });

const palette = glaze.palette({ primary, danger, success });
const withAlias = glaze.palette(
  { primary, danger, success },
  { primary: 'primary' },
);
```

| Parameter | Type | Description |
| --- | --- | --- |
| `themes` | `Record<string, GlazeTheme>` | Themes keyed by name. The name becomes the default token prefix (`<name>-`). Insertion order is the output order. |
| `options` | `GlazePaletteOptions` | Optional. |

`GlazePaletteOptions`:

| Option | Type | Description |
| --- | --- | --- |
| `primary` | `string` | Name of the primary theme. Its tokens are also emitted **without** a prefix in every output method except `json()`, as short aliases next to the prefixed ones. See [Primary theme aliases](#primary-theme-aliases). Throws `glaze: primary theme "<name>" not found in palette. Available: <names>.` when no theme has that name. |

The palette holds the theme instances you pass, not copies: changing a theme later changes the palette's next export.

## Palette members

| Member | Description |
| --- | --- |
| `palette.list()` | Theme names in insertion order. |
| `palette.primary` | The primary theme name set at creation, or `undefined`. Readonly. |
| `palette.theme(name)` | The live theme instance with that name, or `undefined`. |
| `palette.themes()` | Shallow copy of the theme map. The values are the same instances the palette holds. |
| `palette.export(override?)` | Authoring snapshot, restorable with `glaze.paletteFrom()`. See [below](#paletteexportoverride--glazepalettefromdata). |
| `palette.tokens(options?)` | Flat token map grouped by scheme variant. |
| `palette.tasty(options?)` | [Tasty](https://tasty.style) style-to-state bindings. |
| `palette.json(options?)` | Per-theme resolved color JSON. Not restorable as authoring config. |
| `palette.css(options?)` | CSS custom property declaration strings. |
| `palette.dtcg(options?)` | Per-scheme W3C DTCG token documents. |
| `palette.dtcgResolver(options?)` | One DTCG Resolver-Module document for every scheme. |
| `palette.tailwind(options?)` | One Tailwind CSS v4 theme with scheme overrides. |

## `palette.export(override?)` / `glaze.paletteFrom(data)`

`palette.export()` returns a JSON-safe authoring snapshot: each theme's [`theme.export()`](./theme.md#themeexportoverride) plus the primary name. The optional `override` (`GlazeConfigOverride`) is forwarded to every nested `theme.export(override)`.

```ts
const snapshot = withAlias.export();
// → {
//     kind: 'palette',
//     version: 2,
//     themes: {
//       primary: {
//         kind: 'theme',
//         version: 2,
//         hue: 280,
//         saturation: 80,
//         colors: {…},
//         config: {…},
//       },
//       danger: { kind: 'theme', version: 2, hue: 23, … },
//       success: { kind: 'theme', version: 2, hue: 145, … },
//     },
//     primary: 'primary', // omitted when the palette has none
//   }

const restored = glaze.paletteFrom(JSON.parse(JSON.stringify(snapshot)));
const brand = restored.theme('primary')!;
```

`GlazePaletteExport`:

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `'palette'` | Snapshot kind. Always written. |
| `version` | `number` | Schema version, `GLAZE_EXPORT_VERSION` (`2`). Always written. |
| `themes` | `Record<string, GlazeThemeExport>` | One theme snapshot per theme, keyed by name. |
| `primary` | `string` | The primary theme name. Omitted when the palette has none. |

Use `export()` / `paletteFrom()` to persist and restore the authoring graph (themes, color definitions, relations). Use `json()` / `tokens()` / `css()` / … to emit resolved color strings for apps and design tools.

`glaze.paletteFrom(data)` rebuilds every theme with the [`themeFrom`](./theme.md#glazethemefromdata--glazefromdata) rules and recreates the palette with the snapshot's `primary`. It throws when:

- `data` is not an object, or `kind` is present and not `'palette'`, or `version` is invalid or newer than `GLAZE_EXPORT_VERSION` (messages prefixed `glaze.paletteFrom:`).
- `themes` is missing or not an object: `glaze.paletteFrom: expected a "themes" object map of theme exports.`
- A theme entry fails a `themeFrom` check. The message is prefixed with the theme, for example `glaze.paletteFrom (theme "brand"): …`.
- A theme entry has no `version` of its own, the palette is version `1`, and the entry has shadow colors or a `shadowTuning` — the entry inherits the palette's version for this check. See [Authoring snapshots](./index.md#authoring-snapshots-and-versioning).
- `primary` names a theme that isn't in `themes`.

## `GlazePaletteExportOptions`

Every palette output method except `json()` accepts these on top of its own options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `prefix` | `boolean \| Record<string, string>` | `true` | `true` prefixes each theme's tokens with `"<themeName>-"`. A map sets a custom prefix per theme; themes not in the map fall back to `"<themeName>-"`. `false` disables prefixing. |
| `primary` | `string \| false` | The palette's `primary` | A theme name sets or changes the primary for this call (throws if no theme has that name). `false` disables the primary alias for this call. |

Each method's own options:

| Method | Own options (type) | Notes |
| --- | --- | --- |
| `palette.tokens(options?)` | `format`, `modes` (`GlazeJsonOptions`) | |
| `palette.tasty(options?)` | `format`, `modes`, `states`, `splitHue` (`GlazePaletteTastyOptions`) | No `name`: the hue var base name is each theme's name. `states` defaults to the global config. |
| `palette.json(options?)` | `format`, `modes` (`GlazeJsonOptions`) | Only these two: no prefix, primary, or collision handling — see [`palette.json()`](#palettejson). |
| `palette.css(options?)` | `format`, `suffix`, `splitHue` (`GlazePaletteCssOptions`) | No `modes`: always returns all four strings. No `name`, as for `tasty()`. |
| `palette.dtcg(options?)` | `colorSpace`, `modes` (`GlazeDtcgOptions`) | |
| `palette.dtcgResolver(options?)` | `colorSpace`, `modes`, `setName`, `modifierName`, `contextNames`, `version` (`GlazeDtcgResolverOptions`) | |
| `palette.tailwind(options?)` | `format`, `modes`, `namespace`, `darkSelector`, `highContrastSelector` (`GlazeTailwindOptions`) | `prefix` (theme prefix) and `namespace` (the `--color-` CSS namespace) are separate options. |

The option semantics and defaults are documented once, in [Output formats](./output.md).

## Prefix behavior

By default every token is prefixed with its theme name:

```ts
palette.tokens();
// → {
//   light: {
//     'primary-surface': 'oklch(0.97 0.0128 280)',
//     'primary-surface-text': 'oklch(0.5286 0.1912 280)',
//     'primary-accent': 'oklch(0.5961 0.181 280)',
//     'danger-surface': 'oklch(0.97 0.0129 23)',
//     …
//   },
//   dark: { … },
// }
```

A custom map renames some prefixes; any theme not listed falls back to `"<themeName>-"`:

```ts
palette.tokens({ prefix: { primary: 'brand-', danger: 'error-' } });
// → 'brand-surface', 'error-surface', 'success-surface', …
```

Disable prefixing:

```ts
palette.tokens({ prefix: false });
```

With `prefix: false`, themes that share color names collide; see the next section.

## Collision detection

When two themes produce the same output key — through `prefix: false`, a custom prefix map, or the primary's unprefixed aliases — the **first-written value wins** and Glaze logs a `console.warn` for every skipped token:

```text
glaze: token "surface" from theme "danger" collides with theme
  "primary" — skipping.
```

Write order is theme insertion order. For each theme, its prefixed tokens are written first and, if it is the primary, its unprefixed aliases immediately after (labeled `"<name> (primary)"` in the warning). So a primary alias wins over a later theme that emits the same unprefixed name.

> [!TIP]
> With `prefix: false`, also pass `primary: false` (or create the palette without a primary). Otherwise the primary's alias pass collides with the primary's own unprefixed tokens and warns once per token.

## Primary theme aliases

The primary theme's tokens are duplicated without a prefix:

```ts
const palette = glaze.palette(
  { primary, danger, success },
  { primary: 'primary' },
);

palette.tokens();
// → {
//   light: {
//     'primary-surface': 'oklch(0.97 0.0128 280)',
//     …
//     surface: 'oklch(0.97 0.0128 280)', // unprefixed alias
//     'surface-text': 'oklch(0.5286 0.1912 280)',
//     accent: 'oklch(0.5961 0.181 280)',
//     'danger-surface': 'oklch(0.97 0.0129 23)',
//     …
//   },
//   …
// }
```

Override the primary per export:

```ts
// danger's tokens get the unprefixed aliases
palette.tokens({ primary: 'danger' });
// no aliases
palette.tokens({ primary: false });
```

The alias works with any prefix mode. With a custom map, the primary's tokens are still duplicated without a prefix:

```ts
palette.tokens({ prefix: { primary: 'p-', danger: 'd-' } });
// → 'p-surface' + 'surface' (alias) + 'd-surface' + 'success-surface'
```

The alias applies to `tokens`, `tasty`, `css`, `dtcg`, `dtcgResolver`, and `tailwind` — not `json`.

## Palette output methods

### `palette.tokens()`

Same shape as [`theme.tokens()`](./output.md#tokensoptions), with every theme merged into each variant map.

### `palette.tasty()`

Same shape as [`theme.tasty()`](./output.md#tastyoptions), with every theme's `#<prefix><name>` keys in one object. State aliases come from the per-call `states` option, then the global config.

### `palette.json()`

Groups by theme name instead of prefixing, so there is nothing to collide:

```ts
palette.json();
// → {
//   primary: {
//     surface: {
//       light: 'oklch(0.97 0.0128 280)',
//       dark: 'oklch(0.279 0.1015 280)',
//     },
//     …
//   },
//   danger: {
//     surface: {
//       light: 'oklch(0.97 0.0129 23)',
//       dark: 'oklch(0.279 0.0791 23)',
//     },
//     …
//   },
//   success: { … },
// }
```

Accepts only `format` and `modes` (`GlazeJsonOptions`): no `prefix`, and no primary alias. The per-theme entries have the [`theme.json()`](./output.md#jsonoptions) shape.

### `palette.css()`

Accepts `GlazePaletteCssOptions`: `format`, `suffix`, and `splitHue` from [`theme.css()`](./output.md#cssoptions) (without its `name`) plus `GlazePaletteExportOptions`. It has no `modes` option: all four strings (`light`, `dark`, `lightContrast`, `darkContrast`) are always returned, each holding every theme's declarations joined by newlines.

```ts
const css = palette.css();
const stylesheet = `
:root { ${css.light} }
@media (prefers-color-scheme: dark) {
  :root { ${css.dark} }
}
`;
```

### `palette.dtcg()`

Accepts `GlazeDtcgOptions` plus `GlazePaletteExportOptions`. Prefix defaults to `true` and the palette `primary` is honored:

```ts
palette.dtcg();
// → {
//   light: {
//     'primary-surface': {
//       $type: 'color',
//       $value: {
//         colorSpace: 'srgb',
//         components: […],
//         hex: '#f3f4fe',
//       },
//     },
//     …
//     surface: { …, $value: { …, hex: '#f3f4fe' } }, // unprefixed alias
//     …
//     'danger-surface': { …, $value: { …, hex: '#fef2f1' } },
//     …
//   },
//   dark: { … },
// }
```

### `palette.dtcgResolver()`

Same document as [`theme.dtcgResolver()`](./output.md#dtcgresolveroptions), with every theme (prefixed, plus primary aliases) merged into the single `sets.base` source and into each `scheme` context. Accepts `GlazeDtcgResolverOptions` plus `GlazePaletteExportOptions`.

```ts
palette.dtcgResolver();
// → {
//   version: '2025.10',
//   sets: {
//     base: {
//       sources: [
//         {
//           'primary-surface': {…},
//           …
//           surface: {…},
//           …
//           'danger-surface': {…},
//           …
//         },
//       ],
//     },
//   },
//   modifiers: {
//     scheme: {
//       default: 'light',
//       contexts: { light: [], dark: [{ … }] },
//     },
//   },
//   resolutionOrder: [
//     { $ref: '#/sets/base' },
//     { $ref: '#/modifiers/scheme' },
//   ],
// }
```

### `palette.tailwind()`

All themes merge into one `@theme` block plus one block per override, so every color is reachable as a Tailwind utility. Accepts `GlazeTailwindOptions` plus `GlazePaletteExportOptions`.

```css
/* palette.tailwind() */
@theme {
  --color-primary-surface: oklch(0.97 0.0128 280);
  /* … */
  --color-surface: oklch(0.97 0.0128 280); /* unprefixed alias */
  /* … */
  --color-danger-surface: oklch(0.97 0.0129 23);
  /* … */
}
.dark {
  --color-primary-surface: oklch(0.279 0.1015 280);
  /* … */
}
```

## `splitHue` in palettes

`palette.css({ splitHue: true })` and `palette.tasty({ splitHue: true })` follow the [`splitHue` rules](./output.md#hue-channel-splitting-splithue) per theme, with two differences:

- The theme-level hue var is named after the theme (`--primary-hue`, `--danger-hue`); there is no `name` option.
- Per-color hue vars use the theme's prefix (`--primary-accent-hue`). The primary's unprefixed aliases reference those same vars instead of declaring their own, so they never collide with another theme's hue vars.

The [name-collision check](./output.md#variable-names) spans the whole palette. Without a prefix, a color that sets its own hue declares `--<color>-hue`, which is another theme's hue var when the color is named after that theme. The export throws rather than let one override the other:

```text
glaze: splitHue would declare "--accent-hue" twice: for color "accent"'s
  own hue (theme "brand") and for the hue of theme "accent". One would
  silently override the other. Rename the color or the theme, or give the
  theme a prefix that keeps its hue vars apart.
```

```css
/* palette.css({ splitHue: true }).light
   primary: 'primary', every theme pastel */
--primary-hue: 280;
--primary-accent-hue: calc(var(--primary-hue) + 20);
--primary-surface-color: oklch(0.97 0.0084 var(--primary-hue));
--primary-accent-color: oklch(0.5961 0.0608 var(--primary-accent-hue));
--surface-color: oklch(0.97 0.0084 var(--primary-hue));
--accent-color: oklch(0.5961 0.0608 var(--primary-accent-hue));
--danger-hue: 23;
--danger-accent-hue: calc(var(--danger-hue) + 20);
--danger-surface-color: oklch(0.97 0.0084 var(--danger-hue));
--danger-accent-color: oklch(0.5961 0.0608 var(--danger-accent-hue));
```

That output comes from two pastel themes:

```ts
const primary = glaze(280, 60, { pastel: true });
primary.colors({
  surface: { tone: 97 },
  accent: { tone: 52, hue: '+20' },
});
const danger = primary.extend({ hue: 23 });

glaze
  .palette({ primary, danger }, { primary: 'primary' })
  .css({ splitHue: true });
```
