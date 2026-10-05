/*
 * The one convention every scripts/ entry point shares: the first argument
 * is a BOOK DIRECTORY (e.g. `bhsawesome`, relative to the repo root or
 * absolute) whose book.ts exports the BookConfig. Nothing defaults to a
 * particular book — the Makefile's BOOK variable supplies the usual one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BookConfig } from '../../builder/src/config.ts';

/** The repo root (scripts/ is directly under it). */
export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export type LoadedBook = {
  config: BookConfig;
  /** Absolute path of the book directory. */
  bookDir: string;
  /** The arguments after the book directory. */
  rest: string[];
};

/** Resolve a book directory argument to its absolute path, or exit with usage. */
export function bookDirOf(arg: string | undefined, usage: string): string {
  if (!arg || arg.startsWith('-')) {
    console.error(usage);
    process.exit(2);
  }
  const bookDir = path.resolve(ROOT, arg);
  if (!fs.existsSync(path.join(bookDir, 'book.ts'))) {
    console.error(`${arg}: not a book directory (no ${path.join(bookDir, 'book.ts')})`);
    process.exit(2);
  }
  return bookDir;
}

/** Load `<args[0]>/book.ts`'s `config`; `rest` is the remaining args. */
export async function loadBook(args: string[], usage: string): Promise<LoadedBook> {
  const bookDir = bookDirOf(args[0], usage);
  const mod = (await import(pathToFileURL(path.join(bookDir, 'book.ts')).href)) as { config: BookConfig };
  return { config: mod.config, bookDir, rest: args.slice(1) };
}
