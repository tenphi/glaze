---
'@tenphi/glaze': patch
---

Fix the docs dev server failing to start. `@astrojs/react` sets
`resolve.dedupe: ["react", "react-dom"]`, which makes Vite resolve those
packages from the project root, where pnpm had not linked them. Declaring
them as devDependencies restores `pnpm docs`.
