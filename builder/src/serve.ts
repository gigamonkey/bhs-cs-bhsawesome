/*
 * Local preview server: serves the built site (config.siteDir) under the
 * book's URL mount with the same directory-URL semantics the website's
 * static mounts give prod (index.html at slashed paths, 301 from
 * unslashed) — needed because the pages' refs are root-relative
 * <base>/... URLs, so a static server rooted at the output dir can't
 * preview them.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { type BookConfig, setConfig } from './config.ts';

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

export function serve(config: BookConfig, port: number): void {
  setConfig(config);
  const SITE = config.siteDir;
  const BASE = config.base;
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
    .listen(port, '0.0.0.0', () => {
      console.log(`previewing ${SITE} at http://localhost:${port}${BASE}/`);
    });
}
