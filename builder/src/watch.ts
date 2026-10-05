/*
 * Watch mode: rebuild whenever the book source, the builder itself, or the
 * vendored assets change. Each rebuild is a fresh subprocess running the
 * book's build script, so edits to the builder's own source are picked up
 * too.
 *
 * With options.sourceDir, an edit confined to .ptx files there first tries
 * a page-only build (`<buildScript> --only-files <files>`, a few hundred ms
 * instead of the whole book): the script exits 3, writing nothing, when a
 * file isn't confined to one page (a toctree, main.ptx, a new file), and
 * the full build runs instead. A page build can't refresh what the page
 * shows elsewhere (its title in the contents and prev/next, its numbers in
 * other pages' cross-references), so a full build follows once edits pause
 * (options.catchUpMs). Builds never overlap — the full build writes over
 * the live site in place, so a later page build must not race it — and
 * changes arriving mid-build are handled when it finishes.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type WatchOptions = {
  /** Arguments every spawned build gets first, before the full build's
   * pass-through args or a page build's `--only-files` (e.g. the book
   * directory a multi-book build script takes). */
  baseArgs?: string[];
  /** The book's source dir, enabling the page-only fast path. */
  sourceDir?: string;
  /** How long edits must pause after a page build before the catch-up full
   * build (default 5000). */
  catchUpMs?: number;
};

/** Editor droppings (Emacs locks/backups/autosaves, vim swap files and its
 * write-test file, Finder metadata) — never build inputs. */
function isEditorJunk(f: string): boolean {
  const b = path.basename(f);
  return b.endsWith('~') || b.startsWith('.#') || /^#.*#$/.test(b) || /\.sw[a-p]$/.test(b) || b === '4913' || b === '.DS_Store';
}

export function watchAndBuild(
  buildScript: string,
  watchDirs: string[],
  passThrough: string[],
  options: WatchOptions = {},
): void {
  const baseArgs = options.baseArgs ?? [];
  const sourceDir = options.sourceDir ? path.resolve(options.sourceDir) : null;
  const catchUpMs = options.catchUpMs ?? 5000;
  let running = false;
  let fullWanted = false; // a full build is owed (a non-page edit)
  const changed = new Set<string>();
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let catchUp: ReturnType<typeof setTimeout> | null = null;

  function run(args: string[], done: (code: number | null) => void): void {
    running = true;
    const child = spawn(process.execPath, [buildScript, ...baseArgs, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => {
      running = false;
      done(code);
      next();
    });
  }

  function full(label: string): void {
    fullWanted = false;
    if (catchUp) clearTimeout(catchUp);
    catchUp = null;
    const start = Date.now();
    run(passThrough, (code) => {
      console.log(code === 0 ? `${label} done (${Date.now() - start}ms)` : `${label} FAILED (exit ${code})`);
    });
  }

  function scheduleCatchUp(): void {
    if (catchUp) clearTimeout(catchUp);
    catchUp = setTimeout(() => {
      catchUp = null;
      // Edits still arriving: wait for the pause.
      if (running || changed.size || debounce) scheduleCatchUp();
      else full('catch-up full rebuild');
    }, catchUpMs);
  }

  // Start whatever is owed, unless a build is running (its exit calls back).
  function next(): void {
    if (running) return;
    if (changed.size) {
      // A save-by-rename (editors, sed -i) leaves events for a temp file
      // that is gone by now; inside the source dir only a vanished .ptx
      // (a deleted page) means anything.
      const files = [...changed].filter(
        (f) => fs.existsSync(f) || f.endsWith('.ptx') || !sourceDir || !f.startsWith(sourceDir + path.sep),
      );
      changed.clear();
      if (!files.length) return next();
      const pageOnly =
        !fullWanted &&
        sourceDir !== null &&
        files.every((f) => f.endsWith('.ptx') && f.startsWith(sourceDir + path.sep) && fs.existsSync(f));
      if (!pageOnly) return full('full rebuild');
      const start = Date.now();
      const names = files.map((f) => path.relative(sourceDir, f)).join(', ');
      run(['--only-files', ...files], (code) => {
        if (code === 3) {
          fullWanted = true; // not confined to pages: next() builds it all
        } else if (code === 0) {
          console.log(`${names}: page rebuilt (${Date.now() - start}ms; the rest of the book catches up when edits pause)`);
          scheduleCatchUp();
        } else {
          // No catch-up: a full build would only fail the same way; the
          // fixing save comes back through here.
          console.log(`${names}: page rebuild FAILED (exit ${code})`);
          if (catchUp) clearTimeout(catchUp);
          catchUp = null;
        }
      });
      return;
    }
    if (fullWanted) full('full rebuild');
  }

  function schedule(dir: string, filename: string | Buffer | null): void {
    if (!filename) {
      fullWanted = true; // some platforms don't say what changed
    } else {
      const f = path.join(dir, filename.toString());
      if (isEditorJunk(f)) return;
      changed.add(f);
    }
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      next();
    }, 150);
  }

  function arm(dir: string): void {
    const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => schedule(dir, filename));
    watcher.on('error', (err) => {
      console.log(`watcher on ${dir} failed (${err.message}); re-arming`);
      watcher.close();
      setTimeout(() => arm(dir), 1000);
    });
  }

  for (const dir of watchDirs) arm(dir);
  console.log(`watching ${watchDirs.join(', ')} — rebuilding on change (Ctrl-C to stop)`);
  full('full build');
}
