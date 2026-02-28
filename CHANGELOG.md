# @tenphi/glaze

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
