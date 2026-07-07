# Migration & Integration

How to plug a Glaze palette into an existing app — exporting tokens in the right shape, mapping prefixes to the names your components already consume, and migrating off a legacy color system without breaking layout, dark-mode wiring, or muscle-memory tokens.

If you're starting from scratch, see [methodology.md](methodology.md) first — that's about *designing* the palette. This doc is about *consuming* it.

## Upgrading to the tone model (`lightness` → `tone`)

Glaze replaced OKHSL **lightness** with a contrast-uniform **tone** axis (OKHST). The Möbius dark-mode curve is gone — dark mode is now a single tone inversion remapped into a per-mode window. See [`docs/okhst.md`](okhst.md) for the model. This is a breaking change; here's what to update.

### Rename the authoring axis

`lightness` is gone. Replace it with `tone` everywhere:

```ts
// before
theme.colors({ surface: { lightness: 97 }, text: { base: 'surface', lightness: '-52' } });
// after
theme.colors({ surface: { tone: 97 }, text: { base: 'surface', tone: '-52' } });
```

The same applies to `glaze.color({ ..., lightness })` (structured form) → `tone`, and the `{ h, s, l }` value object is unchanged (still OKHSL) — but you can now also pass `{ h, s, t }` (OKHST) or an `okhst(H S% T%)` string.

Tone is **0–100** like the old lightness, but the *scale is contrast-uniform*, not perceptual-lightness-uniform. Numeric values won't land at the same OKHSL lightness — equal tone steps now give equal WCAG contrast. Re-eyeball absolute values (especially mid-range ones); relative deltas and contrast-floored tokens usually need no change because they were already contrast-driven.

### Config window shape

The lightness windows became tone windows, and `darkCurve` was removed (no curve to tune). The `[lo, hi]` tuple form carries over directly:

```ts
// before
glaze.configure({ lightLightness: [10, 100], darkLightness: [15, 95], darkCurve: 0.5 });
// after
glaze.configure({
  lightTone: [10, 100],
  darkTone: [15, 95],
  // darkCurve removed
});
```

`lightLightness`/`darkLightness` → `lightTone`/`darkTone`. The window value is `[lo, hi]` (reference eps — the common form), `{ lo, hi, eps }` (advanced: explicit render curvature), or `false` to disable clamping. `false` removes the *boundaries* (full `[0, 100]` range), not the contrast-uniform tone curve. Per-token `glaze.color(value, config)` overrides use the same shape.

### The `contrast` prop now selects a metric

A bare number or preset is still **WCAG** and needs no change. To use APCA or split a pair across the metric, use the object form:

```ts
contrast: 4.5            // unchanged — WCAG 4.5
contrast: { wcag: 6 }    // explicit WCAG
contrast: { apca: 60 }   // APCA Lc floor
contrast: { wcag: [4.5, 7] } // pair inside the metric
```

### Forcing extremes: `'max'` / `'min'`

For colors that should sit at the scheme's tone extreme (pure-white knockouts, near-black scrims, deliberately faint disabled chips), reach for `tone: 'max'` / `tone: 'min'` instead of a large absolute number or a low contrast floor standing in for "push it all the way". `'max'` resolves to author tone 100, `'min'` to 0, and both flow through scheme mapping (so they invert in dark under `mode: 'auto'`). No `base` required.

```ts
// before — low contrast as a proxy for "stay near the surface"
'disabled-text': { base: 'chip', tone: '+1', contrast: 1.51, mode: 'fixed' }
// after — say it directly with tone
'disabled-text': { base: 'chip', tone: '+18', saturation: 0.4, autoFlip: false }
```

### The `autoFlip` prop (previously `flip`)

The per-color configuration property `flip` has been renamed to `autoFlip` to align with the global `autoFlip` configuration option and to avoid confusion with dark-mode/scheme tone inversion (which is handled automatically by the system).

Relative `tone` offsets that overshoot `[0, 100]` now **mirror to the other side of the base by default** (controlled by the per-color `autoFlip`, which inherits the global `autoFlip`, default `true`). Previously such offsets always clamped to the boundary. If you relied on clamping — e.g. `tone: '+48'` to stack a color up to 100 — set `autoFlip: false` on that color (or `glaze.configure({ autoFlip: false })` globally) to restore the clamping behavior. `autoFlip` also governs the contrast solver's direction (its previous sole role).

### Resolved variants store tone

