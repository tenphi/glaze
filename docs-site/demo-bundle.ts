/**
 * Builds Glaze from `src/` as one self-contained, minified browser script —
 * `public/demo/glaze.iife.js`, exposing a `Glaze` global — for the live
 * demos that run inside Cookbook `Preview` frames (see
 * `components/glaze-preview.ts`). Cookbook inlines a
 * preview's `scripts` from the public directory, and its pages may not ship
 * Glaze any other way. The file is generated (and git-ignored): built once
 * when Astro starts or builds, and again in `astro dev` whenever a library
 * source file changes.
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { build } from 'tsdown';

export default function glazeDemoBundle(): AstroIntegration {
  let root = '';
  let srcDir = '';
  let outDir = '';

  const bundle = () =>
    build({
      config: false,
      cwd: root,
      entry: { glaze: 'src/index.ts' },
      format: 'iife',
      globalName: 'Glaze',
      platform: 'browser',
      outDir,
      minify: true,
      dts: false,
      sourcemap: false,
      // One file with a fixed name: nothing stale to clean, and a build that
      // fails keeps the last good bundle in place.
      clean: false,
      logLevel: 'warn',
    });

  return {
    name: 'glaze-demo-bundle',
    hooks: {
      'astro:config:setup': async ({ config }) => {
        root = fileURLToPath(config.root);
        srcDir = fileURLToPath(new URL('src/', config.root));
        outDir = fileURLToPath(new URL('demo/', config.publicDir));
        await bundle();
      },
      'astro:server:setup': ({ server, logger }) => {
        // One build at a time, in the order the edits came in.
        let queue: Promise<unknown> = Promise.resolve();
        server.watcher.on('all', (event, file) => {
          if (event !== 'add' && event !== 'change' && event !== 'unlink') {
            return;
          }
          if (!file.startsWith(srcDir) || file.endsWith('.test.ts')) return;
          queue = queue
            .then(bundle)
            .catch((error: unknown) =>
              logger.error(`Glaze demo bundle failed: ${String(error)}`),
            );
        });
      },
    },
  };
}
