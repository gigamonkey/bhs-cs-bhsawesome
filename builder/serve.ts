/*
 * Local preview server: serves build/site under the /bhsawesome prefix
 * with the same directory-URL semantics the website's static mounts give
 * prod (index.html at slashed paths, 301 from unslashed) — needed because
 * the pages' refs are root-relative /bhsawesome/... URLs, so a static
 * server rooted at build/site can't preview them. Run beside watch.ts:
 *
 *     node builder/serve.ts [port]      # default 8237; / redirects to /bhsawesome/
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { BASE } from './src/urls.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'build', 'site');
const PORT = Number(process.argv[2] ?? 8237);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === BASE) {
      res.writeHead(301, { location: `${BASE}/` }).end();
      return;
    }
    if (!p.startsWith(`${BASE}/`)) {
      res.writeHead(404).end('not found');
      return;
    }
    p = p.slice(BASE.length + 1);
    let file = path.normalize(path.join(SITE, p));
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end();
      return;
    }
    if (p === '' || p.endsWith('/')) file = path.join(file, 'index.html');
    else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      res.writeHead(301, { location: `${url.pathname}/` }).end();
      return;
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`previewing build/site at http://localhost:${PORT}${BASE}/`);
  });
