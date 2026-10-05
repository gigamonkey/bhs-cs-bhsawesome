/*
 * A throwaway local HTTP server for a built book, the way the website's
 * static mounts serve it: the site is mounted at config.base (every emitted
 * ref is root-relative to that mount), and /js/<id>.js — the bhs-cs client
 * bundle the chrome loads — comes from a sibling bhs-cs checkout (override
 * with BHS_CS) or, failing that, a stub that just runs the defer-loader.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from './book.ts';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
  '.map': 'application/json', '.jar': 'application/java-archive',
};

// If the built client bundle isn't around, the defer-loader is the only part
// the shots actually need: load the data-bhs-defer-src scripts in order.
const CLIENT_STUB = `(async () => {
  for (const s of document.querySelectorAll('script[data-bhs-defer-src]')) {
    await new Promise((done) => {
      const t = document.createElement('script');
      t.src = s.dataset.bhsDeferSrc;
      t.onload = done;
      t.onerror = done;
      document.head.append(t);
    });
  }
})();`;

/** Start serving config.siteDir at config.base; resolves to { server, base }. */
export function startServer(config) {
  const site = config.siteDir;
  const mount = config.base; // e.g. /bhsawesome
  const clientUrl = `/js/${config.id}.js`;
  const clientJs = path.join(process.env.BHS_CS ?? path.join(ROOT, '..', 'bhs-cs'), 'website', 'public', 'js', `${config.id}.js`);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === clientUrl) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(fs.existsSync(clientJs) ? fs.readFileSync(clientJs) : CLIENT_STUB);
      return;
    }
    const rel = url === mount ? '/' : url.startsWith(`${mount}/`) ? url.slice(mount.length) : url;
    let file = path.join(site, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(site)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
