<p align="center">
  <img src="assets/glaze.svg" width="128" height="128" alt="Glaze logo">
</p>

<h1 align="center">Glaze</h1>

<p align="center">
  OKHSL-based color theme generator with WCAG contrast solving
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tenphi/glaze"><img src="https://img.shields.io/npm/v/@tenphi/glaze.svg" alt="npm version"></a>
  <a href="https://github.com/tenphi/glaze/actions/workflows/ci.yml"><img src="https://github.com/tenphi/glaze/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/tenphi/glaze/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@tenphi/glaze.svg" alt="license"></a>
</p>

---

Glaze generates robust **light**, **dark**, and **high-contrast** color schemes from a single hue/saturation seed. WCAG contrast is preserved via explicit dependency declarations — no hidden role math, no magic multipliers.

## Features

- **OKHST color space** — OKHSL with a contrast-uniform **tone** axis (equal tone steps give equal contrast). See [`docs/okhst.md`](docs/okhst.md).
- **WCAG 2 + APCA contrast solving** — automatic tone adjustment to meet a WCAG ratio or APCA Lc floor
- **Unified dark mode** — one tone space for light, dark, and high-contrast; dark is a single `100 − t` inversion, no fitted curve
- **Mix colors** — blend two colors with OKHSL or sRGB interpolation, opaque or transparent, with optional contrast solving
- **Shadow colors** — OKHSL-native shadow computation with automatic alpha, fg/bg tinting, and per-scheme adaptation
- **Light + Dark + High-Contrast** — all schemes from one definition
- **Per-color hue override** — absolute or relative hue shifts within a theme
- **Multi-format output** — `okhsl`, `rgb`, `hsl`, `oklch` with modern CSS space syntax
- **CSS custom properties export** — ready-to-use `--var: value;` declarations per scheme
- **Import/Export** — serialize and restore theme configurations
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

const primary = glaze(280, 80);

primary.colors({
  surface:        { tone: 97, saturation: 0.75 },
  text:           { base: 'surface', tone: '-52', contrast: 'AAA' },
  border:         { base: 'surface', tone: ['-7', '-20'], contrast: 'AA-large' },
  'accent-fill':  { tone: 52, mode: 'fixed' },
  'accent-text':  { base: 'accent-fill', tone: 'max', mode: 'fixed' },
  'shadow-md':    { type: 'shadow', bg: 'surface', fg: 'text', intensity: 10 },
});

const danger  = primary.extend({ hue: 23 });
const success = primary.extend({ hue: 157 });

const palette = glaze.palette(
  { primary, danger, success },
  { primary: 'primary' },
);

const tokens = palette.tokens();
// → { light: { 'primary-surface': 'okhsl(...)', 'surface': 'okhsl(...)', ... },
//     dark:  { 'primary-surface': 'okhsl(...)', 'surface': 'okhsl(...)', ... } }
```

## Concepts at a glance

1. **Theme = one hue/saturation seed.** Status themes are siblings created via `extend()` — they inherit every color definition and only swap the seed.
2. **Every color is explicit.** A color is either a *root* (absolute `tone`, or `'max'`/`'min'` for an extreme) or *dependent* (`base` + relative offset and/or `contrast`). No implicit roles.
3. **Tone is contrast-uniform.** `tone` (0–100) replaces OKHSL lightness: equal tone steps give equal WCAG contrast, so ramps are even by construction. See [`docs/okhst.md`](docs/okhst.md).
4. **`contrast` is a floor, not a target.** A bare number/preset is WCAG; `{ wcag }` / `{ apca }` selects the metric. The solver only shifts a color's tone when the requested position fails the requested floor.
5. **Light, dark, and high-contrast come from one definition.** `mode` (`auto` / `fixed` / `static`) picks how each color adapts; `tone` / `contrast` / `intensity` / `value` accept an optional `[normal, hc]` pair for explicit high-contrast tuning.

## Documentation

- [`docs/api.md`](docs/api.md) — full API reference (every method, every option).
- [`docs/methodology.md`](docs/methodology.md) — palette design methodology for building from scratch.
- [`docs/migration.md`](docs/migration.md) — wiring tokens into your app and migrating off a legacy color system.
- [`AGENTS.md`](AGENTS.md) — source-tree orientation for contributors.

## License

[MIT](LICENSE)
