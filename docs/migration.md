# Migration & Integration

How to move an existing CSS, design-token, or application color system to
Glaze, then export the resulting palette in the shape your app and design tools
consume.

If you're starting from scratch, see [methodology.md](methodology.md) first — that's about _designing_ the palette. This doc is about _consuming_ it.

## Contents

- [Choosing an export](#choosing-an-export)
- [Wiring exports into the app](#wiring-exports-into-the-app)
- [Prefix map strategies](#prefix-map-strategies)
- [Migrating an existing color system](#migrating-from-an-existing-color-system)
- [Common pitfalls](#common-pitfalls)

## Choosing an export

Glaze emits the same resolved colors in seven shapes. Pick one based on your
renderer or tooling.

| Method                           | Output shape                                                                                                       | Use it for                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.tasty(options?)`        | `{ '#name': { '': value, '@media(prefers-color-scheme: dark)': value, '@media(prefers-contrast: more)': value } }` | The [Tasty](https://tasty.style) style system. Single object, state aliases keyed inside each token.                                                                         |
| `palette.tokens(options?)`       | `{ light: { name: value }, dark: { name: value }, ... }`                                                           | Most CSS-in-JS systems. Per-variant flat maps, easy to feed into a `:root { ... }` selector via your framework's globals.                                                         |
| `palette.css(options?)`          | `{ light: '--name-color: rgb(...);', dark: '...', ... }`                                                           | Framework-free CSS / static stylesheets. Variant-grouped CSS custom property strings ready to wrap in `:root` and `prefers-color-scheme` queries.                                 |
| `palette.json(options?)`         | `{ themeName: { name: { light, dark, ... } } }`                                                                    | Tooling, JSON pipelines.                                                                                                                                                          |
| `palette.dtcg(options?)`         | `{ light: { name: { $type, $value } }, dark: { ... }, ... }`                                                       | W3C [DTCG 2025.10](https://www.designtokens.org/) `.tokens.json` — Figma, Tokens Studio, Style Dictionary, Terrazzo, Penpot. One document per scheme.                             |
| `palette.dtcgResolver(options?)` | `{ version, sets, modifiers, resolutionOrder }`                                                                    | W3C DTCG **Resolver-Module** — a single document describing every scheme variant as `sets` + a `scheme` modifier with a context per variant. For resolver tools such as Dispersa. |
| `palette.tailwind(options?)`     | `'@theme { --color-*: ... } .dark { ... } ...'`                                                                    | Tailwind CSS v4. A single ready-to-paste `@theme` block plus dark / high-contrast overrides.                                                                                      |

`tasty()`, `tokens()`, `json()`, `dtcg()`, `dtcgResolver()`, and `tailwind()` accept `modes` (`{ dark, highContrast }`). `css()` always returns all four strings (`light`, `dark`, `lightContrast`, `darkContrast`). CSS-string exports accept `format` and default to `'oklch'` (`tokens`/`json`/`css`/`tailwind`/`tasty`; `'rgb'` and `'hsl'` also available). `'okhsl'` and `'okhst'` are supported only on [Tasty](https://tasty.style)-shaped exports (`tasty()`, standalone `token()` / `.tasty()`). `dtcg()` and `dtcgResolver()` ignore `format` and use `colorSpace` instead (`'srgb'` default, `'oklch'` opt-in). See [api.md → Palette](api.md#palette) for full options.

## Wiring exports into the app

### [Tasty](https://tasty.style)

Spread the result of `palette.tasty()` into a global style call:

```ts
import type { Styles } from '@tenphi/tasty';
import { useGlobalStyles } from '@tenphi/tasty';
import { tastyStatic } from '@tenphi/tasty/static';

export const PALETTE_TOKENS = palette.tasty({
  /* prefix map */
}) as Styles;

// In your root component:
useGlobalStyles('body', PALETTE_TOKENS);

// Or, for zero-runtime builds:
tastyStatic('body', PALETTE_TOKENS);
```

By default the dark / high-contrast variants are keyed by media-query states — `'@media(prefers-color-scheme: dark)'` and `'@media(prefers-contrast: more)'` — so the tokens react to the OS preference out of the box, with no extra [Tasty](https://tasty.style) setup.

If you'd rather drive the schemes from custom aliases (e.g. a manual toggle that also falls back to the OS preference), set your own [`glaze.configure({ states })`](api.md#configuration) and register what those states _mean_:

```ts
import { setGlobalPredefinedStates } from '@tenphi/tasty';

// glaze.configure({ states: { dark: '@dark', highContrast: '@hc' } });
setGlobalPredefinedStates({
  '@dark':
    '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
  '@hc':
    '@root(contrast=high) | (!@root(contrast) & @media(prefers-contrast: more))',
});
```

The state names here must match the `states` you set in [`glaze.configure({ states })`](api.md#configuration).

You can also register the tokens as a [Tasty](https://tasty.style) recipe instead of spreading them globally:

```ts
import { configure, tasty } from '@tenphi/tasty';

configure({ recipes: { 'theme-tokens': PALETTE_TOKENS } });

const Page = tasty({
  styles: { recipe: 'theme-tokens', fill: '#surface', color: '#surface-text' },
});
```

### CSS custom properties

```ts
const css = palette.css();
const stylesheet = `
:root { ${css.light} }
@media (prefers-color-scheme: dark)   { :root { ${css.dark} } }
@media (prefers-contrast: more)       { :root { ${css.lightContrast} } }
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root { ${css.darkContrast} }
}
`;
```

Each property name is `--<prefix><name>-color` by default. Override the suffix:

```ts
palette.css({ suffix: '' }); // → '--surface: rgb(...);'
palette.css({ format: 'oklch' }); // → '--surface-color: oklch(...);'
```

### Framework-agnostic JSON

```ts
const data = palette.json();
// → { primary: { surface: { light: 'oklch(...)', dark: 'oklch(...)' } }, ... }
```

Feed into your tooling pipeline. Each color is grouped by theme name, then by token name, then by variant — no prefix logic to undo.

### W3C DTCG (`.tokens.json`)

```ts
import { writeFileSync } from 'node:fs';
const dtcg = palette.dtcg();

writeFileSync('tokens.light.tokens.json', JSON.stringify(dtcg.light, null, 2));
if (dtcg.dark) {
  writeFileSync('tokens.dark.tokens.json', JSON.stringify(dtcg.dark, null, 2));
}
```

Each document is a spec-conformant token tree. One file per scheme is the most tool-compatible convention — Style Dictionary treats them as themes, Tokens Studio as sets, and Figma as variable modes. Use `colorSpace: 'oklch'` for wide-gamut, Glaze-native values (no `hex`); the default `'srgb'` emits components plus a `hex` hint that every reader understands. Feed the files straight into Style Dictionary v4+, Tokens Studio, or any DTCG-compatible tool — no Glaze-specific transform needed.

### W3C DTCG Resolver-Module (single document)

When you want **one file** describing every scheme variant — for a resolver tool such as [Dispersa](https://github.com/dispersa-core/dispersa) — use `dtcgResolver()` instead of `dtcg()`:

```ts
import { writeFileSync } from 'node:fs';
const resolver = palette.dtcgResolver({ modes: { highContrast: true } });

writeFileSync('resolver.json', JSON.stringify(resolver, null, 2));
```

The document places the light tokens in `sets.base.sources[0]` (the default context) and emits a single `scheme` modifier with a context per variant (`light` / `dark` / `lightContrast` / `darkContrast`). Each non-default context holds that variant's exact resolved tokens — Glaze resolves `darkContrast` independently, so the four-context shape keeps every value correct (two independent modifiers would compose additively and produce wrong dark + high-contrast values). Rename the set, modifier, or contexts via `setName` / `modifierName` / `contextNames` if your resolver expects different labels. Prefer `dtcg()` when you need maximum per-file tool compatibility; prefer `dtcgResolver()` when a resolver tool consumes the document for you.

### Tailwind CSS v4

```ts
const css = palette.tailwind();
// Write to your CSS entry, or paste into a `@import "tailwindcss"` stylesheet:
// @theme { --color-primary-surface: oklch(...); ... }
// .dark { --color-primary-surface: oklch(...); ... }
```

The `--color-*` namespace makes every color available as `bg-*` / `text-*` / `border-*`. Drive dark mode from the OS preference instead of a class with `darkSelector: '@media (prefers-color-scheme: dark)'` (it nests `:root` automatically). High-contrast overrides land under `.high-contrast` and `.dark.high-contrast` by default; both are omitted unless `modes.highContrast` is enabled.

## Prefix map strategies

`palette.tokens()` / `tasty()` / `css()` / `dtcg()` / `tailwind()` accept a `prefix` option:

| Value                    | Result                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| `true` (default)         | Every theme prefixes its tokens with `<themeName>-`.                       |
| `false`                  | No prefixes. Colliding keys produce a `console.warn`; first-write wins.    |
| `Record<string, string>` | Per-theme prefix overrides. Themes not listed fall back to `<themeName>-`. |

The most common production pattern: **default theme unprefixed, every other theme prefixed with its name**:

```ts
palette.tasty({
  prefix: {
    default: '',
    primary: 'primary-',
    success: 'success-',
    danger: 'danger-',
    warning: 'warning-',
    note: 'note-',
  },
});
```

This makes neutral tokens consume as `#surface`, `#border`, `#disabled-surface` (no theme namespace) while status colors live under `#danger-surface`, `#success-accent-text`, etc.

This explicit map is usually clearer for a neutral `default` theme. The
separate `primary` palette option below solves a different namespace problem:
it duplicates one named theme without a prefix while retaining that theme's
prefixed tokens.

### Alias themes for legacy names

Two aliases for the same theme instance produce identical token values under different prefixes — useful when you want to support a legacy token name without duplicating definitions:

```ts
const palette = glaze.palette({
  default: defaultTheme,
  primary: primaryTheme,
  purple: primaryTheme, // legacy alias — same theme, different prefix
  // ...
});

palette.tasty({
  prefix: {
    default: '',
    primary: 'primary-',
    purple: 'purple-', // emits #purple-surface alongside #primary-surface
  },
});
```

Both `#primary-surface` and `#purple-surface` resolve to the exact same color. Drop the alias when the legacy name is no longer referenced.

### `primary` (the unprefixed alias)

`glaze.palette(themes, { primary })` and the per-export `primary` option duplicate one theme's tokens _without_ prefix on top of any prefix map. Equivalent to listing that theme twice with different prefixes; useful when the "primary" theme is conceptually distinct from `default` and you want both sets of unprefixed tokens.

```ts
const palette = glaze.palette({ brand, accent }, { primary: 'brand' });
palette.tokens();
// → { light: { 'brand-surface': '...', 'surface': '...', 'accent-surface': '...' } }
```

Override per call: `palette.tokens({ primary: 'accent' })`, or disable with `palette.tokens({ primary: false })`.

## Migrating from an existing color system

The fastest path: **map first, design second**. Get every existing token name producing a Glaze-resolved color value (even if it's a rough first pass), wire the new palette in, then iterate on the resolved colors without touching component code.

### 1. Inventory the existing tokens

Walk your current color system and bucket every token into one of these categories:

- **Surfaces** — backgrounds, panels, cards, banners.
- **Surface text** — body text, headings, captions, labels.
- **Borders / dividers / focus rings** — neutral structural lines.
- **Brand fills** — solid CTA backgrounds, badges, status banners.
- **Brand foregrounds** — link text, status text, icon colors on neutral backgrounds.
- **Disabled** — disabled chip + label.
- **Shadows / overlays** — elevation, scrims.
- **One-off colors** — syntax highlighting, charts, illustrations.

Each bucket maps cleanly to one of the patterns in [methodology.md](methodology.md). The bucket determines the _shape_ of the Glaze definition (root vs dependent, `mode: 'auto'` vs `'fixed'`, contrast-floor vs absolute tone), not the value.

### 2. Reproduce the existing values

Pick a Glaze definition shape that lands the new color _close to_ the legacy hex in light mode. The methodology doc explains the shape per bucket; the API doc covers the levers (`tone`, `saturation`, `contrast`, `mode`, `hue`).

Two tactics that make matching easier:

- **Anchor strong text at the edge** instead of solving for `'AAA'`. The contrast solver stops at the floor (cr=7), which usually leaves text noticeably softer than a legacy hex like `#1a1a1a`. An absolute `tone: 2` (or wherever the legacy token sits) preserves the look.
- **Match the metric the old system actually used.** Numeric WCAG ratios are
  useful when reproducing a measured legacy ratio. For new content roles,
  prefer the APCA presets from the methodology. For low-stakes spacing, use a
  tone delta instead of inventing a contrast target.

### 3. Keep the old token names

Use a custom `prefix` map (and theme aliases if needed) so the names your components already consume keep working:

```ts
// Old: components consume `#dark`, `#dark-02`, `#dark-03`.
// New: define them in Glaze, map the prefix so they emit unchanged.

defaultTheme.colors({
  dark: { base: 'surface', tone: 2, saturation: 0.475 },
  'dark-02': {
    base: 'surface',
    tone: '-1',
    saturation: 0.375,
    contrast: [9, 11],
  },
  'dark-03': {
    base: 'surface',
    tone: '-1',
    saturation: 0.24,
    contrast: [4.5, 5.5],
  },
});

palette.tasty({ prefix: { default: '' } });
// → '#dark', '#dark-02', '#dark-03' — components don't change.
```

Once consumers are off the legacy names, rename the Glaze tokens to match your conventions.

### 4. Verify dark mode and HC before promoting

Glaze gives you light/dark/HC for free, but only the light mode is matched against the legacy palette. Before promoting the migration:

- Spot-check every surface, text, accent, and disabled pair in dark mode. The tone inversion plus per-color `mode` choices may produce results that _look right_ in light but feel off in dark (typical fix: switch a brand color to `mode: 'fixed'`, or anchor a foreground to `surface` instead of the brand fill — see [methodology.md](methodology.md)).
- If the legacy system had no high-contrast mode, audit the HC variants Glaze emits. Anywhere the resolved cr is too low or the color blows out, add an HC pair (`tone: ['-7', '-20']`, `contrast: [4.5, 7]`, etc.).
- Run real screens, not just the token grid. The interaction of multiple Glaze tokens against each other (text on chip, hover bg vs. fill, disabled label on disabled chip) is where mismatches show up.

### 5. Trim what `extend()` doesn't need

After migration, mark every default-only token (borders, shadows, disabled chip, code highlighting, etc.) `inherit: false`. Colored sibling themes only need the accent + tinted-surface chain — flagging the rest cuts the emitted token set per theme dramatically.

## Common pitfalls

| Symptom                                                                        | Cause                                                                                                                                   | Fix                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled state stops looking disabled in dark mode.                            | Alpha-tinted overlay on `surface-text` (which inverts), giving asymmetric perceived contrast.                                           | Replace it with an adaptive color anchored to `surface`; use a tone delta for visual spacing or a contrast floor when required. See [Chips and disabled states](methodology.md#chips-and-disabled-states). |
| Brand color flips to its complement in dark mode.                              | Default `mode: 'auto'` inverts the tone.                                                                                                | Set `mode: 'fixed'` so the tone is remapped (not inverted).                                                                                                                                                |
| Brand text washes out against the dark surface.                                | Foreground was anchored to `accent-surface` (the brand fill), so contrast was only enforced against that fill — not the actual surface. | Anchor `accent-text` etc. to `surface` with `mode: 'auto'`.                                                                                                                                                |
| Tokens look right in light, broken in HC.                                      | The HC pass bypasses the tone window — solver runs over the full `[0, 100]` range.                                                      | Add explicit `[normal, hc]` pairs to `tone` / `contrast` for the affected tokens.                                                                                                                          |
| A relative `tone` like `'+48'` lands on the _wrong_ (darker) side of its base. | Overshooting offsets now mirror to the other side of the base by default (`autoFlip` inherits `autoFlip`).                              | Set `autoFlip: false` on the color to clamp to the boundary instead, or use `tone: 'max'`/`'min'` to force the extreme.                                                                                    |
| `palette.tokens()` emits unexpected unprefixed names.                          | A `primary` was set on the palette (or per-call) and is duplicating the theme's tokens without prefix.                                  | Pass `primary: false` to disable for that export, or rename `glaze.palette(themes, { primary })`.                                                                                                          |
| `console.warn: token "foo" collides with theme "bar"`.                         | Two themes resolved to the same output key under your prefix config.                                                                    | Adjust the prefix map so each token is unique, or accept the first-write-wins behavior.                                                                                                                    |
| `console.warn: color "X" cannot meet contrast`.                                | The requested contrast target is physically unreachable for the color's hue/saturation against its base.                                | Lower the floor, change the base, or accept the closest passing variant. Use the `name` override on standalone colors to make the warning identifiable.                                                    |

## See also

- [methodology.md](methodology.md) — how to design the palette in the first place.
- [api.md](api.md) — full reference for every option mentioned here.
