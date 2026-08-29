/*
 * Watch mode for BHSawesome:
 *
 *     node builder/watch.ts [args passed through to build.ts]
 */

import path from 'node:path';
import { config } from './bhsawesome.ts';
import { watchAndBuild } from './src/watch.ts';

watchAndBuild(
  path.join(import.meta.dirname, 'build.ts'),
  config.watchDirs ?? [],
  process.argv.slice(2),
);
