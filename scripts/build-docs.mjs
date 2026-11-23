/**
 * Builds the docs the package ships, at `prepack`: every page in `docs/`
 * becomes plain Markdown in `harness/docs/`, and `harness/docs/llms.txt`
 * indexes them in the order of the site's navigation (`docs.config.ts`). The
 * harness names that folder as Glaze's docs (`harness/plugin.json`), so
 * harnesspm gives consumers' agents the index as `glaze:docs`. `--clean`, at
 * `postpack`, removes the folder.
 *
 *   docs/{name}.mdx | docs/{name}.md  ->  harness/docs/{name}.md
 *
 * The pages are written for the site. A page's frontmatter becomes its `#`
 * title and first paragraph. An `.mdx` page loses its imports and exports,
 * and each component becomes the Markdown that
 * `docs-site/components/markdown.ts` gives it: an example prints the code the
 * site prints, with a table of the colors it resolves, and a figure keeps its
 * caption. Its props are evaluated with the page's own exports, so the
 * values are the ones the site renders. A link to a page leads to its `.md`;
 * a link to another file in the repository becomes a GitHub link.
 *
 * The build fails, so none of these ship: a component with no Markdown form;
 * an expression or element inside prose; a link that leads nowhere; MDX left
 * in a page; a page without a title, or missing from the site's navigation
 * (so missing from the index).
 *
 * It runs the site's TypeScript helpers with Node's type stripping, so it
 * needs Node 22.18+.
 *
 * Usage: node scripts/build-docs.mjs [--clean]
 */
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROOT_URL = pathToFileURL(`${ROOT}/`).href;
const SOURCE = 'docs';
const OUT = 'harness/docs';
const SITE = 'https://glaze.tenphi.me';
const GITHUB = 'https://github.com/tenphi/glaze/blob/main/';

const posix = path.posix;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

/** Every page of the site's docs, as POSIX paths from the repository root. */
export function listPages() {
  return fs
    .readdirSync(path.join(ROOT, SOURCE), { recursive: true })
    .map((file) => posix.join(SOURCE, file.split(path.sep).join('/')))
    .filter((file) => /\.mdx?$/.test(file))
    .sort();
}

/** Where the page made from `file` goes. */
export function outputOf(file) {
  return posix.join(
    OUT,
    posix.relative(SOURCE, file).replace(/\.mdx?$/, '.md'),
  );
}

/** The site's route for `file`: `docs/reference/index.md` → `/reference`. */
export function routeOf(file) {
  const route = posix
    .relative(SOURCE, file)
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '');
  return `/${route}`;
}

/** A page's frontmatter fields (`key: value` lines) and the body after it. */
export function splitFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split('\n')) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (field) data[field[1]] = field[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: text.slice(match[0].length) };
}

/**
 * Whether each line is code: a fence or a line inside one. A fence closes only
 * with the same character, at least as long (CommonMark).
 */
function fenced(lines) {
  let fence;
  return lines.map((line) => {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        marker[2].trim() === ''
      ) {
        fence = undefined;
      }
      return true;
    }
    if (marker) fence = marker[1];
    return Boolean(marker);
  });
}

/** Replaces each line outside code fences with what `fn` returns for it. */
function mapProse(text, fn) {
  const lines = text.split('\n');
  const code = fenced(lines);
  return lines.flatMap((line, i) => (code[i] ? [line] : fn(line))).join('\n');
}

/** No run of blank lines outside code, no blank lines at the ends. */
export function tidy(markdown) {
  const lines = markdown.split('\n');
  const code = fenced(lines);
  const kept = lines.filter(
    (line, i) =>
      code[i] || line.trim() !== '' || (i > 0 && lines[i - 1].trim() !== ''),
  );
  return `${kept.join('\n').trim()}\n`;
}

/** Removes the indentation every non-blank line of `text` shares. */
function dedent(text) {
  const lines = text.split('\n');
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim() !== '')
      .map((line) => /^ */.exec(line)[0].length),
  );
  return lines.map((line) => line.slice(indent)).join('\n');
}

const relative = (from, to) => {
  const link = posix.relative(posix.dirname(from), to);
  return link.startsWith('.') ? link : `./${link}`;
};

/**
 * Rewrites the link targets on one line of the page made from `file` into
 * `out`. `site.pages` maps each page's source to its output and `site.routes`
 * each route to its output; problems go to `errors`.
 */
