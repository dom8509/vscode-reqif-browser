// Reads a .reqif file (ReqIF 1.0/1.1/1.2): datatypes, attribute definitions,
// spec objects and specifications, into documents the browser shows.

import { XMLParser } from "fast-xml-parser";
import { IDENTIFIER, MAIN, NUMBER, type Cell, type Column, type DataType, type ReqifDoc, type Row, type TocNode } from "./model";
import { xhtmlToText } from "./xhtml";

/** A parsed XML element: child elements by name (always lists), attributes under `$`, text as a string. */
type Node = { $?: Record<string, string>; [child: string]: unknown };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: "$",
  removeNSPrefix: true,
  // XHTML stays as written: the webview renders it.
  stopNodes: ["*.THE-VALUE"],
  isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
  htmlEntities: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

function kids(node: unknown, name: string): Node[] {
  if (!node || typeof node !== "object") return [];
  const v = (node as Node)[name];
  return Array.isArray(v) ? (v as unknown[]).map((x) => (typeof x === "object" && x !== null ? (x as Node) : ({ "#text": x } as Node))) : [];
}

function kid(node: unknown, ...path: string[]): Node | undefined {
  let n: Node | undefined = node as Node;
  for (const p of path) n = kids(n, p)[0];
  return n;
}

function attr(node: Node | undefined, name: string): string | undefined {
  return node?.$?.[name];
}

function text(node: Node | undefined): string {
  if (!node) return "";
  const t = node["#text"];
  return typeof t === "string" ? t.trim() : Array.isArray(t) ? String(t[0] ?? "").trim() : "";
}

/** The text of the first child whose name ends with `suffix`: the id in a `…-REF` element. */
function ref(node: Node | undefined, suffix = "-REF"): string | undefined {
  if (!node) return undefined;
  for (const key of Object.keys(node)) {
    if (key.endsWith(suffix)) return text(kids(node, key)[0]) || undefined;
  }
  return undefined;
}

/** All child elements, whatever their names: the many kinds of type and value elements. */
function children(node: Node | undefined): [string, Node][] {
  if (!node) return [];
  const out: [string, Node][] = [];
  for (const key of Object.keys(node)) {
    if (key === "$" || key === "#text") continue;
    for (const child of kids(node, key)) out.push([key, child]);
  }
  return out;
}

const TYPE_OF: Record<string, DataType> = {
  STRING: "string",
  INTEGER: "integer",
  REAL: "real",
  BOOLEAN: "boolean",
  DATE: "date",
  ENUMERATION: "enumeration",
  XHTML: "xhtml",
};

/** "ATTRIBUTE-VALUE-STRING" → "string". */
function typeOf(element: string): DataType {
  return TYPE_OF[element.split("-").pop() ?? ""] ?? "string";
}

interface AttributeDef {
  id: string;
  name: string;
  type: DataType;
  default?: Cell;
}

interface ObjectType {
  name: string;
  attributes: AttributeDef[];
}

interface SpecObject {
  id: string;
  name?: string;
  type?: string;
  values: Map<string, Cell>;
}

/** The names of things that make a row a chapter heading. */
const CHAPTER_NAME = "ReqIF.ChapterName";
const NAME = "ReqIF.Name";
const TEXT = "ReqIF.Text";
const HEADING_TYPE = /heading|überschrift|chapter|kapitel|section/i;

export interface ParsedReqif {
  title: string;
  docs: Omit<ReqifDoc, "index" | "source">[];
}

