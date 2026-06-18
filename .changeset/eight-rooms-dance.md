---
'@tenphi/glaze': minor
---

Add `pastel` config option, `getConfig()` to `GlazeTheme`, and export `cuspLightness`.

- `pastel`: A new configuration option (`boolean`, default `false`) has been added to `GlazeConfig` and `FindToneForContrastOptions`. When enabled, it uses a hue-independent "safe" chroma limit across all colors so that scaling saturation never exceeds the sRGB boundary at any hue for the given lightness.
- `getConfig()`: Added to `GlazeTheme` to allow retrieving the effective configuration (`GlazeConfigResolved`) for a theme.
- `cuspLightness(h)`: Exported from `okhsl-color-math` to allow retrieving the OKHSL lightness of the gamut cusp for a given hue.