export function rewriteLinks(line, { file, out, site, errors }) {
  const target = (url, hash) => {
    if (url === '' || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url + hash;
    if (url.startsWith('/')) {
      const page = site.routes.get(url.replace(/(.)\/$/, '$1'));
      if (page) return relative(out, page) + hash;
      errors.push(`${file}: ${url} is not a page of the site`);
      return url + hash;
    }
    const repoPath = posix.join(posix.dirname(file), decodeURI(url));
    const page = site.pages.get(repoPath);
    if (page) return relative(out, page) + hash;
    if (repoPath.startsWith('..') || !exists(repoPath)) {
      errors.push(`${file}: ${url} leads to a missing file`);
      return url + hash;
    }
    return `${GITHUB}${repoPath}${hash}`;
  };

  // A reference definition: `[label]: url`.
  const definition = /^(\s*\[[^\]]+\]:\s*)([^\s#]*)(#\S*)?(.*)$/.exec(line);
  if (definition) {
    const [, head, url, hash = '', rest] = definition;
    return `${head}${target(url, hash)}${rest}`;
  }

  // Inline code keeps its text: only the parts outside backticks are links. A
  // link may have a title, `[text](url 'title')`.
  return line
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /\]\(([^)\s#]*)(#[^)\s]*)?(\s+(?:"[^"]*"|'[^']*'))?\)/g,
            (_, url, hash = '', title = '') =>
              `](${target(url, hash)}${title})`,
          ),
    )
    .join('');
}

/** MDX left in a built page's prose, if any. */
export function mdxLeft(markdown) {
  let found;
  mapProse(markdown, (line) => {
    const prose = line.split(/`[^`]*`/).join('');
    found ??=
      /^\s*(import|export)\s/.exec(prose)?.[0] ??
      /<\/?[A-Z][\w.]*(\s|\/?>|$)/.exec(prose)?.[0] ??
      /\{\/\*/.exec(prose)?.[0];
    return [line];
  });
  return found;
}

const isComment = (expression) =>
  /^\s*\/\*[\s\S]*\*\/\s*$/.test(expression ?? '');

/** The props object literal a JSX element passes, as source. */
function propsSource(element) {
  const entries = element.attributes.map((attribute) => {
    if (attribute.type === 'mdxJsxExpressionAttribute') return attribute.value;
    const { name, value } = attribute;
    const source =
      value === null || value === undefined
        ? 'true'
        : typeof value === 'string'
          ? JSON.stringify(value)
          : `(${value.value})`;
    return `${JSON.stringify(name)}: ${source}`;
  });
  return `{ ${entries.join(', ')} }`;
}

/**
 * Evaluates each element's props as the page would: a module with the page's
 * exports and the imports they use (components dropped, paths made absolute),
 * then one function per element. Returns those functions, in order.
 */
async function evaluateProps(body, file, esm, elements) {
  const statements = [];
  for (const node of esm) {
    for (const statement of node.data.estree.body) {
      const text = body.slice(statement.start, statement.end);
      if (statement.type !== 'ImportDeclaration') {
        statements.push(text);
        continue;
      }
      const from = statement.source.value;

      // Components: the site renders them, Node can't load them.
      if (/\.(astro|tsx|jsx)$/.test(from) || from.endsWith('/components')) {
        continue;
      }
      const url = from.startsWith('.')
        ? pathToFileURL(path.resolve(ROOT, posix.dirname(file), from)).href
        : import.meta.resolve(from);
      const { start, end } = statement.source;
      statements.push(
        `${text.slice(0, start - statement.start)}${JSON.stringify(url)}${text.slice(end - statement.start)}`,
      );
    }
  }
  statements.push(
    `export const props = [\n${elements
      .map((element) => `() => (${propsSource(element)})`)
      .join(',\n')}\n];`,
  );
  const module = await import(
    `data:text/javascript,${encodeURIComponent(statements.join('\n'))}`
  );
  return module.props;
}

/** The component name each JSX name in a page's imports stands for. */
function componentsOf(esm) {
  const names = new Map();
  for (const node of esm) {
    for (const statement of node.data.estree.body) {
      if (statement.type !== 'ImportDeclaration') continue;
      const from = statement.source.value;
      for (const specifier of statement.specifiers) {
        const component =
          specifier.type === 'ImportDefaultSpecifier'
            ? posix.basename(from).replace(/\.\w+$/, '')
            : specifier.imported?.name;
        names.set(specifier.local.name, component);
      }
    }
  }
  return names;
}

const startOf = (node) => node.position.start.offset;
const endOf = (node) => node.position.end.offset;

/**
 * MDX → Markdown for the body of an `.mdx` page: imports and exports go,
 * comments go, and each component becomes what `forms` renders for it.
 * Problems go to `errors`.
 */
export async function convertMdx(body, { file, forms, errors }) {
  const { createProcessor } = await import('@mdx-js/mdx');
  const tree = createProcessor().parse(body);
  const esm = tree.children.filter((node) => node.type === 'mdxjsEsm');
  const elements = [];
  const line = (node) => `${file}:${node.position.start.line}`;

  // Elements in document order; MDX inside prose is an error unless a
  // component's own children hold it (`<li>` in `<Steps>`).
  const visit = (node, inComponent) => {
    for (const child of node.children ?? []) {
      if (child.type === 'mdxJsxFlowElement') {
        elements.push(child);
        visit(child, true);
      } else if (
        !inComponent &&
        (child.type === 'mdxJsxTextElement' ||
          child.type === 'mdxTextExpression')
      ) {
        errors.push(`${line(child)}: an inline element or expression`);
      } else if (
        child.type === 'mdxFlowExpression' &&
        !isComment(child.value)
      ) {
        errors.push(`${line(child)}: an expression`);
      } else {
        visit(child, inComponent);
      }
    }
  };
  visit(tree, false);
  const components = componentsOf(esm);
  const thunks = await evaluateProps(body, file, esm, elements);
  const printed = new Set();

  // The source of `nodes` between `from` and `to`, each MDX node replaced.
  const convert = (nodes, from, to) => {
    let out = '';
    let at = from;
    for (const node of nodes) {
      if (!/^mdx/.test(node.type)) continue;
      out += body.slice(at, startOf(node));
      out += render(node);
      at = endOf(node);
    }
    return out + body.slice(at, to);
  };
  const render = (node) => {
    if (node.type !== 'mdxJsxFlowElement') return '';
    const component = components.get(node.name);
    const form = forms[component];
    if (!form) {
      errors.push(
        component
          ? `${line(node)}: <${node.name}> has no Markdown form in docs-site/components/markdown.ts`
          : `${line(node)}: <${node.name}> is not imported`,
      );
      return '';
    }
    let children = '';
    if (node.children.length > 0) {
      const first = node.children[0];
      const lineStart = body.lastIndexOf('\n', startOf(first) - 1) + 1;
      children = dedent(
        convert(node.children, lineStart, endOf(node.children.at(-1))),
      ).trim();
    }
    try {
      const props = thunks[elements.indexOf(node)]();
      const markdown = form(props, { children, printed });
      const indent = ' '.repeat(node.position.start.column - 1);
      return markdown.split('\n').join(`\n${indent}`);
    } catch (error) {
      errors.push(`${line(node)}: <${node.name}>: ${error.message}`);
      return '';
    }
  };
  return convert(tree.children, 0, body.length);
}

/** `harness/docs/llms.txt`: the pages in the order of the site's navigation. */
export function llmsIndex(navigation, pages, errors) {
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const listed = new Set();
  const sections = [];
  let start;
  const entries = (routes) =>
    routes.flatMap((route) => {
      const page = byRoute.get(route);

      // `/` is the site's home page, which is not in `docs/`.
      if (route === '/' && !page) return [];
      if (!page) {
        errors.push(`docs.config.ts: no page in ${SOURCE}/ for ${route}`);
        return [];
      }
      listed.add(route);
      return [
        `- [${page.title}](${posix.relative(OUT, page.out)})${page.description ? `: ${page.description}` : ''}`,
      ];
    });
  for (const item of navigation) {
    if (typeof item === 'string') {
      if (!start) sections.push((start = { label: 'Start here', routes: [] }));
      start.routes.push(item);
    } else {
      sections.push({ label: item.label, routes: item.items });
    }
  }
  const body = sections.flatMap(({ label, routes }) => {
    const list = entries(routes);
    return list.length > 0 ? [`## ${label}`, '', ...list, ''] : [];
  });
  for (const page of pages) {
    if (!listed.has(page.route)) {
      errors.push(
        `${page.file}: not in the navigation of docs.config.ts, so not in llms.txt`,
      );
    }
  }
  return [
    '# Glaze',
    '',
    '> Docs for `@tenphi/glaze`, the version installed in this project. Glaze builds color themes on OKHST tone and solves WCAG and APCA contrast for light, dark and high-contrast schemes. Start with Getting started; the reference has every option.',
    '',
    ...body,
  ].join('\n');
}

/**
 * Resolves an extensionless relative import inside the repository to its
 * `.ts` file, as the site's bundler does, so Node runs the site's helpers and
 * `src/` with its type stripping.
 */
function enableTypeScript() {
  if (!process.features.typescript || !registerHooks) {
    throw new Error(
      `it runs TypeScript, which needs Node 22.18 or later (this is ${process.version})`,
    );
  }
  registerHooks({
    resolve(specifier, context, next) {
      const parent = context.parentURL ?? '';
      if (
        /^\.\.?\//.test(specifier) &&
        !/\.[cm]?[jt]sx?$|\.json$/.test(specifier) &&
        parent.startsWith(ROOT_URL) &&
        !parent.includes('/node_modules/') &&
        fs.existsSync(fileURLToPath(new URL(`${specifier}.ts`, parent)))
      ) {
        return next(`${specifier}.ts`, context);
      }
      return next(specifier, context);
    },
  });
}

/**
 * Builds every page and the index in memory. Returns a map from each output
 * path to its content; throws with every problem.
 */
export async function buildDocs() {
  enableTypeScript();
  const { MARKDOWN } = await import(
    pathToFileURL(path.join(ROOT, 'docs-site/components/markdown.ts')).href
  );
  const { default: config } = await import(
    pathToFileURL(path.join(ROOT, 'docs.config.ts')).href
  );
  const files = listPages();
  const site = {
    pages: new Map(files.map((file) => [file, outputOf(file)])),
    routes: new Map(files.map((file) => [routeOf(file), outputOf(file)])),
  };
  const errors = [];
  const built = new Map();
  const index = [];

  // Examples that miss a floor or an out-of-reach step on purpose make Glaze
  // warn while they resolve. The site build shows those; here they are noise.
  const warn = console.warn;
  console.warn = (...args) => {
    if (!String(args[0]).startsWith('glaze: ')) warn(...args);
  };
  try {
    for (const file of files) {
      const out = outputOf(file);
      const route = routeOf(file);
      const { data, body } = splitFrontmatter(read(file));
      const mdx = file.endsWith('.mdx');
      const converted = mdx
        ? await convertMdx(body, { file, forms: MARKDOWN, errors })
        : body;
      const head = [`# ${data.title}`, data.description ?? ''];
      if (!data.title) errors.push(`${file}: no title in its frontmatter`);
      if (mdx) {
        head.push(
          `This page is also on the [Glaze site](${SITE}${route === '/' ? '' : route}/), with live examples.`,
        );
      }
      const markdown = tidy(
        mapProse([...head, converted].join('\n\n'), (text) => [
          rewriteLinks(text, { file, out, site, errors }),
        ]),
      );
      const left = mdx && mdxLeft(markdown);
      if (left) errors.push(`${file}: MDX left in the page: ${left}`);
      built.set(out, markdown);
      index.push({
        file,
        out,
        route,
        title: data.title,
        description: data.description,
      });
    }
  } finally {
    console.warn = warn;
  }
  built.set(
    posix.join(OUT, 'llms.txt'),
    llmsIndex(config.navigation?.items ?? [], index, errors),
  );
  if (errors.length > 0) {
    throw new Error(
      `The docs have ${errors.length} problem(s):\n${errors.map((e) => `  ${e}`).join('\n')}`,
    );
  }
  return built;
}

/** Removes what the build wrote: all of `harness/docs/`. */
export function cleanDocs() {
  fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true });
}

async function main() {
  if (process.argv.includes('--clean')) {
    cleanDocs();
    console.log(`[build-docs] Removed ${OUT}/`);
    return;
  }
  const files = await buildDocs();
  cleanDocs();
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, file), content);
  }
  console.log(`[build-docs] Wrote ${files.size} files to ${OUT}/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[build-docs] ${error.message}`);
    process.exit(1);
  });
}