/** Reads one .reqif file. Throws when the XML is no ReqIF. */
export function parseReqif(xml: string): ParsedReqif {
  const root = kid(parser.parse(xml), "REQ-IF");
  if (!root) throw new Error("No <REQ-IF> element: this is not a ReqIF file.");
  const title = attr(kid(root, "THE-HEADER", "REQ-IF-HEADER"), "TITLE") || text(kid(root, "THE-HEADER", "REQ-IF-HEADER", "TITLE"));
  const content = kid(root, "CORE-CONTENT", "REQ-IF-CONTENT");
  if (!content) return { title, docs: [] };

  // Enumeration values by id, across all enumeration datatypes.
  const enumLabels = new Map<string, string>();
  for (const [, dt] of children(kid(content, "DATATYPES"))) {
    for (const ev of kids(kid(dt, "SPECIFIED-VALUES"), "ENUM-VALUE")) {
      const id = attr(ev, "IDENTIFIER");
      if (!id) continue;
      const other = attr(kid(ev, "PROPERTIES", "EMBEDDED-VALUE"), "OTHER-CONTENT");
      enumLabels.set(id, attr(ev, "LONG-NAME") || other || id);
    }
  }

  const readValue = (element: string, v: Node): { def?: string; cell: Cell } => {
    const type = typeOf(element);
    const def = ref(kid(v, "DEFINITION"));
    if (type === "enumeration") {
      const labels = kids(kid(v, "VALUES"), "ENUM-VALUE-REF").map((r) => enumLabels.get(text(r)) ?? text(r));
      return { def, cell: { text: labels.join(", ") } };
    }
    if (type === "xhtml") {
      const raw = kids(v, "THE-VALUE")[0];
      const html = typeof raw?.["#text"] === "string" ? (raw["#text"] as string) : "";
      return { def, cell: { text: xhtmlToText(html), html } };
    }
    return { def, cell: { text: attr(v, "THE-VALUE") ?? text(kid(v, "THE-VALUE")) } };
  };

  // Attribute definitions, by id, from every kind of spec type.
  const defs = new Map<string, AttributeDef>();
  const types = new Map<string, ObjectType>();
  for (const [, st] of children(kid(content, "SPEC-TYPES"))) {
    const attributes: AttributeDef[] = [];
    // The parser groups elements by name; the file's order is the order of their ids in the text.
    const place = (n: Node) => xml.indexOf(`"${attr(n, "IDENTIFIER") ?? ""}"`);
    const listed = children(kid(st, "SPEC-ATTRIBUTES")).sort((a, b) => place(a[1]) - place(b[1]));
    for (const [element, ad] of listed) {
      const id = attr(ad, "IDENTIFIER");
      if (!id) continue;
      const def: AttributeDef = { id, name: attr(ad, "LONG-NAME") || id, type: typeOf(element) };
      const dv = children(kid(ad, "DEFAULT-VALUE"))[0];
      if (dv) def.default = readValue(dv[0], dv[1]).cell;
      defs.set(id, def);
      attributes.push(def);
    }
    const id = attr(st, "IDENTIFIER");
    if (id) types.set(id, { name: attr(st, "LONG-NAME") ?? "", attributes });
  }

  const objects = new Map<string, SpecObject>();
  for (const so of kids(kid(content, "SPEC-OBJECTS"), "SPEC-OBJECT")) {
    const id = attr(so, "IDENTIFIER");
    if (!id) continue;
    const values = new Map<string, Cell>();
    for (const [element, v] of children(kid(so, "VALUES"))) {
      const { def, cell } = readValue(element, v);
      if (def) values.set(def, cell);
    }
    const type = ref(kid(so, "TYPE"));
    for (const d of types.get(type ?? "")?.attributes ?? []) {
      if (!values.has(d.id) && d.default) values.set(d.id, d.default);
    }
    objects.set(id, { id, name: attr(so, "LONG-NAME"), type, values });
  }

  const docs = kids(kid(content, "SPECIFICATIONS"), "SPECIFICATION").map((spec, i) => buildDoc(spec, i, objects, defs, types));
  return { title, docs };
}

interface Hierarchy {
  id: string;
  object?: SpecObject;
  children: Hierarchy[];
}

function hierarchy(node: Node, objects: Map<string, SpecObject>): Hierarchy[] {
  return kids(kid(node, "CHILDREN"), "SPEC-HIERARCHY").map((h, i) => ({
    id: attr(h, "IDENTIFIER") ?? String(i),
    object: objects.get(ref(kid(h, "OBJECT")) ?? ""),
    children: hierarchy(h, objects),
  }));
}

