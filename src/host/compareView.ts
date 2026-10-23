// Compares two ReqIF files in a tab of its own: chosen in the Explorer, the
// older file on the left. The host reads both files and compares them; the
// webview shows the differences.

import * as vscode from "vscode";
import { compareFiles } from "../core/diff";
import { load } from "../core/load";
import type { CompareFromWebview, CompareToWebview } from "../protocol";

const VIEW_TYPE = "reqif.compare";

function isReqif(uri: vscode.Uri): boolean {
  return /\.reqifz?$/i.test(uri.path);
}

function nonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function baseName(uri: vscode.Uri): string {
  return uri.path.split("/").pop() ?? uri.path;
}

/** The command behind "Compare ReqIF Files" in the Explorer: `selected` holds every file selected there. */
export async function compareCommand(context: vscode.ExtensionContext, log: vscode.LogOutputChannel, clicked?: vscode.Uri, selected?: vscode.Uri[]): Promise<void> {
  let files = (selected?.length ? selected : clicked ? [clicked] : []).filter(isReqif);
  if (files.length !== 2) {
    // From the Command Palette, or with the wrong number selected: pick them.
    const picked = await vscode.window.showOpenDialog({ canSelectMany: true, filters: { ReqIF: ["reqif", "reqifz"] }, openLabel: "Compare", title: "Select two ReqIF files to compare" });
    files = (picked ?? []).filter(isReqif);
    if (files.length === 0) return;
    if (files.length !== 2) {
      void vscode.window.showErrorMessage("Select exactly two .reqif or .reqifz files to compare.");
      return;
    }
  }
  // The older file on the left, as in a diff.
  const times = await Promise.all(files.map((f) => vscode.workspace.fs.stat(f).then((s) => s.mtime, () => 0)));
  const [left, right] = times[0]! <= times[1]! ? [files[0]!, files[1]!] : [files[1]!, files[0]!];
  openCompare(context, log, left, right);
}

function openCompare(context: vscode.ExtensionContext, log: vscode.LogOutputChannel, left: vscode.Uri, right: vscode.Uri): void {
  const panel = vscode.window.createWebviewPanel(VIEW_TYPE, `${baseName(left)} ↔ ${baseName(right)}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist"), vscode.Uri.joinPath(context.extensionUri, "webview")],
  });
  const webview = panel.webview;
  webview.html = html(context, webview);
  const post = (msg: CompareToWebview) => void webview.postMessage(msg);

  const send = async () => {
    const started = performance.now();
    try {
      const [l, r] = await Promise.all([left, right].map(async (u) => load(u.path, await vscode.workspace.fs.readFile(u))));
      const diff = compareFiles(l!.docs, r!.docs);
      log.info(`Compared ${vscode.workspace.asRelativePath(left)} with ${vscode.workspace.asRelativePath(right)} in ${Math.round(performance.now() - started)} ms: ${JSON.stringify(diff.counts)}`);
      const [lStat, rStat] = await Promise.all([left, right].map((u) => vscode.workspace.fs.stat(u).then((s) => s.mtime, () => 0)));
      post({
        type: "compare",
        left: { name: baseName(left), path: vscode.workspace.asRelativePath(left), modified: lStat! },
        right: { name: baseName(right), path: vscode.workspace.asRelativePath(right), modified: rStat! },
        diff,
        warnings: [...l!.warnings.map((w) => `${baseName(left)}: ${w}`), ...r!.warnings.map((w) => `${baseName(right)}: ${w}`)],
      });
    } catch (e) {
      post({ type: "error", message: `The files cannot be compared: ${(e as Error).message}` });
    }
  };

  webview.onDidReceiveMessage(async (msg: CompareFromWebview) => {
    switch (msg.type) {
      case "ready":
        await send();
        break;
      case "swap":
        [left, right] = [right, left];
        panel.title = `${baseName(left)} ↔ ${baseName(right)}`;
        await send();
        break;
      case "open":
        await vscode.commands.executeCommand("vscode.openWith", msg.side === "left" ? left : right, "reqif.browser");
        break;
    }
  }, undefined, context.subscriptions);
}

function html(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const n = nonce();
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "compare.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "webview", "style.css"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Compare</title>
</head>
<body>
<div id="app"><p class="empty">Comparing…</p></div>
<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
}
