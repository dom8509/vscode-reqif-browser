// Compares two ReqIF files: which requirements were added, removed, changed
// or moved to another chapter, and which attributes changed.
//
// Requirements are matched by their ReqIF identifier, or by ReqIF.ForeignID
// when the identifiers differ (some tools give new ones on every export).

import { MAIN, mainCell, type Cell, type ReqifDoc, type Row } from "./model";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffSide {
  /** The document the row is in. */
  doc: string;
  number: string;
  depth: number;
  heading: boolean;
  id: string;
  /** Attribute values by name, and the main column under MAIN. */
  cells: Record<string, Cell>;
  /** The title of the chapter the row is in, for "moved". */
  chapter: string;
}

export interface DiffRow {
  status: DiffStatus;
  /** In another chapter (another parent) than before. */
  moved: boolean;
  /** The key the two rows were matched by. */
  key: string;
  left?: DiffSide;
  right?: DiffSide;
  /** The attributes whose text changed. */
  changes: string[];
}

export interface DiffResult {
  /** What requirements were matched by. */
  matchedBy: "identifier" | "ReqIF.ForeignID";
  /** Every attribute name either file has, in the right file's order first. */
  columns: string[];
  rows: DiffRow[];
  counts: Record<DiffStatus | "moved", number>;
}

const FOREIGN_ID = "ReqIF.ForeignID";

interface Entry {
  row: Row;
  doc: ReqifDoc;
  key: string;
}

/** Rows in reading order, each with the key it is matched by; a key seen twice gets "#2", "#3". */
function entries(docs: ReqifDoc[], keyOf: (r: Row) => string): Entry[] {
  const seen = new Map<string, number>();
  const out: Entry[] = [];
  for (const doc of docs) {
    for (const row of doc.rows) {
      const base = keyOf(row) || `row:${row.key}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push({ row, doc, key: n === 1 ? base : `${base}#${n}` });
    }
  }
  return out;
}

/** Identifiers, unless ForeignIDs match more rows of the two files. */
function chooseKey(left: ReqifDoc[], right: ReqifDoc[]): DiffResult["matchedBy"] {
  const overlap = (keyOf: (r: Row) => string) => {
    const l = new Set(left.flatMap((d) => d.rows.map(keyOf)).filter(Boolean));
    return right.flatMap((d) => d.rows.map(keyOf)).filter((k) => k && l.has(k)).length;
  };
  return overlap((r) => r.cells[FOREIGN_ID]?.text.trim() ?? "") > overlap((r) => r.id) ? FOREIGN_ID : "identifier";
}

function side(e: Entry, byRowKey: Map<string, Entry>): DiffSide {
  const cells: Record<string, Cell> = { ...e.row.cells };
  const main = mainCell(e.row, e.doc);
  if (main) cells[MAIN] = main;
  const chapter = e.row.chapter && e.row.chapter !== e.row.key ? byRowKey.get(e.row.chapter)?.row : undefined;
  return {
    doc: e.doc.title,
    number: e.row.number,
    depth: e.row.depth,
    heading: e.row.heading,
    id: e.row.id,
    cells,
    chapter: chapter ? `${chapter.number} ${chapter.title}` : "",
  };
}

export function compareFiles(left: ReqifDoc[], right: ReqifDoc[]): DiffResult {
  const matchedBy = chooseKey(left, right);
  // Chapters seldom have a ForeignID: they are matched by identifier.
  const keyOf = matchedBy === FOREIGN_ID ? (r: Row) => r.cells[FOREIGN_ID]?.text.trim() || (r.id && `id:${r.id}`) : (r: Row) => r.id;
  const l = entries(left, keyOf);
  const r = entries(right, keyOf);
  const lByKey = new Map(l.map((e, i) => [e.key, i]));
  const rKeys = new Set(r.map((e) => e.key));
  const lByRow = new Map(l.map((e) => [e.row.key, e]));
  const rByRow = new Map(r.map((e) => [e.row.key, e]));
  const parentKey = (e: Entry, byRow: Map<string, Entry>) => (e.row.parent ? byRow.get(e.row.parent)?.key ?? "" : "");

  const columns: string[] = [];
  const seenColumn = new Set<string>();
  for (const d of [...right, ...left]) {
    for (const c of d.columns) {
      if (c.id.startsWith("@") || seenColumn.has(c.id)) continue;
      seenColumn.add(c.id);
      columns.push(c.id);
    }
  }

  const rows: DiffRow[] = [];
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0, moved: 0 };
  const done = new Set<number>();
  const push = (row: DiffRow) => {
    rows.push(row);
    counts[row.status]++;
    if (row.moved) counts.moved++;
  };
  const removed = (i: number) => {
    done.add(i);
    const e = l[i]!;
    push({ status: "removed", moved: false, key: e.key, left: side(e, lByRow), changes: [] });
  };

  // The right file's order; a removed row shows where it stood, before the next row both files have.
  let next = 0;
  for (const e of r) {
    const li = lByKey.get(e.key);
    if (li === undefined) {
      // Rows removed right after the last row both files have stand before what was added there.
      for (; next < l.length && !done.has(next) && !rKeys.has(l[next]!.key); next++) removed(next);
      push({ status: "added", moved: false, key: e.key, right: side(e, rByRow), changes: [] });
      continue;
    }
    for (; next < li; next++) if (!done.has(next) && !rKeys.has(l[next]!.key)) removed(next);
    next = Math.max(next, li + 1);
    done.add(li);
    const old = l[li]!;
    const changes = columns.filter((c) => (old.row.cells[c]?.text ?? "") !== (e.row.cells[c]?.text ?? ""));
    if (old.row.heading && e.row.heading && old.row.title !== e.row.title && !changes.length) changes.push(MAIN);
    const moved = parentKey(old, lByRow) !== parentKey(e, rByRow);
    push({ status: changes.length ? "changed" : "unchanged", moved, key: e.key, left: side(old, lByRow), right: side(e, rByRow), changes });
  }
  for (let i = 0; i < l.length; i++) if (!done.has(i) && !rKeys.has(l[i]!.key)) removed(i);
  return { matchedBy, columns, rows, counts };
}

// --- words ----------------------------------------------------------------------

export type WordPart = { kind: "same" | "added" | "removed"; text: string };

/** The longest a text may be for a word-by-word diff; longer texts show as replaced. */
const MAX_TOKENS = 3000;

/** A word-by-word diff of two texts, as parts to show in order. */
export function diffWords(a: string, b: string): WordPart[] {
  const x = a.match(/\s+|[^\s]+/g) ?? [];
  const y = b.match(/\s+|[^\s]+/g) ?? [];
  if (x.length * y.length > MAX_TOKENS * MAX_TOKENS / 4 || x.length > MAX_TOKENS || y.length > MAX_TOKENS) {
    return [...(a ? [{ kind: "removed" as const, text: a }] : []), ...(b ? [{ kind: "added" as const, text: b }] : [])];
  }
  // Longest common subsequence, by rows of a table.
  const n = x.length;
  const m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const parts: WordPart[] = [];
  const add = (kind: WordPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      add("same", x[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) add("removed", x[i++]!);
    else add("added", y[j++]!);
  }
  while (i < n) add("removed", x[i++]!);
  while (j < m) add("added", y[j++]!);
  return parts;
}
