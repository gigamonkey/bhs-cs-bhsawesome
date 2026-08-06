/*
 * Interactive-component emitters (activities/projects/exercises whose body
 * is a Runestone or native-widget payload; plans/rehost-bhsawesome.md 3c
 * step 2). Each component emits its article wrapper + heading (part of the
 * prose/numbering fabric) around a payload:
 *
 * - activecode -> the native .bhs-book-exercise widget (the same markup
 *   land.py's convert_exercises rewrites into the PreTeXt pages today).
 * - datafile -> fully static display component.
 * - The remaining Runestone kinds emit byte-compatible payloads one type
 *   at a time (builder/snap.ts verifies against the landed truth);
 *   unconverted kinds still emit a data-bhs-todo placeholder.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from './prose.ts';
import { escapeAttr, escapeHtml, h } from './html.ts';
import { blockNumber, elementId } from './ids.ts';
import { autopermalink, blockHeadingSpans, dedent, emitBlocks, emitChildren, emitElement } from './prose.ts';
import { type XmlElement, child, elements, isElement, textContent } from './xml.ts';

const ASSETS = path.resolve(import.meta.dirname, '..', '..', 'pretext', 'assets');

const TYPE_NAMES: Record<string, string> = {
  activity: 'Activity',
  project: 'Project',
  exercise: 'Activity',
};

const WRAPPER_CLASSES: Record<string, string> = {
  activity: 'activity project-like',
  project: 'project project-like',
  exercise: 'exercise exercise-like',
};

// Elements that ARE the payload; everything else in an activity renders as
// ordinary prose after it (solution knowls, trailing paragraphs, ...).
const PAYLOAD = new Set([
  'title',
  'statement',
  'program',
  'choices',
  'blocks',
  'areas',
  'cardsort',
  'fillin',
  'matches',
  'response',
  'datafile',
  'tests',
  'stdin',
  'feedback',
  'evaluation',
]);

export function emitComponent(el: XmlElement, ctx: Ctx): string {
  // Standalone <datafile>: fully static — emit the real component.
  if (el.name === 'datafile') return emitDatafile(el);
  // Bare interactive <program> (run-only demo / embedded codelens): the
  // component with no article wrapper or heading.
  if (el.name === 'program') {
    if (el.attributes.interactive === 'activecode') {
      return activecodeContainer(el, el.attributes.label ?? elementId(el), null, ctx);
    }
    return h('div', {
      class: 'ptx-runestone-container',
      'data-bhs-todo': `${el.attributes.interactive}:${el.attributes.label ?? ''}`,
    });
  }
  const id = elementId(el);
  const number = blockNumber(el);
  const label = el.attributes.label ?? id;
  const typeName = TYPE_NAMES[el.name] ?? 'Activity';
  const titleEl = child(el, 'title');
  const title = titleEl ? emitChildren(titleEl, ctx).replace(/\s+/g, ' ').trim() : null;
  const heading = h(
    `h${Math.min(6, ctx.headingLevel + 1)}`,
    { class: 'heading' },
    blockHeadingSpans(typeName, number ?? null, title),
  );

  const payload = emitPayload(el, label, ctx);

  const extras = el.children
    .filter((c): c is XmlElement => isElement(c) && !PAYLOAD.has(c.name))
    .map((c) => emitElement(c, ctx))
    .join('');
  return h(
    'article',
    { class: WRAPPER_CLASSES[el.name] ?? WRAPPER_CLASSES.activity, id },
    heading,
    payload,
    extras,
    autopermalink(id, number ? `${typeName} ${number}` : typeName),
  );
}

function emitPayload(el: XmlElement, label: string, ctx: Ctx): string {
  const kind = detectKind(el);
  if (kind === 'activecode') {
    // The INTERACTIVE program — a statement may hold display programs too.
    const program = findInteractiveProgram(el);
    if (program) return activecodeContainer(program, label, statementOf(el), ctx);
  }
  return h('div', { class: 'ptx-runestone-container', 'data-bhs-todo': `${kind}:${label}` }, '');
}

function findInteractiveProgram(el: XmlElement): XmlElement | null {
  for (const c of elements(el)) {
    if (c.name === 'program' && c.attributes.interactive === 'activecode') return c;
    const found = findInteractiveProgram(c);
    if (found) return found;
  }
  return null;
}

function statementOf(el: XmlElement): XmlElement | null {
  return child(el, 'statement') ?? null;
}

function findDescendant(el: XmlElement, name: string): XmlElement | null {
  for (const c of elements(el)) {
    if (c.name === name) return c;
    const found = findDescendant(c, name);
    if (found) return found;
  }
  return null;
}

// -- activecode: the native widget -------------------------------------------
//
// Exactly the markup land.py's convert_exercises produces today, so the
// client widget (client-js book-exercise.ts), exercises.json, and the
// book grid see no change at the build swap: runestone/ac_section shell
// classes (the shipped Runestone + theme CSS style them, including the
// wider-than-prose layout), the statement as the ac_question div, the
// starter in a hidden textarea, data-testclass book:<label> (graded) or
// book-run:<label> (no <tests>), data-stdin carrying the canned input.

function activecodeContainer(
  program: XmlElement,
  label: string,
  statement: XmlElement | null,
  ctx: Ctx,
): string {
  const code = child(program, 'code');
  const starter = dedent(textContent(code ?? program));
  const graded = child(program, 'tests') !== undefined;
  const stdinEl = child(program, 'stdin');
  const stdin = stdinEl ? `${dedent(textContent(stdinEl))}\n` : undefined;
  // The interactive program can live inside the statement; don't render it
  // twice (the widget carries it as the starter).
  const statementHtml = statement
    ? h(
        'div',
        { class: 'ac_question exercise-statement', id: `rs-${label}_question` },
        statement.children
          .filter((c): c is XmlElement => isElement(c) && c !== program)
          .map((c) => emitElement(c, ctx))
          .join(''),
      )
    : '';
  return (
    `<div class="ptx-runestone-container"><div class="runestone explainer ac_section">` +
    `<div class="bhs-book-exercise" id="rs-${escapeAttr(label)}" data-testclass="${graded ? 'book:' : 'book-run:'}${escapeAttr(label)}"${
      stdin !== undefined ? ` data-stdin="${escapeAttr(stdin)}"` : ''
    }>` +
    `${statementHtml}<textarea class="bhs-book-starter" hidden>${escapeHtml(starter)}</textarea>` +
    `</div></div></div>`
  );
}

function emitDatafile(el: XmlElement): string {
  const filename = el.attributes.filename ?? '';
  const label = el.attributes.label ?? filename;
  const hidden = el.attributes.hide === 'yes';
  const pre = child(el, 'pre');
  // A datafile's <pre> either contains its text (possibly via xi:include,
  // already assembled) or points at an asset file with @source.
  let raw = textContent(pre ?? el);
  if (pre?.attributes.source) {
    raw = fs.readFileSync(path.join(ASSETS, pre.attributes.source), 'utf8');
  }
  const content = `${dedent(raw)}\n`;
  return h(
    'div',
    { class: 'runestone datafile' },
    h('div', { class: 'datafile_caption' }, h('code', { class: 'code-inline tex2jax_ignore' }, `Data: ${filename}`)),
    h(
      'pre',
      {
        id: `rs-${label}`,
        'data-component': 'datafile',
        'data-filename': filename,
        'data-edit': el.attributes.editable === 'yes' ? 'true' : 'false',
        ...(hidden ? { 'data-hidden': '' } : {}),
        'data-rows': '20',
        'data-cols': '60',
      },
      content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    ),
  );
}

function detectKind(el: XmlElement): string {
  const find = (e: XmlElement, names: string[]): boolean =>
    e.children.some((c) => isElement(c) && (names.includes(c.name) || find(c, names)));
  if (find(el, ['blocks'])) return 'parsons';
  if (find(el, ['choices'])) return 'mcq';
  if (find(el, ['areas'])) return 'clickablearea';
  if (find(el, ['cardsort', 'matches'])) return 'cardsort';
  if (find(el, ['fillin'])) return 'fillin';
  if (find(el, ['program'])) return 'activecode';
  if (find(el, ['response'])) return 'shortanswer';
  if (find(el, ['datafile'])) return 'datafile';
  return 'unknown';
}
