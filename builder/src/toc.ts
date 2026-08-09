/*
 * The sidebar ToC (PreTeXt's structural markup, generated from the model
 * and inlined per page with the current page's active/contains-active
 * marks, exactly as the theme CSS/JS expect).
 */

import type { Book, Division } from './book.ts';
import { escapeHtml, h } from './html.ts';
import { href } from './urls.ts';

export function tocHtml(book: Book): string {
  const items: string[] = [];
  // Front matter + chapters + back matter, mirroring the landed ToC.
  for (const d of book.divisions.children) {
    items.push(tocItem(d));
  }
  items.push(
    h(
      'li',
      { class: 'toc-item toc-backmatter' },
      h(
        'div',
        { class: 'toc-title-box' },
        h('a', { href: href('backmatter'), class: 'internal' }, h('span', { class: 'title' }, 'Back Matter')),
      ),
      h(
        'ul',
        { id: 'ptx-toc-group-backmatter', class: 'structural toc-item-list' },
        h(
          'li',
          { class: 'toc-item toc-index' },
          h(
            'div',
            { class: 'toc-title-box' },
            h('a', { href: href('backmatter/book-index'), class: 'internal' }, h('span', { class: 'title' }, 'Index')),
          ),
        ),
        h(
          'li',
          { class: 'toc-item toc-colophon' },
          h(
            'div',
            { class: 'toc-title-box' },
            h('a', { href: href('backmatter/colophon'), class: 'internal' }, h('span', { class: 'title' }, 'Colophon')),
          ),
        ),
      ),
    ),
  );
  return h('ul', { class: 'structural toc-item-list' }, items.join('\n'));
}

function tocItem(d: Division): string {
  const classes = `toc-item toc-${d.kind}`;
  const label = [
    d.number ? h('span', { class: 'codenumber' }, escapeHtml(d.number)) : '',
    h('span', { class: 'title' }, escapeHtml(d.title || (d.kind === 'introduction' ? 'Introduction' : d.kind === 'frontmatter' ? 'Front Matter' : d.title))),
  ]
    .filter(Boolean)
    .join(' ');
  const titleBox = h(
    'div',
    { class: 'toc-title-box' },
    h('a', { href: d.page !== null ? href(d.page) : '#', class: 'internal' }, label),
  );
  const childItems = d.children.filter((c) => c.page || c.children.some((g) => g.page));
  // Subsections aren't pages but ARE ToC entries (depth 3): anchors into
  // their section page.
  const subItems: string[] = [];
  for (const c of d.children) {
    if (c.page) subItems.push(tocItem(c));
    else if (c.kind === 'subsection') {
      subItems.push(
        h(
          'li',
          { class: 'toc-item toc-subsection' },
          h(
            'div',
            { class: 'toc-title-box' },
            h(
              'a',
              { href: `${href(d.page as string)}#${c.id}`, class: 'internal' },
              [
                c.number ? h('span', { class: 'codenumber' }, escapeHtml(c.number)) : '',
                h('span', { class: 'title' }, escapeHtml(c.title)),
              ]
                .filter(Boolean)
                .join(' '),
            ),
          ),
        ),
      );
    }
  }
  const group =
    subItems.length > 0
      ? h('ul', { id: `ptx-toc-group-${d.id}`, class: 'structural toc-item-list' }, subItems.join('\n'))
      : '';
  return h('li', { class: classes }, titleBox, group);
}

/**
 * The shared ToC as a deferred script (phase 5): injects the one ToC into
 * #ptx-toc and applies the active/contains-active marks client-side from
 * location — all before DOMContentLoaded (defer guarantees it), so
 * pretext-core's chevron/expansion/scroll init works unmodified.
 */
export function tocJs(book: Book): string {
  return `(function () {
  var nav = document.getElementById('ptx-toc');
  if (!nav) return;
  nav.innerHTML = ${JSON.stringify(tocHtml(book))};
  // ToC hrefs are root-relative slashed URLs; normalize the location the
  // same way (a reader can arrive via the unslashed 301's cached form).
  var path = window.location.pathname;
  if (path.charAt(path.length - 1) !== '/') path += '/';
  var link = nav.querySelector('a[href="' + path + '"]');
  if (!link) return;
  var li = link.closest('li');
  li.classList.add('active');
  var p = li.parentElement && li.parentElement.closest('li.toc-item');
  while (p) {
    p.classList.add('contains-active');
    p = p.parentElement && p.parentElement.closest('li.toc-item');
  }
  var root = nav.querySelector('ul.structural');
  if (root) root.classList.add('contains-active');
})();
`;
}
