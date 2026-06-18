---
'@tenphi/glaze': minor
---

Remove the cusp-anchored saturation taper completely.

**Breaking change**

- `saturationTaper` has been removed from `GlazeConfig` and `GlazeConfigOverride` as well as from `glaze.configure()`. The concept of tapering/clamping saturation at lightness extremes is no longer supported, and colors are allowed to maintain their requested saturation across the entire lightness spectrum.
- `saturationTaper` has also been removed from `FindToneForContrastOptions`.
