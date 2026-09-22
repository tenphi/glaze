---
title: Glaze
description: Generate accessible light, dark, and high-contrast color themes from one seed.
template: splash
hero:
  title: Accessible color systems from one seed.
  tagline: Generate light, dark, and high-contrast themes with OKHST, WCAG, and APCA—then export them for applications, design tools, and the web.
  image:
    file: ../assets/glaze.svg
  actions:
    - text: Open the playground
      link: https://glaze.tenphi.me/playground/
      variant: primary
    - text: Design a palette
      link: /methodology
      variant: secondary
---

## Color relationships, not color tables

Glaze turns a hue and saturation seed into a complete palette. Define how each
role relates to the others, and Glaze resolves the actual colors for every
supported appearance.

### Contrast-aware by construction

Set WCAG ratios or APCA Lc floors on the roles that need them. Glaze adjusts
tone only when necessary and reports targets that cannot be met.

### Four schemes from one definition

Light, dark, light high-contrast, and dark high-contrast variants share one
model. Dark mode is an adaptation of the same relationships rather than a
second hand-maintained palette.

### Ready for applications and design tools

Export CSS custom properties, Tailwind CSS v4 themes, W3C DTCG tokens, JSON, or
[Tasty](https://tasty.style) bindings. Glaze is zero-dependency, TypeScript-first,
and runs in Node.js, browsers, and edge runtimes.

## Start with a seed

```ts
import { glaze } from '@tenphi/glaze';

const theme = glaze(280, 80);

theme.colors({
  surface: { tone: 97 },
  text: { base: 'surface', tone: '-1', contrast: 'AA' },
  accent: { tone: 52, mode: 'fixed' },
});

const tokens = theme.tokens();
```

Continue with the [palette methodology](/methodology), browse the complete
[API reference](/api), or learn how Glaze's [OKHST tone axis](/okhst) works.
