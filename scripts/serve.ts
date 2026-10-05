/*
 * Preview a built book. Run beside watch.ts:
 *
 *     node scripts/serve.ts <book> [port]      # default 8237; / redirects to the book's base
 */

import { serve } from '../builder/src/serve.ts';
import { loadBook } from './lib/book.ts';

const { config, rest } = await loadBook(process.argv.slice(2), 'usage: node scripts/serve.ts <book> [port]');
serve(config, Number(rest[0] ?? 8237));
