/*
 * BHSawesome's shot list for scripts/shoot.mjs: one entry per (page, state).
 * Pages are URL paths under the book's base (the directory-URLs scheme);
 * names are stable — compare.mjs matches on them. The set was chosen so
 * every class vocabulary the CSS touches is covered, including the
 * JS-injected states (dark mode, open knowl, search results, the
 * readability dialog, exposed permalinks).
 */

export const SHOTS = [
  // Vocabulary coverage, default state:
  { name: 'variables', page: 'primitive-types-and-variables/variables/' }, // prose, fillin
  { name: 'boolean-manipulation', page: 'booleans-and-conditionals/boolean-manipulation/' }, // tabular-heavy
  { name: 'array-traversal', page: 'arrays/array-traversal/' }, // gutterimage/sidebyside, datafile, MCQ, activecode
  { name: 'for-loops', page: 'loops/for-loops/' }, // parsons
  { name: 'intro-to-java', page: 'introduction/intro-to-java/' }, // hparsons
  { name: 'assignment-statements', page: 'primitive-types-and-variables/assignment-statements/' }, // codelens
  { name: 'frq-practice', page: 'ap-practice/frq-practice/' }, // clickable-area, short-answer, FRQ styling
  { name: 'arraylist-summary', page: 'array-lists/arraylist-summary/' }, // cardsort, MCQ
  { name: 'abstraction', page: 'abstraction-and-program-design/abstraction/' }, // journal/short-answer, book exercises
  { name: 'classes-chapter', page: 'classes/' }, // chapter summary page
  { name: 'frontmatter', page: '' }, // title/contents page
  { name: 'book-index', page: 'backmatter/book-index/' }, // index backmatter
  { name: 'colophon', page: 'backmatter/colophon/' },
  { name: 'knowl-page', page: 'knowl/xref/complex-loop-trace-table.html' }, // bare knowl content

  // JS-injected states:
  { name: 'variables-dark', page: 'primitive-types-and-variables/variables/', action: 'dark' },
  { name: 'arraylist-summary-dark', page: 'array-lists/arraylist-summary/', action: 'dark' },
  { name: 'frq-practice-dark', page: 'ap-practice/frq-practice/', action: 'dark' },
  { name: 'boolean-manipulation-dark', page: 'booleans-and-conditionals/boolean-manipulation/', action: 'dark' },
  { name: 'if-traps-knowl-open', page: 'booleans-and-conditionals/if-traps/', action: 'knowl' },
  { name: 'variables-search', page: 'primitive-types-and-variables/variables/', action: 'search' },
  { name: 'variables-readability', page: 'primitive-types-and-variables/variables/', action: 'readability' },
  { name: 'variables-permalinks', page: 'primitive-types-and-variables/variables/', action: 'permalinks' },
];
