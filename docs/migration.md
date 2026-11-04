---
title: Migration and upgrading
description: Move an existing color system to Glaze without renaming tokens, and upgrade between major Glaze versions.
---

This page covers two kinds of move: bringing an existing CSS, design-token, or
application color system over to Glaze, and upgrading Glaze itself across a
major version. For designing a palette from scratch, see
[Designing a palette](./methodology.mdx); for choosing an export shape and
wiring it into your app, see [Exporting and integration](./exporting.mdx).

## Migrating from an existing color system

The fastest path is **map first, design second**. Get every existing token name
producing a Glaze-resolved color (even a rough first pass), wire the new
palette in, then iterate on the resolved colors without touching component
code.

### 1. Inventory the existing tokens

Walk your current color system and put every token into one of these buckets:

- **Surfaces**: backgrounds, panels, cards, banners.
- **Surface text**: body text, headings, captions, labels.
- **Borders, dividers, focus rings**: neutral structural lines.
- **Brand fills**: solid CTA backgrounds, badges, status banners.
- **Brand foregrounds**: link text, status text, icon colors on neutral
  backgrounds.
- **Disabled**: disabled chip and its label.
- **Shadows and overlays**: elevation and state layers (`shadow` / `glow`),
  and fixed-alpha overlays such as scrims (`opacity`).
- **One-off colors**: syntax highlighting, charts, illustrations.

Each bucket maps onto one of the patterns in
[Designing a palette](./methodology.mdx). The bucket decides the _shape_ of the
Glaze definition (root or dependent, `mode: 'auto'` or `'fixed'`, a contrast
floor or an absolute tone), not its value.

### 2. Reproduce the existing values

Pick a definition shape that lands the new color _close to_ the legacy value in
light mode. [Designing a palette](./methodology.mdx) explains the shape per
bucket; the [Color definitions](./reference/color-definitions.md) reference
covers the levers (`tone`, `saturation`, `contrast`, `mode`, `hue`).

Three tactics make matching easier:

- **Anchor strong text at the edge** instead of solving for `'AAA'`. The
  contrast solver stops at the floor, which usually leaves text noticeably
  softer than the legacy value: on a white surface, a neutral
  `contrast: 'AAA'` (7:1) solves to tone 36, while a legacy `#1a1a1a` sits at
  tone 6.2 (17.4:1). An absolute `tone` preserves the look, but author it a
  little below the measured value: the light
  [tone window](./schemes.mdx#tone-windows) lifts authored tones (tone 0
  renders at about 5, tone 2 at 6.9), so a neutral `tone: 1.3` renders
  `#1a1a1a`. With `lightTone: false` on the theme, light tones render exactly
  as authored.
- **Match the metric the old system actually used.** Numeric WCAG ratios are
  useful when you reproduce a measured legacy ratio. For new content roles,
  prefer the APCA presets from the methodology. For low-stakes spacing, use a
  tone delta instead of inventing a contrast target. See
  [Contrast solving](./contrast.mdx).
