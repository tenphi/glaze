---
'@tenphi/glaze': patch
---

Extend `glaze.color()` with a value-shorthand overload, base/contrast support, and a new `.css()` export.

- Accept hex strings, the four CSS color functions Glaze itself emits (`rgb()`, `hsl()`, `okhsl()`, `oklch()`), `OkhslColor` objects (`{ h, s, l }`), and `[r, g, b]` (0–255) tuples as the first argument. Every string emitted by `theme.tasty() / .json() / .css()` round-trips back through `glaze.color()`.
- Optional second argument supplies overrides — `hue`, `saturation`, `lightness`, `saturationFactor`, `mode`, plus the new `base` (any color value) and `contrast` (WCAG floor against base). Relative `'+N'` / `'-N'` strings are now supported on `hue` (relative to seed) and `lightness` (relative to base).
- New `.css({ name })` method on the standalone color token reaches export parity with `theme.css()`. Existing `.token() / .tasty() / .json()` continue to work unchanged.
- Alpha components in `rgb(... / A)` / `hsl(... / A)` / `rgba(...)` / `hsla(...)` are parsed but dropped with a `console.warn`, since standalone colors have no opacity field.
- Public exports: new `GlazeColorValue`, `GlazeColorOverrides`, and `GlazeColorCssOptions` types; new `oklabToOkhsl` and `hslToSrgb` math utilities.

The existing structured form `glaze.color({ hue, saturation, lightness, ... })` keeps working unchanged — every change is additive.
