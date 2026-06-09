---
'@tenphi/glaze': minor
---

Redesign `glaze.color()` input API and add per-instance config overrides.

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
glaze.color('#fff', { base: bg, contrast: 'AA' })
glaze.color('#fff', undefined, { darkLightness: false })
glaze.color('#fff', { opacity: 0.5 }, { lightLightness: false })

// After
glaze.color({ from: '#fff', base: bg, contrast: 'AA' })
glaze.color('#fff', { darkLightness: false })
glaze.color({ from: '#fff', opacity: 0.5 }, { lightLightness: false })
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
const text = glaze.color({ from: '#1a1a2e', base: bg, contrast: 'AA' })
```

**New: full-range base conversion**

When a value/`from` color links to a `base` created via the structured form, the contrast/lightness anchor uses the raw input lightness (not the windowed output). This ensures accurate anchoring without affecting the base's own resolved output.

**Breaking: removed `GlazeColorScaling`**

`GlazeColorScaling` is removed and replaced by `GlazeConfigOverride`. Scaling was limited to lightness windows; the new type covers the full resolve-relevant config.
