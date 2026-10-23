import { describe, expect, it } from "vitest";
import { applyFilter, compile, countConditions, evaluate, testCondition, type FilterGroup, type Operator } from "../src/core/filter";
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

describe("filter rules", () => {
  const cond = (op: Operator, value = "", column = "Status") => ({ kind: "cond" as const, column, op, value });
  const t = (op: Operator, value: string, text: string) => testCondition(cond(op, value), text);

  it("compares text without case, and each value of a list", () => {
    expect(t("is", "approved", "Approved")).toBe(true);
    expect(t("is", "analysis", "Test, Analysis")).toBe(true);
    expect(t("isNot", "test", "Test, Analysis")).toBe(false);
    expect(t("contains", "ana", "Test, Analysis")).toBe(true);
    expect(t("startsWith", "lh-0", "LH-011")).toBe(true);
    expect(t("endsWith", ".1", "LH-011.1")).toBe(true);
    expect(t("isEmpty", "", " ")).toBe(true);
    expect(t("isNotEmpty", "", "x")).toBe(true);
    expect(t("matches", "^lh-01\\d$", "LH-011")).toBe(true);
    expect(t("matches", "(", "x")).toBe(false);
  });

  it("compares numbers as numbers and dates as text", () => {
    expect(t("lt", "10", "9")).toBe(true);
    expect(t("ge", "2,5", "2.5")).toBe(true);
    expect(t("gt", "2026-01-31", "2026-02-01")).toBe(true);
    expect(t("gt", "1", "")).toBe(false);
  });

  it("joins conditions with all, any and none, in nested groups", () => {
    const text = (r: Row, c: string) => cellText(r, c);
    const r = rows[1]!; // "11 kW laden", Approved
    const any: FilterGroup = { kind: "group", conj: "or", children: [cond("is", "draft"), cond("is", "approved")] };
    expect(evaluate(any, r, text)).toBe(true);
    expect(evaluate({ ...any, conj: "and" }, r, text)).toBe(false);
    expect(evaluate({ ...any, conj: "not" }, r, text)).toBe(false);
    const nested: FilterGroup = { kind: "group", conj: "and", children: [cond("contains", "kw", "Text"), any] };
    expect(evaluate(nested, r, text)).toBe(true);
  });

  it("ignores conditions still waiting for a value", () => {
    const g: FilterGroup = { kind: "group", conj: "and", children: [cond("is", ""), { kind: "group", conj: "or", children: [] }] };
    expect(countConditions(g)).toBe(0);
    expect(applyFilter(rows, ["Text"], { query: "", columns: {}, rules: g, context: false }, (r, c) => cellText(r, c)).rows).toBe(rows);
  });

  it("filters rows with the rules, keeping parents for context", () => {
    const g: FilterGroup = { kind: "group", conj: "and", children: [cond("is", "Draft")] };
    const r = applyFilter(rows, ["Text"], { query: "", columns: {}, rules: g, context: true }, (x, c) => cellText(x, c));
    expect(r.rows.map((x) => x.key)).toEqual(["0:a", "0:c"]);
  });
});
