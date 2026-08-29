/*
 * Preview the built BHSawesome site. Run beside watch.ts:
 *
 *     node builder/serve.ts [port]      # default 8237; / redirects to /bhsawesome/
 */

import { config } from './bhsawesome.ts';
import { serve } from './src/serve.ts';

serve(config, Number(process.argv[2] ?? 8237));
