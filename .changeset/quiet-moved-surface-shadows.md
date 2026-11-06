---
'@tenphi/glaze': patch
---

Shadows and glows no longer warn "cannot reach" when high contrast or a manual `contrastLevel` is what moved their surface out of reach. High contrast bypasses the tone windows (a white page is black in dark high contrast), and a level widens them, so the dark page nears black faster than an interpolated `intensity` fades. A page shadow with `intensity: [8, 0]` warned at every level from about 24 to 99 (level 50: "cannot reach a 4.0-tone step (reached 3.1)"), and no `[N, 0]` above about 1.6 avoided it.

In those passes (`lightContrast` / `darkContrast`, and `light` / `dark` at any level other than `0`) the step still pins to the pigment's strongest composite, but it warns only when it is out of reach in both light and dark, because then the step itself is too big for its surface. The light and dark schemes at `'auto'` or level `0` warn as before. Resolved colors and every export are unchanged. See "When Glaze moves the surface" in `docs/shadows-and-glows.mdx`.
