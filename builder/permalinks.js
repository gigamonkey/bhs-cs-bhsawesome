/*
 * Client-side autopermalinks (the css-cleanup's step 9): the build no
 * longer emits the ~5,500 permalink anchors; this script injects the
 * same DOM at load, before DOMContentLoaded (it's a defer script, like
 * toc.js), so pretext-core's copy-to-clipboard and expose-permalinks
 * machinery finds exactly the structure it expects:
 *
 *   <span|div class="autopermalink" aria-hidden="true" data-description="D">
 *     <a tabindex="-1" href="#id" title="Copy heading and permalink for D"
 *        aria-label="Copy heading and permalink for D">🔗</a></span>
 *
 * Descriptions derive from DOM the pages already carry — heading and
 * figcaption spans, list positions. A MutationObserver re-runs the
 * injection for content pretext-core inserts later (opened xref knowls).
 * Excluded, matching the emitters' old permalinks=false contexts:
 * rs-*-id elements (component identity — MCQ options, drag cards) and
 * anything inside a component's answer/feedback bodies. Component
 * STATEMENTS keep their paragraph permalinks, as they always had.
 */
(() => {
  const collapse = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const noDot = (s) => collapse(s).replace(/\.$/, "");

  const SECTION_TYPES = {
    section: "Section",
    subsection: "Subsection",
    introduction: "Introduction",
    preface: "Preface",
  };

  // Owner element -> description, or null for "no permalink here".
  function describe(el) {
    const tag = el.tagName;
    if (tag === "P") return "Paragraph";
    if (tag === "LI") {
      const parent = el.parentElement;
      if (parent && parent.tagName === "OL") {
        const items = [...parent.children].filter((c) => c.tagName === "LI");
        return `Item ${items.indexOf(el) + 1}`;
      }
      return "Item";
    }
    if (tag === "FIGURE") {
      const cap = el.querySelector(":scope > figcaption");
      if (!cap) return null;
      const type = collapse(cap.querySelector(".type")?.textContent) || "Figure";
      const num = noDot(cap.querySelector(".codenumber")?.textContent);
      return num ? `${type} ${num}` : type;
    }
    const heading = el.querySelector(":scope > .heading");
    if (!heading) return null;
    const num = collapse(heading.querySelector(".codenumber")?.textContent);
    if (tag === "ARTICLE") {
      const type = collapse(heading.querySelector(".type")?.textContent);
      return num ? `${type} ${num}` : type;
    }
    // Section divisions: titled headings carry no type span (hide-type
    // dissolved), so the type comes from the division's class.
    if (el.classList.contains("frontmatter")) return "Front Matter";
    const type =
      SECTION_TYPES[[...el.classList].find((c) => SECTION_TYPES[c])] ??
      collapse(heading.querySelector(".type")?.textContent);
    const title = collapse(heading.querySelector(".title")?.textContent);
    return num ? `${type} ${num}${title ? `: ${title}` : ""}` : title || type;
  }

  function anchor(kind, id, description) {
    const wrap = document.createElement(kind);
    wrap.className = "autopermalink";
    wrap.setAttribute("aria-hidden", "true");
    wrap.setAttribute("data-description", description);
    const a = document.createElement("a");
    a.tabIndex = -1;
    a.href = `#${id}`;
    a.title = `Copy heading and permalink for ${description}`;
    a.setAttribute("aria-label", a.title);
    a.textContent = "🔗";
    wrap.append(a);
    return wrap;
  }

  const TARGETS =
    'p[id], li[id], figure[id], article[id], section[id]:not(.book):not(.chapter):not(.colophon):not(.backmatter)';

  const EXCLUDED_CONTEXTS =
    '[data-component="answer"], [data-component="feedback"], [data-feedback], [data-subcomponent="feedback"]';

  function injectOne(el) {
    if (el.id.startsWith("p-derived-") || el.id.startsWith("rs-")) return;
    if (el.closest(EXCLUDED_CONTEXTS)) return;
    // A component's embedded display figure (the clickable-area tables,
    // direct children of the widget) never had a permalink — but figures
    // inside a statement ([data-question]) did and still do.
    if (
      el.tagName === "FIGURE" &&
      el.closest("[data-component]") &&
      !el.closest('[data-question], [data-subcomponent="question"]')
    ) {
      return;
    }
    const into = el.tagName === "FIGURE" ? el.querySelector(":scope > figcaption") : el;
    if (!into || into.querySelector(":scope > .autopermalink")) return;
    const description = describe(el);
    if (!description) return;
    into.append(anchor(el.tagName === "SECTION" ? "div" : "span", el.id, description));
  }

  function inject(root) {
    if (root.matches?.(TARGETS)) injectOne(root);
    for (const el of root.querySelectorAll?.(TARGETS) ?? []) injectOne(el);
  }

  inject(document.body);

  // Content inserted after load (pretext-core's fetched xref knowls).
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !n.classList.contains("autopermalink")) inject(n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
