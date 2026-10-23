// Filters: a search over every shown column, and one text per column.
//
// A filter text is a list of terms; a row matches when it has all of them.
// "two words" in quotes is one term, -term must not occur, and /regex/
// is a regular expression. Case does not matter.

import type { Row } from "./model";

export type Test = (text: string) => boolean;

function terms(query: string): string[] {
  return [...query.matchAll(/-?"[^"]*"|\S+/g)].map((m) => m[0]);
}

/** A test for one filter text; undefined when the text filters nothing. */
export function compile(query: string): Test | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const re = /^\/(.+)\/([a-z]*)$/.exec(q);
  if (re) {
    try {
      const regex = new RegExp(re[1]!, re[2]!.includes("i") ? re[2] : `${re[2]}i`);
      return (s) => regex.test(s);
    } catch {
      // Not a valid expression (yet, while typing): search for the text.
    }
  }
  const tests = terms(q).map((t) => {
    const negate = t.startsWith("-") && t.length > 1;
    const word = (negate ? t.slice(1) : t).replace(/^"(.*)"$/, "$1").toLowerCase();
    return (s: string) => s.toLowerCase().includes(word) !== negate;
  });
  return (s) => tests.every((t) => t(s));
}

export interface FilterSpec {
  /** Searched in the shown columns together. */
  query: string;
  /** Filter text per column id. */
  columns: Record<string, string>;
  /** Keep the chapters and parents of matching rows, for context. */
  context: boolean;
}

export interface Filtered {
  rows: Row[];
  /** The rows that match, as opposed to those kept for context. */
  matches: Set<Row>;
}

/**
 * The rows the filters let through, in their order. `text` gives a row's text
 * in a column; `rows` may span several documents.
 */
export function applyFilter(rows: Row[], shown: string[], spec: FilterSpec, text: (row: Row, column: string) => string): Filtered {
  const search = compile(spec.query);
  const perColumn = Object.entries(spec.columns)
    .map(([col, q]) => [col, compile(q)] as const)
    .filter((x): x is readonly [string, Test] => x[1] !== undefined);
  if (!search && perColumn.length === 0) return { rows, matches: new Set(rows) };

  const matches = new Set<Row>();
  for (const row of rows) {
    if (!perColumn.every(([col, t]) => t(text(row, col)))) continue;
    if (search && !search(shown.map((c) => text(row, c)).join("\n"))) continue;
    matches.add(row);
  }
  if (!spec.context) return { rows: rows.filter((r) => matches.has(r)), matches };

  // The parents of every match, up to the top.
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const keep = new Set<Row>(matches);
  for (const m of matches) {
    let p = m.parent ? byKey.get(m.parent) : undefined;
    while (p && !keep.has(p)) {
      keep.add(p);
      p = p.parent ? byKey.get(p.parent) : undefined;
    }
  }
  return { rows: rows.filter((r) => keep.has(r)), matches };
}
