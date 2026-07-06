---
'@tenphi/glaze': minor
---

Add semantic color roles with APCA polarity and APCA presets

- **Roles.** Colors now carry a semantic `role` (`'text'` | `'surface'` | `'border'`, with aliases like `bg`/`fg`/`divider`/`outline`/`fill`/`ink`/…). The role fixes **APCA contrast polarity** — which side is the foreground vs the background — so the APCA solver uses the correct argument order instead of always treating the resolved color as text. WCAG is symmetric and unaffected.
- **Role inference.** Roles are inferred from the color name by default (`inferRole: true`), with the last recognized token winning (`button-text` → `text`, `input-bg` → `surface`, `card-outline` → `border`). When a name doesn't infer, the opposite of the base's role is used; otherwise the color defaults to `text` (foreground), preserving previous behavior. Set `glaze.configure({ inferRole: false })` to opt out of name inference.
- **APCA presets.** APCA targets accept named Bronze Simple Mode presets: `'preferred'` (Lc 90), `'body'` (75), `'content'` (60, ~AA), `'large'` (45, ~3:1), `'non-text'` (30), `'min'` (15). Use anywhere an APCA target is accepted, e.g. `contrast: { apca: 'content' }` or `contrast: { apca: ['content', 'body'] }`. Presets are role-independent.
- `role` is also available on `MixColorDef` and standalone `glaze.color()` inputs and survives the `export()` / `glaze.colorFrom()` round-trip.
