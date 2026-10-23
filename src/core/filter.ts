// Filters: a search over every shown column, one text per column, and
// filter rules built as in vscode-bases: conditions (column, operator, value)
// in groups that need all, any or none of them to be true.
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

export type Conjunction = "and" | "or" | "not";

export type Operator =
  | "is" | "isNot"
  | "contains" | "notContains"
  | "startsWith" | "endsWith"
  | "isEmpty" | "isNotEmpty"
  | "gt" | "ge" | "lt" | "le"
  | "matches";

export type FilterNode =
  | { kind: "group"; conj: Conjunction; children: FilterNode[] }
  | { kind: "cond"; column: string; op: Operator; value: string };

export type FilterGroup = Extract<FilterNode, { kind: "group" }>;
export type Condition = Extract<FilterNode, { kind: "cond" }>;

export const EMPTY_GROUP: FilterGroup = { kind: "group", conj: "and", children: [] };

export const OPERATORS: { op: Operator; label: string; needsValue: boolean }[] = [
  { op: "is", label: "is", needsValue: true },
  { op: "isNot", label: "is not", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "notContains", label: "does not contain", needsValue: true },
  { op: "startsWith", label: "starts with", needsValue: true },
  { op: "endsWith", label: "ends with", needsValue: true },
  { op: "isEmpty", label: "is empty", needsValue: false },
  { op: "isNotEmpty", label: "is not empty", needsValue: false },
  { op: "gt", label: ">", needsValue: true },
  { op: "ge", label: "≥", needsValue: true },
  { op: "lt", label: "<", needsValue: true },
  { op: "le", label: "≤", needsValue: true },
  { op: "matches", label: "matches regex", needsValue: true },
];

export const CONJUNCTIONS: { conj: Conjunction; label: string }[] = [
  { conj: "and", label: "All the following are true" },
  { conj: "or", label: "Any of the following are true" },
  { conj: "not", label: "None of the following are true" },
];

function needsValue(op: Operator): boolean {
  return OPERATORS.find((o) => o.op === op)?.needsValue ?? true;
}

/** Whether a condition does anything yet: one still waiting for its value does not. */
function active(node: FilterNode): boolean {
  if (node.kind === "group") return node.children.some(active);
  return !needsValue(node.op) || node.value.trim() !== "";
}

/** The conditions that filter, for the count on the button. */
export function countConditions(node: FilterNode): number {
  if (node.kind === "group") return node.children.reduce((n, c) => n + countConditions(c), 0);
  return active(node) ? 1 : 0;
}

/** Numbers as numbers ("1,5" too), dates and other text by text: 2026-01-02 < 2026-10-01. */
function compare(a: string, b: string): number {
  const num = (s: string) => (/^\s*-?\d+([.,]\d+)?\s*$/.test(s) ? Number(s.replace(",", ".")) : NaN);
  const x = num(a);
  const y = num(b);
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base", numeric: true });
}

const regexCache = new Map<string, RegExp | null>();

function regex(source: string): RegExp | null {
  if (!regexCache.has(source)) {
    try {
      regexCache.set(source, new RegExp(source, "i"));
    } catch {
      regexCache.set(source, null);
    }
  }
  return regexCache.get(source)!;
}

export function testCondition(c: Condition, text: string): boolean {
  const t = text.trim().toLowerCase();
  const v = c.value.trim().toLowerCase();
  // An enumeration with many values ("Test, Analysis") is each of them.
  const parts = () => [t, ...t.split(/\s*,\s*/)];
  switch (c.op) {
    case "is": return parts().includes(v);
    case "isNot": return !parts().includes(v);
    case "contains": return t.includes(v);
    case "notContains": return !t.includes(v);
    case "startsWith": return t.startsWith(v);
    case "endsWith": return t.endsWith(v);
    case "isEmpty": return t === "";
    case "isNotEmpty": return t !== "";
    case "gt": return t !== "" && compare(text, c.value) > 0;
    case "ge": return t !== "" && compare(text, c.value) >= 0;
    case "lt": return t !== "" && compare(text, c.value) < 0;
    case "le": return t !== "" && compare(text, c.value) <= 0;
    case "matches": return regex(c.value)?.test(text) ?? false;
  }
}

/** Whether a row passes a filter tree; conditions without a value yet let everything through. */
export function evaluate(node: FilterNode, row: Row, text: (row: Row, column: string) => string): boolean {
  if (node.kind === "cond") return !active(node) || testCondition(node, text(row, node.column));
  const children = node.children.filter(active);
  if (children.length === 0) return true;
  switch (node.conj) {
    case "and": return children.every((c) => evaluate(c, row, text));
    case "or": return children.some((c) => evaluate(c, row, text));
    case "not": return !children.some((c) => evaluate(c, row, text));
  }
}

export interface FilterSpec {
  /** Searched in the shown columns together. */
  query: string;
  /** Filter text per column id. */
  columns: Record<string, string>;
  /** Filter rules, as built in the filter panel. */
  rules?: FilterGroup;
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
  const rules = spec.rules && active(spec.rules) ? spec.rules : undefined;
  if (!search && perColumn.length === 0 && !rules) return { rows, matches: new Set(rows) };

  const matches = new Set<Row>();
  for (const row of rows) {
    if (!perColumn.every(([col, t]) => t(text(row, col)))) continue;
    if (search && !search(shown.map((c) => text(row, c)).join("\n"))) continue;
    if (rules && !evaluate(rules, row, text)) continue;
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
