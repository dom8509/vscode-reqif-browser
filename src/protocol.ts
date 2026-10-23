// Messages between the extension host and the browser webview.

import type { Layout } from "./core/layout";
import type { ReqifDoc } from "./core/model";

export type ToWebview =
  /** The file's documents; `resources` maps an embedded object's `data` to a URL the webview can show. */
  | { type: "load"; name: string; docs: ReqifDoc[]; warnings: string[]; resources: Record<string, string>; layout?: Layout }
  | { type: "error"; message: string };

export type FromWebview =
  | { type: "ready" }
  | { type: "layout"; layout: Layout }
  | { type: "copy"; text: string };

export type { Layout, ReqifDoc };
