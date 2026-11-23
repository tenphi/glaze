---
'@tenphi/glaze': minor
---

Ship the docs as plain Markdown for coding agents. `harness/docs/` holds every docs page as `.md`, indexed by `harness/docs/llms.txt`, which harnesspm gives agents as `glaze:docs`. The site's live examples become the code that produces them, with tables of what they resolve to in light, dark and both high-contrast schemes; each figure keeps its caption. `docs/` no longer ships: its pages move from `docs/*.mdx` and `docs/*.md` to `harness/docs/*.md`. The shipped type comments and the error for a Glaze 2 snapshot with shadows now link to the docs site.
