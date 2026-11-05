---
'@tenphi/glaze': patch
---

Fixes found in the final 3.0 review:

- `glaze.isThemeExport` / `isColorTokenExport` / `isPaletteExport` are typed as type guards in the published declarations. They came out as `any` (the bundler wrote a self-referencing `typeof`), so they didn't narrow, and a project with `skipLibCheck: false` got compile errors from the package.
- An APCA target above 106 keeps its value in high contrast: the HC boost used to cap it at 106, below the normal tier's own target.
- `splitHue` keeps a `mode: 'static'` color at its one hue in dark when it has a `darkHue`, as the resolver and every other export do: it uses the color's light hue reference in both schemes. It used to declare the color's hue var at the `darkHue` in dark.
- `token.export()` returns a detached snapshot, and a token copies its input, so editing either afterwards no longer changes the other. The copy reads every field by property access, so an input, value object, or `contrast` with getters, or a reactive proxy, works. A raw-value `base` is exported as the snapshot of the token it is wrapped in, so `glaze.colorFrom()` pins its config too instead of letting it follow later `glaze.configure()` calls.
- The alpha-dropped warning prints once per color string (a theme color's `from` printed it about ten times per resolve), and its hint now applies to theme colors too.
- `glaze(hue, config)` applies the config in plain JavaScript instead of dropping it (a third-argument config still wins); the typed forms are unchanged.
- `glaze.shadow()` / `glaze.glow()` throw a clear error for a missing `bg` or a non-finite `intensity`, and read a `bg` / `fg` past white or black as white or black, as the browser composites it (the parser clamps it).
