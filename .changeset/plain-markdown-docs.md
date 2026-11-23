---
'@tenphi/glaze': minor
---

Ship the docs as plain Markdown for coding agents. `harness/docs/` holds every docs page as `.md`, indexed by `harness/docs/llms.txt`, which harnesspm gives agents as `glaze:docs`: each live example is now the code that produces it, followed by a table of what its colors resolve to in light, dark and both high-contrast schemes. The site's `.mdx` sources in `docs/` no longer ship, and the error for a Glaze 2 snapshot with shadows now links to the migration guide on the site.
