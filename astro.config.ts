import { defineConfig } from 'astro/config';
import cookbook from '@tenphi/cookbook';
import glazeDemoBundle from './docs-site/demo-bundle';

export default defineConfig({
  site: 'https://glaze.tenphi.me',
  output: 'static',
  // The demo bundle comes first, so previews can inline it.
  integrations: [glazeDemoBundle(), cookbook()],
  // The standalone tone playground was retired; its ramps live on the OKHST
  // page.
  redirects: { '/playground': '/okhst/#ramp-explorer' },
});
