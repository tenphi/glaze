/**
 * Builds the docs the package ships, at `prepack`: every page in `docs/`
 * becomes plain Markdown in `harness/docs/`, and `harness/docs/llms.txt`
 * indexes them in the order of the site's navigation (`docs.config.ts`). The
 * harness names that folder as Glaze's docs (`harness/plugin.json`), so
 * harnesspm gives consumers' agents the index as `glaze:docs`. The folder is
 * git-ignored and rebuilt from scratch on every run; `--clean` removes it.
 *
 *   docs/{name}.mdx | docs/{name}.md  ->  harness/docs/{name}.md
 *
 * The pages are written for the site. A page's frontmatter becomes its `#`
 * title and first paragraph. An `.mdx` page loses its imports, exports and
 * comments, gets a note on how to read its tables, and each component becomes
 * the Markdown that `docs-site/components/markdown.ts` gives it: an example
 * prints the code the site prints, with a table of what it resolves to, and a
 * figure keeps its caption. Props are evaluated with the page's own exports,
 * so the values are the ones the site renders. A link to a page or a site
 * route leads to that page's `.md`.
 *
 * The build fails, so none of these ship: a component with no Markdown form;
 * an expression, or an element outside a component, in prose; a relative link
 * or a route that is not a page; MDX left in a page; a page without a title,
 * or missing from the site's navigation (so missing from the index). Anchors
 * are checked on the site, by `cookbook check-build`; the pages keep their
 * headings.
 *
 * It runs the site's TypeScript helpers with Node's type stripping, so it
 * needs Node 22.18+.
 *
 * Usage: node scripts/build-docs.mjs [--clean]
 */
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROOT_URL = pathToFileURL(`${ROOT}/`).href;
const SOURCE = 'docs';
const OUT = 'harness/docs';
const SITE = 'https://glaze.tenphi.me';

const posix = path.posix;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

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

/**
 * A page's frontmatter fields, the body after it, and the body's first line
 * in the file. The fields are one-line `key: value` pairs, plain or quoted; a
 * value on more lines throws.
 */
export function splitFrontmatter(source) {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { data: {}, body: text, line: 1 };
  const data = {};
  const lines = match[1].split('\n');
  for (const [i, line] of lines.entries()) {
    const field = /^(\w+):\s*(.*?)\s*$/.exec(line);
    if (!field) continue;
    const [, key, raw] = field;
    if (/^[|>]/.test(raw) || /^\s+\S/.test(lines[i + 1] ?? '')) {
      throw new Error(`the frontmatter's "${key}" must be one line`);
    }
    data[key] = raw.startsWith("'")
      ? raw.slice(1, -1).replaceAll("''", "'")
      : raw.startsWith('"')
        ? JSON.parse(raw)
        : raw;
  }
  return {
    data,
    body: text.slice(match[0].length),
    line: match[0].split('\n').length,
  };
}

/**
 * Whether each line is code: a fence or a line inside one, also inside a
 * blockquote. A fence closes only with the same character, at least as long
 * (CommonMark).
 */
