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

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './bhsawesome.ts';
import { buildBook } from './src/build.ts';

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')));

await buildBook(config, { only, withAssets: !args.includes('--no-assets') });

/*
 * The version stamp this publisher leaves at the root of the overlay slice
 * it owns (public/bhsawesome/version.txt, served at /bhsawesome/version.txt):
 * the short sha of the source tree the build came from, `-dirty` when it had
 * uncommitted changes — the same shape as the website image's GET /version
 * and the bhs-cs-content publishers' /version.txt and /bjc/version.txt. The
 * monorepo's scripts/since-deployed reads it to report what's on origin/main
 * but not yet published. Falls back to GITHUB_SHA, then 'unknown'.
 */
function gitVersion(): string {
  try {
    return execFileSync('git', ['describe', '--always', '--dirty', '--abbrev=7', '--exclude=*'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) || 'unknown';
  }
}

fs.mkdirSync(config.siteDir, { recursive: true });
fs.writeFileSync(path.join(config.siteDir, 'version.txt'), `${gitVersion()}\n`);
