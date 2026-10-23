// The compare tab: two ReqIF files side by side as one table. Added rows are
// green, removed rows red, changed values show word by word what changed.

import { diffWords, type DiffRow, type DiffSide, type DiffStatus } from "../src/core/diff";
import { compile } from "../src/core/filter";
import { MAIN } from "../src/core/model";
import type { CompareFromWebview, CompareToWebview } from "../src/protocol";
import { button, debounce, el } from "./dom";
import { renderXhtml } from "./xhtml";

declare function acquireVsCodeApi(): { postMessage(msg: CompareFromWebview): void; getState(): unknown; setState(s: unknown): void };
const vscode = acquireVsCodeApi();
const send = (msg: CompareFromWebview) => vscode.postMessage(msg);

type Kind = DiffStatus | "moved";

interface ViewState {
  /** Which kinds of rows show. */
  show: Record<Kind, boolean>;
  query: string;
  /** Show the chapters of the rows shown, dimmed. */
  context: boolean;
  /** Attribute columns the person turned on or off; the rest follow "changed columns show". */
  columns: Record<string, boolean>;
}

const state: ViewState = {
  show: { added: true, removed: true, changed: true, moved: true, unchanged: false },
  query: "",
  context: true,
  columns: {},
  ...(vscode.getState() as Partial<ViewState> | undefined),
};
const save = () => vscode.setState(state);

let data: Extract<CompareToWebview, { type: "compare" }> | undefined;
let error: string | undefined;
let tbody: HTMLTableSectionElement | undefined;
let countEl: HTMLElement | undefined;
let panel: HTMLElement | undefined;
let shown: { row: DiffRow; context: boolean }[] = [];
let drawn = 0;
const CHUNK = 400;

const LABELS: Record<Kind, string> = { added: "Added", removed: "Removed", changed: "Changed", moved: "Moved", unchanged: "Unchanged" };

function sideOf(r: DiffRow): DiffSide {
  return (r.right ?? r.left)!;
}

/** The attributes that changed anywhere: they show unless turned off. */
function changedColumns(): Set<string> {
  return new Set(data?.diff.rows.flatMap((r) => r.changes) ?? []);
}

function columns(): string[] {
  const changed = changedColumns();
  return (data?.diff.columns ?? []).filter((c) => state.columns[c] ?? (changed.has(c) && c !== "ReqIF.Text" && c !== "ReqIF.ChapterName"));
}

function rowText(r: DiffRow, cols: string[]): string {
  const parts: string[] = [];
  for (const s of [r.left, r.right]) {
    if (!s) continue;
    parts.push(s.id, s.number, s.cells[MAIN]?.text ?? "", ...cols.map((c) => s.cells[c]?.text ?? ""));
  }
  return parts.join("\n");
}

function visible(r: DiffRow): boolean {
  return state.show[r.status] || (r.moved && state.show.moved);
}

/** The rows to show; with context, each shown row's chapters before it, dimmed. */
function filterRows(): void {
  const cols = columns();
  const search = compile(state.query);
  shown = [];
  // The chapters above the current row, by depth, and whether each was shown yet.
  const chapters: { row: DiffRow; depth: number; out: boolean }[] = [];
  for (const r of data?.diff.rows ?? []) {
    const s = sideOf(r);
    if (s.heading) {
      while (chapters.length && chapters[chapters.length - 1]!.depth >= s.depth) chapters.pop();
    }
    const hit = visible(r) && (!search || search(rowText(r, cols)));
    if (hit) {
      if (state.context) {
        for (const c of chapters) {
          if (c.out || c.row === r) continue;
          shown.push({ row: c.row, context: true });
          c.out = true;
        }
      }
      shown.push({ row: r, context: false });
    }
    if (s.heading) chapters.push({ row: r, depth: s.depth, out: hit });
  }
}

// --- cells ----------------------------------------------------------------------

function richOrText(cell: { text: string; html?: string } | undefined): Node {
  const box = el("div", { class: "cell" });
  if (cell?.html) box.append(renderXhtml(cell.html, {}));
  else box.textContent = cell?.text ?? "";
  return box;
}

