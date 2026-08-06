/*
 * XML loading for the bespoke book build (the monorepo's
 * plans/rehost-bhsawesome.md phase 3): parse the formatter-canonical ptx
 * source with @rgrove/parse-xml and assemble the xi:include tree ourselves.
 * Every element remembers its source file (error messages now; per-page
 * incremental rebuilds later).
 */

import fs from 'node:fs';
import path from 'node:path';
import { XmlCdata, XmlElement, XmlText, parseXml } from '@rgrove/parse-xml';

export type { XmlElement };

const XI_INCLUDE = 'xi:include';

// element -> absolute source file it was parsed from (includes splice
// subtrees, so a node's file is the one to re-read when it changes).
const sourceFiles = new WeakMap<XmlElement, string>();

export function sourceFile(el: XmlElement): string | undefined {
  return sourceFiles.get(el);
}

function recordSource(el: XmlElement, file: string): void {
  sourceFiles.set(el, file);
  for (const child of el.children) {
    if (child instanceof XmlElement) recordSource(child, file);
  }
}

/** Parse `file` and resolve xi:includes recursively. Returns the root. */
export function loadXml(file: string): XmlElement {
  const abs = path.resolve(file);
  let doc: ReturnType<typeof parseXml>;
  try {
    doc = parseXml(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`${abs}: ${e instanceof Error ? e.message : e}`);
  }
  const root = doc.root;
  if (!root) throw new Error(`${abs}: no root element`);
  recordSource(root, abs);
  resolveIncludes(root, path.dirname(abs));
  return root;
}

function resolveIncludes(el: XmlElement, baseDir: string): void {
  const out: typeof el.children = [];
  for (const child of el.children) {
    if (child instanceof XmlElement && child.name === XI_INCLUDE) {
      const href = child.attributes.href;
      if (!href) throw new Error(`xi:include without href in ${sourceFile(el)}`);
      const target = path.resolve(baseDir, href);
      if (child.attributes.parse === 'text') {
        const text = new XmlText(fs.readFileSync(target, 'utf8'));
        text.parent = el;
        out.push(text);
      } else {
        const included = loadXml(target);
        included.parent = el;
        out.push(included);
      }
    } else {
      if (child instanceof XmlElement) resolveIncludes(child, baseDir);
      out.push(child);
    }
  }
  el.children.splice(0, el.children.length, ...out);
}

// -- Node helpers ------------------------------------------------------------

export function elements(el: XmlElement, name?: string): XmlElement[] {
  return el.children.filter(
    (c): c is XmlElement => c instanceof XmlElement && (name === undefined || c.name === name),
  );
}

export function child(el: XmlElement, name: string): XmlElement | undefined {
  return elements(el, name)[0];
}

export function attr(el: XmlElement, name: string): string | undefined {
  return el.attributes[name];
}

export function xmlId(el: XmlElement): string | undefined {
  return el.attributes['xml:id'];
}

/** Deep text content (text + cdata), untrimmed. */
export function textContent(node: XmlElement): string {
  let out = '';
  for (const c of node.children) {
    if (c instanceof XmlText || c instanceof XmlCdata) out += c.text;
    else if (c instanceof XmlElement) out += textContent(c);
  }
  return out;
}

export function isElement(node: unknown): node is XmlElement {
  return node instanceof XmlElement;
}

export function isText(node: unknown): node is XmlText | XmlCdata {
  return node instanceof XmlText || node instanceof XmlCdata;
}
