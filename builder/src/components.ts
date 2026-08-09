/*
 * Interactive-component emitters (activities/projects/exercises whose body
 * is a Runestone or native-widget payload; plans/rehost-bhsawesome.md 3c
 * step 2). Each component emits its article wrapper + heading (part of the
 * prose/numbering fabric) around a payload:
 *
 * - activecode -> the native .bhs-book-exercise widget.
 * - datafile -> fully static display component.
 * - The remaining Runestone kinds emit the byte-compatible payloads their
 *   component JS expects (originally verified against the last PreTeXt
 *   build's output by the retired builder/snap.ts harness).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from './prose.ts';
import { escapeAttr, escapeHtml, h } from './html.ts';
import { blockNumber, elementId, overrideId } from './ids.ts';
import { blockHeadingSpans, dedent, emitBlocks, emitChildren, emitElement, smartQuotes, trimText } from './prose.ts';
import { BASE } from './urls.ts';
import { type XmlElement, attr, child, elements, isElement, textContent } from './xml.ts';

const ASSETS = path.resolve(import.meta.dirname, '..', '..', 'pretext', 'assets');

const TYPE_NAMES: Record<string, string> = {
  activity: 'Activity',
  project: 'Project',
  exercise: 'Activity',
};

const WRAPPER_CLASSES: Record<string, string> = {
  activity: 'activity',
  project: 'project',
  exercise: 'exercise',
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
  );
}

function emitPayload(el: XmlElement, label: string, ctx: Ctx): string {
  const kind = detectKind(el);
  if (kind === 'activecode') {
    // The INTERACTIVE program — a statement may hold display programs too.
    const program = findInteractiveProgram(el);
    if (program) {
      if (program.attributes.interactive === 'codelens') return emitCodelens(el, label, ctx);
      return activecodeContainer(program, label, statementOf(el), ctx);
    }
  }
  if (kind === 'fillin') return emitFillin(el, label, ctx);
  if (kind === 'mcq') return emitMcq(el, label, ctx);
  if (kind === 'shortanswer') return emitShortanswer(el, label, ctx);
  if (kind === 'clickablearea') return emitClickablearea(el, label, ctx);
  if (kind === 'cardsort') return emitCardsort(el, label, ctx);
  if (kind === 'parsons') return emitParsons(el, label, ctx);
  return h('div', { class: 'ptx-runestone-container', 'data-bhs-todo': `${kind}:${label}` }, '');
}

function statementBlocks(el: XmlElement, ctx: Ctx): string {
  const s = statementOf(el);
  return s ? emitBlocks(s, ctx) : '';
}

// -- fill in the blank -------------------------------------------------------
//
// The component's payload is a compiled JSON blob: the rendered statement
// (fillins as <input>s), a blank-name index, and per-blank rule arrays.
// Each blank's rules: an auto "Correct!" check from @answer, one rule per
// source <test> (strcmp -> regex, numcmp -> number range, condition-less ->
// an always-true solution_code), and a default "Incorrect.".

const FILLIN_ELSE_CODE =
  'function() {\n    var testResults = new Array();\n    testResults[0] = 1;\n    return (testResults[0]);\n}()';

function emitFillin(el: XmlElement, label: string, ctx: Ctx): string {
  const statement = statementOf(el);
  const fillins: XmlElement[] = [];
  const collect = (e: XmlElement): void => {
    for (const c of elements(e)) {
      if (c.name === 'fillin') fillins.push(c);
      collect(c);
    }
  };
  if (statement) collect(statement);

  const problemHtml = statement
    ? `\n${elements(statement)
        .map((c) => emitElement(c, ctx))
        .join('\n')}`
    : '';

  // Faithful to PreTeXt: unnamed fillins all default to "blank1", and the
  // emitted JSON keeps the DUPLICATE keys (later entries win at parse).
  const blankNames: [string, number][] = fillins.map((f, i) => [f.attributes.name ?? 'blank1', i]);

  const evaluation = child(el, 'evaluation');
  const evaluates = evaluation ? elements(evaluation, 'evaluate') : [];

  // PreTeXt's id space numbers each evaluate's tests from 2: the implicit
  // @answer check is the phantom first test.
  for (const ev of evaluates) {
    elements(ev, 'test').forEach((test, i) => {
      overrideId(test, `${elementId(ev)}-${i + 2}`);
    });
  }

  type Rule = Record<string, string>;
  const feedbackArray: Rule[][] = fillins.map((f, i) => {
    const answer = f.attributes.answer ?? '';
    const isNumber = f.attributes.mode === 'number';
    const answerRule = (feedback: string): Rule =>
      isNumber
        ? { number: `[${answer},${answer}]`, feedback }
        : { regex: `^\\s*${answer}\\s*$`, regexFlags: '', feedback };
    const rules: Rule[] = [answerRule('Correct!')];
    const ev = evaluates[i];
    for (const test of ev ? elements(ev, 'test') : []) {
      const strcmp = child(test, 'strcmp');
      const numcmp = child(test, 'numcmp');
      const fb = fillinFeedback(child(test, 'feedback'), ctx);
      if (strcmp) {
        const pattern =
          strcmp.attributes['use-answer'] === 'yes' ? answer : textContent(strcmp).trim();
        rules.push({ regex: `^\\s*${pattern}\\s*$`, regexFlags: '', feedback: fb });
      } else if (numcmp) {
        rules.push({ number: `[${answer},${answer}]`, feedback: fb });
      } else {
        rules.push({ solution_code: FILLIN_ELSE_CODE, feedback: fb });
      }
    }
    rules.push({ feedback: 'Incorrect.' });
    return rules;
  });

  // PreTeXt's exact JSON layout: top-level keys on their own lines, rules
  // inline, and "/" escaped as "\/" throughout.
  const js = (v: unknown): string => JSON.stringify(v).replaceAll('/', '\\/');
  // "number" rule values are raw JSON arrays ([5,5]); everything else is a
  // string.
  const ruleJson = (r: Rule): string =>
    `{${Object.entries(r)
      .map(([k, v]) => `"${k}": ${k === 'number' ? v : js(v)}`)
      .join(', ')}}`;
  const json =
    `{\n"problemHtml": ${js(problemHtml)},\n` +
    `"solutionHtml": ${js('')},\n` +
    `"blankNames": {${blankNames.map(([k, v]) => `"${k}": ${v}`).join(', ')}},\n` +
    `"feedbackArray": [${feedbackArray.map((g) => `[${g.map(ruleJson).join(', ')}]`).join(', ')}]\n}`;

  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone' },
      h(
        'div',
        {
          'data-component': 'fillintheblank',
          class: 'fillintheblank',
          style: 'visibility: hidden;',
          id: `rs-${label}`,
        },
        `<script type="application/json">${json}</script>`,
      ),
    ),
  );
}

/** A test's feedback: bare text renders trimmed; paras render as
 * permalink-less paras prefixed with a newline. */
