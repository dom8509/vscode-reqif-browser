import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareFiles, diffWords } from "../src/core/diff";
import { load } from "../src/core/load";
import { MAIN, type ReqifDoc } from "../src/core/model";

const docs = (name: string) => load(name, new Uint8Array(readFileSync(new URL(`../sample/${name}`, import.meta.url)))).docs;
const foreign = (r: { left?: { cells: Record<string, { text: string }> }; right?: { cells: Record<string, { text: string }> } }) =>
  (r.right ?? r.left)!.cells["ReqIF.ForeignID"]?.text ?? (r.right ?? r.left)!.cells[MAIN]?.text;

describe("compareFiles", () => {
  const diff = compareFiles(docs("lastenheft.reqif"), docs("lastenheft-v2.reqif"));

  it("matches by identifier and counts what changed", () => {
    expect(diff.matchedBy).toBe("identifier");
    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 2, unchanged: 13, moved: 1 });
  });

  it("names the changed attributes", () => {
    const changed = diff.rows.filter((r) => r.status === "changed").map((r) => [foreign(r), r.changes]);
    expect(changed).toEqual([["LH-010", ["ReqIF.Text"]], ["LH-012", ["Status"]]]);
  });

  it("marks a requirement in another chapter as moved", () => {
    const moved = diff.rows.find((r) => r.moved)!;
    expect(foreign(moved)).toBe("LH-020");
    expect(moved.status).toBe("unchanged");
    expect(moved.left!.chapter).toBe("2.2 Bedienung");
    expect(moved.right!.chapter).toBe("2.1 Laden");
  });

  it("keeps the new file's order, removed rows where they stood", () => {
    const tail = diff.rows.slice(-3).map((r) => [r.status, foreign(r)]);
    expect(tail).toEqual([["unchanged", "LH-030"], ["removed", "LH-031"], ["added", "LH-032"]]);
  });

  it("matches by ForeignID when the identifiers differ", () => {
    const renamed: ReqifDoc[] = docs("lastenheft-v2.reqif").map((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, id: r.id.startsWith("obj-") ? `new-${r.id}` : r.id })) }));
    const byForeign = compareFiles(docs("lastenheft.reqif"), renamed);
    expect(byForeign.matchedBy).toBe("ReqIF.ForeignID");
    expect(byForeign.counts.added).toBe(1);
    expect(byForeign.counts.removed).toBe(1);
  });

  it("finds nothing in a file compared with itself", () => {
    const same = compareFiles(docs("project.reqifz"), docs("project.reqifz"));
    expect(same.counts.unchanged).toBe(same.rows.length);
    expect(same.rows.length).toBe(21);
  });
});

describe("diffWords", () => {
  it("shows the words that changed", () => {
    expect(diffWords("bis zu 11 kW laden", "bis zu 22 kW laden")).toEqual([
      { kind: "same", text: "bis zu " },
      { kind: "removed", text: "11" },
      { kind: "added", text: "22" },
      { kind: "same", text: " kW laden" },
    ]);
  });

  it("handles empty texts", () => {
    expect(diffWords("", "neu")).toEqual([{ kind: "added", text: "neu" }]);
    expect(diffWords("alt", "")).toEqual([{ kind: "removed", text: "alt" }]);
  });
});
