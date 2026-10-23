// Writes the sample files: sample/lastenheft.reqif and sample/project.reqifz
// (two documents and an embedded picture). Run with `npm run sample`.

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { zipSync } from "fflate";

/** A small PNG: a blue square with a frame. */
function png(size = 48) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const edge = x < 3 || y < 3 || x >= size - 3 || y >= size - 3;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = edge ? 20 : 60;
      raw[o + 1] = edge ? 60 : 130;
      raw[o + 2] = edge ? 120 : 220;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One ReqIF file. `tree` is a list of nodes: { heading } for a chapter, or
 * { id, text, status, priority, verification } for a requirement; `children` nests.
 */
function reqif({ title, prefix, specs }) {
  const objects = [];
  const hierarchy = (nodes) => nodes.map((node) => {
    // Stable identifiers, as tools keep them from export to export.
    const id = node.heading ? `${prefix.toLowerCase()}-h-${node.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : `obj-${node.id}`;
    const values = [];
    if (node.heading) {
      values.push(`<ATTRIBUTE-VALUE-STRING THE-VALUE="${esc(node.heading)}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-chapter</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`);
    } else {
      values.push(`<ATTRIBUTE-VALUE-STRING THE-VALUE="${esc(node.id)}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-foreign-id</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`);
      values.push(`<ATTRIBUTE-VALUE-XHTML><DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>ad-text</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION><THE-VALUE><xhtml:div>${node.text}</xhtml:div></THE-VALUE></ATTRIBUTE-VALUE-XHTML>`);
      if (node.status) values.push(`<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>ad-status</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ev-${node.status}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`);
      if (node.priority) values.push(`<ATTRIBUTE-VALUE-INTEGER THE-VALUE="${node.priority}"><DEFINITION><ATTRIBUTE-DEFINITION-INTEGER-REF>ad-priority</ATTRIBUTE-DEFINITION-INTEGER-REF></DEFINITION></ATTRIBUTE-VALUE-INTEGER>`);
      if (node.verification) values.push(`<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>ad-verification</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES>${node.verification.map((v) => `<ENUM-VALUE-REF>ev-${v}</ENUM-VALUE-REF>`).join("")}</VALUES></ATTRIBUTE-VALUE-ENUMERATION>`);
      if (node.safety !== undefined) values.push(`<ATTRIBUTE-VALUE-BOOLEAN THE-VALUE="${node.safety}"><DEFINITION><ATTRIBUTE-DEFINITION-BOOLEAN-REF>ad-safety</ATTRIBUTE-DEFINITION-BOOLEAN-REF></DEFINITION></ATTRIBUTE-VALUE-BOOLEAN>`);
    }
    objects.push(`<SPEC-OBJECT IDENTIFIER="${id}" LAST-CHANGE="2026-01-15T10:00:00Z"><TYPE><SPEC-OBJECT-TYPE-REF>${node.heading ? "sot-heading" : "sot-requirement"}</SPEC-OBJECT-TYPE-REF></TYPE><VALUES>${values.join("")}</VALUES></SPEC-OBJECT>`);
    const kids = node.children ? `<CHILDREN>${hierarchy(node.children).join("")}</CHILDREN>` : "";
    return `<SPEC-HIERARCHY IDENTIFIER="h-${id}" LAST-CHANGE="2026-01-15T10:00:00Z"><OBJECT><SPEC-OBJECT-REF>${id}</SPEC-OBJECT-REF></OBJECT>${kids}</SPEC-HIERARCHY>`;
  });
  const specXml = specs.map((s, i) => `<SPECIFICATION IDENTIFIER="${prefix}-spec-${i}" LONG-NAME="${esc(s.name)}" LAST-CHANGE="2026-01-15T10:00:00Z"><TYPE><SPECIFICATION-TYPE-REF>st-spec</SPECIFICATION-TYPE-REF></TYPE><CHILDREN>${hierarchy(s.tree).join("")}</CHILDREN></SPECIFICATION>`);
  const enumValue = (id, name, key) => `<ENUM-VALUE IDENTIFIER="ev-${id}" LONG-NAME="${name}" LAST-CHANGE="2026-01-15T10:00:00Z"><PROPERTIES><EMBEDDED-VALUE KEY="${key}" OTHER-CONTENT="${name}"/></PROPERTIES></ENUM-VALUE>`;
  const def = (kind, id, name, dt, extra = "") => `<ATTRIBUTE-DEFINITION-${kind} IDENTIFIER="${id}" LONG-NAME="${name}" LAST-CHANGE="2026-01-15T10:00:00Z"${kind === "ENUMERATION" ? ` MULTI-VALUED="${id === "ad-verification"}"` : ""}><TYPE><DATATYPE-DEFINITION-${kind}-REF>${dt}</DATATYPE-DEFINITION-${kind}-REF></TYPE>${extra}</ATTRIBUTE-DEFINITION-${kind}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<THE-HEADER><REQ-IF-HEADER IDENTIFIER="${prefix}-header"><CREATION-TIME>2026-01-15T10:00:00Z</CREATION-TIME><REQ-IF-TOOL-ID>vscode-reqif-tools sample</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>sample</SOURCE-TOOL-ID><TITLE>${esc(title)}</TITLE></REQ-IF-HEADER></THE-HEADER>
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES>
<DATATYPE-DEFINITION-STRING IDENTIFIER="dt-string" LONG-NAME="String" MAX-LENGTH="1000" LAST-CHANGE="2026-01-15T10:00:00Z"/>
<DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-xhtml" LONG-NAME="Text" LAST-CHANGE="2026-01-15T10:00:00Z"/>
<DATATYPE-DEFINITION-INTEGER IDENTIFIER="dt-int" LONG-NAME="Integer" MIN="1" MAX="5" LAST-CHANGE="2026-01-15T10:00:00Z"/>
<DATATYPE-DEFINITION-BOOLEAN IDENTIFIER="dt-bool" LONG-NAME="Boolean" LAST-CHANGE="2026-01-15T10:00:00Z"/>
<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="dt-status" LONG-NAME="Status" LAST-CHANGE="2026-01-15T10:00:00Z"><SPECIFIED-VALUES>${enumValue("draft", "Draft", 0)}${enumValue("review", "In Review", 1)}${enumValue("approved", "Approved", 2)}${enumValue("rejected", "Rejected", 3)}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>
<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="dt-verification" LONG-NAME="Verification" LAST-CHANGE="2026-01-15T10:00:00Z"><SPECIFIED-VALUES>${enumValue("test", "Test", 0)}${enumValue("review-v", "Review", 1)}${enumValue("analysis", "Analysis", 2)}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>
</DATATYPES>
<SPEC-TYPES>
<SPEC-OBJECT-TYPE IDENTIFIER="sot-heading" LONG-NAME="Heading" LAST-CHANGE="2026-01-15T10:00:00Z"><SPEC-ATTRIBUTES>${def("STRING", "ad-chapter", "ReqIF.ChapterName", "dt-string")}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
<SPEC-OBJECT-TYPE IDENTIFIER="sot-requirement" LONG-NAME="Requirement" LAST-CHANGE="2026-01-15T10:00:00Z"><SPEC-ATTRIBUTES>
${def("STRING", "ad-foreign-id", "ReqIF.ForeignID", "dt-string")}
${def("XHTML", "ad-text", "ReqIF.Text", "dt-xhtml")}
${def("ENUMERATION", "ad-status", "Status", "dt-status", `<DEFAULT-VALUE><ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>ad-status</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ev-draft</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION></DEFAULT-VALUE>`)}
${def("INTEGER", "ad-priority", "Priority", "dt-int")}
${def("ENUMERATION", "ad-verification", "Verification", "dt-verification")}
${def("BOOLEAN", "ad-safety", "Safety relevant", "dt-bool")}
</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
<SPECIFICATION-TYPE IDENTIFIER="st-spec" LONG-NAME="Specification" LAST-CHANGE="2026-01-15T10:00:00Z"/>
</SPEC-TYPES>
<SPEC-OBJECTS>
${objects.join("\n")}
</SPEC-OBJECTS>
<SPECIFICATIONS>
${specXml.join("\n")}
</SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>
`;
}

