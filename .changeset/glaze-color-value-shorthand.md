---
'@tenphi/glaze': minor
---

Revamp `glaze.color()` with a value-shorthand overload, seed-anchored
contrast solving, a per-call lightness-scaling argument, and a `.css()`
export. `glaze.shadow()` now accepts the same value forms as `glaze.color()`.

**New defaults for `glaze.color()`** — split by input form so end-user
string values (color picker / theme settings) get a natural light/dark
inversion, while programmatic object / tuple / structured inputs keep
predictable linear behavior:

- **String value-shorthand** (hex, `rgb()`, `hsl()`, `okhsl()`,
  `oklch()`): `mode: 'auto'` with snapshotted scaling
  `{ lightLightness: false, darkLightness: [globalConfig.darkLightness[0], 100] }`.
  Light preserves the input exactly; dark Möbius-inverts up to `100`,
  so `glaze.color('#000')` renders as `#fff` in dark mode and
  `glaze.color('#fff')` falls to the dark `lo` floor (default `0.15`).
  The dark `lo` is snapshotted from `globalConfig` at color-creation
  time, matching how an explicit `scaling.darkLightness: [lo, hi]`
  behaves.
- **Object / tuple value-shorthand** (`{ h, s, l }`, `[r, g, b]`) and
  **structured form**: `mode: 'fixed'` with light preserved and dark
  linearly mapped into `globalConfig.darkLightness` (default `[15, 95]`),
  also snapshotted at create time so later `glaze.configure()` calls
  don't retroactively change already-created tokens.
- Override per call via the new third positional argument
  `GlazeColorScaling`: `{ lightLightness?: false | [lo, hi]; darkLightness?: false | [lo, hi] }`.
  `false` disables the remap, a tuple sets a custom window. To opt
  string inputs back into the previous fixed-linear default, pass
  `{ mode: 'fixed' }` as the second arg or supply an explicit
  `scaling`.

**Behavior change (minor bump):**

- String value-shorthand callers will see a Möbius-inverted dark
  variant by default — `glaze.color('#000').resolve().dark.l` is now
  `≈ 1.0`, not `0.15`. To preserve the old fixed-linear behavior pass
  `{ mode: 'fixed' }` as the second argument.
- Structured callers without an explicit `mode` will see
  `glaze.color({...}).resolve().light.l` match the input lightness
  exactly instead of being remapped to `globalConfig.lightLightness`.
  To preserve the old behavior pass
  `{ lightLightness: globalConfig.lightLightness }` as the second
  argument.
- The default lightness windows for object / tuple / structured
  inputs are now snapshotted from `globalConfig.darkLightness` at
  color-creation time, matching the existing behavior for string
  inputs. Tokens created before a `glaze.configure()` call no longer
  pick up the new dark window on their next `.resolve()`. To get the
  old "live config" behavior, recreate the token after `configure()`.

**Value shorthand additions:**

- Accepts hex (`#rgb` / `#rrggbb` / `#rrggbbaa`), the four CSS color
  functions Glaze itself emits (`rgb()`, `hsl()`, `okhsl()`, `oklch()`),
  `OkhslColor` objects (`{ h, s, l }`), and `[r, g, b]` (0–255) tuples
  as the first argument. Every string emitted by `theme.tasty() / .json() / .css()`
  round-trips back through `glaze.color()`.
- 8-digit hex and `rgba()` / `hsla()` / slash-alpha alpha components are
  parsed and dropped with a `console.warn` (standalone colors have no
  opacity field).
- `oklch()` chroma now correctly interprets percent values per CSS Color 4
  (`100% → 0.4`).
- `OkhslColor` and `[r, g, b]` inputs are validated up front with helpful
  error messages — passing 0–100-scale `s`/`l` throws with a hint to use
  the structured form, and out-of-range RGB tuples throw with the offending
  value in the message.

**Anchor model:** by default, relative `lightness: '+N'` and
`contrast: <ratio>` are anchored to the literal seed (the value passed
to `glaze.color()`), so the contrast solver compares against the
unmapped user-provided color across every variant. Pass
`overrides.base` (a `GlazeColorToken`) to anchor against another
color's resolved variant per scheme instead.

