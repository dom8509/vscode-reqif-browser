import * as vscode from "vscode";
import { compareCommand } from "./host/compareView";
import { ReqifEditorProvider, VIEW_TYPE } from "./host/reqifEditor";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("ReqIF Browser", { log: true });
  context.subscriptions.push(
    log,
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new ReqifEditorProvider(context, log), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand("reqif.openAsText", async (target?: vscode.Uri) => {
      const uri = target ?? activeUri();
      if (uri) await vscode.commands.executeCommand("vscode.openWith", uri, "default");
    }),
    vscode.commands.registerCommand("reqif.compare", (clicked?: vscode.Uri, selected?: vscode.Uri[]) => compareCommand(context, log, clicked, selected)),
    vscode.commands.registerCommand("reqif.openBrowser", async (target?: vscode.Uri) => {
      const uri = target ?? activeUri();
      if (uri) await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
    }),
  );
}

function activeUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? input.uri : undefined;
}

export function deactivate(): void {}