function firstLine(s: string, max = 80): string {
  const line = s.split("\n")[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function buildDoc(spec: Node, index: number, objects: Map<string, SpecObject>, defs: Map<string, AttributeDef>, types: Map<string, ObjectType>): Omit<ReqifDoc, "index" | "source"> {
  const id = attr(spec, "IDENTIFIER") ?? `spec-${index}`;
  const title = attr(spec, "LONG-NAME") || id;
  const tree = hierarchy(spec, objects);

  // The columns: every attribute the document's objects have, in the order of their types.
  const used = new Set<string>();
  const visit = (hs: Hierarchy[]) => {
    for (const h of hs) {
      for (const d of types.get(h.object?.type ?? "")?.attributes ?? []) used.add(d.id);
      for (const key of h.object?.values.keys() ?? []) used.add(key);
      visit(h.children);
    }
  };
  visit(tree);
  const byName = new Map<string, Column>();
  const nameOf = new Map<string, string>();
  // In the order the types define them, not the order objects happen to list values in.
  for (const d of defs.values()) {
    if (!used.has(d.id)) continue;
    const defId = d.id;
    nameOf.set(defId, d.name);
    if (!byName.has(d.name)) byName.set(d.name, { id: d.name, label: d.name, type: d.type });
  }
  const attributes = [...byName.values()];
  const main = byName.has(TEXT) ? TEXT : attributes.find((c) => c.type === "xhtml")?.id ?? (byName.has(NAME) ? NAME : undefined);
  const columns: Column[] = [
    { id: NUMBER, label: "#", type: "string" },
    { id: MAIN, label: main && main !== TEXT ? main : "Text", type: "xhtml" },
    { id: IDENTIFIER, label: "ID", type: "string" },
    ...attributes,
  ];
  const hasChapterNames = byName.has(CHAPTER_NAME);

  const rows: Row[] = [];
  const toc: TocNode[] = [];
  const walk = (hs: Hierarchy[], depth: number, parent: Row | undefined, tocParent: TocNode | undefined, chapter: string | undefined) => {
    for (const h of hs) {
      const obj = h.object;
      const cells: Record<string, Cell> = {};
      for (const [defId, cell] of obj?.values ?? []) {
        const name = nameOf.get(defId) ?? defs.get(defId)?.name;
        if (name && !(name in cells)) cells[name] = cell;
      }
      const chapterName = cells[CHAPTER_NAME]?.text.trim() ?? "";
      const typeName = types.get(obj?.type ?? "")?.name ?? "";
      const heading = chapterName !== ""
        || HEADING_TYPE.test(typeName)
        || (!hasChapterNames && h.children.length > 0);
      const key = `${index}:${h.id}`;
      let number = "";
      let node: TocNode | undefined;
      if (heading) {
        // Numbered by place among the chapters at this level, also those found below plain rows.
        const siblings = tocParent ? tocParent.children : toc;
        number = tocParent ? `${tocParent.number}.${siblings.length + 1}` : String(siblings.length + 1);
        const name = chapterName || cells[NAME]?.text.trim() || firstLine(cells[TEXT]?.text ?? "") || obj?.name || obj?.id || h.id;
        node = { key, number, title: firstLine(name, 120), children: [] };
        (tocParent ? tocParent.children : toc).push(node);
      }
      const row: Row = {
        key,
        id: obj?.id ?? "",
        depth,
        heading,
        number,
        title: node?.title ?? (cells[NAME]?.text.trim() || firstLine(cells[TEXT]?.text ?? "") || obj?.id || h.id),
        parent: parent?.key,
        chapter: heading ? key : chapter,
        cells,
      };
      if (!obj) row.title = `(missing object of ${h.id})`;
      rows.push(row);
      // Headings below a plain row still go under the chapter that holds that row.
      walk(h.children, depth + 1, row, node ?? tocParent, node ? key : chapter);
    }
  };
  walk(tree, 0, undefined, undefined, undefined);
  return { id, title, columns, main, rows, toc };
}