const lastenheft = {
  title: "Lastenheft Ladestation",
  prefix: "LH",
  specs: [{
    name: "Lastenheft Ladestation",
    tree: [
      { heading: "Einleitung", children: [
        { id: "LH-001", text: "<xhtml:p>Dieses Dokument beschreibt die Anforderungen an eine <xhtml:b>Wallbox</xhtml:b> für Elektrofahrzeuge.</xhtml:p>", status: "approved", priority: 3 },
        { heading: "Begriffe", children: [
          { id: "LH-002", text: "<xhtml:p>Begriffe:</xhtml:p><xhtml:ul><xhtml:li><xhtml:b>EV</xhtml:b>: Elektrofahrzeug</xhtml:li><xhtml:li><xhtml:b>EVSE</xhtml:b>: Ladestation</xhtml:li></xhtml:ul>", status: "approved", priority: 5 },
        ] },
      ] },
      { heading: "Funktionale Anforderungen", children: [
        { heading: "Laden", children: [
          { id: "LH-010", text: "<xhtml:p>Die Ladestation <xhtml:b>muss</xhtml:b> mit bis zu 11 kW laden können.</xhtml:p>", status: "approved", priority: 1, verification: ["test"], safety: false },
          { id: "LH-011", text: "<xhtml:p>Die Ladestation muss den Ladevorgang bei einem Fehlerstrom &gt; 6 mA DC innerhalb von 100 ms beenden.</xhtml:p>", status: "review", priority: 1, verification: ["test", "analysis"], safety: true, children: [
            { id: "LH-011.1", text: "<xhtml:p>Der Fehlerstrom muss alle 10 ms gemessen werden.</xhtml:p>", priority: 2, verification: ["test"], safety: true },
          ] },
          { id: "LH-012", text: "<xhtml:p>Die maximale Ladeleistung:</xhtml:p><xhtml:table><xhtml:tr><xhtml:th>Phasen</xhtml:th><xhtml:th>Strom</xhtml:th><xhtml:th>Leistung</xhtml:th></xhtml:tr><xhtml:tr><xhtml:td>1</xhtml:td><xhtml:td>16 A</xhtml:td><xhtml:td>3,7 kW</xhtml:td></xhtml:tr><xhtml:tr><xhtml:td>3</xhtml:td><xhtml:td>16 A</xhtml:td><xhtml:td>11 kW</xhtml:td></xhtml:tr></xhtml:table>", status: "draft", priority: 2, verification: ["review-v"] },
        ] },
        { heading: "Bedienung", children: [
          { id: "LH-020", text: "<xhtml:p>Der Ladevorgang muss per RFID-Karte gestartet werden können.</xhtml:p>", status: "approved", priority: 2, verification: ["test"] },
          { id: "LH-021", text: "<xhtml:p>Die Status-LED zeigt den Zustand an:</xhtml:p><xhtml:p><xhtml:object data=\"files/led.png\" type=\"image/png\">LED</xhtml:object></xhtml:p>", status: "rejected", priority: 4 },
        ] },
      ] },
      { heading: "Nicht-funktionale Anforderungen", children: [
        { id: "LH-030", text: "<xhtml:p>Schutzart mindestens <xhtml:i>IP54</xhtml:i>.</xhtml:p>", status: "approved", priority: 2, verification: ["review-v"], safety: true },
        { id: "LH-031", text: "<xhtml:p>Betriebstemperatur −25 °C bis +50 °C.</xhtml:p>", priority: 3, verification: ["test"] },
      ] },
    ],
  }],
};

