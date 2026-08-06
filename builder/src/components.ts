/*
 * Interactive-component emitters (activities/projects/exercises whose body
 * is a Runestone or native-widget payload). PROTOTYPE STATE: each component
 * emits its article wrapper + heading (part of the prose/numbering fabric)
 * with a placeholder payload div; the real payload emitters land with the
 * snapshot-test workstream (plans/rehost-bhsawesome.md 3c step 2).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from './prose.ts';
import { h } from './html.ts';

const ASSETS = path.resolve(import.meta.dirname, '..', '..', 'pretext', 'assets');
import { blockNumber, elementId } from './ids.ts';
import { autopermalink, blockHeadingSpans, dedent, emitChildren, emitElement } from './prose.ts';
import { type XmlElement, child, isElement, textContent } from './xml.ts';

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

export function emitComponent(el: XmlElement, ctx: Ctx): string {
  // Standalone <datafile>: fully static — emit the real component.
  if (el.name === 'datafile') return emitDatafile(el);
  // Bare interactive <program> (run-only demo / embedded codelens): the
  // component with no article wrapper or heading.
  if (el.name === 'program') {
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
  const payloadKind = detectKind(el);
  const payload = h(
    'div',
    { class: 'ptx-runestone-container', 'data-bhs-todo': `${payloadKind}:${label}` },
    '',
  );
  // Anything that isn't the component payload itself renders as ordinary
  // prose after it: solution/answer/hint knowls, trailing paragraphs, etc.
  // (The statement renders INSIDE the payload.)
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
    autopermalink(id, typeName),
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
  const content = dedent(raw);
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
