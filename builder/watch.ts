/*
 * Watch mode for BHSawesome:
 *
 *     node builder/watch.ts [args passed through to build.ts's full builds]
 */

import path from 'node:path';
import { config } from './bhsawesome.ts';
import { watchAndBuild } from './src/watch.ts';

watchAndBuild(
  path.join(import.meta.dirname, 'build.ts'),
  config.watchDirs ?? [],
  process.argv.slice(2),
  // A page edit rebuilds just that page (build.ts --only-files), the rest
  // of the book catching up once edits pause.
  { sourceDir: path.dirname(config.mainPtx) },
);
