/**
 * The docs build on fixed inputs, so editing a page can't fail this spec.
 * The real pages are built by `pnpm check:harness`, which CI runs.
 */
import {
  convertMdx,
  llmsIndex,
  mdxLeft,
  outputOf,
  rewriteLinks,
  routeOf,
  splitFrontmatter,
  tidy,
} from './build-docs.mjs';

describe('paths', () => {
  it('maps a page to its output and its route', () => {
    expect(outputOf('docs/contrast.mdx')).toBe('harness/docs/contrast.md');
    expect(outputOf('docs/reference/theme.md')).toBe(
      'harness/docs/reference/theme.md',
    );
    expect(routeOf('docs/contrast.mdx')).toBe('/contrast');
    expect(routeOf('docs/reference/index.md')).toBe('/reference');
  });
});

describe('splitFrontmatter', () => {
  it('reads the fields and returns the body after them', () => {
    const { data, body } = splitFrontmatter(
      "---\ntitle: Contrast solving\ndescription: 'A floor, solved.'\n---\n\nText.\n",
    );
    expect(data).toEqual({
      title: 'Contrast solving',
      description: 'A floor, solved.',
    });
    expect(body).toBe('\nText.\n');
  });

  it('returns the whole text when there is none', () => {
    expect(splitFrontmatter('# Title\n').body).toBe('# Title\n');
  });
});

describe('tidy', () => {
  it('collapses blank lines outside code only', () => {
    expect(tidy('\n\nA\n\n\n\nB\n\n```\nx\n\n\n\ny\n```\n\n\n')).toBe(
      'A\n\nB\n\n```\nx\n\n\n\ny\n```\n',
    );
  });
});

describe('rewriteLinks', () => {
  const site = {
    pages: new Map([
      ['docs/okhst.mdx', 'harness/docs/okhst.md'],
      ['docs/reference/theme.md', 'harness/docs/reference/theme.md'],
    ]),
    routes: new Map([['/okhst', 'harness/docs/okhst.md']]),
  };
  const rewrite = (line, file = 'docs/contrast.mdx') => {
    const errors = [];
    const out = outputOf(file);
    return { line: rewriteLinks(line, { file, out, site, errors }), errors };
  };

  it('leads a page link to its .md, keeping the anchor and title', () => {
    expect(
      rewrite('[A](./okhst.mdx#tone) and [B](./reference/theme.md)').line,
    ).toBe('[A](./okhst.md#tone) and [B](./reference/theme.md)');
    expect(
      rewrite("[A](../okhst.mdx 'Tone')", 'docs/reference/theme.md').line,
    ).toBe("[A](../okhst.md 'Tone')");
  });

  it('leads a site route to its page', () => {
    expect(rewrite('[A](/okhst/#ramp)').line).toBe('[A](./okhst.md#ramp)');
  });

  it('leads another repository file to GitHub', () => {
    expect(rewrite('[A](../src/okhst.ts)').line).toBe(
      '[A](https://github.com/tenphi/glaze/blob/main/src/okhst.ts)',
    );
  });

  it('keeps anchors, external links, inline code and definitions', () => {
    expect(rewrite('[A](#x) [B](https://x.dev/) `[C](./okhst.mdx)`').line).toBe(
      '[A](#x) [B](https://x.dev/) `[C](./okhst.mdx)`',
    );
    expect(rewrite('[tone]: ./okhst.mdx#tone').line).toBe(
      '[tone]: ./okhst.md#tone',
    );
  });

  it('reports a link that leads nowhere', () => {
    expect(rewrite('[A](./missing.mdx) [B](/nowhere)').errors).toEqual([
      'docs/contrast.mdx: ./missing.mdx leads to a missing file',
      'docs/contrast.mdx: /nowhere is not a page of the site',
    ]);
  });
});

describe('mdxLeft', () => {
  it('finds MDX in prose, not in code', () => {
    expect(mdxLeft('Text.\n\n<Example hue={1} />\n')).toBe('<Example ');
    expect(mdxLeft("import X from './x';\n")).toBe('import ');
    expect(mdxLeft('`<Example />` and\n\n```tsx\n<Example />\n```\n')).toBe(
      undefined,
    );
  });
});

describe('convertMdx', () => {
  const forms = {
    Note: (_props, { children }) => `> ${children}`,
    Swatch: (props, { printed }) => {
      const block = `swatch ${props.name} at ${props.tone}`;
      if (printed.has(block)) return '';
      printed.add(block);
      return block;
    },
  };
  const convert = async (body) => {
    const errors = [];
    const markdown = await convertMdx(body, {
      file: 'docs/fixture.mdx',
      forms,
      errors,
    });
    return { markdown: tidy(markdown), errors };
  };

  it('drops imports and comments, and renders each component', async () => {
    const { markdown, errors } = await convert(
      [
        "import Note from '../docs-site/components/Note.astro';",
        "import Swatch from '../docs-site/components/Swatch.tsx';",
        '',
        'export const theme = { name: "surface", tone: 97 };',
        '',
        '{/* A comment. */}',
        '',
        'Before.',
        '',
        '<Swatch {...theme} />',
        '',
        '<Swatch name="text" tone={20 + 20} />',
        '',
        '<Swatch {...theme} />',
        '',
        '<Note>',
        '  Read **this**.',
        '</Note>',
        '',
        'After.',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(markdown).toBe(
      [
        'Before.',
        '',
        'swatch surface at 97',
        '',
        'swatch text at 40',
        '',
        '> Read **this**.',
        '',
        'After.',
        '',
      ].join('\n'),
    );
  });

  it('reports a component with no form and an expression in prose', async () => {
    const { errors } = await convert(
      [
        "import Chart from '../docs-site/components/Chart.tsx';",
        '',
        '<Chart />',
        '',
        'A {1 + 1} in prose.',
      ].join('\n'),
    );
    expect(errors).toEqual([
      'docs/fixture.mdx:5: an inline element or expression',
      'docs/fixture.mdx:3: <Chart> has no Markdown form in docs-site/components/markdown.ts',
    ]);
  });
});

describe('llmsIndex', () => {
  const page = (route, title) => ({
    file: `docs${route}.mdx`,
    out: `harness/docs${route}.md`,
    route,
    title,
    description: `About ${title}.`,
  });

  it('lists pages in the order of the navigation, by section', () => {
    const errors = [];
    const index = llmsIndex(
      ['/', '/start', { label: 'Concepts', items: ['/b', '/a'] }],
      [page('/a', 'A'), page('/b', 'B'), page('/start', 'Start')],
      errors,
    );
    expect(errors).toEqual([]);
    expect(index).toContain(
      [
        '## Start here',
        '',
        '- [Start](start.md): About Start.',
        '',
        '## Concepts',
        '',
        '- [B](b.md): About B.',
        '- [A](a.md): About A.',
      ].join('\n'),
    );
  });

  it('reports a page the navigation misses, and a route with no page', () => {
    const errors = [];
    llmsIndex(['/a', '/gone'], [page('/a', 'A'), page('/b', 'B')], errors);
    expect(errors).toEqual([
      'docs.config.ts: no page in docs/ for /gone',
      'docs/b.mdx: not in the navigation of docs.config.ts, so not in llms.txt',
    ]);
  });
});
