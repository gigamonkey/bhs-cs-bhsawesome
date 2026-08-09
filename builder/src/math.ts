/*
 * Build-time math rendering (phase 5, CDN elimination): each <m> element's
 * TeX renders ONCE here to a self-contained inline SVG (fontCache local —
 * every glyph's path travels with its svg), so the shipped site has no
 * math runtime at all. Same MathJax engine the CDN script was, run in
 * Node. PreTeXt's macro preamble (\lt \gt \amp) is applied here — the
 * per-page latex-macros div is gone.
 */

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
  // PreTeXt's standard macro preamble (formerly the latex-macros div).
  macros: { lt: '<', gt: '>', amp: '&' },
});
const svg = new SVG({ fontCache: 'local' });
const document = mathjax.document('', { InputJax: tex, OutputJax: svg });

const cache = new Map<string, string>();

/** TeX -> `<mjx-container>` HTML with an inline SVG. */
export function renderMath(texSource: string): string {
  let html = cache.get(texSource);
  if (html === undefined) {
    const node = document.convert(texSource, { display: false });
    html = adaptor.outerHTML(node);
    cache.set(texSource, html);
  }
  return html;
}
