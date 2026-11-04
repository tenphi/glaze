---
title: Configuration
description: The global config, per-instance overrides, tone windows, glow headroom, the scheme mapping formulas, validation rules, and every warning Glaze emits.
---

Glaze has one global config that every theme, palette, and color token reads at resolve time. Themes and tokens can override part of it with a sparse per-instance `GlazeConfigOverride`. This page lists every field, how the scheme mapping uses them, what Glaze validates, and what it warns about. For the ideas behind tone windows and adaptation, see [Light, dark, and high contrast](../schemes.mdx) and [Tone and OKHST](../okhst.mdx).

## Global config

```ts
import { glaze } from '@tenphi/glaze';

glaze.configure({
  lightTone: [10, 100],
  darkTone: [15, 95],
  darkDesaturation: 0.1,
  states: {
    dark: '@media(prefers-color-scheme: dark)',
    highContrast: '@media(prefers-contrast: more)',
    hdr: '@media(dynamic-range: high)',
  },
  modes: { dark: true, highContrast: false, hdr: false },
  shadowTuning: { objectInfluence: 0.5 },
  glowTuning: { objectInfluence: 0.5, headroom: 0 },
  autoFlip: true,
  inferRole: true,
  contrastLevel: 'auto',
});
```

| Function | Returns | Description |
| --- | --- | --- |
| `glaze.configure(config)` | `void` | Merges a `GlazeConfig` into the global config and invalidates every theme, palette, and token cache. |
| `glaze.getConfig()` | `GlazeConfigResolved` | A snapshot of the current global config. |
| `glaze.resetConfig()` | `void` | Restores the defaults and invalidates every cache. |

### `glaze.configure(config)`