**Color pairing via `base`:** `GlazeColorOverrides.base` lets one
standalone color depend on another. Accepts either a `GlazeColorToken`
or any `GlazeColorValue` (hex / `rgb()` / `OkhslColor` / `[r, g, b]`);
raw values are auto-wrapped via `glaze.color(value)` and inherit the
same string-vs-object defaults. When set:

- `contrast` is solved per scheme against the base's resolved variant
  (light / dark / lightContrast / darkContrast).
- Relative `lightness: '+N'` / `'-N'` is anchored to the base's
  lightness per scheme (matches theme behavior for dependent colors).
- Relative `hue: '+N'` still anchors to the seed (the value passed to
  `glaze.color()`), not the base.
- `mode` is the per-pair knob — pass `mode: 'fixed'` to disable Möbius
  inversion for the dependent color, `mode: 'auto'` to keep it.

The base token's `.resolve()` is called lazily on first resolve and
the result is captured by reference, matching existing snapshot
semantics. Internally, `resolveAllColors` accepts pre-resolved
external bases and seeds them into the resolution context;
`validateColorDefs` and `topoSort` treat external base names as leaves.

**`opacity` and `name` on `glaze.color()`:**

- `GlazeColorOverrides.opacity` (and the same field on
  `GlazeColorInput`) sets a fixed alpha 0–1 that surfaces in every
  scheme variant. Combining with `contrast` is not recommended (perceived
  lightness becomes unpredictable) — `glaze` emits a `console.warn` in
  that case.
- `GlazeColorOverrides.name` (and the same field on `GlazeColorInput`)
  is a human-readable label that surfaces in error and warning messages
  in place of the internal `"value"` sentinel. Empty / whitespace-only
  names and reserved internal names (`"value"`, `"seed"`,
  `"externalBase"`) are rejected with a clear error.

**Structured form parity:** the `glaze.color({...})` overload now
accepts `opacity`, `contrast`, `base`, and `name` in addition to the
existing `hue`, `saturation`, `lightness`, `saturationFactor`, and
`mode`. `contrast` without `base` synthesizes a hidden static seed
from the input's normal-mode lightness so the contrast solver always
has an anchor (mirrors value-form behavior). `hue` (finite),
`saturation` / `lightness` (0–100), `saturationFactor` (0–1), and
`opacity` (0–1) are range-checked up front with helpful error
messages — non-finite or out-of-range values fail at creation rather
than producing a NaN-laden token.

**Contrast warning:** when the contrast solver cannot meet the
requested target (e.g. AAA against a mid-grey base — physically
unreachable), `glaze` emits a single `console.warn` per
`(name, scheme, target)` triple naming the affected color, scheme, and
the actual achieved ratio. The token still resolves to the closest
passing variant. Use the `name` override to make the warning easier to
trace.

**Persisting standalone colors:** `token.export()` returns a JSON-safe
snapshot containing the original `value` (or structured input), the
overrides, and the captured `scaling`. Token-typed `base` is
recursively serialized; value-typed `base` is preserved as the raw
value. Pass the result to `glaze.colorFrom(data)` to rehydrate a token
that resolves byte-for-byte identically to the original — across
`glaze.configure()` calls and across processes. The captured `scaling`
snapshots both `lightLightness` and `darkLightness` from `globalConfig`
at create time, so later `glaze.configure()` calls don't retroactively
change exported tokens regardless of input form.

**`.css({ name })` export:** new method on the standalone color token
reaches export parity with `theme.css()`. Existing
`.token() / .tasty() / .json()` continue to work unchanged.

**`glaze.shadow()` upgrade:** `bg` and `fg` now accept any
`GlazeColorValue` form — hex, `rgb()` / `hsl()` / `okhsl()` / `oklch()`
strings, `OkhslColor` objects, or `[r, g, b]` tuples — sharing the same
parser as `glaze.color()`.

**Internal:** standalone color tokens now memoize the underlying resolve
across `.resolve() / .token() / .tasty() / .json() / .css()` calls.

**Public type additions:** `GlazeColorValue`, `GlazeColorOverrides`,
`GlazeColorOverridesExport`, `GlazeColorCssOptions`,
`GlazeColorScaling`, `GlazeColorTokenExport`, `GlazeColorInputExport`.
New `glaze.colorFrom(data)` factory and `token.export()` method on
`GlazeColorToken`. New `hslToSrgb`, `oklabToOkhsl`, and `parseHexAlpha`
math helpers re-exported from the package root.
