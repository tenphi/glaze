import { defineConfig } from 'astro/config';
import cookbook from '@tenphi/cookbook';

export default defineConfig({
  site: 'https://glaze.tenphi.me',
  output: 'static',
  integrations: [cookbook()],
});
