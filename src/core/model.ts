// What a ReqIF file holds, as the browser shows it: documents (one per
// specification), each with its columns, its rows in reading order and its
// table of contents.

export type DataType = "string" | "integer" | "real" | "boolean" | "date" | "enumeration" | "xhtml";

/** Built-in columns, next to the attributes of the file. */
export const NUMBER = "@number";
export const IDENTIFIER = "@id";
export const DOCUMENT = "@doc";
/** Chapter titles and requirement text in one column, as DOORS shows them. */
export const MAIN = "@main";

export interface Column {
  /** The attribute's long name, or one of the built-ins above. */
  id: string;
  label: string;
  type: DataType;
}

export interface Cell {
  /** Plain text: what filters search and what plain cells show. */
  text: string;
  /** Rich text, for XHTML attributes: the raw XHTML, sanitized by the webview. */
  html?: string;
}

export interface Row {
  /** Unique in the file: document index and hierarchy id. */
  key: string;
  /** The spec object's IDENTIFIER. */
  id: string;
  /** Depth in the specification's hierarchy, 0 at the top. */
  depth: number;
  /** Rows that are chapters show in the table of contents. */
  heading: boolean;
  /** The chapter number of a heading ("1.2"); "" for other rows. */
  number: string;
  /** What the table of contents calls this row. */
  title: string;
  /** The parent row's key, if any. */
  parent?: string;
  /** The key of the chapter this row is in: itself for a heading. */
  chapter?: string;
  cells: Record<string, Cell>;
}

export interface TocNode {
  key: string;
  number: string;
  title: string;
  children: TocNode[];
}

export interface ReqifDoc {
  index: number;
  id: string;
  title: string;
  /** The .reqif the document comes from: its name inside a .reqifz, else the file's name. */
  source: string;
  columns: Column[];
  /** The attribute the main column shows for rows that are no chapter, e.g. ReqIF.Text. */
  main?: string;
  rows: Row[];
  toc: TocNode[];
}

export interface ReqifFile {
  docs: ReqifDoc[];
  /** Things that could not be read, shown to the person but not fatal. */
  warnings: string[];
}

/** The value a row shows in a column, as text. */
export function cellText(row: Row, column: string, doc?: Pick<ReqifDoc, "title" | "main">): string {
  if (column === MAIN) return mainCell(row, doc)?.text ?? "";
  if (column === NUMBER) return row.number;
  if (column === IDENTIFIER) return row.id;
  if (column === DOCUMENT) return doc?.title ?? "";
  return row.cells[column]?.text ?? "";
}

/** What the main column shows: a chapter's title, else the main attribute. */
export function mainCell(row: Row, doc?: Pick<ReqifDoc, "main">): Cell | undefined {
  if (row.heading) return { text: row.title };
  return doc?.main ? row.cells[doc.main] : undefined;
}
