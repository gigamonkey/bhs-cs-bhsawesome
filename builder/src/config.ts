/*
 * BookConfig: everything book-specific about a build, so the builder
 * itself is generic (the monorepo's plans/bjc-quarto-to-xml.md P1). The
 * builder builds exactly one book per process (watch.ts spawns a fresh
 * build per change), so the active config is module state set once by the
 * entry point before anything else runs; emitters read it via getConfig().
 *
 * All paths are absolute — the config module does no resolution of its
 * own, so a book config computes them from its own import.meta.dirname.
 */

import type { Book, Division } from './book.ts';

export type BookConfig = {
  /** Book id: the exercises.json `book` field and the `<id>.html` legacy
   * redirect key. */
  id: string;
  /** URL mount, no trailing slash (e.g. '/bhsawesome'). */
  base: string;
  /** Absolute output dir (overlay-shaped, e.g. .../build/out/public/bhsawesome). */
  siteDir: string;
  /** Absolute path to the book root document (main.ptx). */
  mainPtx: string;
  /** Absolute path to the chrome template (the per-book page shell). */
  chromeFile: string;
  /** Absolute path to the book stylesheet; copied to <site>/book.css. */
  cssFile: string;
  /** Fonts dir; its files copy to <site>/fonts/. */
  fontsDir?: string;
  /** Copied to <site>/permalinks.js when present. */
  permalinksFile?: string;
  /** Source-assets tree: `<image source=…>` and `<pre source=…>` resolve
   * here; copied to <site>/external/. */
  assetsDir?: string;
  /** Additional asset trees copied verbatim into the site (vendor bundles
   * etc). dest is site-relative. */
  assetTrees?: { src: string; dest: string }[];
  /** Dirs watch.ts watches (absolute). */
  watchDirs?: string[];
  /** Division depth that starts pages (default 2 — chapter children are
   * pages; 3 makes the next level down pages too, e.g. BJC's
   * unit/lab/page). Divisions above the chunk depth render summary pages;
   * below it, inline. */
  chunkDepth?: number;
  /** Division-heading type labels by kind (merged over the defaults). */
  divisionLabels?: Record<string, string>;
  /** Block-heading/xref type names by element (merged over the defaults). */
  blockTypeNames?: Record<string, string>;
  /** Language assumed for <program>/parsons with no @language. Default 'java'. */
  defaultProgramLanguage?: string;
  /** Prism grammars to load for build-time highlighting. Default ['java']. */
  highlightLanguages?: string[];
  /** Emit exercises.json (the website book-grid feed). Default true. */
  emitExercisesJson?: boolean;
  /** check-links allowlist of known-missing refs (site-absolute URLs). */
  knownMissing?: string[];
  /** The book's <box kind="…"> vocabulary (plans/bjc-quarto-to-xml.md D3):
   * kind -> rendering. A kind absent from the map warns at build time. */
  boxKinds?: Record<string, BoxKind>;
  /** The book's <aside kind="…"> vocabulary (the margin/floating family). */
  asideKinds?: Record<string, BoxKind>;
  /** Override the generated toc.js (the sidebar-injecting script) — a book
   * whose chrome wants different sidebar markup (e.g. BJC's Quarto-classed
   * sidebar) supplies its own generator. Default: the PreTeXt-classed ToC
   * (src/toc.ts). The argument is the loaded Book model. */
  tocJs?: (book: Book) => string;
  /** Override the browser-tab <title> per page (default: the division's
   * title, or the book title). Receives the page division. */
  pageTitle?: (division: Division) => string;
  /** Override the heading block at the top of every page-root division
   * (default: the h1.heading with type/number/title spans). BJC uses this
   * for the Quarto-style title block (breadcrumbs + title + subtitle). */
  pageHeading?: (division: Division) => string;
  /** How exercise payloads render: 'runestone' (default — the vendored
   * Runestone component payloads) or 'llab' (BJC's quiz.js DOM for
   * multiple choice). */
  mcqStyle?: 'runestone' | 'llab';
  /** Override redirects.json generation (default: every division's flat
   * legacy `<id>.html` name -> its URL). BJC's legacy URLs are nested
   * Quarto paths recorded by the converter, so its config supplies them. */
  redirects?: (book: Book) => Record<string, string>;
};

export type BoxKind = {
  /** CSS class(es) on the emitted element; defaults to the kind name. */
  className?: string;
  /** Fixed heading text rendered at the top of the box (e.g. a box family
   * whose every instance is titled "On this page"). */
  title?: string;
  /** Collapsible boxes render as <details> with this summary label
   * (e.g. "If There Is Time…"); open = expanded by default. */
  collapsible?: { label: string; open?: boolean };
};

let active: BookConfig | null = null;

export function setConfig(config: BookConfig): void {
  active = config;
}

export function getConfig(): BookConfig {
  if (!active) throw new Error('no BookConfig set — the entry point must call setConfig() first');
  return active;
}
