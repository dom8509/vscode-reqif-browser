// Messages between the extension host and the browser webview.

import type { FilterGroup } from "./core/filter";
import type { Layout } from "./core/layout";
import type { ReqifDoc } from "./core/model";

export type ToWebview =
  /** The file's documents; `resources` maps an embedded object's `data` to a URL the webview can show. */
  | { type: "load"; name: string; docs: ReqifDoc[]; warnings: string[]; resources: Record<string, string>; layout?: Layout; rules?: FilterGroup }
  | { type: "error"; message: string };

export type FromWebview =
  | { type: "ready" }
  | { type: "layout"; layout: Layout }
  | { type: "rules"; rules: FilterGroup }
  | { type: "copy"; text: string };

export type { Layout, ReqifDoc };