const software = {
  title: "Software-Anforderungen",
  prefix: "SW",
  specs: [{
    name: "Software-Anforderungen",
    tree: [
      { heading: "Kommunikation", children: [
        { id: "SW-100", text: "<xhtml:p>Die Software muss OCPP 2.0.1 unterstützen.</xhtml:p>", status: "approved", priority: 1, verification: ["test"] },
        { id: "SW-101", text: "<xhtml:p>Verbindungsabbrüche zum Backend werden nach spätestens 30 s erkannt.</xhtml:p>", status: "review", priority: 2, verification: ["test"] },
      ] },
      { heading: "Fehlerbehandlung", children: [
        { id: "SW-200", text: "<xhtml:p>Bei einem Fehlerstrom schaltet die Software das Schütz ab (siehe LH-011).</xhtml:p>", status: "draft", priority: 1, verification: ["analysis"], safety: true },
      ] },
    ],
  }],
};

/** The Lastenheft after a review: a text and a status changed, one requirement moved, one removed, one added. */
function revised(spec) {
  const copy = structuredClone(spec);
  const tree = copy.specs[0].tree;
  const funktional = tree[1];
  const laden = funktional.children[0];
  const bedienung = funktional.children[1];
  const nf = tree[2];
  laden.children[0].text = "<xhtml:p>Die Ladestation <xhtml:b>muss</xhtml:b> mit bis zu 22 kW laden können.</xhtml:p>";
  laden.children[2].status = "approved";
  // LH-020 (RFID) moves from Bedienung to Laden.
  laden.children.push(bedienung.children.shift());
  nf.children.pop();
  nf.children.push({ id: "LH-032", text: "<xhtml:p>Die Ladestation muss bei −30 °C noch starten.</xhtml:p>", status: "draft", priority: 3, verification: ["test"] });
  copy.title = "Lastenheft Ladestation";
  return copy;
}

mkdirSync("sample/files", { recursive: true });
const image = png();
writeFileSync("sample/files/led.png", image);
writeFileSync("sample/lastenheft.reqif", reqif(lastenheft));
writeFileSync("sample/lastenheft-v2.reqif", reqif(revised(lastenheft)));
const zip = zipSync({
  "lastenheft.reqif": new TextEncoder().encode(reqif(lastenheft)),
  "software.reqif": new TextEncoder().encode(reqif(software)),
  "files/led.png": image,
});
writeFileSync("sample/project.reqifz", zip);
console.log("Wrote sample/lastenheft.reqif, sample/lastenheft-v2.reqif, sample/project.reqifz, sample/files/led.png");