function wordDiff(a: string, b: string): Node {
  const box = el("div", { class: "cell" });
  for (const p of diffWords(a, b)) box.append(p.kind === "same" ? p.text : el(p.kind === "added" ? "ins" : "del", {}, p.text));
  return box;
}

function cell(r: DiffRow, column: string): HTMLTableCellElement {
  const td = el("td");
  const before = r.left?.cells[column];
  const after = r.right?.cells[column];
  if (r.left && r.right && (before?.text ?? "") !== (after?.text ?? "")) {
    td.className = "changed";
    td.append(wordDiff(before?.text ?? "", after?.text ?? ""));
  } else {
    td.append(richOrText(after ?? before));
  }
  return td;
}

function badge(r: DiffRow): HTMLElement {
  const box = el("div", { class: "badges" });
  if (r.status !== "unchanged") box.append(el("span", { class: `badge ${r.status}` }, LABELS[r.status]));
  if (r.moved) {
    const from = r.left?.chapter || "(top)";
    const to = r.right?.chapter || "(top)";
    box.append(el("span", { class: "badge moved", title: `From ${from}\nto ${to}` }, "Moved"));
  }
  return box;
}

function rowEl(item: { row: DiffRow; context: boolean }, cols: string[]): HTMLTableRowElement {
  const r = item.row;
  const s = sideOf(r);
  const cls = [`diff-${r.status}`, s.heading ? `heading level-${Math.min(s.depth, 5)}` : "", item.context ? "context" : ""].filter(Boolean).join(" ");
  const tr = el("tr", { class: cls });
  tr.append(el("td", {}, badge(r)));
  const num = r.left && r.right && r.left.number !== r.right.number ? `${r.left.number} → ${r.right.number}` : s.number;
  tr.append(el("td", { class: "mono" }, num));
  tr.append(el("td", { class: "mono" }, s.id));
  const main = cell(r, MAIN);
  if (s.depth > 0) main.style.paddingLeft = `${6 + s.depth * 16}px`;
  if (r.moved) main.append(el("div", { class: "moved-note" }, `Moved from ${r.left?.chapter || "(top)"} to ${r.right?.chapter || "(top)"}`));
  tr.append(main);
  for (const c of cols) tr.append(cell(r, c));
  return tr;
}

function drawRows(upTo: number): void {
  if (!tbody) return;
  const cols = columns();
  tbody.querySelector("tr.more")?.remove();
  const frag = document.createDocumentFragment();
  for (; drawn < Math.min(upTo, shown.length); drawn++) frag.append(rowEl(shown[drawn]!, cols));
  tbody.append(frag);
  if (drawn < shown.length) {
    const more = el("tr", { class: "more" }, el("td", { colspan: String(cols.length + 4) }, button(`Show more (${drawn} of ${shown.length})`, () => drawRows(drawn + CHUNK))));
    tbody.append(more);
  }
}

function drawBody(): void {
  if (!tbody) return;
  filterRows();
  tbody.replaceChildren();
  drawn = 0;
  if (shown.length === 0) {
    const none = data && data.diff.rows.every((r) => r.status === "unchanged" && !r.moved) ? "The files hold the same requirements." : "No row matches.";
    tbody.append(el("tr", {}, el("td", { colspan: String(columns().length + 4), class: "empty" }, none)));
  } else {
    drawRows(CHUNK);
  }
  if (countEl) countEl.textContent = `${shown.filter((x) => !x.context).length} rows`;
}

// --- page -----------------------------------------------------------------------

function date(ms: number): string {
  return ms ? new Date(ms).toLocaleString() : "";
}

