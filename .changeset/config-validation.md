---
'@tenphi/glaze': patch
---

Validate config values instead of resolving them into broken output, and stop the config from leaking shared objects:

- `glaze.getConfig()` and `theme.getConfig()` return deep copies. Mutating a nested field such as `getConfig().modes.highContrast` used to change the live config without invalidating any cache. `theme.getConfig()` on a theme without an override returned the live global config itself, so mutating it changed every theme and token; with an override, it changed that theme's output until its next edit, skipping validation.
- The config you pass is copied: by `configure()`, and by `glaze()`, `extend()`, and `glaze.color()` for their config override. Changing that array or object afterwards no longer reaches a later resolve or `export()`. An override's fields are read by property access, so class getters and inherited fields now reach `export()` and `extend()` too, not only the resolve.
- `darkDesaturation` clamps to 0–1 (in `configure()`, and in a theme or token override when it resolves); a non-finite value throws. Before, `2` was accepted and `-0.5` raised dark saturation.
- Tone windows (`lightTone` / `darkTone`) throw on `lo > hi` (`[90, 20]` used to invert the scale silently), a non-finite endpoint, an `eps` that isn't above 0 or is above `1e6` (a huge `eps` rendered `NaN` colors), or a value that isn't `[lo, hi]`, `{ lo, hi, eps }`, or `false`, `null` included (`configure()` used to ignore a `null` window). Endpoints clamp to 0–100.
- A relative tone in the high-contrast entry of a pair now needs `base`, like one in the normal entry: `tone: [50, '+20']` on a root color throws instead of reading `'+20'` as tone 20. In `glaze.color({ from, tone: [50, '+20'] })` the delta is measured from the token's own color, as documented.
