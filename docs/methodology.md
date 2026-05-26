# Methodology

A practical guide for designing a real, production-grade Glaze palette. Recipe-ordered: the sections follow the same sequence you'd actually build a palette in, and each one ties the choice back to a Glaze behavior.

## The mental model

A Glaze palette is a **default neutral theme** plus a small fan of **colored sibling themes** (`success`, `danger`, `warning`, `note`, …) created via `extend()`. Most colors live in the default theme as neutrals; brand-tinted colors come from `extend()` swapping the hue.

The default theme is what most components consume — its tokens are emitted unprefixed (`#surface`, `#border`). Colored themes are scoped to status surfaces and accent variants, emitted with a theme-name prefix (`#success-surface`, `#danger-accent-surface`).

You design the default theme once, and `extend()` propagates that design across every status hue.

Every color definition has an **`inherit`** flag (default: `true`) controlling whether it flows into child themes via `extend()`. Set `inherit: false` to scope a color to its parent theme only — this is how sibling themes stay lean, carrying only the tokens they actually need.

## Hue / saturation seeds

Declare hues as named constants up top, plus a single shared seed saturation:

```ts
const PURPLE_HUE  = 280.3;
const SUCCESS_HUE = 156.9;
const DANGER_HUE  = 23.1;
const WARNING_HUE = 84.3;
const NOTE_HUE    = 302.3;

const SEED_SATURATION = 80;
```

Hues are design tokens too — keeping them named in one place beats burying numbers in `extend()` calls. The shared `SEED_SATURATION` keeps every status theme on the same saturation budget; per-color `saturation` factors below are 0–1 *of this seed*, not absolute.

## Global `glaze.configure()`

Configure state aliases and output modes once at module load:

```ts
glaze.configure({
  states: { dark: '@dark', highContrast: '@hc' },
  modes:  { dark: true,    highContrast: true },
});
```

Match the state alias names to whatever your app wires into the global predefined states (`@dark` / `@hc` is what Tasty expects). Setting `modes.highContrast: true` makes every export emit four variants — HC tokens are then available globally without per-call overrides.

## Naming conventions

A tight, predictable vocabulary that the rest of the doc relies on:

| Pattern | Tokens |
|---|---|
| Surface ladder | `surface`, `surface-2`, `surface-3` |
| Text on surface (decreasing prominence) | `<surface>-text`, `<surface>-text-soft`, `<surface>-text-soft-2` |
| Misc neutral primitives | `border`, `placeholder`, `focus`, `disabled` |
| Neutral disabled chip | `disabled-surface`, `disabled-surface-text` |
| Fixed-mode dark surface | `surface-inverse` |
| Brand fills | `accent-surface`, `accent-surface-2`, `accent-surface-3`, `accent-surface-hover` |
| Brand fill anchor | `accent-surface-text` (the fixed white token everything anchors to) |
| Brand foregrounds on neutrals | `accent-text`, `accent-text-soft`, `accent-icon` |
| Brand-tinted disabled | `accent-disabled-surface`, `accent-disabled-surface-text` |
| Code syntax highlighting | `code-comment`, `code-keyword`, `code-string`, `code-number`, … |
| Loading animation | `loading-face-1`, `loading-face-2`, `loading-face-3` |
| Shadows | `shadow-sm`, `shadow-md`, `shadow-lg` |
| Backdrop | `overlay` |

**Rule of thumb:** *purpose-name first, variant suffix last* (`-2`, `-text`, `-soft`, `-hover`, `-disabled`).

## Surfaces (root colors)

`surface` is a root color (absolute `lightness`, no `base`) with a low saturation factor. The ladder chains off it via small relative offsets:

```ts
defaultTheme.colors({
  surface:     { lightness: 100, saturation: 0.11 },
  'surface-2': { base: 'surface', lightness: '-2', saturation: 0.15, inherit: false },
  'surface-3': { base: 'surface', lightness: '-4', saturation: 0.19, inherit: false },
});
```

A factor of `0.11` of the seed gives a barely-noticeable hue shift — enough that light/dark surfaces feel branded, not enough to look tinted. The slight saturation bump on `-2` / `-3` compensates for perceived saturation dropping as lightness drops, so the ladder reads as one consistent surface family.