function header(): HTMLElement {
  const d = data!;
  const side = (label: string, f: typeof d.left, which: "left" | "right") => {
    const link = el("button", { class: "link", title: `Open ${f.path} in the ReqIF Browser` }, f.name);
    link.onclick = () => send({ type: "open", side: which });
    return el("span", { class: `file ${which}` }, el("span", { class: "muted" }, `${label} `), link, el("span", { class: "muted" }, ` ${date(f.modified)}`));
  };
  return el("div", { class: "toolbar compare-files" },
    side("Old:", d.left, "left"),
    el("span", { class: "muted" }, "→"),
    side("New:", d.right, "right"),
    button("⇄ Swap", () => send({ type: "swap" }), "secondary", "Swap old and new"),
    el("span", { class: "spacer" }),
    el("span", { class: "muted" }, `Matched by ${d.diff.matchedBy}`),
  );
}

function toolbar(): HTMLElement {
  const d = data!;
  const bar = el("div", { class: "toolbar" });
  for (const k of ["added", "removed", "changed", "moved", "unchanged"] as Kind[]) {
    const chip = button(`${LABELS[k]} ${d.diff.counts[k]}`, () => {
      state.show[k] = !state.show[k];
      save();
      chip.classList.toggle("on", state.show[k]);
      drawBody();
    }, `chip ${k}${state.show[k] ? " on" : ""}`, `Show or hide the ${LABELS[k].toLowerCase()} rows`);
    bar.append(chip);
  }
  const search = el("input", { type: "search", class: "search", placeholder: "Search…", value: state.query });
  const later = debounce(drawBody, 150);
  search.oninput = () => {
    state.query = search.value;
    save();
    later();
  };
  const ctx = el("label", { class: "check", title: "Show the chapters of the rows shown, dimmed" });
  const box = el("input", { type: "checkbox" });
  box.checked = state.context;
  box.onchange = () => {
    state.context = box.checked;
    save();
    drawBody();
  };
  ctx.append(box, " Context");
  countEl = el("span", { class: "count" });
  bar.append(search, ctx, el("span", { class: "spacer" }), countEl, button("Columns ▾", (e) => {
    e.stopPropagation();
    toggleColumns();
  }, "secondary", "Choose the attributes to compare"));
  return bar;
}

function toggleColumns(): void {
  if (panel) {
    panel.remove();
    panel = undefined;
    return;
  }
  const changed = changedColumns();
  const shownCols = new Set(columns());
  const list = el("ul", { class: "column-list" });
  for (const c of data?.diff.columns ?? []) {
    const check = el("input", { type: "checkbox" });
    check.checked = shownCols.has(c);
    check.onchange = () => {
      state.columns[c] = check.checked;
      save();
      render();
      toggleColumns();
    };
    list.append(el("li", {}, el("label", {}, check, ` ${c}`), changed.has(c) ? el("span", { class: "badge changed" }, "changed") : ""));
  }
  panel = el("div", { class: "popover" }, el("div", { class: "popover-head" }, el("strong", {}, "Columns"), el("span", { class: "muted" }, "Text, # and ID always show")), list);
  panel.onclick = (e) => e.stopPropagation();
  document.body.append(panel);
}

function render(): void {
  const app = document.getElementById("app")!;
  panel?.remove();
  panel = undefined;
  if (error) {
    app.replaceChildren(el("p", { class: "error" }, error));
    return;
  }
  if (!data) return;
  const cols = columns();
  const head = el("tr", {}, el("th", {}, ""), el("th", {}, "#"), el("th", {}, "ID"), el("th", {}, "Text"), ...cols.map((c) => el("th", { title: c }, c)));
  tbody = el("tbody");
  const table = el("table", { class: "diff" }, el("thead", {}, head), tbody);
  const warnings = data.warnings.length ? [el("div", { class: "warning" }, ...data.warnings.map((w) => el("div", {}, `⚠ ${w}`)))] : [];
  app.replaceChildren(header(), toolbar(), ...warnings, el("div", { class: "main" }, el("div", { class: "table-wrap" }, table)));
  drawBody();
}

window.addEventListener("message", (e: MessageEvent<CompareToWebview>) => {
  const msg = e.data;
  if (msg.type === "error") error = msg.message;
  else {
    error = undefined;
    data = msg;
  }
  render();
});

document.addEventListener("click", () => {
  panel?.remove();
  panel = undefined;
});

send({ type: "ready" });
