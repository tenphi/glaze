# @tenphi/glaze

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
