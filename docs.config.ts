import { defineDocsConfig } from '@tenphi/cookbook/config';
import glazePackage from './package.json' with { type: 'json' };

export default defineDocsConfig({
  site: {
    title: 'Glaze',
    version: glazePackage.version,
    description: 'OKHST color themes with WCAG and APCA contrast solving.',
    url: 'https://glaze.tenphi.me',
    repository: 'https://github.com/tenphi/glaze',
    favicon: {
      source: './assets/glaze.svg',
      background: '#765b7e',
    },
    headerLinks: [
      {
        label: 'Playground',
        link: 'https://glaze.tenphi.me/playground/',
        variant: 'primary',
      },
    ],
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
        file: 'docs-site/index.md',
        route: '/',
      },
      { id: 'docs', glob: 'docs/**/*.{md,mdx}', base: 'docs' },
    ],
  },
  navigation: {
    items: [
      '/',
      {
        label: 'Guides',
        items: ['/methodology', '/migration', '/okhst'],
      },
      { label: 'Reference', items: ['/api'] },
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
