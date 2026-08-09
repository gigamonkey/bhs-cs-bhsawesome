/*
 * The sidebar ToC (PreTeXt's structural markup, generated from the model
 * and inlined per page with the current page's active/contains-active
 * marks, exactly as the theme CSS/JS expect).
 */

import type { Book, Division } from './book.ts';
import { escapeHtml, h } from './html.ts';

export function tocHtml(book: Book, currentPage: string): string {
  const items: string[] = [];
  // Front matter + chapters + back matter, mirroring the landed ToC.
  for (const d of book.divisions.children) {
    items.push(tocItem(d, currentPage));
  }
  items.push(
    h(
      'li',
      { class: `toc-item toc-backmatter${currentPage === 'backmatter.html' ? ' active' : ''}` },
      h(
        'div',
        { class: 'toc-title-box' },
        h('a', { href: 'backmatter.html', class: 'internal' }, h('span', { class: 'title' }, 'Back Matter')),
      ),
      h(
        'ul',
        { id: 'ptx-toc-group-backmatter', class: 'structural toc-item-list' },
        h(
          'li',
          { class: `toc-item toc-index${currentPage === 'book-index.html' ? ' active' : ''}` },
          h(
            'div',
            { class: 'toc-title-box' },
            h('a', { href: 'book-index.html', class: 'internal' }, h('span', { class: 'title' }, 'Index')),
          ),
        ),
        h(
          'li',
          { class: `toc-item toc-colophon${currentPage === 'colophon.html' ? ' active' : ''}` },
          h(
            'div',
            { class: 'toc-title-box' },
            h('a', { href: 'colophon.html', class: 'internal' }, h('span', { class: 'title' }, 'Colophon')),
          ),
        ),
      ),
    ),
  );
  const anyActive = items.some((i) => i.includes(' active') || i.includes('contains-active'));
  return h(
    'ul',
    { class: `structural toc-item-list${anyActive ? ' contains-active' : ''}` },
    items.join('\n'),
  );
}

function containsPage(d: Division, page: string): boolean {
  if (d.page === page) return true;
  return d.children.some((c) => containsPage(c, page));
}

function tocItem(d: Division, currentPage: string): string {
  const active = d.page === currentPage;
  const contains = !active && containsPage(d, currentPage);
  const classes = `toc-item toc-${d.kind}${active ? ' active' : ''}${contains ? ' contains-active' : ''}`;
  const label = [
    d.number ? h('span', { class: 'codenumber' }, escapeHtml(d.number)) : '',
    h('span', { class: 'title' }, escapeHtml(d.title || (d.kind === 'introduction' ? 'Introduction' : d.kind === 'frontmatter' ? 'Front Matter' : d.title))),
  ]
    .filter(Boolean)
    .join(' ');
  const titleBox = h(
    'div',
    { class: 'toc-title-box' },
    h('a', { href: d.page ?? '#', class: 'internal' }, label),
  );
  const childItems = d.children.filter((c) => c.page || c.children.some((g) => g.page));
  // Subsections aren't pages but ARE ToC entries (depth 3): anchors into
  // their section page.
  const subItems: string[] = [];
  for (const c of d.children) {
    if (c.page) subItems.push(tocItem(c, currentPage));
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
              { href: `${d.page}#${c.id}`, class: 'internal' },
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