`mode: 'auto'` (the default) feeds these through Glaze's Möbius dark inversion, so an `L=100` light-mode surface lands near `L≈15` in dark mode with proportional deltas across the ladder preserved. `inherit: false` on `-2` / `-3` keeps colored sibling themes lean — they only need a single tinted `surface`, not the whole ladder.

## Text on surfaces (anchor at the edge)

The headline trick of the whole methodology. Strong text uses an **absolute `lightness` near the edge of the window**; soft variants use a **directional relative hint plus a numeric `contrast`**.

```ts
'surface-text': {
  base: 'surface', lightness: 2, saturation: 0.475,
},
'surface-text-soft': {
  base: 'surface', lightness: '-1', saturation: 0.375,
  contrast: [9, 11], inherit: false,
},
'surface-text-soft-2': {
  base: 'surface', lightness: '-1', saturation: 0.24,
  contrast: [4.5, 5.5], inherit: false,
},
```

Repeat the same triple anchored to each subordinate surface (`surface-2-text`, `surface-2-text-soft`, `surface-3-text`, …) so the ladder stays self-consistent.

The strong-text `lightness: 2` pins the light-mode resolved value to **L≈11.8** (mapped through the default `[10, 100]` window) and inverts to **L≈94** in dark mode (cr≈13.7 vs the dark surface). A `contrast: 'AAA'` solver pass would have stopped at L≈21 — meeting the AAA floor and no further. **Anchoring at the edge** beats the contrast solver because the solver only needs to *meet* the floor, not exceed it.

The soft variants use `lightness: '-1'` only as a *directional hint* — the real positioning comes from the numeric `contrast`. Numeric ratios give designers precise perceived weight where presets would only guarantee the AA/AAA floor.

In high-contrast mode the lightness window is bypassed entirely, so `lightness: 2` resolves to L=2 in light HC and L≈99 in dark HC (cr≈20.8 / 20.5).

## Other neutral primitives

Borders, placeholders, focus rings, and the floating "muted text" lightness — all default-only:

```ts
border:      { base: 'surface', lightness: ['-10', '-20'], saturation: 0.175,  inherit: false },
placeholder: { base: 'surface', lightness: 67,             saturation: 0.175,  inherit: false },
focus:       { base: 'surface', lightness: 71,             saturation: 0.8625, inherit: false },
disabled:    { lightness: 80.8, saturation: 0.4,                                inherit: false },
```

`border` uses an HC pair — the border darkens twice as much in high-contrast mode for visibility. `placeholder` and `focus` give a `base` for namespacing but use absolute lightness independently. `disabled` is a root color (no `base`) — it's used as a plain "muted text" token in some places, free of the surface chain.

## Disabled chip (contrast-driven for scheme symmetry)

The disabled chip + label pair uses `mode: 'auto'` and **explicit numeric contrast** against `surface`, not preset `'AA'` / `'AAA'`:

```ts
'disabled-surface': {
  base: 'surface', lightness: '-1', saturation: 0.2,
  contrast: [1.5, 2], inherit: false,
},
'disabled-surface-text': {
  base: 'disabled-surface', lightness: '+1', saturation: 0.3,
  contrast: 3, inherit: false,
},
```

Each token anchors to its immediate parent surface — `*-surface` contrasts against the root `surface`, while `*-surface-text` contrasts against its own chip (`disabled-surface`). This keeps the disabled state self-contained and resolves to consistent ratios in light, dark, and HC (chip ≈ 1.5–2× vs surface, label ≈ 3× on chip). An alpha-tinted overlay would have asymmetric behavior — composited alpha against a near-white light surface produces a much weaker chip than the same overlay against a near-dark dark surface, and the disabled state would stop *looking* disabled in one of the schemes.

The general rule: when a color needs to *feel the same across schemes*, anchor it with `mode: 'auto'` + a numeric contrast against a surface, not with a preset.

## `surface-inverse` (the fixed-mode escape hatch)

```ts
'surface-inverse': {
  lightness: 12, saturation: 0.475, mode: 'fixed', inherit: false,
},
```

`mode: 'fixed'` skips the dark-scheme Möbius inversion and only does a linear window mapping, so `surface-inverse` reads as a dark surface in *every* scheme — light, dark, and HC. In high-contrast variants the window is bypassed entirely (identity), so the color stays at its raw lightness across all four schemes.