`ResolvedColorVariant` now exposes `t` (tone, 0–1) instead of `l`. If you read resolved internals, convert with `variantToOkhsl(variant).l`. Token/CSS/JSON output uses native formats by default (`oklch` for `tokens()` / `json()`, `okhsl` for `tasty()`); use `tasty({ format: 'okhsl' })` or `tasty({ format: 'okhst' })` for Glaze-native spaces.

### 0.16.0 — output format defaults and Tasty-only spaces

**Breaking changes in 0.16.0:**

| Export | Old default | New default |
|---|---|---|
| `tokens()` / `json()` (theme + palette) | `okhsl` | `oklch` |
| Standalone `.json()` | `okhsl` | `oklch` |
| `tasty()` | `okhsl` (unchanged) | `okhsl` |

`'okhsl'` and the new `'okhst'` output format are **Tasty-only**. Passing either to `css()`, `tailwind()`, `tokens()`, or `json()` throws. Migrate:

```ts
// before
theme.tokens({ format: 'okhsl' })
theme.json()

// after — pick one
theme.tasty({ format: 'okhsl' })   // Tasty #name keys, okhsl strings
theme.tokens({ format: 'oklch' })    // native CSS (new default)
```

**New:** `splitHue` on `css()` / `tasty()` (theme + palette) and standalone `color.css()` emits hue as a separate custom property for runtime re-skinning. Requires `format: 'oklch'` and every color to be pastel. See [api.md → Hue channel splitting](api.md#hue-channel-splitting-splithue).

### Export snapshots

`theme.export()` / `color.export()` snapshots now carry `lightTone` / `darkTone` window objects (not `lightLightness` / `darkLightness`). Old exported JSON with the legacy keys will need its `config` block rewritten before `glaze.from()` / `glaze.colorFrom()`.

## Choosing an export

Glaze emits the same resolved colors in six shapes. Pick one based on your renderer / tooling.

| Method | Output shape | Use it for |
|---|---|---|
| `palette.tasty(options?)` | `{ '#name': { '': value, '@dark': value, '@hc': value } }` | The [Tasty](https://tasty.style/docs) style system. Single object, state aliases keyed inside each token. |
| `palette.tokens(options?)` | `{ light: { name: value }, dark: { name: value }, ... }` | Most CSS-in-JS systems. Per-variant flat maps, easy to feed into a `:root { ... }` selector via your framework's globals. |
| `palette.css(options?)` | `{ light: '--name-color: rgb(...);', dark: '...', ... }` | Framework-free CSS / static stylesheets. Variant-grouped CSS custom property strings ready to wrap in `:root` and `prefers-color-scheme` queries. |
| `palette.json(options?)` | `{ themeName: { name: { light, dark, ... } } }` | Tooling, JSON pipelines. |
| `palette.dtcg(options?)` | `{ light: { name: { $type, $value } }, dark: { ... }, ... }` | W3C [DTCG 2025.10](https://www.designtokens.org/) `.tokens.json` — Figma, Tokens Studio, Style Dictionary, Terrazzo, Penpot. One document per scheme. |
| `palette.dtcgResolver(options?)` | `{ version, sets, modifiers, resolutionOrder }` | W3C DTCG **Resolver-Module** — a single document describing every scheme variant as `sets` + a `scheme` modifier with a context per variant. For resolver tools such as Dispersa. |
| `palette.tailwind(options?)` | `'@theme { --color-*: ... } .dark { ... } ...'` | Tailwind CSS v4. A single ready-to-paste `@theme` block plus dark / high-contrast overrides. |

`tasty()`, `tokens()`, `json()`, `dtcg()`, `dtcgResolver()`, and `tailwind()` accept `modes` (`{ dark, highContrast }`). `css()` always returns all four strings (`light`, `dark`, `lightContrast`, `darkContrast`). The CSS-string exports accept `format` (`'rgb' \| 'hsl' \| 'oklch'` on `tokens`/`json`/`css`/`tailwind`; `'okhsl' \| 'okhst'` on `tasty()` only); `dtcg()` and `dtcgResolver()` use `colorSpace` (`'srgb' \| 'oklch'`) instead. See [api.md → Palette](api.md#palette) for full options.

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

Each bucket maps cleanly to one of the patterns in [methodology.md](methodology.md). The bucket determines the *shape* of the Glaze definition (root vs dependent, `mode: 'auto'` vs `'fixed'`, contrast-floor vs absolute tone), not the value.

### 2. Reproduce the existing values

Pick a Glaze definition shape that lands the new color *close to* the legacy hex in light mode. The methodology doc explains the shape per bucket; the API doc covers the levers (`tone`, `saturation`, `contrast`, `mode`, `hue`).

Two tactics that make matching easier:

- **Anchor strong text at the edge** instead of solving for `'AAA'`. The contrast solver stops at the floor (cr=7), which usually leaves text noticeably softer than a legacy hex like `#1a1a1a`. An absolute `tone: 2` (or wherever the legacy token sits) preserves the look.
- **Use numeric `contrast` ratios** for soft / accent / disabled tokens. Presets give you the WCAG floor and nothing more — for matching a designed palette you usually want a specific perceived weight, not the floor.

### 3. Keep the old token names

Use a custom `prefix` map (and theme aliases if needed) so the names your components already consume keep working:

```ts
// Old: components consume `#dark`, `#dark-02`, `#dark-03`.
// New: define them in Glaze, map the prefix so they emit unchanged.

defaultTheme.colors({
  dark:      { base: 'surface', tone: 2,  saturation: 0.475 },
  'dark-02': { base: 'surface', tone: '-1', saturation: 0.375, contrast: [9, 11]   },
  'dark-03': { base: 'surface', tone: '-1', saturation: 0.24,  contrast: [4.5, 5.5] },
});

palette.tasty({ prefix: { default: '' } });
// → '#dark', '#dark-02', '#dark-03' — components don't change.
```

Once consumers are off the legacy names, rename the Glaze tokens to match your conventions.

### 4. Verify dark mode and HC before promoting

Glaze gives you light/dark/HC for free, but only the light mode is matched against the legacy palette. Before promoting the migration:

- Spot-check every surface, text, accent, and disabled pair in dark mode. The tone inversion plus per-color `mode` choices may produce results that *look right* in light but feel off in dark (typical fix: switch a brand color to `mode: 'fixed'`, or anchor a foreground to `surface` instead of the brand fill — see [methodology.md](methodology.md)).
- If the legacy system had no high-contrast mode, audit the HC variants Glaze emits. Anywhere the resolved cr is too low or the color blows out, add an HC pair (`tone: ['-7', '-20']`, `contrast: [4.5, 7]`, etc.).
- Run real screens, not just the token grid. The interaction of multiple Glaze tokens against each other (text on chip, hover bg vs. fill, disabled label on disabled chip) is where mismatches show up.

### 5. Trim what `extend()` doesn't need

After migration, mark every default-only token (borders, shadows, disabled chip, code highlighting, etc.) `inherit: false`. Colored sibling themes only need the accent + tinted-surface chain — flagging the rest cuts the emitted token set per theme dramatically.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Disabled state stops looking disabled in dark mode. | Alpha-tinted overlay on `surface-text` (which inverts), giving asymmetric perceived contrast. | Replace with a `mode: 'auto'` color anchored to `surface` with a numeric `contrast` (see [methodology.md → Disabled chip](methodology.md#disabled-chip-contrast-driven-for-scheme-symmetry)). |
| Brand color flips to its complement in dark mode. | Default `mode: 'auto'` inverts the tone. | Set `mode: 'fixed'` so the tone is remapped (not inverted). |
| Brand text washes out against the dark surface. | Foreground was anchored to `accent-surface` (the brand fill), so contrast was only enforced against that fill — not the actual surface. | Anchor `accent-text` etc. to `surface` with `mode: 'auto'`. |
| Tokens look right in light, broken in HC. | The HC pass bypasses the tone window — solver runs over the full `[0, 100]` range. | Add explicit `[normal, hc]` pairs to `tone` / `contrast` for the affected tokens. |
| A relative `tone` like `'+48'` lands on the *wrong* (darker) side of its base. | Overshooting offsets now mirror to the other side of the base by default (`autoFlip` inherits `autoFlip`). | Set `autoFlip: false` on the color to clamp to the boundary instead, or use `tone: 'max'`/`'min'` to force the extreme. |
| `palette.tokens()` emits unexpected unprefixed names. | A `primary` was set on the palette (or per-call) and is duplicating the theme's tokens without prefix. | Pass `primary: false` to disable for that export, or rename `glaze.palette(themes, { primary })`. |
| `console.warn: token "foo" collides with theme "bar"`. | Two themes resolved to the same output key under your prefix config. | Adjust the prefix map so each token is unique, or accept the first-write-wins behavior. |
| `console.warn: color "X" cannot meet contrast`. | The requested contrast target is physically unreachable for the color's hue/saturation against its base. | Lower the floor, change the base, or accept the closest passing variant. Use the `name` override on standalone colors to make the warning identifiable. |

## See also

- [methodology.md](methodology.md) — how to design the palette in the first place.
- [api.md](api.md) — full reference for every option mentioned here.
