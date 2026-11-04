---
title: Contrast and high contrast
description: HCPair, ContrastSpec and its WCAG and APCA presets, high-contrast escalation, and the manual contrast level.
---

This page lists the contrast types, presets, and rules. For how the solver finds a tone, when to pick WCAG or APCA, and live examples, see [Contrast solving](../contrast.mdx). For how a color adapts across schemes, see [Light, dark, and high contrast](../schemes.mdx).

```ts
import type {
  HCPair,
  ContrastSpec,
  MinContrast,
  ContrastPreset,
  ApcaPreset,
} from '@tenphi/glaze';
```

## `HCPair<T>`

A value used in both contrast tiers, or an explicit `[normal, highContrast]` pair:

```ts
type HCPair<T> = T | [T, T];
```

The first entry drives the `light` and `dark` variants, the second `lightContrast` and `darkContrast`. A single value applies to both.

| Field | Type | Pair example |
| --- | --- | --- |
| `tone` on a [regular color](./color-definitions.md#regularcolordef) | `HCPair<ToneValue>` | `tone: ['-8', '-16']` |
| `contrast` on a regular or [mix](./color-definitions.md#mixcolordef) color | `HCPair<ContrastSpec>` | `contrast: [4.5, 7]` |
| `intensity` on a [shadow or glow](./color-definitions.md#shadowcolordef--glowcolordef) | `HCPair<number>` | `intensity: [8, 14]` |
| `value` on a [mix](./color-definitions.md#mixcolordef) | `HCPair<number>` | `value: [10, 20]` |
| `tone` and `contrast` on a [color token](./color-tokens.md) | `HCPair<…>` | `tone: [74, 80]` |

```ts
tone: '-8'; // -8 in normal and high contrast
tone: ['-8', '-16']; // -8 normal, -16 high contrast
contrast: { apca: 'content' }; // preset, auto-escalated in high contrast
contrast: { apca: ['content', 'body'] }; // explicit normal / HC targets
```

For `contrast`, the pair can wrap the whole spec or sit inside the metric (see [`ContrastSpec`](#contrastspec)). An explicit high-contrast value in either position turns off the automatic [escalation](#high-contrast-escalation) for that color.

Under a numeric [`contrastLevel`](#manual-contrast-level), the normal variants are resolved between the two entries.

## `ContrastSpec`

A contrast floor with a choice of metric:

```ts
type ContrastPreset = 'AA' | 'AAA' | 'AA-large' | 'AAA-large';
type ApcaPreset =
  | 'preferred'
  | 'body'
  | 'content'
  | 'large'
  | 'non-text'
  | 'min';

type MinContrast = number | ContrastPreset; // a bare WCAG target

type ContrastSpec =
  | number // WCAG ratio
  | ContrastPreset // WCAG preset
  | { wcag: HCPair<number | ContrastPreset> }
  | { apca: HCPair<number | ApcaPreset> }; // APCA Lc target
```

Every `contrast` field takes `HCPair<ContrastSpec>`: [`RegularColorDef`](./color-definitions.md#contrast), [`MixColorDef`](./color-definitions.md#mixcolordef), and the [color token](./color-tokens.md) inputs.

| Form | Metric | Example | Normal | High contrast |
| --- | --- | --- | --- | --- |
| Number | WCAG | `contrast: 4.5` | 4.5 | 4.5 |
| WCAG preset | WCAG | `contrast: 'AAA'` | 7 | 7 |
| `{ wcag }` | WCAG | `contrast: { wcag: 6 }` | 6 | 6 |
| Outer pair | WCAG | `contrast: [4.5, 7]` | 4.5 | 7 |
| Inner pair | WCAG | `contrast: { wcag: [4.5, 7] }` | 4.5 | 7 |
| Pair of objects | WCAG | `contrast: [{ wcag: 4.5 }, { wcag: 7 }]` | 4.5 | 7 |
| `{ apca }` number | APCA | `contrast: { apca: 60 }` | Lc 60 | Lc 75 (escalated) |
| `{ apca }` preset | APCA | `contrast: { apca: 'content' }` | Lc 60 | Lc 75 (escalated) |
| Inner APCA pair | APCA | `contrast: { apca: [45, 60] }` | Lc 45 | Lc 60 |
| Inner APCA preset pair | APCA | `contrast: { apca: ['content', 'body'] }` | Lc 60 | Lc 75 |

- A bare number or preset means **WCAG**. Use `{ wcag }` / `{ apca }` to name the metric.
- A WCAG number below `1` is treated as `1`. A negative APCA number uses its magnitude.
- The floor is measured against the color's `base`, in each scheme separately. It is a floor, not a target: a color whose preferred tone already passes keeps it, and one that misses moves only as far as the floor requires. How the search works, `autoFlip`, and unreachable targets are covered in [Contrast solving](../contrast.mdx#how-the-solver-finds-a-tone).
- WCAG is symmetric. APCA is not, so a color's [role](./color-definitions.md#roles) decides which side of the pair is measured as text.
- On a theme color, `contrast` requires `base`. Without one, validation throws `glaze: color "<name>" has "contrast" without "base".` On a [color token](./color-tokens.md#pairing-colors) without a `base`, the floor is measured against the token's own input color.
- `contrast` together with `opacity` emits a `console.warn`: a translucent color has no fixed perceived tone.
- A floor that is physically unreachable pins a regular color or token to the extreme of the side the solver searched first (not necessarily the closer one) and warns. A mix pins its ratio or opacity to the end of the range it searched, without a warning: normally the pure target, but a mix whose value is already 100 (including the high-contrast entry of `value: [80, 100]`) can only search toward the base, so it pins to the pure base. Tone is contrast-uniform for grays, so a chromatic color can also land slightly under its floor; Glaze measures the result and emits a deduped advisory. See [When a floor can't be met](../contrast.mdx#when-a-floor-cant-be-met) and [Warnings](./configuration.md#warnings).

### WCAG presets

`ContrastPreset`:

| Preset | Ratio | WCAG criterion | High-contrast successor |
| --- | --- | --- | --- |
| `'AA-large'` | 3 | SC 1.4.3, large text | `'AAA-large'` (4.5) |
| `'AA'` | 4.5 | SC 1.4.3 | `'AAA'` (7) |
| `'AAA-large'` | 4.5 | SC 1.4.6, large text | — (top tier) |
| `'AAA'` | 7 | SC 1.4.6 | — (top tier) |

`resolveMinContrast(value)` maps a `MinContrast` to its ratio; see [Resolving a spec](./utilities.md#resolving-a-spec).

### APCA presets

`ApcaPreset` keywords are the APCA Bronze Simple Mode conformance levels. They don't depend on the role.

| Preset | Lc | Use |
| --- | --- | --- |
| `'preferred'` | 90 | Preferred body and column text |
| `'body'` | 75 | Minimum for body and column text |
| `'content'` | 60 | Readable non-body content (about WCAG AA 4.5:1) |
| `'large'` | 45 | Large or bold headlines; fine icons and outlines (about 3:1) |
| `'non-text'` | 30 | Solid icons and controls; placeholder and disabled text |
| `'min'` | 15 | Dividers and decoration; APCA's point of invisibility |

The same map is exported as `APCA_PRESETS` (see [Constants and types](./utilities.md#constants-and-types)). A raw Lc number works anywhere a preset does.

## High-contrast escalation

Without an explicit high-contrast entry, the `lightContrast` / `darkContrast` variants solve for a stronger floor:

| Authored | Normal | High contrast |
| --- | --- | --- |
| `'AA'`, `{ wcag: 'AA' }` | 4.5 | 7 (`'AAA'`) |
| `'AA-large'`, `{ wcag: 'AA-large' }` | 3 | 4.5 (`'AAA-large'`) |
| `'AAA'`, `'AAA-large'` | 7, 4.5 | Unchanged — already the top WCAG tier. |
| A WCAG number (`4.5`, `{ wcag: 6 }`) | as written | Unchanged — a bare ratio has no successor tier. |
| An APCA number or preset | Lc | Lc + 15, capped at 106. |
| An explicit pair, outer or inner | first entry | second entry, no escalation. |

- **WCAG promotion** follows the spec's own Enhanced level, SC 1.4.3 → SC 1.4.6.
- **APCA Enhanced Level** adds `APCA_HC_ENHANCEMENT` (15 Lc), the Lc analog of AAA over AA, and clamps the result to `APCA_MAX_LC` (106).
- **An explicit high-contrast value** in the outer `contrast` pair or the inner `wcag` / `apca` pair replaces the automatic step. Use one to hold a ceiling. APCA caps large or bold text at Lc 90 to avoid glare, so for a heading write `{ apca: ['preferred', 'preferred'] }` rather than letting high contrast boost it past 90.
- **Other pairs** (`tone`, `intensity`, mix `value`) have no automatic escalation: a single value is used in both tiers.
- **Tone windows** don't apply in high contrast: placement and the contrast search use the full `0–100` tone range. See [Light, dark, and high contrast](../schemes.mdx#high-contrast).

## Metric switching

A `contrast` pair can't switch metric between its entries. A WCAG ratio and an APCA Lc are different scales, so `[4.5, { apca: 75 }]` has no target between its ends, and even without a manual level the two variants would be judged incomparably. Validation throws:

```text
glaze: color "text" has a "contrast" pair that switches metric
  (wcag → apca).
A WCAG ratio and an APCA Lc are different scales; use one metric for
  both entries, e.g. { wcag: [normal, highContrast] }.
```

Pair values inside one metric instead: `{ wcag: [4.5, 7] }` or `{ apca: [60, 90] }`.

## Manual contrast level

`contrastLevel` puts the normal end of the two-tier contrast model on a `0–100` slider. It is a config field, so it works globally, per theme, per token, and through `extend()`:

```ts
import { glaze } from '@tenphi/glaze';

glaze.configure({ contrastLevel: 60 });
const theme = glaze(280, 80, { contrastLevel: 60 });
const brand = glaze.color('#26fcb2', { contrastLevel: 60 });
```

The level moves the **normal** variants, `light` and `dark`. It says nothing about high contrast: `lightContrast` / `darkContrast` stay the true high-contrast resolution at every level, and [`modes.highContrast`](./output.md#output-modes) alone decides whether they are emitted.

| Value | Meaning |
| --- | --- |
| `'auto'` | Default. The normal variants take the authored normal entries as they are. |
| `0` | The same output as `'auto'`, reached through the slider. |
| `100` | The normal variants are the high-contrast ones. Set globally, the separate tier is dropped as a duplicate; see [High-contrast output](#high-contrast-output). |
| `1`–`99` (any number between) | The normal variants are resolved at that level. |

- Levels `0` and `100` reproduce the classic `light` / `dark` and `lightContrast` / `darkContrast` output bit for bit.
- Numbers are clamped to `0–100`. A non-finite number throws `glaze: contrastLevel must be a finite number 0–100 or 'auto' (got NaN).`
- The field is listed with the rest of the config in [`GlazeConfig`](./configuration.md#glazeconfig) and [`GlazeConfigOverride`](./configuration.md#glazeconfigoverride).

### What the level interpolates

Exactly the three things that make a high-contrast variant differ from its normal one:

| Mechanism | At level `L` |
| --- | --- |
| Authored `HCPair`s: `tone`, `contrast`, shadow / glow `intensity`, mix `value` | The two entries are interpolated. |
| The tone-window bypass | Each window endpoint moves linearly toward the full range: light `10 → 0`, dark `15 → 0` and `95 → 100` with the defaults. The render `eps` is not interpolated. |
| Contrast escalation (`AA → AAA`, APCA `+15 Lc`) | Both ends are resolved with the [escalation rules](#high-contrast-escalation), then the numeric target is interpolated. `'AA'` at level 50 solves for 5.75; `{ apca: 'content' }` at level 25 for Lc 63.75. |

The interpolated values go through the ordinary resolve, so a contrast floor at any level is **solved**, not approximated. Which side of its base a solved color prefers is fixed once per half of the ramp; see [Which side of its base a color takes](#which-side-of-its-base-a-color-takes).

They feed the two normal passes only. The high-contrast passes ignore the level and resolve exactly as in `'auto'` mode.

Hue, saturation, `darkDesaturation`, `opacity`, and `pastel` don't vary with high contrast, so the level doesn't change them.

### Un-interpolable tone pairs switch at 50

A pair whose entries are of different kinds has no midpoint: blending them would change *which* resolution rule applies partway up the ramp. These pairs use the normal entry below level 50 and the high-contrast entry from 50 up:

```ts
tone: [50, 'max']; // absolute vs extreme
tone: [50, '+20']; // absolute vs delta (on a color with a base)
tone: ['max', 'min']; // extremes carry no magnitude
```

Same-kind pairs interpolate smoothly: `[30, 20]`, `['-6', '-12']`, `{ wcag: [4.5, 7] }`, `[{ apca: 60 }, { apca: 90 }]`. Numeric pairs (`intensity`, `value`) always interpolate.

A `contrast` pair can't switch metric at all; see [Metric switching](#metric-switching).

### Which side of its base a color takes

[`autoFlip`](./color-definitions.md#autoflip) decides per solve, and its tie-break (when both sides of the base meet the floor, take the one nearer the preferred tone) depends on the target. Along a ramp of targets that tie-break can change, so a naive solve would let a color jump across its own base as the slider moves.

Under a manual level, the side is chosen once per half of the ramp, by a solve at the nearer endpoint's target (level `0` below 50, level `100` from 50 up), and then preferred at every level in that half:

- While the preferred side meets the floor, the color stays there, even where the other side would be nearer its preferred tone.
- The preferred side changes only at level 50, where un-interpolable pairs also switch, and only when the two endpoints land on different sides.
- Flipping is re-ordered, not disabled. At a level where the preferred side can't reach the interpolated target, the solver falls back to the opposite side, so the floor is met wherever either side can meet it. Where neither side can, the color pins to the preferred side's extreme. A color near the limit of what either side can reach can therefore cross its base at other levels, and back again, even when both endpoints land on the same side.

For example, in a gray theme (`glaze(0, 0)`), a static tone-95 color with `contrast: [3, 6]` on a static tone-60 base stays above the base through level 12, where it reaches white, and sits below it from level 13 (tone 19.6) on. White reaches only 3.38:1 against the base, and the target, rising from 3 to 6, passes that at level 12.7.

A color can also cross and come back. In the same theme, black reaches 4.55:1 against a static tone-49.77 base and white 4.61:1. A color on that base with `tone: '-1'` and `contrast: 'AA'` sits below it in light at both endpoints, but at levels 3 and 4 only white meets the rising target, so it moves above the base. From level 5 neither side meets the target, and it pins back to black.

The underlying solver option is `preferInitial` on [`findToneForContrast`](./utilities.md#findtoneforcontrastoptions), for the same behavior in a custom pipeline.

### High-contrast output

The level and the high-contrast tier are independent, and they compose: the slider raises the baseline, and a `prefers-contrast: more` block still escalates on top of whatever level the reader chose.

- `resolve()` returns four variants at every level. `lightContrast` / `darkContrast` are bit-identical to what `'auto'` resolves for those slots.
- [`modes.highContrast`](./output.md#output-modes) alone decides whether the tier is emitted, as in `'auto'` mode. A level doesn't turn it on or off, with the one exception below.
- `css()` ignores `modes` and always returns four strings. At a mid level its `lightContrast` / `darkContrast` strings carry escalated values that differ from the normal ones, so an existing `@media (prefers-contrast: more)` block keeps doing real work.
- A level on a **single theme or token** never changes which modes are emitted: `modes` is global, and one palette sibling must not collapse the shared token structure.

| `contrastLevel` | `modes.highContrast: false` (default) | `modes.highContrast: true` |
| --- | --- | --- |
| `'auto'` or `0` | `light`, `dark` | + `lightContrast`, `darkContrast` |
| `1`–`99` | `light`, `dark` at the level | + the tier, unchanged by the level |
| `100`, set globally | `light`, `dark` equal the high-contrast values | The same: the tier is dropped as a duplicate. |

At a global level of `100` the normal variants *are* the high-contrast ones, so a separate tier would be an exact copy. Glaze emits a single light / dark set and suppresses even an explicit per-call `modes: { highContrast: true }`. A level of `100` set on one theme or token still reports into the tier, with values equal to its own normal ones.

### Driving it at runtime

`configure()` bumps the config version, which invalidates every theme and token cache, so a slider only needs to re-export:

```ts
import { glaze } from '@tenphi/glaze';

const theme = glaze(280, 80);
theme.colors({
  surface: { tone: 97 },
  'surface-text': { base: 'surface', tone: '-52', contrast: 'AA' },
});

const slider = document.querySelector<HTMLInputElement>(
  '#contrast-level',
)!;
const style = document.head.appendChild(document.createElement('style'));

slider.oninput = () => {
  glaze.configure({ contrastLevel: slider.valueAsNumber });
  const { light, dark } = theme.css();
  style.textContent =
    `:root { ${light} }\n` +
    `@media (prefers-color-scheme: dark) { :root { ${dark} } }`;
};
```

A resolve at a manual level runs the same four passes as an `'auto'` one. Only level `100` skips the two high-contrast passes, because the normal passes already produced those values.

### Clearing it, exporting it, base links

- **`configure()` never clears a field by omission.** `glaze.configure({})` keeps the current level. Pass `contrastLevel: 'auto'` to leave manual mode, globally or on one theme of a palette.
- **`.export()` freezes only an authored level.** A level set on the instance, or passed to `.export(override)`, is written to the snapshot. A level inherited from `glaze.configure()` is a live reader preference and is left out, so a restored theme still follows the current slider. `modes` and `states` are never written to a snapshot. See [`theme.export()`](./theme.md#themeexportoverride).
- **Set the level globally, or on both sides of a base link.** A level set on a dependent [color token](./color-tokens.md#pairing-colors) but not on its base token anchors the two at different levels, the same caveat as a per-token `lightTone`. It shows in the high-contrast tier too, since a dependent's high-contrast variant reads its base's high-contrast slots (and at level `100`, the base's mirrored normal ones).

`resolveContrastForLevel(spec, level, polarity?)` resolves a `contrast` spec at a level the same way, for custom pipelines. For levels strictly between `0` and `100` it throws on a pair that switches metric. See [Resolving a spec](./utilities.md#resolving-a-spec).
