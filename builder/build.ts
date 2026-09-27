/*
 * The BHSawesome build (plans/rehost-bhsawesome.md phase 3):
 *
 *     node builder/build.ts [--only <page-path>...] [--no-assets]
 *     node builder/build.ts --only-files <source-file>...
 *
 * A thin wrapper: the book-specific facts live in builder/bhsawesome.ts,
 * the build itself in the generic builder/src/build.ts (a --only key is
 * the page's URL path, e.g. `introduction/intro-to-java`, or `` for the
 * contents page). --only-files is watch.ts's fast path: rebuild just the
 * pages those source files render on (no assets); it exits 3, writing
 * nothing, when a file isn't confined to one page, meaning "build it all".
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './bhsawesome.ts';
import { NotPagesError, buildBook } from './src/build.ts';

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : new Set(args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')));
const filesIdx = args.indexOf('--only-files');
const onlyFiles = filesIdx === -1 ? null : args.slice(filesIdx + 1).filter((a) => !a.startsWith('--'));

// A source error's message names the file, line and excerpt; the stack of
// builder internals under it is noise (a watcher prints it on every bad save).
async function build(opts: Parameters<typeof buildBook>[1]): Promise<void> {
  try {
    await buildBook(config, opts);
  } catch (e) {
    if (e instanceof NotPagesError) process.exit(3);
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

if (onlyFiles) {
  await build({ onlyFiles, withAssets: false });
  process.exit(0); // the full build's version stamp below is its business
}

await build({ only, withAssets: !args.includes('--no-assets') });

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
