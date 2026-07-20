<p align="center">
  <img src="assets/glaze.svg" width="128" height="128" alt="Glaze logo">
</p>

<h1 align="center">Glaze</h1>

<p align="center">
  OKHST-based color theme generator with WCAG and APCA contrast solving
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tenphi/glaze"><img src="https://img.shields.io/npm/v/@tenphi/glaze.svg" alt="npm version"></a>
  <a href="https://github.com/tenphi/glaze/actions/workflows/ci.yml"><img src="https://github.com/tenphi/glaze/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/tenphi/glaze/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@tenphi/glaze.svg" alt="license"></a>
</p>

---

Glaze generates **light**, **dark**, and **high-contrast** color schemes from a
single hue/saturation seed. Relationships stay explicit: colors either define
an absolute tone or depend on a named base through a tone delta and an optional
contrast floor.

## Features

- **OKHST color space** — OKHSL with a contrast-shaped **tone** axis. Equal
  steps give equal WCAG contrast for neutrals and a useful approximation for
  chromatic colors. See [OKHST in Glaze](docs/okhst.md) and the
  [full OKHST specification](https://github.com/tenphi/okhst).
- **WCAG 2 + APCA contrast solving** — automatic tone adjustment to meet a WCAG ratio or APCA Lc floor
- **Unified dark mode** — one tone space for light, dark, and high-contrast; dark is a single `100 − t` inversion, no fitted curve
- **Mix colors** — blend two colors with OKHSL or sRGB interpolation, opaque or transparent, with optional contrast solving
- **Shadow colors** — OKHSL-native shadow computation with automatic alpha, fg/bg tinting, and per-scheme adaptation
- **Light + Dark + High-Contrast** — all schemes from one definition
- **Per-color hue override** — absolute or relative hue shifts within a theme
- **Multi-format output** — native `rgb`, `hsl`, and `oklch`, plus
  [Tasty](https://tasty.style)-compatible `okhsl` and `okhst`
- **CSS custom properties export** — ready-to-use `--var: value;` declarations per scheme
- **W3C DTCG export** — spec-conformant `.tokens.json` (2025.10) for Figma, Tokens Studio, Style Dictionary, and every DTCG tool
- **W3C DTCG Resolver-Module export** — opt-in single-document `dtcgResolver()` (sets + a `scheme` modifier with a context per variant) for resolver tools such as Dispersa
- **Tailwind CSS v4 export** — `@theme` block + dark / high-contrast overrides
- **Import/Export** — serialize and restore themes, color tokens, and entire palettes as JSON
- **Create from hex/RGB** — start from an existing brand color
- **Zero dependencies** — pure math, runs anywhere (Node.js, browser, edge)
- **Tree-shakeable ESM + CJS** — dual-format package
- **TypeScript-first** — full type definitions included

## Installation

```bash
pnpm add @tenphi/glaze
```

```bash
npm install @tenphi/glaze
```

```bash
yarn add @tenphi/glaze
```

## Quick Start

```ts
import { glaze } from '@tenphi/glaze';

glaze.configure({
  modes: { dark: true, highContrast: true },
});

const defaultTheme = glaze(280, 80);

defaultTheme.colors({
  surface: { tone: 97, saturation: 0.15 },
  'surface-text': {
    base: 'surface',
    tone: '-1',
    contrast: { apca: ['content', 'body'] },
  },
  border: {
    base: 'surface',
    tone: ['-8', '-16'],
    inherit: false,
  },
  'accent-surface': { tone: 52, mode: 'fixed' },
  'accent-surface-text': {
    base: 'accent-surface',
    tone: '+1',
    contrast: 'AA',
    mode: 'fixed',
  },
});

const dangerTheme = defaultTheme.extend({ hue: 23 });
const palette = glaze.palette({ default: defaultTheme, danger: dangerTheme });

const tokens = palette.tokens({
  prefix: { default: '', danger: 'danger-' },
});
// → {
//   light: { surface: 'oklch(...)', 'danger-surface': 'oklch(...)', ... },
//   dark: { surface: 'oklch(...)', 'danger-surface': 'oklch(...)', ... },
//   lightContrast: { ... },
//   darkContrast: { ... },
// }
```

## Concepts at a glance

1. **A theme has one hue/saturation seed.** Create status themes with
   `extend()` so they inherit the same relationships while changing hue.
2. **A color is a root or a dependency.** Roots use an absolute `tone` or
   `'max'`/`'min'`. Dependent colors name a `base` and may use a signed
   **tone delta** such as `'-8'` plus a `contrast` floor.
3. **Tone is an authoring axis, not a contrast guarantee.** Equal tone deltas
   are exact WCAG steps for neutrals. Chromatic colors can drift in rendered
   luminance, so Glaze measures contrast floors against the resolved colors.
4. **`contrast` is a floor.** A bare number or preset means WCAG;
   `{ wcag }` and `{ apca }` select the metric explicitly. The solver preserves
   the requested tone whenever it already passes.
5. **Each color chooses its dark adaptation.** `mode: 'auto'` uses dark tone
   inversion (`100 - t`), `fixed` keeps the authored side of the tone scale,
   and `static` skips scheme adaptation.
6. **Tone windows bound ordinary schemes.** `lightTone` and `darkTone`
   configure the light/dark render ranges. High-contrast variants use the full
   range. Values that accept `[normal, highContrast]` pairs can tighten
   deliberately in HC.

In Glaze, a **scheme variant** is one of `light`, `dark`, `lightContrast`, or
`darkContrast`. Export `modes` choose which variants are included; [Tasty](https://tasty.style)
`states` choose how those variants are activated in an application.

## Choosing an output

- `tasty()` returns [Tasty](https://tasty.style) `#token` bindings, including its custom `okhsl()` or
  `okhst()` serialization.
- `tokens()` and `json()` return JavaScript data and default to native
  `oklch()` values.
- `css()` returns custom-property declarations.
- `dtcg()` / `dtcgResolver()` target design-token tooling.
- `tailwind()` emits a Tailwind CSS v4 theme.

## Documentation

- Start with [the methodology](docs/methodology.md) to design a palette.
- Use [migration and integration](docs/migration.md) to wire it into an
  application or replace an existing color system.
- Keep the [API reference](docs/api.md) nearby for every method and option.
- Read [OKHST in Glaze](docs/okhst.md) for the product-level color model, or
  the [full OKHST specification](https://github.com/tenphi/okhst) for its math.
- [`AGENTS.md`](AGENTS.md) — source-tree orientation for contributors.

## License

[MIT](LICENSE)
