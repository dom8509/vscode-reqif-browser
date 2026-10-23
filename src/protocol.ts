// Messages between the extension host and the browser webview.

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
  | { type: "copy"; text: string };

export type { Layout, ReqifDoc, SavedFilter };
