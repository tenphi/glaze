# OKHST — the contrast-uniform tone space

This is the canonical specification for the color model Glaze uses internally
and accepts as input. It is the source of truth that [api.md](api.md),
[methodology.md](methodology.md), and [migration.md](migration.md) reference.

## What OKHST is

**OKHST is OKHSL with its lightness axis replaced by a contrast-uniform _tone_
axis.** It shares OKHSL's hue (`h`, 0–360) and saturation (`s`, 0–1) verbatim;
only the third coordinate changes:

| Space | Coords | Third axis |
|---|---|---|
| OKHSL | `h, s, l` | `l` — perceptual lightness (toe-adjusted OKLab L) |
| OKHST | `h, s, t` | `t` — tone: a normalized log of luminance |

OKHST exists for one reason: in OKHSL, _equal lightness steps_ are perceptually
even but produce _uneven contrast_ (the ratio between adjacent steps drifts).
OKHST's tone axis is shaped so that _equal tone steps_ produce _even WCAG
contrast_ between steps. Authoring ramps in tone gives you contrast-even ladders
for free, and dark-mode inversion becomes a single subtraction (`100 - t`)
instead of a fitted curve.

OKHST is an **input space only**. It is parseable as an `okhst(H S% T%)` string
and an `{ h, s, t }` object, but it is **never emitted** — there is no CSS
`okhst()` function, so output formats stay `okhsl | rgb | hsl | oklch`.

## The tone transfer

For a gray (s = 0) at OKHSL lightness `l`, luminance is closed-form through the
OKHSL toe and OKLab cube:

```
Y = toeInv(l) ** 3          // OKLab L = toeInv(l); luminance ≈ L³
l = toe(cbrt(Y))            // exact inverse
```

(`toe` / `toeInv` already exist in [okhsl-color-math.ts](../src/okhsl-color-math.ts).)

Tone is a normalized natural-log of `Y`, offset by a small `eps`:

```
toTone(Y, eps)   = (ln(Y + eps) - ln(eps)) / (ln(1 + eps) - ln(eps)) * 100
fromTone(T, eps) = exp( (T / 100) * (ln(1 + eps) - ln(eps)) + ln(eps) ) - eps
```

`toTone` and `fromTone` are exact analytic inverses, so a round-trip is lossless
to ~1e-15. `toTone(0) = 0` and `toTone(1) = 100` for any `eps`, so tone is always
a clean 0–100 scale.

### Why `eps ≈ 0.05` makes tone contrast-uniform

WCAG 2 contrast is `(Y_hi + 0.05) / (Y_lo + 0.05)`. Pick `eps = 0.05` and the
tone transfer becomes a normalized `ln(Y + 0.05)`. Two colors that differ by a
fixed tone delta `ΔT` then differ by a fixed _ratio_ of `(Y + 0.05)` — i.e. a
fixed WCAG contrast ratio — regardless of where on the scale they sit:

```
cr(T2, T1) = (Y2 + 0.05) / (Y1 + 0.05)
           = exp( (T2 - T1)/100 * (ln(1.05) - ln(0.05)) )
```

Empirically (gray, `eps = 0.05`), each `+10` tone multiplies contrast-vs-black by
a near-constant factor:

| tone | cr vs black |
|---|---|
| 10 | 1.36 |
| 30 | 2.49 |
| 50 | 4.58 |
| 70 | 8.43 |
| 90 | 15.49 |
| 100 | 21.00 |

So a tone ramp `[20, 40, 60, 80]` has _constant_ contrast between adjacent
stops. That is the whole point.

## Core invariant: `T → L` is independent of `H` and `S`

`okhstToOkhsl({ h, s, t })` passes `h` and `s` through unchanged and sets
`l = fromTone(t)`. `fromTone` is a pure function of `(t, eps)`; OKHSL's
`l → OKLab L = toeInv(l)` map has no hue/saturation term — `h`/`s` enter only
the chroma/cusp math. Therefore:

> **A given tone yields the same OKHSL lightness for every hue and saturation.**

OKHST inherits OKHSL's gamut and reversibility exactly: every `(h, s, t)` is
realizable and round-trips.

