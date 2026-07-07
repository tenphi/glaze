# @tenphi/glaze

## 0.17.0

### Minor Changes

- [`10c0c0a`](https://github.com/tenphi/glaze/commit/10c0c0a29c0cb51a1cedd59cfb9fe6a0e5c96e40) Thanks [@tenphi](https://github.com/tenphi)! - Rename the per-color `flip` configuration property to `autoFlip` to match the global configuration key and avoid confusion with dark-mode/scheme tone inversion.

## 0.16.2

### Patch Changes

- [`fa25eda`](https://github.com/tenphi/glaze/commit/fa25eda04b2394afbf77b31ecf61494a9371f1e2) Thanks [@tenphi](https://github.com/tenphi)! - Default export format is now `oklch` for all exporters (`tasty()`, `token()`, `css()`, and internal formatter defaults). Use `{ format: 'okhsl' }` or `{ format: 'rgb' }` to opt into other formats.

## 0.16.1

### Patch Changes

- [`f7aaa85`](https://github.com/tenphi/glaze/commit/f7aaa8580048868f1fe3d32f79049c64513e494d) Thanks [@tenphi](https://github.com/tenphi)! - Fixes the tasty() output for splitHue feature.

## 0.16.0

### Minor Changes

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add opt-in DTCG Resolver-Module export (`dtcgResolver()`)
  - **New export.** `theme.dtcgResolver()`, `palette.dtcgResolver()`, and `glaze.color().dtcgResolver()` emit a single W3C DTCG Resolver-Module document describing every scheme variant in one file — `sets` (the light tokens as the default source) plus a single `scheme` modifier with a context per variant (`light` / `dark` / `lightContrast` / `darkContrast`) and a `resolutionOrder`. An alternative to `dtcg()`'s per-scheme files for resolver tools such as Dispersa.
  - **Why one modifier.** Glaze resolves `darkContrast` independently (it is not `dark` + `lightContrast` layered), so the four-context shape keeps every resolved value exact. Two independent modifiers would compose additively and produce wrong dark + high-contrast values.
  - **Options.** `GlazeDtcgResolverOptions` extends `GlazeDtcgOptions` (`modes` + `colorSpace` pass through) with `setName` (default `'base'`), `modifierName` (default `'scheme'`), `contextNames` (rename the four contexts), and `version` (default `'2025.10'`). Standalone `glaze.color().dtcgResolver()` requires `name`.
  - New public types: `GlazeDtcgResolverDocument`, `GlazeDtcgResolverOptions`, `GlazeColorDtcgResolverOptions`, `DtcgTokenTree`, `DtcgResolverSet`, `DtcgResolverModifier`, `DtcgResolverRef`.

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add DTCG and Tailwind CSS v4 token exports
  - **`dtcg()`** — W3C [Design Tokens Format Module (2025.10)](https://www.designtokens.org/) export. Available on themes, palettes, and standalone `glaze.color()` tokens. Returns one spec-conformant token document per scheme variant (`light` / `dark` / `lightContrast` / `darkContrast``), each a `{ name: { $type: 'color', $value } }` tree consumable by Figma, Tokens Studio, Style Dictionary v4+, Terrazzo, Penpot, and every DTCG-compatible tool. The `colorSpace` option selects the `$value`representation:`'srgb'`(default — gamma sRGB`components`in 0–1 plus a`hex`hint) or`'oklch'`(Glaze-native, wide-gamut`[L, C, H]`, no hex). `alpha` is emitted only when opacity is below 1. One document per scheme is the most tool-compatible convention (one file per Style Dictionary theme / Tokens Studio set / Figma variable mode).
  - **`tailwind()`** — Tailwind CSS v4 export. Returns a single ready-to-paste CSS string: an `@theme` block (light baseline) plus dark / high-contrast overrides under configurable selectors. The `--color-*` namespace (configurable via `namespace`) auto-generates `bg-*` / `text-*` / `border-*` utilities. `darkSelector` (default `.dark`) accepts an at-rule like `'@media (prefers-color-scheme: dark)'` (nests `:root` automatically); `highContrastSelector` (default `.high-contrast`) covers the HC variants, with the combined block at `${darkSelector}${highContrastSelector}`. Default `format` is `'oklch'`.
  - **New types** exported from the package entry: `DtcgColorSpace`, `DtcgSrgbColorValue`, `DtcgOklchColorValue`, `DtcgColorValue`, `DtcgColorToken`, `DtcgDocument`, `GlazeDtcgResult`, `GlazeColorDtcgResult`, `GlazeDtcgOptions`, `GlazeTailwindOptions`, `GlazeColorTailwindOptions`.
  - **New color-math helpers** exported for advanced use: `srgbToHex(rgb)` (sRGB 0–1 → `#rrggbb`) and `okhslToOklch(h, s, l, pastel?)` (OKHSL → `[L, C, H]`), shared by `formatOklch` and the DTCG exporter.
  - Both new exports honor `modes` (dark / high-contrast gating) and the palette `prefix` / `primary` options. On `palette.tailwind()`, the palette theme-prefix `prefix` is separate from `GlazeTailwindOptions.namespace` (the `--color-*` CSS namespace).

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - feat+breaking: oklch hue channel splitting (pastel-only); add okhst tasty-only output; okhsl/okhst are tasty-only; tokens/json default to oklch
  - Add `splitHue` on `css()` / `tasty()` (theme + palette) and standalone `color.css()` — emits hue as a separate custom property referenced via `var()` in `oklch` values. Requires every exported color to be pastel.
  - Add `'okhst'` output format (`okhst(H S% T%)`) for Tasty exports.
  - `okhsl` and `okhst` throw on non-Tasty exports (`css`, `tailwind`, `tokens`, `json`).
  - `tokens()` / `json()` default format changes from `okhsl` to `oklch` (theme, palette, standalone `.json()`).

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add semantic color roles with APCA polarity and APCA presets
  - **Roles.** Colors now carry a semantic `role` (`'text'` | `'surface'` | `'border'`, with aliases like `bg`/`fg`/`divider`/`outline`/`fill`/`ink`/…). The role fixes **APCA contrast polarity** — which side is the foreground vs the background — so the APCA solver uses the correct argument order instead of always treating the resolved color as text. WCAG is symmetric and unaffected.
  - **Role inference.** Roles are inferred from the color name by default (`inferRole: true`), with the last recognized token winning (`button-text` → `text`, `input-bg` → `surface`, `card-outline` → `border`). When a name doesn't infer, the opposite of the base's role is used; otherwise the color defaults to `text` (foreground), preserving previous behavior. Set `glaze.configure({ inferRole: false })` to opt out of name inference.
  - **APCA presets.** APCA targets accept named Bronze Simple Mode presets: `'preferred'` (Lc 90), `'body'` (75), `'content'` (60, ~AA), `'large'` (45, ~3:1), `'non-text'` (30), `'min'` (15). Use anywhere an APCA target is accepted, e.g. `contrast: { apca: 'content' }` or `contrast: { apca: ['content', 'body'] }`. Presets are role-independent.
  - `role` is also available on `MixColorDef` and standalone `glaze.color()` inputs and survives the `export()` / `glaze.colorFrom()` round-trip.

## 0.15.1

### Patch Changes

- [#67](https://github.com/tenphi/glaze/pull/67) [`3f70089`](https://github.com/tenphi/glaze/commit/3f700896e39aa1d931c457d5d6ca14d0135928fd) Thanks [@tenphi](https://github.com/tenphi)! - Allow `pastel` to be set per color, not just globally.

  Every color definition (`RegularColorDef`, `ShadowColorDef`, `MixColorDef`) and
  `glaze.color()` token now accepts an optional `pastel?: boolean` that overrides
  the global / per-theme `pastel` config for that color only. Omit it to keep
  inheriting the config default.

## 0.15.0

### Minor Changes

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - Add `pastel` config option, `getConfig()` to `GlazeTheme`, and export `cuspLightness`.
  - `pastel`: A new configuration option (`boolean`, default `false`) has been added to `GlazeConfig` and `FindToneForContrastOptions`. When enabled, it uses a hue-independent "safe" chroma limit across all colors so that scaling saturation never exceeds the sRGB boundary at any hue for the given lightness.
  - `getConfig()`: Added to `GlazeTheme` to allow retrieving the effective configuration (`GlazeConfigResolved`) for a theme.
  - `cuspLightness(h)`: Exported from `okhsl-color-math` to allow retrieving the OKHSL lightness of the gamut cusp for a given hue.

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - Remove the cusp-anchored saturation taper completely.

  **Breaking change**
  - `saturationTaper` has been removed from `GlazeConfig` and `GlazeConfigOverride` as well as from `glaze.configure()`. The concept of tapering/clamping saturation at lightness extremes is no longer supported, and colors are allowed to maintain their requested saturation across the entire lightness spectrum.
  - `saturationTaper` has also been removed from `FindToneForContrastOptions`.

### Patch Changes

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - docs: update project description to use OKHST instead of OKHSL

## 0.14.0

### Minor Changes

- [#63](https://github.com/tenphi/glaze/pull/63) [`3b6e2a6`](https://github.com/tenphi/glaze/commit/3b6e2a632cc5d8f18a4f2e5580354d88d655e3d7) Thanks [@tenphi](https://github.com/tenphi)! - Replace the OKHSL lightness axis with a contrast-uniform **tone** axis (OKHST) and remove the Möbius dark-mode curve.

  **Breaking changes**
  - The `lightness` authoring prop is gone. Use `tone` (0–100, contrast-uniform) everywhere — theme colors, `glaze.color()` structured input, and relative offsets. Equal tone steps now give equal WCAG contrast, so numeric values won't map to the same OKHSL lightness as before; re-check absolute mid-range values.
  - Config windows changed: `lightLightness` / `darkLightness` → `lightTone` / `darkTone`. A window is `[lo, hi]` (reference eps — the common form), `{ lo, hi, eps }` (advanced eps tuning), or `false` to disable clamping. `false` removes the boundaries (full `[0, 100]` range) but keeps the contrast-uniform tone curve. `darkCurve` was removed.
  - `ResolvedColorVariant` now stores `{ h, s, t, alpha }` (tone) instead of `{ h, s, l }`. Use the new `variantToOkhsl()` helper to recover OKHSL lightness.
  - Export snapshots now carry `lightTone` / `darkTone` windows.
  - Relative `tone` offsets that overshoot `[0, 100]` now mirror to the other side of the base by default (the new `flip`, inheriting `autoFlip`) instead of clamping. Set `flip: false` (or `autoFlip: false`) to restore clamping.

  **New**
  - `tone: 'max'` / `'min'` forces a color to the scheme's tone extreme (lightest / darkest) with no `base` and no contrast hack; under `mode: 'auto'` they invert in dark like any tone.
  - `flip` per-color prop (default: global `autoFlip`): mirrors out-of-bounds relative `tone` overshoot and unmet `contrast` to the opposite side of the base, or clamps when `false`.
  - Tone windows accept the `[lo, hi]` array shorthand alongside `{ lo, hi, eps }` and `false`.
  - `contrast` accepts a metric selector: a bare number/preset is WCAG, `{ wcag }` / `{ apca }` picks the metric, and the `[normal, hc]` pair may live at the outer level or inside the metric (`{ wcag: [4.5, 7] }`).
  - APCA Lc contrast solving alongside WCAG, plus an APCA-based drift verification warning for chromatic swatches.
  - OKHST input: `okhst(H S% T%)` strings and `{ h, s, t }` objects (input only — never emitted).
  - `saturationTaper` config knob (default `0.15`) gently rolls off saturation toward the tone extremes.
  - New exports: `toTone`, `fromTone`, `toneFromY`, `yFromTone`, `okhstToOkhsl`, `okhslToOkhst`, `variantToOkhsl`, `REF_EPS`, `findToneForContrast`, `resolveContrastForMode`, `apcaContrast`, and the `ContrastSpec` / `OkhstColor` / `ToneWindow` / `ExtremeValue` / `ToneValue` types.

### Patch Changes

- [#63](https://github.com/tenphi/glaze/pull/63) [`3b6e2a6`](https://github.com/tenphi/glaze/commit/3b6e2a632cc5d8f18a4f2e5580354d88d655e3d7) Thanks [@tenphi](https://github.com/tenphi)! - Adjust the default tone-window floors: `lightTone` is now `[10, 100]` (was `[13, 100]`) and `darkTone` is now `[15, 95]` (was `[10, 95]`). The OKHST migration made dark schemes bottom out darker than the legacy pipeline for the same input; lifting the dark floor keeps the darkest dark-mode surfaces closer to the previous output, and lowering the light floor widens the usable light range. Override with `lightTone: [13, 100]` / `darkTone: [10, 95]` to restore the prior values.

## 0.13.0

### Minor Changes

- [#61](https://github.com/tenphi/glaze/pull/61) [`43be630`](https://github.com/tenphi/glaze/commit/43be630d2ed45ccb9a72693246fe27d6c61dcfc9) Thanks [@tenphi](https://github.com/tenphi)! - Redesign `glaze.color()` input API and add per-instance config overrides.

  **Breaking: `glaze.color()` arg layout changed**

  The old two-overload signature (`value, overrides?, scaling?` / `structured, scaling?`) is replaced by a single unified signature:

  ```ts
  glaze.color(color, config?)
  ```

  - **`color`** (arg 1): four shapes discriminated by structure:
    - Bare string → `glaze.color('#26fcb2')`
    - Value object → `glaze.color({ h: 152, s: 0.95, l: 0.74 })`
    - **New** `{ from, ...overrides }` → `glaze.color({ from: '#fff', base: bg, contrast: 'AA' })`
    - Structured → `glaze.color({ hue: 152, saturation: 95, lightness: 74 })`
  - **`config`** (arg 2, optional): `GlazeConfigOverride` — overrides resolve-relevant config fields for this token only.

  **Migration**

  ```ts
  // Before
  glaze.color('#fff', { base: bg, contrast: 'AA' });
  glaze.color('#fff', undefined, { darkLightness: false });
  glaze.color('#fff', { opacity: 0.5 }, { lightLightness: false });

  // After
  glaze.color({ from: '#fff', base: bg, contrast: 'AA' });
  glaze.color('#fff', { darkLightness: false });
  glaze.color({ from: '#fff', opacity: 0.5 }, { lightLightness: false });
  ```

  **New: per-instance config override (`GlazeConfigOverride`)**
  - Applies to both `glaze.color()` and `glaze()` themes (second arg).
  - Fields: `lightLightness`, `darkLightness`, `darkDesaturation`, `darkCurve`, `autoFlip`, `shadowTuning`.
  - `false` for a lightness window disables clamping globally (`= [0, 100]`). Now accepted everywhere: `configure()`, per-token, and per-theme.
  - Token config is snapshotted at creation. Theme config merges over the live global at resolve time (non-overridden fields still react to `configure()`).
  - `extend({ config })` inherits and merges parent + child overrides.
  - `theme.export()` / `glaze.from()` round-trip the config.

  **New: `{ from }` form for value colors with overrides**

  Pass a raw color value alongside color overrides in one object:

  ```ts
  const text = glaze.color({ from: '#1a1a2e', base: bg, contrast: 'AA' });
  ```

  **New: full-range base conversion**

  When a value/`from` color links to a `base` created via the structured form, the contrast/lightness anchor uses the raw input lightness (not the windowed output). This ensures accurate anchoring without affecting the base's own resolved output.

  **Breaking: removed `GlazeColorScaling`**

  `GlazeColorScaling` is removed and replaced by `GlazeConfigOverride`. Scaling was limited to lightness windows; the new type covers the full resolve-relevant config.

## 0.12.0

### Minor Changes

- [#60](https://github.com/tenphi/glaze/pull/60) [`5fef8c5`](https://github.com/tenphi/glaze/commit/5fef8c54c592f92f13008502a718c2f78a728045) Thanks [@tenphi](https://github.com/tenphi)! - **Breaking:** `glaze.color()` value-shorthand changes:
  - **Removed** RGB tuple `[r, g, b]` — use `{ r, g, b }` instead.
  - **Added** `RgbColor` (`{ r, g, b }`) and `OklchColor` (`{ l, c, h }`) object inputs (also accepted by `glaze.shadow()`).
  - **Unified scaling** for all value-shorthand (strings and literal objects): `lightLightness: false`, `darkLightness: globalConfig.darkLightness` (snapshotted). Strings no longer use the extended `[darkLo, 100]` dark window — the default `#000` → white dark flip is gone unless you pass explicit `scaling: { darkLightness: [lo, 100] }`.
  - Object/tuple value-shorthand no longer remap light lightness through `globalConfig.lightLightness` (structured `{ hue, saturation, lightness }` still does). Opt back in with `scaling: { lightLightness: [10, 100], ... }`.

### Patch Changes

- [#58](https://github.com/tenphi/glaze/pull/58) [`9fdb6bb`](https://github.com/tenphi/glaze/commit/9fdb6bbbed6f9aa44d3d2eade8fc0ce468655269) Thanks [@tenphi](https://github.com/tenphi)! - Respect authored lightness direction when contrast auto-flip is disabled.

## 0.11.1

### Patch Changes

- [#56](https://github.com/tenphi/glaze/pull/56) [`978bf60`](https://github.com/tenphi/glaze/commit/978bf60540c47387d2ae3f6cafdcb23bd992cbe4) Thanks [@tenphi](https://github.com/tenphi)! - Restructure documentation into focused README, API, methodology, and migration guides.

- [#56](https://github.com/tenphi/glaze/pull/56) [`978bf60`](https://github.com/tenphi/glaze/commit/978bf60540c47387d2ae3f6cafdcb23bd992cbe4) Thanks [@tenphi](https://github.com/tenphi)! - Internal refactor: split the 2636-line `src/glaze.ts` into focused, flat
  modules (`config`, `hc-pair`, `shadow`, `warnings`, `scheme-mapping`,
  `validation`, `resolver`, `formatters`, `theme`, `palette`,
  `color-token`) and dedupe a few parallel structures:
  - The resolver's four-pass loop is now a single `runPass()` + `seedField()`
    helper called four times.
  - The palette `tokens` / `tasty` / `css` exporters share a
    `buildPaletteOutput()` driver instead of duplicating the
    per-theme loop / prefix resolution / collision filtering /
    primary-duplication logic.
  - The default-config literal is no longer duplicated between module
    init and `resetConfig()`; both call a shared `defaultConfig()`.
  - `theme` exports now cache the resolve result and invalidate it on
    any def mutation or `configure()` / `resetConfig()` call (via a
    new `configVersion` counter), so back-to-back exports don't
    re-run the four-pass resolver.

  No public API or behavior changes.

## 0.11.0

### Minor Changes

- [#54](https://github.com/tenphi/glaze/pull/54) [`88be8a4`](https://github.com/tenphi/glaze/commit/88be8a4c4d816568cf2fb7b582d110c8cf3ae580) Thanks [@tenphi](https://github.com/tenphi)! - `glaze.color()` now defaults to `mode: 'auto'` across every input form, so non-string inputs adapt between light and dark like an ordinary theme color instead of being preserved verbatim with a linear dark mapping.
  - **Object value-shorthand** (`{ h, s, l }`), **RGB tuple** (`[r, g, b]`), and **structured form** (`{ hue, saturation, lightness, ... }`) now default to `mode: 'auto'` with snapshotted scaling `{ lightLightness: globalConfig.lightLightness, darkLightness: globalConfig.darkLightness }`. The dark variant is Möbius-inverted into `globalConfig.darkLightness` (default `[15, 95]`), and the light variant is mapped through `globalConfig.lightLightness` (default `[10, 100]`) — exactly the same windows a theme color uses.
  - **String value-shorthand** (hex / `rgb()` / `hsl()` / `okhsl()` / `oklch()`) is unchanged. It already defaulted to `mode: 'auto'` with `{ lightLightness: false, darkLightness: [lo, 100] }`, preserving the `#000` ↔ `#fff` flip.

  **Behavior change (minor bump):**
  - `glaze.color({ hue: H, saturation: S, lightness: 80 }).resolve()` (and the equivalent object / tuple forms) now produces a near-dark `dark.l` (e.g. ~`0.42` for `lightness: 80` under defaults) instead of staying near `0.79`.
  - `light.l` for object / tuple / structured inputs is now mapped through `globalConfig.lightLightness` rather than preserved verbatim (e.g. `lightness: 0` now resolves to `light.l ≈ 0.10` by default).
  - To restore the previous fixed-linear behavior, pass `{ mode: 'fixed' }` on the input or in the overrides. To restore the previous "preserve light lightness verbatim" behavior, pass `{ lightLightness: false }` as the trailing `scaling` argument.

  The new scaling shape is also reflected in `token.export()` snapshots — object / tuple / structured tokens now serialize `{ lightLightness: [10, 100], darkLightness: [15, 95] }` (with the live `globalConfig` values frozen at create time) instead of `{ lightLightness: false, darkLightness: [15, 95] }`. Rehydration via `glaze.colorFrom()` round-trips byte-for-byte.

## 0.10.1

### Patch Changes

- [#52](https://github.com/tenphi/glaze/pull/52) [`1988ff8`](https://github.com/tenphi/glaze/commit/1988ff8f973093844e69291590f41c46582dffa9) Thanks [@tenphi](https://github.com/tenphi)! - Fix `srgbToOkhsl` (and downstream `glaze.color()`) returning a bogus saturated hue/saturation for pure white (`#FFFFFF`) and other colors at the OKHSL lightness extremes. Floating-point residue from `linearSrgbToOklab` slipped past the existing chroma epsilon, sending the chromatic path through a degenerate gamut where saturation divides by ~zero. White now correctly resolves to `okhsl(0 0% 100%)` (light) / `okhsl(0 0% 15%)` (dark) instead of `okhsl(89.88 55.83% 100%)`.

## 0.10.0

### Minor Changes

- [#50](https://github.com/tenphi/glaze/pull/50) [`6e2d42d`](https://github.com/tenphi/glaze/commit/6e2d42dac6aa571ec02636bd029c662b2bf7fa3f) Thanks [@tenphi](https://github.com/tenphi)! - Revamp `glaze.color()` with a value-shorthand overload, seed-anchored
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

## 0.9.3

### Patch Changes

- [`762c204`](https://github.com/tenphi/glaze/commit/762c204123a237c2dd11f046f2e825315b9f351a) Thanks [@tenphi](https://github.com/tenphi)! - Unify contrast search overshoot to 1% in both lightness and mix solvers.

## 0.9.2

### Patch Changes

- [#46](https://github.com/tenphi/glaze/pull/46) [`85111ca`](https://github.com/tenphi/glaze/commit/85111ca53110f713d9c92090f62008cb180b13e1) Thanks [@tenphi](https://github.com/tenphi)! - Add `inherit` flag to color definitions to prevent inheritance during `extend()`

## 0.9.1

### Patch Changes

- [#44](https://github.com/tenphi/glaze/pull/44) [`50340c4`](https://github.com/tenphi/glaze/commit/50340c4cd8f91794c19a7d452b2591a4e5a37d18) Thanks [@tenphi](https://github.com/tenphi)! - `darkCurve` now accepts a `[normal, highContrast]` pair for separate HC tuning.

## 0.9.0

### Minor Changes

- [#43](https://github.com/tenphi/glaze/pull/43) [`0575838`](https://github.com/tenphi/glaze/commit/057583807a0fa2469217a29a925b1b82018e55b8) Thanks [@tenphi](https://github.com/tenphi)! - Move `primary` option from per-export to `glaze.palette()` creation, add collision detection (warn + first-write-wins) across all palette export methods.

### Patch Changes

- [#40](https://github.com/tenphi/glaze/pull/40) [`c47cfd2`](https://github.com/tenphi/glaze/commit/c47cfd2d39268e9443bfca815ddfcc836bad58cd) Thanks [@tenphi](https://github.com/tenphi)! - Unify dark/HC lightness mapping into a single code path via `lightnessWindow` helper.

- [#42](https://github.com/tenphi/glaze/pull/42) [`941338a`](https://github.com/tenphi/glaze/commit/941338ab3a75a831f2da4ce0fbeff4c1839405a9) Thanks [@tenphi](https://github.com/tenphi)! - `darkCurve` now accepts a `[normal, highContrast]` pair for separate HC tuning.

## 0.8.0

### Minor Changes

- [#37](https://github.com/tenphi/glaze/pull/37) [`8b0b62b`](https://github.com/tenphi/glaze/commit/8b0b62b35f9ae47ae5efd1607ffc6f09f03076f6) Thanks [@tenphi](https://github.com/tenphi)! - Bypass lightLightness and darkLightness window constraints in high-contrast mode, allowing colors to use the full 0–100 lightness spectrum for increased perceivable contrast.

### Patch Changes

- [#39](https://github.com/tenphi/glaze/pull/39) [`f9f6def`](https://github.com/tenphi/glaze/commit/f9f6def1f55f604c278b086c4e91de8de8374199) Thanks [@tenphi](https://github.com/tenphi)! - Add `darkCurve` config option for perceptual dark-theme lightness inversion using a power curve. Expands subtle near-white distinctions in dark mode. Default `0.5`; set to `1` for legacy linear behavior. Widen contrast solver search range to `[0, 1]` so contrast targets are met regardless of dark lightness window.

- [#39](https://github.com/tenphi/glaze/pull/39) [`f9f6def`](https://github.com/tenphi/glaze/commit/f9f6def1f55f604c278b086c4e91de8de8374199) Thanks [@tenphi](https://github.com/tenphi)! - Replace power-curve dark lightness mapping with Möbius transformation for proportional expansion of lightness deltas across all sizes.

## 0.7.0

### Minor Changes

- [#34](https://github.com/tenphi/glaze/pull/34) [`2278b4e`](https://github.com/tenphi/glaze/commit/2278b4e79e51d285c5afd83fdf5be423d28a7d75) Thanks [@tenphi](https://github.com/tenphi)! - Add `primary` option to palette exports (`tokens`, `tasty`, `css`) that duplicates one theme's tokens without prefix. Palette prefix now defaults to `true`.

### Patch Changes

- [#36](https://github.com/tenphi/glaze/pull/36) [`e9e6ef6`](https://github.com/tenphi/glaze/commit/e9e6ef6c210607da05cfb3ea763c493e225ade2c) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver undershooting WCAG targets when using OKLCH output format. Increase OKLCH hue precision to 2dp and widen solver overshoot margin.

## 0.6.3

### Patch Changes

- [`d148498`](https://github.com/tenphi/glaze/commit/d148498d820f63c759872327c554bd1746ebe520) Thanks [@tenphi](https://github.com/tenphi)! - Apply `lightLightness` mapping to dependent colors with absolute lightness, matching `darkLightness` behavior.

- [#32](https://github.com/tenphi/glaze/pull/32) [`90bd23c`](https://github.com/tenphi/glaze/commit/90bd23c578f0e8df607b3ab33af6f496fd111c53) Thanks [@tenphi](https://github.com/tenphi)! - Propagate scheme lightness range to contrast solver for dependent colors, preventing pure black/white output when contrast-solving against extreme lightness values.

## 0.6.2

### Patch Changes

- [#30](https://github.com/tenphi/glaze/pull/30) [`06be989`](https://github.com/tenphi/glaze/commit/06be98901039274446d0b4615ff76e80bea9e896) Thanks [@tenphi](https://github.com/tenphi)! - Use 1% proportional contrast overshoot to reliably meet WCAG targets after 8-bit RGB quantization.

## 0.6.1

### Patch Changes

- [#28](https://github.com/tenphi/glaze/pull/28) [`8085e0f`](https://github.com/tenphi/glaze/commit/8085e0f634acfa1e7f38ec17189115bfacc5a749) Thanks [@tenphi](https://github.com/tenphi)! - Increase contrast search overshoot to avoid floating-point rounding below WCAG threshold.

## 0.6.0

### Minor Changes

- [#25](https://github.com/tenphi/glaze/pull/25) [`7462021`](https://github.com/tenphi/glaze/commit/7462021ffa912c72aa4668d279d7ce77119a696d) Thanks [@tenphi](https://github.com/tenphi)! - Add mix color type for blending two colors with optional contrast solving
  - New `MixColorDef` with `type: 'mix'` — blend two referenced colors via `base` and `target`
  - Opaque blend: interpolates in OKHSL or sRGB space, producing a solid color
  - Transparent blend: outputs the target color with controlled opacity (alpha = value/100)
  - `space` option: `'okhsl'` (default, perceptually uniform) or `'srgb'` (matches browser compositing)
  - `contrast` option: adjusts mix ratio or opacity to meet a WCAG contrast floor against the base
  - Achromatic hue handling: when mixing with unsaturated colors (e.g. white/black), the hue is taken from the saturated color
  - `value` and `contrast` support `[normal, highContrast]` pairs
  - Mix colors can reference other mix colors (chaining) but not shadow colors

### Patch Changes

- [#27](https://github.com/tenphi/glaze/pull/27) [`175fc81`](https://github.com/tenphi/glaze/commit/175fc81f9c4e39e15a03f4c887829945ec56d1a0) Thanks [@tenphi](https://github.com/tenphi)! - Fix green-channel k4 sign error in OKHSL gamut mapping, deduplicate internal color math, add round-trip regression tests.

## 0.5.8

### Patch Changes

- [#23](https://github.com/tenphi/glaze/pull/23) [`a06a843`](https://github.com/tenphi/glaze/commit/a06a843ff10fcddd85c00fbd2da5b2dd18524b60) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver using wrong target variable for preferred lightness check, and increase decimal precision in OKHSL/HSL color formatting from 1 to 2 digits.

## 0.5.7

### Patch Changes

- [`d7f00b1`](https://github.com/tenphi/glaze/commit/d7f00b168bf3da83bf07bc3efa27352a0a8810aa) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver computing WCAG luminance from unclamped linear sRGB, which caused it to overestimate contrast for high-saturation colors near gamut boundaries (e.g. lime green). The solver now matches the browser rendering pipeline by gamma-encoding, clamping to sRGB gamut, then linearizing before computing luminance.

## 0.5.6

### Patch Changes

- [`5acac86`](https://github.com/tenphi/glaze/commit/5acac86b14e43c3410f9065c38a0d84b7abdd25d) Thanks [@tenphi](https://github.com/tenphi)! - Add +0.01 margin to the contrast solver's internal search target to prevent floating-point rounding from producing contrast ratios like 4.4999… that fail Lighthouse's exact WCAG AA threshold check.

## 0.5.5

### Patch Changes

- [`3b8cdbf`](https://github.com/tenphi/glaze/commit/3b8cdbf95d18eb047532e14f67ba446c4686feb9) Thanks [@tenphi](https://github.com/tenphi)! - Remove spurious warning when a color has both absolute `lightness` and `base`. This is a valid configuration — `base` is still used for minimum contrast calculation.

## 0.5.4

### Patch Changes

- [#18](https://github.com/tenphi/glaze/pull/18) [`b4f799b`](https://github.com/tenphi/glaze/commit/b4f799b578b6a2717ec6d73306d5f4eb2ff663d5) Thanks [@tenphi](https://github.com/tenphi)! - Add lightLightness configuration option for controlling lightness bounds in light schemes.

## 0.5.3

### Patch Changes

- [#16](https://github.com/tenphi/glaze/pull/16) [`f34cb5e`](https://github.com/tenphi/glaze/commit/f34cb5ead4e21b7ae5dc728e525a43a71f4c4867) Thanks [@tenphi](https://github.com/tenphi)! - Updated default `darkLightness` range from `[10, 90]` to `[15, 95]` for improved dark mode color mapping.

## 0.5.2

### Patch Changes

- [#14](https://github.com/tenphi/glaze/pull/14) [`6baff6b`](https://github.com/tenphi/glaze/commit/6baff6beeec525f4828737bba982e30b79fd2fa4) Thanks [@tenphi](https://github.com/tenphi)! - Fix relative lightness application: allow absolute lightness values when using base colors for contrast solving. Previously, colors with both `base` and absolute `lightness` were incorrectly rejected during validation and topological sorting.

## 0.5.1

### Patch Changes

- [#12](https://github.com/tenphi/glaze/pull/12) [`e869204`](https://github.com/tenphi/glaze/commit/e8692049a89139225c9b26a6e873aeb59b363200) Thanks [@tenphi](https://github.com/tenphi)! - Fix shadow intensity normalization to properly scale alpha values across different background/foreground contrast pairs. Shadow alpha now correctly reaches alphaMax (default 1.0) at intensity=100 with maximum contrast.

## 0.5.0

### Minor Changes

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Add CSS custom property export method for themes and palettes

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Add shadow color support and standalone shadow/format APIs
  - Shadow colors via `ShadowColorDef` (`type: 'shadow'`) with OKHSL-native algorithm using `tanh` alpha curve
  - `glaze.shadow()` standalone factory for one-off shadow computation
  - `glaze.format()` to format any `ResolvedColorVariant` as CSS
  - `opacity` field on `RegularColorDef` for fixed alpha on regular colors
  - `alpha` field on `ResolvedColorVariant` (default 1)
  - `shadowTuning` on `GlazeConfig` for global shadow defaults
  - `ResolvedColor.mode` is now optional (omitted for shadow colors)
  - Intensity is clamped to `[0, 100]`
  - Validation: shadow bg/fg cannot reference other shadows; regular color base cannot reference a shadow

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Switch `formatRgb` and `formatHsl` from comma syntax to modern CSS space syntax

  `rgb(R, G, B)` → `rgb(R G B)` and `hsl(H, S%, L%)` → `hsl(H S% L%)`. `rgb` output now uses rounded integers instead of fractional values. This enables alpha support via the `/ alpha` separator and aligns with modern CSS (supported since Chrome 65+, Firefox 52+, Safari 12.1+).

  Downstream code that parses Glaze's CSS output using comma-separated patterns must update to space-separated syntax.

## 0.4.0

### Minor Changes

- [#8](https://github.com/tenphi/glaze/pull/8) [`eb7dec7`](https://github.com/tenphi/glaze/commit/eb7dec7648e592f27eb4be772a2b94478d25f4e0) Thanks [@tenphi](https://github.com/tenphi)! - Add explicit `tasty()` method for Tasty style-to-state bindings. `tokens()` now returns a flat variant-grouped format, while `tasty()` provides the original style-to-state binding format compatible with Tasty recipes and global styles.

## 0.3.0

### Minor Changes

- [#6](https://github.com/tenphi/glaze/pull/6) [`bb4a0d1`](https://github.com/tenphi/glaze/commit/bb4a0d144c818a3f5e2979faecd66f02f970fc25) Thanks [@tenphi](https://github.com/tenphi)! - Add CSS custom property export method for themes and palettes

## 0.2.0

### Minor Changes

- [#4](https://github.com/tenphi/glaze/pull/4) [`5cff288`](https://github.com/tenphi/glaze/commit/5cff2882d04c19a89e1ef2555139f870168000ba) Thanks [@tenphi](https://github.com/tenphi)! - Redesigned ColorDef API: unified `l`/`contrast` into `lightness` (supports absolute numbers or relative strings), renamed `ensureContrast` to `contrast`, added per-color `hue` override, and renamed `sat` to `saturation`. Removed unsigned auto-flip behavior for contrast deltas.
