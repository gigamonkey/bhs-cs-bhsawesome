/*
 * The site's URL scheme (plans/bhsawesome-index-html-urls.md): every page
 * is an index.html in its own directory, addressed by a slashed,
 * root-relative URL under the /bhsawesome mount. A Division's `page` is the
 * extensionless path of that directory ('' for the site root); these two
 * helpers are the only place the path becomes a URL or an output file.
 *
 * URLs are root-relative (not page-relative) because the shared artifacts
 * — toc.js, the lunr corpus, the one chrome template — are consulted from
 * pages at every depth and can't carry depth-relative references.
 */

export const BASE = '/bhsawesome';

/**
 * The builder's output tree, relative to the repo root. Overlay-shaped
 * (build/out is what push-content mirrors and what the monorepo's dev-all
 * symlinks into its content overlay), so the build needs no staging step.
 */
export const SITE_DIR = 'build/out/public/bhsawesome';

/** The served URL of a page path: /bhsawesome/<path>/ (slashed canonical). */
export function href(page: string): string {
  return page === '' ? `${BASE}/` : `${BASE}/${page}/`;
}

/** The SITE_DIR-relative output file of a page path. */
export function fileFor(page: string): string {
  return page === '' ? 'index.html' : `${page}/index.html`;
}
