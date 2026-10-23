// XHTML values as plain text, for filters and for the table of contents.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK = /^(p|div|br|li|tr|h[1-6]|ul|ol|table|blockquote|pre)$/i;

/** The text of an XHTML fragment: one line per paragraph, list item or table row. */
export function xhtmlToText(xhtml: string): string {
  const withBreaks = xhtml.replace(/<\/?([\w-]+:)?([\w-]+)[^>]*>/g, (_m, _ns, tag: string) => (BLOCK.test(tag) ? "\n" : tag.toLowerCase() === "td" || tag.toLowerCase() === "th" ? " " : ""));
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/[ \t\r ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** The files XHTML embeds with `<object data="…">`. */
export function objectRefs(xhtml: string): string[] {
  const refs: string[] = [];
  for (const m of xhtml.matchAll(/<(?:[\w-]+:)?object\b[^>]*?\bdata\s*=\s*(["'])(.*?)\1/gi)) refs.push(decodeEntities(m[2]!));
  return refs;
}
