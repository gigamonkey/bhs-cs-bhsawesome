/*
 * Internal-link check over the emitted BHSawesome site (run after
 * build.ts; CI runs it before publishing).
 *
 *     node builder/check-links.ts
 */

import { config } from './bhsawesome.ts';
import { checkLinks } from './src/check-links.ts';

if (checkLinks(config).length) process.exit(1);
