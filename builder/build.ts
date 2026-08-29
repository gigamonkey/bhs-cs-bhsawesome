/*
 * The BHSawesome build (plans/rehost-bhsawesome.md phase 3):
 *
 *     node builder/build.ts [--only <page-path>...] [--no-assets]
 *
 * A thin wrapper: the book-specific facts live in builder/bhsawesome.ts,
 * the build itself in the generic builder/src/build.ts (a --only key is
 * the page's URL path, e.g. `introduction/intro-to-java`, or `` for the
 * contents page).
 */

import { config } from './bhsawesome.ts';
import { buildBook } from './src/build.ts';

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')));

await buildBook(config, { only, withAssets: !args.includes('--no-assets') });
