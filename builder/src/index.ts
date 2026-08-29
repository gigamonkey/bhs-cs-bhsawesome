/*
 * The public API of @peterseibel/book-builder: build a PreTeXt-derived XML
 * book (a BookConfig names everything book-specific), check its links,
 * preview it, and watch-rebuild it. The BHSawesome repo consumes this
 * directly (builder/*.ts wrappers); other books consume the published
 * package (the monorepo's plans/bjc-quarto-to-xml.md).
 */

export { type BookConfig, getConfig, setConfig } from './config.ts';
export { type BuildOptions, buildBook } from './build.ts';
export { checkLinks } from './check-links.ts';
export { serve } from './serve.ts';
export { watchAndBuild } from './watch.ts';
export { type Book, type Division, loadBook } from './book.ts';
// Helpers a book config's hook functions (tocJs, pageHeading, …) need.
export { href } from './urls.ts';
export { escapeHtml, escapeAttr, h } from './html.ts';
export { type XmlElement, child, elements, textContent } from './xml.ts';