function fenced(lines) {
  let fence;
  return lines.map((line) => {
    const marker = /^(?:\s*>)*\s*(`{3,}|~{3,})(.*)$/.exec(line);
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

/** Runs `fn` on `line` with its code spans held out, then puts them back. */
function outsideCode(line, fn) {
  const spans = [];
  const masked = line.replace(/(`+)[\s\S]*?(?<!`)\1(?!`)/g, (span) => {
    spans.push(span);
    return `\u0000${spans.length - 1}\u0000`;
  });
  return fn(masked).replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
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
      .map((line) => /^[ \t]*/.exec(line)[0].length),
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
      const route = url.replace(/(.)\/$/, '$1');
      // The site's home page is not in `docs/`.
      if (route === '/') return `${SITE}/${hash}`;
      const page = site.routes.get(route);
      if (page) return relative(out, page) + hash;
      errors.push(`${file}: ${url} is not a page of the site`);
      return url + hash;
    }
    let source;
    try {
      source = posix.join(posix.dirname(file), decodeURI(url));
    } catch {
      errors.push(`${file}: ${url} is not a valid link`);
      return url + hash;
    }
    const page = site.pages.get(source);
    if (page) return relative(out, page) + hash;
    errors.push(
      `${file}: ${url} is not a page in ${SOURCE}/ (link another file with a full URL)`,
    );
    return url + hash;
  };

  // A reference definition, `[label]: url`, also in a blockquote, but not a
  // footnote, `[^1]: text`.
  const definition =
    /^((?:\s*>)*\s*\[(?!\^)[^\]]+\]:\s*)([^\s#]*)(#\S*)?(.*)$/.exec(line);
  if (definition) {
    const [, head, url, hash = '', rest] = definition;
    return `${head}${target(url, hash)}${rest}`;
  }

  // Code spans keep their text. A link may have a title, `[text](url 'title')`.
  return outsideCode(line, (prose) =>
    prose.replace(
      /\]\(([^)\s#]*)(#[^)\s]*)?(\s+(?:"[^"]*"|'[^']*'))?\)/g,
      (_, url, hash = '', title = '') => `](${target(url, hash)}${title})`,
    ),
  );
}

/** MDX left in a built page's prose, if any: a component tag or a comment. */
export function mdxLeft(markdown) {
  let found;
  mapProse(markdown, (line) => {
    outsideCode(line, (prose) => {
      found ??=
        /<\/?[A-Z][\w.]*(\s|\/?>|$)/.exec(prose)?.[0] ??
        /\{\/\*/.exec(prose)?.[0];
      return prose;
    });
    return [line];
  });
  return found;
}

/** Whether an expression node holds only a comment, `{/* … *\/}`. */
const isComment = (node) => node.data?.estree?.body?.length === 0;

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

/** Whether an import is a component: the site renders those, Node can't load them. */
const isComponent = (from) =>
  /\.(astro|tsx|jsx)$/.test(from) || from.endsWith('/components');

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
      const from = statement.source?.value;
      if (from === undefined) {
        statements.push(text);
        continue;
      }
      if (statement.type === 'ImportDeclaration' && isComponent(from)) {
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
    `export const __docsProps = [\n${elements
      .map((element) => `() => (${propsSource(element)})`)
      .join(',\n')}\n];`,
  );
  try {
    const module = await import(
      `data:text/javascript,${encodeURIComponent(statements.join('\n'))}`
    );
    return module.__docsProps;
  } catch (error) {
    throw new Error(`its imports, exports or props fail: ${error.message}`);
  }
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
const isElement = (node) => node.type === 'mdxJsxFlowElement';
/** A component tag, `<Example>`, not an HTML-like one, `<li>`. */
const isComponentTag = (node) => isElement(node) && /^[A-Z]/.test(node.name);

/**
 * MDX → Markdown for the body of an `.mdx` page: imports and exports go,
 * comments go, and each component becomes what `forms` renders for it.
 * `page` is the page's URL on the site, and `firstLine` the body's first line
 * in `file`. Problems go to `errors`.
 */
export async function convertMdx(
  body,
  { file, firstLine = 1, page, forms, errors },
) {
  const { createProcessor } = await import('@mdx-js/mdx');
  const at = (place) => `${file}:${place.line + firstLine - 1}`;
  let tree;
  try {
    tree = createProcessor().parse(body);
  } catch (error) {
    const where = error.line ? `${at(error)}:${error.column}` : file;
    errors.push(`${where}: ${error.reason ?? error.message}`);
    return '';
  }
  const esm = tree.children.filter((node) => node.type === 'mdxjsEsm');
  const elements = [];
  const line = (node) => at(node.position.start);

  // Components in document order. Inside a component, its HTML-like
  // elements (`<li>` in `<Steps>`) are its own; anywhere else, an element or
  // an expression has no Markdown form.
  const visit = (node, inComponent) => {
    for (const child of node.children ?? []) {
      if (isComponentTag(child)) {
        elements.push(child);
        visit(child, true);
      } else if (child.type === 'mdxjsEsm') {
        if (node !== tree) errors.push(`${line(child)}: an import or export`);
      } else if (/^mdx(Flow|Text)Expression$/.test(child.type)) {
        if (!isComment(child)) errors.push(`${line(child)}: an expression`);
      } else if (/^mdxJsx/.test(child.type) && !inComponent) {
        errors.push(
          child.type === 'mdxJsxTextElement' && /^[A-Z]/.test(child.name ?? '')
            ? `${line(child)}: <${child.name}> inside a line of text (give a component lines of its own)`
            : `${line(child)}: <${child.name}> has no Markdown form`,
        );
      } else {
        visit(child, inComponent);
      }
    }
  };
  visit(tree, false);
  const components = componentsOf(esm);
  let thunks;
  try {
    thunks = await evaluateProps(body, file, esm, elements);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return '';
  }
  const printed = new Set();

  // The nodes under `node` that the Markdown replaces: imports and exports,
  // comments and components, however deep, but not inside a component.
  const replaced = (node) =>
    (node.children ?? []).flatMap((child) =>
      child.type === 'mdxjsEsm' ||
      /^mdx(Flow|Text)Expression$/.test(child.type) ||
      isComponentTag(child)
        ? [child]
        : replaced(child),
    );

  // The source between `from` and `to`, each of `nodes` replaced.
  const convert = (nodes, from, to) => {
    let out = '';
    let at = from;
    for (const node of nodes) {
      out += body.slice(at, startOf(node));
      out += render(node);
      at = endOf(node);
    }
    return out + body.slice(at, to);
  };

  const render = (node) => {
    if (!isElement(node)) return '';
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
    // What the tag's line starts with: indentation, and `>` in a blockquote.
    const lineOf = (offset) => body.lastIndexOf('\n', offset - 1) + 1;
    const prefix = body
      .slice(lineOf(startOf(node)), startOf(node))
      .replace(/[^>\s]/g, ' ');
    let children = '';
    if (node.children.length > 0) {
      // The children's lines, without the blockquote markers they carry.
      const quotes = prefix.split('>').length - 1;
      const markers = new RegExp(`^(?:[ \\t]*> ?){0,${quotes}}`, 'gm');
      const source = convert(
        replaced(node),
        lineOf(startOf(node.children[0])),
        endOf(node.children.at(-1)),
      );
      children = dedent(source.replace(markers, '')).trim();
    }
    try {
      const props = thunks[elements.indexOf(node)]();
      const markdown = form(props, { children, printed, page });
      // Later lines carry the prefix too.
      return markdown
        .split('\n')
        .map((text, i) =>
          i === 0 ? text : text === '' ? prefix.trimEnd() : prefix + text,
        )
        .join('\n');
    } catch (error) {
      errors.push(`${line(node)}: <${node.name}>: ${error.message}`);
      return '';
    }
  };
  return convert(replaced(tree), 0, body.length);
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

/** A page's URL on the site. */
const siteUrl = (route) => `${SITE}${route}/`;

/**
 * How to read a page built from site MDX: where its examples render live,
 * and, when `body` has tables of resolved colors, what their cells say.
 */
export function readingNote(route, body) {
  const note = [
    `This page is built from the [Glaze site](${siteUrl(route)}), where its examples render live and follow the reader's appearance settings. Here, each example prints its code, a table shows what a theme resolves to in light, dark and their high-contrast (HC) variants, and **Figure** quotes the caption of a figure on the site.`,
  ];
  if (/^\|.*\| (tone|α) \d/m.test(body)) {
    note.push(
      "In the tables, `tone` is 0–100. An overlay has its opacity `α` and the `step` it paints on the color under it (`of` the step it asked for, when it can't reach it). `Δ` is the tone step from the base, and `h` and `s` are the resolved OKHSL hue and saturation (0–1). Contrast against the base is a WCAG ratio (`4.5:1`) or an APCA `Lc`, which takes the base as the text when the color is a surface; `misses` names a floor the color does not meet.",
    );
  }
  return note.join('\n\n');
}

/**
 * Resolves an extensionless relative import inside the repository to its
 * `.ts` file, as the site's bundler does, so Node runs the site's helpers and
 * `src/` with its type stripping.
 */
function enableTypeScript() {
  if (!process.features.typescript || !nodeModule.registerHooks) {
    throw new Error(
      `it runs TypeScript, which needs Node 22.18 or later (this is ${process.version})`,
    );
  }
  nodeModule.registerHooks({
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
      let data, body, firstLine;
      try {
        ({ data, body, line: firstLine } = splitFrontmatter(read(file)));
      } catch (error) {
        errors.push(`${file}: ${error.message}`);
        continue;
      }
      const mdx = file.endsWith('.mdx');
      const converted = mdx
        ? await convertMdx(body, {
            file,
            firstLine,
            page: siteUrl(route),
            forms: MARKDOWN,
            errors,
          })
        : body;
      const head = [`# ${data.title}`, data.description ?? ''];
      if (!data.title) errors.push(`${file}: no title in its frontmatter`);
      if (mdx) head.push(readingNote(route, converted));
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
    console.error(`[build-docs] Removed ${OUT}/`);
    return;
  }
  const files = await buildDocs();
  cleanDocs();
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, file), content);
  }
  console.error(`[build-docs] Wrote ${files.size} files to ${OUT}/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[build-docs] ${error.message}`);
    process.exit(1);
  });
}
