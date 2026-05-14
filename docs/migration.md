# Migration & Integration

How to plug a Glaze palette into an existing app — exporting tokens in the right shape, mapping prefixes to the names your components already consume, and migrating off a legacy color system without breaking layout, dark-mode wiring, or muscle-memory tokens.

If you're starting from scratch, see [methodology.md](methodology.md) first — that's about *designing* the palette. This doc is about *consuming* it.

## Choosing an export

Glaze emits the same resolved colors in four shapes. Pick one based on your renderer.

| Method | Output shape | Use it for |
|---|---|---|
| `palette.tasty(options?)` | `{ '#name': { '': value, '@dark': value, '@hc': value } }` | The [Tasty](https://tasty.style/docs) style system. Single object, state aliases keyed inside each token. |
| `palette.tokens(options?)` | `{ light: { name: value }, dark: { name: value }, ... }` | Most CSS-in-JS systems. Per-variant flat maps, easy to feed into a `:root { ... }` selector via your framework's globals. |
| `palette.css(options?)` | `{ light: '--name-color: rgb(...);', dark: '...', ... }` | Framework-free CSS / static stylesheets. Variant-grouped CSS custom property strings ready to wrap in `:root` and `prefers-color-scheme` queries. |
| `palette.json(options?)` | `{ themeName: { name: { light, dark, ... } } }` | Tooling, JSON pipelines, design-token exporters (Style Dictionary, etc.). |

All four accept `format` (`'okhsl' \| 'rgb' \| 'hsl' \| 'oklch'`). `tokens()`, `tasty()`, and `json()` also accept `modes` (`{ dark, highContrast }`). `css()` always returns all four strings (`light`, `dark`, `lightContrast`, `darkContrast`). See [api.md → Palette](api.md#palette) for full options.

## Wiring exports into the app

### Tasty

Spread the result of `palette.tasty()` into a global style call:

```ts
import type { Styles } from '@tenphi/tasty';
import { useGlobalStyles } from '@tenphi/tasty';
import { tastyStatic } from '@tenphi/tasty/static';

export const PALETTE_TOKENS = palette.tasty({ /* prefix map */ }) as Styles;

// In your root component:
useGlobalStyles('body', PALETTE_TOKENS);

// Or, for zero-runtime builds:
tastyStatic('body', PALETTE_TOKENS);
```

For the `@dark` / `@hc` state aliases to do anything, your app needs to register what those states *mean*:

```ts
import { setGlobalPredefinedStates } from '@tenphi/tasty';

setGlobalPredefinedStates({
  '@dark':
    '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
  '@hc':
    '@root(contrast=high) | (!@root(contrast) & @media(prefers-contrast: more))',
});
```

The state names here must match the `states` you set in [`glaze.configure({ states })`](api.md#configuration).

You can also register the tokens as a Tasty recipe instead of spreading them globally:

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
palette.css({ suffix: '' });           // → '--surface: rgb(...);'
palette.css({ format: 'oklch' });      // → '--surface-color: oklch(...);'
```

### Framework-agnostic JSON

```ts
const data = palette.json();
// → { primary: { surface: { light: 'okhsl(...)', dark: 'okhsl(...)' } }, ... }
```

Feed into your tooling pipeline. Each color is grouped by theme name, then by token name, then by variant — no prefix logic to undo.

## Prefix map strategies

`palette.tokens()` / `tasty()` / `css()` accept a `prefix` option:

| Value | Result |
|---|---|
| `true` (default) | Every theme prefixes its tokens with `<themeName>-`. |
| `false` | No prefixes. Colliding keys produce a `console.warn`; first-write wins. |
| `Record<string, string>` | Per-theme prefix overrides. Themes not listed fall back to `<themeName>-`. |

The most common production pattern: **default theme unprefixed, every other theme prefixed with its name**:

```ts
palette.tasty({
  prefix: {
    default: '',
    primary: 'primary-',
    success: 'success-',
    danger:  'danger-',
    warning: 'warning-',
    note:    'note-',
  },
});
```

This makes neutral tokens consume as `#surface`, `#border`, `#disabled-surface` (no theme namespace) while status colors live under `#danger-surface`, `#success-accent-text`, etc.

### Alias themes for legacy names

Two aliases for the same theme instance produce identical token values under different prefixes — useful when you want to support a legacy token name without duplicating definitions:

```ts
const palette = glaze.palette({
  default: defaultTheme,
  primary: primaryTheme,
  purple:  primaryTheme,    // legacy alias — same theme, different prefix
  // ...
});

palette.tasty({
  prefix: {
    default: '',
    primary: 'primary-',
    purple:  'purple-',     // emits #purple-surface alongside #primary-surface
  },
});
```

Both `#primary-surface` and `#purple-surface` resolve to the exact same color. Drop the alias when the legacy name is no longer referenced.

### `primary` (the unprefixed alias)

`glaze.palette(themes, { primary })` and the per-export `primary` option duplicate one theme's tokens *without* prefix on top of any prefix map. Equivalent to listing that theme twice with different prefixes; useful when the "primary" theme is conceptually distinct from `default` and you want both sets of unprefixed tokens.

```ts
const palette = glaze.palette(
  { brand, accent },
  { primary: 'brand' },
);
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

Each bucket maps cleanly to one of the patterns in [methodology.md](methodology.md). The bucket determines the *shape* of the Glaze definition (root vs dependent, `mode: 'auto'` vs `'fixed'`, contrast-floor vs absolute lightness), not the value.

### 2. Reproduce the existing values

Pick a Glaze definition shape that lands the new color *close to* the legacy hex in light mode. The methodology doc explains the shape per bucket; the API doc covers the levers (`lightness`, `saturation`, `contrast`, `mode`, `hue`).

Two tactics that make matching easier:

- **Anchor strong text at the edge** instead of solving for `'AAA'`. The contrast solver stops at the floor (cr=7), which usually leaves text noticeably softer than a legacy hex like `#1a1a1a`. An absolute `lightness: 2` (or wherever the legacy token sits in OKHSL) preserves the look.
- **Use numeric `contrast` ratios** for soft / accent / disabled tokens. Presets give you the WCAG floor and nothing more — for matching a designed palette you usually want a specific perceived weight, not the floor.

### 3. Keep the old token names

Use a custom `prefix` map (and theme aliases if needed) so the names your components already consume keep working:

```ts
// Old: components consume `#dark`, `#dark-02`, `#dark-03`.
// New: define them in Glaze, map the prefix so they emit unchanged.

defaultTheme.colors({
  dark:      { base: 'surface', lightness: 2,  saturation: 0.475 },
  'dark-02': { base: 'surface', lightness: '-1', saturation: 0.375, contrast: [9, 11]   },
  'dark-03': { base: 'surface', lightness: '-1', saturation: 0.24,  contrast: [4.5, 5.5] },
});

palette.tasty({ prefix: { default: '' } });
// → '#dark', '#dark-02', '#dark-03' — components don't change.
```

Once consumers are off the legacy names, rename the Glaze tokens to match your conventions.

### 4. Verify dark mode and HC before promoting

Glaze gives you light/dark/HC for free, but only the light mode is matched against the legacy palette. Before promoting the migration:

- Spot-check every surface, text, accent, and disabled pair in dark mode. The Möbius dark inversion plus per-color `mode` choices may produce results that *look right* in light but feel off in dark (typical fix: switch a brand color to `mode: 'fixed'`, or anchor a foreground to `surface` instead of the brand fill — see [methodology.md](methodology.md)).
- If the legacy system had no high-contrast mode, audit the HC variants Glaze emits. Anywhere the resolved cr is too low or the color blows out, add an HC pair (`lightness: ['-7', '-20']`, `contrast: [4.5, 7]`, etc.).
- Run real screens, not just the token grid. The interaction of multiple Glaze tokens against each other (text on chip, hover bg vs. fill, disabled label on disabled chip) is where mismatches show up.

### 5. Trim what `extend()` doesn't need

After migration, mark every default-only token (borders, shadows, disabled chip, code highlighting, etc.) `inherit: false`. Colored sibling themes only need the accent + tinted-surface chain — flagging the rest cuts the emitted token set per theme dramatically.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Disabled state stops looking disabled in dark mode. | Alpha-tinted overlay on `surface-text` (which inverts), giving asymmetric perceived contrast. | Replace with a `mode: 'auto'` color anchored to `surface` with a numeric `contrast` (see [methodology.md → Disabled chip](methodology.md#disabled-chip-contrast-driven-for-scheme-symmetry)). |
| Brand color flips to its complement in dark mode. | Default `mode: 'auto'` runs the Möbius inversion. | Set `mode: 'fixed'` so the lightness is mapped (not inverted). |
| Brand text washes out against the dark surface. | Foreground was anchored to `accent-surface` (the brand fill), so contrast was only enforced against that fill — not the actual surface. | Anchor `accent-text` etc. to `surface` with `mode: 'auto'`. |
| Tokens look right in light, broken in HC. | The HC pass bypasses the lightness window — solver runs over the full `[0, 100]` range. | Add explicit `[normal, hc]` pairs to `lightness` / `contrast` for the affected tokens. |
| `palette.tokens()` emits unexpected unprefixed names. | A `primary` was set on the palette (or per-call) and is duplicating the theme's tokens without prefix. | Pass `primary: false` to disable for that export, or rename `glaze.palette(themes, { primary })`. |
| `console.warn: token "foo" collides with theme "bar"`. | Two themes resolved to the same output key under your prefix config. | Adjust the prefix map so each token is unique, or accept the first-write-wins behavior. |
| `console.warn: color "X" cannot meet contrast`. | The requested contrast target is physically unreachable for the color's hue/saturation against its base. | Lower the floor, change the base, or accept the closest passing variant. Use the `name` override on standalone colors to make the warning identifiable. |

## See also

- [methodology.md](methodology.md) — how to design the palette in the first place.
- [api.md](api.md) — full reference for every option mentioned here.
