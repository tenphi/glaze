---
title: Color definitions
description: The ColorDef union and every field of regular, shadow, glow, and mix colors.
---

`theme.colors(defs)` takes a `ColorMap`: color names mapped to definitions. This page lists every definition shape and field. For why the fields behave as they do, follow the links to the concept pages: [Tone and OKHST](../okhst.mdx), [Light, dark, and high contrast](../schemes.mdx), [Contrast solving](../contrast.mdx), [Shadows and glows](../shadows-and-glows.mdx), and [Mixes and transparency](../mixes.mdx).

```ts
import type {
  ColorDef,
  ColorMap,
  RegularColorDef,
  ShadowColorDef,
  GlowColorDef,
  MixColorDef,
} from '@tenphi/glaze';
```

## `ColorDef`

```ts
type ColorDef =
  | RegularColorDef
  | ShadowColorDef
  | GlowColorDef
  | MixColorDef;
type ColorMap = Record<string, ColorDef>;
```

The `type` field picks the shape:

| `type` | Shape | Produces | References |
| --- | --- | --- | --- |
| omitted | [`RegularColorDef`](#regularcolordef) | An opaque color, or a fixed `opacity` | `base` |
| `'shadow'` | [`ShadowColorDef`](#shadowcolordef--glowcolordef) | A translucent dark overlay | `bg`, `fg` |
| `'glow'` | [`GlowColorDef`](#shadowcolordef--glowcolordef) | A translucent light overlay | `bg`, `fg` |
| `'mix'` | [`MixColorDef`](#mixcolordef) | A blend of two colors, opaque or translucent | `base`, `target` |

Rules shared by all four:

- A reference names another color in the **same theme**. A missing name, or a cycle through `base` / `bg` / `fg` / `target`, throws when the theme first resolves.
- Shadows and glows are leaves: no color can reference one, and they can't reference each other.
- Colors resolve in dependency order, so you can define them in any order.
- Every shape accepts [`pastel`](#per-color-pastel) and [`inherit`](#inherit).

Every validation rule and its error is listed in [Validation](./configuration.md#validation), and every warning in [Warnings](./configuration.md#warnings).

## `RegularColorDef`

A color placed by tone, either on its own (a **root**) or relative to another color (a **dependent**).

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | `GlazeColorValue` | — | Seed the color from a literal value. Supplies the hue, the tone, and an **absolute** saturation. See [`from`](#from). |
| `tone` | `HCPair<ToneValue>` | `from`'s tone, else the base's tone | Number: absolute tone 0–100. `'+N'` / `'-N'`: a tone delta from `base` (requires `base`). `'max'` / `'min'`: the scheme's tone extreme. See [Tone values](#tone-values). |
| `saturation` | `number` | `1` | Factor (0–1) of the theme's saturation seed. Clamped to 0–1. With `from`, it replaces the color's absolute saturation and is still a factor of the seed. |
| `hue` | `number \| RelativeValue` | The seed hue (or `from`'s hue) | Number: absolute hue 0–360. `'+N'` / `'-N'`: relative to the theme seed hue, never to a base. See [Hue and saturation](#hue-and-saturation). |
| `darkHue` | `number \| RelativeValue` | `hue` | Hue for the `dark` and `darkContrast` variants. A relative value is relative to the theme's dark seed hue. See [Dark seed](#dark-seed-darkhue--darksaturation). |
| `darkSaturation` | `number` | `saturation` | Factor (0–1) of the dark saturation seed for the dark variants. When set, `darkDesaturation` is not applied on top. |
| `base` | `string` | — | Another color in the same theme. Makes this a dependent color. Can't be a shadow or glow. |
| `contrast` | `HCPair<ContrastSpec>` | — | Contrast floor against `base`, WCAG or APCA. Requires `base`. See [`contrast`](#contrast). |
| `mode` | `AdaptationMode` | `'auto'` | How the color adapts between light and dark. See [`mode`](#mode). |
| `autoFlip` | `boolean` | The config's `autoFlip` (`true`) | Mirror out-of-range results to the other side of the base instead of clamping. See [`autoFlip`](#autoflip). |
| `opacity` | `number` | `1` | Fixed alpha, 0–1. See [`opacity`](#opacity). |
| `pastel` | `boolean` | The theme's `pastel` (`false`) | Use the hue-independent safe chroma limit for this color. See [Per-color `pastel`](#per-color-pastel). |
| `role` | `RoleInput` | Inferred | How the color is used against `base`; fixes APCA polarity. See [Roles](#roles). |
| `inherit` | `boolean` | `true` | Whether `extend()` copies the color into child themes. See [`inherit`](#inherit). |

```ts
import { glaze } from '@tenphi/glaze';

const theme = glaze(280, 80);

theme.colors({
  // root
  surface: { tone: 97, saturation: 0.1 },
  // dependent
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
  // HC pair
  border: { base: 'surface', tone: ['-8', '-16'] },
  // root that keeps its tone in dark
  accent: { tone: 52, mode: 'fixed' },
  // literal value
  brand: { from: '#2f5bff', base: 'surface', contrast: 3 },
});
```

**Root or dependent.** A color with an absolute `tone` (a number, `'max'`, or `'min'`) or a `from` value and no `base` is a root. A color with a `base` is dependent. Every regular color needs one of the three, or validation throws `glaze: color "<name>" must have either absolute "tone" (root), "from" (a literal color), or "base" (dependent).`

### `from`

`from` places a color at a literal value instead of deriving it from the seed: for brand colors, white-label and multi-tenant themes, and imported design tokens, where the value is a contract rather than a starting point.

```ts
const theme = glaze(280, 80);

theme.colors({
  surface: { tone: 100, saturation: 0.12 },
  brand: { from: '#2f5bff', base: 'surface', contrast: 3 },
});
// brand, light: #2f5bff (it already clears 3:1 on white, so it is kept)
```

It accepts every [`GlazeColorValue`](./color-tokens.md#glazecolorvalue) form: hex, `rgb()`, `hsl()`, `okhsl()`, `okhst()`, `oklch()`, or a value object. It supplies three things: `hue`, `tone`, and, unlike any other theme color, an **absolute saturation**. Every other color's `saturation` is a factor of the seed, so the seed is a ceiling. A `from` color carries its own chroma, so it can be more saturated than its theme and doesn't move when the seed changes:

```ts
for (const seed of [5, 50, 100]) {
  const theme = glaze(280, seed);
  theme.colors({ brand: { from: '#2f5bff' } });
  // brand, light: #2f5bff at every seed
}
```

| Aspect | Behavior |
| --- | --- |
| Which variant is exact | The **light, normal-contrast** variant reproduces the value: the color resolves with a local `lightTone: false`, the default the value forms of `glaze.color()` use. Dark and high contrast adapt as usual: those are the variants a reader picks when the normal one doesn't work for them, so readability outranks fidelity. To pin the value in every scheme, add `mode: 'static'`. |
| `contrast` | Still a floor in every scheme. A value that clears it is emitted untouched; one that misses moves only as far as the floor. The floor is solved per scheme, so which schemes come out exact depends on the color. |
| `tone` | Overrides the tone the value carried. Without `tone`, the color sits at the value's tone, even when it has a `base`. |
| `hue` | An absolute `hue` replaces the value's hue and keeps its saturation and tone. A relative `hue` is relative to the theme seed hue, as on any color, not to the value's hue. |
| `saturation` | Reverts to its usual meaning: a factor of the seed, not of the value. |
| Dark saturation | Without `saturation` or `darkSaturation` on the def: starts from the value's own saturation, and `darkDesaturation` applies, even when the theme has a dark saturation seed. With a def-level `saturation`, it is a factor of the dark seed when one is set (no reduction), else of the seed with `darkDesaturation`. A def-level `darkSaturation` is a factor of the dark seed, taken literally. |
| Dark hue | The value's hue, unless `hue` or `darkHue` is set. |
| `base` | Not needed: a `from` color is a root on its own. Add `base` + `contrast` when it has to stay legible against something. |

An unparsable value throws `glaze: color "<name>" has an invalid "from" value.` followed by the parser's message.

The concept and a worked example are in [Contrast solving](../contrast.mdx#literal-colors-with-a-floor).

### Tone values

```ts
type RelativeValue = `+${number}` | `-${number}`;
type ExtremeValue = 'max' | 'min';
type ToneValue = number | RelativeValue | ExtremeValue;
```

`tone` is on the contrast-uniform OKHST axis, 0–100: equal tone differences give equal WCAG contrast for neutrals, and chromatic colors can drift slightly in measured luminance. The model is in [Tone and OKHST](../okhst.mdx#tone-values).

| Form | Example | Meaning |
| --- | --- | --- |
| Number (absolute) | `tone: 45` | Absolute tone 0–100. |
| Delta | `tone: '-52'` | Signed difference from the base's resolved tone. Requires `base`. |
| Extreme | `tone: 'max'` / `tone: 'min'` | The scheme's highest (`'max'` = author tone 100) or lowest (`'min'` = 0) tone. No `base` needed. |
| HC pair | `tone: ['-7', '-20']` | `[normal, highContrast]`. A single value applies to both. |

**Absolute tone.** On a root, the tone is mapped into each scheme by its [`mode`](#mode). On a dependent, it positions the color independently of the base: each scheme maps it on its own, and a `contrast` floor acts as the safety net.

**Delta.** Adds a signed tone delta to the base's resolved tone. In `light` and `lightContrast` the step is exact, which gives an equal contrast step for neutrals and a stable visual progression for chromatic colors. Dark depends on the color's `mode`:

- `'auto'` (default): Glaze steps from the base's **anchor**, where the base sits on the authored scale, and inverts and remaps the result through the dark window, so dark text on a light surface becomes light text on a dark one. The anchor is the base's authored tone when the base is an `'auto'` color placed by a tone, and its base's anchor plus the delta when it is an `'auto'` delta. For any other base — `'fixed'` or `'static'`, or an `'auto'` base placed by a contrast floor, a mix, or a `'max'` / `'min'` on a base — it is the base's own dark tone read back through the dark window, so the dependent mirrors around wherever the base sits (`'+10'` on a fixed tone-30 base steps −8.7 in dark). Full table: [Adaptation modes](./configuration.md#adaptation-modes).
- `'fixed'` and `'static'`: the delta is applied to the base's tone in each scheme, sign kept.

At the reference dark `eps`, every `'auto'` dark step is the dark window's scale times the delta, about 0.87× at the defaults: on a tone-97 surface, `'-10'` becomes +8.7 in dark and `'-52'` becomes +45.1; on a tone-50 base, `'+4'` becomes −3.5 and `'-4'` becomes +3.5; a `'-4'` hover on an `'AAA'` button steps +3.5. In `darkContrast` the same step is exact (±N), under any light `eps`. A custom dark `eps` reshapes the dark curve in `dark` and `darkContrast` alike, so a dark delta lands where the same authored tone would instead of at scale × delta. Near the ends of the scale the clamps below apply. See [How relative tone adapts](../schemes.mdx#how-relative-tone-adapts).

If `base + delta` falls outside `[0, 100]`:

- with `autoFlip` (the default), the delta is mirrored to the other side of the base;
- if the mirrored target is also out of range, or `autoFlip` is off, the result is clamped on the authored side.

The flip is decided on the light tone, and dark mirrors whichever side light took. Two clamps apply in dark only:

- **Step off the scale.** Dark steps from the anchor, so a step that fits from the base's light tone can still run past 0 or 100 from the anchor; dark then stops at the dark window's edge. An `'auto'` base placed by a tone meets this at the bottom, because the light window lifts authored tone 0 to 4.95: `'-4'` on tone 2 steps about +1.7 in dark, on tone 0 not at all. A base anchored at its own dark tone can meet it at either end: in `glaze(280, 40)`, a `'-4'` hover on `contrast: 12` text over a tone-97 surface steps +2.3 in dark, not +3.5. In `darkContrast` this applies only to a base anchored at its own dark tone, or under a custom light `eps`.
- **Base past the dark window.** A contrast floor or an extreme can push a base past the dark window, and a `'fixed'` delta can ride its base past it. A step from it is limited by the window edge or the base, whichever is further out: a step back toward the window moves the full scaled delta, one pointing further out stops at the base. On a tone-97 surface, `ink: { base: 'surface', tone: 'min' }` sits at tone 100 in dark; `'+4'` on it steps −3.5 there and `'-4'` stays at 100.

Add a `contrast` floor when a dark step must survive either clamp.

A delta needs `base`. When either entry of `tone` is a delta and there is no `base`, validation throws `glaze: color "<name>" has relative "tone" without "base".` That includes a delta only in the high-contrast entry (`tone: [50, '+20']`). With a `base`, the entries can mix forms: `tone: [50, '-20']` places the color at absolute tone 50 in the normal schemes and exactly 20 tones from its base in high contrast: below it in `lightContrast`, and above it in `darkContrast` under `mode: 'auto'`.

**Extreme without a base.** Flows through the scheme mapping like an absolute tone. Under `mode: 'auto'` it inverts in dark: `'max'` is the lightest tone in light and the darkest in dark. Use `mode: 'static'` to keep the same extreme in every scheme, or `mode: 'fixed'` to keep the same end without inverting.

**Extreme with a base.** Keeps the pair's contrast across schemes instead of squeezing it through the dark window. In dark, Glaze replays the tone shift the light scheme applied between the base and the extreme against the base's dark tone: mirrored under `mode: 'auto'`, same sign under `'fixed'`. The result is clamped to `[0, 100]` only, so it can cross the `darkTone` window edge, and pins at 100 or 0 when the shift doesn't fit. `mode: 'static'` is unaffected. The rule and a worked example are in [Extremes in dark](../schemes.mdx#extremes-in-dark).

**No tone.** A dependent with `base` and no `tone` takes the base's tone (a delta of 0). A `from` color takes the value's tone.

### Hue and saturation

```ts
const theme = glaze(280, 80);

theme.colors({
  surface: { tone: 97 },
  'gradient-end': { tone: 90, hue: '+20' }, // 280 + 20 = 300
  warning: { tone: 60, hue: 40 }, // absolute
  'muted-fill': { tone: 90, saturation: 0.3 }, // 30% of seed saturation
});
```

- A relative `hue` is relative to the **theme seed hue**, never to a base color. Hues wrap to 0–360.
- `saturation` is a 0–1 factor of the theme's 0–100 saturation seed. Values outside 0–1 are clamped.
- A `from` color uses its own hue and absolute saturation unless these fields are set; see [`from`](#from).

### Dark seed (`darkHue` / `darkSaturation`)

Tone inverts between light and dark, but hue and saturation don't: by default every scheme uses the one seed, and dark gets the flat `darkDesaturation` reduction. When dark needs its own chroma, give the theme a [dark seed](./theme.md#glazethemeseed), override single colors, or both:

```ts
const theme = glaze({
  hue: 280,
  saturation: 80,
  darkHue: 268, // dark variants seed from 268 instead of 280
  darkSaturation: 65, // and from 65 instead of 80
});

theme.colors({
  surface: { tone: 97 },
  accent: { tone: 55, hue: '+20', darkHue: '+35' },
  warning: { tone: 60, saturation: 0.9, darkSaturation: 0.6 },
});
```

Both fields apply to the `dark` **and** `darkContrast` variants.

| Rule | Behavior |
| --- | --- |
| Units | The seed's `darkSaturation` is 0–100, like the theme `saturation`. A color's `darkSaturation` is a 0–1 factor, like a color's `saturation`. |
| Fallback | `darkHue` falls back to `hue` and `darkSaturation` to `saturation`; a color falls back to the seed. Omitting everything gives the single-seed behavior. |
| Relative hue | `darkHue: '+N'` is relative to the theme's **dark** seed hue. A plain `hue: '+N'` with no `darkHue` is also re-applied to the dark seed hue, so the whole palette rotates together. |
| Absolute hue | An absolute `hue` with no `darkHue` is used as is in dark: absolute means absolute in every scheme. |
| `darkDesaturation` | Skipped as soon as any explicit dark saturation is authored, on the seed or on the color. The value you write is the value you get. A [`from`](#from) color with no `saturation` or `darkSaturation` of its own is the exception: a seed-level `darkSaturation` doesn't stop its reduction. |
| `mode: 'static'` | Ignores both. A static color keeps one hue and saturation in every scheme. |
| Shadows, glows, and mixes | Have no channels of their own. They derive hue and saturation from `bg` / `fg` / `base` / `target`, so they follow dark overrides automatically. |

With [`splitHue`](./output.md#dark-hues), a dark seed makes the hue custom properties scheme-dependent, and Glaze re-declares them for dark automatically. The concept is in [Light, dark, and high contrast](../schemes.mdx#dark-seed).

### `contrast`

`contrast` sets a minimum contrast against `base`, solved separately in every scheme:

```ts
theme.colors({
  surface: { tone: 97 },
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
  'muted-text': {
    base: 'surface',
    tone: '-40',
    contrast: { apca: 'content' },
  },
  'accent-text': { base: 'surface', contrast: { wcag: [4.5, 7] } },
});
```

The type is `HCPair<ContrastSpec>`: a WCAG ratio or preset, or an `{ apca }` Lc target, optionally as a `[normal, highContrast]` pair. Every form, preset, and the automatic high-contrast escalation are in [Contrast and high contrast](./contrast.md#contrastspec). How the solver searches tone is in [Contrast solving](../contrast.mdx#how-the-solver-finds-a-tone).

### `autoFlip`

`autoFlip` decides what happens when a result falls outside its valid range:

- **Delta overshoot.** When `base ± delta` leaves `[0, 100]`, the delta is mirrored to the other side of the base (`'+30'` becomes `'-30'`) instead of clamping to the boundary. If the mirrored target is also out of range, the original delta is kept and clamped on the authored side. Light decides the side and dark mirrors it, with the dark-only clamps under [Tone values](#tone-values).
- **`contrast` direction.** When the requested direction can't meet the floor, the solver tries the opposite side of the base and uses it if it passes.

It defaults to the theme's effective `autoFlip`, which is `true` unless changed with `glaze.configure()` or a [config override](./theme.md#per-theme-config-override). Set `autoFlip: false` on a color to keep a delta on the authored side, or to pin an unmet floor to that direction's extreme (with a warning) instead of crossing over. Mixes have no per-color `autoFlip`; their contrast solve follows the theme's. See [Contrast solving](../contrast.mdx#autoflip-crossing-to-the-other-side).

### `mode`

```ts
type AdaptationMode = 'auto' | 'fixed' | 'static';
```

| Mode | In dark |
| --- | --- |
| `'auto'` (default) | Tone inverts (`100 − t`), then maps into the dark tone window. |
| `'fixed'` | Tone maps into the dark window without inverting. For brand fills, CTAs, and status banners. |
| `'static'` | The same tone, hue, and saturation in every scheme, with no tone window. |

High-contrast variants use the full tone range in every mode, and `'auto'` still inverts in `darkContrast`. Each mode in every scheme, with visuals and when to use it, is in [Light, dark, and high contrast](../schemes.mdx#adaptation-modes); which mapping steps each mode applies is in [Adaptation modes](./configuration.md#adaptation-modes), and the formulas and per-variant tones in [Scheme mapping](./configuration.md#scheme-mapping). How each mode treats a tone delta is under [Tone values](#tone-values).

### `opacity`

A fixed alpha, 0–1. The output color includes it:

```ts
theme.colors({
  scrim: { tone: 0, saturation: 0, mode: 'static', opacity: 0.5 },
});
// scrim: oklch(0 0 0 / 0.5) in every scheme
```

Opacity doesn't take part in contrast solving: a translucent color has no fixed perceived tone. Combining it with `contrast` emits a [contrast and opacity](./configuration.md#contrast-and-opacity) warning:

```text
glaze: color "<name>" has both "contrast" and "opacity".
Opacity makes perceived tone unpredictable.
```

For an alpha that is solved against what it covers, use a [shadow or glow](#shadowcolordef--glowcolordef) or a [transparent mix](#mixcolordef).

### Per-color `pastel`

`pastel` toggles the hue-independent "safe" chroma limit for one color. It applies to every OKHSL ↔ sRGB conversion that touches the color: luminance during contrast solving, gamut clamping at sRGB blend and mix edges, and output formatting. The effective flag is carried on the resolved variant (`ResolvedColorVariant.pastel`), so formatting uses the same gamut mapping as resolution.

```ts
const theme = glaze(280, 80);

theme.colors({
  plain: { tone: 50, saturation: 1 },
  soft: { tone: 50, saturation: 1, pastel: true },
});

theme.resolve().get('soft')!.light.pastel; // → true
theme.css({ format: 'rgb' }).light;
// → '--plain-color: rgb(105.64 102.82 227.87);\n' +
//   '--soft-color: rgb(113.43 117.68 169.27);'
```

Omit it to use the theme's `pastel` (from its [config override](./theme.md#per-theme-config-override), default `false`). `pastel` can't be set with `glaze.configure()`.

The flag is part of the definition, so `extend()` copies it into child themes. Override it on the child to switch one color back:

```ts
const parent = glaze(280, 80);
parent.colors({ soft: { tone: 50, saturation: 1, pastel: true } });

const child = parent.extend({
  colors: { soft: { tone: 50, saturation: 1, pastel: false } },
});
child.resolve().get('soft')!.light.pastel; // → false
```

- **Shadows and glows**: `pastel` sets the gamut used to convert the pigment for the opacity solve and for output. The surface (`bg`) keeps its own flag.
- **Mixes**: `pastel` sets the gamut of the mixed result. The base and target keep their own flags, and the mix reads each in its gamut through the color it paints: a standard mix paints a pastel base or target exactly, and a pastel mix caps a vivid one at the pastel limit, keeping its hue and lightness. A transparent mix's overlay is the target in that gamut. The contrast solver measures the color the mix paints. See [Pastel mixes](../mixes.mdx#pastel-mixes).
- **Color tokens**: the same field exists on both `glaze.color()` input forms and survives the `export()` / `colorFrom()` round-trip; see [Color tokens](./color-tokens.md).
- **`splitHue`** requires every emitted color to be pastel; see [Output formats](./output.md#hue-channel-splitting-splithue).

### Roles

```ts
type Role = 'text' | 'surface' | 'border';
type RoleInput =
  | Role
  | 'bg' | 'background' | 'fill' | 'canvas' | 'paper' | 'layer'
  | 'fg' | 'foreground' | 'content' | 'ink' | 'label' | 'stroke'
  | 'divider' | 'outline' | 'separator' | 'hairline' | 'rule';
```

A color's `role` says how it is used against its `base`, and fixes **APCA polarity**: which of the two is measured as text. APCA is asymmetric (the Lc of `a` on `b` differs from `b` on `a`), so the role picks the argument order. WCAG is symmetric and ignores roles.

| Role | Polarity | Use | Aliases and name keywords |
| --- | --- | --- | --- |
| `'text'` | Foreground | Text, icons, foreground content | `text`, `fg`, `foreground`, `content`, `ink`, `label`, `stroke` |
| `'border'` | Foreground | Non-text spot elements: borders, dividers, outlines | `border`, `divider`, `outline`, `separator`, `hairline`, `rule` |
| `'surface'` | Background | Backgrounds and fills | `surface`, `bg`, `background`, `fill`, `canvas`, `paper`, `layer` |

A foreground color is measured as text over its base. A surface color is measured as the background, with its base as the text on top.

Each color's role is the first of:

1. An explicit `role`, normalized from any alias above.
2. When `inferRole` is on (the default), a role inferred from the color's name. The name is split on non-alphanumeric characters and camelCase humps, and the **last** recognized keyword wins: `button-text` → `text`, `input-bg` → `surface`, `card-outline` → `border`, `inputBg` → `surface`.
3. The opposite of the base's role: a color on a `surface` is `text`; a color on `text` or a `border` is a `surface`.
4. `'text'`: the base is treated as the background.

Turn name inference off with `glaze.configure({ inferRole: false })` or a per-theme config override; steps 1, 3, and 4 still apply. Shadows and glows always resolve as `'surface'`. Mixes take the same `role` field and chain. Standalone `glaze.color()` tokens don't: their role is an explicit `role` or `'text'`, never inferred from `name` (see [Roles on tokens](./color-tokens.md#roles-on-tokens)). The concept, with a polarity demo and an example, is in [Contrast solving](../contrast.mdx#roles-and-apca-polarity). The role helpers (`normalizeRole`, `inferRoleFromName`, `roleToPolarity`, `oppositeRole`) are in [Role helpers](./utilities.md#role-helpers).

### `inherit`

`theme.extend()` copies every color into the child unless it has `inherit: false`:

```ts
const primary = glaze(280, 80);
primary.colors({
  surface: { tone: 97 },
  // stays on primary only
  'brand-mark': { from: '#2f5bff', inherit: false },
});

const danger = primary.extend({ hue: 23 }); // has surface, not brand-mark
```

A child that inherits a color whose `base` was not inherited fails validation (`references non-existent base`). Redefine the base in the child's `colors`, or mark the dependent `inherit: false` too. `inherit` works the same on shadows, glows, and mixes. See [`theme.extend()`](./theme.md#themeextendoptions).

## `ShadowColorDef` / `GlowColorDef`

Translucent overlays. Each emits a pigment (black for a shadow, white for a glow) with an opacity solved so that, once the browser composites it over `bg`, the surface lands exactly `intensity` tones darker (`shadow`) or lighter (`glow`). The two types share one shape; `type` picks the direction, which is fixed in every scheme.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `'shadow' \| 'glow'` | — | Discriminator. A `shadow` always darkens and a `glow` always lightens, in light and dark. |
| `bg` | `string` | — | The surface the overlay falls on. Required. Can't be a shadow or glow. |
| `fg` | `string` | — | The object casting the shadow or emitting the glow, such as the card. Scales the step: a darker object casts a deeper shadow, a lighter one a stronger glow. Omit for an exact shade or tint of `intensity` tones. Can't be a shadow or glow. |
| `intensity` | `HCPair<number>` | — | Tone step, 0–100: how many tones darker (shadow) or lighter (glow) than `bg` the composite lands. Clamped to 0–100. Required. |
| `tuning` | `ShadowTuning` / `GlowTuning` | — | Per-color [tuning](#lightingtuning), merged field by field over the global `shadowTuning` / `glowTuning`. A glow's can set [`headroom`](#lightingtuning); on a shadow's, `headroom` throws. |
| `pastel` | `boolean` | The theme's `pastel` | Gamut for the pigment. See [Per-color `pastel`](#per-color-pastel). |
| `inherit` | `boolean` | `true` | See [`inherit`](#inherit). |

```ts
const theme = glaze(280, 80);

theme.colors({
  surface: { tone: 97 },
  card: { tone: 100 },
  accent: { tone: 45 },

  'card-shadow': {
    type: 'shadow',
    bg: 'surface',
    fg: 'card',
    intensity: 8,
  },
  'surface-hover': { type: 'shadow', bg: 'surface', intensity: 5 },
  'accent-pressed': { type: 'shadow', bg: 'accent', intensity: [8, 14] },
  'accent-hover': { type: 'glow', bg: 'accent', intensity: 6 },
});
// 'card-shadow', light: oklch(0 0 0 / 0.1066)
// 'accent-hover', light: oklch(1 0 0 / 0.0948)
```

- **Object factor.** With `fg`, the step is `intensity × k`, where `k = max(0, 1 + β · d · (t_bg − t_fg) / 100)`, `d = +1` for a shadow and `−1` for a glow, and `β` is `tuning.objectInfluence`. An object at the surface's own tone gives exactly `intensity`, as does omitting `fg`.
- **Per scheme.** `bg` and `fg` are read in each scheme, so the step and `k` adapt in dark and high contrast on their own.
- **HC pairs and the level.** `intensity` accepts `[normal, highContrast]` and is interpolated by a manual [`contrastLevel`](./contrast.md#manual-contrast-level).
- **Output.** Shadows and glows appear in every output method next to regular colors, with an alpha component. They have no `role` (always `'surface'`), no `mode`, and no channels of their own; `ResolvedColor.mode` is `undefined` for them.
- **Unreachable steps.** A glow on white or a deep shadow on near-black can't reach the step. The result pins to the pigment's strongest composite (full opacity, or transparent when the pigment can't move the surface at all) and emits a deduped `console.warn`. This includes the common case of a shadow on an `auto` light surface: a tone-97 surface sits at tone 3 in `darkContrast`, so `card-shadow` and `surface-hover` above pin to opaque black and warn there (`accent-pressed`, on a mid-tone accent, is unaffected). Use a glow for elevation in dark. A glow with a `headroom` can go past white instead; see [HDR values](#hdr-values-resolvedhdr).
- **Errors.** `glaze: shadow "<name>" is missing "bg".`, `glaze: shadow "<name>" references non-existent bg "<ref>".`, and `glaze: glow "<name>" fg "<ref>" references a shadow color.` (and the same for the other combinations).

How the opacity solve works, the [object-factor table](../shadows-and-glows.mdx#object-influence), state layers, and [dark-mode elevation](../shadows-and-glows.mdx#dark-mode-elevation) are in [Shadows and glows](../shadows-and-glows.mdx). The standalone functions are in [`glaze.shadow()` / `glaze.glow()`](./utilities.md#glazeshadowinput--glazeglowinput).

### `LightingTuning`

```ts
interface LightingTuning {
  objectInfluence?: number;
  tint?: number;
  reach?: number;
  hueBleed?: number;
}
type ShadowTuning = LightingTuning;
interface GlowTuning extends LightingTuning {
  headroom?: number;
}
```

| Field | Default | Description |
| --- | --- | --- |
| `objectInfluence` | `0.5` | β in the object factor. `0` removes `fg`'s effect on the step (`k = 1`); `fg` still feeds `hueBleed`. `k` tops out at `1 + β`, for a black object on a white surface (shadow). |
| `tint` | `0` | Pigment saturation (0–1) in the surface's hue. `0` is neutral black or white. Shows only with `reach` below `1`, because pure black and white have no hue. On a neutral surface (saturation at most `1e-4`, which covers every hex gray) the tint takes the object's hue when `hueBleed` is above `0`, and the pigment stays neutral otherwise. |
| `reach` | `1` | Where the pigment sits: the fraction (0–1) of the way from the surface's tone to black (shadow) or white (glow). `1` is pure black or white, the most reach. Lower values let a `tint` show and cost reach. |
| `hueBleed` | `0` | Pull (0–1) of the pigment hue from the surface's hue toward the object's (`fg`) hue. Needs `fg`, a `tint`, and `reach` below `1` to show. |
| `headroom` | `0` | Glows only. Stops above SDR white a glow may use when its step crosses white: `1` allows up to 2× white's luminance, `2` up to 4×. A finite number ≥ 0; above 2 it clamps to 2 with a warning. On a shadow's tuning it throws. See [HDR values](#hdr-values-resolvedhdr) and [Glow headroom](./configuration.md#glow-headroom). |

`tint`, `reach`, and `hueBleed` are clamped to 0–1. A field that is set must be a finite number, or the tuning throws (`glaze: shadowTuning.reach must be a finite number (got NaN).`); a field set to `undefined` counts as unset. Each field resolves separately, later wins:

1. The defaults above.
2. The global `shadowTuning` (for shadows) or `glowTuning` (for glows), from `glaze.configure()`. A theme or token [config override](./configuration.md#glazeconfigoverride) that sets `shadowTuning` / `glowTuning` replaces the global object as a whole.
3. The color's `tuning`.

```ts
theme.colors({
  'shadow-tinted': {
    type: 'shadow',
    bg: 'surface',
    intensity: 8,
    tuning: { tint: 0.3, reach: 0.85 },
  },
});

glaze.configure({
  shadowTuning: { objectInfluence: 0.4 },
  glowTuning: { objectInfluence: 0.6 },
});
```

There is no opacity cap: when the step is reachable, it is exact. For a lighter overlay, lower `intensity`. What a tint costs on dark surfaces is shown in [Tinted pigment](../shadows-and-glows.mdx#tinted-pigment).

### HDR values (`ResolvedHdr`)

With a `headroom` above 0, a glow whose target tone (the surface's luminance tone + `intensity × k`) passes 100 gets an HDR value on its resolved variant, next to the unchanged SDR one:

```ts
interface ResolvedHdr {
  h: number; // base OKHSL hue, 0–360
  s: number; // base OKHSL saturation, 0–1, never pastel
  t: number; // base tone, 0–1
  exposure: number; // gain over the base, in stops (> 0)
}
// ResolvedColorVariant.hdr?: ResolvedHdr
```

- **Base.** What SDR paints at its brightest, taken opaque: the pigment at full opacity, or a white surface (tone 100) that no pigment can lift. The HDR color is the base's linear sRGB times `2^exposure`. `variant.t` stays at most 1.
- **Exposure.** `log2(min(Y(T*) / Y(base), 2^headroom / max channel))`, with `T*` the target tone: the exact step when the headroom allows it, otherwise capped so no channel passes `2^headroom`, with a [warning](./configuration.md#shadow-or-glow-out-of-reach). A step the HDR value covers doesn't warn.
- **`s` is never pastel.** The base can be any in-gamut composite, so `s` is standard OKHSL saturation even on a `pastel` variant.
- **Absent elsewhere.** The `hdr` key is missing (not `undefined`) on regular colors, shadows, mixes, glows that stay below white, a glow whose pigment can't lift a non-white surface at all (`reach: 0` on a gray surface, say: SDR paints nothing, so there is nothing to expose; on a chromatic surface the `reach: 0` gray can be slightly brighter than the surface, pin at full opacity, and get an HDR value), and every glow at `headroom: 0`.
- **Continuity.** A full-reach glow (the default `reach: 1`) is pinned at white, so its HDR value starts at white (`exposure` → 0) as the target passes 100. A glow with `reach` below 1 is pinned at its pigment, below white: just under 100 it stays short there and warns, and just past 100 it jumps to the exact step.

```ts
const theme = glaze(280, 80, { glowTuning: { headroom: 1 } });
theme.colors({
  surface: { tone: 100 },
  'surface-glow': { type: 'glow', bg: 'surface', intensity: 12 },
});

const glow = theme.resolve().get('surface-glow')!;
glaze.format(glow.light); // 'oklch(1 0 0 / 0)' — SDR can't lift white
glow.light.hdr?.exposure; // 0.5489…
glaze.formatHdr(glow.light);
// → 'color(srgb-linear 1.4631 1.4631 1.4631)', tone 112
glow.dark.hdr; // undefined — the dark surface leaves room below white
```

Exporters emit HDR values only with `modes.hdr`; see [HDR output](./output.md#hdr-output). What HDR glows are for: [HDR glows](../shadows-and-glows.mdx#hdr-glows). Formatting: [`glaze.formatHdr()`](./utilities.md#glazeformathdrvariant-hdrformat).

## `MixColorDef`

A blend of two colors: an opaque interpolation, or the target laid over the base with an alpha.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `'mix'` | — | Discriminator. |
| `base` | `string` | — | The "from" color. Required. Can't be a shadow or glow. |
| `target` | `string` | — | The "to" color. Required. Can't be a shadow or glow. |
| `value` | `HCPair<number>` | — | Mix ratio 0–100: `0` is pure base, `100` pure target. With `blend: 'transparent'`, the target's opacity (`value / 100`). Clamped to 0–100. Required. |
| `blend` | `'opaque' \| 'transparent'` | `'opaque'` | `'opaque'` produces a solid color. `'transparent'` produces the target color with an alpha, for the browser to composite over the base. |
| `space` | `'okhsl' \| 'srgb'` | `'okhsl'` | Interpolation space for `'opaque'`. `'okhsl'` interpolates hue (shortest arc), saturation, and lightness in OKHSL. `'srgb'` interpolates linear-light sRGB channels, like CSS `color-mix(in srgb-linear, …)`. Ignored for `'transparent'`. |
| `contrast` | `HCPair<ContrastSpec>` | — | Floor against `base`. The solver adjusts the ratio (opaque) or the opacity (transparent); an unreachable floor pins and [warns](./configuration.md#mix-contrast-unmet). See [Contrast and high contrast](./contrast.md#contrastspec). |
| `pastel` | `boolean` | The theme's `pastel` | Gamut of the mixed result. See [Per-color `pastel`](#per-color-pastel). |
| `role` | `RoleInput` | Inferred | Role of the result against `base`, for APCA polarity. Same chain as on a [regular color](#roles). |
| `inherit` | `boolean` | `true` | See [`inherit`](#inherit). |

```ts
theme.colors({
  surface: { tone: 95 },
  accent: { tone: 30 },
  // black in every scheme
  black: { tone: 0, saturation: 0, mode: 'static' },

  'accent-tint': {
    type: 'mix',
    base: 'surface',
    target: 'accent',
    value: 30,
  },
  'surface-hover': {
    type: 'mix',
    base: 'surface',
    target: 'black',
    value: 8,
    blend: 'transparent',
  }, // the `black` color at alpha 0.08
  'accent-wash': {
    type: 'mix',
    base: 'surface',
    target: 'accent',
    value: [10, 20],
    contrast: 'AA',
  },
});
```

- **Transparent output.** The color is the target's hue, saturation, and tone (in the mix's gamut when their [`pastel` flags](#per-color-pastel) differ) with `alpha = value / 100`. The browser composites it with `source-over` on gamma-encoded sRGB, and the contrast solve models exactly that, so a solved opacity renders at the contrast it was solved for.
- **Achromatic colors.** In `'okhsl'`, a side with a saturation of zero (a color defined with `saturation: 0`) or of float noise under 1e-6 has no hue, so the mix takes the other side's hue, matching CSS `color-mix()` "missing component" behavior. A gray given as a value reads with noise that grows toward white (`'#f1f1f1'` and lighter carry a hue near 90), so give a gray endpoint `saturation: 0`, which also works with `from`. A white or black that keeps real saturation still carries its hue. A mix of two zero-saturation colors stays gray in either space. See [Achromatic colors](../mixes.mdx#achromatic-colors).
- **Chaining.** A mix can use another mix as its `base` or `target`. A transparent mix or an `opacity` color is accepted as a mix's `base` / `target` or a shadow's or glow's `bg` / `fg`, but its alpha is ignored: its opaque color is used.
- **`autoFlip`.** Mixes have no per-color `autoFlip`; the contrast solve uses the theme's.
- **Adaptation.** A mix reads its base and target in each scheme, so it adapts to dark and high contrast with them. `ResolvedColor.mode` is `undefined` for mixes.
- **Errors.** `glaze: mix "<name>" references non-existent base "<ref>".` (or `target`), and `glaze: mix "<name>" base "<ref>" references a shadow color.` (or `glow`, or `target`).

Ramps of [opaque](../mixes.mdx#opaque-mix) and [transparent](../mixes.mdx#transparent-mix) mixes, [contrast on mixes](../mixes.mdx#contrast-on-mixes), and [when to use a mix](../mixes.mdx#mix-shadow-glow-or-opacity) instead of a shadow, glow, or `opacity` are in [Mixes and transparency](../mixes.mdx).
