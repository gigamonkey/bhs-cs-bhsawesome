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
};

let active: BookConfig | null = null;

export function setConfig(config: BookConfig): void {
  active = config;
}

export function getConfig(): BookConfig {
  if (!active) throw new Error('no BookConfig set — the entry point must call setConfig() first');
  return active;
}
