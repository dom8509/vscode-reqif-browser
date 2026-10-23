// Named filters: filter rules saved once and used in every ReqIF file. The
// extension keeps them for all workspaces.

import type { FilterGroup } from "./filter";

export interface SavedFilter {
  name: string;
  rules: FilterGroup;
}

/** The list with `name` set to `rules`: replaced in place, or added in name order. */
export function upsert(list: SavedFilter[], name: string, rules: FilterGroup): SavedFilter[] {
  const entry = { name, rules: structuredClone(rules) };
  if (list.some((f) => f.name === name)) return list.map((f) => (f.name === name ? entry : f));
  return [...list, entry].sort((a, b) => a.name.localeCompare(b.name));
}

export function remove(list: SavedFilter[], name: string): SavedFilter[] {
  return list.filter((f) => f.name !== name);
}

/** Whether two rule trees filter the same: compared as written. */
export function sameRules(a: FilterGroup | undefined, b: FilterGroup | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
