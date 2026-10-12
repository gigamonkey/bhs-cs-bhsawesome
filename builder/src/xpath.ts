/*
 * XPath over the parse-xml tree. fontoxpath (XPath 3.1) walks any tree
 * through an IDomFacade, so instead of re-parsing into a DOM we hand it
 * minimal DOM-shaped stand-ins for @rgrove/parse-xml nodes — nodeType and
 * nodeName, nothing else; the facade does all the walking — and matches
 * come back as the very XmlElements the emitters already hold.
 *
 * Namespaces aren't modelled: every node has a null namespace and a name
 * test matches the element name verbatim, so a prefixed name (xi:include)
 * can't be named in an expression (the prefix would need resolving) — fine
 * for the fragments= use, where the names are the slide vocabulary.
 */

import {
  XmlCdata,
  XmlComment,
  XmlDeclaration,
  XmlDocument,
  XmlDocumentType,
  XmlElement,
  XmlNode,
  XmlProcessingInstruction,
  XmlText,
} from '@rgrove/parse-xml';
import fontoxpath from 'fontoxpath';
import type { IDomFacade } from 'fontoxpath';

const { evaluateXPathToNodes } = fontoxpath;

/** The stand-in fontoxpath sees for one parse-xml node. */
type Shadow = {
  nodeType: number;
  nodeName: string;
  localName: string | null;
  namespaceURI: null;
  prefix: null;
  raw: XmlNode;
};

type AttrShadow = {
  nodeType: 2;
  nodeName: string;
  localName: string;
  name: string;
  value: string;
  namespaceURI: null;
  prefix: null;
};

const shadows = new WeakMap<XmlNode, Shadow>();
const attrShadows = new WeakMap<XmlElement, AttrShadow[]>();

function shadow(raw: XmlNode): Shadow {
  let s = shadows.get(raw);
  if (s) return s;
  if (raw instanceof XmlElement) {
    s = { nodeType: 1, nodeName: raw.name, localName: raw.name, namespaceURI: null, prefix: null, raw };
  } else if (raw instanceof XmlText) {
    s = { nodeType: 3, nodeName: '#text', localName: null, namespaceURI: null, prefix: null, raw };
  } else if (raw instanceof XmlCdata) {
    s = { nodeType: 4, nodeName: '#cdata-section', localName: null, namespaceURI: null, prefix: null, raw };
  } else if (raw instanceof XmlProcessingInstruction) {
    s = { nodeType: 7, nodeName: raw.name, localName: raw.name, namespaceURI: null, prefix: null, raw };
  } else if (raw instanceof XmlComment) {
    s = { nodeType: 8, nodeName: '#comment', localName: null, namespaceURI: null, prefix: null, raw };
  } else if (raw instanceof XmlDocument) {
    s = { nodeType: 9, nodeName: '#document', localName: null, namespaceURI: null, prefix: null, raw };
  } else {
    throw new Error(`xpath: unexpected parse-xml node type ${raw.type}`);
  }
  shadows.set(raw, s);
  return s;
}

// The XML declaration and doctype have no DOM node; the tree shown to
// fontoxpath skips them.
function children(s: Shadow): Shadow[] {
  const raw = s.raw;
  if (!(raw instanceof XmlElement || raw instanceof XmlDocument)) return [];
  return (raw.children as XmlNode[])
    .filter((c) => !(c instanceof XmlDeclaration || c instanceof XmlDocumentType))
    .map(shadow);
}

function attributes(s: Shadow): AttrShadow[] {
  if (!(s.raw instanceof XmlElement)) return [];
  let attrs = attrShadows.get(s.raw);
  if (!attrs) {
    attrs = Object.entries(s.raw.attributes).map(([name, value]) => ({
      nodeType: 2,
      nodeName: name,
      localName: name,
      name,
      value,
      namespaceURI: null,
      prefix: null,
    }));
    attrShadows.set(s.raw, attrs);
  }
  return attrs;
}

function parent(s: Shadow): Shadow | null {
  const p = s.raw.parent;
  return p ? shadow(p) : null;
}

function sibling(s: Shadow, offset: number): Shadow | null {
  const p = parent(s);
  if (!p) return null;
  const kids = children(p);
  return kids[kids.indexOf(s) + offset] ?? null;
}

// fontoxpath's facade is typed against the DOM's Node/Element/Attr; the
// shadows are structurally what it reads, so the casts are at the seam.
const facade = {
  getAllAttributes: (node: unknown) => attributes(node as Shadow),
  getAttribute: (node: unknown, name: string) => {
    const raw = (node as Shadow).raw;
    return raw instanceof XmlElement ? (raw.attributes[name] ?? null) : null;
  },
  getChildNodes: (node: unknown) => children(node as Shadow),
  getData: (node: unknown) => {
    const n = node as Shadow | AttrShadow;
    if (n.nodeType === 2) return (n as AttrShadow).value;
    const raw = (n as Shadow).raw;
    if (raw instanceof XmlText || raw instanceof XmlCdata) return raw.text;
    if (raw instanceof XmlComment || raw instanceof XmlProcessingInstruction) return raw.content;
    return '';
  },
  getFirstChild: (node: unknown) => children(node as Shadow)[0] ?? null,
  getLastChild: (node: unknown) => children(node as Shadow).at(-1) ?? null,
  getNextSibling: (node: unknown) => sibling(node as Shadow, 1),
  getParentNode: (node: unknown) => parent(node as Shadow),
  getPreviousSibling: (node: unknown) => sibling(node as Shadow, -1),
} as unknown as IDomFacade;

/**
 * Evaluate `expr` with `context` as the context node and return the
 * matched nodes in document order. The expression must select nodes
 * (`count(p)` is an error, as is a syntax error); an absolute path resolves
 * against the document the context sits in.
 */
export function selectNodes(expr: string, context: XmlNode): XmlNode[] {
  const nodes = evaluateXPathToNodes(expr, shadow(context) as unknown as Node, facade);
  return nodes.map((n) => {
    const s = n as unknown as Shadow | AttrShadow;
    // parse-xml has no attribute nodes to hand back.
    if (s.nodeType === 2) throw new Error(`XPath ${expr} selects an attribute (@${s.nodeName}), not a node of the tree`);
    return (s as Shadow).raw;
  });
}

/** Is `node` `ancestor` itself or inside it? */
export function within(node: XmlNode, ancestor: XmlNode): boolean {
  for (let n: XmlNode | null = node; n; n = n.parent) {
    if (n === ancestor) return true;
  }
  return false;
}