function fillinFeedback(fb: XmlElement | undefined, ctx: Ctx): string {
  if (!fb) return '';
  const paras = elements(fb, 'p');
  if (paras.length === 0) return trimText(emitChildren(fb, ctx)).trim();
  return `\n${paras.map((p) => emitElement(p, ctx)).join('\n')}`;
}

// -- multiple choice ---------------------------------------------------------

function emitMcq(el: XmlElement, label: string, ctx: Ctx): string {
  const choices = findDescendant(el, 'choices');
  const choiceEls = choices ? elements(choices, 'choice') : [];
  const correct = choiceEls.filter((c) => c.attributes.correct === 'yes').length;
  const random = choices?.attributes.randomize === 'yes';
  const items = choiceEls
    .map((choice, i) => {
      const letter = String.fromCharCode(97 + i);
      const st = child(choice, 'statement');
      const fb = child(choice, 'feedback');
      const answer = h(
        'li',
        {
          'data-component': 'answer',
          id: `rs-${label}_opt_${letter}`,
          ...(choice.attributes.correct === 'yes' ? { 'data-correct': '' } : {}),
        },
        st ? emitBlocks(st, ctx) : '',
      );
      const feedback = fb
        ? h(
            'li',
            { 'data-component': 'feedback', id: `rs-${label}_opt_${letter}` },
            emitBlocks(fb, ctx),
          )
        : '';
      return answer + feedback;
    })
    .join('');
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone multiplechoice_section' },
      h('div', { class: 'exercise-statement' }, statementBlocks(el, ctx)),
      h(
        'ul',
        {
          'data-component': 'multiplechoice',
          class: 'exercise-interactives',
          id: `rs-${label}`,
          'data-multipleanswers': correct > 1 ? 'true' : 'false',
          ...(random ? { 'data-random': '' } : {}),
        },
        items,
      ),
    ),
  );
}

