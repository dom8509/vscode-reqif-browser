import { describe, expect, it } from "vitest";
import { EMPTY_GROUP, type FilterGroup } from "../src/core/filter";
import { remove, sameRules, upsert } from "../src/core/savedFilters";

const rules = (value: string): FilterGroup => ({ kind: "group", conj: "and", children: [{ kind: "cond", column: "Status", op: "is", value }] });

describe("saved filters", () => {
  it("adds in name order and replaces by name", () => {
    let list = upsert([], "b", rules("x"));
    list = upsert(list, "a", rules("y"));
    expect(list.map((f) => f.name)).toEqual(["a", "b"]);
    list = upsert(list, "b", rules("z"));
    expect(list.map((f) => f.name)).toEqual(["a", "b"]);
    expect(sameRules(list[1]!.rules, rules("z"))).toBe(true);
  });

  it("keeps its own copy of the rules", () => {
    const r = rules("x");
    const list = upsert([], "a", r);
    (r.children[0] as { value: string }).value = "changed";
    expect(sameRules(list[0]!.rules, rules("x"))).toBe(true);
  });

  it("removes by name", () => {
    expect(remove(upsert([], "a", EMPTY_GROUP), "a")).toEqual([]);
  });
});
