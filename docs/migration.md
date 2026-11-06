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
  `contrast: 'AAA'` (7:1) solves to tone 36, while a legacy `#1a1a1a` sits at
  tone 6.2 (17.4:1). An absolute `tone` preserves the look, but author it a
  little below the measured value: the light
  [tone window](./schemes.mdx#tone-windows) lifts authored tones (tone 0
  renders at 4.95, tone 2 at 6.85), so a neutral `tone: 1.3` renders
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
  OKHSL lightness, so the same number darkened white by 9 tones, a surface
  rendered at tone 35 by 13.9, and one rendered at tone 6 by 4.4. Now
  `intensity: 10` is 10 tones on every surface with 10 tones of room. A
  step past black (or white, for a glow) is pinned to the strongest composite
  the pigment reaches, and Glaze warns; see
  [Unreachable steps](./shadows-and-glows.mdx#unreachable-steps).
- **`fg` is the object, not a contrast reference.** In 2.x, strength scaled
  with `|l_bg − l_fg|` and the docs pointed `fg` at `text`, which ran opposite
  to the physics: a white card on a light surface got almost no shadow. Now
  `fg` is the element casting the shadow; a darker object deepens it, a lighter
  one softens it, and an object at the surface's tone (or no `fg`) gives
  exactly `intensity`.
- **The pigment is neutral by default**: pure black for `shadow`, pure white
  for `glow`. The surface keeps its hue and the output is clean: `intensity: 10`
  on a white surface emits `rgb(0 0 0 / 0.1326)`, which composites to tone 90.
- **The `ShadowTuning` fields were replaced.** `saturationFactor`,
  `maxSaturation`, `lightnessFactor`, `lightnessBounds`, `minGapTarget`,
  `alphaMax`, and `bgHueBlend` are gone. The new knobs are `objectInfluence`,
  `tint`, `reach`, and `hueBleed`, shared by `shadowTuning` and the new
  `glowTuning`. The type is now `LightingTuning`, and `ShadowTuning` is an
  alias of it. The new `GlowTuning` is its own interface: `LightingTuning`
  plus `headroom`, which a shadow's tuning rejects.
- **`GLAZE_EXPORT_VERSION` is 2.** A version-1 theme or palette snapshot that
  contains shadow colors or a `shadowTuning` now throws on restore instead of
  silently re-rendering every shadow.
- **`ColorDef` has a fourth member, `GlowColorDef`.** Exhaustive `switch`es
  over `def.type` need a `'glow'` branch.

How 2.x shadows map onto 3.0 (2.x steps measured with browser compositing;
tones are where the surface renders, so under the default light window a
`tone: 10` surface, rendered at 14.5, stepped 10.0):

| 2.x definition | 2.x step for `intensity: 10` | 3.0 equivalent |
| --- | --- | --- |
| No `fg`, light surface (tone 97–100) | ≈ 9 tones | `intensity: 9`, or keep `10` (a tone stronger) |
| No `fg`, mid surface (tone 50) | ≈ 13.6 tones | `intensity: 13.6`, or settle on one value for all surfaces |
| No `fg`, dark surface (tone 10) | ≈ 7.6 tones, and saturating | `intensity: 7.6`; dark shadows were weaker than authored and now aren't |
| `fg: 'text'` on a light surface | ≈ 5.5–8 tones, by the text's tone (7.8 for near-black text, 5.6 for `'AAA'` text on a tone-95 surface) | Drop `fg` and use the step your text gave (`intensity: 8` for near-black text), or point `fg` at the element and re-tune |
| `fg` = a near-white card on light | ≈ 0.3 tones (barely visible) | `fg: 'card'`, then pick `intensity` for the look you want |

Then:

1. Replace `fg: 'text'` (or any contrast-reference `fg`) with either no `fg` or
   the element that casts the shadow.
2. Pick `intensity` as the number of tones you want. For a ladder, `4` / `8` /
   `12` reads as evenly spaced on every surface with room for the deepest step.
   Check the dark schemes: a white `auto` page sits at tone 9.25 in dark and at
   tone 0 in dark high contrast. Shadows on it deeper than about `8`–`9` (a
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
   white light-mode surface has nothing to lighten and warns, unless it has
   HDR headroom (below).
5. Re-export snapshots. A 2.x snapshot with shadows or a `shadowTuning` throws
   on restore, so re-author it. In code, rebuild the theme with 3.0 shadow defs
   and call `export()`. In the JSON, fix the shadow defs, drop
   `config.shadowTuning`, and set `version` to `2` (a palette snapshot has one at
   the top and one per theme), then load it and export again. A snapshot
   without shadows passes the version check and restores, but it resolves with
   the other 3.0 changes on this page, and one that holds a value 3.0 rejects
   throws, on its first output or (for a token's color value) when restored
   (see [stricter input validation](#30--stricter-input-validation)).

`glaze.shadow()` keeps its signature with the new semantics, and `glaze.glow()`
takes the same input. See
[`glaze.shadow()` / `glaze.glow()`](./reference/utilities.md#glazeshadowinput--glazeglowinput).

HDR glows are new in 3.0 and opt-in, so they need no migration. A glow
variant gets an `hdr` value only with a `headroom` above 0
(`glowTuning.headroom`, or a glow's own `tuning.headroom`; the default is 0),
and exports carry it only with `modes.hdr` (default `false`), or for `css()`
its `hdr` option. At the defaults nothing changes. See
[HDR glows](./hdr.mdx) and
[HDR output](./exporting.mdx#hdr-output).

### 3.0 — even dark steps for tone deltas

In 2.x an `auto` tone delta's dark variant stepped from the base's light tone.
That tone carries the light window's lift, and on a contrast-solved base or a
mix it sits wherever light put it, so dark steps came out uneven: on a tone-50
base, `'+4'` stepped −5.6 in dark and `'-4'` +1.3, and in `glaze(280, 40)` a
`'-4'` hover on an `'AAA'` button stepped darker in dark as well (−5.5).

In 3.0 a dark delta steps from where its base sits on the authored scale: the
base's authored tone, or, for a `fixed` or `static` base, an `auto`
contrast-solved base, a mix, or an `auto` `'max'` / `'min'` on a base, the
base's own dark tone read back through the dark window. A dark delta then
lands where the same authored tone would, on every base, along chains of
deltas, and for `from` colors. At the default dark window that is about 0.87×
the delta: `'+4'` steps −3.5, `'-4'` +3.5, and the `'AAA'` hover above +3.5.
Under a custom dark `eps` the steps follow that window's curve instead of a
fixed scale. On a `fixed` or `static` base the `auto` dependent still inverts
on its own, mirrored around wherever the base sits. See
[How relative tone adapts](./schemes.mdx#how-relative-tone-adapts).

What moves:

- **Dark variants** of `auto` tone-delta colors, and anything solved, mixed,
  or lit from them in dark: at the default light window, by up to about
  4 tones on the lowest bases, about 2 on a tone-50 base, and a fraction of a
  tone on a light surface. Deltas on a contrast-solved, mixed, or extreme base
  move more (the `'AAA'` hover above moves 9 tones), and so do deltas on a
  base past the dark window or under a custom light window: the move grows
  with how far the window lifts the base, so `lightTone: [15, 100]` moves a
  tone-50 base's deltas about 4 tones and up to 8 at the bottom, and a `hi`
  below 100 moves a white surface's about 0.7 tones per tone it drops (about
  3.5 at `hi` 95). A custom light `eps` moves them too. A contrast-solved delta whose 2.x dark step
  crossed its base now lands on the side that mirrors light, which can move
  it most of the scale: in `glaze(0, 0)`,
  `{ base: 'fill', tone: '-1', contrast: 3 }` on a tone-50 fill goes from
  16.2 to 89.0 in dark.
- **`auto` deltas on a `fixed` or `static` base**, in dark and dark high
  contrast. 2.x reflected them across the whole scale, so how far one landed
  from its base depended on the base's tone. They now mirror around the base:
  in `glaze(280, 30)`, an `auto` `'+30'` label on a `fixed` tone-52 fill goes
  from 31.5 to 26.0 tones below it in dark (34 to 30 in dark high contrast),
  and a `'-4'` hover on `{ base: 'surface', tone: '-10', mode: 'fixed' }`
  over a tone-97 surface goes from 22.0 to 3.5 tones above it.
- **High-contrast variants**, only for deltas on contrast-solved, mixed,
  extreme, `fixed`, or `static` bases, or under a custom light `eps`: at the
  default dark `eps`, a high-contrast dark step is now exactly the delta,
  short of the limits below. `contrastLevel: 100` still equals the
  high-contrast tier.
- **`glaze.color()` links** whose base token has its own `darkTone`, is a
  value-form token with its own `lightTone`, or is contrast-solved or an
  `auto` `'max'` / `'min'` on a base. They now step like any other link in
  dark, and a `'+0'` link lands on its base there: in 2.x a `'+0'` link on an
  `'AAA'` token over `#f7f7fb` sat 8.95 tones below it in dark. Links on
  other `auto` bases already stepped this way; links on a `fixed` or `static`
  base move as described for those bases above.
- **Other light variants** only through a float-noise tie: a contrast-solved
  color whose preferred tone lands within 1e-9 tones of its base's (a `'+0'`
  / `'-0'` delta, or an absolute tone equal to the base's) takes the solver's
  own tie rule instead of a side picked by float noise, in every scheme, so
  it can land on the other side of its base. Under a manual `contrastLevel`,
  a level probe that lands on its base pins no side either.

Two limits apply. The flip is still decided on the light tone, so a step
that fits in light can run past 0 or 100 from the anchor and stop at the dark
window's edge. On an `auto` base placed by a tone that happens at the bottom,
where the light window lifts the light tone: `'-4'` on tone 2 steps about
+1.7 in dark, and on tone 0 it doesn't move. On a base anchored at its own
dark tone it can happen at either end, in high contrast too: in
`glaze(280, 40)`, a `'-4'` hover on `contrast: 12` text over a tone-97
surface steps +2.3 in dark, not +3.5. A base sitting past the dark window
(pushed there by a contrast floor or an extreme, or placed there as a
`fixed` or `static` color) is stepped from where it sits: a step back toward
the window moves the full scaled delta, and one pointing further out stops
at the base.
Re-check dark values you have pinned in tests or snapshots.

### 3.0 — other changes to resolved colors

These fixes move colors that 2.x resolved from the same input. Re-check values
you have pinned:

- **Contrast-solved colors.** The solver keeps its 1% (WCAG) / 0.5 Lc (APCA)
  margin and lands on the side it reports. Saturated hues that read darker
  than their gray tone (blues, violets, reds, oranges) land on their own
  crossing instead of stopping at the gray seed: an `'AA'` text at hue 280 and
  saturation 100 on a light gray surface goes from 5.03:1 to 4.55:1, 2.8 tones
  nearer its authored tone. A contrast-solved color with no tone of its own
  on a mid-tone base, where both sides meet the floor at the same distance,
  now keeps the side it searches first instead of a side picked by search
  noise. It starts toward the extreme that scores higher, and darker on a
  gray base at tone 50, so it can land on the other side of its base: in
  `glaze(0, 0)`, `{ base: 'b', contrast: 3 }` goes from 11.3 to 84.1 on a
  tone-45 base and from 93.6 to 20.8 on a tone-55 one. Apart from those side
  changes, most colors move less than half a tone, a few saturated ones up to
  about 5.
- **Standalone `glaze.color()` tokens** default to the `'text'` role; 2.x
  resolved a token without a `base` as a surface. `name` no longer drives role
  inference. An APCA floor on a token without `role` can land elsewhere:
  `glaze.color({ from: '#ffffff', contrast: { apca: 60 } })` now gives
  `rgb(141.23 141.23 141.23)`, not `rgb(151.87 151.87 151.87)`. Set
  `role: 'surface'` to keep a fill's 2.x polarity. WCAG floors don't change.
  A relative high-contrast tone on a token (`tone: [50, '+20']`) is measured
  from the token's own color; 2.x read `'+20'` as tone 20.
- **Value-form `glaze.color()` links on a structured base**
  (`glaze.color({ from, base })` with `base` made by
  `glaze.color({ hue, saturation, tone })`), in light, and in dark where the
  painted light tone changes which way `autoFlip` sends a step. 2.x read such
  a base at its raw input tone in light, not at the tone it renders, so the
  link measured against a color that is never painted: a `'+0'` link on
  `glaze.color({ hue: 280, saturation: 80, tone: 50 })` sat 2.5 tones below
  it, and an `'AA'` link measured 4.16:1 against it, with no warning. A
  `'+9.8'` link on a tone-90 structured base, which fit under 100 at the raw
  tone, now flips in light, and so lands elsewhere in dark too. Links now
  resolve against what the base paints in every scheme.
- **Transparent mixes with `contrast`** solve against browser compositing
  (`source-over` on gamma-encoded sRGB) instead of linear light. A white
  `'AA'` overlay on a surface rendered at tone 12
  (`{ tone: 12, mode: 'static' }`) goes from alpha 0.26, which rendered at
  2.3:1, to 0.48; a black overlay with a 1.2:1 floor on a tone-97 surface goes
  from 0.18 to 0.09.
- **`glaze(seed, config)`** applies the config. 2.x read the object form's
  override only from a third argument, so the documented two-argument call
  dropped it. `glaze(seed, undefined, config)` still works but is deprecated.

### 3.0 — stricter input validation

3.0 throws a `glaze:` error for input that 2.x resolved, usually into wrong or
`NaN` colors:

| Input | 2.x |
| --- | --- |
| A tone window with `lo > hi` (`lightTone: [90, 20]`) | Inverted the scale |
| A window endpoint that isn't a finite number (`NaN`, `Infinity`, `'10'`) | `NaN` colors, or a string read as a number |
| An object window whose `eps` is missing, not above 0, or above `1e6` | The default `eps` when missing; `NaN` colors at 0 or below and from about `1e15` |
| A window that isn't `[lo, hi]`, `{ lo, hi, eps }`, or `false` (`50`, `[10]`, `true`, `null`) | `NaN` colors; `configure()` ignored `null`, and a theme or token override with `null` threw a `TypeError` when it resolved |
| A `darkDesaturation` that isn't a finite number (`NaN`, `Infinity`, `'0.5'`, `true`) | `NaN` dark colors (`NaN`), fully gray ones (`Infinity`, `true`), or a string read as a number |
| A relative tone in the high-contrast entry of a root color (`tone: [50, '+20']`, no `base`) | Read `'+20'` as tone 20. Now throws: add a `base`, or write the tone you got (`[50, 20]`) |
| A hex color with a non-hex digit (`'#1z2z3z'`) in `glaze.color()`, `glaze.fromHex()`, a color's `from`, or the `bg` / `fg` of `glaze.shadow()` | Read only the first digit of each pair (`#010203`) |
| A color-function component that isn't a number (`'hsl(abc 50% 50%)'`, `'rgb(Infinity 0 0)'`) | `NaN` colors, or a silent gray |
| A value object with a negative `s`, `l`, `t`, or `c` (`{ l: 0.5, c: -0.05, h: 30 }`) | A plausible color: a negative chroma turned the hue around |
| A malformed `contrast`: a misspelled preset (`'aa'`, `{ apca: 'Body' }`), `NaN`, `{}`, both `wcag` and `apca`, or a pair without two entries | A `TypeError` from the warning code, or a color pinned to black or white; both keys used APCA, and a longer pair its first two entries |
| A color field that isn't a finite number (`tone: NaN`, `saturation: NaN`), a relative string that isn't `'+N'` / `'-N'` (`hue: 'abc'`, `tone: '+-5'`, `tone: '+5px'`), an `opacity` outside 0–1, or a non-finite mix `value` or shadow `intensity` | `NaN` colors, or an alpha outside 0–1; a trailing unit was read past (`'+5px'` as `'+5'`) |
| A theme seed whose hue or saturation isn't a finite number (`glaze({ hue: 280 })` without `saturation`, `glaze.fromRgb(NaN, 0, 0)`) | `NaN` colors |
| `null` for `contrastLevel` or `darkDesaturation` | Ignored: the current value stayed |

```text
glaze: lightTone lo (90) is above hi (20).
A window runs from its dark end to its light end: [lo, hi] with lo ≤ hi,
  e.g. [20, 90].

glaze: color "a" has relative "tone" without "base".

glaze: invalid hex color "#1z2z3z".

glaze: color "text" has an invalid "contrast" "aa". Use a WCAG ratio or
  'AA' / 'AAA' / 'AA-large' / 'AAA-large', { wcag: … }, { apca: … }, or a
  [normal, highContrast] pair of these.
```

`configure()` throws at the call and leaves the config as it was. A theme or
token override (`glaze(hue, saturation, config)`, `glaze.color(value, config)`,
`extend({ config })`) is checked when it resolves, so it throws on the first
output or `resolve()`, and so are a theme's colors. A theme or palette
snapshot that holds such a value still restores with `glaze.themeFrom()` /
`paletteFrom()` and throws on its first output, and so does a token snapshot
whose frozen config holds one. A token snapshot whose color value (its input,
or a raw `base`) 3.0 rejects throws in `glaze.colorFrom()` itself, as
`glaze.color()` does, and so does a theme snapshot whose seed does. Fix the
value in the JSON and export again.

The exported `parseHex()` / `parseHexAlpha()` return `null` for such hex, as
their type always allowed; 2.x read the first digit of each pair, and
`'#-1-2-3'` gave negative channels. Check for `null` before using the result.

Color strings also change in two ways that move colors instead of throwing. A
hue in `turn`, `rad`, or `grad` is converted (2.x read `hsl(0.5turn 50% 50%)`
as hue 0.5°, not 180°), and the CSS keyword `none` reads as 0. Out-of-range
color-function values clamp as CSS clamps them, which moves an `rgb()` channel
outside 0–255, an `okhsl()` / `okhst()` saturation outside 0–100%, a negative
`okhsl()` lightness (2.x gave `NaN` or a wrong tone), a negative `oklch()`
chroma (2.x turned its hue around), and an `oklch()` lightness below about
−0.37 (2.x emitted `NaN`). A saturation past 100% moves a token in dark, and
one outside 0–100% moves a theme color's `from` in every scheme: 2.x painted
its light variant out of gamut, which could turn the hue
(`'okhsl(200 -20% 50%)'` came out reddish), and colors solved, mixed, or lit
from it move with it. An `hsl()` or
`oklch()` lightness past its range already rendered clamped. A value object's
0–1 field between 1 and 1.5 clamps to 1 too, which moves a saturation there
the same way.

Two out-of-range values clamp instead, which can move output: window endpoints
clamp to 0–100 (2.x extended a `[-10, 120]` window past the range), and
`darkDesaturation` clamps to 0–1 (2.x let `-0.5` raise dark saturation). See
[Validation](./reference/configuration.md#validation).

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
rendering at the theme's hue, unless it is achromatic in light. In `css()`,
a color's value property that lands on a hue var (`suffix: '-hue'`, or
`suffix: ''` with a color named `*-hue`) throws the same way instead of
emitting a `var()` cycle. Hue values in its
declarations are rounded to 2 decimals, so a `from` color emits
`--logo-hue: 266.16` rather than `266.15797905637027`, and a color achromatic
in light no longer emits a dead `--*-hue` declaration in dark. See
[`splitHue`](./reference/output.md#hue-channel-splitting-splithue).

### 3.0 — contrast solver utilities

For code that calls the solver directly:

- `findValueForMixContrast()` no longer takes `targetLinearRgb`. It was
  required in 2.x but never read: `luminanceAtValue` describes the mix. Delete
  it from the options object; results don't change. TypeScript flags it as an
  excess property and suggests `baseLinearRgb`, but the fix is to delete it,
  not rename it.
- `findToneForContrast()` returns `branch: 'preferred'`, met, for a preferred
  tone that clears the floor but not the 1% / 0.5 Lc margin whenever the
  search can't improve on it: no searched side meets the floor, or the
  starting side's only position is the preferred tone (it sits on that side's
  bound). 2.x labelled it with the side it had searched, which could name a
  side of the base it doesn't sit on. A WCAG search that started away from it
  lost it to the far extreme: white at 7.24:1 against a tone-35 gray with a
  7.2:1 floor came back as black at 2.9:1, unmet. With no room to search
  (`toneRange`), it came back `met: false`.
- Results move with the solver fixes above. The WCAG gray seed is only the
  first probe, so the [`findToneForContrast`
  example](./reference/utilities.md#findtoneforcontrastoptions) now returns
  tone 0.4846 at 4.55:1, not 0.4759 at 4.67:1. With no `initialDirection`, a
  tie between the two ends' scores starts darker.

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
0–100 tone axis the authoring API takes, so divide a tone from them by 100
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
| Tokens look right in light but broken in high contrast. | High contrast bypasses the tone window, so absolute tones and deltas land on the full `[0, 100]` range (a white `auto` page is black in dark high contrast), and floors without an explicit high-contrast value rise a tier (`'AA'` → `'AAA'`, APCA +15 Lc). | Add explicit `[normal, highContrast]` pairs to `tone` / `contrast` for the affected tokens. |
| A tone delta like `'+48'` lands on the _wrong_ (darker) side of its base. | Overshooting tone deltas mirror to the other side of the base by default (a color's `autoFlip` defaults to the global `autoFlip`, which is on). | Set `autoFlip: false` on the color to clamp to the boundary instead, or use `tone: 'max'` / `'min'` to force the extreme. |
| `palette.tokens()` emits unexpected unprefixed names. | A `primary` was set on the palette (or per call) and duplicates that theme's tokens without a prefix. | Pass `primary: false` to disable it for that export, or change `glaze.palette(themes, { primary })`. See [the `primary` alias](./exporting.mdx#the-primary-alias). |
| `glaze: token "surface" from theme "danger" collides with theme "default" — skipping.` | Two themes resolved to the same output name under your prefix config. | Adjust the prefix map so each name is unique, or accept first-write-wins. See [Collisions](./exporting.mdx#collisions). |
| `glaze: formatOkhsl() got a value above 1 …` | Pre-2.0 percentage-scale input to a `format*` writer (a leftover `* 100`). | Pass the 0–1 factors the converters return; see [2.0 — `format*` takes 0–1](#20--format-takes-01). |
| `glaze: color "X" cannot meet WCAG … in light scheme (got …)` | The contrast target is physically unreachable for the color's hue and saturation against its base. The color pins to the extreme of the side it searched first, which may not be the closer one; see [When a floor can't be met](./contrast.mdx#when-a-floor-cant-be-met). | Lower the floor or change the base. If only the high-contrast schemes fail, give `contrast` an explicit, reachable high-contrast entry (`['AA', 'AA']`). On standalone colors, set `name` so the warning is identifiable; see [`name`](./reference/color-tokens.md#name). |
| `glaze: mix "X" cannot meet WCAG … against its base in light scheme (got …)` | Even the pure target doesn't reach the floor against the mix's `base`. The mix pins to the pure target, or to the pure base when its `value` is already 100; see [Contrast on mixes](./mixes.mdx#contrast-on-mixes). | Mix toward a target further from the base, or lower the floor. If only the high-contrast schemes fail, give `contrast` an explicit, reachable high-contrast entry. Keep `value` below 100 when you set a floor. |
| `glaze: shadow "X" cannot reach a 10.0-tone step …` (or `glow`) | The surface has fewer tones of room than `intensity` asks for: a glow on white, a deep shadow on near-black, or any shadow on a light `auto` page in dark high contrast (at or near tone 0 there). The overlay is pinned to its strongest composite (transparent when the surface is already at the pigment's extreme). | Lower `intensity` or give the overlay a surface with room in every scheme, and use glows for dark elevation. Otherwise expect the warning: every color resolves in all four schemes, so not using the token in a scheme doesn't silence it. A glow with `headroom` gets an HDR value past white instead and warns only when the cap leaves the step short (`… even with 1 stop of headroom (reached …)`): lower `intensity` or raise `headroom`. See [Unreachable steps](./shadows-and-glows.mdx#unreachable-steps). |
| `glaze.themeFrom: this snapshot is export version 1 (Glaze 1.1–2) …` | A 2.x snapshot with shadow colors or `shadowTuning`; shadows changed meaning in 3.0. | Re-author the shadows and export again; see [3.0 — shadows and glows](#30--shadows-and-glows). |
