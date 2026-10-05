/*
 * Internal-link check over a book's emitted site (run after build.ts; CI
 * runs it before publishing).
 *
 *     node scripts/check-links.ts <book>
 */

import { checkLinks } from '../builder/src/check-links.ts';
import { loadBook } from './lib/book.ts';

const { config } = await loadBook(process.argv.slice(2), 'usage: node scripts/check-links.ts <book>');
if (checkLinks(config).length) process.exit(1);
