---
title: API reference
description: A map of every public export in @tenphi/glaze, the conventions they share, and how authoring snapshots are versioned.
---

The reference is organized for lookup. This page maps every public export to the page that documents it, then covers the conventions the whole API shares and how authoring snapshots are versioned. For explanations and visuals, start with the concept pages: [Light, dark, and high contrast](../schemes.mdx), [Contrast solving](../contrast.mdx), [Shadows and glows](../shadows-and-glows.mdx), [Mixes and transparency](../mixes.mdx), and [Tone and OKHST](../okhst.mdx).

```ts
import { glaze } from '@tenphi/glaze';
import type { GlazeTheme, ColorMap } from '@tenphi/glaze';
```

The package ships ESM and CommonJS with full type declarations and has no runtime dependencies.

## Reference pages

| Page | Covers |
| --- | --- |
| [Themes](./theme.md) | `glaze()`, `fromHex` / `fromRgb` / `themeFrom`, theme properties and methods, `extend`, `resolve`, `export`. |
| [Color definitions](./color-definitions.md) | The `ColorDef` union: regular, shadow, glow, and mix colors, every field, and a glow's HDR value. |
| [Contrast and high contrast](./contrast.md) | `HCPair`, `ContrastSpec`, WCAG and APCA presets, high-contrast escalation, the manual contrast level. |
| [Color tokens](./color-tokens.md) | Standalone `glaze.color()` tokens, their methods, and `glaze.colorFrom()`. |
| [Palettes](./palette.md) | `glaze.palette()`, prefixes, collisions, the primary alias, `glaze.paletteFrom()`. |
| [Output formats](./output.md) | Every output method and option, color formats, output modes, state aliases, `splitHue`, HDR output. |
| [Configuration](./configuration.md) | `glaze.configure()` and every `GlazeConfig` field, per-instance overrides, validation, warnings. |
| [Utilities](./utilities.md) | `glaze.format` / `glaze.formatHdr`, the HDR channel helpers, standalone `glaze.shadow` / `glaze.glow`, color math, tone utilities, the contrast solver, role helpers, guards, and the measuring module (`@tenphi/glaze/harness/measure`). |

## `glaze` and its statics

`glaze` is the only value most code needs. It is a function with static methods attached:

