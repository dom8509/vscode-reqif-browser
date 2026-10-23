// The table as it is shown (filtered, the columns in their order) as a file:
// CSV, an Excel workbook or an HTML page. The webview builds the table; the
// extension writes the file.

import { strToU8, zipSync } from "fflate";
import type { DataType } from "./model";

export interface ExportColumn {
  label: string;
  type: DataType;
}

export interface ExportRow {
  heading: boolean;
  depth: number;
  /** Kept for context by the filters, not a match itself. */
  context: boolean;
  /** One per column: the text, and safe HTML for rich text. */
  cells: { text: string; html?: string }[];
}

export interface ExportTable {
  title: string;
  /** What filters the table, in words; "" when nothing does. */
  filter: string;
  columns: ExportColumn[];
  /** The column indented by depth, if any. */
  indent?: number;
  rows: ExportRow[];
}

export type ExportFormat = "html" | "xlsx" | "csv";

// --- CSV ------------------------------------------------------------------------

/** RFC 4180: a field with the separator, a quote or a line break is quoted, and quotes doubled. */
function field(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a BOM, so Excel reads it as UTF-8. */
export function toCsv(t: ExportTable): string {
  const lines = [t.columns.map((c) => field(c.label)), ...t.rows.map((r) => r.cells.map((c) => field(c.text)))];
  return `﻿${lines.map((l) => l.join(",")).join("\r\n")}\r\n`;
}

// --- HTML -----------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A page that reads well and prints well (Print → PDF), and that Word and Excel open. */
export function toHtml(t: ExportTable, created = new Date()): string {
  const head = t.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = t.rows.map((r) => {
    const cls = [r.heading ? `heading level-${Math.min(r.depth, 5)}` : "", r.context ? "context" : ""].filter(Boolean).join(" ");
    const cells = r.cells.map((c, i) => {
      const pad = i === t.indent && r.depth > 0 ? ` style="padding-left:${0.4 + r.depth * 1.2}em"` : "";
      return `<td${pad}>${c.html ?? escapeHtml(c.text).replace(/\n/g, "<br>")}</td>`;
    }).join("");
    return `<tr${cls ? ` class="${cls}"` : ""}>${cells}</tr>`;
  }).join("\n");
  const meta = [`${t.rows.length} rows`, t.filter ? `Filter: ${escapeHtml(t.filter)}` : "", `Exported ${created.toISOString().slice(0, 16).replace("T", " ")}`].filter(Boolean).join(" · ");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(t.title)}</title>
<style>
body { font: 10pt/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 1.5em; color: #222; }
h1 { font-size: 1.5em; margin: 0 0 .2em; }
.meta { color: #666; margin-bottom: 1em; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: .25em .4em; vertical-align: top; text-align: left; }
thead th { background: #f2f2f2; position: sticky; top: 0; }
tr.heading td { font-weight: 600; background: #fafafa; }
tr.heading.level-0 td { font-size: 1.15em; }
tr.context td { color: #888; }
td p { margin: 0 0 .4em; } td p:last-child { margin: 0; }
td table { width: auto; } td img { max-width: 100%; }
@media print { body { margin: 0; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style></head><body>
<h1>${escapeHtml(t.title)}</h1>
<div class="meta">${meta}</div>
<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table>
</body></html>
`;
}

// --- Excel ----------------------------------------------------------------------

function xml(s: string): string {
  // Characters XML 1.0 does not allow are dropped.
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A1, B1, …, Z1, AA1. */
function ref(col: number, row: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return `${name}${row + 1}`;
}

/** Days since 1899-12-30, Excel's date number; undefined when the text is no date. */
function excelDate(s: string): { serial: number; time: boolean } | undefined {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)?$/.exec(s.trim());
  if (!m) return undefined;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if (Number.isNaN(ms)) return undefined;
  return { serial: ms / 86_400_000 + 25_569, time: m[4] !== undefined };
}

const MAX_INDENT = 8;

// Cell styles: 0 plain, 1 header, 2 date, 3 date and time, then text: wrapped,
// plain or bold (a chapter), at each indent 0…MAX_INDENT.
const TEXT_STYLE = 4;
function textStyle(bold: boolean, indent: number): number {
  return TEXT_STYLE + (bold ? MAX_INDENT + 1 : 0) + Math.min(indent, MAX_INDENT);
}

function styles(): string {
  const text: string[] = [];
  for (const bold of [false, true]) {
    for (let i = 0; i <= MAX_INDENT; i++) {
      text.push(`<xf numFmtId="0" fontId="${bold ? 1 : 0}" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"${i ? ` indent="${i}"` : ""}/></xf>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${TEXT_STYLE + text.length}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
${text.join("\n")}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function xlsxCell(t: ExportTable, row: ExportRow, ci: number, at: string): string {
  const c = row.cells[ci]!;
  const s = c.text;
  if (s === "") return "";
  const type = t.columns[ci]!.type;
  if ((type === "integer" || type === "real") && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s.trim())) return `<c r="${at}"><v>${s.trim()}</v></c>`;
  if (type === "boolean" && /^(true|false)$/i.test(s.trim())) return `<c r="${at}" t="b"><v>${/^true$/i.test(s.trim()) ? 1 : 0}</v></c>`;
  if (type === "date") {
    const d = excelDate(s);
    if (d) return `<c r="${at}" s="${d.time ? 3 : 2}"><v>${d.serial}</v></c>`;
  }
  const style = textStyle(row.heading, ci === t.indent ? row.depth : 0);
  // Excel holds at most 32767 characters in a cell.
  return `<c r="${at}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(s.slice(0, 32767))}</t></is></c>`;
}

export function toXlsx(t: ExportTable): Uint8Array {
  const cols = t.columns;
  const header = `<row r="1">${cols.map((c, i) => `<c r="${ref(i, 0)}" t="inlineStr" s="1"><is><t>${xml(c.label)}</t></is></c>`).join("")}</row>`;
  const body = t.rows.map((row, ri) => `<row r="${ri + 2}">${cols.map((_, ci) => xlsxCell(t, row, ci, ref(ci, ri + 1))).join("")}</row>`).join("");
  // Each column as wide as its longest line, within reason.
  const widths = cols.map((c, ci) => Math.min(80, Math.max(8, c.label.length + 2, ...t.rows.slice(0, 500).map((r) => Math.max(0, ...r.cells[ci]!.text.split("\n").map((l) => l.length)) + 2))));
  const last = ref(Math.max(cols.length - 1, 0), t.rows.length);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${header}${body}</sheetData>
${cols.length > 0 ? `<autoFilter ref="A1:${last}"/>` : ""}
</worksheet>`;
  // Sheet names: at most 31 characters, none of []:*?/\
  const name = xml(t.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet1");
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
${cols.length > 0 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${last.replace(/\d+$/, "")}$${t.rows.length + 1}</definedName></definedNames>` : ""}
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": styles(),
    "xl/worksheets/sheet1.xml": sheet,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
