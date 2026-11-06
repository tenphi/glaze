# Live documentation examples

The documentation site renders real Glaze output. Every component here resolves
themes from `src/` while the site builds, so a swatch on the page is exactly
what the library produces for that definition — never a hand-copied value.

Examples **follow the reader's Appearance menu** (light / dark, normal / high
contrast) by default. Pin `scheme` to render one scheme on its own static
background, or use `SchemeGrid` to show all four side by side.

## Using them in a page

Pages that show live examples are `.mdx`. Import components with a path
relative to the page:

```mdx
import Example from '../docs-site/components/Example.astro';
import Swatches from '../docs-site/components/Swatches.tsx';

<Example
  hue={280}
  saturation={80}
  colors={{
    surface: { tone: 97 },
    text: { base: 'surface', tone: '-52', contrast: 'AA' },
  }}
/>
```

Props are plain data, so the `.mdx` source stays readable on GitHub and in the
npm package even though the components don't render there.

## Components

| Component | What it renders | Key props |
| --- | --- | --- |
| `Example.astro` | The `glaze()` source generated from its props, then a visual. | Theme props (`hue`, `saturation`, `darkHue`, `darkSaturation`, `config`, `colors`) · `visual`: `'swatches'` (default), `'ui'`, `'schemes'`, `'schemes-swatches'`, `'none'` · `after` (code appended, e.g. an export call) · `code` (replace the source) · `output="css"` (adds a tab with the generated CSS) · `show`, `on`, `scheme`, `schemes`, `roles`, `value`, `caption`, `label` |
| `Swatches.tsx` | A grid of named swatches with each color's tone (and α). Translucent colors (shadow, glow, transparent mix) are drawn over the color they composite onto. | Theme props · `show` (names, in order) · `scheme` (`'auto'` or a scheme) · `value`: `'tone'` / `'css'` / `'none'` · `on` (fill the panel behind the grid with this color) · `caption` |
| `UiPreview.tsx` | A small product card (page, card, text, link, button, card shadow). | Theme props (defaults to `UI_DEMO`) · `roles` (map `page`, `card`, `border`, `text`, `textSoft`, `link`, `accent`, `accentLabel`, `shadow` to color names) · `scheme` |
| `SchemeGrid.tsx` | One theme in all four schemes, each on its own static background. | Theme props · `kind`: `'ui'` (default) or `'swatches'` · `schemes` · `show` · `roles` · `caption` |
| `ToneRamp.tsx` | Evenly spaced steps along tone (or OKHSL lightness), joined edge to edge, with the WCAG ratio between neighbors. Static. | `hue`, `saturation` (0–100), `steps`, `axis`: `'tone'` / `'lightness'`, `contrast`, `caption` |
| `SchemeValue.tsx` | Text that differs per scheme (a measured value), shown for the active scheme. | `values` (per scheme), `scheme` |

`demo-themes.ts` exports `UI_DEMO` / `UI_COLORS` / `UI_ROLES`: the product UI
theme the previews share, so pages look consistent.

## Writing a new component

Put page-specific components in `docs-site/components/<page-slug>/`. Build
them from `primitives.tsx` and the helpers in `glaze-docs.ts`:

- `resolveDemo(theme)` → `{ theme, colors, resolved }`. `colors[name]` holds
  the CSS `rgb()` string per scheme; `resolved` holds the raw variants for
  measuring.
- `paint(colors[name], scheme)` → a Tasty value: a state map that follows the
  site for `'auto'`, one value for a pinned scheme. `follow()` and `fixed()`
  are the two halves.
- `onlyIn(scheme)` → a Tasty `hide` map that shows an element only in that
  scheme (for per-scheme captions; `SchemeValue` wraps it).
- `wcagContrast(a, b)`, `apcaLc(text, bg)`, `toneOf(v)`, `inkFor(v)`,
  `fmt(n, digits)` for measurements and labels.
- `themeSource(theme)` / `literal(value)` to print the code behind an example.

### Previews that run code

A Cookbook `Preview` is a sandboxed frame with its own HTML, CSS, and
JavaScript — the one place a page may run scripts. Build its source in a
generator that returns `PreviewSource` (`glaze-docs.ts`) and spread it into
`<Preview title="…" {...source} />`; the site hides the source disclosure.

- `shadows-and-glows/hdr-preview.ts` resolves at build time and writes the
  values into the source as literals.
- `home/theme-playground.ts` (the home page's card) and
  `okhst/ramp-explorer.ts` run Glaze in the frame. They pass `GLAZE_SCRIPT`
  as `scripts` — the browser bundle `docs-site/demo-bundle.ts` builds — and
  call the `Glaze` global. `glaze-preview.ts` holds what they share: the
  script path, `previewBaseCss()` (the frame's colors from `UI_DEMO` in light
  and dark, and its control styles), and the `GlazePreviewSource` type, whose
  `height` each generator sets to its frame's height on a desktop-width page,
  so the frame doesn't grow on load there. Each such preview inlines the whole
  bundle (about 27 KB gzipped) into its page, so keep it to one per page.

Inside the frame, plain CSS and `<style>` are fine. The frame can't see the
site's fonts, its high-contrast choice, or its links, and has no clipboard;
Chromium passes the site's light or dark appearance through
`prefers-color-scheme`.

Primitives: `Figure` (outer frame + caption; marks the subtree
`data-not-content` so prose styles stay out), `Panel`, `Grid`, `Strip`,
`Chip` (+ `ChipBlock`, `Layer`), `Eyebrow`, `Mono`.

### Rules

Cookbook ships only Tasty-generated CSS, and its build fails on anything else:

- **No `style` attributes, no `<style>` tags, no stylesheets.** Pass colors
  through a Tasty component's render-time `styles` prop.
- Only **top-level** Tasty components accept `styles`. Sub-elements created by
  `elements` don't, so give every color-carrying part its own `tasty()`
  component (see `ChipBlock`).
- Don't use the `tokens` prop: it renders inline custom properties.
- Never hard-code a color. Resolve it with Glaze in the component.
- Scheme states: `@dark` (Cookbook) and `@hc` (registered in
  `docs.config.ts`: high contrast chosen, or the system preference on Auto).
  `SCHEME_STATES` combines them per scheme.
- Site tokens for chrome around an example: `#surface`, `#surface-2`,
  `#text`, `#text-soft`, `#border`; presets `body`, `small`, `code`, `h5`;
  units `x` (spacing), `r` (radius), `bw` (border width), `$card-radius`.