| Member | Returns | Documented in |
| --- | --- | --- |
| `glaze(hue, saturation?, config?)` | `GlazeTheme` | [Themes](./theme.md#glazehue-saturation-config) |
| `glaze(seed, config?)` | `GlazeTheme` | [Themes](./theme.md#glazeseed-config) |
| `glaze.fromHex(hex)` | `GlazeTheme` | [Themes](./theme.md#glazefromhexhex--glazefromrgbr-g-b) |
| `glaze.fromRgb(r, g, b)` | `GlazeTheme` | [Themes](./theme.md#glazefromhexhex--glazefromrgbr-g-b) |
| `glaze.themeFrom(data)` | `GlazeTheme` | [Themes](./theme.md#glazethemefromdata--glazefromdata) |
| `glaze.from(data)` | `GlazeTheme` | Alias of `themeFrom` — [Themes](./theme.md#glazethemefromdata--glazefromdata) |
| `glaze.palette(themes, options?)` | `GlazePalette` | [Palettes](./palette.md#glazepalettethemes-options) |
| `glaze.paletteFrom(data)` | `GlazePalette` | [Palettes](./palette.md#paletteexportoverride--glazepalettefromdata) |
| `glaze.color(input, config?)` | `GlazeColorToken` | [Color tokens](./color-tokens.md#glazecolorinput-config) |
| `glaze.colorFrom(data)` | `GlazeColorToken` | [Color tokens](./color-tokens.md#tokenexportoverride--glazecolorfromdata) |
| `glaze.shadow(input)` | `ResolvedColorVariant` | [Utilities](./utilities.md#glazeshadowinput--glazeglowinput) |
| `glaze.glow(input)` | `ResolvedColorVariant` | [Utilities](./utilities.md#glazeshadowinput--glazeglowinput) |
| `glaze.format(variant, format?, pastel?)` | `string` | [Utilities](./utilities.md#glazeformatvariant-format-pastel) |
| `glaze.formatHdr(variant, hdrFormat?)` | `string \| undefined` | [Utilities](./utilities.md#glazeformathdrvariant-hdrformat) |
| `glaze.configure(config)` | `void` | [Configuration](./configuration.md#glazeconfigureconfig) |
| `glaze.getConfig()` | `GlazeConfigResolved` | [Configuration](./configuration.md#glazegetconfig) |
| `glaze.resetConfig()` | `void` | [Configuration](./configuration.md#global-config) |
| `glaze.isThemeExport(data)` | `data is GlazeThemeExport` | [Authoring snapshots](#authoring-snapshots-and-versioning) |
| `glaze.isColorTokenExport(data)` | `data is GlazeColorTokenExport` | [Authoring snapshots](#authoring-snapshots-and-versioning) |
| `glaze.isPaletteExport(data)` | `data is GlazePaletteExport` | [Authoring snapshots](#authoring-snapshots-and-versioning) |

## Instance methods

| Instance | Members | Documented in |
| --- | --- | --- |
| `GlazeTheme` | `hue`, `saturation`, `darkHue`, `darkSaturation`, `getConfig`, `colors`, `color`, `remove`, `has`, `list`, `reset`, `extend`, `resolve`, `export` | [Themes](./theme.md#theme-methods) |
| `GlazeTheme` output | `tokens`, `tasty`, `json`, `css`, `dtcg`, `dtcgResolver`, `tailwind` | [Output formats](./output.md) |
| `GlazePalette` | `list`, `primary`, `theme`, `themes`, `export`, and the seven output methods | [Palettes](./palette.md#palette-members) |
| `GlazeColorToken` | `resolve`, `token`, `tasty`, `json`, `css`, `dtcg`, `dtcgResolver`, `tailwind`, `export` | [Color tokens](./color-tokens.md#token-methods) |

## Named exports

Everything below is exported from `'@tenphi/glaze'` next to `glaze`. Apart from `GLAZE_EXPORT_VERSION` and the type guards, these are lower-level building blocks for advanced use and custom pipelines.

One subpath has its own exports: `@tenphi/glaze/harness/measure`, the measuring module behind the agent tools. See [Measuring module](./utilities.md#measuring-module).

| Export | Kind | Documented in |
| --- | --- | --- |
| `glaze` | Function | This page |
| `GLAZE_EXPORT_VERSION` | Constant (`2`) | [Authoring snapshots](#authoring-snapshots-and-versioning) |
| `isThemeExport`, `isColorTokenExport`, `isPaletteExport` | Type guards (same functions as the `glaze.*` statics) | [Authoring snapshots](#authoring-snapshots-and-versioning) |
| `assertNativeFormat`, `assertAllPastel` | Export guards | [Utilities](./utilities.md#export-guards); where they apply: [Color formats](./output.md#color-formats) (`assertNativeFormat`), [`splitHue` requirements](./output.md#requirements) (`assertAllPastel`) |
| `findToneForContrast`, `findValueForMixContrast`, `resolveMinContrast`, `resolveContrastForMode`, `resolveContrastForLevel`, `resolveApcaTarget`, `apcaContrast` | Contrast solver functions | [Utilities](./utilities.md#contrast-solver) |
| `APCA_PRESETS`, `APCA_HC_ENHANCEMENT`, `APCA_MAX_LC` | Contrast constants | [Utilities](./utilities.md#constants-and-types); presets in [Contrast and high contrast](./contrast.md#apca-presets) |
| `normalizeRole`, `inferRoleFromName`, `roleToPolarity`, `oppositeRole` | Role helpers | [Utilities](./utilities.md#role-helpers) |
| `toTone`, `fromTone`, `toneFromY`, `yFromTone`, `okhstToOkhsl`, `okhslToOkhst`, `variantToOkhsl`, `REF_EPS` | OKHST tone utilities | [Utilities](./utilities.md#okhst-tone-utilities); the model in [Tone and OKHST](../okhst.mdx) |
| `okhslToLinearSrgb`, `okhslToSrgb`, `okhslToOklab`, `oklabToOkhsl`, `srgbToOkhsl`, `hslToSrgb`, `okhslToOklch`, `cuspLightness`, `parseHex`, `parseHexAlpha`, `srgbToHex`, `relativeLuminanceFromLinearRgb`, `contrastRatioFromLuminance`, `gamutClampedLuminance`, `apcaLuminanceFromLinearRgb` | Color math | [Utilities](./utilities.md#color-math) |
| `formatOkhsl`, `formatOkhst`, `formatRgb`, `formatHsl`, `formatOklch` | Format writers (0–1 scale) | [Utilities](./utilities.md#format-writers) |
| `formatSrgb`, `formatSrgbLinear` | HDR writers: extended or linear sRGB channels, unclamped, as `color(srgb R G B)` / `color(srgb-linear R G B)` | [Utilities](./utilities.md#format-writers); the format: [Extended sRGB](../hdr.mdx#extended-srgb) |
| `hdrToSrgb`, `hdrToLinearSrgb` | HDR channels: a `ResolvedHdr` → extended or linear sRGB, unclamped | [Utilities](./utilities.md#hdrtosrgbhdr--hdrtolinearsrgbhdr) |

## Types

All public types are exported with `import type`.

| Area | Types | Documented in |
| --- | --- | --- |
| Theme | `GlazeTheme`, `GlazeThemeSeed`, `GlazeExtendOptions`, `GlazeThemeExport` | [Themes](./theme.md) |
| Resolved values | `ResolvedColor`, `ResolvedColorVariant` | [Themes](./theme.md#themeresolve) |
| HDR values | `ResolvedHdr`, `GlazeHdrFormat` | [Color definitions](./color-definitions.md#hdr-values-resolvedhdr), [Utilities](./utilities.md#glazeformathdrvariant-hdrformat), [Output formats](./output.md#hdr-output) |
| Color definitions | `ColorDef`, `ColorMap`, `RegularColorDef`, `ShadowColorDef`, `GlowColorDef`, `MixColorDef`, `LightingTuning`, `ShadowTuning`, `GlowTuning` | [Color definitions](./color-definitions.md) |
| Tone and adaptation | `ToneValue`, `RelativeValue`, `ExtremeValue`, `AdaptationMode` | [Color definitions](./color-definitions.md), [Configuration](./configuration.md) |
| Roles | `Role`, `RoleInput`, `Polarity` | [Color definitions](./color-definitions.md), [Utilities](./utilities.md) |
| Contrast | `HCPair`, `MinContrast`, `ContrastSpec`, `ContrastPreset`, `ApcaPreset` | [Contrast and high contrast](./contrast.md) |
| Contrast solver | `ResolvedContrast`, `FindToneForContrastOptions`, `FindToneForContrastResult`, `FindValueForMixContrastOptions`, `FindValueForMixContrastResult` | [Utilities](./utilities.md) |
| Configuration | `GlazeConfig`, `GlazeConfigOverride`, `GlazeConfigResolved`, `ToneWindow` | [Configuration](./configuration.md) |
| Color values | `GlazeColorValue`, `HexColor`, `OkhslColor`, `OkhstColor`, `RgbColor`, `OklchColor` | [Color tokens](./color-tokens.md) |
| Color tokens | `GlazeColorToken`, `GlazeColorInput`, `GlazeFromInput`, `GlazeColorOverrides`, `GlazeColorCssOptions`, `GlazeColorTailwindOptions`, `GlazeColorDtcgResult`, `GlazeColorDtcgResolverOptions`, `GlazeColorTokenExport`, `GlazeColorInputExport`, `GlazeColorOverridesExport` | [Color tokens](./color-tokens.md) |
| Standalone shadow and glow | `GlazeLightingInput`, `GlazeShadowInput`, `GlazeGlowInput` | [Utilities](./utilities.md) |
| Palette | `GlazePalette`, `GlazePaletteOptions`, `GlazePaletteExportOptions`, `GlazePaletteTastyOptions`, `GlazePaletteCssOptions`, `GlazePaletteExport` | [Palettes](./palette.md) |
| Output options | `GlazeColorFormat`, `GlazeOutputModes`, `GlazeTokenOptions`, `GlazeTastyOptions`, `GlazeJsonOptions`, `GlazeCssOptions`, `GlazeCssResult`, `GlazeCssSchemeBlocks`, `GlazeTailwindOptions` | [Output formats](./output.md) |
| DTCG | `GlazeDtcgOptions`, `GlazeDtcgResult`, `DtcgColorSpace`, `DtcgColorToken`, `DtcgColorValue`, `DtcgSrgbColorValue`, `DtcgOklchColorValue`, `DtcgDocument` | [Output formats](./output.md#dtcgoptions) |
| DTCG HDR extension | `GlazeDtcgExtensions`, `GlazeDtcgHdr` | [Output formats](./output.md#dtcg-extensions) |
| DTCG resolver | `GlazeDtcgResolverOptions`, `GlazeDtcgResolverContextNames`, `GlazeDtcgResolverDocument`, `DtcgResolverSet`, `DtcgResolverModifier`, `DtcgResolverRef`, `DtcgTokenTree` | [Output formats](./output.md#dtcgresolveroptions) |
| `splitHue` planning | `HuePlan`, `HueDeclaration`, `ChannelCtx` | [Output formats](./output.md#planning-types) |
| Snapshots | `GlazeExportKind`, `GlazeExportVersion` | [Authoring snapshots](#authoring-snapshots-and-versioning) |

## Conventions

### Scales

Glaze mixes a few numeric scales. Which one applies depends on where a value is authored:

| Value | Scale | Where |
| --- | --- | --- |
| Hue | 0–360 degrees | Everywhere: seeds, per-color `hue` / `darkHue`, resolved variants, value objects. |
| Seed saturation | 0–100 | `glaze(hue, saturation)`, `GlazeThemeSeed.saturation` / `darkSaturation`, `theme.saturation`, the structured `glaze.color({ saturation })`, `GlazeColorOverrides.saturation`. |
| Per-color saturation | 0–1, a factor of the seed | `RegularColorDef.saturation` / `darkSaturation`; `saturationFactor` / `darkSaturationFactor` on color tokens. With `from`, an explicit `saturation` is still a factor of the seed. |
| Tone | 0–100 | Authored `tone`, tone deltas (`'+20'`). Shadow and glow `intensity` is a step in tones (0–100). |
| Tone window endpoints | 0–100 OKHSL lightness, not tone | `lightTone` / `darkTone` `lo` and `hi`. The default `darkTone: [15, 95]` holds tones 9.25–95.9, so a tone-100 `auto` surface lands at tone 9.25 in dark. See [Tone windows](./configuration.md#tone-windows). |
| Mix `value` | 0–100 | `MixColorDef.value` (0 = base, 100 = target). |
| Resolved variant | `h` 0–360; `s`, `t`, `alpha` 0–1 | `ResolvedColorVariant`, the input to `glaze.format()`. Its optional `hdr` (`ResolvedHdr`) uses the same scales plus `exposure`. |
| Headroom, exposure | Stops above SDR white; each stop doubles luminance. `headroom` 0–2. | `glowTuning.headroom` and a glow's `tuning.headroom`; `ResolvedHdr.exposure` and DTCG `exposure`. 1 stop past white is tone 121.98, 2 stops tone 144.34. |
| HDR channels | Extended or linear sRGB, unclamped; `1` is SDR white. One stop above it is `1.3533` extended, `2` linear. | Extended: every exporter's HDR strings, DTCG `hdr.value`, `glaze.formatHdr()` by default, `hdrToSrgb`, `formatSrgb`. Linear: `glaze.formatHdr(v, 'srgb-linear')`, `hdrToLinearSrgb`, `formatSrgbLinear`. |
| Value objects | `{ h, s, l }` and `{ h, s, t }`: `s`, `l`, `t` 0–1. `{ r, g, b }`: 0–255. `{ l, c, h }`: `L` and `C` 0–1, `H` degrees. | `from`, `glaze.color()`, `glaze.shadow()` / `glaze.glow()` inputs. |
| Format writers and converters | `h` 0–360; `s`, `l`, `t` 0–1 | `formatOkhsl` … `formatOklch` and the color math functions. The format writers warn when they get 0–100 percentages (the pre-2.0 scale). |
| Opacity, ratios | 0–1 | `opacity`, `darkDesaturation`, lighting `tint` / `reach` / `hueBleed`. |
| Contrast level | 0–100, or `'auto'` | `contrastLevel`. |
| sRGB channels | 0–255 | `glaze.fromRgb(r, g, b)`, `rgb()` output. |

### Scheme variant names

Every resolved color has four variants: `light`, `dark`, `lightContrast`, and `darkContrast`. `ResolvedColor` and the results of `tokens()`, `json()`, `css()`, and `dtcg()` use these names as keys. `tasty()` keys the variants by state alias, `tailwind()` by selector, and `dtcgResolver()` uses the names as its default context names. See [Scheme variants](./output.md#scheme-variants).

### High-contrast pairs

Fields that can differ in high contrast accept an `HCPair<T>`: either a single value or a `[normal, highContrast]` tuple.

```ts
type HCPair<T> = T | [T, T];

theme.colors({
  border: { base: 'surface', tone: ['-8', '-20'] },
  'surface-text': { base: 'surface', contrast: ['AA', 'AAA'] },
});
```

`tone`, `contrast`, shadow and glow `intensity`, and mix `value` accept pairs. The first entry drives `light` / `dark`, the second `lightContrast` / `darkContrast`. Under a manual `contrastLevel` the normal variants interpolate between the two. Full rules: [Contrast and high contrast](./contrast.md).

### Tone values

An authored `tone` is a number (absolute, 0–100), a signed string (`'+N'` / `'-N'`, a tone delta from `base`), or `'max'` / `'min'` (the scheme's tone extreme). See [Color definitions](./color-definitions.md#tone-values) and, for what tone means, [Tone and OKHST](../okhst.mdx).

## Authoring snapshots and versioning

Every instance can be saved as a JSON-safe **authoring snapshot** — the definitions and a frozen config, not resolved colors — and restored later:

| Export | Restore | Kind |
| --- | --- | --- |
| [`theme.export(override?)`](./theme.md#themeexportoverride) | [`glaze.themeFrom(data)`](./theme.md#glazethemefromdata--glazefromdata) | `'theme'` |
| [`token.export(override?)`](./color-tokens.md#tokenexportoverride--glazecolorfromdata) | [`glaze.colorFrom(data)`](./color-tokens.md#tokenexportoverride--glazecolorfromdata) | `'color'` |
| [`palette.export(override?)`](./palette.md#paletteexportoverride--glazepalettefromdata) | [`glaze.paletteFrom(data)`](./palette.md#paletteexportoverride--glazepalettefromdata) | `'palette'` |

Resolved output (`tokens()`, `css()`, `json()`, …) is a different thing: it can't be restored. [Exporting and integration](../exporting.mdx) explains when to use which.

### `kind` and `version`

Every `.export()` writes two fields:

- `kind` — `GlazeExportKind`: `'theme'`, `'color'`, or `'palette'`.
- `version` — `GLAZE_EXPORT_VERSION`, currently `2` (`GlazeExportVersion` is its literal type).

| Version | Written by |
| --- | --- |
| `1` | Glaze 1.1–2.x. |
| `2` | Glaze 3: shadow `intensity`, `fg`, and tuning changed meaning, and `glow` was added. |

### Restore checks

`themeFrom`, `colorFrom`, and `paletteFrom` apply the same rules:

| Snapshot | Result |
| --- | --- |
| No `kind` / no `version` (legacy or hand-written) | Accepted. |
| `kind` doesn't match the restore function | Throws, e.g. `glaze.themeFrom: expected kind "theme", got "palette".` |
| `version` not an integer ≥ 1 | Throws `… invalid "version" field — expected an integer >= 1 (got <value>).` |
| `version` greater than `GLAZE_EXPORT_VERSION` | Throws `… unsupported export version <n> (this library supports version 2). Upgrade @tenphi/glaze to load this snapshot.` |
| `version: 1` theme or palette with shadow colors or a `shadowTuning` config | Throws (below). |
| `version: 1` without shadows | Restores as before. |

A version-1 theme snapshot with shadows is rejected because Glaze 3 changed what shadow `intensity`, `fg`, and tuning mean: restoring it would silently render every shadow differently. The error names the shadows and points to the upgrade guide:

```text
glaze.themeFrom: this snapshot is export version 1 (Glaze 1.1–2) and contains
  shadow colors ("card-shadow").
Glaze 3 changed what shadow "intensity", "fg" and tuning mean, so it would
  restore with different shadows.
Re-author them as described in docs/migration.md ("3.0 — shadows and
  glows") and export again.
```

A theme entry inside a palette snapshot that has no `version` of its own is checked against the palette's `version`. The check keys on `version: 1`, so a snapshot without any `version` (a hand-written one, or one from Glaze 1.0) is not checked: re-author its shadows before restoring it. How to re-author Glaze 2 shadows is in [3.0 — shadows and glows](../migration.md#30--shadows-and-glows).

### Type guards

`isThemeExport`, `isColorTokenExport`, and `isPaletteExport` (also available as `glaze.isThemeExport` etc.) tell the snapshot kinds apart. They check `kind` when present and fall back to the shape for legacy snapshots:

| Guard | `true` when |
| --- | --- |
| `isThemeExport(data)` | A plain object with `kind: 'theme'` or no `kind`, numeric `hue` and `saturation`, and no `form` or `themes` field. |
| `isColorTokenExport(data)` | A plain object with `kind: 'color'` or no `kind`, and `form` of `'value'` or `'structured'`. |
| `isPaletteExport(data)` | A plain object with `kind: 'palette'` or no `kind`, a `themes` object, no `form`, and no numeric `hue`. |

A `kind` that names a different snapshot type always returns `false`. The guards check structure only; they don't validate `version` or the color definitions.

```ts
import { glaze } from '@tenphi/glaze';

const data: unknown = JSON.parse(saved);

if (glaze.isPaletteExport(data)) glaze.paletteFrom(data);
else if (glaze.isThemeExport(data)) glaze.themeFrom(data);
else if (glaze.isColorTokenExport(data)) glaze.colorFrom(data);
```
