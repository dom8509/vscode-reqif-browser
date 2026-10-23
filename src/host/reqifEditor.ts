// The read-only editor for .reqif and .reqifz files. The host reads the file;
// the webview shows it and does the filtering, so typing stays fast.

import * as vscode from "vscode";
import type { FilterGroup } from "../core/filter";
import type { Layout } from "../core/layout";
import { remove, upsert, type SavedFilter } from "../core/savedFilters";
import { imageType, load, resolveIn, type Loaded } from "../core/load";
import { objectRefs } from "../core/xhtml";
import type { FromWebview, ToWebview } from "../protocol";

export const VIEW_TYPE = "reqif.browser";

const SAVED_KEY = "savedFilters";

/** Embedded images larger than this show as a link-less placeholder. */
const MAX_IMAGE = 8 * 1024 * 1024;

function nonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

export class ReqifEditorProvider implements vscode.CustomReadonlyEditorProvider {
  /** Every open browser, to tell them all when the named filters change. */
  private readonly webviews = new Set<vscode.Webview>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
    const uri = document.uri;
    const webview = panel.webview;
    const folder = vscode.Uri.joinPath(uri, "..");
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist"), vscode.Uri.joinPath(this.context.extensionUri, "webview"), folder],
    };
    webview.html = this.html(webview);

    const post = (msg: ToWebview) => void webview.postMessage(msg);
    const layoutKey = `layout:${uri.toString()}`;
    const rulesKey = `rules:${uri.toString()}`;
    let ready = false;

    const send = async () => {
      if (!ready) return;
      const started = performance.now();
      let loaded: Loaded;
      try {
        loaded = load(uri.path, await vscode.workspace.fs.readFile(uri));
      } catch (e) {
        post({ type: "error", message: `This file cannot be read: ${(e as Error).message}` });
        return;
      }
      const rows = loaded.docs.reduce((n, d) => n + d.rows.length, 0);
      this.log.info(`${vscode.workspace.asRelativePath(uri)}: ${loaded.docs.length} documents, ${rows} rows in ${Math.round(performance.now() - started)} ms`);
      for (const w of loaded.warnings) this.log.warn(`${vscode.workspace.asRelativePath(uri)}: ${w}`);
      post({
        type: "load",
        name: uri.path.split("/").pop() ?? "",
        docs: loaded.docs,
        warnings: loaded.warnings,
        resources: this.resources(loaded, webview, folder),
        layout: this.context.workspaceState.get<Layout>(layoutKey),
        rules: this.context.workspaceState.get<FilterGroup>(rulesKey),
        savedName: this.context.workspaceState.get<string>(`${rulesKey}:name`),
        saved: this.saved(),
      });
    };

    // Reload when the file changes on disk, e.g. after a new export.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, uri.path.split("/").pop() ?? ""));
    let timer: NodeJS.Timeout | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void send(), 300);
    };
    watcher.onDidChange(changed);
    watcher.onDidCreate(changed);

    const sub = webview.onDidReceiveMessage(async (msg: FromWebview) => {
      switch (msg.type) {
        case "ready":
          ready = true;
          await send();
          break;
        case "layout":
          await this.context.workspaceState.update(layoutKey, msg.layout);
          break;
        case "rules":
          await this.context.workspaceState.update(rulesKey, msg.rules.children.length ? msg.rules : undefined);
          await this.context.workspaceState.update(`${rulesKey}:name`, msg.savedName);
          break;
        case "saveFilter":
          await this.saveFilter(webview, msg.name, msg.rules);
          break;
        case "deleteFilter": {
          const ok = await vscode.window.showWarningMessage(`Delete the filter "${msg.name}"? It is gone from every ReqIF file.`, { modal: true }, "Delete");
          if (ok) await this.setSaved(remove(this.saved(), msg.name));
          break;
        }
        case "copy":
          await vscode.env.clipboard.writeText(msg.text);
          void vscode.window.setStatusBarMessage("Copied", 2000);
          break;
      }
    });
    this.webviews.add(webview);
    panel.onDidDispose(() => {
      this.webviews.delete(webview);
      clearTimeout(timer);
      watcher.dispose();
      sub.dispose();
    });
  }

  private saved(): SavedFilter[] {
    return this.context.globalState.get<SavedFilter[]>(SAVED_KEY) ?? [];
  }

  private async setSaved(list: SavedFilter[], from?: vscode.Webview, applied?: string): Promise<void> {
    await this.context.globalState.update(SAVED_KEY, list);
    for (const w of this.webviews) void w.postMessage({ type: "saved", saved: list, applied: w === from ? applied : undefined } satisfies ToWebview);
  }

  private async saveFilter(webview: vscode.Webview, name: string | undefined, rules: FilterGroup): Promise<void> {
    const list = this.saved();
    if (name === undefined) {
      name = (await vscode.window.showInputBox({ title: "Save filter", prompt: "Name of the filter; it can be used in every ReqIF file", placeHolder: "e.g. Open safety requirements" }))?.trim();
      if (!name) return;
      if (list.some((f) => f.name === name)) {
        const ok = await vscode.window.showWarningMessage(`A filter "${name}" exists. Replace it?`, { modal: true }, "Replace");
        if (!ok) return;
      }
    }
    await this.setSaved(upsert(list, name, rules), webview, name);
  }

  /** URLs for the files the documents embed: data URLs from a .reqifz, webview URLs next to a .reqif. */
  private resources(loaded: Loaded, webview: vscode.Webview, folder: vscode.Uri): Record<string, string> {
    const out: Record<string, string> = {};
    for (const doc of loaded.docs) {
      for (const row of doc.rows) {
        for (const cell of Object.values(row.cells)) {
          if (!cell.html) continue;
          for (const target of objectRefs(cell.html)) {
            if (target in out || /^[a-z][\w+.-]*:/i.test(target)) continue;
            const type = imageType(target);
            if (!type) continue;
            if (loaded.attachments.size > 0) {
              const data = loaded.attachments.get(resolveIn(doc.source, target)) ?? loaded.attachments.get(target);
              if (data && data.byteLength <= MAX_IMAGE) out[target] = `data:${type};base64,${toBase64(data)}`;
            } else {
              out[target] = webview.asWebviewUri(vscode.Uri.joinPath(folder, target)).toString();
            }
          }
        }
      }
    }
    return out;
  }

  private html(webview: vscode.Webview): string {
    const n = nonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "webview", "style.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>ReqIF</title>
</head>
<body>
<div id="app"><p class="empty">Reading the file…</p></div>
<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
  }
}
