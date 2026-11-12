# @tenphi/glaze

## 3.1.0

### Minor Changes

- [#113](https://github.com/tenphi/glaze/pull/113) [`fc2c517`](https://github.com/tenphi/glaze/commit/fc2c5175209353de2b2f84bd23792e668792d8c5) Thanks [@tenphi](https://github.com/tenphi)! - Ship a harness for coding agents in the package. With [harnesspm](https://www.npmjs.com/package/@tenphi/harnesspm), projects that depend on Glaze get a short rule, the docs index, a `glaze-theme` skill and three tools: `glaze:inspect` resolves a theme or palette in light, dark and high contrast and checks every contrast floor (`--color` and `--theme` narrow a large palette), `glaze:color` resolves one color without a theme file and measures it on a `--base` in every scheme, and `glaze:contrast` measures two colors with WCAG and APCA.

- [#113](https://github.com/tenphi/glaze/pull/113) [`fc2c517`](https://github.com/tenphi/glaze/commit/fc2c5175209353de2b2f84bd23792e668792d8c5) Thanks [@tenphi](https://github.com/tenphi)! - Export the measuring module behind the agent tools as `@tenphi/glaze/harness/measure`, with types. `inspectTheme`, `inspectColor`, `filterThemes`, `missesOf` and `measurePair` measure a theme, a single color or a pair the way the contrast solver does, so other tools, such as a design system's token lookup, can build on them. See "Measuring module" in the Utilities reference.

## 3.0.1

### Patch Changes

- [#110](https://github.com/tenphi/glaze/pull/110) [`5cec491`](https://github.com/tenphi/glaze/commit/5cec491cf39110bfcbf0aa768734f31111c5f3c1) Thanks [@tenphi](https://github.com/tenphi)! - Shadows and glows no longer warn "cannot reach" when high contrast or a manual `contrastLevel` is what moved their surface out of reach. High contrast bypasses the tone windows (a white page is black in dark high contrast), and a level widens them, so the dark page nears black faster than an interpolated `intensity` fades. A page shadow with `intensity: [8, 0]` warned at every level from about 24 to 99 (level 50: "cannot reach a 4.0-tone step (reached 3.1)"), and no `[N, 0]` above about 1.6 avoided it.

  In those passes (`lightContrast` / `darkContrast`, and `light` / `dark` at any level other than `0`) the step still pins to the pigment's strongest composite, but it warns only when it is out of reach in both light and dark, because then the step itself is too big for its surface. The light and dark schemes at `'auto'` or level `0` warn as before. Resolved colors and every export are unchanged. See "When Glaze moves the surface" in `docs/shadows-and-glows.mdx`.

## 3.0.0

### Major Changes

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Input that 2.x resolved into broken or wrong colors now throws or clamps, and the config no longer leaks shared objects. See "3.0 — stricter input validation" in `docs/migration.md`.

  Breaking changes (runtime):
  - Tone windows (`lightTone` / `darkTone`) throw on `lo > hi` (`[90, 20]` used to invert the scale silently), an endpoint that isn't a finite number, an `eps` that is missing, isn't above 0, or is above `1e6` (a huge `eps` rendered `NaN` colors), or a value that isn't `[lo, hi]`, `{ lo, hi, eps }`, or `false`, `null` included (`configure()` used to ignore a `null` window). Endpoints clamp to 0–100; 2.x extended the window past them. `configure()` throws at the call; a theme or token override throws when it resolves.
  - `darkDesaturation` clamps to 0–1 (in `configure()`, and in a theme or token override when it resolves); a value that isn't a finite number throws (2.x read `'0.5'` as 0.5 and `true` as 1). Before, `2` was accepted and `-0.5` raised dark saturation.
  - A relative tone in the high-contrast entry of a pair now needs `base`, like one in the normal entry: `tone: [50, '+20']` on a root color throws instead of reading `'+20'` as tone 20. In `glaze.color({ from, tone: [50, '+20'] })` the delta is measured from the token's own color, as documented.
  - Hex parsing is strict: `parseHex` / `parseHexAlpha` reject any character that isn't a hex digit. Before, the 6- and 8-digit forms checked only the first digit of each pair, so `'#1z2z3z'` read as `#010203` and `'#-1-2-3'` produced negative channels. `glaze.color()`, `glaze.fromHex()`, a theme color's `from`, and the `bg` / `fg` of `glaze.shadow()` / `glaze.glow()` now throw `glaze: invalid hex color "…".` for such input.
  - Color-function strings are strict: a component that isn't a number throws `glaze: invalid component "…" in "…".` (2.x emitted `NaN` colors, or read `hsl(abc 50% 50%)` as a gray). The CSS keyword `none` reads as 0, a hue takes `deg`, `turn`, `rad`, or `grad` (2.x read `0.5turn` as 0.5°), and out-of-range values clamp as CSS clamps them, which moves an `rgb()` channel outside 0–255, an `okhsl()` / `okhst()` saturation outside 0–100% (past 100% moves a token in dark; either way moves a theme color's `from` in every scheme, where 2.x painted light out of gamut and could turn the hue), a negative `okhsl()` lightness (2.x gave `NaN` or a wrong tone), a negative `oklch()` chroma (2.x turned its hue around), and an `oklch()` lightness below about −0.37 (2.x emitted `NaN`). Value objects reject a negative `s` / `l` / `t` / `c`, and clamp a 0–1 field between 1 and 1.5 to 1.
  - A malformed `contrast` throws, naming the color: a misspelled preset (`'aa'`, `{ apca: 'Body' }`), a non-finite number, an object without exactly one of `wcag` / `apca` set (a key holding `undefined` is unset), or a pair without two entries. 2.x pinned such a color to black or white, threw a `TypeError` from its warning code, used APCA when both keys were set, or read the first two entries of a longer pair.
  - A color field that isn't a finite number throws, naming the color and field: `tone`, `hue`, `darkHue`, `saturation`, `darkSaturation`, a mix `value`, a shadow `intensity`; so does a relative string that isn't `'+N'` / `'-N'` (`'+-5'`, `'+abc'`, `'+5px'`) and an `opacity` outside 0–1. A theme seed whose `hue` / `saturation` isn't a finite number throws at `glaze()`. 2.x emitted `NaN` colors or an alpha outside 0–1, or read past a trailing unit (`'+5px'` as `'+5'`).
  - `null` for `contrastLevel` or `darkDesaturation` throws, like any other non-number; 2.x ignored it.
  - A theme or palette snapshot that holds any of these still restores with `glaze.themeFrom()` / `paletteFrom()` and throws on its first output (one whose seed is rejected throws in `themeFrom()` / `paletteFrom()` itself), and so does a token snapshot whose frozen config holds one. A token snapshot whose color value (its input or a raw `base`) is rejected throws in `glaze.colorFrom()`, as `glaze.color()` does.

  Fixed:
  - `glaze.getConfig()` and `theme.getConfig()` return deep copies. Mutating a nested field such as `getConfig().modes.highContrast` used to change the live config without invalidating any cache. `theme.getConfig()` on a theme without an override returned the live global config itself, so mutating it changed every theme and token; with an override, it changed that theme's output until its next edit, skipping validation.
  - The config you pass is copied: by `configure()`, and by `glaze()`, `extend()`, and `glaze.color()` for their config override. Changing that array or object afterwards no longer reaches a later resolve or `export()`. An override's fields are read by property access, so class getters and inherited fields now reach `export()` and `extend()` too, not only the resolve.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Dark variants of `mode: 'auto'` tone-delta colors (`tone: '+N'` / `'-N'`) now step evenly. A dark delta used to start from the base's light tone, which carries the light window's lift — or, on a contrast-solved base or a mix, sits wherever light put it — so on a tone-50 base `'+4'` came out −5.6 in dark and `'-4'` +1.3, and a `'-4'` hover on an AAA button stepped darker in dark as well. It now starts from where the base sits on the authored scale: its authored tone, or, for a `fixed` or `static` base, an `auto` contrast-solved base, a mix, or an `auto` `'max'` / `'min'` on a base, its dark tone read back through the dark window. A dark delta then lands where the same authored tone would on every base — along chains, for `from` colors, and for `glaze.color()` links (including a base with its own `lightTone`; a base with its own `darkTone` is read back through the link's dark window, so a `'+0'` link lands on it). At the reference dark `eps` every dark step is the dark window's scale times the delta (about 0.87× at the defaults: `'+4'` → −3.5, `'-4'` → +3.5) and every high-contrast dark step is exact, under any light `eps`; a custom dark `eps` reshapes the dark window's curve, so dark and high-contrast dark steps follow that curve instead of a fixed scale. On a `fixed` or `static` base the `auto` dependent still inverts on its own, now mirrored around wherever the base sits: 2.x reflected it across the whole scale, so an `auto` `'+30'` label on a `fixed` tone-52 fill landed 31.5 below it in dark (now 26.0), and a `'-4'` hover on a `fixed` delta riding an `auto` surface landed 22 tones above it (now +3.5). The flip is still decided on the light tone, so near the ends of the scale a step that fits in light can run off the authored scale in dark and stop at the dark window's edge: a negative delta on an `auto` base authored below |N| stops at the top (`'-4'` on tone 2 steps about +1.7 in dark, on tone 0 not at all), and a delta on a base anchored at its own dark tone can stop at either end, in high contrast too, as can a high-contrast step under a custom light `eps`. A base sitting past the dark window — pushed there by a contrast floor or an extreme, or placed there as a `fixed` or `static` color — is stepped from where it sits: a step back toward the window moves by the full scaled delta, and one pointing further out stops at the base instead of snapping back to the window's edge. Dark variants of these colors shift — under the default light window up to about 4 tones on low bases; more on a `fixed`, `static`, contrast-solved, mixed, or extreme base, on one past the window, or under a custom light window or `eps`, since the 2.x error grew with the window's lift (`lightTone: [15, 100]`: about 4 tones on a tone-50 base, up to 8 at the bottom) — along with anything solved, mixed, or lit from them; a contrast-solved delta whose 2.x dark step crossed its base can now land on the other side of it, mirroring light (`{ base: 'fill', tone: '-1', contrast: 3 }` on a tone-50 fill: 16.2 → 89.0 in dark); see "3.0 — even dark steps for tone deltas" in `docs/migration.md`. High-contrast variants change only for deltas on contrast-solved, mixed, extreme, `fixed`, or `static` bases, or under a custom light `eps`; `contrastLevel: 100` still equals the high-contrast tier. Light variants change only through the tie below.

  A contrast-solved color whose preferred tone lands within float noise (1e-9 tones) of its base's — a `'+0'` / `'-0'` delta, or an absolute tone equal to the base's — no longer takes a side from that noise, in any scheme, light included: the solver's own tie rule picks the side, so such a color can land on the other side of its base, or move by a few thousandths of a tone where it keeps its side. Under a manual `contrastLevel`, a probe that lands on its base likewise pins no side.

- [#104](https://github.com/tenphi/glaze/pull/104) [`022e087`](https://github.com/tenphi/glaze/commit/022e08788f723161f745f95894c1f990283be5a0) Thanks [@tenphi](https://github.com/tenphi)! - Fix `contrast` on transparent mixes: the solver now composites the way browsers do (`source-over` on gamma-encoded sRGB) instead of in linear light. Previously a white overlay on a dark surface could render well below its floor (an `'AA'` overlay painted at about 2.3:1), and black overlays on light surfaces overshot theirs with roughly twice the needed opacity. Transparent mixes with `contrast` now resolve to different, correct alpha values; re-check pinned ones (see "3.0 — other changes to resolved colors" in `docs/migration.md`).

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - `glaze({ hue, saturation, darkHue?, darkSaturation? }, config)` now applies the config override. Before, the object form read the override only from the third argument, so the documented two-argument call silently dropped it, and themes created that way now resolve differently. `glaze(seed, undefined, config)` still works but is deprecated.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - `FindValueForMixContrastOptions` no longer has `targetLinearRgb` (a type-level removal: delete it from direct `findValueForMixContrast` calls). The solver never read it; the mix is described entirely by `luminanceAtValue`, so results are unchanged.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Output options are tightened: options a method accepted but never read are removed from its type, and `splitHue` no longer fails silently.

  Breaking changes (type-level removals; delete the option, the output is the same):
  - `palette.json()` takes `GlazeJsonOptions` only: `prefix` is removed.
  - `splitHue` is removed from `palette.tokens()` / `dtcg()` / `dtcgResolver()` / `tailwind()` (it left `GlazePaletteExportOptions`) and from `token.token()` / `token.tasty()`.
  - `theme.tasty()` takes the new `GlazeTastyOptions`, without `prefix`. `GlazeTokenOptions` is now only `format`, `modes`, and `states`.
  - `palette.tasty()` and `palette.css()` take the new `GlazePaletteTastyOptions` / `GlazePaletteCssOptions`, without `name` (their hue vars are always named after each theme).

  Breaking changes (runtime):
  - `splitHue` with a `format` other than `'oklch'` throws (`glaze: splitHue requires format 'oklch' (got 'rgb'). Use format: 'oklch' or drop splitHue.`) on `theme.css()` / `tasty()`, `palette.css()` / `tasty()`, and `token.css()`, instead of quietly emitting inline colors.
  - A color that sets its own hue and is chromatic in light, under the theme hue var's name (a `brand` color with `name: 'brand'`, or, in an unprefixed palette, a color named after another theme), throws and names both sides, instead of silently rendering at the theme's hue.
  - In `css()` with `splitHue`, a color's value property that lands on a hue var — `suffix: '-hue'`, or `suffix: ''` with a color named `*-hue` — throws the same way, instead of emitting a `var()` cycle or replacing a hue var with a color. This covers `theme.css()`, `palette.css()` (primary aliases included), and `token.css()`.

  Fixed:
  - `splitHue` hue declarations are rounded to 2 decimals like the hue in `oklch()` output, so a `from` color emits `--logo-hue: 266.16` instead of `266.15797905637027`.
  - A color achromatic in light no longer emits a dead dark `--*-hue` declaration. It renders as a literal `oklch()` in every scheme, and in an unprefixed palette that declaration could override another theme's hue var in dark.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Fix the contrast solver's auto-flip so a solved color keeps its 1% (WCAG) / 0.5 Lc (APCA) safety margin and lands on the side it reports. Before, with `autoFlip` on (the default), the opposite side's search could start from the first side's gray seed or stop on the preferred tone itself, returning a color that met the floor with no margin (4.500001:1 for `'AA'`) and calling it a flip to the other side. Affected colors, depending on hue and base, now resolve with the margin, about 0.3 tone further from their base. A color with no tone of its own on a mid-tone base, where both sides pass at the same distance, now keeps the side it searched first instead of a side picked by search noise.

  Direct `findToneForContrast` calls now return a preferred tone that clears the floor but not the margin as met, with `branch: 'preferred'`, whenever the search can't improve on it: no searched side meets the floor, or the starting side's only position is the preferred tone itself (it sits on that side's bound). Before, it was labelled with the side that had been searched, which could name a side of the base it doesn't sit on. A WCAG search that started away from it — from a bound, or with a forced `initialDirection` and no `flip` — lost it to the far extreme instead: white clearing a 7.2:1 floor at 7.24:1 against a tone-35 gray came back as black at 2.9:1, unmet. And with no room to search (`toneRange`), it came back `met: false`.

  The WCAG gray seed is now only the search's first probe, not a bound. Saturated hues that read darker than their gray tone (blues, violets, reds, oranges) used to stop at the seed with more contrast than asked for (5.03:1 for `'AA'` at hue 280 on a light gray surface); they now land on their own crossing at the margin (about 4.55:1), up to about 5 tones nearer their authored tone in any scheme.

  A contrast-solved color with no tone of its own on a gray base at tone 50 now always starts darker: black and white score the same against that base, and float noise used to pick the side.

  Contrast-solved colors can therefore resolve to different tones than in 2.x: apart from the side changes above, most by less than half a tone; re-check pinned values (see "3.0 — other changes to resolved colors" in `docs/migration.md`).

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - A value-form `glaze.color()` token linked to a structured base (`glaze.color({ from, base })` with `base` made by `glaze.color({ hue, saturation, tone })`) now resolves against what the base paints in light too. The base used to be re-resolved at full range for the link, so in light the link measured against the base's raw input tone instead of its rendered one: a `'+0'` link sat 2.5 tones below `glaze.color({ hue: 280, saturation: 80, tone: 50 })`, and an `'AA'` link measured 4.16:1 against it with no warning. A `'+0'` link now lands on its base and a `contrast` floor holds against it in every scheme, whatever config the base carries. Light variants of such links move, and so does the dark variant of a delta whose `autoFlip` decision changes with the painted light tone (`'+9.8'` on a tone-90 structured base); links on value-form bases are unchanged. See "3.0 — other changes to resolved colors" in `docs/migration.md`.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Fix the APCA role of a standalone `glaze.color()` token with `contrast` (or a relative `tone`) and no `base`. It resolved as a `'surface'`, so an `{ apca }` floor was measured with the token as the background, the opposite of the same token paired with a `base`. Both now default to `'text'`: the token is the foreground and its anchor (the base, or its own input color) the background, unless you set `role`. `glaze.color({ from: '#ffffff', contrast: { apca: 60 } })` now lands on `rgb(141 141 141)` (text on white) instead of `rgb(152 152 152)`. WCAG floors are unaffected. Set `role: 'surface'` to keep a fill's 2.x result.

  A token's `name` is now a debug label only, as documented: it no longer drives role inference, so `name: 'card-bg'` no longer turns a token into a surface. Set `role` explicitly instead. `inferRole` has no effect on standalone tokens.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - `shadow` is rebuilt and `glow` is added: both are translucent overlays whose opacity is solved per surface so `intensity` is an exact **tone step**. The composite lands `intensity` tones darker (`shadow`) or lighter (`glow`) than `bg` on every surface and in every scheme, modeled the way browsers composite (`source-over` on gamma-encoded sRGB). Direction is fixed per type.

  Breaking changes:
  - **`shadow` `intensity` is a tone step.** In 2.x the same intensity darkened white by 9 tones, a surface rendered at tone 35 by 13.9 and one rendered at tone 6 by 4.4. Shadows on light surfaces keep roughly their look (old `10` ≈ 9 tones on white). Shadows on dark surfaces get stronger.
  - **`fg` is the object casting the shadow, not a contrast reference.** The step is scaled by `k = max(0, 1 + β·d·(t_bg − t_fg)/100)` (`β = tuning.objectInfluence`, default `0.5`), so a darker object casts a deeper shadow and an object at the surface's tone, or no `fg`, gives exactly `intensity`. Drop `fg: 'text'`, or point `fg` at the element.
  - **The pigment is pure black (`shadow`) / white (`glow`)** by default, so the surface keeps its hue.
  - **`ShadowTuning` is replaced** by the shared `LightingTuning` (`objectInfluence`, `tint`, `reach`, `hueBleed`), also exported as `ShadowTuning`. The new `GlowTuning` extends it with HDR `headroom`. The old knobs (`saturationFactor`, `maxSaturation`, `lightnessFactor`, `lightnessBounds`, `minGapTarget`, `alphaMax`, `bgHueBlend`) are gone. Global config gains `glowTuning`. A tuning field must be a finite number (anything else throws), and one set to `undefined` counts as unset. A `tint` on a neutral surface, which has no hue, takes the object's hue with `hueBleed` above 0 and stays neutral otherwise.
  - **`GLAZE_EXPORT_VERSION` is 2.** Version-1 theme / palette snapshots that contain shadow colors or `shadowTuning` now throw on restore; re-author the shadows and export again. Snapshots without shadows still restore, and resolve with the other 3.0 changes; one that holds input 3.0 rejects throws on its first output (see "3.0 — stricter input validation").
  - **`ColorDef` gains `GlowColorDef`.** Add a `'glow'` branch to exhaustive switches.

  New: `{ type: 'glow', bg, fg?, intensity }` and `glaze.glow()`. Out-of-reach steps (a glow on white, a deep shadow on near-black) pin to the strongest composite and emit a deduped warning. See "3.0 — shadows and glows" in `docs/migration.md`.

  The documentation is rewritten and reorganized: getting started, concept pages (tone and OKHST, schemes, contrast, shadows and glows, mixes) with live examples that follow the reader's light/dark and contrast settings, guides, and an API reference split into focused pages under `docs/reference/`. `docs/api.md` is replaced by `docs/reference/*.md`.

### Minor Changes

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - HDR glows. A glow can now go past SDR white: set `glowTuning.headroom` (globally, per theme, per color, or on `glaze.glow()`) to the number of stops above white it may use. A glow's own `tuning.headroom` merges over `glowTuning` field by field; a theme's `glowTuning` replaces the global one, as for the other tuning fields. When a glow's target tone (surface tone + `intensity × k`) passes 100, its resolved variant gains `hdr: { h, s, t, exposure }` — an opaque base, which is exactly what SDR already paints at its brightest (the pigment at full opacity, or a white surface no pigment can lift), plus a gain in stops. A glow whose pigment cannot lift a non-white surface at all (`reach: 0` on a gray surface, say) paints nothing in SDR and gets no HDR value either. The gain lands the exact step (a 12-tone glow on white reaches tone 112, `Y` 1.4631), capped so no linear channel passes `2^headroom`. It lands the whole step, so a full-reach glow starts at white as its target passes 100, while one with `reach` below 1 — pinned at its pigment, below white — jumps from that pigment to the exact step there. Every scheme uses the same headroom, high contrast included, and a manual `contrastLevel` interpolates `intensity` per pass as before.
  - Nothing changes at the default `headroom: 0`: no variant carries `hdr`. With headroom set, the SDR variant (`h` / `s` / `t` / `alpha`) stays byte-identical, and so does every exporter's output until you opt in with `modes.hdr`.
  - `glaze.formatHdr(variant)` writes the HDR value as extended sRGB, `color(srgb R G B)` with a channel above 1 (the sRGB curve continued past white, e.g. `color(srgb 1.1813 1.1813 1.1813)`), or returns `undefined` for a variant without one. `glaze.formatHdr(variant, 'srgb-linear')` writes the same color in linear light (`color(srgb-linear 1.4631 1.4631 1.4631)`). `hdrToSrgb()` / `hdrToLinearSrgb()` return the channels as numbers (a WebGPU `'srgb'` canvas, Apple's extended sRGB and Android's `EXTENDED_SRGB` take the extended sRGB ones as they are), and `formatSrgb()` / `formatSrgbLinear()` write channels you build yourself.
  - `headroom` must be a finite number ≥ 0, otherwise Glaze throws. Values above 2 clamp to 2 with a warning, since headroom counts stops, not a ratio (2 stops is 4× white); it prints once per field and value, and only after the whole `configure()` call, override, or color map has validated. A `headroom` on `shadowTuning` or a shadow's `tuning` throws.
  - When HDR covers a glow's step, the "cannot reach" warning no longer fires for it. When the headroom cap leaves the step short, a new warning names the headroom and what it reached.
  - `GlowTuning` is now its own interface (`LightingTuning` plus `headroom`); `ShadowTuning` is unchanged. New types: `ResolvedHdr`, `GlazeHdrFormat` (`'srgb' | 'srgb-linear'`); `ResolvedColorVariant.hdr` is optional. Snapshots stay at export version 2 and carry `headroom` through `export()` / `themeFrom()`.

  HDR output is opt-in: `modes.hdr` (default `false`, globally via `glaze.configure({ modes: { hdr: true } })` or per call) adds the HDR values to every exporter, next to the SDR ones it already emits and only for the schemes the other modes include. HDR values are always extended `color(srgb R G B)`, whatever `format`, and literal even under `splitHue`. The data exports (DTCG, `json()`, `tokens()`) are for native apps and WebGPU code. The CSS exports (`css()`, `tasty()`, Tailwind) are experimental: no browser paints a CSS color past SDR white yet, and their shape may change (for example to CSS `hdr-color()`) once one does. Palette prefixes, the primary alias and collision filtering apply to them like any other entry.
  - `tasty()`: a glow variant with an HDR value adds a key right after its SDR key, under the new `states.hdr` alias (default `'@media(dynamic-range: high)'`): `''`, hdr, dark, dark & hdr, hc, hc & hdr, dark & hc, dark & hc & hdr — only the keys that exist. Tasty gives later keys priority, so a dark key still beats the light HDR one.
  - `css({ hdr: true })` (default: the global `modes.hdr`) adds `hdr: { light, dark, lightContrast, darkContrast }`. Each block is dense — every color with an HDR value in any scheme, its SDR declaration where that scheme has none — so wiring each one after the SDR blocks, under the same selector plus `(dynamic-range: high)`, can't leak a light HDR value into dark.
  - `tailwind()` appends the same dense blocks after the SDR ones, under the new `hdrSelector` (default `'@media (dynamic-range: high)'`), combined with `darkSelector` / `highContrastSelector`.
  - `tokens()` adds dense `lightHdr` / `darkHdr` / `lightContrastHdr` / `darkContrastHdr` maps, each right after its scheme; `json()` adds sparse `lightHdr` / … keys per color.
  - `dtcg()` / `dtcgResolver()` keep `$value` SDR and put the HDR value in `$extensions['me.tenphi.glaze'].hdr` — `{ exposure, tone, base, value }`, with the opaque base as a DTCG sRGB color and the value as extended `srgb` components (the numbers of the CSS string) that may exceed 1 — only in the scheme documents that have it.
  - `glaze.color()` tokens are never glows, so the HDR options leave their output unchanged.
  - New types: `GlazeCssSchemeBlocks`, `GlazeDtcgHdr`, `GlazeDtcgExtensions`. `GlazeConfigResolved.states.hdr` and `modes.hdr` are now always present.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Export `apcaLuminanceFromLinearRgb`, the APCA screen luminance (`Ys`) the contrast solver feeds `apcaContrast`, so `apcaContrast(apcaLuminanceFromLinearRgb(text), apcaLuminanceFromLinearRgb(bg))` reproduces the solver's own Lc for a resolved pair.

### Patch Changes

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Grays given as values parse as exact grays. An sRGB gray (a hex such as `'#f5f5f5'`, `rgb(250 250 250)`, `hsl(0 0% 98%)`, an `{ r, g, b }` object, a `glaze.fromHex()` / `glaze.fromRgb()` seed, or an `srgb` mix that lands on a gray) used to come out with a small saturation from float residue, at a hue near 90. That saturation grew toward white: `#fefefe` read 1.6e-5 and `rgb(254.999 254.999 254.999)` read 1.6e-2. `srgbToOkhsl()` now returns saturation 0 for an input whose OKLab chroma is under 1e-6, keeping its hue and lightness. What changes:
  - An OKHSL mix from a light gray (`'#f1f1f1'` and lighter; in a pastel mix, an `srgb` blend from about `rgb(232 232 232)`), or from a color of a theme seeded with one, keeps the other side's hue instead of sweeping from hue 90. A 50% mix from `'#f5f5f5'` toward a blue accent used to come out teal, and toward a violet one pink.
  - A gray with decimal channels near white no longer gives the colors built from it a faint warm tint: up to about 2 of 255 in a channel for `rgb(254.999 254.999 254.999)`, as a `from` value or a `glaze.fromRgb()` seed.
  - A shadow or glow `tint` no longer takes the residue hue from such a gray (about `rgb(254.85 254.85 254.85)` and lighter), whether it is the surface, the object (`fg`, with `hueBleed`), or the seed of the surface's theme. It stays neutral, or takes the other side's hue.
  - A gray read from a value prints as `oklch(L 0 0)`, its `hsl()` hue term changes, and under `splitHue` it no longer declares a `--<name>-hue` variable.
  - A contrast-solved color on a gray base can move by a few hundredths of an rgb channel.

  Colors with real chroma, and colors built only from them, paint the same.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Mixes whose base or target has a different `pastel` flag from the mix's paint what they should, and their contrast floors hold on screen:
  - A mix reads such a base or target in its own gamut, through the color that color paints. `value: 0` paints the base and `value: 100` the target exactly when they fit the mix's gamut. A pastel mix caps a vivid color at the pastel limit, keeping its hue and lightness. Before, OKHSL and transparent mixes read one gamut's saturation in the other: in a standard theme, a value-100 mix or overlay toward a pastel accent painted a much more vivid color than the accent.
  - The contrast solver measures the color the mix emits. A transparent mix toward a pastel target in a standard theme could paint 2.9:1 under a 3:1 floor, and a pastel `srgb` mix measured its unclamped blend but emitted the clamped one, missing an AA floor at 4.3:1. Both happened with no warning.
  - When a pastel mix can't reach its floor because the cap took its target's saturation, the warning says so and suggests `pastel: false` on the mix.

  Mixes whose base, target, and the mix itself share a flag resolve exactly as before, except a pastel `srgb` mix with a contrast floor whose blend reaches the pastel limit: it now measures the clamped color it emits.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - A mix whose `contrast` floor is out of reach now warns, once per scheme and deduplicated like a regular color: `glaze: mix "<name>" cannot meet WCAG 4.50 against its base in light scheme (got …)`. Before, it settled at the pure target (or the pure base at `value: 100`) silently. The same slack applies, so a miss by rounding stays quiet.

  An unmet floor on a regular color now logs only its "cannot meet" warning. The chromatic drift advisory no longer repeats it for the same scheme with the same measured value, and it no longer fires for achromatic (saturation 0) colors, whose tone is exact.

- [#107](https://github.com/tenphi/glaze/pull/107) [`e11d1b8`](https://github.com/tenphi/glaze/commit/e11d1b8e7ac8b09373214693cb7ad1c277898ade) Thanks [@tenphi](https://github.com/tenphi)! - Fixes found in the final 3.0 review:
  - `glaze.isThemeExport` / `isColorTokenExport` / `isPaletteExport` are typed as type guards in the published declarations. They came out as `any` (the bundler wrote a self-referencing `typeof`), so they didn't narrow, and a project with `skipLibCheck: false` got compile errors from the package.
  - An APCA target above 106 keeps its value in high contrast: the HC boost used to cap it at 106, below the normal tier's own target.
  - `splitHue` keeps a `mode: 'static'` color at its one hue in dark when it has a `darkHue`, as the resolver and every other export do: it uses the color's light hue reference in both schemes. It used to declare the color's hue var at the `darkHue` in dark.
  - `token.export()` returns a detached snapshot, and a token copies its input, so editing either afterwards no longer changes the other. The copy reads every field by property access, so an input, value object, or `contrast` with getters, or a reactive proxy, works. A raw-value `base` is exported as the snapshot of the token it is wrapped in, so `glaze.colorFrom()` pins its config too instead of letting it follow later `glaze.configure()` calls.
  - The alpha-dropped warning prints once per color string (a theme color's `from` printed it about ten times per resolve), and its hint now applies to theme colors too.
  - `glaze(hue, config)` applies the config in plain JavaScript instead of dropping it (a third-argument config still wins); the typed forms are unchanged.
  - `glaze.shadow()` / `glaze.glow()` throw a clear error for a missing `bg` or a non-finite `intensity`, and read a `bg` / `fg` past white or black as white or black, as the browser composites it (the parser clamps it).

## 2.0.2

### Patch Changes

- [#99](https://github.com/tenphi/glaze/pull/99) [`b054f56`](https://github.com/tenphi/glaze/commit/b054f568a9b518195843a5d28b291f104d64df8a) Thanks [@tenphi](https://github.com/tenphi)! - Publish Cookbook documentation at glaze.tenphi.me with the playground available at /playground.

- [`f3a0942`](https://github.com/tenphi/glaze/commit/f3a09421b09cf46c38d60327855b2e2da8ad9739) Thanks [@tenphi](https://github.com/tenphi)! - Add Umami analytics to the documentation site.

- [`76a1d2a`](https://github.com/tenphi/glaze/commit/76a1d2aabc5c04546fda536a093f15860b70f850) Thanks [@tenphi](https://github.com/tenphi)! - Outline the logo in white in the dark scheme so its silhouette stays visible.

- [`2d86ceb`](https://github.com/tenphi/glaze/commit/2d86ceb7f87377c80128ffa4d740a17ef2678eca) Thanks [@tenphi](https://github.com/tenphi)! - Fix the docs dev server failing to start. `@astrojs/react` sets
  `resolve.dedupe: ["react", "react-dom"]`, which makes Vite resolve those
  packages from the project root, where pnpm had not linked them. Declaring
  them as devDependencies restores `pnpm docs`.

- [`ab33a34`](https://github.com/tenphi/glaze/commit/ab33a345ef10bfd5bf606e55212b69d2361891f7) Thanks [@tenphi](https://github.com/tenphi)! - Upgrade the documentation site to Cookbook 0.21.1 with its dedicated renderer,
  automatic branded social previews, polished navigation and search, improved
  mobile hero layout, better-scaled hero artwork, app icons, edit links, Git
  timestamps, and Markdown actions. Name the home page Overview in navigation.

- [`091f226`](https://github.com/tenphi/glaze/commit/091f226529e9e7219cfaec854de65a23633b9563) Thanks [@tenphi](https://github.com/tenphi)! - Add Umami analytics to the playground.

- [#101](https://github.com/tenphi/glaze/pull/101) [`9dfa910`](https://github.com/tenphi/glaze/commit/9dfa910244da2466267c64a3478ddf5acb92d75e) Thanks [@tenphi](https://github.com/tenphi)! - Add the playground to the documentation sidebar navigation.

## 2.0.1

### Patch Changes

- [#97](https://github.com/tenphi/glaze/pull/97) [`3366b6b`](https://github.com/tenphi/glaze/commit/3366b6b6b8646fa5bb469e10a5d5830dc8273d5a) Thanks [@tenphi](https://github.com/tenphi)! - Include `AGENTS.md` in the npm package so documentation links remain valid.

## 2.0.0

### Major Changes

- [#94](https://github.com/tenphi/glaze/pull/94) [`a50183d`](https://github.com/tenphi/glaze/commit/a50183d418de732daefc2004ad67e41014257189) Thanks [@tenphi](https://github.com/tenphi)! - **Breaking:** the `format*` writers now take `s` / `l` / `t` on the 0–1 scale the Glaze converters return.

  `formatOkhsl`, `formatOkhst`, `formatRgb`, `formatHsl`, and `formatOklch` took 0–100 percentages while `resolve()`, `variantToOkhsl`, `srgbToOkhsl`, `oklabToOkhsl`, and `okhslToSrgb` all return 0–1 — so composing a producer with a writer was off by 100x and failed silently, since `0.7` is a legal percentage and the result was a valid CSS string naming a near-black color. The library now speaks one scale end to end. (`toTone` / `fromTone` still speak the 0–100 tone axis the authoring API takes — divide by 100 before handing a tone to `formatOkhst`.)

  Drop the `* 100` at the call site (`formatOkhst(v.h, v.s, v.t)`); a leftover one now warns instead of shifting the color quietly. Every export method — `css()`, `tokens()`, `tasty()`, `json()`, `dtcg()`, `tailwind()`, `glaze.format()` — emits the same colors as before: they were compensating internally, and dropping the redundant `×100 ÷100` round-trip only moves float noise (visible nowhere except the meaningless hue term of a fully-desaturated `hsl()` string).

## 1.5.0

### Minor Changes

- [#91](https://github.com/tenphi/glaze/pull/91) [`5bf6195`](https://github.com/tenphi/glaze/commit/5bf61957360b389741b40f827555e6812a4bd743) Thanks [@tenphi](https://github.com/tenphi)! - A manual `contrastLevel` no longer suppresses high-contrast output.

  The level now does one thing: it positions the **normal** `light` / `dark`
  variants on the 0–100 slider. The high-contrast tier stays the true
  high-contrast resolution — bit-identical to what `'auto'` resolves — at every
  level, and `modes.highContrast` alone decides whether it is emitted. The two
  compose: a slider raises the baseline while a `prefers-contrast: more` block
  still escalates on top of it.

  Most visible in `css()`, which has no `modes` option and always returns four
  strings: at a mid level its `lightContrast` / `darkContrast` blocks now carry
  genuinely escalated values where they previously repeated the normal
  declarations.

  Two consequences of the corrected model:
  - `contrastLevel: 0` now reproduces `'auto'` output exactly, high-contrast tier
    included. It no longer implies "no high-contrast tier" — that is
    `modes.highContrast: false`, still the default.
  - At a global `contrastLevel: 100` the normal variants already _are_ the
    high-contrast ones, so a separate tier would duplicate them: a single
    light/dark set is emitted, even against an explicit `modes.highContrast: true`.

  Also fixes the side-stability probe leaking into the high-contrast passes, which
  made a mid-level high-contrast variant diverge from its `'auto'` counterpart.

## 1.4.0

### Minor Changes

- [#89](https://github.com/tenphi/glaze/pull/89) [`19cdde6`](https://github.com/tenphi/glaze/commit/19cdde695bf1c0cec73830380b9c0833b473a138) Thanks [@tenphi](https://github.com/tenphi)! - Add `from` on theme color definitions. A color can now be seeded from a literal
  value — the same forms `glaze.color()` accepts — instead of from the theme:

  ```ts
  theme.colors({
    surface: { tone: 100, saturation: 0.12 },
    brand: { from: '#2f5bff', base: 'surface', contrast: 3 },
  });
  ```

  Most of Glaze answers "design me a palette". This answers the other question,
  "honor this color" — white-label products, multi-tenant branding and imported
  design tokens all arrive with a value already chosen, and it is a contract
  rather than a starting point.

  `from` supplies `hue`, `tone`, and — uniquely among theme colors — an
  **absolute saturation**. That last part is what makes the feature worth having.
  Every other color's `saturation` is a 0–1 factor of the theme seed, so the seed
  is a ceiling: the only way to place a color more saturated than its theme was to
  re-seed the theme, which drags every sibling along. A palette whose accent seed
  is shared with its status themes could not honor one brand color without
  re-chromatizing `danger`, `success` and the rest as a side effect. A `from`
  color carries its own chroma and is unaffected by the seed.

  The **light, normal-contrast** variant reproduces the value exactly (a local
  `lightTone: false`, matching the value-shorthand form of `glaze.color()`). Dark
  and high contrast adapt as usual — those are the variants a reader reaches for
  when the normal one does not work for them, so readability outranks fidelity
  there, and a color pinned across all four would just be a worse
  `mode: 'static'`. A `contrast` floor still applies everywhere and is still a
  floor rather than a target: a value that already clears it is emitted untouched.

  Sibling fields override what the value supplied, so
  `{ from: '#2f5bff', hue: 300 }` keeps the saturation and tone and rotates the
  hue. A `from` color needs neither `base` nor `tone` — it is placed absolutely,
  so it stands as a root on its own.

  An unparseable `from` is rejected by `validateColorDefs` with the color's name in
  the message, rather than surfacing the parser's own error from inside the
  resolver — the string alone does not tell you which of fifty tokens carries it.

  Two smaller consequences. Under `splitHue`, a `from` color now gets its own
  `--{name}-hue` custom property in both schemes rather than referencing the
  theme's: it authors a hue that is not the theme's, so tracking the theme var
  would re-skin it on the next re-seed — the same failure mode fixed for
  `darkHue`-only colors in 1.3.1. And the value parsing / validation for
  `GlazeColorValue` moved from `color-token.ts` to a new internal `color-value.ts`
  so the resolver can reach it without an import cycle; no public export changed.

## 1.3.1

### Patch Changes

- [#87](https://github.com/tenphi/glaze/pull/87) [`b5eb888`](https://github.com/tenphi/glaze/commit/b5eb8888c36e25656cb548f526602c5e64f868f7) Thanks [@tenphi](https://github.com/tenphi)! - Fix `splitHue` exports dropping a per-color `darkHue`. A color that authored
  only `darkHue` (no light `hue`) referenced the theme's `--{name}-hue` var in
  both schemes, so the `--{color}-hue` declaration emitted in the dark block was
  never read and the dark hue was silently ignored. A color that authors a hue in
  _either_ scheme now gets its own hue custom property in both, tracking the theme
  hue in the scheme it did not author, so the shared `var()` reference stays valid
  and runtime re-skinning still works. Affects both `css({ splitHue: true })` and
  the Tasty token map.

  Also corrects the `tone: 'max'` / `'min'` with a `base` documentation: the
  high-contrast variants are not exempt from the light-shift replay. They follow
  the same rule, and because their tone window is already the full range the
  replay reproduces the plain mapping _unless_ the base itself sits asymmetrically
  across schemes — a `mode: 'fixed'` or contrast-solved base, for example. The
  behavior is unchanged; only the docs and changelog claimed otherwise.

## 1.3.0

### Minor Changes

- [#85](https://github.com/tenphi/glaze/pull/85) [`ff20d49`](https://github.com/tenphi/glaze/commit/ff20d49d645da78be11e8482cea3b407a33541a2) Thanks [@tenphi](https://github.com/tenphi)! - Add `contrastLevel` — a manual contrast level that turns the two-tier
  high-contrast model into a `0–100` slider. Set it globally via
  `glaze.configure()`, or per theme / per token / through `extend()`:

  ```ts
  glaze.configure({ contrastLevel: 60 });
  const theme = glaze(280, 80, { contrastLevel: 60 });
  glaze.color('#26fcb2', { contrastLevel: 60 });
  ```

  Level `0` reproduces the normal `light` / `dark` output and level `100` the
  `lightContrast` / `darkContrast` output, **bit for bit**. Levels in between are
  resolved at that level, not interpolated after the fact: Glaze interpolates the
  three things that make high contrast differ — authored `[normal, highContrast]`
  pairs, the tone-window widening (light `[10,100] → [0,100]`, dark
  `[15,95] → [0,100]`), and the `AA → AAA` / APCA `+15 Lc` escalation — and feeds
  those through the ordinary resolve. A contrast floor is therefore genuinely
  solved at every level (`contrast: 'AA'` at level 50 solves for 5.75), and the
  floor is met at every level.

  While a level is set there is no separate high-contrast tier: `lightContrast` /
  `darkContrast` mirror their normal counterparts, and a global level turns
  high-contrast output off outright so no exporter emits the tier.
  `modes.highContrast` goes inert rather than fighting it — it reads as "emit a
  separate high-contrast set _when_ contrast is automatic" — so a build config that
  leaves `highContrast: true` set keeps working, silently, when a user switches
  their preference from auto to manual. `css()` keeps its four-string shape with
  the high-contrast strings repeating the normal declarations, so existing
  `@media (prefers-contrast: more)` wiring keeps working untouched. A level set on
  one theme of a palette leaves its siblings' high-contrast tier alone.

  **A color never swaps sides of its base mid-slider.** `autoFlip`'s tie-break —
  when both directions meet the floor, take the one nearer the authored tone —
  depends on the target, so along a ramp it would let a color leap across its
  base. The side is now decided once from the nearer endpoint and preferred
  throughout that half of the ramp: a color whose two ends agree never changes
  side, and one whose ends genuinely disagree changes exactly once, at level 50.
  Flipping is only re-ordered, never disabled, so a side that cannot physically
  reach the target still falls back. This is exposed as a new `preferInitial`
  option on `findToneForContrast`.

  Un-interpolable tone pairs (`[50, 'max']`, `[50, '+20']`, `['max', 'min']`)
  switch at level 50 rather than blending across kinds.

  Also exports `resolveContrastForLevel(spec, level, polarity?)`.

  **A `contrast` pair may no longer switch metric.** `[4.5, { apca: 75 }]` now
  throws a validation error: a WCAG ratio and an APCA Lc are different scales, so
  no target exists between them and the two variants are incomparable even without
  a manual level. Pair values inside one metric instead — `{ wcag: [4.5, 7] }` or
  `{ apca: [60, 90] }`. Previously such a pair resolved silently.

  Nothing else changes by default: `contrastLevel` defaults to `'auto'`, which is
  today's behavior exactly, and no existing type, signature, or output shape moved.
  As a bonus, a manual resolve runs two passes instead of four.

## 1.2.0

### Minor Changes

- [#82](https://github.com/tenphi/glaze/pull/82) [`7002c2d`](https://github.com/tenphi/glaze/commit/7002c2d178b77080c0fc1a9c3aa334acca58b077) Thanks [@tenphi](https://github.com/tenphi)! - Preserve contrast for `tone: 'max'` / `'min'` on colors with a `base`. The
  extreme is no longer re-mapped through the dark tone window (which compressed
  the base-to-extreme span and lowered contrast in dark). Glaze now measures the
  tone shift the light scheme applied between the base and the extreme and
  replays it against the base's resolved dark tone — mirrored under
  `mode: 'auto'`, same-signed under `'fixed'`. The result is clamped to
  `[0, 100]` only, so it may cross the `darkTone` boundary, and pins at the
  extreme when the shift does not fit. Root extremes (no `base`), `mode: 'static'`,
  high-contrast variants, and standalone `glaze.color()` tokens are unchanged.

- [#84](https://github.com/tenphi/glaze/pull/84) [`5809f18`](https://github.com/tenphi/glaze/commit/5809f18188b6d54a6d186ed28a9c6e411598b1b9) Thanks [@tenphi](https://github.com/tenphi)! - Add `darkHue` / `darkSaturation` so a palette can seed a different hue and
  saturation for the dark schemes instead of relying on the flat
  `darkDesaturation` haircut.

  Set them on the theme seed for a whole-palette shift, or on a single color to
  retune just that token:

  ```ts
  const theme = glaze({
    hue: 280,
    saturation: 80,
    darkHue: 268, // dark schemes seed from 268
    darkSaturation: 65, // and from 65 rather than 80
  });

  theme.colors({
    accent: { tone: 55, hue: '+20', darkHue: '+35' },
    warning: { tone: 60, saturation: 0.9, darkSaturation: 0.6 },
  });
  ```

  Both apply to the `dark` and `darkContrast` variants, and both fall back to
  their light counterparts, so existing themes resolve exactly as before. Seed
  values use the same units as `hue` / `saturation` (0–360 and 0–100); a color
  def's `darkSaturation` is a 0–1 factor like its `saturation`. Relative
  `darkHue: '+N'` anchors to the theme's dark seed hue. Authoring any dark
  saturation bypasses `darkDesaturation` rather than stacking with it, and
  `mode: 'static'` ignores both. Shadows and mixes need no new fields — they
  derive their channels from the colors they reference.

  `glaze.color()` gains the same controls as `darkHue`, `darkSaturation` (0–100
  seed) and `darkSaturationFactor` (0–1), all round-tripping through
  `export()` / `glaze.colorFrom()`.

  `splitHue` exports stay correct: when a dark hue is authored, the hue custom
  properties are re-declared in the dark block and under the Tasty dark state.

## 1.1.1

### Patch Changes

- [#80](https://github.com/tenphi/glaze/pull/80) [`9d0487e`](https://github.com/tenphi/glaze/commit/9d0487ec59bebf43ee54458222a1511363e3e452) Thanks [@tenphi](https://github.com/tenphi)! - Fix relative `tone` with `autoFlip`: when mirroring an overshooting delta still leaves `[0, 100]`, keep the original direction and clamp instead of pinning to the wrong extreme.

## 1.1.0

### Minor Changes

- [#78](https://github.com/tenphi/glaze/pull/78) [`8690d87`](https://github.com/tenphi/glaze/commit/8690d87b1b42148a5ad3a3cbf5ab2ae040347e48) Thanks [@tenphi](https://github.com/tenphi)! - Add palette authoring round-trip (`palette.export()` / `glaze.paletteFrom()`), a restore triad with `glaze.themeFrom` (and `glaze.from` as alias), `kind`/`version` on all authoring exports, palette theme introspection (`theme` / `themes` / `list` / `primary`), and export type guards. Authoring `.export(override?)` freezes `getConfig() ∪ instance local ∪ override` at call time (nested color `base` exports receive the same override). Live themes and color tokens keep a sparse local override and track live `configure()` for omitted fields. Remove `pastel` from `glaze.configure()` / `GlazeConfig` — set it per-theme, per-token, or per-color instead.

## 1.0.0

### Major Changes

- [`5b6e1e5`](https://github.com/tenphi/glaze/commit/5b6e1e57d5e96a270f300b4163699c47f4713386) Thanks [@tenphi](https://github.com/tenphi)! - First stable release (1.0.0). The public API is now semver-stable.

## 0.19.0

### Minor Changes

- [#75](https://github.com/tenphi/glaze/pull/75) [`04e794f`](https://github.com/tenphi/glaze/commit/04e794ff6e9ad4577e958818b34ae293cda12dc6) Thanks [@tenphi](https://github.com/tenphi)! - Tasty exports now default to media-query state aliases (`@media(prefers-color-scheme: dark)` and `@media(prefers-contrast: more)`) instead of the custom `@dark` / `@high-contrast` aliases. Tokens now react to the OS preference out of the box without registering custom Tasty states. Override via `glaze.configure({ states })` or per-export `states` to keep the old aliases.

## 0.18.0

### Minor Changes

- [`8b6cd07`](https://github.com/tenphi/glaze/commit/8b6cd07ae500628848bcd04494d908196c9f19c0) Thanks [@tenphi](https://github.com/tenphi)! - High-contrast mode now auto-enhances a bare contrast target (no `[normal, hc]` pair at either the outer `contrast` or inner metric level). An explicit HC value via either pair always overrides.
  - **APCA**: a bare APCA scalar is boosted by the APCA-W3 "Enhanced Level" +15 Lc delta, clamped to 106 Lc.
  - **WCAG**: a bare WCAG preset is promoted to its spec-defined "Enhanced" successor (SC 1.4.3 → 1.4.6) — `AA` → `AAA` (4.5 → 7) and `AA-large` → `AAA-large` (3 → 4.5). `AAA` / `AAA-large` (top tier) and bare numeric targets are left unchanged.

  New exports: `APCA_HC_ENHANCEMENT` (`15`), `APCA_MAX_LC` (`106`); `resolveContrastForMode` gains an optional `outerExplicitHC` parameter.

## 0.17.0

### Minor Changes

- [`10c0c0a`](https://github.com/tenphi/glaze/commit/10c0c0a29c0cb51a1cedd59cfb9fe6a0e5c96e40) Thanks [@tenphi](https://github.com/tenphi)! - Rename the per-color `flip` configuration property to `autoFlip` to match the global configuration key and avoid confusion with dark-mode/scheme tone inversion.

## 0.16.2

### Patch Changes

- [`fa25eda`](https://github.com/tenphi/glaze/commit/fa25eda04b2394afbf77b31ecf61494a9371f1e2) Thanks [@tenphi](https://github.com/tenphi)! - Default export format is now `oklch` for all exporters (`tasty()`, `token()`, `css()`, and internal formatter defaults). Use `{ format: 'okhsl' }` or `{ format: 'rgb' }` to opt into other formats.

## 0.16.1

### Patch Changes

- [`f7aaa85`](https://github.com/tenphi/glaze/commit/f7aaa8580048868f1fe3d32f79049c64513e494d) Thanks [@tenphi](https://github.com/tenphi)! - Fixes the tasty() output for splitHue feature.

## 0.16.0

### Minor Changes

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add opt-in DTCG Resolver-Module export (`dtcgResolver()`)
  - **New export.** `theme.dtcgResolver()`, `palette.dtcgResolver()`, and `glaze.color().dtcgResolver()` emit a single W3C DTCG Resolver-Module document describing every scheme variant in one file — `sets` (the light tokens as the default source) plus a single `scheme` modifier with a context per variant (`light` / `dark` / `lightContrast` / `darkContrast`) and a `resolutionOrder`. An alternative to `dtcg()`'s per-scheme files for resolver tools such as Dispersa.
  - **Why one modifier.** Glaze resolves `darkContrast` independently (it is not `dark` + `lightContrast` layered), so the four-context shape keeps every resolved value exact. Two independent modifiers would compose additively and produce wrong dark + high-contrast values.
  - **Options.** `GlazeDtcgResolverOptions` extends `GlazeDtcgOptions` (`modes` + `colorSpace` pass through) with `setName` (default `'base'`), `modifierName` (default `'scheme'`), `contextNames` (rename the four contexts), and `version` (default `'2025.10'`). Standalone `glaze.color().dtcgResolver()` requires `name`.
  - New public types: `GlazeDtcgResolverDocument`, `GlazeDtcgResolverOptions`, `GlazeColorDtcgResolverOptions`, `DtcgTokenTree`, `DtcgResolverSet`, `DtcgResolverModifier`, `DtcgResolverRef`.

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add DTCG and Tailwind CSS v4 token exports
  - **`dtcg()`** — W3C [Design Tokens Format Module (2025.10)](https://www.designtokens.org/) export. Available on themes, palettes, and standalone `glaze.color()` tokens. Returns one spec-conformant token document per scheme variant (`light` / `dark` / `lightContrast` / `darkContrast``), each a `{ name: { $type: 'color', $value } }` tree consumable by Figma, Tokens Studio, Style Dictionary v4+, Terrazzo, Penpot, and every DTCG-compatible tool. The `colorSpace` option selects the `$value`representation:`'srgb'`(default — gamma sRGB`components`in 0–1 plus a`hex`hint) or`'oklch'`(Glaze-native, wide-gamut`[L, C, H]`, no hex). `alpha` is emitted only when opacity is below 1. One document per scheme is the most tool-compatible convention (one file per Style Dictionary theme / Tokens Studio set / Figma variable mode).
  - **`tailwind()`** — Tailwind CSS v4 export. Returns a single ready-to-paste CSS string: an `@theme` block (light baseline) plus dark / high-contrast overrides under configurable selectors. The `--color-*` namespace (configurable via `namespace`) auto-generates `bg-*` / `text-*` / `border-*` utilities. `darkSelector` (default `.dark`) accepts an at-rule like `'@media (prefers-color-scheme: dark)'` (nests `:root` automatically); `highContrastSelector` (default `.high-contrast`) covers the HC variants, with the combined block at `${darkSelector}${highContrastSelector}`. Default `format` is `'oklch'`.
  - **New types** exported from the package entry: `DtcgColorSpace`, `DtcgSrgbColorValue`, `DtcgOklchColorValue`, `DtcgColorValue`, `DtcgColorToken`, `DtcgDocument`, `GlazeDtcgResult`, `GlazeColorDtcgResult`, `GlazeDtcgOptions`, `GlazeTailwindOptions`, `GlazeColorTailwindOptions`.
  - **New color-math helpers** exported for advanced use: `srgbToHex(rgb)` (sRGB 0–1 → `#rrggbb`) and `okhslToOklch(h, s, l, pastel?)` (OKHSL → `[L, C, H]`), shared by `formatOklch` and the DTCG exporter.
  - Both new exports honor `modes` (dark / high-contrast gating) and the palette `prefix` / `primary` options. On `palette.tailwind()`, the palette theme-prefix `prefix` is separate from `GlazeTailwindOptions.namespace` (the `--color-*` CSS namespace).

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - feat+breaking: oklch hue channel splitting (pastel-only); add okhst tasty-only output; okhsl/okhst are tasty-only; tokens/json default to oklch
  - Add `splitHue` on `css()` / `tasty()` (theme + palette) and standalone `color.css()` — emits hue as a separate custom property referenced via `var()` in `oklch` values. Requires every exported color to be pastel.
  - Add `'okhst'` output format (`okhst(H S% T%)`) for Tasty exports.
  - `okhsl` and `okhst` throw on non-Tasty exports (`css`, `tailwind`, `tokens`, `json`).
  - `tokens()` / `json()` default format changes from `okhsl` to `oklch` (theme, palette, standalone `.json()`).

- [#69](https://github.com/tenphi/glaze/pull/69) [`86c3d27`](https://github.com/tenphi/glaze/commit/86c3d271bd08efb392b5bfd2b83962b7500cc440) Thanks [@tenphi](https://github.com/tenphi)! - Add semantic color roles with APCA polarity and APCA presets
  - **Roles.** Colors now carry a semantic `role` (`'text'` | `'surface'` | `'border'`, with aliases like `bg`/`fg`/`divider`/`outline`/`fill`/`ink`/…). The role fixes **APCA contrast polarity** — which side is the foreground vs the background — so the APCA solver uses the correct argument order instead of always treating the resolved color as text. WCAG is symmetric and unaffected.
  - **Role inference.** Roles are inferred from the color name by default (`inferRole: true`), with the last recognized token winning (`button-text` → `text`, `input-bg` → `surface`, `card-outline` → `border`). When a name doesn't infer, the opposite of the base's role is used; otherwise the color defaults to `text` (foreground), preserving previous behavior. Set `glaze.configure({ inferRole: false })` to opt out of name inference.
  - **APCA presets.** APCA targets accept named Bronze Simple Mode presets: `'preferred'` (Lc 90), `'body'` (75), `'content'` (60, ~AA), `'large'` (45, ~3:1), `'non-text'` (30), `'min'` (15). Use anywhere an APCA target is accepted, e.g. `contrast: { apca: 'content' }` or `contrast: { apca: ['content', 'body'] }`. Presets are role-independent.
  - `role` is also available on `MixColorDef` and standalone `glaze.color()` inputs and survives the `export()` / `glaze.colorFrom()` round-trip.

## 0.15.1

### Patch Changes

- [#67](https://github.com/tenphi/glaze/pull/67) [`3f70089`](https://github.com/tenphi/glaze/commit/3f700896e39aa1d931c457d5d6ca14d0135928fd) Thanks [@tenphi](https://github.com/tenphi)! - Allow `pastel` to be set per color, not just globally.

  Every color definition (`RegularColorDef`, `ShadowColorDef`, `MixColorDef`) and
  `glaze.color()` token now accepts an optional `pastel?: boolean` that overrides
  the global / per-theme `pastel` config for that color only. Omit it to keep
  inheriting the config default.

## 0.15.0

### Minor Changes

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - Add `pastel` config option, `getConfig()` to `GlazeTheme`, and export `cuspLightness`.
  - `pastel`: A new configuration option (`boolean`, default `false`) has been added to `GlazeConfig` and `FindToneForContrastOptions`. When enabled, it uses a hue-independent "safe" chroma limit across all colors so that scaling saturation never exceeds the sRGB boundary at any hue for the given lightness.
  - `getConfig()`: Added to `GlazeTheme` to allow retrieving the effective configuration (`GlazeConfigResolved`) for a theme.
  - `cuspLightness(h)`: Exported from `okhsl-color-math` to allow retrieving the OKHSL lightness of the gamut cusp for a given hue.

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - Remove the cusp-anchored saturation taper completely.

  **Breaking change**
  - `saturationTaper` has been removed from `GlazeConfig` and `GlazeConfigOverride` as well as from `glaze.configure()`. The concept of tapering/clamping saturation at lightness extremes is no longer supported, and colors are allowed to maintain their requested saturation across the entire lightness spectrum.
  - `saturationTaper` has also been removed from `FindToneForContrastOptions`.

### Patch Changes

- [#65](https://github.com/tenphi/glaze/pull/65) [`7663cb8`](https://github.com/tenphi/glaze/commit/7663cb89e071b6066c43e54e3a5bd1140bc03898) Thanks [@tenphi](https://github.com/tenphi)! - docs: update project description to use OKHST instead of OKHSL

## 0.14.0

### Minor Changes

- [#63](https://github.com/tenphi/glaze/pull/63) [`3b6e2a6`](https://github.com/tenphi/glaze/commit/3b6e2a632cc5d8f18a4f2e5580354d88d655e3d7) Thanks [@tenphi](https://github.com/tenphi)! - Replace the OKHSL lightness axis with a contrast-uniform **tone** axis (OKHST) and remove the Möbius dark-mode curve.

  **Breaking changes**
  - The `lightness` authoring prop is gone. Use `tone` (0–100, contrast-uniform) everywhere — theme colors, `glaze.color()` structured input, and relative offsets. Equal tone steps now give equal WCAG contrast, so numeric values won't map to the same OKHSL lightness as before; re-check absolute mid-range values.
  - Config windows changed: `lightLightness` / `darkLightness` → `lightTone` / `darkTone`. A window is `[lo, hi]` (reference eps — the common form), `{ lo, hi, eps }` (advanced eps tuning), or `false` to disable clamping. `false` removes the boundaries (full `[0, 100]` range) but keeps the contrast-uniform tone curve. `darkCurve` was removed.
  - `ResolvedColorVariant` now stores `{ h, s, t, alpha }` (tone) instead of `{ h, s, l }`. Use the new `variantToOkhsl()` helper to recover OKHSL lightness.
  - Export snapshots now carry `lightTone` / `darkTone` windows.
  - Relative `tone` offsets that overshoot `[0, 100]` now mirror to the other side of the base by default (the new `flip`, inheriting `autoFlip`) instead of clamping. Set `flip: false` (or `autoFlip: false`) to restore clamping.

  **New**
  - `tone: 'max'` / `'min'` forces a color to the scheme's tone extreme (lightest / darkest) with no `base` and no contrast hack; under `mode: 'auto'` they invert in dark like any tone.
  - `flip` per-color prop (default: global `autoFlip`): mirrors out-of-bounds relative `tone` overshoot and unmet `contrast` to the opposite side of the base, or clamps when `false`.
  - Tone windows accept the `[lo, hi]` array shorthand alongside `{ lo, hi, eps }` and `false`.
  - `contrast` accepts a metric selector: a bare number/preset is WCAG, `{ wcag }` / `{ apca }` picks the metric, and the `[normal, hc]` pair may live at the outer level or inside the metric (`{ wcag: [4.5, 7] }`).
  - APCA Lc contrast solving alongside WCAG, plus an APCA-based drift verification warning for chromatic swatches.
  - OKHST input: `okhst(H S% T%)` strings and `{ h, s, t }` objects (input only — never emitted).
  - `saturationTaper` config knob (default `0.15`) gently rolls off saturation toward the tone extremes.
  - New exports: `toTone`, `fromTone`, `toneFromY`, `yFromTone`, `okhstToOkhsl`, `okhslToOkhst`, `variantToOkhsl`, `REF_EPS`, `findToneForContrast`, `resolveContrastForMode`, `apcaContrast`, and the `ContrastSpec` / `OkhstColor` / `ToneWindow` / `ExtremeValue` / `ToneValue` types.

### Patch Changes

- [#63](https://github.com/tenphi/glaze/pull/63) [`3b6e2a6`](https://github.com/tenphi/glaze/commit/3b6e2a632cc5d8f18a4f2e5580354d88d655e3d7) Thanks [@tenphi](https://github.com/tenphi)! - Adjust the default tone-window floors: `lightTone` is now `[10, 100]` (was `[13, 100]`) and `darkTone` is now `[15, 95]` (was `[10, 95]`). The OKHST migration made dark schemes bottom out darker than the legacy pipeline for the same input; lifting the dark floor keeps the darkest dark-mode surfaces closer to the previous output, and lowering the light floor widens the usable light range. Override with `lightTone: [13, 100]` / `darkTone: [10, 95]` to restore the prior values.

## 0.13.0

### Minor Changes

- [#61](https://github.com/tenphi/glaze/pull/61) [`43be630`](https://github.com/tenphi/glaze/commit/43be630d2ed45ccb9a72693246fe27d6c61dcfc9) Thanks [@tenphi](https://github.com/tenphi)! - Redesign `glaze.color()` input API and add per-instance config overrides.

  **Breaking: `glaze.color()` arg layout changed**

  The old two-overload signature (`value, overrides?, scaling?` / `structured, scaling?`) is replaced by a single unified signature:

  ```ts
  glaze.color(color, config?)
  ```

  - **`color`** (arg 1): four shapes discriminated by structure:
    - Bare string → `glaze.color('#26fcb2')`
    - Value object → `glaze.color({ h: 152, s: 0.95, l: 0.74 })`
    - **New** `{ from, ...overrides }` → `glaze.color({ from: '#fff', base: bg, contrast: 'AA' })`
    - Structured → `glaze.color({ hue: 152, saturation: 95, lightness: 74 })`
  - **`config`** (arg 2, optional): `GlazeConfigOverride` — overrides resolve-relevant config fields for this token only.

  **Migration**

  ```ts
  // Before
  glaze.color('#fff', { base: bg, contrast: 'AA' });
  glaze.color('#fff', undefined, { darkLightness: false });
  glaze.color('#fff', { opacity: 0.5 }, { lightLightness: false });

  // After
  glaze.color({ from: '#fff', base: bg, contrast: 'AA' });
  glaze.color('#fff', { darkLightness: false });
  glaze.color({ from: '#fff', opacity: 0.5 }, { lightLightness: false });
  ```

  **New: per-instance config override (`GlazeConfigOverride`)**
  - Applies to both `glaze.color()` and `glaze()` themes (second arg).
  - Fields: `lightLightness`, `darkLightness`, `darkDesaturation`, `darkCurve`, `autoFlip`, `shadowTuning`.
  - `false` for a lightness window disables clamping globally (`= [0, 100]`). Now accepted everywhere: `configure()`, per-token, and per-theme.
  - Token config is snapshotted at creation. Theme config merges over the live global at resolve time (non-overridden fields still react to `configure()`).
  - `extend({ config })` inherits and merges parent + child overrides.
  - `theme.export()` / `glaze.from()` round-trip the config.

  **New: `{ from }` form for value colors with overrides**

  Pass a raw color value alongside color overrides in one object:

  ```ts
  const text = glaze.color({ from: '#1a1a2e', base: bg, contrast: 'AA' });
  ```

  **New: full-range base conversion**

  When a value/`from` color links to a `base` created via the structured form, the contrast/lightness anchor uses the raw input lightness (not the windowed output). This ensures accurate anchoring without affecting the base's own resolved output.

  **Breaking: removed `GlazeColorScaling`**

  `GlazeColorScaling` is removed and replaced by `GlazeConfigOverride`. Scaling was limited to lightness windows; the new type covers the full resolve-relevant config.

## 0.12.0

### Minor Changes

- [#60](https://github.com/tenphi/glaze/pull/60) [`5fef8c5`](https://github.com/tenphi/glaze/commit/5fef8c54c592f92f13008502a718c2f78a728045) Thanks [@tenphi](https://github.com/tenphi)! - **Breaking:** `glaze.color()` value-shorthand changes:
  - **Removed** RGB tuple `[r, g, b]` — use `{ r, g, b }` instead.
  - **Added** `RgbColor` (`{ r, g, b }`) and `OklchColor` (`{ l, c, h }`) object inputs (also accepted by `glaze.shadow()`).
  - **Unified scaling** for all value-shorthand (strings and literal objects): `lightLightness: false`, `darkLightness: globalConfig.darkLightness` (snapshotted). Strings no longer use the extended `[darkLo, 100]` dark window — the default `#000` → white dark flip is gone unless you pass explicit `scaling: { darkLightness: [lo, 100] }`.
  - Object/tuple value-shorthand no longer remap light lightness through `globalConfig.lightLightness` (structured `{ hue, saturation, lightness }` still does). Opt back in with `scaling: { lightLightness: [10, 100], ... }`.

### Patch Changes

- [#58](https://github.com/tenphi/glaze/pull/58) [`9fdb6bb`](https://github.com/tenphi/glaze/commit/9fdb6bbbed6f9aa44d3d2eade8fc0ce468655269) Thanks [@tenphi](https://github.com/tenphi)! - Respect authored lightness direction when contrast auto-flip is disabled.

## 0.11.1

### Patch Changes

- [#56](https://github.com/tenphi/glaze/pull/56) [`978bf60`](https://github.com/tenphi/glaze/commit/978bf60540c47387d2ae3f6cafdcb23bd992cbe4) Thanks [@tenphi](https://github.com/tenphi)! - Restructure documentation into focused README, API, methodology, and migration guides.

- [#56](https://github.com/tenphi/glaze/pull/56) [`978bf60`](https://github.com/tenphi/glaze/commit/978bf60540c47387d2ae3f6cafdcb23bd992cbe4) Thanks [@tenphi](https://github.com/tenphi)! - Internal refactor: split the 2636-line `src/glaze.ts` into focused, flat
  modules (`config`, `hc-pair`, `shadow`, `warnings`, `scheme-mapping`,
  `validation`, `resolver`, `formatters`, `theme`, `palette`,
  `color-token`) and dedupe a few parallel structures:
  - The resolver's four-pass loop is now a single `runPass()` + `seedField()`
    helper called four times.
  - The palette `tokens` / `tasty` / `css` exporters share a
    `buildPaletteOutput()` driver instead of duplicating the
    per-theme loop / prefix resolution / collision filtering /
    primary-duplication logic.
  - The default-config literal is no longer duplicated between module
    init and `resetConfig()`; both call a shared `defaultConfig()`.
  - `theme` exports now cache the resolve result and invalidate it on
    any def mutation or `configure()` / `resetConfig()` call (via a
    new `configVersion` counter), so back-to-back exports don't
    re-run the four-pass resolver.

  No public API or behavior changes.

## 0.11.0

### Minor Changes

- [#54](https://github.com/tenphi/glaze/pull/54) [`88be8a4`](https://github.com/tenphi/glaze/commit/88be8a4c4d816568cf2fb7b582d110c8cf3ae580) Thanks [@tenphi](https://github.com/tenphi)! - `glaze.color()` now defaults to `mode: 'auto'` across every input form, so non-string inputs adapt between light and dark like an ordinary theme color instead of being preserved verbatim with a linear dark mapping.
  - **Object value-shorthand** (`{ h, s, l }`), **RGB tuple** (`[r, g, b]`), and **structured form** (`{ hue, saturation, lightness, ... }`) now default to `mode: 'auto'` with snapshotted scaling `{ lightLightness: globalConfig.lightLightness, darkLightness: globalConfig.darkLightness }`. The dark variant is Möbius-inverted into `globalConfig.darkLightness` (default `[15, 95]`), and the light variant is mapped through `globalConfig.lightLightness` (default `[10, 100]`) — exactly the same windows a theme color uses.
  - **String value-shorthand** (hex / `rgb()` / `hsl()` / `okhsl()` / `oklch()`) is unchanged. It already defaulted to `mode: 'auto'` with `{ lightLightness: false, darkLightness: [lo, 100] }`, preserving the `#000` ↔ `#fff` flip.

  **Behavior change (minor bump):**
  - `glaze.color({ hue: H, saturation: S, lightness: 80 }).resolve()` (and the equivalent object / tuple forms) now produces a near-dark `dark.l` (e.g. ~`0.42` for `lightness: 80` under defaults) instead of staying near `0.79`.
  - `light.l` for object / tuple / structured inputs is now mapped through `globalConfig.lightLightness` rather than preserved verbatim (e.g. `lightness: 0` now resolves to `light.l ≈ 0.10` by default).
  - To restore the previous fixed-linear behavior, pass `{ mode: 'fixed' }` on the input or in the overrides. To restore the previous "preserve light lightness verbatim" behavior, pass `{ lightLightness: false }` as the trailing `scaling` argument.

  The new scaling shape is also reflected in `token.export()` snapshots — object / tuple / structured tokens now serialize `{ lightLightness: [10, 100], darkLightness: [15, 95] }` (with the live `globalConfig` values frozen at create time) instead of `{ lightLightness: false, darkLightness: [15, 95] }`. Rehydration via `glaze.colorFrom()` round-trips byte-for-byte.

## 0.10.1

### Patch Changes

- [#52](https://github.com/tenphi/glaze/pull/52) [`1988ff8`](https://github.com/tenphi/glaze/commit/1988ff8f973093844e69291590f41c46582dffa9) Thanks [@tenphi](https://github.com/tenphi)! - Fix `srgbToOkhsl` (and downstream `glaze.color()`) returning a bogus saturated hue/saturation for pure white (`#FFFFFF`) and other colors at the OKHSL lightness extremes. Floating-point residue from `linearSrgbToOklab` slipped past the existing chroma epsilon, sending the chromatic path through a degenerate gamut where saturation divides by ~zero. White now correctly resolves to `okhsl(0 0% 100%)` (light) / `okhsl(0 0% 15%)` (dark) instead of `okhsl(89.88 55.83% 100%)`.

## 0.10.0

### Minor Changes

- [#50](https://github.com/tenphi/glaze/pull/50) [`6e2d42d`](https://github.com/tenphi/glaze/commit/6e2d42dac6aa571ec02636bd029c662b2bf7fa3f) Thanks [@tenphi](https://github.com/tenphi)! - Revamp `glaze.color()` with a value-shorthand overload, seed-anchored
  contrast solving, a per-call lightness-scaling argument, and a `.css()`
  export. `glaze.shadow()` now accepts the same value forms as `glaze.color()`.

  **New defaults for `glaze.color()`** — split by input form so end-user
  string values (color picker / theme settings) get a natural light/dark
  inversion, while programmatic object / tuple / structured inputs keep
  predictable linear behavior:
  - **String value-shorthand** (hex, `rgb()`, `hsl()`, `okhsl()`,
    `oklch()`): `mode: 'auto'` with snapshotted scaling
    `{ lightLightness: false, darkLightness: [globalConfig.darkLightness[0], 100] }`.
    Light preserves the input exactly; dark Möbius-inverts up to `100`,
    so `glaze.color('#000')` renders as `#fff` in dark mode and
    `glaze.color('#fff')` falls to the dark `lo` floor (default `0.15`).
    The dark `lo` is snapshotted from `globalConfig` at color-creation
    time, matching how an explicit `scaling.darkLightness: [lo, hi]`
    behaves.
  - **Object / tuple value-shorthand** (`{ h, s, l }`, `[r, g, b]`) and
    **structured form**: `mode: 'fixed'` with light preserved and dark
    linearly mapped into `globalConfig.darkLightness` (default `[15, 95]`),
    also snapshotted at create time so later `glaze.configure()` calls
    don't retroactively change already-created tokens.
  - Override per call via the new third positional argument
    `GlazeColorScaling`: `{ lightLightness?: false | [lo, hi]; darkLightness?: false | [lo, hi] }`.
    `false` disables the remap, a tuple sets a custom window. To opt
    string inputs back into the previous fixed-linear default, pass
    `{ mode: 'fixed' }` as the second arg or supply an explicit
    `scaling`.

  **Behavior change (minor bump):**
  - String value-shorthand callers will see a Möbius-inverted dark
    variant by default — `glaze.color('#000').resolve().dark.l` is now
    `≈ 1.0`, not `0.15`. To preserve the old fixed-linear behavior pass
    `{ mode: 'fixed' }` as the second argument.
  - Structured callers without an explicit `mode` will see
    `glaze.color({...}).resolve().light.l` match the input lightness
    exactly instead of being remapped to `globalConfig.lightLightness`.
    To preserve the old behavior pass
    `{ lightLightness: globalConfig.lightLightness }` as the second
    argument.
  - The default lightness windows for object / tuple / structured
    inputs are now snapshotted from `globalConfig.darkLightness` at
    color-creation time, matching the existing behavior for string
    inputs. Tokens created before a `glaze.configure()` call no longer
    pick up the new dark window on their next `.resolve()`. To get the
    old "live config" behavior, recreate the token after `configure()`.

  **Value shorthand additions:**
  - Accepts hex (`#rgb` / `#rrggbb` / `#rrggbbaa`), the four CSS color
    functions Glaze itself emits (`rgb()`, `hsl()`, `okhsl()`, `oklch()`),
    `OkhslColor` objects (`{ h, s, l }`), and `[r, g, b]` (0–255) tuples
    as the first argument. Every string emitted by `theme.tasty() / .json() / .css()`
    round-trips back through `glaze.color()`.
  - 8-digit hex and `rgba()` / `hsla()` / slash-alpha alpha components are
    parsed and dropped with a `console.warn` (standalone colors have no
    opacity field).
  - `oklch()` chroma now correctly interprets percent values per CSS Color 4
    (`100% → 0.4`).
  - `OkhslColor` and `[r, g, b]` inputs are validated up front with helpful
    error messages — passing 0–100-scale `s`/`l` throws with a hint to use
    the structured form, and out-of-range RGB tuples throw with the offending
    value in the message.

  **Anchor model:** by default, relative `lightness: '+N'` and
  `contrast: <ratio>` are anchored to the literal seed (the value passed
  to `glaze.color()`), so the contrast solver compares against the
  unmapped user-provided color across every variant. Pass
  `overrides.base` (a `GlazeColorToken`) to anchor against another
  color's resolved variant per scheme instead.

  **Color pairing via `base`:** `GlazeColorOverrides.base` lets one
  standalone color depend on another. Accepts either a `GlazeColorToken`
  or any `GlazeColorValue` (hex / `rgb()` / `OkhslColor` / `[r, g, b]`);
  raw values are auto-wrapped via `glaze.color(value)` and inherit the
  same string-vs-object defaults. When set:
  - `contrast` is solved per scheme against the base's resolved variant
    (light / dark / lightContrast / darkContrast).
  - Relative `lightness: '+N'` / `'-N'` is anchored to the base's
    lightness per scheme (matches theme behavior for dependent colors).
  - Relative `hue: '+N'` still anchors to the seed (the value passed to
    `glaze.color()`), not the base.
  - `mode` is the per-pair knob — pass `mode: 'fixed'` to disable Möbius
    inversion for the dependent color, `mode: 'auto'` to keep it.

  The base token's `.resolve()` is called lazily on first resolve and
  the result is captured by reference, matching existing snapshot
  semantics. Internally, `resolveAllColors` accepts pre-resolved
  external bases and seeds them into the resolution context;
  `validateColorDefs` and `topoSort` treat external base names as leaves.

  **`opacity` and `name` on `glaze.color()`:**
  - `GlazeColorOverrides.opacity` (and the same field on
    `GlazeColorInput`) sets a fixed alpha 0–1 that surfaces in every
    scheme variant. Combining with `contrast` is not recommended (perceived
    lightness becomes unpredictable) — `glaze` emits a `console.warn` in
    that case.
  - `GlazeColorOverrides.name` (and the same field on `GlazeColorInput`)
    is a human-readable label that surfaces in error and warning messages
    in place of the internal `"value"` sentinel. Empty / whitespace-only
    names and reserved internal names (`"value"`, `"seed"`,
    `"externalBase"`) are rejected with a clear error.

  **Structured form parity:** the `glaze.color({...})` overload now
  accepts `opacity`, `contrast`, `base`, and `name` in addition to the
  existing `hue`, `saturation`, `lightness`, `saturationFactor`, and
  `mode`. `contrast` without `base` synthesizes a hidden static seed
  from the input's normal-mode lightness so the contrast solver always
  has an anchor (mirrors value-form behavior). `hue` (finite),
  `saturation` / `lightness` (0–100), `saturationFactor` (0–1), and
  `opacity` (0–1) are range-checked up front with helpful error
  messages — non-finite or out-of-range values fail at creation rather
  than producing a NaN-laden token.

  **Contrast warning:** when the contrast solver cannot meet the
  requested target (e.g. AAA against a mid-grey base — physically
  unreachable), `glaze` emits a single `console.warn` per
  `(name, scheme, target)` triple naming the affected color, scheme, and
  the actual achieved ratio. The token still resolves to the closest
  passing variant. Use the `name` override to make the warning easier to
  trace.

  **Persisting standalone colors:** `token.export()` returns a JSON-safe
  snapshot containing the original `value` (or structured input), the
  overrides, and the captured `scaling`. Token-typed `base` is
  recursively serialized; value-typed `base` is preserved as the raw
  value. Pass the result to `glaze.colorFrom(data)` to rehydrate a token
  that resolves byte-for-byte identically to the original — across
  `glaze.configure()` calls and across processes. The captured `scaling`
  snapshots both `lightLightness` and `darkLightness` from `globalConfig`
  at create time, so later `glaze.configure()` calls don't retroactively
  change exported tokens regardless of input form.

  **`.css({ name })` export:** new method on the standalone color token
  reaches export parity with `theme.css()`. Existing
  `.token() / .tasty() / .json()` continue to work unchanged.

  **`glaze.shadow()` upgrade:** `bg` and `fg` now accept any
  `GlazeColorValue` form — hex, `rgb()` / `hsl()` / `okhsl()` / `oklch()`
  strings, `OkhslColor` objects, or `[r, g, b]` tuples — sharing the same
  parser as `glaze.color()`.

  **Internal:** standalone color tokens now memoize the underlying resolve
  across `.resolve() / .token() / .tasty() / .json() / .css()` calls.

  **Public type additions:** `GlazeColorValue`, `GlazeColorOverrides`,
  `GlazeColorOverridesExport`, `GlazeColorCssOptions`,
  `GlazeColorScaling`, `GlazeColorTokenExport`, `GlazeColorInputExport`.
  New `glaze.colorFrom(data)` factory and `token.export()` method on
  `GlazeColorToken`. New `hslToSrgb`, `oklabToOkhsl`, and `parseHexAlpha`
  math helpers re-exported from the package root.

## 0.9.3

### Patch Changes

- [`762c204`](https://github.com/tenphi/glaze/commit/762c204123a237c2dd11f046f2e825315b9f351a) Thanks [@tenphi](https://github.com/tenphi)! - Unify contrast search overshoot to 1% in both lightness and mix solvers.

## 0.9.2

### Patch Changes

- [#46](https://github.com/tenphi/glaze/pull/46) [`85111ca`](https://github.com/tenphi/glaze/commit/85111ca53110f713d9c92090f62008cb180b13e1) Thanks [@tenphi](https://github.com/tenphi)! - Add `inherit` flag to color definitions to prevent inheritance during `extend()`

## 0.9.1

### Patch Changes

- [#44](https://github.com/tenphi/glaze/pull/44) [`50340c4`](https://github.com/tenphi/glaze/commit/50340c4cd8f91794c19a7d452b2591a4e5a37d18) Thanks [@tenphi](https://github.com/tenphi)! - `darkCurve` now accepts a `[normal, highContrast]` pair for separate HC tuning.

## 0.9.0

### Minor Changes

- [#43](https://github.com/tenphi/glaze/pull/43) [`0575838`](https://github.com/tenphi/glaze/commit/057583807a0fa2469217a29a925b1b82018e55b8) Thanks [@tenphi](https://github.com/tenphi)! - Move `primary` option from per-export to `glaze.palette()` creation, add collision detection (warn + first-write-wins) across all palette export methods.

### Patch Changes

- [#40](https://github.com/tenphi/glaze/pull/40) [`c47cfd2`](https://github.com/tenphi/glaze/commit/c47cfd2d39268e9443bfca815ddfcc836bad58cd) Thanks [@tenphi](https://github.com/tenphi)! - Unify dark/HC lightness mapping into a single code path via `lightnessWindow` helper.

- [#42](https://github.com/tenphi/glaze/pull/42) [`941338a`](https://github.com/tenphi/glaze/commit/941338ab3a75a831f2da4ce0fbeff4c1839405a9) Thanks [@tenphi](https://github.com/tenphi)! - `darkCurve` now accepts a `[normal, highContrast]` pair for separate HC tuning.

## 0.8.0

### Minor Changes

- [#37](https://github.com/tenphi/glaze/pull/37) [`8b0b62b`](https://github.com/tenphi/glaze/commit/8b0b62b35f9ae47ae5efd1607ffc6f09f03076f6) Thanks [@tenphi](https://github.com/tenphi)! - Bypass lightLightness and darkLightness window constraints in high-contrast mode, allowing colors to use the full 0–100 lightness spectrum for increased perceivable contrast.

### Patch Changes

- [#39](https://github.com/tenphi/glaze/pull/39) [`f9f6def`](https://github.com/tenphi/glaze/commit/f9f6def1f55f604c278b086c4e91de8de8374199) Thanks [@tenphi](https://github.com/tenphi)! - Add `darkCurve` config option for perceptual dark-theme lightness inversion using a power curve. Expands subtle near-white distinctions in dark mode. Default `0.5`; set to `1` for legacy linear behavior. Widen contrast solver search range to `[0, 1]` so contrast targets are met regardless of dark lightness window.

- [#39](https://github.com/tenphi/glaze/pull/39) [`f9f6def`](https://github.com/tenphi/glaze/commit/f9f6def1f55f604c278b086c4e91de8de8374199) Thanks [@tenphi](https://github.com/tenphi)! - Replace power-curve dark lightness mapping with Möbius transformation for proportional expansion of lightness deltas across all sizes.

## 0.7.0

### Minor Changes

- [#34](https://github.com/tenphi/glaze/pull/34) [`2278b4e`](https://github.com/tenphi/glaze/commit/2278b4e79e51d285c5afd83fdf5be423d28a7d75) Thanks [@tenphi](https://github.com/tenphi)! - Add `primary` option to palette exports (`tokens`, `tasty`, `css`) that duplicates one theme's tokens without prefix. Palette prefix now defaults to `true`.

### Patch Changes

- [#36](https://github.com/tenphi/glaze/pull/36) [`e9e6ef6`](https://github.com/tenphi/glaze/commit/e9e6ef6c210607da05cfb3ea763c493e225ade2c) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver undershooting WCAG targets when using OKLCH output format. Increase OKLCH hue precision to 2dp and widen solver overshoot margin.

## 0.6.3

### Patch Changes

- [`d148498`](https://github.com/tenphi/glaze/commit/d148498d820f63c759872327c554bd1746ebe520) Thanks [@tenphi](https://github.com/tenphi)! - Apply `lightLightness` mapping to dependent colors with absolute lightness, matching `darkLightness` behavior.

- [#32](https://github.com/tenphi/glaze/pull/32) [`90bd23c`](https://github.com/tenphi/glaze/commit/90bd23c578f0e8df607b3ab33af6f496fd111c53) Thanks [@tenphi](https://github.com/tenphi)! - Propagate scheme lightness range to contrast solver for dependent colors, preventing pure black/white output when contrast-solving against extreme lightness values.

## 0.6.2

### Patch Changes

- [#30](https://github.com/tenphi/glaze/pull/30) [`06be989`](https://github.com/tenphi/glaze/commit/06be98901039274446d0b4615ff76e80bea9e896) Thanks [@tenphi](https://github.com/tenphi)! - Use 1% proportional contrast overshoot to reliably meet WCAG targets after 8-bit RGB quantization.

## 0.6.1

### Patch Changes

- [#28](https://github.com/tenphi/glaze/pull/28) [`8085e0f`](https://github.com/tenphi/glaze/commit/8085e0f634acfa1e7f38ec17189115bfacc5a749) Thanks [@tenphi](https://github.com/tenphi)! - Increase contrast search overshoot to avoid floating-point rounding below WCAG threshold.

## 0.6.0

### Minor Changes

- [#25](https://github.com/tenphi/glaze/pull/25) [`7462021`](https://github.com/tenphi/glaze/commit/7462021ffa912c72aa4668d279d7ce77119a696d) Thanks [@tenphi](https://github.com/tenphi)! - Add mix color type for blending two colors with optional contrast solving
  - New `MixColorDef` with `type: 'mix'` — blend two referenced colors via `base` and `target`
  - Opaque blend: interpolates in OKHSL or sRGB space, producing a solid color
  - Transparent blend: outputs the target color with controlled opacity (alpha = value/100)
  - `space` option: `'okhsl'` (default, perceptually uniform) or `'srgb'` (matches browser compositing)
  - `contrast` option: adjusts mix ratio or opacity to meet a WCAG contrast floor against the base
  - Achromatic hue handling: when mixing with unsaturated colors (e.g. white/black), the hue is taken from the saturated color
  - `value` and `contrast` support `[normal, highContrast]` pairs
  - Mix colors can reference other mix colors (chaining) but not shadow colors

### Patch Changes

- [#27](https://github.com/tenphi/glaze/pull/27) [`175fc81`](https://github.com/tenphi/glaze/commit/175fc81f9c4e39e15a03f4c887829945ec56d1a0) Thanks [@tenphi](https://github.com/tenphi)! - Fix green-channel k4 sign error in OKHSL gamut mapping, deduplicate internal color math, add round-trip regression tests.

## 0.5.8

### Patch Changes

- [#23](https://github.com/tenphi/glaze/pull/23) [`a06a843`](https://github.com/tenphi/glaze/commit/a06a843ff10fcddd85c00fbd2da5b2dd18524b60) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver using wrong target variable for preferred lightness check, and increase decimal precision in OKHSL/HSL color formatting from 1 to 2 digits.

## 0.5.7

### Patch Changes

- [`d7f00b1`](https://github.com/tenphi/glaze/commit/d7f00b168bf3da83bf07bc3efa27352a0a8810aa) Thanks [@tenphi](https://github.com/tenphi)! - Fix contrast solver computing WCAG luminance from unclamped linear sRGB, which caused it to overestimate contrast for high-saturation colors near gamut boundaries (e.g. lime green). The solver now matches the browser rendering pipeline by gamma-encoding, clamping to sRGB gamut, then linearizing before computing luminance.

## 0.5.6

### Patch Changes

- [`5acac86`](https://github.com/tenphi/glaze/commit/5acac86b14e43c3410f9065c38a0d84b7abdd25d) Thanks [@tenphi](https://github.com/tenphi)! - Add +0.01 margin to the contrast solver's internal search target to prevent floating-point rounding from producing contrast ratios like 4.4999… that fail Lighthouse's exact WCAG AA threshold check.

## 0.5.5

### Patch Changes

- [`3b8cdbf`](https://github.com/tenphi/glaze/commit/3b8cdbf95d18eb047532e14f67ba446c4686feb9) Thanks [@tenphi](https://github.com/tenphi)! - Remove spurious warning when a color has both absolute `lightness` and `base`. This is a valid configuration — `base` is still used for minimum contrast calculation.

## 0.5.4

### Patch Changes

- [#18](https://github.com/tenphi/glaze/pull/18) [`b4f799b`](https://github.com/tenphi/glaze/commit/b4f799b578b6a2717ec6d73306d5f4eb2ff663d5) Thanks [@tenphi](https://github.com/tenphi)! - Add lightLightness configuration option for controlling lightness bounds in light schemes.

## 0.5.3

### Patch Changes

- [#16](https://github.com/tenphi/glaze/pull/16) [`f34cb5e`](https://github.com/tenphi/glaze/commit/f34cb5ead4e21b7ae5dc728e525a43a71f4c4867) Thanks [@tenphi](https://github.com/tenphi)! - Updated default `darkLightness` range from `[10, 90]` to `[15, 95]` for improved dark mode color mapping.

## 0.5.2

### Patch Changes

- [#14](https://github.com/tenphi/glaze/pull/14) [`6baff6b`](https://github.com/tenphi/glaze/commit/6baff6beeec525f4828737bba982e30b79fd2fa4) Thanks [@tenphi](https://github.com/tenphi)! - Fix relative lightness application: allow absolute lightness values when using base colors for contrast solving. Previously, colors with both `base` and absolute `lightness` were incorrectly rejected during validation and topological sorting.

## 0.5.1

### Patch Changes

- [#12](https://github.com/tenphi/glaze/pull/12) [`e869204`](https://github.com/tenphi/glaze/commit/e8692049a89139225c9b26a6e873aeb59b363200) Thanks [@tenphi](https://github.com/tenphi)! - Fix shadow intensity normalization to properly scale alpha values across different background/foreground contrast pairs. Shadow alpha now correctly reaches alphaMax (default 1.0) at intensity=100 with maximum contrast.

## 0.5.0

### Minor Changes

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Add CSS custom property export method for themes and palettes

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Add shadow color support and standalone shadow/format APIs
  - Shadow colors via `ShadowColorDef` (`type: 'shadow'`) with OKHSL-native algorithm using `tanh` alpha curve
  - `glaze.shadow()` standalone factory for one-off shadow computation
  - `glaze.format()` to format any `ResolvedColorVariant` as CSS
  - `opacity` field on `RegularColorDef` for fixed alpha on regular colors
  - `alpha` field on `ResolvedColorVariant` (default 1)
  - `shadowTuning` on `GlazeConfig` for global shadow defaults
  - `ResolvedColor.mode` is now optional (omitted for shadow colors)
  - Intensity is clamped to `[0, 100]`
  - Validation: shadow bg/fg cannot reference other shadows; regular color base cannot reference a shadow

- [#10](https://github.com/tenphi/glaze/pull/10) [`79253fc`](https://github.com/tenphi/glaze/commit/79253fcd0081a31e2c8f057ac40ea4cd7f70a077) Thanks [@tenphi](https://github.com/tenphi)! - Switch `formatRgb` and `formatHsl` from comma syntax to modern CSS space syntax

  `rgb(R, G, B)` → `rgb(R G B)` and `hsl(H, S%, L%)` → `hsl(H S% L%)`. `rgb` output now uses rounded integers instead of fractional values. This enables alpha support via the `/ alpha` separator and aligns with modern CSS (supported since Chrome 65+, Firefox 52+, Safari 12.1+).

  Downstream code that parses Glaze's CSS output using comma-separated patterns must update to space-separated syntax.

## 0.4.0

### Minor Changes

- [#8](https://github.com/tenphi/glaze/pull/8) [`eb7dec7`](https://github.com/tenphi/glaze/commit/eb7dec7648e592f27eb4be772a2b94478d25f4e0) Thanks [@tenphi](https://github.com/tenphi)! - Add explicit `tasty()` method for Tasty style-to-state bindings. `tokens()` now returns a flat variant-grouped format, while `tasty()` provides the original style-to-state binding format compatible with Tasty recipes and global styles.

## 0.3.0

### Minor Changes

- [#6](https://github.com/tenphi/glaze/pull/6) [`bb4a0d1`](https://github.com/tenphi/glaze/commit/bb4a0d144c818a3f5e2979faecd66f02f970fc25) Thanks [@tenphi](https://github.com/tenphi)! - Add CSS custom property export method for themes and palettes

## 0.2.0

### Minor Changes

- [#4](https://github.com/tenphi/glaze/pull/4) [`5cff288`](https://github.com/tenphi/glaze/commit/5cff2882d04c19a89e1ef2555139f870168000ba) Thanks [@tenphi](https://github.com/tenphi)! - Redesigned ColorDef API: unified `l`/`contrast` into `lightness` (supports absolute numbers or relative strings), renamed `ensureContrast` to `contrast`, added per-color `hue` override, and renamed `sat` to `saturation`. Removed unsigned auto-flip behavior for contrast deltas.
