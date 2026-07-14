# Methodology

A practical way to design a Glaze palette without fighting dark mode. Start from
tone relationships, add contrast only where a role needs a readable floor, and
let `extend()` carry the same decisions across status hues.

For the full API surface, see [api.md](api.md). For the Glaze color-model
overview, see [okhst.md](okhst.md); the derivation lives in the
[canonical OKHST specification](https://github.com/tenphi/okhst).

## The mental model

Glaze palettes work best as one default neutral theme plus a few colored sibling
themes:

- `default` owns the neutral system most components consume: `#surface`,
  `#surface-text`, `#border`, `#disabled-surface`, and so on.
- Status themes (`success`, `danger`, `warning`, `note`, ...) are created with
  `extend()`. They swap the hue and keep only the inherited tokens that should
  become status-aware.
- `inherit: false` keeps a token local to the parent theme. Use it for neutral
  ladders, shadows, code colors, overlays, and anything that should not be
  repeated for every status hue.

The main simplification is OKHST tone. Dark mode is a single inversion
(`100 - t`) plus a scheme tone window, so a relative **tone delta** stays
anchored to its base in every scheme. A token authored as `tone: '-4'` remains
the same kind of visual step in light and dark. The step is exactly
contrast-even for neutrals and approximate for chromatic colors; add a
`contrast` floor when the measured result matters.

Use `glaze.color()` instead of a theme when you need one standalone color or
one base/dependent pair and do not need a named palette. The same tone,
adaptation, and contrast rules apply; see
[Standalone color tokens](api.md#standalone-color-tokens).

## Implementation workflow

Build in dependency order so every decision has a clear base:

1. Configure the output schemes and application states once.
2. Choose the default theme's hue and saturation seed.
3. Define root surfaces with absolute tones.
4. Add dependent surfaces, text, borders, and icons with tone deltas.
5. Add contrast floors only to roles that need measured readability or
   recognizability.
6. Choose adaptation per color: `auto`, `fixed`, or `static`.
7. Add explicit HC pairs where high contrast should increase separation.
8. Mark default-only tokens `inherit: false`, then extend the shared
   definitions into status themes.
9. Compose and export the palette in the shape your application consumes.
10. Verify complete screens in all emitted scheme variants.

The sections below follow this order and build one palette incrementally.

## Authoring decisions

Use this order when defining a token:

1. Pick the base it visually belongs to.
2. Use an absolute numeric `tone` for independent placement. Use a signed
   **tone delta** (`'+N'` / `'-N'`) for distance from a base: surface ladders,
   soft chips, disabled states, hover ramps, and similar relationships.
3. Add `contrast` only when readability or recognizability needs a measured
   floor.
4. Prefer APCA presets for content-like colors when perceptual readability is
   the design goal:
   `contrast: { apca: 'content' }` or
   `contrast: { apca: ['content', 'body'] }`.
5. Use WCAG numbers or presets when compatibility, policy, or migration
   requires a WCAG ratio:
   `contrast: 4.5`, `contrast: 'AAA'`, or `contrast: { wcag: [4.5, 7] }`.
6. Let token names infer APCA roles. Names ending in `text`, `label`, `border`,
   `surface`, `fill`, `bg`, and similar aliases already tell Glaze which side is
   foreground or background. Set `role` only when a name is ambiguous.
7. Add high-contrast pairs only where HC should intentionally tighten:
   text/content contrast, border tone, shadow intensity, mix value, or similar.

### Choosing adaptation mode

| Mode             | Choose it when                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | The color should exchange light/dark positions through dark tone inversion. Typical for surfaces, text, borders, and icons. |
| `fixed`          | A brand fill, status banner, or inverse surface should stay on the authored side of the tone scale.                         |
| `static`         | The exact authored tone and saturation must render in every scheme, without tone-window mapping or dark desaturation.       |

Dark tone inversion is controlled by `mode`; it is unrelated to `autoFlip`.
`autoFlip` only allows an overshooting tone delta or an unsuccessful contrast
direction to reverse around its base.

### Root or dependent?

- Use a root color when its tone has meaning on its own: the page surface, a
  fixed brand anchor, or a scheme extreme.
- Use a dependent color when its purpose exists relative to another token:
  text on a surface, a border around a fill, or a tint of an accent.
- Setting `base` with an absolute tone is valid when the color needs a contrast
  relationship but not a tone delta. The absolute position is resolved
  independently; `contrast` acts as a safety floor.

## Seed and configure

Keep hue decisions named and configure output modes once:

```ts
import { glaze } from '@tenphi/glaze';

const PURPLE_HUE = 280.3;
const SUCCESS_HUE = 156.9;
const DANGER_HUE = 23.1;
const WARNING_HUE = 84.3;
const NOTE_HUE = 302.3;

const SEED_SATURATION = 80;

glaze.configure({
  states: { dark: '@dark', highContrast: '@hc' },
  modes: { dark: true, highContrast: true },
});
```

Per-color `saturation` is a factor of the theme seed, not an absolute
saturation. With `SEED_SATURATION = 80`, `saturation: 0.25` means one quarter of
that seed.

## Naming

Prefer purpose first and variant last:

- Surfaces: `surface`, `surface-2`, `surface-3`.
- Foregrounds: `surface-text`, `surface-text-soft`, `surface-text-soft-2`.
- Structure: `border`, `divider`, `outline`, `placeholder`, `focus`.
- Fills: `accent-surface`, `accent-surface-2`,
  `accent-surface-hover`.
- Foregrounds on neutral surfaces: `accent-text`, `accent-text-soft`,
  `accent-icon`.
- Disabled states: `disabled-surface`, `disabled-surface-text`,
  `accent-disabled-surface`, `accent-disabled-surface-text`.
- Effects: `shadow-sm`, `shadow-md`, `shadow-lg`, `overlay`, `hover`, `tint`.

These names are not only readable. They also help APCA role inference pick the
right polarity. For example, `button-text` is foreground, `input-bg` is a
surface, and `card-outline` is a border.

## Build the default theme

Start with the surface family. It is mostly tone, with small saturation changes
to keep the ladder visually coherent:

```ts
const defaultTheme = glaze(PURPLE_HUE, SEED_SATURATION);

defaultTheme.colors({
  surface: { tone: 100, saturation: 0.11 },
  'surface-2': {
    base: 'surface',
    tone: '-2',
    saturation: 0.15,
    inherit: false,
  },
  'surface-3': {
    base: 'surface',
    tone: '-4',
    saturation: 0.19,
    inherit: false,
  },
});
```

Because each tone delta re-anchors to the resolved surface in every scheme,
these small relative offsets are enough to define the ladder. There is no
separate dark-mode curve to tune.

### Text and borders

Use a hard edge tone for maximum-prominence text, and APCA floors for softer
content:

```ts
defaultTheme.colors({
  'surface-text': {
    base: 'surface',
    tone: 2,
    saturation: 0.475,
  },
  'surface-text-soft': {
    base: 'surface',
    tone: '-1',
    saturation: 0.375,
    contrast: { apca: ['content', 'body'] },
    inherit: false,
  },
  'surface-text-soft-2': {
    base: 'surface',
    tone: '-1',
    saturation: 0.24,
    contrast: { apca: ['large', 'content'] },
    inherit: false,
  },
  border: {
    base: 'surface',
    tone: ['-10', '-20'],
    saturation: 0.175,
    inherit: false,
  },
});
```

`surface-text` uses an absolute `tone: 2` despite having a base: it is
intentionally edge-anchored, and the base records the relationship used by
role inference. The soft variants use a `-1` tone delta as the preferred
direction and APCA as the readable floor. `border` uses an HC tone-delta pair
because borders usually need a larger visible step in high contrast.

Repeat the same pattern for `surface-2` and `surface-3` only if components need
text directly on those surfaces.

### Neutral utility tokens

Keep neutral-only primitives local to the default theme:

```ts
defaultTheme.colors({
  placeholder: {
    base: 'surface',
    tone: 67,
    saturation: 0.175,
    inherit: false,
  },
  focus: {
    base: 'surface',
    tone: 71,
    saturation: 0.8625,
    inherit: false,
  },
  disabled: {
    tone: 80.8,
    saturation: 0.4,
    inherit: false,
  },
});
```

Absolute tones are fine for primitives whose job is visual placement rather than
a strict relationship to a specific surface.

## Chips and disabled states

For subtle fills, tone is usually clearer than contrast:

```ts
defaultTheme.colors({
  'disabled-surface': {
    base: 'surface',
    tone: '-3',
    saturation: 0.2,
    inherit: false,
  },
  'disabled-surface-text': {
    base: 'disabled-surface',
    tone: '+18',
    saturation: 0.3,
    autoFlip: false,
    inherit: false,
  },
});
```

This says exactly what the pair should do: the chip sits a small tone delta off
the page, and the label sits a muted delta from the chip. `autoFlip: false`
keeps the label on the authored side when the delta reaches the edge.

Use contrast instead when the chip must hit an explicit accessibility floor:

```ts
defaultTheme.colors({
  'disabled-surface-text': {
    base: 'disabled-surface',
    tone: '+1',
    saturation: 0.3,
    contrast: { apca: 'non-text' },
    inherit: false,
  },
});
```

When a token needs the scheme extreme, use `tone: 'min'` or `tone: 'max'`
directly. Avoid large magic numbers or fake contrast floors just to push a color
to the edge.

## Fixed surfaces and accent fills

Use `mode: 'fixed'` when the authored color should stay recognizable across
schemes.

```ts
defaultTheme.colors({
  'surface-inverse': {
    tone: 12,
    saturation: 0.475,
    mode: 'fixed',
    inherit: false,
  },

  'accent-surface-text': {
    tone: 100,
    mode: 'fixed',
  },
  'accent-surface': {
    base: 'accent-surface-text',
    tone: '-1',
    contrast: { apca: ['content', 'body'] },
    mode: 'fixed',
  },
  'accent-surface-2': {
    base: 'accent-surface-text',
    tone: '-1',
    contrast: { apca: [65, 80] },
    mode: 'fixed',
  },
  'accent-surface-hover': {
    base: 'accent-surface-text',
    tone: '-1',
    contrast: { apca: ['body', 'preferred'] },
    mode: 'fixed',
  },
});
```

The accent fill family is a fixed chain against a fixed text anchor. The names
infer `surface` and `text` roles, so APCA gets the right polarity without extra
fields.

## Adaptive accent foregrounds

Brand foregrounds that sit on neutral surfaces should stay adaptive:

```ts
defaultTheme.colors({
  'accent-text': {
    base: 'surface',
    tone: '-1',
    saturation: 1,
    contrast: { apca: ['content', 'body'] },
  },
  'accent-text-soft': {
    base: 'surface',
    tone: '-1',
    saturation: 1,
    contrast: { apca: ['large', 'content'] },
  },
  'accent-icon': {
    base: 'surface',
    tone: '-1',
    saturation: 0.9375,
    contrast: { apca: ['non-text', 'large'] },
  },
});
```

Anchor these to `surface`, not to `accent-surface`. Their real job is to remain
readable on neutral UI, so `mode: 'auto'` and a surface base are the right
defaults.

Brand-tinted disabled states can usually be pure tone:

```ts
defaultTheme.colors({
  'accent-disabled-surface': {
    base: 'surface',
    tone: '+3',
    saturation: 0.5,
  },
  'accent-disabled-surface-text': {
    base: 'accent-disabled-surface',
    tone: '+18',
    saturation: 0.4,
    autoFlip: false,
  },
});
```

These are inherited, so status themes automatically get
`success-accent-disabled-surface`, `danger-accent-disabled-surface`, and the
matching text tokens.

## Special-purpose colors

Use absolute `hue` overrides for tokens that should come from another hue family
but keep the same adaptation behavior:

```ts
defaultTheme.colors({
  'code-comment': {
    base: 'surface',
    hue: 280,
    saturation: 0.1,
    tone: '-1',
    contrast: { apca: ['large', 'content'] },
    inherit: false,
  },
  'code-keyword': {
    base: 'surface',
    hue: 348,
    saturation: 1,
    tone: '-1',
    contrast: { apca: ['content', 'body'] },
    inherit: false,
  },
  'code-string': {
    base: 'surface',
    hue: SUCCESS_HUE,
    saturation: 1,
    tone: '-1',
    contrast: { apca: ['large', 'content'] },
    inherit: false,
  },
});
```

Use small tone ramps for decorative motion:

```ts
defaultTheme.colors({
  'loading-face-1': {
    base: 'surface',
    tone: 98,
    saturation: 0.3,
    inherit: false,
  },
  'loading-face-2': {
    base: 'surface',
    tone: 91,
    saturation: 0.62,
    inherit: false,
  },
  'loading-face-3': {
    base: 'surface',
    tone: 79,
    saturation: 0.66,
    inherit: false,
  },
});
```

Since tone steps now invert consistently across schemes, the same ramp keeps its
spacing in light and dark without involving the contrast solver. Use an HC tone
pair only when the animation should become more pronounced in high contrast.

## Effects

Define one neutral shadow system:

```ts
defaultTheme.colors({
  'shadow-sm': {
    type: 'shadow',
    bg: 'surface',
    fg: 'surface-text',
    intensity: 5,
    inherit: false,
  },
  'shadow-md': {
    type: 'shadow',
    bg: 'surface',
    fg: 'surface-text',
    intensity: [10, 20],
    inherit: false,
  },
  'shadow-lg': {
    type: 'shadow',
    bg: 'surface',
    fg: 'surface-text',
    intensity: [15, 30],
    inherit: false,
  },
});
```

Including `fg` lets shadow strength follow the resolved foreground/background
gap. Use an HC pair for shadows that should deepen in high contrast.

Use `opacity` for one fixed-alpha color:

```ts
defaultTheme.colors({
  overlay: { tone: 10, opacity: 0.5, inherit: false },
});
```

Use mixes when one color should tint through another:

```ts
defaultTheme.colors({
  hover: {
    type: 'mix',
    base: 'surface',
    target: 'accent-surface',
    value: 8,
    blend: 'transparent',
  },
  tint: {
    type: 'mix',
    base: 'surface',
    target: 'accent-surface',
    value: 20,
  },
});
```

Transparent mixes are good for hover overlays. Opaque mixes are good for solid
tints. Opaque mixes default to perceptual OKHSL interpolation; choose `srgb`
when matching channel compositing matters. Transparent mixes always composite
in linear sRGB. Mix colors can also use `contrast`; the solver adjusts the
value or opacity to hit the floor. See [Mix colors](api.md#mix-colors).

## Extend into status themes

Once the default theme is shaped, create colored siblings by replacing hue and
overriding only the root surface that should become visibly tinted:

```ts
const TINTED_SURFACE_OVERRIDE = {
  surface: { tone: 96, saturation: 0.8 },
};

const primaryTheme = defaultTheme.extend({
  colors: TINTED_SURFACE_OVERRIDE,
});
const successTheme = defaultTheme.extend({
  hue: SUCCESS_HUE,
  colors: TINTED_SURFACE_OVERRIDE,
});
const dangerTheme = defaultTheme.extend({
  hue: DANGER_HUE,
  colors: TINTED_SURFACE_OVERRIDE,
});
const warningTheme = defaultTheme.extend({
  hue: WARNING_HUE,
  colors: TINTED_SURFACE_OVERRIDE,
});
const noteTheme = defaultTheme.extend({
  hue: NOTE_HUE,
  colors: TINTED_SURFACE_OVERRIDE,
});
```

The inherited accent and disabled tokens now resolve in each status hue. Tokens
marked `inherit: false` stay default-only, so sibling themes remain small.

## Export the palette

Compose the themes once:

```ts
const palette = glaze.palette({
  default: defaultTheme,
  primary: primaryTheme,
  success: successTheme,
  danger: dangerTheme,
  warning: warningTheme,
  note: noteTheme,
});
```

The usual export shape is default unprefixed and status themes prefixed:

```ts
const prefix = {
  default: '',
  primary: 'primary-',
  success: 'success-',
  danger: 'danger-',
  warning: 'warning-',
  note: 'note-',
};

palette.tasty({ prefix });
```

An explicit prefix map is the clearest choice when the palette has a neutral
`default` theme. The separate palette `primary` option serves another pattern:
it duplicates one named theme without a prefix while retaining its prefixed
tokens. Do not combine the two accidentally; choose the token namespace your
components expect.

The palette design is independent of the exporter:

```ts
palette.tokens({ prefix }); // JavaScript maps, native oklch by default
palette.css({ prefix }); // CSS custom-property declarations
palette.dtcg({ prefix }); // one design-token tree per scheme
palette.tailwind({ prefix }); // Tailwind CSS v4 theme
```

Use `palette.tasty({ prefix })` for [Tasty](https://tasty.style) state bindings. See
[migration.md](migration.md#choosing-an-export) for output shapes, application
wiring, and the `primary` alias pattern.

## High contrast

High contrast is not a separate palette. Any value that accepts an HC pair can
tighten the HC variant: `tone`, `contrast`, shadow `intensity`, and mix `value`.

Use HC pairs where users should actually get more separation:

- Text/content contrast: `{ apca: ['content', 'body'] }`.
- Accent fills: `{ apca: ['content', 'body'] }` or stronger.
- Borders: `tone: ['-10', '-20']`.
- Shadows: `intensity: [10, 20]`.
- Decorative ramps that must stay perceivable.

In HC variants, Glaze bypasses the normal tone window and uses the full
`[0, 100]` range. Edge tones can reach the edge; contrast floors have more room
to solve.

## Checklist

Before shipping a palette, verify:

- Text, icon, and content tokens either have APCA/WCAG contrast or are
  deliberately edge-anchored.
- Accent fills use `mode: 'fixed'`; accent foregrounds on neutral UI stay
  `mode: 'auto'` and are based on `surface`.
- Ambiguous APCA tokens have an explicit `role`; obvious names rely on inference.
- Low-stakes visual relationships use tone deltas instead of fake contrast
  floors.
- `inherit: false` is set on default-only tokens so status themes stay focused.
- HC pairs exist where high contrast should visibly tighten.
- `glaze.configure({ states, modes })` matches the states registered in the app.
- Every emitted scheme (`light`, `dark`, `lightContrast`, `darkContrast`) has
  been reviewed on complete screens, not only in a token grid.
- Rendered WCAG/APCA results have been checked for chromatic foreground/base
  pairs that carry accessibility requirements.
- Resolution emits no unexplained unreachable-contrast or token-collision
  warnings.
