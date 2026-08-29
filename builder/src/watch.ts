/*
 * Watch mode: re-run the full build (cheaper than any dependency tracking)
 * whenever the book source, the builder itself, or the vendored assets
 * change. Each rebuild is a fresh subprocess running the book's build
 * script, so edits to the builder's own source are picked up too. Changes
 * arriving mid-build queue one follow-up rebuild.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

export function watchAndBuild(buildScript: string, watchDirs: string[], passThrough: string[]): void {
  let running = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function build(): void {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    const child = spawn(process.execPath, [buildScript, ...passThrough], {
      stdio: 'inherit',
    });
    child.on('exit', () => {
      running = false;
      if (queued) {
        queued = false;
        build();
      }
    });
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      build();
    }, 150);
  }

  for (const dir of watchDirs) {
    fs.watch(dir, { recursive: true }, schedule);
  }
  console.log(`watching ${watchDirs.join(', ')} — rebuilding on change (Ctrl-C to stop)`);
  build();
}
