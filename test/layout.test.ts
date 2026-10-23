import { describe, expect, it } from "vitest";
import { defaultLayout, EMPTY_LAYOUT, move, ordered, setHidden, setWidth, visible, widthOf } from "../src/core/layout";
import type { Column } from "../src/core/model";

const cols: Column[] = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), type: "string" }));
const ids = (cs: Column[]) => cs.map((c) => c.id);

describe("layout", () => {
  it("keeps the file's order by default", () => {
    expect(ids(ordered(cols, EMPTY_LAYOUT))).toEqual(["a", "b", "c", "d"]);
  });

  it("puts listed columns first, new ones after in the file's order", () => {
    expect(ids(ordered(cols, { ...EMPTY_LAYOUT, order: ["c", "a", "gone"] }))).toEqual(["c", "a", "b", "d"]);
  });

  it("moves a column before or after another", () => {
    expect(ids(ordered(cols, move(cols, EMPTY_LAYOUT, "d", "b", false)))).toEqual(["a", "d", "b", "c"]);
    expect(ids(ordered(cols, move(cols, EMPTY_LAYOUT, "a", "c", true)))).toEqual(["b", "c", "a", "d"]);
  });

  it("hides and shows columns", () => {
    const hidden = setHidden(EMPTY_LAYOUT, "b", true);
    expect(ids(visible(cols, hidden))).toEqual(["a", "c", "d"]);
    expect(ids(visible(cols, setHidden(hidden, "b", false)))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps widths, never below the minimum", () => {
    expect(widthOf(cols[0]!, setWidth(EMPTY_LAYOUT, "a", 250.4))).toBe(250);
    expect(widthOf(cols[0]!, setWidth(EMPTY_LAYOUT, "a", 5))).toBe(40);
  });

  it("hides chapter names and the main column's attribute at first", () => {
    expect(defaultLayout([{ main: "ReqIF.Text" }, { main: "Description" }, {}]).hidden).toEqual(["ReqIF.ChapterName", "ReqIF.Text", "Description"]);
  });
});
