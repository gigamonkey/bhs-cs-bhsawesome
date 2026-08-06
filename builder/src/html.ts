/* Tiny HTML emission helpers for the bespoke build. */

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', '&quot;');
}

export type Attrs = Record<string, string | undefined>;

/** `<tag a="b">children</tag>`; attributes with undefined values are omitted. */
export function h(tag: string, attrs: Attrs, ...children: string[]): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeAttr(v as string)}"`)
    .join('');
  return `<${tag}${a}>${children.join('')}</${tag}>`;
}

export function voidEl(tag: string, attrs: Attrs): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeAttr(v as string)}"`)
    .join('');
  return `<${tag}${a}>`;
}
