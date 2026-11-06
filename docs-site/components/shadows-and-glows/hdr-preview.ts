/**
 * Source for the HDR glow showcase: a Cookbook `Preview` (a sandboxed frame
 * that runs its own HTML, CSS, and JavaScript; the site hides its source
 * disclosure in `docs.config.ts`) holding a card whose edges glow.
 *
 * CSS can't paint past white in today's browsers, so the frame draws the
 * halo twice: as a CSS `box-shadow` in the glow's SDR value, and, where a
 * WebGPU canvas can show extended values on an HDR display, as a matching
 * halo in its HDR value, painted with the page behind the card. The glow is
 * resolved here, at build time, and its values are written into the source
 * as literals.
 */

import { fmt, inkMap, resolveDemo, variantOf } from '../glaze-docs';
import type { DemoTheme, PreviewSource, Scheme } from '../glaze-docs';
import { hdrToSrgb, okhslToSrgb, variantToOkhsl } from '../../../src/index.ts';
import type { GlowColorDef } from '../../../src/index.ts';

export interface HdrHaloOptions {
  /** The page the card sits on (the glow's `bg`). */
  page: string;
  /** The card fill (the glow's `fg`). */
  card: string;
  /** The glow token that colors the halo. */
  glow: string;
  /** `box-shadow` blur radius and spread, in CSS pixels. */
  blur: number;
  spread: number;
  /** The scheme to render. Default `light`. */
  scheme?: Scheme;
}

export function hdrHaloPreview(
  demo: DemoTheme,
  options: HdrHaloOptions,
): PreviewSource {
  const s = options.scheme ?? 'light';
  const { colors, resolved } = resolveDemo(demo);
  const glow = variantOf(resolved, options.glow, s);
  if (!glow.hdr) {
    throw new Error(
      `hdrHaloPreview: "${options.glow}" has no HDR value in ${s}.`,
    );
  }
  const def = demo.colors[options.glow] as GlowColorDef;
  const hdr = hdrToSrgb(glow.hdr).map((c) => fmt(c, 4));
  const pageVariant = variantOf(resolved, options.page, s);
  const { h, s: sat, l } = variantToOkhsl(pageVariant);
  const page = okhslToSrgb(h, sat, l, pageVariant.pastel ?? false).map((c) =>
    fmt(c, 4),
  );

  const html = `<div class="page">
  <canvas aria-hidden="true"></canvas>
  <div class="card">
    <strong>${options.glow}</strong>
    <span>${def.type} on ${def.bg}, intensity ${def.intensity}</span>
  </div>
</div>`;

  const css = `body { margin: 0; font: 14px/1.4 system-ui, sans-serif; }
.page {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  padding: 56px 24px;
  background: ${colors[options.page][s]};
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  visibility: hidden;
}
.card {
  display: grid;
  gap: 4px;
  width: min(100%, 240px);
  padding: 16px;
  border-radius: 12px;
  background: ${colors[options.card][s]};
  color: ${inkMap(resolved, options.card)[s]};
  /* SDR: the glow's SDR value. */
  box-shadow: 0 0 ${options.blur}px ${options.spread}px ${colors[options.glow][s]};
}
/* HDR: the canvas paints the page and the halo instead. */
.hdr canvas { visibility: visible; }
.hdr .card { box-shadow: none; }`;

  const javascript = `// ${options.glow}'s HDR value, as glaze.formatHdr() writes it:
// extended sRGB, where 1 is SDR white. The canvas's 'srgb' color space takes
// these numbers as they are.
const HDR = [${hdr.join(', ')}];
// The page under it, in sRGB.
const PAGE = [${page.join(', ')}];
const BLUR = ${options.blur}, SPREAD = ${options.spread};

const shader = \`
struct Halo { color: vec4f, page: vec4f, rect: vec4f, blur: vec4f };
@group(0) @binding(0) var<uniform> halo: Halo;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

// The normal CDF, as a logistic fit.
fn cdf(x: f32) -> f32 { return 1.0 / (1.0 + exp(clamp(-1.702 * x, -80.0, 80.0))); }

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  // A box-shadow's falloff: the card's rectangle grown by the spread and
  // blurred by a Gaussian, one axis at a time.
  let sigma = halo.blur.x;
  let lo = halo.rect.xy - halo.blur.y;
  let hi = halo.rect.xy + halo.rect.zw + halo.blur.y;
  let a = (cdf((pos.x - lo.x) / sigma) - cdf((pos.x - hi.x) / sigma))
        * (cdf((pos.y - lo.y) / sigma) - cdf((pos.y - hi.y) / sigma));
  // Over the page, as CSS composites: source-over on sRGB-encoded values.
  return vec4f(mix(halo.page.rgb, halo.color.rgb, a), 1.0);
}\`;

async function drawHalo() {
  if (!navigator.gpu || !matchMedia('(dynamic-range: high)').matches) return;
  const device = await (await navigator.gpu.requestAdapter())?.requestDevice();
  if (!device) return;

  const canvas = document.querySelector('canvas');
  const card = document.querySelector('.card');
  const context = canvas.getContext('webgpu');
  context.configure({
    device,
    format: 'rgba16float',
    toneMapping: { mode: 'extended' },
  });
  // Without HDR canvases the mode reads 'standard' or is missing (and before
  // Chrome 131 there is no getConfiguration()): keep the CSS halo.
  if (context.getConfiguration?.().toneMapping?.mode !== 'extended') {
    context.unconfigure();
    return;
  }

  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module },
    fragment: { module, targets: [{ format: 'rgba16float' }] },
  });
  const uniforms = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  });

  const draw = () => {
    const dpr = devicePixelRatio;
    const box = canvas.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    device.queue.writeBuffer(uniforms, 0, new Float32Array([
      ...HDR, 1,
      ...PAGE, 1,
      (rect.left - box.left) * dpr, (rect.top - box.top) * dpr,
      rect.width * dpr, rect.height * dpr,
      // Blur sigma (half the blur radius, as CSS uses) and spread.
      (BLUR / 2) * dpr, SPREAD * dpr, 0, 0,
    ]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: [0, 0, 0, 1],
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  new ResizeObserver(draw).observe(canvas);
  document.body.classList.add('hdr');
  // A lost GPU leaves a stale frame: hand the halo back to CSS.
  device.lost.then(() => document.body.classList.remove('hdr'));
}

drawHalo().catch(() => document.body.classList.remove('hdr'));`;

  return { html, css, javascript };
}
