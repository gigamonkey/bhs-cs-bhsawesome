/*
 * The whole-book build as a function of a BookConfig (the monorepo's
 * plans/bjc-quarto-to-xml.md P1 — formerly the body of builder/build.ts).
 * Emits the complete site into config.siteDir (overlay-shaped, so
 * push-content and the monorepo's dev-all consume it with no staging
 * step): every page an index.html in its own directory
 * (plans/bhsawesome-index-html-urls.md), the contents/backmatter/index
 * pages, standalone video pages, xref knowl pages, redirects.json (old
 * flat page name -> new URL, served as 301s by the web app),
 * exercises.json (unless the config opts out), the lunr search corpus,
 * and (unless opts.withAssets is false) the configured asset trees.
 */

import fs from 'node:fs';
import path from 'node:path';
import { type Division, loadBook } from './book.ts';
import { type BookConfig, setConfig } from './config.ts';
import { navFor, renderChrome } from './chrome.ts';
import { tocJs } from './toc.ts';
import { numberBlocks, numberTasks } from './ids.ts';
import { initMath } from './math.ts';
import { makeCtx, pageContent } from './page.ts';
import {
  backmatterContent,
  bookIndexContent,
  collectVideos,
  colophonContent,
  contentsPageContent,
  lunrIndexJs,
  pageExercises,
  videoPage,
} from './extras.ts';
import { emitElement } from './prose.ts';
import { knowlTargets } from './prose.ts';
import { fileFor, href } from './urls.ts';

export type BuildOptions = {
  /** Restrict emission to these page paths ('' = the contents page). */
  only?: Set<string> | null;
  /** Copy the configured asset trees (default true). */
  withAssets?: boolean;
};

