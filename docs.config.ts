import { defineDocsConfig } from '@tenphi/cookbook';
import glazePackage from './package.json' with { type: 'json' };

export default defineDocsConfig({
  site: {
    title: 'Glaze',
    version: glazePackage.version,
    description: 'OKHST color themes with WCAG and APCA contrast solving.',
    url: 'https://glaze.tenphi.me',
    repository: 'https://github.com/tenphi/glaze',
  },
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
        file: 'README.md',
        route: '/',
        title: 'Glaze',
        description: 'OKHST color themes with WCAG and APCA contrast solving.',
      },
      { glob: 'docs/**/*.{md,mdx}', base: 'docs' },
    ],
  },
  navigation: {
    tabs: [
      {
        label: 'Documentation',
        link: '/',
        items: [
          '/',
          {
            label: 'Guides',
            items: ['/methodology', '/migration', '/okhst'],
          },
          { label: 'Reference', items: ['/api'] },
          {
            label: 'Playground',
            link: 'https://glaze.tenphi.me/playground/',
          },
        ],
      },
      {
        label: 'Playground',
        link: 'https://glaze.tenphi.me/playground/',
      },
    ],
  },
  theme: {
    brand: { from: '#765b7e' },
    styles: {
      Logo: { display: 'none' },
    },
  },
  components: {
    overrides: {
      SiteTitle: './docs-site/SiteTitle.astro',
    },
  },
});
