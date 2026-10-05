/*
 * Watch mode:
 *
 *     node scripts/watch.ts <book> [args passed through to build.ts's full builds]
 */

import path from 'node:path';
import { watchAndBuild } from '../builder/src/watch.ts';
import { loadBook } from './lib/book.ts';

const { config, bookDir, rest } = await loadBook(process.argv.slice(2), 'usage: node scripts/watch.ts <book> [build args]');

watchAndBuild(
  path.join(import.meta.dirname, 'build.ts'),
  config.watchDirs ?? [],
  rest,
  // Every spawned build (full or --only-files) needs the book first. A
  // page edit rebuilds just that page (build.ts --only-files), the rest
  // of the book catching up once edits pause.
  { baseArgs: [bookDir], sourceDir: path.dirname(config.mainPtx) },
);
