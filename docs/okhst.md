# OKHST in Glaze

Glaze uses [OKHST](https://github.com/tenphi/okhst), an OKHSL-derived color
space with a tone axis for stable palette authoring. This page explains how
Glaze applies the model. The standalone repository is the canonical
specification for the transfer functions, derivation, and color-model
invariants.

For practical palette design, continue to [methodology.md](methodology.md). For
every related option and utility, see [api.md](api.md).

## What tone means

OKHST keeps OKHSL hue and saturation and replaces authored lightness with
**tone**:

| Space | Coordinates | Third coordinate     |
| ----- | ----------- | -------------------- |
| OKHSL | `h, s, l`   | Perceptual lightness |
| OKHST | `h, s, t`   | Contrast-shaped tone |

Tone uses a `0–100` authoring scale. Its primary invariant is:

> The same tone maps to the same OKHSL lightness for every hue and saturation.

For neutral colors, equal tone differences produce equal WCAG contrast ratios.
For chromatic colors, they remain a useful progression but are not exact:
hue, saturation, and gamut mapping can change the final sRGB luminance.

This distinction informs two authoring rules:

- Use **tone deltas** for visual spacing within ramps and related UI colors.
- Use `contrast` when a rendered color must meet a measured WCAG or APCA floor.

## Tone vocabulary

### Absolute tone

A numeric `tone` places a color independently on the `0–100` authoring scale:

```ts
surface: {
  tone: 97;
}
```

`'max'` and `'min'` select the corresponding end of the active scheme.

### Tone delta

A **tone delta** is the signed difference between a dependent color and its
base. It is authored as a string:

```ts
border: { base: 'surface', tone: '-8' }
```

Here, `-8` is the tone delta. The base is resolved separately for every scheme,
then the delta is applied to that resolved base. This keeps related colors
visually ordered across light, dark, and high-contrast variants.

### Tone window

A **tone window** is the scheme-specific render range configured by
`lightTone` or `darkTone`:

```ts
glaze.configure({
  lightTone: [10, 100],
  darkTone: [15, 95],
});
```

In Glaze, `lo` and `hi` are OKHSL-lightness boundaries. Authored tone is
positioned within the corresponding tone interval, then converted back to
OKHSL lightness for rendering. The object form adds an advanced render
curvature:

```ts
lightTone: { lo: 10, hi: 100, eps: 0.05 }
```

Pass `false` to use the full range. High-contrast variants always bypass the
ordinary boundaries and use the full range.

## Scheme adaptation

Each regular color has an adaptation `mode`:

| Mode       | Light scheme                   | Dark scheme                                                          |
| ---------- | ------------------------------ | -------------------------------------------------------------------- |
| `'auto'`   | Map into the light tone window | Apply dark tone inversion (`100 - t`), then map into the dark window |
| `'fixed'`  | Map into the light tone window | Map into the dark window without inversion                           |
| `'static'` | Keep the authored tone         | Keep the authored tone                                               |

Use `auto` for surfaces and foregrounds that should exchange light/dark
positions. Use `fixed` for brand fills and inverse surfaces that should stay on
the same side of the scale. Reserve `static` for colors that must not adapt.

**Dark tone inversion** is different from `autoFlip`. Inversion is normal
scheme adaptation controlled by `mode`. `autoFlip` handles a different local
problem: it may reverse an overshooting tone delta or let the contrast solver
try the opposite side of a base.

The regular pipeline is:

```text
authored tone
  -> choose the color's adaptation mode
  -> invert for dark + auto
  -> map through the active tone window
  -> store canonical tone
  -> convert to OKHSL at the rendering edge
```

Dark schemes also apply `darkDesaturation` unless the color is `static`.

## Reference and render epsilon

`REF_EPS = 0.05` defines Glaze's canonical tone scale. It is used for OKHST
input, stored resolved tone, tone deltas, and contrast search.

An object tone window may supply another `eps` as a scheme-specific rendering
control. Glaze still converts the result back to the reference scale so tone
deltas and contrast calculations remain comparable between schemes. Most
palettes should use the default.

## Contrast verification

Tone provides an efficient starting point for contrast solving, but Glaze does
not assume a chromatic tone has the neutral color's luminance. For a color with
`base` and `contrast`, Glaze:

1. resolves both colors for the active scheme;
2. measures the requested WCAG ratio or APCA Lc;
3. searches tone when the requested position misses the floor; and
4. warns when the target is physically unreachable or rendered chroma drifts
   below the expected result.

`contrast` is therefore a floor, not a replacement for tone relationships.
Detailed presets, HC promotion, polarity, and role inference are documented
under [`contrast`](api.md#contrast-floor) and [roles](api.md#roles).

## Input and output

Glaze accepts OKHST through:

```ts
glaze.color('okhst(152 95% 70%)');
glaze.color({ h: 152, s: 0.95, t: 0.7 });
glaze.color({ hue: 152, saturation: 95, tone: 70 });
```

There is no native CSS `okhst()` function. Native exports use `oklch`, `rgb`,
or `hsl`. Tasty integrations may request `format: 'okhst'` because Tasty can
consume Glaze's custom serialization:

```ts
theme.tasty({ format: 'okhst' });
```

## Bringing existing colors into Glaze

When moving raw CSS colors or design tokens into Glaze, use `fromHex()`,
`fromRgb()`, or `glaze.color()` to preserve the source color while you establish
theme seeds and semantic relationships. Then replace one-off values with roots,
tone deltas, and contrast floors as appropriate.

See [migration.md](migration.md#migrating-from-an-existing-color-system) for
the implementation workflow.
