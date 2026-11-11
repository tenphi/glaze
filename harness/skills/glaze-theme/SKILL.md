---
name: glaze-theme
description: Create or change a Glaze color theme or palette and check it in light, dark and high contrast. Use when adding or changing colors, tokens, a dark mode, a high-contrast mode, a status theme or a brand color with @tenphi/glaze, or when fixing a contrast problem or a Glaze warning.
---

# Creating or changing a Glaze theme

## 1. Read the docs

Open the Glaze docs index from the harnesspm block in `AGENTS.md`. Read the pages the task needs:

| Task | Page |
| --- | --- |
| A first theme, or exporting one | Getting started |
| A full palette, status themes, the checklist | Designing a palette |
| WCAG or APCA, roles, unmet floors | Contrast solving |
| Dark and high-contrast behavior, adaptation modes | Light, dark, and high contrast |
| Exact fields of a color definition | Color definitions (reference) |

## 2. Find the theme

Search the code for `glaze(`, `glaze.palette(` and `.extend(`. Change the definitions there. Never edit CSS, tokens or JSON that a Glaze exporter wrote.

## 3. Write colors in dependency order

1. **Root surfaces** get an absolute `tone` (0–100), or `'max'` / `'min'`.
2. **Dependent colors** name a `base`. Use a tone delta such as `tone: '-4'` for ladders, chips and hover states.
3. **Readable colors** (text, icons, borders that must be seen) get a `contrast` floor against their base. Use APCA for content, such as `contrast: { apca: 'content' }`. Use WCAG, such as `contrast: 'AA'` or `4.5`, when a policy asks for a WCAG ratio. Do not add floors to decorative relationships.
4. **Names carry roles.** A name that ends in `text`, `label`, `border`, `surface`, `fill` or `bg` tells Glaze which side is the foreground. Set `role` only when a name is ambiguous.
5. **Adaptation mode:** `auto` (the default) for surfaces, text and borders; `fixed` for accent fills and the label on them; `static` for a value that must not change, such as a modal scrim.
6. **High contrast** raises floors by itself (`'AA'` becomes `'AAA'`, APCA adds Lc 15). Add a `[normal, highContrast]` pair only for values that do not escalate: tones, shadow and glow intensities, mix values, bare WCAG numbers.
7. **Status themes** come from `theme.extend({ hue })`. Mark tokens that only the default theme needs with `inherit: false`.

## 4. Check it

1. Run `npx harnesspm run glaze:inspect <file>`. The file is the module that defines the theme (`#exportName` picks one export), a JSON file with a `theme.export()` or `palette.export()` snapshot, or that JSON inline.
2. It prints each color in all four schemes and each color's contrast against its base. A ✗ is a missed floor. It exits with 1 while any floor is missed.
3. Fix each ✗ and each Glaze warning. Usual fixes: move the authored tone further from the base, choose a base further away, widen the scheme's tone window, lower a target that is stricter than the design needs, or give the high-contrast side its own value with a pair.
4. Run it again until every floor is met. The high-contrast columns count: a user with "increase contrast" on sees them.
5. For two literal colors, such as a brand color on white, run `npx harnesspm run glaze:contrast <text> <background>`. APCA is not symmetric, so the text color comes first.

## 5. Export

Keep the export the application already uses: `tokens()`, `tasty()`, `css()`, `json()`, `dtcg()` or `tailwind()`, on a theme or on the palette. Which schemes are emitted is set once with `glaze.configure({ modes })`. Read "Exporting and integration" before you change an export.
