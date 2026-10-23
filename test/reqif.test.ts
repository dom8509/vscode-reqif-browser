import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load, resolveIn } from "../src/core/load";
import { cellText, IDENTIFIER, MAIN, NUMBER } from "../src/core/model";
import { parseReqif } from "../src/core/reqif";
import { objectRefs, xhtmlToText } from "../src/core/xhtml";

const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../sample/${name}`, import.meta.url)));

describe("parseReqif", () => {
  const file = load("lastenheft.reqif", sample("lastenheft.reqif"));
  const doc = file.docs[0]!;

  it("reads one document per specification", () => {
    expect(file.warnings).toEqual([]);
    expect(file.docs).toHaveLength(1);
    expect(doc.title).toBe("Lastenheft Ladestation");
    expect(doc.source).toBe("lastenheft.reqif");
  });

  it("makes columns from the attributes, after the built-ins", () => {
    expect(doc.columns.map((c) => c.id)).toEqual([NUMBER, MAIN, IDENTIFIER, "ReqIF.ChapterName", "ReqIF.ForeignID", "ReqIF.Text", "Status", "Priority", "Verification", "Safety relevant"]);
    expect(doc.columns.find((c) => c.id === "ReqIF.Text")?.type).toBe("xhtml");
  });

  it("numbers the chapters and builds the table of contents", () => {
    const outline = (nodes: typeof doc.toc): string[] => nodes.flatMap((n) => [`${n.number} ${n.title}`, ...outline(n.children)]);
    expect(outline(doc.toc)).toEqual([
      "1 Einleitung",
      "1.1 Begriffe",
      "2 Funktionale Anforderungen",
      "2.1 Laden",
      "2.2 Bedienung",
      "3 Nicht-funktionale Anforderungen",
    ]);
  });

  it("keeps the rows in reading order, with depth, parent and chapter", () => {
    const row = doc.rows.find((r) => r.cells["ReqIF.ForeignID"]?.text === "LH-011.1")!;
    expect(row.depth).toBe(3);
    expect(row.heading).toBe(false);
    const parent = doc.rows.find((r) => r.key === row.parent)!;
    expect(parent.cells["ReqIF.ForeignID"]?.text).toBe("LH-011");
    const chapter = doc.rows.find((r) => r.key === row.chapter)!;
    expect(chapter.number).toBe("2.1");
    expect(doc.rows[0]!.title).toBe("Einleitung");
  });

  it("reads every kind of value", () => {
    const r = doc.rows.find((x) => x.cells["ReqIF.ForeignID"]?.text === "LH-011")!;
    expect(r.cells.Status?.text).toBe("In Review");
    expect(r.cells.Priority?.text).toBe("1");
    expect(r.cells.Verification?.text).toBe("Test, Analysis");
    expect(r.cells["Safety relevant"]?.text).toBe("true");
    expect(r.cells["ReqIF.Text"]?.text).toContain("> 6 mA DC");
    expect(r.cells["ReqIF.Text"]?.html).toContain("<xhtml:p>");
    expect(cellText(r, IDENTIFIER)).toBe("LH-8");
    expect(doc.main).toBe("ReqIF.Text");
    expect(cellText(r, MAIN, doc)).toContain("Fehlerstrom");
    expect(cellText(doc.rows[0]!, MAIN, doc)).toBe("Einleitung");
  });

  it("fills in default values", () => {
    const r = doc.rows.find((x) => x.cells["ReqIF.ForeignID"]?.text === "LH-031")!;
    expect(r.cells.Status?.text).toBe("Draft");
  });

  it("rejects XML that is not ReqIF", () => {
    expect(() => parseReqif("<html/>")).toThrow(/not a ReqIF/);
  });

  it("treats rows with children as chapters when there are no chapter names", () => {
    const xml = `<REQ-IF><CORE-CONTENT><REQ-IF-CONTENT>
      <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t"><SPEC-ATTRIBUTES><ATTRIBUTE-DEFINITION-STRING IDENTIFIER="n" LONG-NAME="ReqIF.Name"/></SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
      <SPEC-OBJECTS>
        <SPEC-OBJECT IDENTIFIER="a"><TYPE><SPEC-OBJECT-TYPE-REF>t</SPEC-OBJECT-TYPE-REF></TYPE><VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="Top"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>n</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING></VALUES></SPEC-OBJECT>
        <SPEC-OBJECT IDENTIFIER="b"><TYPE><SPEC-OBJECT-TYPE-REF>t</SPEC-OBJECT-TYPE-REF></TYPE><VALUES/></SPEC-OBJECT>
      </SPEC-OBJECTS>
      <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s" LONG-NAME="S"><CHILDREN>
        <SPEC-HIERARCHY IDENTIFIER="h1"><OBJECT><SPEC-OBJECT-REF>a</SPEC-OBJECT-REF></OBJECT><CHILDREN>
          <SPEC-HIERARCHY IDENTIFIER="h2"><OBJECT><SPEC-OBJECT-REF>b</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>
        </CHILDREN></SPEC-HIERARCHY>
      </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    </REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>`;
    const doc = parseReqif(xml).docs[0]!;
    expect(doc.toc).toEqual([{ key: "0:h1", number: "1", title: "Top", children: [] }]);
    expect(doc.rows.map((r) => r.heading)).toEqual([true, false]);
  });
});

describe("load .reqifz", () => {
  const file = load("project.reqifz", sample("project.reqifz"));

  it("reads every .reqif in the archive and keeps the other files", () => {
    expect(file.warnings).toEqual([]);
    expect(file.docs.map((d) => [d.index, d.title, d.source])).toEqual([
      [0, "Lastenheft Ladestation", "lastenheft.reqif"],
      [1, "Software-Anforderungen", "software.reqif"],
    ]);
    expect([...file.attachments.keys()]).toEqual(["files/led.png"]);
  });

  it("keys rows by their document in the file", () => {
    expect(file.docs[1]!.rows.every((r) => r.key.startsWith("1:") && (!r.parent || r.parent.startsWith("1:")))).toBe(true);
    expect(file.docs[1]!.toc[0]!.key.startsWith("1:")).toBe(true);
  });

  it("warns about an archive without .reqif", () => {
    expect(load("x.reqifz", new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)])).warnings).toEqual(["The archive holds no .reqif file."]);
  });
});

describe("xhtml", () => {
  it("turns XHTML into lines of text", () => {
    expect(xhtmlToText("<xhtml:div><xhtml:p>a &amp; <xhtml:b>b</xhtml:b></xhtml:p><xhtml:p>c&#160;d</xhtml:p></xhtml:div>")).toBe("a & b\nc d");
  });

  it("finds embedded objects", () => {
    expect(objectRefs('<xhtml:object data="files/a.png" type="image/png"/><object data=\'b&amp;c.jpg\'>')).toEqual(["files/a.png", "b&c.jpg"]);
  });

  it("resolves paths inside the archive", () => {
    expect(resolveIn("docs/a.reqif", "files/x.png")).toBe("docs/files/x.png");
    expect(resolveIn("docs/a.reqif", "../x.png")).toBe("x.png");
    expect(resolveIn("a.reqif", "./x.png")).toBe("x.png");
  });
});