Use it for tooltips, code blocks, popovers with their own dark theme. Pair with `#white` for foreground text.

This is the canonical "I want this color to stay recognizable" pattern. The other `mode: 'fixed'` use is the entire accent system below.

## Accent system (anchor pattern)

The load-bearing trick. Define a single fixed white anchor `accent-surface-text`, then derive every accent surface from it with a small relative lightness offset and a numeric contrast under `mode: 'fixed'`:

```ts
'accent-surface-text': { lightness: 100, mode: 'fixed' },

'accent-surface':       { base: 'accent-surface-text', lightness: '-1', contrast: [4.5, 7],   mode: 'fixed' },
'accent-surface-2':     { base: 'accent-surface-text', lightness: '-1', contrast: [4.8, 7.5], mode: 'fixed' },
'accent-surface-3':     { base: 'accent-surface-text', lightness: '-1', contrast: [5.2, 8],   mode: 'fixed' },
'accent-surface-hover': { base: 'accent-surface-text', lightness: '-1', contrast: [6,   8.5], mode: 'fixed' },
```

Three things make this work:

- **One anchor, one chain.** All accent surfaces stay in the same hue family because they all derive from `accent-surface-text`.
- **`mode: 'fixed'` keeps the brand recognizable.** Without it, the dark-scheme Möbius inversion would turn the brand fill into a lightness-inverted counterpart that may no longer read as the intended brand surface. Fixed maps lightness linearly into the dark window, so a `L=52` brand color resolves to ~L=51.6 in dark mode — still recognizably the same color.
- **Numeric contrasts, not presets.** `'AA'` / `'AAA'` would let the solver push the color far away from its anchor in dark schemes, breaking the relationship between `accent-surface` and its neighbors. Numeric ratios make the darkening between `accent-surface` (4.5/7), `-2` (4.8/7.5), `-3` (5.2/8), and `-hover` (6/8.5) a tight, designed sequence — a stepped gradient rather than four solver-generated outliers.

The hover variant is a dedicated *fixed* token. Reusing `accent-text` (which is `mode: 'auto'` and inverts direction in dark) would break the hover feel.

## Adaptive accent foregrounds

The opposite of the fills. Brand-colored *foregrounds* are anchored to **`surface`, not `accent-surface`**, with `mode: 'auto'` (default) and full saturation:

```ts
'accent-text':      { base: 'surface', lightness: '-1', saturation: 1,      contrast: [6.4, 10] },
'accent-text-soft': { base: 'surface', lightness: '-1', saturation: 1,      contrast: [4.5, 7]  },
'accent-icon':      { base: 'surface', lightness: '-1', saturation: 0.9375, contrast: [3.2, 5]  },
```

Foregrounds need to stay readable on the surface they actually sit on — anchoring to the brand fill would only enforce contrast against that fill, leaving the dark-mode color washed out against the actual surface (e.g. SECONDARY button labels sit on `surface`, not on the brand fill). Anchoring to `surface` + `mode: 'auto'` lets the solver lift the lightness in dark mode so the contrast floor holds in both schemes.

`accent-text-soft` shares the anchor and saturation but relaxes the contrast floor for a visibly less prominent secondary foreground (link base color, subdued labels). Critically, it stays `mode: 'auto'` — a fixed version would collapse to cr≈3 against the dark surface and break AA.

## Brand-tinted disabled

Mirrors the neutral disabled pair from above but with higher saturation so the chip reads as a *muted brand color* rather than fully neutral grey:

```ts
'accent-disabled-surface': {
  base: 'surface', lightness: '-1', saturation: 0.5,
  contrast: [1.4, 1.3],
},
'accent-disabled-surface-text': {
  base: 'accent-disabled-surface', lightness: '+1', saturation: 0.4,
  contrast: 1.51, mode: 'fixed',
},
```

The HC pair `[1.4, 1.3]` is intentionally *lower* in high-contrast mode — the tinted chip naturally gains more contrast against `surface` when the lightness window bypasses (identity mapping), so we loosen the constraint to leave room for stronger text-on-chip contrast. The text token uses `contrast: 1.51`, which is the maximum value that stays below Glaze's auto-flip threshold (the solver would otherwise invert the color past the midpoint, producing a result on the wrong side of its base). This keeps the label legible without flipping into an unexpected hue.