export async function buildBook(config: BookConfig, opts: BuildOptions = {}): Promise<number> {
  setConfig(config);
  const only = opts.only ?? null;
  const withAssets = opts.withAssets !== false;
  const OUT = config.siteDir;

  const started = performance.now();
  await initMath(); // the speech engine loads its locale async; emission is sync
  const book = loadBook(config.mainPtx);
  for (const page of book.pages) {
    numberBlocks(page);
    numberTasks(page);
  }

  // Page directories share the site root with the asset trees; a division id
  // (or the video/ namespace) colliding with one would silently interleave
  // pages into an asset tree.
  const RESERVED = new Set(['_static', 'external', 'generated', 'fonts', 'knowl', 'video']);
  for (const d of book.pages) {
    const first = (d.page as string).split('/')[0];
    if (RESERVED.has(first)) throw new Error(`page path ${d.page} collides with reserved root entry ${first}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const warnings = new Map<string, number>();
  const makeWarn = (page: string) => (msg: string) => {
    const key = `${page}: ${msg}`;
    warnings.set(key, (warnings.get(key) ?? 0) + 1);
  };

  // Backmatter pages exist only when the book has a <backmatter>.
  const hasBackmatter = book.bookEl.children.some(
    (c) => c instanceof Object && 'name' in c && (c as { name: string }).name === 'backmatter',
  );

  // The book-order page sequence for prev/next, and each page's Up target
  // ('' is the contents page at the site root).
  const sequence = [
    '',
    ...book.pages.map((d) => d.page as string),
    ...(hasBackmatter ? ['backmatter', 'backmatter/book-index', 'backmatter/colophon'] : []),
  ];
  const upOf = new Map<string, string | null>();
  upOf.set('', null);
  for (const d of book.pages) {
    upOf.set(d.page as string, d.parent?.page ?? '');
  }
  if (hasBackmatter) {
    upOf.set('backmatter', '');
    upOf.set('backmatter/book-index', 'backmatter');
    upOf.set('backmatter/colophon', 'backmatter');
  }

  const exercisesIndex: {
    file: string;
    title: string;
    number: string | null;
    chapter: { number: string; title: string } | null;
    exercises: object[];
  }[] = [];
  let emitted = 0;

  // The page's enclosing chapter (or itself, for a chapter's own page), for
  // the website's book-grid chapter-grouped column headers.
  function chapterOf(d: Division): Division | null {
    for (let a: Division | null = d; a; a = a.parent) {
      if (a.kind === 'chapter') return a;
    }
    return null;
  }

  function writeSiteFile(rel: string, content: string): void {
    const target = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  function writePage(page: string, title: string, content: string): void {
    if (only && !only.has(page)) return;
    writeSiteFile(fileFor(page), renderChrome(book, page, title, content, navFor(book, sequence, page, upOf)));
    emitted += 1;
  }

  // Division pages.
  for (const division of book.pages) {
    const page = division.page as string;
    if (only && !only.has(page)) continue;
    const ctx = makeCtx(book, page, makeWarn(page));
    const content = pageContent(division, ctx);
    writePage(page, config.pageTitle?.(division) ?? (division.title || book.title), content);
    const exercises = pageExercises(content);
    if (exercises.length) {
      const ch = chapterOf(division);
      exercisesIndex.push({
        file: page,
        title: division.title || 'Introduction',
        number: division.number,
        chapter: ch?.number ? { number: ch.number, title: ch.title } : null,
        exercises,
      });
    }
  }

  // Special pages ('' is the contents page — the site-root index.html).
  writePage('', book.title, contentsPageContent(book));
  if (hasBackmatter) {
    writePage('backmatter', 'Back Matter', backmatterContent(book, makeCtx(book, 'backmatter', makeWarn('backmatter'))));
    writePage('backmatter/book-index', 'Index', bookIndexContent(book));
    writePage('backmatter/colophon', 'Colophon', colophonContent(book, makeCtx(book, 'backmatter/colophon', makeWarn('colophon'))));
  }

  // Standalone video pages.
  const videos = collectVideos(book);
  if (!only) {
    for (const v of videos) {
      writeSiteFile(fileFor(`video/${v.label}`), videoPage(v.label, v.youtube));
      emitted += 1;
    }
  }

  // Xref knowl pages (block targets referenced via data-knowl).
  if (!only) {
    for (const id of knowlTargets) {
      const label = book.labels.get(id);
      if (!label) continue;
      const ctx = makeCtx(book, label.pageOf.page as string, makeWarn(`knowl/${id}`));
      const content = emitElement(label.el, ctx);
      writeSiteFile(
        path.join('knowl', 'xref', `${id}.html`),
        renderChrome(book, label.pageOf.page as string, book.title, content, { prev: null, up: null, next: null }),
      );
      emitted += 1;
    }
  }

  // redirects.json: every pre-directory-URLs flat page name -> its new URL.
  // The web app serves these as 301s (plans/bhsawesome-index-html-urls.md
  // phase 0), and the content repo's material-url rewrite reads the same map.
  if (!only) {
    // index.html too: the old root was a meta-refresh stub at that name, so
    // links to it exist; send them to the clean root URL.
    const redirects: Record<string, string> = { [`${config.id}.html`]: href(''), 'index.html': href('') };
    for (const d of book.pages) redirects[`${d.id}.html`] = href(d.page as string);
    if (hasBackmatter) {
      redirects['backmatter.html'] = href('backmatter');
      redirects['book-index.html'] = href('backmatter/book-index');
      redirects['colophon.html'] = href('backmatter/colophon');
    }
    for (const v of videos) redirects[`${v.label}.html`] = href(`video/${v.label}`);
    fs.writeFileSync(path.join(OUT, 'redirects.json'), JSON.stringify(redirects, null, 1));
  }

  // exercises.json + search corpus.
  if (!only) {
    if (config.emitExercisesJson !== false) {
      fs.writeFileSync(
        path.join(OUT, 'exercises.json'),
        JSON.stringify({ book: config.id, pages: exercisesIndex }, null, 1),
      );
    }
    fs.writeFileSync(path.join(OUT, 'lunr-pretext-search-index.js'), lunrIndexJs(book));
  }

  // Asset-tree copy, mtime/size-guarded so unchanged files aren't rewritten.
  function copyTree(src: string, dst: string): number {
    if (!fs.existsSync(src)) return 0;
    let n = 0;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) n += copyTree(s, d);
      else {
        const st = fs.statSync(s);
        const dt = fs.existsSync(d) ? fs.statSync(d) : null;
        if (!dt || dt.mtimeMs < st.mtimeMs || dt.size !== st.size) {
          fs.copyFileSync(s, d);
          n += 1;
        }
      }
    }
    return n;
  }

  // The stylesheet is the BOOK's (config.cssFile) — copied to the site root
  // beside the pages, with any self-hosted font files it references under
  // fonts/ and the optional client-side permalink injector.
  fs.copyFileSync(config.cssFile, path.join(OUT, 'book.css'));
  // The shared ToC script (one cacheable file instead of inline ToC per
  // page); a book can supply its own generator (config.tocJs).
  fs.writeFileSync(path.join(OUT, 'toc.js'), (config.tocJs ?? tocJs)(book));
  if (config.permalinksFile) fs.copyFileSync(config.permalinksFile, path.join(OUT, 'permalinks.js'));
  if (config.fontsDir) {
    fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
    for (const f of fs.readdirSync(config.fontsDir)) {
      fs.copyFileSync(path.join(config.fontsDir, f), path.join(OUT, 'fonts', f));
    }
  }

  if (withAssets && !only) {
    let copied = config.assetsDir ? copyTree(config.assetsDir, path.join(OUT, 'external')) : 0;
    for (const tree of config.assetTrees ?? []) {
      copied += copyTree(tree.src, path.join(OUT, tree.dest));
    }
    if (copied) console.log(`assets: ${copied} file(s) copied`);
  }

  for (const [msg, n] of warnings) console.log(`WARN ${msg}${n > 1 ? ` (x${n})` : ''}`);
  console.log(
    `emitted ${emitted} page(s) in ${Math.round(performance.now() - started)}ms (${warnings.size} distinct warnings)`,
  );
  return warnings.size;
}
