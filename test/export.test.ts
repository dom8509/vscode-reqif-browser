import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toCsv, toHtml, toXlsx, type ExportTable } from "../src/core/export";
import { describeRules, type FilterGroup } from "../src/core/filter";

const table: ExportTable = {
  title: "Lastenheft",
  filter: 'Status is "Draft"',
  columns: [{ label: "Text", type: "xhtml" }, { label: "Priority", type: "integer" }, { label: "Safety", type: "boolean" }, { label: "Due", type: "date" }],
  indent: 0,
  rows: [
    { heading: true, depth: 0, context: true, cells: [{ text: "Laden" }, { text: "" }, { text: "" }, { text: "" }] },
    { heading: false, depth: 1, context: false, cells: [{ text: 'Strom > 6 mA, "sofort"\nabschalten', html: "<p>Strom &gt; 6 mA</p>" }, { text: "1" }, { text: "true" }, { text: "2026-03-01" }] },
  ],
};

describe("export", () => {
  it("writes CSV with a BOM, quoting where needed", () => {
    expect(toCsv(table)).toBe('﻿Text,Priority,Safety,Due\r\nLaden,,,\r\n"Strom > 6 mA, ""sofort""\nabschalten",1,true,2026-03-01\r\n');
  });

  it("writes HTML with the rich text as given and everything else escaped", () => {
    const html = toHtml({ ...table, title: "A <b>" }, new Date("2026-10-23T12:00:00Z"));
    expect(html).toContain("<title>A &lt;b&gt;</title>");
    expect(html).toContain("<p>Strom &gt; 6 mA</p>");
    expect(html).toContain('<tr class="heading level-0 context">');
    expect(html).toContain('style="padding-left:1.6em"');
    expect(html).toContain('2 rows · Filter: Status is &quot;Draft&quot; · Exported 2026-10-23 12:00');
  });

  it("writes an Excel workbook with typed cells", () => {
    const files = unzipSync(toXlsx(table));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('<c r="B3"><v>1</v></c>');
    expect(sheet).toContain('<c r="C3" t="b"><v>1</v></c>');
    expect(sheet).toContain('<c r="D3" s="2"><v>46082</v></c>');
    expect(sheet).toContain("Strom &gt; 6 mA, &quot;sofort&quot;\nabschalten");
    expect(sheet).toContain('<autoFilter ref="A1:D3"/>');
    // The chapter is bold, the requirement indented one step.
    expect(sheet).toMatch(/<c r="A2" t="inlineStr" s="13">/);
    expect(sheet).toMatch(/<c r="A3" t="inlineStr" s="5">/);
    expect(strFromU8(files["xl/styles.xml"]!)).toContain('cellXfs count="22"');
  });
});

describe("describeRules", () => {
  it("puts the rules in words", () => {
    const g: FilterGroup = { kind: "group", conj: "and", children: [
      { kind: "cond", column: "Status", op: "is", value: "Approved" },
      { kind: "cond", column: "Status", op: "is", value: "" },
      { kind: "group", conj: "or", children: [{ kind: "cond", column: "Priority", op: "le", value: "1" }, { kind: "cond", column: "Safety", op: "isNotEmpty", value: "" }] },
      { kind: "group", conj: "not", children: [{ kind: "cond", column: "Text", op: "contains", value: "kW" }] },
    ] };
    expect(describeRules(g)).toBe('Status is "Approved" and (Priority ≤ "1" or Safety is not empty) and (not (Text contains "kW"))');
  });
});