These are inherited (no `inherit: false`), so each colored sibling theme automatically emits `<theme>-accent-disabled-surface` and `<theme>-accent-disabled-surface-text`. PRIMARY-style disabled buttons stay tinted with the active theme's hue (danger-tinted danger button, success-tinted success button), preserving brand identity even in the disabled state.

## Per-color hue overrides (code highlighting)

The `code-*` tokens use **absolute `hue` numbers** regardless of the seed. Each is `base: 'surface'` with `mode: 'auto'`, a per-token saturation, and a numeric contrast floor:

```ts
'code-comment': { base: 'surface', hue: 280,        saturation: 0.1, lightness: '-1', contrast: [4.5, 7], inherit: false },
'code-keyword': { base: 'surface', hue: 348,        saturation: 1,   lightness: '-1', contrast: [5, 7.5], inherit: false },
'code-string':  { base: 'surface', hue: SUCCESS_HUE, saturation: 1, lightness: '-1', contrast: [4.5, 7], inherit: false },
// …code-punctuation, code-number, code-function, code-attribute follow the same shape
```

The canonical pattern for "I want a color from a different hue family but the same adaptive behavior". Absolute `hue` overrides the theme seed for a single color; everything else (contrast against `surface`, dark adaptation, HC tightening) still works. `inherit: false` because syntax highlighting is a default-only concern.

## Loading-animation faces

A 3-step ramp using *absolute* lightnesses with high saturation factors and tight numeric contrasts:

```ts
'loading-face-1': { base: 'surface', lightness: 98, saturation: 0.3,  contrast: [1.04, 1.5], inherit: false },
'loading-face-2': { base: 'surface', lightness: 91, saturation: 0.62, contrast: [1.24, 2.5], inherit: false },
'loading-face-3': { base: 'surface', lightness: 79, saturation: 0.66, contrast: [1.75, 4],   inherit: false },
```

Combines absolute lightness positioning (so the ramp is deterministic in light mode) with a numeric contrast floor (so the ramp still reads in dark and HC). The HC contrast jumps significantly (`1.04 → 1.5`, `1.24 → 2.5`, `1.75 → 4`) so the animation stays perceivable for low-vision users.

## Shadows

Three sizes, all sharing `bg: 'surface'` and `fg: 'surface-text'`, varying only `intensity`:

```ts
'shadow-sm': { type: 'shadow', bg: 'surface', fg: 'surface-text', intensity: 5,  inherit: false },
'shadow-md': { type: 'shadow', bg: 'surface', fg: 'surface-text', intensity: 10, inherit: false },
'shadow-lg': { type: 'shadow', bg: 'surface', fg: 'surface-text', intensity: 15, inherit: false },
```

Including `fg` matters: shadow strength scales with `|l_bg − l_fg|`, so anchoring `fg` to `surface-text` (which is anchored at the edge of the window) makes shadows *automatically deeper* in dark mode where the bg/fg gap is larger. All shadows are `inherit: false` — there's only one shadow system for the whole UI, and colored sibling themes don't carry their own.

