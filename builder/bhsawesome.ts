/*
 * The BHSawesome BookConfig: everything book-specific the generic builder
 * (builder/src/) needs. A second book supplies its own file like this one
 * (the monorepo's plans/bjc-quarto-to-xml.md).
 */

import path from 'node:path';
import type { BookConfig } from './src/config.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

export const config: BookConfig = {
  id: 'bhsawesome',
  base: '/bhsawesome',
  // Overlay-shaped (build/out is what push-content mirrors and what the
  // monorepo's dev-all consumes), so the build needs no staging step.
  siteDir: path.join(ROOT, 'build', 'out', 'public', 'bhsawesome'),
  mainPtx: path.join(ROOT, 'pretext', 'main.ptx'),
  chromeFile: path.join(ROOT, 'builder', 'chrome.html'),
  cssFile: path.join(ROOT, 'builder', 'book.css'),
  fontsDir: path.join(ROOT, 'builder', 'fonts'),
  permalinksFile: path.join(ROOT, 'builder', 'permalinks.js'),
  assetsDir: path.join(ROOT, 'pretext', 'assets'),
  // The committed vendor/ trees frozen from the last PreTeXt build:
  // generated/ (just the 5 CodeLens traces, which only the external
  // pythontutor tracer service can regenerate) and _static/ (the Runestone
  // webpack bundles plus the eight pretext/ theme+runtime files the chrome
  // references).
  assetTrees: [
    { src: path.join(ROOT, 'vendor', '_static'), dest: '_static' },
    { src: path.join(ROOT, 'vendor', 'generated'), dest: 'generated' },
  ],
  watchDirs: [path.join(ROOT, 'pretext'), path.join(ROOT, 'builder'), path.join(ROOT, 'vendor')],
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
