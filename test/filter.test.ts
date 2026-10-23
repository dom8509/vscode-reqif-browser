import { describe, expect, it } from "vitest";
import { applyFilter, compile } from "../src/core/filter";
import { cellText, type Row } from "../src/core/model";

function row(key: string, text: string, parent?: string, status = ""): Row {
  return { key, id: key, depth: parent ? 1 : 0, heading: !parent, number: "", title: text, parent, cells: { Text: { text }, Status: { text: status } } };
}

const rows = [
  row("0:a", "Laden"),
  row("0:b", "11 kW laden", "0:a", "Approved"),
  row("0:c", "Fehlerstrom abschalten", "0:a", "Draft"),
  row("0:d", "Bedienung"),
  row("0:e", "RFID Karte", "0:d", "Approved"),
];
const text = (r: Row, c: string) => cellText(r, c);

describe("compile", () => {
  it("needs every term, ignoring case", () => {
    expect(compile("kw LADEN")!("11 kW laden")).toBe(true);
    expect(compile("kw strom")!("11 kW laden")).toBe(false);
  });

  it("knows phrases, negation and regular expressions", () => {
    expect(compile('"kw laden"')!("11 kW laden")).toBe(true);
    expect(compile('"laden kw"')!("11 kW laden")).toBe(false);
    expect(compile("laden -kw")!("11 kW laden")).toBe(false);
    expect(compile("/^\\d+ kw/")!("11 kW laden")).toBe(true);
  });

  it("searches for the text of a broken expression", () => {
    expect(compile("/(")!("a /( b")).toBe(true);
  });

  it("filters nothing when empty", () => {
    expect(compile("  ")).toBeUndefined();
  });
});

describe("applyFilter", () => {
  it("lets everything through without filters", () => {
    expect(applyFilter(rows, ["Text"], { query: "", columns: {}, context: true }, text).rows).toBe(rows);
  });

  it("searches the shown columns and keeps parents for context", () => {
    const r = applyFilter(rows, ["Text"], { query: "rfid", columns: {}, context: true }, text);
    expect(r.rows.map((x) => x.key)).toEqual(["0:d", "0:e"]);
    expect([...r.matches].map((x) => x.key)).toEqual(["0:e"]);
  });

  it("does not search hidden columns", () => {
    expect(applyFilter(rows, ["Text"], { query: "approved", columns: {}, context: false }, text).rows).toEqual([]);
  });

  it("combines column filters, without context when asked", () => {
    const r = applyFilter(rows, ["Text"], { query: "", columns: { Status: "approved", Text: "laden" }, context: false }, text);
    expect(r.rows.map((x) => x.key)).toEqual(["0:b"]);
  });
});