For HC, pass `intensity: [normal, hc]` (e.g. `[10, 20]`) to deepen shadows in high-contrast mode. The full algorithm and tuning knobs are in [api.md → Shadows](api.md#shadows).

## Overlay (fixed opacity)

```ts
overlay: { lightness: 10, opacity: 0.5, inherit: false },
```

The shortcut for *one solid color with a fixed alpha* — no shadow algorithm, no mix. `opacity` on a regular color attaches an alpha component to every variant. Use it for backdrops, scrims, modal overlays. (Combining `opacity` with `contrast` is not recommended — perceived lightness becomes unpredictable when alpha is fixed; Glaze emits a `console.warn`.)

## Mixes for hover / tint

Reach for mix tokens when you want one color to "tint through" another:

```ts
hover: {
  type: 'mix', base: 'surface', target: 'accent-surface',
  value: 8, blend: 'transparent',
},
// hover → accent-surface with alpha = 0.08

tint: {
  type: 'mix', base: 'surface', target: 'accent-surface',
  value: 20,
},
```

- **Transparent mix** — *the target color with controlled alpha*. Useful for hover overlays.
- **Opaque mix** — solid blend of two colors. Good for subtle tints.

Choose `space: 'okhsl'` (default) for design tokens — perceptually uniform, consistent with the rest of Glaze. Choose `space: 'srgb'` to match what the browser would render with a plain CSS overlay. Mix colors support the same `contrast` prop as regular colors; the solver adjusts the mix ratio (opaque) or opacity (transparent) to meet the target.

## Colored sibling themes via `extend()`

One shared `TINTED_SURFACE_OVERRIDE`, applied to every colored theme, with only the `hue` changing per status:

```ts
const TINTED_SURFACE_OVERRIDE: ColorMap = {
  surface: { lightness: 96, saturation: 0.8 },
};

const primaryTheme = defaultTheme.extend({                       colors: TINTED_SURFACE_OVERRIDE });
const successTheme = defaultTheme.extend({ hue: SUCCESS_HUE,     colors: TINTED_SURFACE_OVERRIDE });
const dangerTheme  = defaultTheme.extend({ hue: DANGER_HUE,      colors: TINTED_SURFACE_OVERRIDE });
const warningTheme = defaultTheme.extend({ hue: WARNING_HUE,     colors: TINTED_SURFACE_OVERRIDE });
const noteTheme    = defaultTheme.extend({ hue: NOTE_HUE,        colors: TINTED_SURFACE_OVERRIDE });
```

Colored themes need a visibly tinted surface for status banners — saturation jumps from the neutral `0.11` (default theme) to `0.8`. The `inherit: false` discipline pays off here: because most neutrals (`surface-2`, `surface-3`, `border`, `placeholder`, `disabled-*`, `code-*`, `loading-*`, `shadow-*`) are flagged default-only, each colored theme inherits *only* the accent + tinted surface chain and emits a small, focused token set.

`primaryTheme` keeps the default hue but gets the tinted surface — useful for places that want a brand-tinted banner without semantic status meaning.

## Palette composition

Compose all themes into a palette so they can be exported as one token set:

```ts
const palette = glaze.palette({
  default: defaultTheme,
  primary: primaryTheme,
  success: successTheme,
  danger:  dangerTheme,
  warning: warningTheme,
  note:    noteTheme,
});
```

The default theme is conventionally exported unprefixed (its tokens land as `#surface`, `#border`); colored themes are prefixed with their name. See [migration.md](migration.md) for the prefix map shape, alias patterns, and how to wire the resulting tokens into Tasty / CSS / framework-agnostic JSON.

## High-contrast strategy

Glaze's high-contrast mode is opt-in per token: anywhere `lightness`, `contrast`, `intensity`, or `value` accepts an HC pair, you can pass `[normal, hc]` to tighten the HC variant. The heuristic is to pair anything that's already contrast-driven:

- Text-against-surface contrasts (`[9, 11]`, `[4.5, 5.5]`, `[6.4, 10]`).
- The accent surface ladder (`[4.5, 7]` → `[5.2, 8]` → `[6, 8.5]`).
- The loading ramp's contrasts.
- Shadow `intensity` (e.g. `intensity: [10, 20]`).
- `border` lightness (e.g. `lightness: ['-10', '-20']`).

In HC the lightness window is **bypassed entirely** — light HC and dark HC operate on the full `[0, 100]` range. That's why edge-anchored absolute lightnesses like `surface-text: { lightness: 2 }` blow out to L=2 in light HC and L≈99 in dark HC, exactly what you want for maximum contrast.

## Closing checklist

Before shipping a palette, verify:

- [ ] Every text token has an explicit `contrast` *or* an edge-anchored absolute `lightness`.
- [ ] Every accent surface uses `mode: 'fixed'` + numeric `contrast` (not preset `'AA'` / `'AAA'`).
- [ ] Every brand foreground (`accent-text*`, `accent-icon`) is anchored to `surface`, **not** to `accent-surface`.
- [ ] Every `inherit: false` is intentional — colored sibling themes only carry the tokens they actually need.
- [ ] HC pairs are present on every contrast-driven token, not just the strong ones.
- [ ] Shadow `fg` is set when you want shadows to deepen in dark mode.
- [ ] `glaze.configure({ states, modes })` matches the global predefined states wired in your app's root.
