---
'@tenphi/glaze': patch
---

Fix `splitHue` exports dropping a per-color `darkHue`. A color that authored
only `darkHue` (no light `hue`) referenced the theme's `--{name}-hue` var in
both schemes, so the `--{color}-hue` declaration emitted in the dark block was
never read and the dark hue was silently ignored. A color that authors a hue in
*either* scheme now gets its own hue custom property in both, tracking the theme
hue in the scheme it did not author, so the shared `var()` reference stays valid
and runtime re-skinning still works. Affects both `css({ splitHue: true })` and
the Tasty token map.

Also corrects the `tone: 'max'` / `'min'` with a `base` documentation: the
high-contrast variants are not exempt from the light-shift replay. They follow
the same rule, and because their tone window is already the full range the
replay reproduces the plain mapping *unless* the base itself sits asymmetrically
across schemes — a `mode: 'fixed'` or contrast-solved base, for example. The
behavior is unchanged; only the docs and changelog claimed otherwise.
