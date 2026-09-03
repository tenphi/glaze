import { defineConfig } from 'astro/config';
import cookbook from '@tenphi/cookbook';
import docs from './docs.config.js';

export default defineConfig({
  site: 'https://glaze.tenphi.me',
  output: 'static',
  integrations: [cookbook({ config: docs })],
});
