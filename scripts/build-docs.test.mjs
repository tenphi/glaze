/**
 * The docs build on fixed inputs, so editing a page can't fail this spec.
 * The real pages are built by `pnpm check:harness`, which CI runs.
 */
import {
  convertMdx,
  llmsIndex,
  mdxLeft,
  outputOf,
  readingNote,
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

  it("returns the body's first line in the file", () => {
    expect(splitFrontmatter('---\ntitle: A\n---\n\nText.\n').line).toBe(4);
    expect(splitFrontmatter('# Title\n')).toEqual({
      data: {},
      body: '# Title\n',
      line: 1,
    });
  });

  it('reads CRLF, a BOM and quoted values, and rejects a block scalar', () => {
    const { data } = splitFrontmatter(
      '\uFEFF---\r\ntitle: "A \\"B\\""\r\ndescription: \'It\'\'s\'\r\n---\r\nText.',
    );
    expect(data).toEqual({ title: 'A "B"', description: "It's" });
    expect(() =>
      splitFrontmatter('---\ndescription: >-\n  Folded.\n---\n'),
    ).toThrow('"description" must be one line');
    expect(() =>
      splitFrontmatter('---\ndescription: A long\n  line.\n---\n'),
    ).toThrow('"description" must be one line');
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

  it('leads a site route to its page, and the home page to the site', () => {
    expect(rewrite('[A](/okhst/#ramp)').line).toBe('[A](./okhst.md#ramp)');
    expect(rewrite('[A](/#x)').line).toBe('[A](https://glaze.tenphi.me/#x)');
  });

  it('keeps anchors, external links, code spans and footnotes', () => {
    const line =
      '[A](#x) [B](https://x.dev/) `[C](./okhst.mdx)` ``[D](./x.md)``';
    expect(rewrite(line)).toEqual({ line, errors: [] });
    expect(rewrite('[^1]: See the spec.')).toEqual({
      line: '[^1]: See the spec.',
      errors: [],
    });
  });

  it('rewrites a reference definition, also in a blockquote', () => {
    expect(rewrite('[tone]: ./okhst.mdx#tone').line).toBe(
      '[tone]: ./okhst.md#tone',
    );
    expect(rewrite('> [tone]: ./okhst.mdx').line).toBe('> [tone]: ./okhst.md');
  });

  it('reports a link to a missing page, another file, or no route', () => {
    expect(
      rewrite(
        '[A](./missing.mdx) [B](../src/okhst.ts) [C](/nowhere) [D](./%E0.md)',
      ).errors,
    ).toEqual([
      'docs/contrast.mdx: ./missing.mdx is not a page in docs/ (link another file with a full URL)',
      'docs/contrast.mdx: ../src/okhst.ts is not a page in docs/ (link another file with a full URL)',
      'docs/contrast.mdx: /nowhere is not a page of the site',
      'docs/contrast.mdx: ./%E0.md is not a valid link',
    ]);
  });
});

describe('mdxLeft', () => {
  it('finds MDX in prose, not in code', () => {
    expect(mdxLeft('Text.\n\n<Example hue={1} />\n')).toBe('<Example ');
    expect(mdxLeft('{/* left */}\n')).toBe('{/*');
    expect(
      mdxLeft(
        '`<Example />` and\nexport the palette.\n\n```tsx\n<Example />\n```\n\n> ```tsx\n> <Example />\n> ```\n',
      ),
    ).toBe(undefined);
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
  const convert = async (body, options) => {
    const errors = [];
    const markdown = await convertMdx(body, {
      file: 'docs/fixture.mdx',
      forms,
      errors,
      ...options,
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

  it('renders components inside lists and blockquotes, keeping the prefix', async () => {
    const { markdown, errors } = await convert(
      [
        "import Note from '../docs-site/components/Note.astro';",
        "import Swatch from '../docs-site/components/Swatch.tsx';",
        '',
        '- Item:',
        '',
        '  <Note>',
        '    One.',
        '',
        '    Two.',
        '  </Note>',
        '',
        '  {/* A comment. */}',
        '',
        '> <Swatch name="quoted" tone={1} />',
        '',
        '> <Note>',
        '>   Quoted.',
        '> </Note>',
        '',
        'Text {/* inline */}more.',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(markdown).toBe(
      [
        '- Item:',
        '',
        '  > One.',
        '',
        '  Two.',
        '',
        '> swatch quoted at 1',
        '',
        '> > Quoted.',
        '',
        'Text more.',
        '',
      ].join('\n'),
    );
  });

  it("leaves a component's HTML-like elements to its form", async () => {
    const { markdown, errors } = await convert(
      [
        "import Note from '../docs-site/components/Note.astro';",
        '',
        '<Note>',
        '  <li>',
        '    A long step.',
        '  </li>',
        '</Note>',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(markdown).toBe('> <li>\n  A long step.\n</li>\n');
  });

  it('reports what has no Markdown form', async () => {
    const { errors } = await convert(
      [
        "import Chart from '../docs-site/components/Chart.tsx';",
        "import Note from '../docs-site/components/Note.astro';",
        '',
        '<Chart />',
        '',
        'A {1 + 1} in prose, and <abbr>HC</abbr>.',
        '',
        '<Note>',
        '  The hue is {280}.',
        '</Note>',
        '',
        '<Missing />',
        '',
        'Text with <Note>a note</Note> in it.',
      ].join('\n'),
      // Lines count from the file's first line, before its frontmatter.
      { firstLine: 5 },
    );
    expect(errors).toEqual([
      'docs/fixture.mdx:10: an expression',
      'docs/fixture.mdx:10: <abbr> has no Markdown form',
      'docs/fixture.mdx:13: an expression',
      'docs/fixture.mdx:18: <Note> inside a line of text (give a component lines of its own)',
      'docs/fixture.mdx:8: <Chart> has no Markdown form in docs-site/components/markdown.ts',
      'docs/fixture.mdx:16: <Missing> is not imported',
    ]);
  });

  it('places a syntax error', async () => {
    const { errors } = await convert('Text.\n\n<Missing\n', { firstLine: 5 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^docs\/fixture\.mdx:8:1: Unexpected end of file/,
    );
  });

  it('names the page when its exports fail', async () => {
    const { errors } = await convert(
      [
        "import { tone } from '../docs-site/components/missing.ts';",
        '',
        'export const theme = { tone };',
      ].join('\n'),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^docs\/fixture\.mdx: its imports, exports or props fail: /,
    );
  });
});

describe('readingNote', () => {
  it('explains table cells only on a page with tables of resolved colors', () => {
    const plain = readingNote('/hdr', 'Prose.\n\n| Option | Default |');
    expect(plain).toContain('(https://glaze.tenphi.me/hdr/)');
    expect(plain).not.toContain('`tone` is 0–100');
    expect(readingNote('/schemes', '| `text` | tone 20.0 |')).toContain(
      '`tone` is 0–100',
    );
    expect(
      readingNote('/shadows', '| `shadow` | α 0.08 · step 8.0 |'),
    ).toContain('`tone` is 0–100');
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
