---
'@tenphi/glaze': major
---

Input that 2.x resolved into broken or wrong colors now throws or clamps, and the config no longer leaks shared objects. See "3.0 — stricter input validation" in `docs/migration.md`.

Breaking changes (runtime):

- Tone windows (`lightTone` / `darkTone`) throw on `lo > hi` (`[90, 20]` used to invert the scale silently), an endpoint that isn't a finite number, an `eps` that is missing, isn't above 0, or is above `1e6` (a huge `eps` rendered `NaN` colors), or a value that isn't `[lo, hi]`, `{ lo, hi, eps }`, or `false`, `null` included (`configure()` used to ignore a `null` window). Endpoints clamp to 0–100; 2.x extended the window past them. `configure()` throws at the call; a theme or token override throws when it resolves.
- `darkDesaturation` clamps to 0–1 (in `configure()`, and in a theme or token override when it resolves); a value that isn't a finite number throws (2.x read `'0.5'` as 0.5 and `true` as 1). Before, `2` was accepted and `-0.5` raised dark saturation.
- A relative tone in the high-contrast entry of a pair now needs `base`, like one in the normal entry: `tone: [50, '+20']` on a root color throws instead of reading `'+20'` as tone 20. In `glaze.color({ from, tone: [50, '+20'] })` the delta is measured from the token's own color, as documented.
- Hex parsing is strict: `parseHex` / `parseHexAlpha` reject any character that isn't a hex digit. Before, the 6- and 8-digit forms checked only the first digit of each pair, so `'#1z2z3z'` read as `#010203` and `'#-1-2-3'` produced negative channels. `glaze.color()`, `glaze.fromHex()`, a theme color's `from`, and the `bg` / `fg` of `glaze.shadow()` / `glaze.glow()` now throw `glaze: invalid hex color "…".` for such input.
- A snapshot whose frozen config or colors hold any of these still restores with `glaze.themeFrom()` / `paletteFrom()` / `colorFrom()` and throws on its first output.

Fixed:

- `glaze.getConfig()` and `theme.getConfig()` return deep copies. Mutating a nested field such as `getConfig().modes.highContrast` used to change the live config without invalidating any cache. `theme.getConfig()` on a theme without an override returned the live global config itself, so mutating it changed every theme and token; with an override, it changed that theme's output until its next edit, skipping validation.
- The config you pass is copied: by `configure()`, and by `glaze()`, `extend()`, and `glaze.color()` for their config override. Changing that array or object afterwards no longer reaches a later resolve or `export()`. An override's fields are read by property access, so class getters and inherited fields now reach `export()` and `extend()` too, not only the resolve.