- Omitted fields keep their current value. `configure()` never clears a field by omission, and passing `undefined` is the same as omitting it. `null` is not: a `null` tone window throws. Use `resetConfig()` to start over, or `contrastLevel: 'auto'` to leave manual contrast mode.
- `states` and `modes` merge field by field: `configure({ modes: { highContrast: true } })` keeps `modes.dark`.
- `lightTone`, `darkTone`, `shadowTuning`, and `glowTuning` are replaced as a whole. `configure({ shadowTuning: { tint: 0.3 } })` followed by `configure({ shadowTuning: { reach: 0.9 } })` leaves `{ reach: 0.9 }`, and a `glowTuning` without `headroom` drops an earlier one. They are copied, so changing the array or object you passed afterwards has no effect.
- `contrastLevel`, `darkDesaturation`, the tone windows, and the tunings are validated on the spot. `contrastLevel` clamps to 0–100 and `darkDesaturation` to 0–1. A non-finite number throws, and so does any other value that isn't a number (besides the level's `'auto'`), such as the string `'50'` from an `<input>`: for example `glaze: contrastLevel must be a finite number 0–100 or 'auto' (got NaN).` Window rules are under [Tone windows](#tone-windows), `headroom` rules under [Glow headroom](#glow-headroom). A call that throws changes nothing, not even the fields that were valid, and prints no warning: a `headroom` clamp found on the way is reported only once the whole call has passed.
- Every call bumps an internal config version, so cached resolutions recompute on the next output call. Existing themes pick up the change for every field their own override doesn't set.

### `glaze.getConfig()`

Returns a `GlazeConfigResolved` — every field present, defaults filled in:

```ts
glaze.getConfig();
// → {
//   lightTone: { lo: 10, hi: 100, eps: 0.05 },
//   darkTone: { lo: 15, hi: 95, eps: 0.05 },
//   darkDesaturation: 0.1,
//   states: {
//     dark: '@media(prefers-color-scheme: dark)',
//     highContrast: '@media(prefers-contrast: more)',
//     hdr: '@media(dynamic-range: high)',
//   },
//   modes: { dark: true, highContrast: false, hdr: false },
//   autoFlip: true,
//   pastel: false,
//   inferRole: true,
//   contrastLevel: 'auto',
// }
```

The default windows come back in the `{ lo, hi, eps }` form; a window you set comes back in the form you passed (`[12, 98]` stays `[12, 98]`), with its endpoints clamped to 0–100. `shadowTuning` and `glowTuning` are absent until you set them. `pastel` is always `false` here because it is instance-only.

The snapshot is a deep copy: mutating it, nested `states`, `modes`, windows, and tunings included, changes nothing. Use `configure()` to change the config.

For the config a particular theme resolves with (global merged with its override), use [`theme.getConfig()`](./theme.md#themegetconfig).

## `GlazeConfig`

The input to `glaze.configure()`. Every field is optional.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `lightTone` | `ToneWindow` | `[10, 100]` | Light-scheme [tone window](#tone-windows). Bypassed by high-contrast variants and `mode: 'static'` colors; widened by `contrastLevel`. Endpoints clamp to 0–100; an inverted or non-finite window throws. |
| `darkTone` | `ToneWindow` | `[15, 95]` | Dark-scheme tone window. Same bypasses, widening, and validation. |
| `darkDesaturation` | `number` | `0.1` | Fraction (0–1) of saturation removed in `dark` and `darkContrast`. Clamps to 0–1; non-finite numbers throw. See [Saturation](#saturation). |
| `states.dark` | `string` | `'@media(prefers-color-scheme: dark)'` | State key for dark variants in [`tasty()`](./output.md#state-aliases) output. |
| `states.highContrast` | `string` | `'@media(prefers-contrast: more)'` | State key for high-contrast variants in `tasty()` output. |
| `states.hdr` | `string` | `'@media(dynamic-range: high)'` | State key for the HDR values of glows in `tasty()` output. Used only with `modes.hdr`. |
| `modes.dark` | `boolean` | `true` | Emit dark variants. See [Output modes](./output.md#output-modes). |
| `modes.highContrast` | `boolean` | `false` | Emit high-contrast variants. Independent of `contrastLevel`, except that a global level of `100` drops the tier (it would duplicate the normal one). |
| `modes.hdr` | `boolean` | `false` | Emit the HDR values of glows past SDR white next to their SDR values, in every exporter. Off, the output is the same as with no `headroom` set. `css()` reads its own `hdr` option, which falls back to this. See [HDR output](./output.md#hdr-output). |
| `shadowTuning` | `ShadowTuning` | — | Default tuning for every `shadow` color. A per-color `tuning` merges over it field by field. Fields and defaults: [`LightingTuning`](./color-definitions.md#lightingtuning). A `headroom` here throws. |
| `glowTuning` | `GlowTuning` | — | Default tuning for every `glow` color. Same shape and merge rule, plus [`headroom`](#glow-headroom). |
| `autoFlip` | `boolean` | `true` | Default for each color's `autoFlip`. When on, a contrast floor that can't be met on the requested side of the base may be met on the other side, and a tone delta that overshoots `[0, 100]` mirrors to the other side of its base. When off, only the requested direction is used: an unmet floor pins the tone to that direction's extreme (with a warning) and an overshooting tone delta clamps. Mix colors have no per-color `autoFlip` and always use this value. |
| `inferRole` | `boolean` | `true` | Infer a color's `role` (APCA polarity) from its name when it has no explicit `role`. With `false`, the base-opposite and `'text'` fallbacks still apply. Theme colors only: a standalone token never infers from its `name`. See [How a role is chosen](../contrast.mdx#how-a-role-is-chosen). |
| `contrastLevel` | `number \| 'auto'` | `'auto'` | Manual contrast level, 0–100. Resolves the `light` / `dark` variants at that point between normal (`0`) and high contrast (`100`); `lightContrast` / `darkContrast` stay the true high-contrast resolution. Numbers clamp to 0–100; a non-finite number or any other non-number throws. Full rules: [Manual contrast level](./contrast.md#manual-contrast-level). |

`pastel` is not part of `GlazeConfig`: it can only be set per instance or per color.

## `GlazeConfigResolved`

What `glaze.getConfig()` and `theme.getConfig()` return: the same fields with defaults applied, plus `pastel`.

| Field | Type |
| --- | --- |
| `lightTone`, `darkTone` | `ToneWindow` |
| `darkDesaturation` | `number` |
| `states` | `{ dark: string; highContrast: string; hdr: string }` |
| `modes` | `{ dark: boolean; highContrast: boolean; hdr: boolean }` |
| `shadowTuning` | `ShadowTuning \| undefined` |
| `glowTuning` | `GlowTuning \| undefined` — `headroom` already clamped to 0–2. |
| `autoFlip` | `boolean` |
| `inferRole` | `boolean` |
| `contrastLevel` | `number \| 'auto'` |
| `pastel` | `boolean` — always `false` globally; the override's value on `theme.getConfig()`. |

## Tone windows

```ts
type ToneWindow =
  | [number, number] // [lo, hi]
  | { lo: number; hi: number; eps: number }
  | false;
```

`lo` and `hi` are OKHSL lightness boundaries (0–100). The authored tone scale `0–100` is spread linearly across the tone interval between them.

| Form | Meaning |
| --- | --- |
| `[lo, hi]` | Boundaries at the reference eps `0.05`. The common form. |
| `{ lo, hi, eps }` | Boundaries plus a per-scheme render eps. Advanced; see [Reference and render epsilon](../okhst.mdx#reference-and-render-epsilon). |
| `false` | The full range `[0, 100]` at the reference eps. Removes the boundaries, not the tone transfer. |

| Window | Default | Stored tone range |
| --- | --- | --- |
| `lightTone` | `[10, 100]` | 4.95–100 |
| `darkTone` | `[15, 95]` | 9.25–95.9 |

- **High contrast** replaces both windows with `[0, 100]`, keeping the window's `eps`.
- **`contrastLevel`** moves each boundary toward `[0, 100]` (formula below). A `false` window is already the full range, so it doesn't change with the level.
- **`mode: 'static'`** colors skip the window entirely.
- **Colors seeded with `from`** skip the light window so the light variant reproduces the literal; dark and high contrast still adapt. See [`from`](./color-definitions.md#from).

Windows are validated where they enter: by `configure()` on the spot, and for a per-instance override when the instance resolves. Endpoints must be finite numbers with `lo ≤ hi`, and an object window's `eps` must be a finite number above 0 and at most `1e6` (past that the tone transfer loses precision, and from about `1e15` it renders `NaN`). Anything else throws, `null` included, in `configure()` as in an override (messages under [Errors](#errors)). Endpoints outside 0–100 then clamp into it, keeping the form you wrote: `[-10, 120]` is stored as `[0, 100]`. `lo === hi` is allowed and renders every tone at that one lightness.

## Glow headroom

`glowTuning.headroom` lets a glow go past SDR white. It counts stops above white, doublings of white's luminance: `1` allows up to 2× white (tone 121.98), `2` up to 4× (tone 144.34). At the default `0` nothing changes and no variant carries an HDR value. What an HDR glow is for, and where browsers stand: [HDR glows](../shadows-and-glows.mdx#hdr-glows).

```ts
glaze.configure({ glowTuning: { headroom: 1 } });
```

- **Where it's set.** Globally (`glowTuning`), per theme (the override's `glowTuning`; a `glaze.color()` token is never a glow), per color (a glow's `tuning`), or per call (`glaze.glow({ tuning })`). A glow's `tuning.headroom` merges over the global `glowTuning` field by field. An override's `glowTuning` replaces the global object as a whole, so `glaze(280, 80, { glowTuning: { tint: 0.1 } })` drops a global `headroom`, and so does a child's `glowTuning` in `extend()`.
- **When it applies.** Only to a glow whose target tone (the surface's luminance tone + `intensity × k`) passes 100, and only where SDR is pinned at its brightest: the pigment at full opacity, or a white surface (tone 100) the pigment can't lift. Such a variant gains `hdr`, an opaque base plus a gain in stops; see [`ResolvedHdr`](./color-definitions.md#hdr-values-resolvedhdr). Every scheme uses the same headroom, high contrast included.
- **Validation.** It must be a finite number ≥ 0; anything else throws. Above 2 it clamps to 2 with a [warning](#headroom-clamped), deduplicated per field and value and printed only once the whole `configure()` call, instance override, or color map has passed. A `headroom` on `shadowTuning`, a shadow's `tuning`, or `glaze.shadow()` throws: a shadow darkens toward black, and nothing goes below black.
- **Export.** `export()` freezes `glowTuning` with the clamped headroom, and a glow's own `tuning.headroom` travels with its definition. Snapshots stay at version 2.
- **Output.** The exporters emit HDR values only with `modes.hdr`; see [HDR output](./output.md#hdr-output).

## Per-instance overrides

A `GlazeConfigOverride` overrides resolve-relevant fields for one theme or color token. It is accepted by:

| Call | Effect |
| --- | --- |
| `glaze(hue, saturation, config)` / `glaze(seed, config)` | The theme's override. See [Themes](./theme.md#per-theme-config-override). |
| `glaze.color(input, config)` | The token's override. See [Color tokens](./color-tokens.md). |
| `theme.extend({ config })` | Shallow-merged over the parent's override for the child theme. |
| `theme.export(override)`, `token.export(override)`, `palette.export(override)` | Merged into the frozen snapshot config only; the live instance is unchanged. |

### `GlazeConfigOverride`

| Field | Type | Falls back to | Description |
| --- | --- | --- | --- |
| `lightTone` | `ToneWindow` | global `lightTone` | Light tone window, or `false` for the full range. Validated and clamped like the global one when the instance resolves. |
| `darkTone` | `ToneWindow` | global `darkTone` | Dark tone window, or `false` for the full range. Validated the same way. |
| `darkDesaturation` | `number` | global `darkDesaturation` | Dark saturation reduction (0–1). Clamps to 0–1 when the instance resolves; non-finite numbers throw. |
| `autoFlip` | `boolean` | global `autoFlip` | Default for each color's `autoFlip`. |
| `inferRole` | `boolean` | global `inferRole` | Name-based role inference. |
| `contrastLevel` | `number \| 'auto'` | global `contrastLevel` | Manual contrast level for this instance. `'auto'` opts out of a global level. A per-instance level never changes which modes are emitted. Validated when the instance resolves. |
| `shadowTuning` | `ShadowTuning` | global `shadowTuning` | Replaces the global shadow tuning as a whole for this instance. Per-color `tuning` still merges over it field by field. Meaningful for themes; a token has no shadows, but a `headroom` here still throws when it resolves. |
| `glowTuning` | `GlowTuning` | global `glowTuning` | Same for glows, `headroom` included: an override without `headroom` drops the global one. Validated when the instance resolves. |
| `pastel` | `boolean` | `false` | Instance-wide [`pastel`](./color-definitions.md#per-color-pastel) default for colors that don't set their own. Instance-only: never read from the global config. |

`states` and `modes` are not part of the override. They are global, or per call on the [output methods](./output.md).

### Merge rules

- **Sparse and live.** An instance stores only the fields you set. At resolve time they are merged over the *current* global config, so fields you didn't set keep following `glaze.configure()`.
- **Copied on creation.** The theme or token copies the override when it is created (and `extend()` copies the child's), so changing the object or array you passed afterwards has no effect. Fields are read by property access, so a class instance with getters, inherited fields, or a proxy works as an override. Validation still waits for the resolve.
- **Overridden fields are pinned.** A later `configure()` can't change them for this instance.
- **`extend`** inherits the parent's override and shallow-merges the child's on top.
- **Export freezes.** `.export(override?)` writes `getConfig() ∪ instance override ∪ override` into the snapshot, and `themeFrom` / `colorFrom` / `paletteFrom` pin that freeze as the restored instance's override. Nested objects (windows, tunings) are replaced wholesale, not merged. `states` and `modes` are never frozen.
- **`contrastLevel` is frozen only when authored.** A level set on the instance or passed to `.export()` is written to the snapshot; a level inherited from the global config is a live preference and is left out, so a restored theme keeps following the global slider.

```ts
import { glaze } from '@tenphi/glaze';

const t = glaze(280, 80, { lightTone: [0, 50] });
t.colors({ text: { tone: 50, saturation: 1 } });

t.resolve().get('text')!.light.t;
// → 0.2534… — inside [0, 50], whatever the global lightTone
t.resolve().get('text')!.dark.s;
// → 0.72 (darkDesaturation 0.1, not overridden)

glaze.configure({ darkDesaturation: 0.5 });
t.resolve().get('text')!.dark.s;
// → 0.4 — follows the global change

const child = t.extend({ config: { darkTone: false } });
child.getConfig().lightTone; // → [0, 50] (inherited)
child.getConfig().darkTone; // → false (added)
```

```ts
// Standalone token without a dark window: light keeps the input tone,
// dark is its exact inversion (100 − T)
glaze.color('#26fcb2', { darkTone: false });

// Restore the #000 → white dark flip with a full-height dark window
glaze.color('#000000', { lightTone: false, darkTone: [15, 100] });

// Structured token with an override
glaze.color(
  { hue: 152, saturation: 95, tone: 74 },
  { darkTone: false, pastel: true },
);
```

## Adaptation modes

`mode` on a regular color (`AdaptationMode`) selects which steps of the [scheme mapping](#scheme-mapping) apply to it. What each mode is for, with visuals: [Adaptation modes](../schemes.mdx#adaptation-modes).

| Mode | Inverted in dark | Tone windows | `darkDesaturation`, dark seed |
| --- | --- | --- | --- |
| `'auto'` (default) | Yes, in `dark` and `darkContrast` | Applied | Applied |
| `'fixed'` | No | Applied | Applied |
| `'static'` | No | Skipped | Skipped |

Tone deltas (`'+N'` / `'-N'`) are measured from the base. Under `'fixed'` and `'static'` the delta is applied to the base's tone in each scheme, sign kept. Under `'auto'` it is applied as is in `light` and `lightContrast`. In dark, Glaze steps from the base's **anchor**, where the base sits on the authored scale, then inverts and remaps the result like an authored tone:

| Base | Anchor |
| --- | --- |
| An `'auto'` base placed by a tone (absolute, `from`, `'max'` / `'min'` without a base) | Its authored tone. |
| An `'auto'` tone delta | Its base's anchor plus the delta. |
| An `'auto'` base with no `tone` or `contrast` of its own | Its base's anchor. |
| Any other base: `'fixed'` or `'static'`, or an `'auto'` base placed by a contrast floor, a mix, or a `'max'` / `'min'` on a base | Its own dark tone, read back through the dark window. |

At the reference dark `eps`, every dark step is then the dark window's scale times the delta, about 0.87× at the defaults (`'-20'` steps +17.3 on tone 97 and on tone 50 alike), and every `darkContrast` step is exact, under any light `eps`. The dark window sets their size, and a custom dark `eps` reshapes them in `dark` and `darkContrast` alike: a dark delta lands where the same authored tone would. A `'fixed'` or `'static'` base doesn't invert, but the `'auto'` dependent does, around wherever the base sits: `'+10'` on a fixed tone-30 base steps +10 in light and −8.7 in dark. Near the ends of the scale, dark has two clamps of its own (a step off the scale, a base past the dark window), listed under [Tone values](./color-definitions.md#tone-values). Concept: [How relative tone adapts](../schemes.mdx#how-relative-tone-adapts).

## Scheme mapping

Every scheme runs the same tone pipeline; there is no fitted dark curve. The transfer functions are specified in [Tone and OKHST](../okhst.mdx) and the [canonical OKHST specification](https://github.com/tenphi/okhst).

### Tone

For an authored tone `T` (0–100) and the scheme's active window `{ lo, hi, eps }`:

```text
T'   = 100 − T        if mode is 'auto' and the scheme is dark
     = T              otherwise
loT  = toTone(lo / 100, eps)
hiT  = toTone(hi / 100, eps)
l    = fromTone(loT + (T' / 100) × (hiT − loT), eps)    // OKHSL lightness
t    = toTone(l, REF_EPS)                                 // stored tone
```

`mode: 'static'` skips all of it: `t = clamp(T, 0, 100)`. The stored `t` is what `ResolvedColorVariant.t` holds (divided by 100), what tone deltas are measured against, and what the contrast solver searches.

The active window per variant:

| Variant | Window |
| --- | --- |
| `light` | `lightTone` (widened by `contrastLevel`) |
| `dark` | `darkTone` (widened by `contrastLevel`) |
| `lightContrast`, `darkContrast` | `[0, 100]`, with the configured window's `eps` |

With a numeric `contrastLevel` `L` and `f = L / 100`, the normal windows move toward the full range:

```text
lo(f) = lo × (1 − f)
hi(f) = hi + (100 − hi) × f
```

The defaults at level 50 are light `[5, 100]` (stored tone 1.63–100) and dark `[7.5, 97.5]` (stored tone 3.15–97.97). `eps` is not interpolated.

Authored tones under the default windows (neutral seed), as stored tone:

| Authored | Mode | `light` | `dark` | `lightContrast` | `darkContrast` |
| ---: | --- | ---: | ---: | ---: | ---: |
| 0 | `auto` | 4.95 | 95.9 | 0 | 100 |
| 50 | `auto` | 52.47 | 52.57 | 50 | 50 |
| 100 | `auto` | 100 | 9.25 | 100 | 0 |
| 0 | `fixed` | 4.95 | 9.25 | 0 | 0 |
| 100 | `fixed` | 100 | 95.9 | 100 | 100 |
| 50 | `static` | 50 | 50 | 50 | 50 |

A render `eps` other than the reference bends mid tones: with `lightTone: { lo: 10, hi: 100, eps: 0.2 }`, authored tone 50 stores 63.89 in `light` (instead of 52.47) and 62.95 in `lightContrast`.

### Saturation

```text
S_dark = S_light × (1 − darkDesaturation)      // dark and darkContrast
```

- Skipped for `mode: 'static'`.
- Bypassed when the dark saturation is authored: always for a per-color `darkSaturation`, and for a theme `darkSaturation` seed on every color that reads the seed. A [`from`](./color-definitions.md#from) color without its own `saturation` or `darkSaturation` starts from the literal's saturation instead, so a seed `darkSaturation` doesn't bypass its reduction. See [Dark seed](../schemes.mdx#dark-seed).
- `darkDesaturation` clamps to 0–1 where it is set, so it can remove at most all of a color's saturation and never adds any: `2` acts as `1` (dark variants go gray) and `-0.5` as `0`. A non-finite value throws.

With seed saturation 80 and the default `0.1`, an `auto` color's saturation is `0.8` in `light` and `0.72` in `dark` and `darkContrast`; a `static` one stays `0.8`.

### Hue

Hue isn't mapped. Dark variants re-anchor relative hues to the theme's `darkHue` seed and use a per-color `darkHue` when one is set. An absolute per-color `hue` (or a `from` color's literal hue, when it has no `hue` or `darkHue`) is kept as is, and `static` colors ignore both. See [Dark seed](../schemes.mdx#dark-seed) and [`darkHue` / `darkSaturation`](./color-definitions.md#dark-seed-darkhue--darksaturation).

## Validation

Glaze validates a theme's definitions when it resolves — on the first `resolve()` or output call after the definitions change, not when you call `colors()`. Graph errors throw; recoverable numeric bounds are clamped; a physically unreachable target pins to the limit of its search and warns; risky combinations resolve and warn.

### Errors

| Condition | Message |
| --- | --- |
| `contrast` without `base` (theme color) | `glaze: color "a" has "contrast" without "base".` |
| Relative `tone` without `base` (theme color), in either entry of a pair (`[50, '+20']` included) | `glaze: color "a" has relative "tone" without "base".` |
| No absolute `tone`, no `from`, and no `base` | `glaze: color "a" must have either absolute "tone" (root), "from" (a literal color), or "base" (dependent).` |
| `from` can't be parsed | `glaze: color "a" has an invalid "from" value. glaze: invalid hex color "#zzz".` |
| `contrast` pair switches metric (`[4.5, { apca: 75 }]`), regular or mix | `glaze: color "a" has a "contrast" pair that switches metric (wcag → apca). A WCAG ratio and an APCA Lc are different scales; use one metric for both entries, e.g. { wcag: [normal, highContrast] }.` |
| `base` names a missing color | `glaze: color "a" references non-existent base "nope".` |
| `base` names a shadow or glow | `glaze: color "b" base "a" references a glow color.` |
| Shadow / glow `bg` or `fg` names a missing color | `glaze: shadow "a" references non-existent bg "nope".` |
| Shadow / glow `bg` or `fg` names a shadow or glow | `glaze: glow "b" bg "a" references a shadow color.` |
| Mix `base` names a missing color | `glaze: mix "a" references non-existent base "nope".` |
| Mix `target` names a missing color | `glaze: mix "a" references non-existent target "nope".` |
| Mix `base` / `target` names a shadow or glow | `glaze: mix "a" target "sh" references a shadow color.` |
| Circular reference through `base`, `bg`, `fg`, or a mix's `base` / `target` | `glaze: circular base reference detected involving "a".` |
| Non-finite or non-number `contrastLevel` other than `'auto'` (thrown by `configure()`, or when an instance with such an override resolves) | `glaze: contrastLevel must be a finite number 0–100 or 'auto' (got NaN).` |
| Non-finite or non-number `darkDesaturation` (same two places) | `glaze: darkDesaturation must be a finite number 0–1 (got NaN).` |
| Tone window with `lo` above `hi` (same two places, for `lightTone` or `darkTone`) | `glaze: lightTone lo (90) is above hi (20). A window runs from its dark end to its light end: [lo, hi] with lo ≤ hi, e.g. [20, 90].` |
| Tone window endpoint that isn't a finite number | `glaze: lightTone lo must be a finite number (got NaN).` |
| Object tone window whose `eps` isn't a finite number above 0 and at most `1e6` (missing included) | `glaze: lightTone eps must be a finite number above 0 and at most 1e6 (got 0).` |
| Tone window that isn't `[lo, hi]`, `{ lo, hi, eps }`, or `false` (`null` included) | `glaze: lightTone must be [lo, hi], { lo, hi, eps }, or false (got [10]).` |
| Glow `headroom` that isn't a finite number ≥ 0: in `glowTuning` (same two places), a glow's `tuning` (at resolve), or `glaze.glow()` | `glaze: glowTuning.headroom must be a finite number ≥ 0 — stops above SDR white (got -1).` The prefix names the source (`glow "g" tuning`, `glaze.glow() tuning`), and the value is shown as written: `(got "2")`, `(got [1])`. |
| `headroom` in `shadowTuning`, a shadow's `tuning`, or `glaze.shadow()` | `glaze: shadowTuning.headroom is not supported — a shadow darkens toward black, and nothing goes below black. Headroom is for glows (glowTuning or a glow's tuning).` |

### Color value errors

Every place that takes a `GlazeColorValue` — a theme color's `from`, `glaze.color()`, and the `bg` / `fg` of `glaze.shadow()` / `glaze.glow()` — uses one parser. It throws immediately for standalone calls; for `from` the message is wrapped in the color's name (above).

| Input | Message |
| --- | --- |
| Hex of the wrong length (not 3, 4, 6, or 8 digits) or with non-hex digits | `glaze: invalid hex color "#zzz".` |
| A string that isn't hex or `rgb()` / `rgba()` / `hsl()` / `hsla()` / `okhsl()` / `okhst()` / `oklch()` (named colors included) | `glaze: unsupported color string "red".` |
| A color function without exactly 3 components (alpha aside) | `glaze: expected 3 components in "rgb(1 2)".` |
| `{ h, s, l }` with a non-finite field | `glaze.color: OkhslColor h/s/l must be finite numbers.` |
| `{ h, s, l }` with `s` or `l` above 1.5 | `glaze.color: OkhslColor s/l must be in 0–1 range. Did you mean the structured form { hue, saturation, tone } (which uses 0–100)?` |
| `{ h, s, t }` with a non-finite field, or `s` / `t` above 1.5 | `glaze.color: OkhstColor h/s/t must be finite numbers.` / `glaze.color: OkhstColor s/t must be in 0–1 range. …` |
| `{ r, g, b }` with a channel outside 0–255 | `glaze.color: RgbColor r must be a finite number in 0–255 (got 300).` |
| `{ l, c, h }` with a non-finite field, or `l` / `c` above 1.5 | `glaze.color: OklchColor l/c/h must be finite numbers.` / `glaze.color: OklchColor l/c must be in 0–1 range (matching oklch() strings).` |
| An `[r, g, b]` array | `glaze.color: RGB tuple [r, g, b] is no longer supported — use { r, g, b } instead.` |

Errors specific to the structured `glaze.color()` input, restoring snapshots, and building palettes are listed on [Color tokens](./color-tokens.md), [Themes](./theme.md#glazethemefromdata--glazefromdata), and [Palettes](./palette.md).

### Allowed without `base`

| Condition | Behavior |
| --- | --- |
| `tone: 'max'` / `'min'` | A root color at the scheme's tone extreme. |
| `contrast` without `base` in `glaze.color()` | Measured against the token's own input color. |
| A tone delta (`tone: '+N'`, or in either entry of a pair) without `base` in `glaze.color()` | Measured from the token's own input color. |

### Clamped silently

| Value | Range |
| --- | --- |
| Resolved `tone` | 0–100 |
| Per-color `saturation` / `darkSaturation` factor | 0–1 |
| Shadow / glow `intensity` | 0–100 (an unreachable step then warns) |
| Lighting `tint`, `reach`, `hueBleed` | 0–1. `objectInfluence` isn't clamped; the object factor `k` floors at 0. |
| Mix `value` | 0–100 |
| `contrastLevel` | 0–100 |
| `darkDesaturation` | 0–1 |
| Tone window `lo` / `hi` | 0–100 (after the `lo ≤ hi` check) |
| WCAG numeric target | At least 1 |
| APCA numeric target | Its magnitude (`-60` → `60`) |

A tone delta that overshoots `[0, 100]` mirrors to the other side of its base when `autoFlip` is on; if the mirror also overshoots, it clamps on the authored side. With `autoFlip: false` it clamps on the authored side. For example, a `'static'` color with `tone: '-20'` on a static base at tone 10 resolves to 30 with `autoFlip` and to 0 without, in every scheme; with `'-60'` on a base at 50 it resolves to 0 either way. An `'auto'` child gets the same results in light. In dark it mirrors around wherever the base sits, by the anchor rule in [Adaptation modes](#adaptation-modes): with `autoFlip`, the +20 it took in light turns into a step down from tone 10, runs off the scale, and stops at the dark window's edge, 9.25; without it, the `'-20'` becomes 17.3 tones up, 27.3. The flip is always decided in light, and dark mirrors whichever side light took, with two dark-only clamps (a step off the scale, a base past the dark window) listed under [Tone values](./color-definitions.md#tone-values).

### Resolved with a warning

| Condition | Result |
| --- | --- |
| A regular color's `contrast` floor is out of reach | Pins to the extreme of the side searched first; [contrast unmet](#contrast-unmet) warning. |
| A mix's `contrast` floor is out of reach | Pins to the end of the base → target range it searched; [mix contrast unmet](#mix-contrast-unmet) warning. |
| A shadow / glow step is out of the pigment's reach | Pins to the pigment's strongest composite (or stays transparent if it can't move the surface at all); [lighting](#shadow-or-glow-out-of-reach) warning. A glow whose HDR value covers the step doesn't warn. |
| A glow step past white that its `headroom` cap leaves short | The HDR value pins at the cap, `2^headroom` on the brightest channel; the HDR form of the [lighting](#shadow-or-glow-out-of-reach) warning. |
| A glow `headroom` above 2 | Clamps to 2; [headroom clamped](#headroom-clamped) warning. |
| `contrast` and `opacity` on the same color | Resolves the floor for the opaque color; [contrast and opacity](#contrast-and-opacity) warning. |
| A color string with an alpha component (`#rrggbbaa`, `rgb(… / a)`) where Glaze has no opacity field | Alpha dropped; [alpha dropped](#alpha-dropped) warning. |

An unmet mix normally pins to the pure target. A mix whose value is already 100, including the high-contrast entry of `value: [80, 100]`, can only search toward the base, so when its pure target misses the floor it pins to the pure base instead. A pure target that clears the floor, even inside the solver's margin, is kept.

## Warnings

Glaze reports problems it can recover from through `console.warn`, always prefixed with `glaze:`. Nothing is thrown.

| Warning | Emitted when | Deduplicated |
| --- | --- | --- |
| [Contrast unmet](#contrast-unmet) | The solver can't reach a regular color's floor in a scheme. | Yes |
| [Mix contrast unmet](#mix-contrast-unmet) | The solver can't reach a mix's floor in a scheme. | Yes |
| [Contrast drift](#contrast-drift) | A chromatic color the solver reported as meeting its floor measures under it after resolution. | Yes |
| [Shadow or glow out of reach](#shadow-or-glow-out-of-reach) | A `shadow` / `glow` step exceeds what its pigment can do, or a glow's `headroom` cap leaves its step short. | Yes |
| [Headroom clamped](#headroom-clamped) | A glow `headroom` above 2 is clamped. | Yes |
| [Contrast and opacity](#contrast-and-opacity) | A regular color has both `contrast` and `opacity`. | No — once per resolve |
| [Alpha dropped](#alpha-dropped) | A color value carries alpha that Glaze discards. | No |
| [Percentage scale](#percentage-scale) | A `format*` writer gets a value above 1. | Once per writer |
| Palette collision | Two palette themes produce the same token name. See [Collision detection](./palette.md#collision-detection). | No |

The first five share one session cache of 256 keys, which starts over when full. A key includes the color name, scheme, target, and measured value (for a clamp, the field and value), so a dev server that re-resolves on every change prints each distinct problem once. Resolved themes are cached until their definitions or the config change, so the contrast-and-opacity warning prints once per actual resolve. The alpha-dropped warning for a theme color's `from` can print several times within one resolve, since the value is parsed more than once.

### Contrast unmet

```text
glaze: color "badge-text" cannot meet WCAG 7.00 in light scheme
  (got 4.94).
Try widening the tone window, lowering the contrast target, or picking
  a base color further from this color's tone.
```

Fires when the result is more than 2% under a WCAG target, or more than 1.5 Lc under an APCA target (the solver aims slightly past the target, so smaller shortfalls are rounding). The scheme is `light`, `dark`, `lightContrast`, or `darkContrast`; APCA targets print as `APCA Lc 75.0`. Standalone tokens print their `name` option, or `"value"` when it isn't set. Fixes: [When a floor can't be met](../contrast.mdx#when-a-floor-cant-be-met).

### Mix contrast unmet

```text
glaze: mix "accent-wash" cannot meet WCAG 4.50 against its base in
  light scheme (got 3.54).
Even the pure target falls short; try lowering the contrast target or
  mixing toward a color further from the base.
```

This one is for `accent-wash: { type: 'mix', base: 'surface', target: 'accent', value: 10, contrast: 'AA' }` in `glaze(280, 80)`, with `surface` at tone 97 and `accent` at tone 55. It uses the same margins and scheme labels as [contrast unmet](#contrast-unmet), measured between the mix and its `base`. `got` is the contrast of the value the mix settled at: the pure target, or the pure base when the value is already 100 (`got 1.00`, or `0.00` for an APCA floor). Fixes: [Contrast on mixes](../mixes.mdx#contrast-on-mixes).

### Contrast drift

```text
glaze: color "link" drifts below WCAG 4.50 in light scheme
  (measured <ratio>).
Chromatic luminance differs from the gray tone; nudge the tone or
  saturation if the floor matters.
```

After all schemes resolve, Glaze re-measures every regular color with `contrast` and `base` against its base, in the floor's metric and the color's role polarity, with the same margins. It skips a variant whose floor the solver reported as unmet, which already has its [contrast unmet](#contrast-unmet) warning, and an achromatic variant (saturation 0), whose tone is exact. The solver measures the real chromatic color, so a floor it meets passes this check too: the advisory is a safety net and normally stays silent. Mixes are not re-measured; an unmet mix has [its own warning](#mix-contrast-unmet). At an effective `contrastLevel` of 100, global or per instance, the high-contrast slots are skipped because they mirror the normal ones. Background: [Chromatic drift advisory](../contrast.mdx#chromatic-drift-advisory).

### Shadow or glow out of reach

```text
glaze: glow "g" cannot reach a 5.0-tone step in light scheme
  (reached 0.0 at full strength).
Lower the intensity, move the surface away from white, or raise a
  tuned-down `reach`.
```

Fires when the composite lands more than 0.05 tones short of `intensity × k`. The standalone functions name themselves instead of a color and omit the scheme: `glaze: glaze.glow() cannot reach a 5.0-tone step (reached 0.0 at full strength). …`. A shadow's message suggests moving the surface away from black. See [Unreachable steps](../shadows-and-glows.mdx#unreachable-steps).

With a [`headroom`](#glow-headroom), a glow whose HDR value covers the step prints nothing. One the cap leaves short gets this form instead, here for a 30-tone glow on a tone-100 surface at `headroom: 1`:

```text
glaze: glow "big" cannot reach a 30.0-tone step in light scheme even
  with 1 stop of headroom (reached 22.0).
Lower the intensity or raise `headroom`.
```

At `headroom: 2` the advice reads ``Lower the intensity; `headroom` is already at its 2-stop maximum.`` A glow whose pigment can't lift a non-white surface at all (`reach: 0` on a gray surface, say) gets no HDR value and keeps the first form. On a chromatic surface a `reach: 0` pigment is a gray at the surface's tone that can be slightly brighter than the surface: it then pins at full opacity and, past white, gets an HDR value like any pinned pigment.

### Headroom clamped

```text
glaze: glowTuning.headroom 3 is above the 2-stop maximum; using 2.
Headroom counts stops (doublings of SDR white's luminance), not a
  ratio: 1 stop is 2× white, 2 stops 4×.
```

A `headroom` above 2 is likely a ratio typed where stops were meant (`4` for "4× white"). The prefix names where the value came from: `glowTuning`, `glow "g" tuning`, or `glaze.glow() tuning`. Printed once per field and value, and only after the whole `configure()` call, instance override, or color map has validated, so a call that throws on another field leaves the warning for the corrected retry.

### Contrast and opacity

```text
glaze: color "text" has both "contrast" and "opacity".
Opacity makes perceived tone unpredictable.
```

Emitted during validation. For a translucent color with a floor, use a [transparent mix](../mixes.mdx).

### Alpha dropped

```text
glaze: alpha component dropped from "#ffffff80"
  (standalone color has no opacity field).
```

Any color string Glaze parses — a `from` value, a `glaze.color()` value, or a `glaze.shadow()` / `glaze.glow()` input — keeps only its color. Use `opacity` on a regular color, or a transparent mix, for translucency.

### Percentage scale

```text
glaze: formatRgb() got a value above 1 — it takes the 0-1 factors every
  Glaze producer returns (resolve(), variantToOkhsl, srgbToOkhsl), not
  0-100 percentages.
Divide by 100, or drop the "* 100" left over from the pre-2.0 signature.
```

The [format writers](./utilities.md#format-writers) take `s` / `l` / `t` on 0–1. A value above 1 can only be pre-2.0 percentage input, so each writer warns the first time it sees one in the process (and still formats the value). Upgrade notes: [2.0 — `format*` takes 0–1](../migration.md#20--format-takes-01).