// -- short answer ------------------------------------------------------------

const SHORTANSWER_PLACEHOLDER =
  'You can write here, and it will be saved on this device, but your response will not be graded.';

function emitShortanswer(el: XmlElement, label: string, ctx: Ctx): string {
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone shortanswer_section' },
      h(
        'div',
        {
          'data-component': 'shortanswer',
          'data-question_label': '',
          class: 'journal',
          'data-mathjax': '',
          id: `rs-${label}`,
          'data-placeholder': SHORTANSWER_PLACEHOLDER,
        },
        statementBlocks(el, ctx),
      ),
    ),
  );
}

// -- clickable area ----------------------------------------------------------

function emitClickablearea(el: XmlElement, label: string, ctx: Ctx): string {
  const areas = findDescendant(el, 'areas');
  const feedback = child(el, 'feedback');
  // Table form: areas wrapping a table (clickable cells) render the table;
  // <area> inside cells becomes spans via the prose area emitter.
  const tableEl = areas ? (child(areas, 'table') ?? child(areas, 'tabular')) : undefined;
  const lines = areas
    ? elements(areas, 'cline').map((cline) =>
        cline.children
          .map((c) => {
            if (isElement(c) && c.name === 'area') {
              const correct = c.attributes.correct === 'yes';
              return h(
                'span',
                { [correct ? 'data-correct' : 'data-incorrect']: '' },
                escapeHtml(smartQuotes(textContent(c)).trim()),
              );
            }
            return isElement(c) ? escapeHtml(textContent(c)) : escapeHtml((c as { text: string }).text);
          })
          .join(''),
      )
    : [];
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone clickablearea_section' },
      h(
        'div',
        {
          'data-component': 'clickablearea',
          'data-question_label': '',
          style: 'visibility: hidden;',
          id: `rs-${label}`,
        },
        h('span', { 'data-question': '' }, statementBlocks(el, ctx)),
        feedback ? h('span', { 'data-feedback': '' }, emitBlocks(feedback, ctx)) : '',
        tableEl ? emitElement(tableEl, ctx) : h('pre', {}, `${lines.join('\n')}\n`),
      ),
    ),
  );
}

// -- cardsort (dragndrop) ----------------------------------------------------

function emitCardsort(el: XmlElement, label: string, ctx: Ctx): string {
  const cardsort = findDescendant(el, 'cardsort');
  const feedback = child(el, 'feedback');
  const matches = cardsort ? elements(cardsort, 'match') : [];
  const items = matches
    .map((m, i) => {
      const premise = child(m, 'premise');
      const response = child(m, 'response');
      const category = premise?.attributes.order ?? String(i + 1);
      return (
        h(
          'li',
          { 'data-subcomponent': 'draggable', id: `rs-${label}_drag${i + 1}`, 'data-category': category },
          premise ? trimText(emitChildren(premise, ctx)).trim() : '',
        ) +
        h(
          'li',
          { 'data-subcomponent': 'dropzone', for: `rs-${label}_drag${i + 1}`, 'data-category': category },
          response ? trimText(emitChildren(response, ctx)).trim() : '',
        )
      );
    })
    .join('\n');
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone cardsort_section' },
      h(
        'ul',
        {
          'data-component': 'dragndrop',
          'data-question_label': '',
          style: 'visibility: hidden;',
          id: `rs-${label}`,
        },
        h('span', { 'data-subcomponent': 'question' }, statementBlocks(el, ctx)),
        feedback
          ? h('span', { 'data-subcomponent': 'feedback' }, emitBlocks(feedback, ctx))
          : '',
        items,
      ),
    ),
  );
}

// -- parsons (vertical + horizontal) -----------------------------------------