**This uniformity is in lightness, not luminance.** Equal tone gives equal
OKHSL `L` for all `h`/`s`, but equal _WCAG/APCA contrast_ only for grays.
A saturated yellow and a saturated blue at the same tone share a lightness yet
differ in real luminance `Y`. This chromatic drift is the one honest
approximation in the design — see [§10 Verification](#verification-apca--wcag-drift).
The single deliberate exception to the invariant is the optional `contrast`
solver, which shifts a stop's tone per `h`/`s` to meet a luminance-based floor.

## Reference eps vs per-mode eps

Two distinct roles, kept separate on purpose:

- **Reference eps (`0.05`, fixed).** Defines the OKHST _color space_ and the
  canonical stored tone. `okhst()` input, `{ h, s, t }` input, the internal
  `ResolvedColorVariant.t`, relative `tone` offsets, and the contrast solver all
  use the reference eps. This is what makes OKHST stable and scheme-independent.
- **Per-mode eps (`lightTone.eps`, `darkTone.eps`).** A _rendering_ curvature
  knob per scheme. It only affects how authored tone is mapped through a scheme
  window before the result is stored. Defaults to the reference value, so by
  default the two coincide and there is nothing to reconcile.

When a mode's eps differs from the reference, `mapToneForScheme` maps using the
mode eps to land a final OKHSL `l`, then stores `toTone(l, REF_EPS)` so offsets
and contrast stay comparable across schemes.

## Scheme pipeline (no Möbius)

```
author tone T (0–100)
  → mode branch:
      auto + dark : invert  T' = 100 - T
      fixed / light: keep    T' = T
      static      : identity, skip window
  → window remap: T' into the scheme window [lo, hi] (tone units)
  → render curvature (mode eps) → OKHSL l
  → store canonical tone t = toTone(l, REF_EPS)        // variant {h, s, t, alpha}
  → (edge only) fromTone(t, REF_EPS) → l → sRGB / luminance
  optional: contrast floor (wcag/apca) searches in tone, overriding t
```

High-contrast is **not** a separate curve. It reuses the same math with the
window forced to the full range `[0, 100]`, keeping the mode's eps. There is no
`darkCurve` and no separate HC curve.

`fixed` mode remaps into the window but does **not** invert (brand colors stay
recognizable). `static` skips the window entirely (identity) so the same tone
renders in every scheme.

## Calibrated constants (defaults)

Chosen as clean defaults that keep light mode close to the previous pipeline
while the axis stays contrast-uniform (the old Möbius curve was intentionally
non-uniform, which is what we are replacing). The light floor sits at `lo = 10`
and the dark floor at `lo = 15`, so neither scheme bottoms out darker than the
legacy pipeline produced. `eps` is pinned to the reference value `0.05` so the
tone axis stays WCAG-uniform.

| Config | lo | hi | eps |
|---|---|---|---|
| `lightTone` | 10 | 100 | 0.05 |
| `darkTone` | 15 | 95 | 0.05 |

A window is authored as `[lo, hi]` (reference eps — the common form),
`{ lo, hi, eps }` (advanced: explicit per-mode render curvature), or `false`
to disable clamping. `false` is the full range `[0, 100]` at the reference eps —
it removes the **boundaries**, not the tone curve.

Other defaults: `darkDesaturation = 0.1` (unchanged), `saturationCeiling = 0.9`,
`autoFlip = true`.

Reference: `REF_EPS = 0.05`.

## Saturation taper (cusp-anchored)

Toward the lightness extremes the realizable (in-gamut) chroma collapses, so
high saturation near white/black reads as noise. The taper reduces chroma there
with a curve that is **correct for any hue** and **asymmetric per end** — not a
fixed-midpoint tent. It is anchored at the hue's gamut **cusp** (where
realizable chroma peaks) rather than at mid-lightness, which makes it
hue-correct by construction: warm hues peak light, cool hues peak dark.

`saturationCeiling(s, l, h, s_max)` runs at the `T → OKHSL` edge, **after** tone
inversion + window remap have produced the rendered lightness `l`. Keying on
rendered `l` (not authoring tone) is deliberate — the cusp is an OKHSL-lightness
property, so a swatch rendered near white always gets the light-end shoulder and
one rendered near black always gets the dark-end shoulder, in **both** schemes,
with no per-mode inversion of the taper.

