# Glaze colors

## Where colors come from

- Colors that adapt to light, dark and high contrast come from a Glaze theme or palette (`glaze(...)`, `glaze.palette(...)`). Change the theme, not the CSS or tokens exported from it.
- Do not write dark or high-contrast values by hand. Glaze derives them from the light definition.
- To create or change a theme, use the `glaze-theme` skill.

## Checking a theme

- After you change a theme, run `glaze:inspect` on the file that defines it, and fix every ✗ and every Glaze warning it prints. In a large palette, add `--color <part>`.
- To try one color, such as a brand color, before you add it, run `glaze:color <color> --base <surface> --contrast AA`.
- To check two literal colors, run `glaze:contrast <text> <background>`.