function emitParsons(el: XmlElement, label: string, ctx: Ctx): string {
  const blocks = findDescendant(el, 'blocks');
  if (!blocks) return h('div', { class: 'ptx-runestone-container', 'data-bhs-todo': `parsons:${label}` });
  if (blocks.attributes.layout === 'horizontal') return emitHparsons(el, blocks, label, ctx);

  const chunks: string[] = [];
  for (const block of elements(blocks, 'block')) {
    const choices = elements(block, 'choice');
    if (choices.length) {
      // choice-form: the correct choice, then each wrong one tagged #paired.
      for (const choice of choices) {
        const lines = elements(choice, 'cline').map((c) => textContent(c));
        if (choice.attributes.correct === 'yes') chunks.push(lines.join('\n'));
        else chunks.push(`${lines.join('\n')} #paired`);
      }
    } else {
      const lines = elements(block, 'cline').map((c) => textContent(c));
      if (block.attributes.correct === 'no') chunks.push(`${lines.join('\n')} #distractor`);
      else chunks.push(lines.join('\n'));
    }
  }
  const noindent = el.attributes.indentation === 'show' ? 'true' : 'false';
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone parsons_section', style: 'max-width: none;' },
      h(
        'div',
        { 'data-component': 'parsons', class: 'parsons', id: `rs-${label}` },
        h('div', { class: 'parsons_question parsons-text' }, statementBlocks(el, ctx)),
        h(
          'pre',
          {
            class: 'parsonsblocks',
            'data-question_label': '',
            style: 'visibility: hidden;',
            'data-language': el.attributes.language ?? 'java',
            'data-adaptive': el.attributes.adaptive === 'no' ? 'false' : 'true',
            'data-noindent': noindent,
          },
          escapeHtml(chunks.join('\n---\n')),
        ),
      ),
    ),
  );
}

function emitHparsons(el: XmlElement, blocks: XmlElement, label: string, ctx: Ctx): string {
  const blockEls = elements(blocks, 'block');
  const answerIndices: number[] = [];
  blockEls.forEach((b, i) => {
    if (b.attributes.correct !== 'no') answerIndices.push(i);
  });
  const lines = blockEls.map((b) => trimText(textContent(b)).trim());
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone hparsons_section' },
      h(
        'div',
        { 'data-component': 'hparsons', class: 'hparsons_section', id: `rs-${label}` },
        h('div', { class: 'hp_question' }, statementBlocks(el, ctx)),
        h('div', { class: 'hparsons' }, ''),
        h(
          'textarea',
          {
            style: 'visibility: hidden',
            'data-language': el.attributes.language ?? 'java',
            'data-randomize': 'true',
            'data-reuse': 'false',
            'data-blockanswer': answerIndices.join(' '),
          },
          escapeHtml(`\n--blocks--\n${lines.join('\n')}\n`),
        ),
      ),
    ),
  );
}

// -- embedded codelens -------------------------------------------------------

function emitCodelens(el: XmlElement, label: string, ctx: Ctx): string {
  return h(
    'div',
    { class: 'ptx-runestone-container' },
    h(
      'div',
      { class: 'runestone codelens' },
      h(
        'div',
        { class: 'cd_section', 'data-component': 'codelens', 'data-question_label': '' },
        h('div', { class: 'exercise-statement' }, statementBlocks(el, ctx)),
        `<div class="pytutorVisualizer exercise-interactive" id="rs-${label}" data-params='{"embeddedMode": true, "lang": "java", "jumpToEnd": false}'></div>`,
      ),
      h('script', { src: `${BASE}/generated/trace/${label}.js` }, ' '),
    ),
  );
}

function findInteractiveProgram(el: XmlElement): XmlElement | null {
  for (const c of elements(el)) {
    if (c.name === 'program' && c.attributes.interactive !== undefined) return c;
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
  // Graded is the default; the few ungraded demos carry run-only="yes"
  // (our schema — the tests themselves live in the monorepo's book-tests/,
  // not in the source, since bhsawesome-next-steps.md phase 2).
  const graded = attr(program, 'run-only') !== 'yes';
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
    h('div', { class: 'datafile_caption' }, h('code', {}, `Data: ${filename}`)),
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