```
lc = cuspLightness(h)                         // OKHSL cusp lightness, cached per hue
d  = (l <= lc) ? (lc - l)/lc : (l - lc)/(1 - lc)   // 0 at cusp, 1 at the nearest extreme
w  = (l <= lc) ? W_DARK : W_LIGHT             // plateau half-width per end
f  = 1 - smoothstep(w, 1, d)                  // f=1 out to the plateau, eases to 0 at the extreme
cap = s_max * f
s' = min(s, cap)                              // a ceiling, not a scale
```

`min(s, cap)` applies the taper as a **ceiling** that follows the cusp shape: it
only bites colors that ask for more chroma than looks good at that lightness and
leaves intentionally muted colors untouched (multiplying by `f` would
over-desaturate already-soft colors). It is achromatic-safe (`min(0, cap) = 0`)
and consistent at the extremes, where gamut already forces chroma to zero.

The shoulders are **mode-independent**; the two widths differ only by *end*
because the color solid does not taper symmetrically toward black and white:

| Param | Default | Role |
|---|---|---|
| `W_DARK` | `0.45` | plateau half-width toward black (internal constant) |
| `W_LIGHT` | `0.40` | plateau half-width toward white (internal constant) |
| `saturationCeiling` (`s_max`) | `0.9` | global chroma ceiling — the one config lever; `false` disables |

If dark mode ever reads hot, lower a single global `s_max`; halation tracks
contrast-against-background, not theme, so there is no per-mode shoulder.

Because the taper changes chroma → luminance → contrast, the
[APCA / WCAG drift verification](#verification-apca--wcag-drift) below applies to
near-extreme steps after the taper.

## Contrast metric (unified)

`contrast` is a single prop with a pluggable metric:

```ts
type ContrastSpec =
  | number                 // bare WCAG ratio
  | ContrastPreset         // 'AA' | 'AAA' | 'AA-large' | 'AAA-large' (WCAG)
  | { wcag: HCPair<number | ContrastPreset> }
  | { apca: HCPair<number> };

contrast?: HCPair<ContrastSpec>;
```

A bare number or preset means WCAG. The `[normal, highContrast]` pair may live at
the outer level (`[4.5, 7]`, `[{ wcag: 4.5 }, { wcag: 7 }]`) **or** inside the
metric (`{ wcag: [4.5, 7] }`, `{ apca: [45, 60] }`). `resolveContrastForMode`
peels the outer pair by mode, then the inner metric pair by the same mode, then
resolves presets, returning `{ metric, target }`.

The solver searches in **tone** (contrast-uniform → fast convergence and a
closed-form WCAG seed). For WCAG, the seed is the tone whose gray luminance hits
`Y = R·(Y_base + 0.05) − 0.05`; chromatic drift is then refined by binary search.
For APCA, it binary-searches tone against the APCA Lc target.

### APCA

`apcaContrast(yText, yBg)` implements SAPC/APCA Lc (soft-clamp of low luminances
plus the polarity exponents for normal vs reverse contrast), returning a signed
Lc whose magnitude the solver compares against the target. Its inputs are APCA
*screen* luminances `Ys = 0.2126·R^2.4 + 0.7152·G^2.4 + 0.0722·B^2.4` over the
gamma-encoded channels (`apcaLuminanceFromLinearRgb`), **not** WCAG relative
luminance — the soft-clamp constants are calibrated against `Ys`, so the solver
feeds it the matching basis. This is a faithful-but-simplified APCA (it omits
the spatial/font-size lookup that maps Lc to a usable text size).

## Verification (APCA / WCAG drift)

Because chromatic swatches inherit gray's tone-derived lightness but drift in
real luminance, a color resolved with a `base` + `contrast` may land slightly
under the contrast its tone implies. After resolving such a color, Glaze
computes the actual WCAG ratio and APCA Lc of the chromatic result against its
base and emits a deduped `console.warn` when it drifts below the gray-tone
expectation. This is advisory: it surfaces the one approximation rather than
hiding it. The dedupe cache is the existing 256-entry cache in
[warnings.ts](../src/warnings.ts).

## Migration from `lightness`

`lightness` (OKHSL `l`, 0–100) is replaced by `tone` (0–100). They are **not**
the same number — tone is the contrast-uniform reparameterization. To convert an
old absolute `lightness: L` to the equivalent `tone`, use
`toTone(L/100, 0.05)`. See [migration.md](migration.md) for the full guide and
a conversion table.