- **Pin values that are a contract with `from`.** A brand color you must honor
  can be given as a literal: `{ from: '#2f5bff' }` reproduces that exact value
  in the light scheme whatever the theme's seed saturation, while dark and high
  contrast still adapt. Add `base` and `contrast` when it must stay legible
  against something. See [`from`](./reference/color-definitions.md#from).

### 3. Keep the old token names

Use a custom `prefix` map (and [alias themes](./exporting.mdx#alias-themes-for-legacy-names)
if needed) so the names your components already consume keep working:

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
// → '#dark', '#dark-02', '#dark-03': components don't change.
```

Once consumers are off the legacy names, rename the Glaze tokens to match your
conventions. [Prefix map strategies](./exporting.mdx#prefix-map-strategies)
shows every naming option with real output.

### 4. Verify dark mode and high contrast before promoting

Glaze gives you light, dark, and high contrast for free, but only the light
scheme was matched against the legacy palette. Before you promote the
migration:

- Spot-check every surface, text, accent, and disabled pair in dark mode. The
  tone inversion plus the per-color `mode` can produce results that look right
  in light but feel off in dark. The usual fixes: switch a brand color to
  `mode: 'fixed'`, or anchor a foreground to `surface` instead of the brand
  fill (see [adaptation modes](./schemes.mdx#adaptation-modes) and
  [Designing a palette](./methodology.mdx)).
- If the legacy system had no high-contrast mode, audit the high-contrast
  variants Glaze emits. Wherever the resolved contrast is too low or a color
  blows out, add a `[normal, highContrast]` pair (`tone: ['-7', '-20']`,
  `contrast: [4.5, 7]`, and so on).
- Run real screens, not just the token grid. The interaction of several Glaze
  tokens against each other (text on a chip, a hover background against its
  fill, a disabled label on a disabled chip) is where mismatches show up.

### 5. Trim what `extend()` doesn't need

After the migration, mark every default-only token (borders, shadows, glows,
the disabled chip, code highlighting, and so on) `inherit: false`. Colored
sibling themes created with `extend()` only need the accent and tinted-surface
chain; flagging the rest cuts the token set each theme emits dramatically.

## Upgrading Glaze

### 3.0 — shadows and glows

`shadow` was rebuilt so `intensity` produces the same visible change on every
surface, and `glow` was added as its mirror. Both emit a translucent pigment
whose opacity is solved, per surface and per scheme, so the composite lands an
exact **tone step** away from `bg`: darker for `shadow`, lighter for `glow`.
See [Shadows and glows](./shadows-and-glows.mdx).

What changed:

- **`intensity` is a tone step.** In 2.x it went through a `tanh` curve in
  OKHSL lightness, so the same number darkened white by 9 tones, a tone-35
  surface by 13.9, and a tone-6 surface by 4.4. Now `intensity: 10` is 10 tones
  on every surface with 10 tones of room. A step past black (or white, for a
  glow) is pinned to the strongest composite the pigment reaches, and Glaze
  warns; see [Unreachable steps](./shadows-and-glows.mdx#unreachable-steps).
- **`fg` is the object, not a contrast reference.** In 2.x, strength scaled
  with `|l_bg − l_fg|` and the docs pointed `fg` at `text`, which ran opposite
  to the physics: a white card on a light surface got almost no shadow. Now
  `fg` is the element casting the shadow; a darker object deepens it, a lighter
  one softens it, and an object at the surface's tone (or no `fg`) gives
  exactly `intensity`.
- **The pigment is neutral by default**: pure black for `shadow`, pure white
  for `glow`. The surface keeps its hue and the output is clean: `intensity: 10`
  on a white surface emits `rgb(0 0 0 / 0.1326)`, which composites to tone 90.
- **The `ShadowTuning` fields were replaced.** `saturationFactor`,
  `maxSaturation`, `lightnessFactor`, `lightnessBounds`, `minGapTarget`,
  `alphaMax`, and `bgHueBlend` are gone. The new knobs are `objectInfluence`,
  `tint`, `reach`, and `hueBleed`, shared by `shadowTuning` and the new
  `glowTuning`. The type is now `LightingTuning`; `ShadowTuning` and
  `GlowTuning` remain as aliases of it.
- **`GLAZE_EXPORT_VERSION` is 2.** A version-1 theme or palette snapshot that
  contains shadow colors or a `shadowTuning` now throws on restore instead of
  silently re-rendering every shadow.
- **`ColorDef` has a fourth member, `GlowColorDef`.** Exhaustive `switch`es
  over `def.type` need a `'glow'` branch.

How 2.x shadows map onto 3.0 (2.x steps measured with browser compositing):

| 2.x definition | 2.x step for `intensity: 10` | 3.0 equivalent |
| --- | --- | --- |
| No `fg`, light surface (tone 97–100) | ≈ 9 tones | `intensity: 9`, or keep `10` (a tone stronger) |
| No `fg`, mid surface (tone 50) | ≈ 13.6 tones | `intensity: 13.6`, or settle on one value for all surfaces |
| No `fg`, dark surface (tone 10) | ≈ 7.6 tones, and saturating | `intensity: 7.6`; dark shadows were weaker than authored and now aren't |
| `fg: 'text'` on a light surface | ≈ 7 tones | Drop `fg` and use `intensity: 7`, or point `fg` at the element and re-tune |
| `fg` = a near-white card on light | ≈ 0.3 tones (barely visible) | `fg: 'card'`, then pick `intensity` for the look you want |

Then:

1. Replace `fg: 'text'` (or any contrast-reference `fg`) with either no `fg` or
   the element that casts the shadow.
2. Pick `intensity` as the number of tones you want. For a ladder, `4` / `8` /
   `12` reads as evenly spaced on every surface with room for the deepest step.
   Check the dark schemes: a white `auto` page sits at about tone 9 in dark and
   at tone 0 in dark high contrast. Shadows on it deeper than about `8`–`9` (a
   saturated page has a little less room) pin to black and warn in dark, and
   every shadow on it stays transparent and warns in dark high contrast. Use
   glows for dark elevation, on a surface that also leaves them room in light
   ([Dark-mode elevation](./shadows-and-glows.mdx#dark-mode-elevation)). Leaving
   a shadow token out of the dark schemes hides the pinned result but not the
   warning: every color resolves in all four schemes.
3. Delete the old fields inside `tuning` / `shadowTuning` (`saturationFactor`,
   `alphaMax`, …); TypeScript flags them. A tinted pigment is
   `tuning: { tint: 0.3, reach: 0.85 }`. There is no opacity cap: lower
   `intensity` for a lighter overlay.
4. Replace hand-tuned translucent white mixes (dark-mode elevation, edge
   highlights, lightening state layers) with
   `{ type: 'glow', bg, intensity }`. Direction is fixed per type, so a
   `shadow` darkens and a `glow` lightens in light and dark alike. A glow on a
   white light-mode surface has nothing to lighten and warns.
5. Re-export snapshots. A 2.x snapshot with shadows or a `shadowTuning` throws
   on restore, so re-author it. In code, rebuild the theme with 3.0 shadow defs
   and call `export()`. In the JSON, fix the shadow defs, drop
   `config.shadowTuning`, and set `version` to `2` (a palette snapshot has one at
   the top and one per theme), then load it and export again. Snapshots without
   shadows load unchanged.

`glaze.shadow()` keeps its signature with the new semantics, and `glaze.glow()`
takes the same input. See
[`glaze.shadow()` / `glaze.glow()`](./reference/utilities.md#glazeshadowinput--glazeglowinput).

### 3.0 — even dark steps for tone deltas

In 2.x an `auto` tone delta's dark variant stepped from the base's light tone,
which already carries the light window's lift, so the lift landed in the dark
step: on a tone-50 base, `'+4'` came out −5.6 in dark and `'-4'` +1.3. In 3.0
it steps from the base's authored tone, so every dark step is the dark window's
scale times the delta (about 0.87× at the defaults: `'+4'` steps −3.5 and
`'-4'` +3.5) on every base, along chains of deltas, and for `from` colors. Dark
variants of `auto` tone-delta colors shift as a result — by up to about 4 tones
on the lowest bases, about 2 on a tone-50 base, a fraction of a tone on a light
surface — and so does anything solved, mixed, or lit from them in dark. Light
and high-contrast variants are unchanged, and `glaze.color()` tokens already
stepped this way. Re-check dark values you have pinned in tests or snapshots;
see [How relative tone adapts](./schemes.mdx#how-relative-tone-adapts).

### 3.0 — output options

Options an output method accepted but never read are gone from its type, so
TypeScript flags them. Delete them; the output doesn't change.

- `palette.json()` takes `GlazeJsonOptions` only: no `prefix`.
- `splitHue` is gone from `palette.tokens()`, `dtcg()`, `dtcgResolver()`, and
  `tailwind()` (it left `GlazePaletteExportOptions`), and from `token.token()` /
  `token.tasty()`.
- `theme.tasty()` takes the new `GlazeTastyOptions`, without `prefix`.
  `GlazeTokenOptions` is now just `format`, `modes`, and `states`, as taken by
  `token.token()` / `token.tasty()`.
- `palette.tasty()` and `palette.css()` take the new
  `GlazePaletteTastyOptions` / `GlazePaletteCssOptions`, without `name`: their
  hue vars are always named after each theme.

`splitHue` also stops failing silently. With a `format` other than `'oklch'`
it now throws instead of emitting inline colors, and a color that sets its own
hue under the theme hue var's name (a `brand` color with `name: 'brand'`, or a
color named after another theme in an unprefixed palette) throws instead of
rendering at the theme's hue. Hue values in its declarations are rounded to 2
decimals, so a `from` color emits `--logo-hue: 266.16` rather than
`266.15797905637027`. See
[`splitHue`](./reference/output.md#hue-channel-splitting-splithue).

### 2.0 — `format*` takes 0–1

The `format*` writers (`formatOkhsl`, `formatOkhst`, `formatRgb`, `formatHsl`,
`formatOklch`) used to take `s` / `l` / `t` on a 0–100 percentage scale, while
everything that _produces_ those values (`resolve()`, `variantToOkhsl`,
`srgbToOkhsl`, `oklabToOkhsl`, `okhslToSrgb`) returns them on 0–1. Composing
the two, which is the obvious thing to do, was off by 100x and failed
silently: `0.7` is a legal percentage, so you got a valid CSS string naming the
wrong (near-black) color.

The writers now take the 0–1 factors, so the whole library speaks one scale.
Drop the `* 100`:

```diff
- formatOkhsl(v.h, v.s * 100, l * 100);
+ formatOkhsl(v.h, v.s, l);

- formatOkhst(v.h, v.s * 100, v.t * 100);
+ formatOkhst(v.h, v.s, v.t);
```

Nothing else moves: `h` was always 0–360, `alpha` was always 0–1, and every
export method (`css()`, `tokens()`, `json()`, `tasty()`, `dtcg()`,
`tailwind()`, `glaze.format()`) emits the same colors, because they were
compensating internally. Dropping the redundant `×100 ÷100` round-trip shifts
float noise by an ULP, which shows up nowhere except the (meaningless) hue term
of a fully desaturated `hsl()` string. `toTone` / `fromTone` still speak the
0–100 tone axis the authoring API takes, so divide a tone from them by 100
before passing it to `formatOkhst`.

A leftover `* 100` is no longer silent: a value above 1 cannot be a factor, so
the writers `console.warn` once per writer, and you get an obviously broken
string such as `okhsl(280 7040.68% 5000%)` instead of a plausible wrong color.
See [format writers](./reference/utilities.md#format-writers).

### 0.14 — `lightness` became `tone`

Colors used to be authored on OKHSL lightness. They are now authored on
**tone**, a contrast-uniform 0–100 axis (see [Tone and OKHST](./okhst.mdx)):

- The `lightness` prop is gone everywhere (theme colors, `glaze.color()`
  structured input, tone deltas); use `tone`. Equal tone steps give equal
  WCAG contrast, so numeric values don't map to the same OKHSL lightness as
  before. Re-check absolute mid-range values.
- The config windows `lightLightness` / `darkLightness` became `lightTone` /
  `darkTone`, and `darkCurve` was removed.
- `ResolvedColorVariant` stores `{ h, s, t, alpha }` instead of `{ h, s, l }`.
  Use `variantToOkhsl()` to recover OKHSL lightness.
- Tone deltas that overshoot `[0, 100]` mirror to the other side of the base
  by default instead of clamping. Set `autoFlip: false` on the color
  (or globally) to clamp.

## Common pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| A disabled state stops looking disabled in dark mode. | An alpha-tinted overlay on `surface-text` (which inverts) gives asymmetric perceived contrast. | Replace it with an adaptive color anchored to `surface`: a tone delta for visual spacing, or a contrast floor when one is required. See [chips and disabled states](./methodology.mdx#chips-and-disabled-states). |
| A brand fill turns dark in dark mode and stops reading as the brand. | The default `mode: 'auto'` inverts the tone. | Set `mode: 'fixed'` so the tone is remapped into the dark window, not inverted. See [adaptation modes](./schemes.mdx#adaptation-modes). |
| Brand text washes out against the dark surface. | The foreground was anchored to `accent-surface` (the brand fill), so contrast was enforced only against that fill, not against the surface it sits on. | Anchor `accent-text` and friends to `surface` with `mode: 'auto'`. |
| Tokens look right in light but broken in high contrast. | High contrast bypasses the tone window, so absolute tones and deltas land on the full `[0, 100]` range (a white `auto` page is black in dark high contrast), and floors without an explicit high-contrast value rise a tier (`'AA'` → `'AAA'`, APCA +15 Lc). | Add explicit `[normal, highContrast]` pairs to `tone` / `contrast` for the affected tokens. |
| A tone delta like `'+48'` lands on the _wrong_ (darker) side of its base. | Overshooting tone deltas mirror to the other side of the base by default (a color's `autoFlip` defaults to the global `autoFlip`, which is on). | Set `autoFlip: false` on the color to clamp to the boundary instead, or use `tone: 'max'` / `'min'` to force the extreme. |
| `palette.tokens()` emits unexpected unprefixed names. | A `primary` was set on the palette (or per call) and duplicates that theme's tokens without a prefix. | Pass `primary: false` to disable it for that export, or change `glaze.palette(themes, { primary })`. See [the `primary` alias](./exporting.mdx#the-primary-alias). |
| `glaze: token "surface" from theme "danger" collides with theme "default" — skipping.` | Two themes resolved to the same output name under your prefix config. | Adjust the prefix map so each name is unique, or accept first-write-wins. See [Collisions](./exporting.mdx#collisions). |
| `glaze: formatOkhsl() got a value above 1 …` | Pre-2.0 percentage-scale input to a `format*` writer (a leftover `* 100`). | Pass the 0–1 factors the converters return; see [2.0 — `format*` takes 0–1](#20--format-takes-01). |
| `glaze: color "X" cannot meet WCAG … in light scheme (got …)` | The contrast target is physically unreachable for the color's hue and saturation against its base. The color pins to the extreme of the side it searched first, which may not be the closer one; see [When a floor can't be met](./contrast.mdx#when-a-floor-cant-be-met). | Lower the floor or change the base. If only the high-contrast schemes fail, give `contrast` an explicit, reachable high-contrast entry (`['AA', 'AA']`). On standalone colors, set `name` so the warning is identifiable; see [`name`](./reference/color-tokens.md#name). |
| `glaze: mix "X" cannot meet WCAG … against its base in light scheme (got …)` | Even the pure target doesn't reach the floor against the mix's `base`. The mix pins to the pure target, or to the pure base when its `value` is already 100; see [Contrast on mixes](./mixes.mdx#contrast-on-mixes). | Mix toward a target further from the base, or lower the floor. If only the high-contrast schemes fail, give `contrast` an explicit, reachable high-contrast entry. Keep `value` below 100 when you set a floor. |
| `glaze: shadow "X" cannot reach a 10.0-tone step …` (or `glow`) | The surface has fewer tones of room than `intensity` asks for: a glow on white, a deep shadow on near-black, or any shadow on a light `auto` page in dark high contrast (at or near tone 0 there). The overlay is pinned to its strongest composite (transparent when the surface is already at the pigment's extreme). | Lower `intensity` or give the overlay a surface with room in every scheme, and use glows for dark elevation. Otherwise expect the warning: every color resolves in all four schemes, so not using the token in a scheme doesn't silence it. See [Unreachable steps](./shadows-and-glows.mdx#unreachable-steps). |
| `glaze.themeFrom: this snapshot is export version 1 (Glaze 2) …` | A 2.x snapshot with shadow colors or `shadowTuning`; shadows changed meaning in 3.0. | Re-author the shadows and export again; see [3.0 — shadows and glows](#30--shadows-and-glows). |
