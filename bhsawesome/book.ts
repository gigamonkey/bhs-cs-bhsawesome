/*
 * The BHSawesome BookConfig: everything book-specific the generic builder
 * (builder/src/) needs. A sibling book is another <book>/book.ts like this
 * one (the monorepo's plans/bjc-quarto-to-xml.md); the scripts/ entry
 * points take the book directory and import its book.ts.
 */

import path from 'node:path';
import type { BookConfig } from '../builder/src/config.ts';

const BOOK = import.meta.dirname;
const ROOT = path.resolve(BOOK, '..');

export const config: BookConfig = {
  id: 'bhsawesome',
  base: '/bhsawesome',
  // Overlay-shaped (build/out is what push-content mirrors and what the
  // monorepo's dev-all consumes), so the build needs no staging step.
  siteDir: path.join(ROOT, 'build', 'out', 'public', 'bhsawesome'),
  mainPtx: path.join(BOOK, 'source', 'main.ptx'),
  chromeFile: path.join(BOOK, 'chrome.html'),
  cssFile: path.join(BOOK, 'book.css'),
  fontsDir: path.join(BOOK, 'fonts'),
  permalinksFile: path.join(BOOK, 'permalinks.js'),
  assetsDir: path.join(BOOK, 'source', 'assets'),
  // The shared vendor/_static tree (the Runestone webpack bundles plus the
  // eight pretext theme+runtime files the chrome references) and this
  // book's 5 CodeLens traces (traces/README.md); dest stays `generated`
  // so the emitted /bhsawesome/generated/… URLs are unchanged.
  assetTrees: [
    { src: path.join(ROOT, 'vendor', '_static'), dest: '_static' },
    { src: path.join(BOOK, 'traces'), dest: 'generated' },
  ],
  // traces/README.md documents the traces; it isn't an asset.
  assetFilter: (relPath) => path.basename(relPath) !== 'README.md',
  watchDirs: [BOOK, path.join(ROOT, 'builder'), path.join(ROOT, 'vendor')],
  // Pre-existing broken images carried over from CSAwesome (the source
  // references them but the assets tree never had them — they render broken
  // in prod too). Remove entries as the images are sourced or the
  // references dropped.
  knownMissing: [
    '/bhsawesome/external/FreeResponse/Figures/frq4-data-grid1.png',
    '/bhsawesome/external/FreeResponse/Figures/frq4-data-grid2.png',
    '/bhsawesome/external/FreeResponse/Figures/frq4-sumorsamegame-table-b.png',
  ],
};
