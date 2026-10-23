// The column layout: which columns show, in which order, how wide. One
// layout per file, kept by the extension between sessions.

import { IDENTIFIER, MAIN, NUMBER, type Column, type ReqifDoc } from "./model";

export interface Layout {
  /** Column ids in the order the person put them; columns not listed follow in the file's order. */
  order: string[];
  hidden: string[];
  /** Widths in pixels, by column id. */
  widths: Record<string, number>;
}

export const EMPTY_LAYOUT: Layout = { order: [], hidden: [], widths: {} };

/** The first layout of a file: the main column stands for the chapter names and the text it shows. */
export function defaultLayout(docs: Pick<ReqifDoc, "main">[]): Layout {
  const hidden = new Set(["ReqIF.ChapterName"]);
  for (const d of docs) if (d.main) hidden.add(d.main);
  return { ...EMPTY_LAYOUT, hidden: [...hidden] };
}

export const MIN_WIDTH = 40;
export const DEFAULT_WIDTH = 160;

/** Every column, in the layout's order. */
export function ordered(columns: Column[], layout: Layout): Column[] {
  const place = new Map(layout.order.map((id, i) => [id, i]));
  const natural = new Map(columns.map((c, i) => [c.id, i]));
  return [...columns].sort((a, b) => {
    const pa = place.get(a.id);
    const pb = place.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return natural.get(a.id)! - natural.get(b.id)!;
  });
}

/** The columns that show, in order. */
export function visible(columns: Column[], layout: Layout): Column[] {
  const hidden = new Set(layout.hidden);
  return ordered(columns, layout).filter((c) => !hidden.has(c.id));
}

/** Moves `id` before or after `target`; the result lists every column. */
export function move(columns: Column[], layout: Layout, id: string, target: string, after: boolean): Layout {
  const order = ordered(columns, layout).map((c) => c.id).filter((c) => c !== id);
  const at = order.indexOf(target);
  if (at < 0 || id === target) return layout;
  order.splice(after ? at + 1 : at, 0, id);
  return { ...layout, order };
}

export function setHidden(layout: Layout, id: string, hidden: boolean): Layout {
  const rest = layout.hidden.filter((h) => h !== id);
  return { ...layout, hidden: hidden ? [...rest, id] : rest };
}

export function setWidth(layout: Layout, id: string, width: number): Layout {
  return { ...layout, widths: { ...layout.widths, [id]: Math.max(MIN_WIDTH, Math.round(width)) } };
}

/** A sensible first width: narrow for numbers and ids, wide for text. */
export function widthOf(column: Column, layout: Layout): number {
  const w = layout.widths[column.id];
  if (w) return w;
  if (column.id === NUMBER) return 70;
  if (column.id === IDENTIFIER) return 120;
  if (column.id === MAIN) return 480;
  if (column.type === "xhtml" || /text|description|beschreibung/i.test(column.id)) return 420;
  if (column.type === "boolean" || column.type === "integer") return 90;
  return DEFAULT_WIDTH;
}
