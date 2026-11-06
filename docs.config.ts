import { defineDocsConfig } from '@tenphi/cookbook/config';
import glazePackage from './package.json' with { type: 'json' };

export default defineDocsConfig({
  site: {
    title: 'Glaze',
    version: glazePackage.version,
    description: 'OKHST color themes with WCAG and APCA contrast solving.',
    url: 'https://glaze.tenphi.me',
    repository: 'https://github.com/tenphi/glaze',
    logo: './assets/glaze.svg',
    favicon: {
      source: './assets/glaze.svg',
      background: '#765b7e',
    },
  },
  editLink: {
    baseUrl: 'https://github.com/tenphi/glaze/edit/main/',
  },
  lastUpdated: true,
  head: [
    {
      tag: 'script',
      attrs: {
        defer: true,
        src: 'https://umami.tenphi.me/script.js',
        'data-website-id': '98bc5e59-3b06-4570-8eb7-2ee87d6e3bf6',
      },
    },
  ],
  content: {
    sources: [
      {
        id: 'home',
        file: 'docs-site/index.mdx',
        route: '/',
      },
      { id: 'docs', glob: 'docs/**/*.{md,mdx}', base: 'docs' },
    ],
  },
  navigation: {
    items: [
      '/',
      '/getting-started',
      {
        label: 'Concepts',
        items: [
          '/schemes',
          '/contrast',
          '/shadows-and-glows',
          '/mixes',
          '/okhst',
        ],
      },
      {
        label: 'Guides',
        items: ['/methodology', '/exporting', '/hdr', '/migration'],
      },
      {
        label: 'Reference',
        items: [
          '/reference',
          '/reference/theme',
          '/reference/color-definitions',
          '/reference/contrast',
          '/reference/color-tokens',
          '/reference/palette',
          '/reference/output',
          '/reference/configuration',
          '/reference/utilities',
        ],
      },
    ],
  },
  theme: {
    brand: { from: '#765b7e' },
    states: {
      /*
        High contrast as the reader chose it in the Appearance menu, or the
        system preference while that choice is Auto. Live examples use it to
        show Glaze's high-contrast variants.
      */
      '@hc': '@root(contrast=more) | (!@root(contrast) & @media(prefers-contrast: more))',
    },
    styles: {
      /*
        Example code groups carry a file-name tab (`theme.ts`); the language
        caption under it repeats what the tab already says.
      */
      CodeGroup: { Caption: { hide: true } },
      /*
        Previews here are live demos whose source is generated from a Glaze
        theme; the page shows the code that matters next to them. Each demo
        paints its own page, so the frame fills the preview edge to edge.
      */
      Preview: { Code: { hide: true }, Stage: { padding: '0' } },
      /*
        Reference headings are method signatures in code (`dtcgResolver(…)`)
        that can't wrap on a phone and would widen the page.
      */
      MarkdownHeading: { Heading: { overflowWrap: 'anywhere' } },
      Hero: {
        Visual: {
          inlineSize: {
            '': 'min(100%, 19rem)',
            '@mobile': 'clamp(7rem, 30vw, 9rem)',
          },
        },
      },
      /*
        The logo is drawn with a black outer ring, which disappears against the
        dark surface. Trace the circle in white so the silhouette survives.
      */
      SiteLogo: {
        Image: {
          radius: 'round',
          border: {
            '': false,
            '@root(theme=dark)': '1bw solid #white',
          },
        },
      },
    },
  },
});
