/*
 * One-shot chrome extraction: take a landed PreTeXt page (build/out — so
 * land.py's transforms are already baked in: deferred runestone bundles,
 * /js/bhsawesome.js, the static activecode CSS link) and turn it into the
 * committed page template builder/chrome.html with slots:
 *
 *   {{TITLE}} {{TOC}} {{TREEBUTTONS}} {{TREEBUTTONS_FOOTER}} {{CONTENT}}
 *
 * This kills PreTeXt's theme machinery while keeping the exact current
 * look; the template is ours to hand-simplify from here. Re-run only if
 * you deliberately want to re-sync with a PreTeXt build.
 *
 *     node builder/extract-chrome.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'build', 'out', 'public', 'bhsawesome', 'variables.html');
const DST = path.join(import.meta.dirname, 'chrome.html');

let html = fs.readFileSync(SRC, 'utf8');

// Title.
html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>{{TITLE}}</title>');

// ToC: empty the nav, keep its shell (depth class normalized).
const tocStart = html.indexOf('<nav id="ptx-toc"');
const tocOpenEnd = html.indexOf('>', tocStart) + 1;
const tocEnd = html.indexOf('</nav>', tocStart);
html =
  html.slice(0, tocStart) +
  '<nav id="ptx-toc" tabindex="-1" aria-label="Contents" class="ptx-toc depth3 focused" data-preexpanded-levels="0" data-max-levels="3">{{TOC}}' +
  html.slice(tocEnd);

// Navbar treebuttons cluster.
const tb = html.indexOf('<span class="treebuttons">');
const tbEnd = html.indexOf('</span>\n</div></nav>', tb);
const tbClose = html.indexOf('</span>', html.indexOf('Next</span>', tb)) ;
// Replace from the opening span through the matching close: find the end of
// the cluster (the next-button anchor's outer close), conservatively the
// first '</span>' after the last '</a>' before '</div></nav>'.
const clusterEnd = html.indexOf('</a></span>', tb) + '</a></span>'.length;
html = `${html.slice(0, tb)}<span class="treebuttons">{{TREEBUTTONS}}</span>${html.slice(clusterEnd)}`;

// Content-footer treebuttons.
const cf = html.indexOf('<div id="ptx-content-footer" class="ptx-content-footer">');
const cfEnd = html.indexOf('</div>', html.indexOf('</a>', html.lastIndexOf('next-button', html.indexOf('</main>'))));
const cfInnerStart = cf + '<div id="ptx-content-footer" class="ptx-content-footer">'.length;
html = `${html.slice(0, cfInnerStart)}\n{{TREEBUTTONS_FOOTER}}\n${html.slice(cfEnd)}`;

// Content region.
const contentStart = html.indexOf('<div id="ptx-content" class="ptx-content">');
const contentInner = contentStart + '<div id="ptx-content" class="ptx-content">'.length;
// The content div closes right before ptx-content-footer.
const footerAt = html.indexOf('<div id="ptx-content-footer"');
const contentClose = html.lastIndexOf('</div>', footerAt);
html = `${html.slice(0, contentInner)}\n{{CONTENT}}\n${html.slice(contentClose)}`;

for (const slot of ['{{TITLE}}', '{{TOC}}', '{{TREEBUTTONS}}', '{{TREEBUTTONS_FOOTER}}', '{{CONTENT}}']) {
  const n = html.split(slot).length - 1;
  if (n !== 1) throw new Error(`slot ${slot} appears ${n} times`);
}

fs.writeFileSync(DST, html);
console.log(`wrote ${DST} (${Math.round(html.length / 1024)}KB)`);
