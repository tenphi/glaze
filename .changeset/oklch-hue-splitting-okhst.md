---
'@tenphi/glaze': minor
---

feat+breaking: oklch hue channel splitting (pastel-only); add okhst tasty-only output; okhsl/okhst are tasty-only; tokens/json default to oklch

- Add `splitChannels` on `css()` / `tasty()` (theme + palette) and standalone `color.css()` — emits hue as a separate custom property referenced via `var()` in `oklch` values. Requires every exported color to be pastel.
- Add `'okhst'` output format (`okhst(H S% T%)`) for Tasty exports.
- `okhsl` and `okhst` throw on non-Tasty exports (`css`, `tailwind`, `tokens`, `json`).
- `tokens()` / `json()` default format changes from `okhsl` to `oklch` (theme, palette, standalone `.json()`).
