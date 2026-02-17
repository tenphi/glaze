# @tenphi/glaze

## 0.2.0

### Minor Changes

- [#4](https://github.com/tenphi/glaze/pull/4) [`5cff288`](https://github.com/tenphi/glaze/commit/5cff2882d04c19a89e1ef2555139f870168000ba) Thanks [@tenphi](https://github.com/tenphi)! - Redesigned ColorDef API: unified `l`/`contrast` into `lightness` (supports absolute numbers or relative strings), renamed `ensureContrast` to `contrast`, added per-color `hue` override, and renamed `sat` to `saturation`. Removed unsigned auto-flip behavior for contrast deltas.
