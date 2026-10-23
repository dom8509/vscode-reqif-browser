// Messages between the extension host and the browser webview.

import type { DiffResult } from "./core/diff";
import type { ExportFormat, ExportTable } from "./core/export";
import type { FilterGroup } from "./core/filter";
import type { Layout } from "./core/layout";
import type { ReqifDoc } from "./core/model";
import type { SavedFilter } from "./core/savedFilters";

export type ToWebview =
  /** The file's documents; `resources` maps an embedded object's `data` to a URL the webview can show. */
  | { type: "load"; name: string; docs: ReqifDoc[]; warnings: string[]; resources: Record<string, string>; layout?: Layout; rules?: FilterGroup; savedName?: string; saved: SavedFilter[] }
  /** The named filters changed, here or in another tab; `applied` is one this tab just saved. */
  | { type: "saved"; saved: SavedFilter[]; applied?: string }
  | { type: "error"; message: string };

export type FromWebview =
  | { type: "ready" }
  | { type: "layout"; layout: Layout }
  | { type: "rules"; rules: FilterGroup; savedName?: string }
  /** Save the rules under a name: asks for one when there is none, and before replacing another filter. */
  | { type: "saveFilter"; name?: string; rules: FilterGroup }
  | { type: "deleteFilter"; name: string }
  | { type: "copy"; text: string }
  /** The table as shown, to save as a file. */
  | { type: "export"; to: ExportFormat; table: ExportTable };

// The compare tab.

export interface CompareFile {
  name: string;
  path: string;
  /** Last change on disk, in ms. */
  modified: number;
}

export type CompareToWebview =
  | { type: "compare"; left: CompareFile; right: CompareFile; diff: DiffResult; warnings: string[] }
  | { type: "error"; message: string };

export type CompareFromWebview =
  | { type: "ready" }
  | { type: "swap" }
  | { type: "open"; side: "left" | "right" };

export type { DiffResult, ExportFormat, ExportTable, Layout, ReqifDoc, SavedFilter };
