---
'@tenphi/glaze': minor
---

Add shadow color support and standalone shadow/format APIs

- Shadow colors via `ShadowColorDef` (`type: 'shadow'`) with OKHSL-native algorithm using `tanh` alpha curve
- `glaze.shadow()` standalone factory for one-off shadow computation
- `glaze.format()` to format any `ResolvedColorVariant` as CSS
- `opacity` field on `RegularColorDef` for fixed alpha on regular colors
- `alpha` field on `ResolvedColorVariant` (default 1)
- `shadowTuning` on `GlazeConfig` for global shadow defaults
- `ResolvedColor.mode` is now optional (omitted for shadow colors)
- Intensity is clamped to `[0, 100]`
- Validation: shadow bg/fg cannot reference other shadows; regular color base cannot reference a shadow
