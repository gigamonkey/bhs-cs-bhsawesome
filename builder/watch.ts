/*
 * Watch mode: re-run the full build (~350ms — cheaper than any dependency
 * tracking) whenever the book source, the builder itself, or the vendored
 * assets change.
 *
 *     node builder/watch.ts [args passed through to build.ts]
 *
 * Each rebuild is a fresh `node builder/build.ts` subprocess, so edits to
 * the builder's own source are picked up too. Changes arriving mid-build
 * queue one follow-up rebuild.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WATCHED = ['pretext', 'builder', 'vendor'];
const passThrough = process.argv.slice(2);

let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function build(): void {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  const child = spawn(process.execPath, [path.join(ROOT, 'builder', 'build.ts'), ...passThrough], {
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

for (const dir of WATCHED) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, schedule);
}
console.log(`watching ${WATCHED.join(', ')}/ — rebuilding on change (Ctrl-C to stop)`);
build();
