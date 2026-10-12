/*
 * Slides emitter tests: small decks in, assertions on the emitted HTML.
 * The full parity proof against the Lisp pipeline lived in bhs-cs-content's
 * compare-slides harness during the migration (plans/xml-slides.md); these
 * pin the format's semantics so they survive it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildSlideDeck, deckMeta } from '../src/slides/slides.ts';

function build(xml: string, defaultLanguage?: string, extraFiles?: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-test-'));
  try {
    const deckFile = path.join(dir, 'slides.deck');
    fs.writeFileSync(deckFile, xml);
    for (const [name, content] of Object.entries(extraFiles ?? {})) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    const outFile = path.join(dir, 'out', 'index.html');
    buildSlideDeck({ deckFile, outFile, defaultLanguage });
    return fs.readFileSync(outFile, 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('shell, title slide, leading content', () => {
  const html = build(
    `<deck><title>Big <c>idea</c></title><p>lead</p><slide><title>Two</title></slide></deck>`,
  );
  assert.match(html, /<title>Big idea<\/title>/); // head title: text only
  assert.match(html, /<h1>Big <code>idea<\/code><\/h1>/);
  assert.ok(html.indexOf('<p>lead</p>') < html.indexOf('<h2>Two</h2>'), 'leading content shares the title slide');
  assert.match(html, /Reveal\.initialize/);
  assert.equal(html.match(/<section>/g)?.length, 2);
});

test('fragments: each child, single-list items, table child', () => {
  const html = build(
    `<deck><slide>
       <fragments><p>a</p><p>b</p></fragments>
       <fragments><ul><li>one</li><li>two</li></ul></fragments>
       <fragments><table><tr><td>x</td></tr></table></fragments>
     </slide></deck>`,
  );
  assert.match(html, /<p class='fragment'>a<\/p>/);
  assert.match(html, /<li class='fragment'>one<\/li>/);
  assert.match(html, /<table class='fragment'>/);
  assert.doesNotMatch(html, /<ul class='fragment'>/, 'the items are the fragments, not the list');
});

test('fragment attribute: styles, index, class merge, whole list', () => {
  const html = build(
    `<deck><slide>
       <p fragment="fade-up" findex="2" class="extra">x</p>
       <ul fragment=""><li>whole</li></ul>
     </slide></deck>`,
  );
  assert.match(html, /<p class='fragment fade-up extra' data-fragment-index='2'>x<\/p>/);
  assert.match(html, /<ul class='fragment'>/, 'a whole list can be one fragment');
});

test('code blocks: language inheritance, override, none, de-indent', () => {
  const html = build(
    `<deck><slide>
       <code>a &lt; b</code>
       <code language="sql">SELECT</code>
     </slide>
     <slide language="text">
       <code>plain</code>
       <code language="none">bare</code>
     </slide></deck>`,
    'java',
  );
  assert.match(html, /class='language-java'>a &lt; b<\/code>/);
  assert.match(html, /class='language-sql'>SELECT<\/code>/);
  assert.match(html, /class='language-text'>plain<\/code>/);
  assert.match(html, /<pre><code data-trim='' data-noescape=''>bare<\/code>/);
  const dedent = build(`<deck><slide><code>\n    if (x) {\n      y();\n    }\n  </code></slide></deck>`);
  assert.match(dedent, />if \(x\) \{\n  y\(\);\n\}<\/code>/);
});

test('code blocks: hl markers and linenumbers', () => {
  const html = build(
    `<deck><slide><code>one {{hl:2}}\ntwo {{hl:1}}\nthree {{hl:1,2}}</code></slide></deck>`,
  );
  assert.match(html, /data-line-numbers='\|2,3\|1,3'/);
  assert.doesNotMatch(html, /hl:/, 'markers stripped from the text');
  const ln = build(`<deck><slide><code>a {{linenumbers}}\nb</code></slide></deck>`);
  assert.match(ln, /data-line-numbers=''/);
});

test('repl heading', () => {
  const html = build(`<deck><slide><repl><in>(int) 3.14</in><out>3</out></repl></slide></deck>`);
  assert.match(html, /<h2><div class='repl'>/);
  assert.match(html, /<span class='prompt'>» <\/span><span class='fragment'>\(int\) 3\.14<\/span>/);
  assert.match(html, /<div class='fragment'>3<\/div>/);
});

test('passthrough elements and class=', () => {
  const html = build(
    `<deck><slide>
       <div class="bigcode"><p>big</p></div>
       <p>a <span class="hl">callout</span> and <small>fine print</small></p>
       <img src="/img/x.png"/>
     </slide></deck>`,
  );
  assert.match(html, /<div class='bigcode'>/);
  assert.match(html, /<span class='hl'>callout<\/span>/);
  assert.match(html, /<small>fine print<\/small>/);
  assert.match(html, /<img src='\/img\/x\.png'>/);
});

test('raw html: cdata and src', () => {
  const html = build(
    `<deck><slide><html><![CDATA[<svg id="raw"/>]]></html><p>x <html><![CDATA[<b class=x>y</b>]]></html></p></slide></deck>`,
    undefined,
    {},
  );
  assert.match(html, /<svg id="raw"\/>/);
  assert.match(html, /<p>x <b class=x>y<\/b><\/p>/);
  const fromFile = build(`<deck><slide><html src="chunk.html"/></slide></deck>`, undefined, {
    'chunk.html': '<video controls>',
  });
  assert.match(fromFile, /<video controls>/);
});

test('titles: empty keeps the line box; vocab and math render', () => {
  const html = build(
    `<deck><slide><title/></slide><slide><title>t</title><p><vocab>term</vocab> <m>b \\ne 0</m></p></slide></deck>`,
  );
  assert.match(html, /<h2><empty><\/empty><\/h2>/);
  assert.match(html, /<span class='vocab'>term<\/span>/);
  assert.match(html, /\\\(b \\ne 0\\\)/);
});

test('links: http gets target=_blank, explicit target wins', () => {
  const html = build(
    `<deck><slide><p><a href="https://x.test/">x</a> <a href="/local">l</a> <a href="https://y.test/" target="_self">y</a></p></slide></deck>`,
  );
  assert.match(html, /<a target='_blank' href='https:\/\/x\.test\/'>x<\/a>/);
  assert.match(html, /<a href='\/local'>l<\/a>/);
  assert.match(html, /<a target='_self' href='https:\/\/y\.test\/'>y<\/a>/);
});

test('deckMeta: the <title> is the title; directory-name fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-meta-'));
  try {
    const f = path.join(dir, 'slides.deck');
    fs.writeFileSync(f, `<deck courses="csa csp"><title>Real <c>Title</c></title></deck>`);
    assert.deepEqual(deckMeta(f), { title: 'Real Title', courses: ['csa', 'csp'], grading: 'none' });
    fs.writeFileSync(f, `<deck grading="none"><slide><p>untitled deck</p></slide></deck>`);
    assert.equal(deckMeta(f).title, path.basename(dir));
    assert.deepEqual(deckMeta(f).courses, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deck-local custom.css links relative, only when present', () => {
  const with_ = build(`<deck><slide><p>x</p></slide></deck>`, undefined, { 'custom.css': '.x{}' });
  assert.match(with_, /<link rel='stylesheet' href='custom\.css'>/);
  assert.ok(
    with_.indexOf("href='/reveal/dist/custom.css'") < with_.indexOf("href='custom.css'"),
    'deck stylesheet loads after the shared one',
  );
  const without = build(`<deck><slide><p>x</p></slide></deck>`);
  assert.doesNotMatch(without, /href='custom\.css'/);
});

test('style= lands on modeled elements, slides, and passthrough', () => {
  const html = build(
    `<deck><slide style="background: #123">
       <title style="color: red">T</title>
       <p style="margin-top: 2em">a <c style="color: lime">c</c></p>
       <ul style="columns: 2"><li style="font-weight: bold">i</li></ul>
       <code style="font-size: 50%">x</code>
       <div style="border: 1px solid">d</div>
     </slide></deck>`,
  );
  assert.match(html, /<section class='' style='background: #123'>|<section style='background: #123'>/);
  assert.match(html, /<h2 style='color: red'>T<\/h2>/);
  assert.match(html, /<p style='margin-top: 2em'>a <code style='color: lime'>c<\/code><\/p>/);
  assert.match(html, /<ul style='columns: 2'>/);
  assert.match(html, /<li style='font-weight: bold'>i<\/li>/);
  assert.match(html, /<pre style='font-size: 50%'>/);
  assert.match(html, /<div style='border: 1px solid'>d<\/div>/);
});

test('url: a link to itself', () => {
  const html = build(
    `<deck><slide><p><url>https://example.com/x</url> and <url>ftp://old.example/</url> and <url>\n      https://wrapped.example/by-the-formatter\n    </url></p></slide></deck>`,
  );
  assert.match(html, /<a target='_blank' href='https:\/\/example\.com\/x'>https:\/\/example\.com\/x<\/a>/);
  assert.match(html, /<a target='_blank' href='ftp:\/\/old\.example\/'>ftp:\/\/old\.example\/<\/a>/, 'always _blank, whatever the scheme');
  assert.match(html, /<a target='_blank' href='https:\/\/wrapped\.example\/by-the-formatter'>/);
});

test('f: concise inline fragments', () => {
  const html = build(
    `<deck><slide><p><f>one</f> <f index="3">three</f> <f class="fade-up" style="color: red">styled</f></p></slide></deck>`,
  );
  assert.match(html, /<span class='fragment'>one<\/span>/);
  assert.match(html, /<span class='fragment' data-fragment-index='3'>three<\/span>/);
  assert.match(html, /<span class='fragment fade-up' style='color: red'>styled<\/span>/);
});

test('fragments= xpath: lists, tables, slide-level', () => {
  const html = build(
    `<deck>
       <slide><ul fragments="li"><li>a</li><li findex="1">b</li></ul></slide>
       <slide><table fragments="td"><tr><th>h</th><td>x</td></tr></table></slide>
       <slide><table fragments="tr"><tr><td>y</td></tr></table></slide>
       <slide><table><tr><td>plain</td></tr><tr fragments="td"><td>rowwise</td></tr></table></slide>
       <slide fragments="p"><title>t</title><p>one</p><div><p>nested too</p></div></slide>
     </deck>`,
  );
  assert.match(html, /<li class='fragment'>a<\/li>/);
  assert.match(html, /<li class='fragment' data-fragment-index='1'>b<\/li>/);
  assert.match(html, /<th>h<\/th>/, 'th is not a td');
  assert.match(html, /<td class='fragment'>x<\/td>/);
  assert.match(html, /<tr class='fragment'>/);
  assert.match(html, /<td>plain<\/td>/, 'a row-level expression is scoped to its row');
  assert.match(html, /<td class='fragment'>rowwise<\/td>/, 'fragments= on a <tr> applies to its cells');
  assert.match(html, /<p class='fragment'>one<\/p>/);
  assert.match(html, /<p class='fragment'>nested too<\/p>/, 'bare step is descendant search');
  assert.doesNotMatch(html, /<ul class='fragment'>/);
});

test('fragments= xpath: deck-level expression', () => {
  const html = build(
    `<deck fragments="slide/p"><title>T</title><p>lead</p><slide><title>s</title><p>in slide</p><div><p>nested</p></div></slide></deck>`,
  );
  assert.match(html, /<p class='fragment'>in slide<\/p>/);
  assert.match(html, /<p>lead<\/p>/, 'deck-level leading p is not a slide/p');
  assert.match(html, /<p>nested<\/p>/, 'slide/p is direct children of slide, not descendants');
});

test('fragments= xpath: name-test predicates', () => {
  const html = build(
    `<deck><slide fragments="./*[not(self::title)]"><title>t</title><p>a</p><code>x</code></slide></deck>`,
  );
  assert.match(html, /<h2>t<\/h2>/, 'the title is excluded');
  assert.match(html, /<p class='fragment'>a<\/p>/);
  assert.match(html, /<pre class='fragment'>/);
});

test('fragments= xpath: strict children, predicates, errors', () => {
  const strict = build(
    `<deck><slide><ul fragments="./li"><li><p>top</p><ul><li>nested</li></ul></li></ul></slide></deck>`,
  );
  assert.match(strict, /<li class='fragment'>\n/, 'outer item is a fragment');
  assert.match(strict, /<li>nested<\/li>/, './li does not reach nested items');
  const pred = build(
    `<deck><slide><ul fragments="li[2]"><li>a</li><li>b</li></ul></slide></deck>`,
  );
  assert.match(pred, /<li>a<\/li>/);
  assert.match(pred, /<li class='fragment'>b<\/li>/);
  assert.throws(
    () => build(`<deck><slide><ul fragments="items"><li>a</li></ul></slide></deck>`),
    /matches nothing/,
    'the old alias words are now just non-matching paths',
  );
  assert.throws(
    () => build(`<deck><slide><ul fragments="li[@x]"><li>a</li></ul></slide></deck>`),
    /matches nothing/,
    'a predicate the old subset refused is now just XPath',
  );
});

test('fragments= xpath: full XPath (fontoxpath)', () => {
  // The expression that motivated the switch: on a title-less slide the
  // first paragraph shows at once; with a title every paragraph is a fragment.
  const html = build(
    `<deck fragments="slide/*[not(self::title or (self::p and position() = 1))]">
       <title>T</title>
       <slide><p>lead</p><p>then</p><ul><li>list</li></ul></slide>
       <slide><title>titled</title><p>first</p><p>second</p></slide>
     </deck>`,
  );
  assert.match(html, /<p>lead<\/p>/, 'first paragraph of an untitled slide is not a fragment');
  assert.match(html, /<p class='fragment'>then<\/p>/);
  assert.match(html, /<ul class='fragment'>/);
  assert.match(html, /<h2>titled<\/h2>/);
  assert.match(html, /<p class='fragment'>first<\/p>/, 'with a title, the first paragraph IS a fragment');
  assert.match(html, /<p class='fragment'>second<\/p>/);

  const fancy = build(
    `<deck>
       <slide fragments="./*[position() > 1][not(self::title)]"><title>t</title><p>a</p><p>b</p></slide>
       <slide fragments="p[last()] | ul/li[@class]"><p>x</p><p>y</p><ul><li class="hot">h</li><li>c</li></ul></slide>
       <slide fragments="p[contains(., 'yes')]"><p>yes</p><p>no</p></slide>
     </deck>`,
  );
  assert.match(fancy, /<p class='fragment'>a<\/p>/);
  assert.match(fancy, /<p>x<\/p>/);
  assert.match(fancy, /<p class='fragment'>y<\/p>/, 'last()');
  assert.match(fancy, /<li class='fragment hot'>h<\/li>/, 'union + attribute predicate');
  assert.match(fancy, /<li>c<\/li>/);
  assert.match(fancy, /<p class='fragment'>yes<\/p>/, 'string functions');
  assert.match(fancy, /<p>no<\/p>/);
});

test('fragments= xpath: what is refused', () => {
  const throws = (deck: string, re: RegExp, why: string) => assert.throws(() => build(deck), re, why);
  throws(`<deck><slide fragments="p["><p>a</p></slide></deck>`, /XPST0003/, 'a syntax error names the XPath error');
  throws(`<deck><slide fragments="count(p)"><p>a</p></slide></deck>`, /sequence of Nodes/, 'a non-node result');
  throws(`<deck><slide fragments="text()"><p>a</p>loose</slide></deck>`, /matches a text node/, 'a non-element match');
  throws(`<deck><slide fragments="p/@class"><p class="c">a</p></slide></deck>`, /selects an attribute/, 'attributes are not nodes we hand back');
  throws(
    `<deck><slide><p>other</p></slide><slide fragments="//p"><p>mine</p></slide></deck>`,
    /matches <p> outside the <slide>/,
    '// from a slide reaches the whole deck; .//p is what was meant',
  );
  throws(
    `<deck><slide fragments="/deck/slide/p"><p>a</p></slide><slide><p>b</p></slide></deck>`,
    /matches <p> outside the <slide>/,
    'an absolute path resolves against the whole deck',
  );
});

test('fragment="none" and fragments="none": local opt-outs', () => {
  const html = build(
    `<deck fragments="slide/p">
       <slide><p>frag</p><p fragment="none">not this one</p></slide>
       <slide fragments="none"><p>quiet slide</p></slide>
       <slide><fragments><p>wrapped</p><p fragment="none">opted out</p></fragments></slide>
     </deck>`,
  );
  assert.match(html, /<p class='fragment'>frag<\/p>/);
  assert.match(html, /<p>not this one<\/p>/);
  assert.match(html, /<p>quiet slide<\/p>/, 'fragments="none" clears the inherited set');
  assert.match(html, /<p class='fragment'>wrapped<\/p>/);
  assert.match(html, /<p>opted out<\/p>/, 'opts out of a <fragments> wrapper too');
});
