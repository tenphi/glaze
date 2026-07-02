---
'@tenphi/glaze': minor
---

Add opt-in DTCG Resolver-Module export (`dtcgResolver()`)

- **New export.** `theme.dtcgResolver()`, `palette.dtcgResolver()`, and `glaze.color().dtcgResolver()` emit a single W3C DTCG Resolver-Module document describing every scheme variant in one file — `sets` (the light tokens as the default source) plus a single `scheme` modifier with a context per variant (`light` / `dark` / `lightContrast` / `darkContrast`) and a `resolutionOrder`. An alternative to `dtcg()`'s per-scheme files for resolver tools such as Dispersa.
- **Why one modifier.** Glaze resolves `darkContrast` independently (it is not `dark` + `lightContrast` layered), so the four-context shape keeps every resolved value exact. Two independent modifiers would compose additively and produce wrong dark + high-contrast values.
- **Options.** `GlazeDtcgResolverOptions` extends `GlazeDtcgOptions` (`modes` + `colorSpace` pass through) with `setName` (default `'base'`), `modifierName` (default `'scheme'`), `contextNames` (rename the four contexts), and `version` (default `'2025.10'`). Standalone `glaze.color().dtcgResolver()` requires `name`.
- New public types: `GlazeDtcgResolverDocument`, `GlazeDtcgResolverOptions`, `GlazeColorDtcgResolverOptions`, `DtcgTokenTree`, `DtcgResolverSet`, `DtcgResolverModifier`, `DtcgResolverRef`.
