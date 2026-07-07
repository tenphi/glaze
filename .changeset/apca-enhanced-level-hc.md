---
"@tenphi/glaze": minor
---

High-contrast mode now auto-enhances a bare contrast target (no `[normal, hc]` pair at either the outer `contrast` or inner metric level). An explicit HC value via either pair always overrides.

- **APCA**: a bare APCA scalar is boosted by the APCA-W3 "Enhanced Level" +15 Lc delta, clamped to 106 Lc.
- **WCAG**: a bare WCAG preset is promoted to its spec-defined "Enhanced" successor (SC 1.4.3 → 1.4.6) — `AA` → `AAA` (4.5 → 7) and `AA-large` → `AAA-large` (3 → 4.5). `AAA` / `AAA-large` (top tier) and bare numeric targets are left unchanged.

New exports: `APCA_HC_ENHANCEMENT` (`15`), `APCA_MAX_LC` (`106`); `resolveContrastForMode` gains an optional `outerExplicitHC` parameter.
