// The ReqIF browser: a table of contents on the left, the requirements as a
// table on the right. Columns can be hidden, moved and resized; filters
// search one document or all documents of the file.

import { applyFilter, compile, CONJUNCTIONS, countConditions, EMPTY_GROUP, OPERATORS, type Condition, type Conjunction, type FilterGroup, type FilterNode, type FilterSpec, type Operator } from "../src/core/filter";
import { defaultLayout, EMPTY_LAYOUT, move, ordered, setHidden, setWidth, visible, widthOf, type Layout } from "../src/core/layout";
import { cellText, DOCUMENT, IDENTIFIER, MAIN, mainCell, NUMBER, type Column, type ReqifDoc, type Row, type TocNode } from "../src/core/model";
import type { FromWebview, ToWebview } from "../src/protocol";
import { renderXhtml } from "./xhtml";

declare function acquireVsCodeApi(): { postMessage(msg: FromWebview): void; getState(): unknown; setState(s: unknown): void };
const vscode = acquireVsCodeApi();
const send = (msg: FromWebview) => vscode.postMessage(msg);

/** What the person is looking at; kept by VS Code while the tab lives. */
interface ViewState {
  doc: number;
  scope: "doc" | "all";
  query: string;
  columns: Record<string, string>;
  context: boolean;
  toc: boolean;
  tocWidth: number;
  collapsed: string[];
  compact: boolean;
  /** The filter rules of the filter panel; also kept per file by the extension. */
  rules?: FilterGroup;
}

const state: ViewState = {
  doc: 0,
  scope: "doc",
  query: "",
  columns: {},
  context: true,
  toc: true,
  tocWidth: 280,
  collapsed: [],
  compact: false,
  ...(vscode.getState() as Partial<ViewState> | undefined),
};
const save = () => vscode.setState(state);

let file: Extract<ToWebview, { type: "load" }> | undefined;
let layout: Layout = EMPTY_LAYOUT;
let error: string | undefined;

/** The rows the filters let through, and which of them the table has drawn: [first, drawn). */
let shown: Row[] = [];
let matches = new Set<Row>();
let first = 0;
let drawn = 0;
const CHUNK = 300;

let tbody: HTMLTableSectionElement | undefined;
let wrap: HTMLElement | undefined;
let tocEl: HTMLElement | undefined;
let countEl: HTMLElement | undefined;
let panel: HTMLElement | undefined;
let panelKind: "columns" | "filter" | undefined;
let filterBtn: HTMLButtonElement | undefined;
let watcher: IntersectionObserver | undefined;
/** The row just jumped to: its chapter stays marked while the row is in view. */
let pinned: string | undefined;

// --- helpers ------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | undefined> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function button(label: string, onClick: (e: MouseEvent) => void, cls = "secondary", title?: string): HTMLButtonElement {
  const b = el("button", { class: cls, title }, label);
  b.onclick = onClick;
  return b;
}

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function docs(): ReqifDoc[] {
  return file?.docs ?? [];
}

function currentDoc(): ReqifDoc | undefined {
  return docs()[Math.min(state.doc, docs().length - 1)];
}

function docOf(row: Row): ReqifDoc | undefined {
  return docs()[parseInt(row.key, 10)];
}

function allDocs(): boolean {
  return state.scope === "all" && docs().length > 1;
}

/** The columns of what is in scope: one document's, or every document's with a column for the document. */
function columns(): Column[] {
  if (!allDocs()) return currentDoc()?.columns ?? [];
  const byId = new Map<string, Column>();
  for (const d of docs()) for (const c of d.columns) if (!byId.has(c.id)) byId.set(c.id, c);
  const list = [...byId.values()];
  const at = list.findIndex((c) => c.id === IDENTIFIER);
  list.splice(at + 1, 0, { id: DOCUMENT, label: "Document", type: "string" });
  return list;
}

function rowsInScope(): Row[] {
  return allDocs() ? docs().flatMap((d) => d.rows) : currentDoc()?.rows ?? [];
}

function text(row: Row, column: string): string {
  return cellText(row, column, docOf(row));
}

function filterSpec(): FilterSpec {
  return { query: state.query, columns: state.columns, rules: state.rules, context: state.context };
}

function rules(): FilterGroup {
  return (state.rules ??= structuredClone(EMPTY_GROUP));
}

function filtering(): boolean {
  return state.query.trim() !== "" || Object.values(state.columns).some((q) => q.trim() !== "") || countConditions(rules()) > 0;
}

function setLayout(next: Layout): void {
  layout = next;
  send({ type: "layout", layout });
}

// --- filtering ----------------------------------------------------------------

function refilter(): void {
  const shownIds = visible(columns(), layout).map((c) => c.id);
  const result = applyFilter(rowsInScope(), shownIds, filterSpec(), text);
  shown = result.rows;
  matches = result.matches;
}

/** After a filter changed: new rows, same header, so the input keeps its focus. */
function refreshRows(): void {
  refilter();
  drawBody();
  updateCount();
  drawToc();
}

const refreshSoon = debounce(refreshRows, 150);

// --- toolbar ------------------------------------------------------------------

function updateCount(): void {
  if (!countEl) return;
  const total = rowsInScope().length;
  countEl.textContent = filtering() ? `${matches.size} of ${total}` : `${total} rows`;
}

function toolbar(): HTMLElement {
  const bar = el("div", { class: "toolbar" });
  bar.append(button(state.toc ? "◧" : "☰", () => {
    state.toc = !state.toc;
    save();
    render();
  }, "secondary icon", state.toc ? "Hide the table of contents" : "Show the table of contents"));

  if (docs().length > 1) {
    const select = el("select", { title: "Document" }) as HTMLSelectElement;
    docs().forEach((d, i) => select.append(el("option", { value: String(i) }, d.title)));
    select.value = String(state.doc);
    select.disabled = allDocs();
    select.onchange = () => {
      state.doc = Number(select.value);
      save();
      render();
    };
    const scope = el("select", { title: "What the table shows and the filters search" }) as HTMLSelectElement;
    scope.append(el("option", { value: "doc" }, "This document"), el("option", { value: "all" }, `All documents (${docs().length})`));
    scope.value = state.scope;
    scope.onchange = () => {
      state.scope = scope.value as ViewState["scope"];
      save();
      render();
    };
    bar.append(select, scope);
  }

  const search = el("input", { type: "search", class: "search", id: "search", placeholder: "Search…  (\"a phrase\", -not, /regex/)", value: state.query });
  search.oninput = () => {
    state.query = search.value;
    save();
    refreshSoon();
  };
  bar.append(search);

  const ctx = el("label", { class: "check", title: "Keep the chapters and parents of matching rows" });
  const box = el("input", { type: "checkbox" });
  box.checked = state.context;
  box.onchange = () => {
    state.context = box.checked;
    save();
    refreshRows();
  };
  ctx.append(box, " Context");
  bar.append(ctx);

  filterBtn = button("", (e) => {
    e.stopPropagation();
    togglePanel("filter");
  }, "secondary", "Build filters: conditions on columns, in groups (all, any, none)");
  updateFilterButton();
  bar.append(filterBtn);

  bar.append(button("Clear filters", () => {
    state.query = "";
    state.columns = {};
    state.rules = structuredClone(EMPTY_GROUP);
    saveRules();
    closePanel();
    render();
  }, "secondary", "Clear the search, every column filter and the filter rules"));

  bar.append(el("span", { class: "spacer" }));
  countEl = el("span", { class: "count" });
  bar.append(countEl);
  bar.append(button(state.compact ? "Full rows" : "Compact rows", () => {
    state.compact = !state.compact;
    save();
    render();
  }, "secondary", "Show each row in full, or cut long cells short"));
  bar.append(button("Columns ▾", (e) => {
    e.stopPropagation();
    togglePanel("columns");
  }, "secondary", "Show, hide and order the columns"));
  return bar;
}

// --- columns panel ------------------------------------------------------------

function closePanel(): void {
  panel?.remove();
  panel = undefined;
  panelKind = undefined;
}

function togglePanel(kind: "columns" | "filter"): void {
  const was = panelKind;
  closePanel();
  if (was === kind) return;
  openPanel(kind);
}

function openPanel(kind: "columns" | "filter"): void {
  panelKind = kind;
  panel = kind === "columns" ? columnsPanel() : filterPanel();
  if (kind === "filter" && filterBtn) {
    // Under its button, as far right as the window allows.
    panel.style.left = `${Math.max(8, filterBtn.getBoundingClientRect().left)}px`;
    panel.style.right = "auto";
  }
  document.body.append(panel);
}

function columnsPanel(): HTMLElement {
  const box = el("div", { class: "popover" });
  box.onclick = (e) => e.stopPropagation();
  const hidden = new Set(layout.hidden);
  const list = el("ul", { class: "column-list" });
  for (const c of ordered(columns(), layout)) {
    const check = el("input", { type: "checkbox" });
    check.checked = !hidden.has(c.id);
    check.onchange = () => {
      setLayout(setHidden(layout, c.id, !check.checked));
      redraw();
    };
    const li = el("li", { draggable: "true", title: "Drag to move" }, el("span", { class: "grip" }, "⋮⋮"), el("label", {}, check, ` ${c.label}`));
    dropTarget(li, c.id, "y");
    list.append(li);
  }
  const all = button("Show all", () => {
    setLayout({ ...layout, hidden: [] });
    redraw();
  });
  const reset = button("Reset", () => {
    setLayout(defaultLayout(docs()));
    redraw();
  }, "secondary", "Every column, in the file's order, at its first width");
  box.append(el("div", { class: "popover-head" }, el("strong", {}, "Columns"), el("span", { class: "spacer" }), all, reset), list);
  return box;
}

/** Redraws after a layout change, keeping the open panel open. */
function redraw(): void {
  const open = panelKind;
  closePanel();
  render();
  if (open) openPanel(open);
}

// --- filter panel -------------------------------------------------------------
//
// As in vscode-bases: conditions (column, operator, value) in groups that need
// all, any or none of them to be true; groups nest.

function updateFilterButton(): void {
  if (!filterBtn) return;
  const n = countConditions(rules());
  filterBtn.textContent = n ? `Filter (${n}) ▾` : "Filter ▾";
  filterBtn.classList.toggle("on", n > 0);
}

const sendRules = debounce(() => send({ type: "rules", rules: rules() }), 400);

function saveRules(): void {
  save();
  sendRules();
}

/** After the rules changed: filter again, and draw the panel again when its shape changed. */
function rulesChanged(structure: boolean): void {
  saveRules();
  updateFilterButton();
  if (structure) {
    refreshRows();
    if (panelKind === "filter") {
      const scroll = panel?.querySelector(".filter-body")?.scrollTop ?? 0;
      closePanel();
      openPanel("filter");
      panel?.querySelector(".filter-body")?.scrollTo({ top: scroll });
    }
  } else {
    refreshSoon();
  }
}

function newCondition(): Condition {
  const cols = columns();
  const column = cols.find((c) => !c.id.startsWith("@"))?.id ?? cols[0]?.id ?? "";
  return { kind: "cond", column, op: "contains", value: "" };
}

/** The values a column holds, for the value field to suggest, when there are few of them. */
function suggestions(column: string): string[] {
  const values = new Set<string>();
  for (const r of rowsInScope()) {
    const t = text(r, column).trim();
    if (!t || t.length > 60) continue;
    for (const part of t.split(/\s*,\s*/)) values.add(part);
    if (values.size > 100) return [];
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function selectEl<T extends string>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void, cls?: string): HTMLSelectElement {
  const sel = el("select", { class: cls });
  for (const o of options) sel.append(el("option", { value: o.value }, o.label));
  sel.value = value;
  sel.onchange = () => onChange(sel.value as T);
  return sel;
}

/** The word before a filter that says how it joins the ones before it. */
function linkWord(conj: Conjunction, index: number): string {
  if (conj === "not") return index === 0 ? "Not" : "and not";
  return index === 0 ? "Where" : conj;
}

function filterNode(node: FilterNode, parent: FilterGroup | undefined, depth: number): HTMLElement {
  const remove = () => {
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(node), 1);
    rulesChanged(true);
  };
  if (node.kind === "group") {
    const head = el("div", { class: "row" }, selectEl(CONJUNCTIONS.map((c) => ({ value: c.conj, label: c.label })), node.conj, (v) => {
      node.conj = v;
      rulesChanged(true);
    }));
    if (depth > 0) head.append(button("×", remove, "secondary icon", "Remove group"));
    return el("div", { class: depth > 0 ? "filter-group nested" : "filter-group" },
      head,
      ...node.children.map((c, i) => el("div", { class: c.kind === "group" ? "filter-line has-group" : "filter-line" },
        el("span", { class: "conj-word" }, linkWord(node.conj, i)),
        filterNode(c, node, depth + 1))),
      el("div", { class: "row" },
        button("+ Add filter", () => {
          node.children.push(newCondition());
          rulesChanged(true);
          // The new condition's value field, ready to type in.
          const values = panel?.querySelectorAll<HTMLInputElement>("input.filter-value");
          values?.[values.length - 1]?.focus();
        }, "secondary add"),
        button("+ Add filter group", () => {
          node.children.push({ kind: "group", conj: "or", children: [newCondition()] });
          rulesChanged(true);
        }, "secondary add"),
      ),
    );
  }
  const cols = ordered(columns(), layout);
  const known = cols.some((c) => c.id === node.column);
  const colOptions = [...cols.map((c) => ({ value: c.id, label: c.label })), ...(known ? [] : [{ value: node.column, label: `${node.column} (not in this document)` }])];
  const op = OPERATORS.find((o) => o.op === node.op);
  const row = el("div", { class: "row" },
    selectEl(colOptions, node.column, (v) => {
      node.column = v;
      rulesChanged(true);
    }, "filter-column"),
    selectEl(OPERATORS.map((o) => ({ value: o.op, label: o.label })), node.op, (v: Operator) => {
      node.op = v;
      rulesChanged(true);
    }, "filter-op"),
  );
  if (op?.needsValue !== false) {
    const listId = `values-${Math.random().toString(36).slice(2)}`;
    const input = el("input", { type: "text", class: "filter-value", placeholder: node.op === "matches" ? "regular expression" : "value", value: node.value, list: listId });
    input.oninput = () => {
      node.value = input.value;
      if (node.op === "matches") input.classList.toggle("invalid", !validRegex(input.value));
      rulesChanged(false);
    };
    const list = el("datalist", { id: listId }, ...suggestions(node.column).map((v) => el("option", { value: v })));
    row.append(input, list);
  }
  row.append(button("×", remove, "secondary icon", "Remove filter"));
  return row;
}

function validRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

function filterPanel(): HTMLElement {
  const box = el("div", { class: "popover filter-panel" });
  box.onclick = (e) => e.stopPropagation();
  const clear = button("Clear", () => {
    state.rules = structuredClone(EMPTY_GROUP);
    rulesChanged(true);
  }, "secondary", "Remove every filter rule");
  const where = allDocs() ? "all documents" : "this document";
  box.append(
    el("div", { class: "popover-head" }, el("strong", {}, "Filters"), el("span", { class: "muted" }, `in ${where}`), el("span", { class: "spacer" }), clear),
    el("div", { class: "filter-body" }, filterNode(rules(), undefined, 0)),
  );
  return box;
}

/** A column can be dragged onto another, in the header (x) or in the columns panel (y). */
function dropTarget(node: HTMLElement, id: string, axis: "x" | "y"): void {
  const MIME = "application/x-reqif-column";
  node.draggable = true;
  node.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData(MIME, id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => node.classList.remove("dragging"));
  const after = (e: DragEvent) => {
    const b = node.getBoundingClientRect();
    return axis === "x" ? e.clientX > b.left + b.width / 2 : e.clientY > b.top + b.height / 2;
  };
  node.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes(MIME)) return;
    e.preventDefault();
    node.classList.toggle("drop-after", after(e));
    node.classList.toggle("drop-before", !after(e));
  });
  node.addEventListener("dragleave", () => node.classList.remove("drop-before", "drop-after"));
  node.addEventListener("drop", (e) => {
    node.classList.remove("drop-before", "drop-after");
    const moved = e.dataTransfer?.getData(MIME);
    if (!moved || moved === id) return;
    e.preventDefault();
    setLayout(move(columns(), layout, moved, id, after(e)));
    redraw();
  });
}

// --- table of contents --------------------------------------------------------

/** The chapters that hold rows the filters let through. */
function chaptersHit(): Set<string> | undefined {
  if (!filtering()) return undefined;
  const hit = new Set<string>();
  for (const r of matches) if (r.chapter) hit.add(r.chapter);
  return hit;
}

function tocTree(): { key: string; number: string; title: string; children: TocNode[]; doc?: ReqifDoc }[] {
  if (docs().length <= 1) return currentDoc()?.toc ?? [];
  // Every document of the file, its chapters below it.
  return docs().map((d) => ({ key: `doc:${d.index}`, number: "", title: d.title, children: d.toc, doc: d }));
}

function drawToc(): void {
  if (!tocEl) return;
  const scrollTop = tocEl.scrollTop;
  tocEl.replaceChildren();
  const collapsed = new Set(state.collapsed);
  const hit = chaptersHit();
  /** Whether a chapter or one below it holds a match. */
  const lit = (n: TocNode): boolean => !hit || hit.has(n.key) || n.children.some(lit);

  const head = el("div", { class: "toc-head" }, el("strong", {}, "Contents"), el("span", { class: "spacer" }));
  head.append(
    button("+", () => {
      state.collapsed = [];
      save();
      drawToc();
    }, "secondary icon", "Expand all"),
    button("−", () => {
      const keys: string[] = [];
      const walk = (ns: TocNode[]) => ns.forEach((n) => { if (n.children.length) keys.push(n.key); walk(n.children); });
      walk(tocTree());
      state.collapsed = keys;
      save();
      drawToc();
    }, "secondary icon", "Collapse all"),
  );
  tocEl.append(head);

  const list = el("div", { class: "toc-list" });
  const add = (nodes: ReturnType<typeof tocTree>, level: number) => {
    for (const n of nodes) {
      const open = !collapsed.has(n.key);
      const twisty = el("span", { class: "twisty" }, n.children.length ? (open ? "▾" : "▸") : "");
      twisty.onclick = (e) => {
        e.stopPropagation();
        state.collapsed = open ? [...state.collapsed, n.key] : state.collapsed.filter((k) => k !== n.key);
        save();
        drawToc();
      };
      const isDoc = "doc" in n && n.doc !== undefined;
      const active = isDoc ? !allDocs() && n.doc!.index === currentDoc()?.index : false;
      const item = el("div", { class: `toc-item${isDoc ? " toc-doc" : ""}${active ? " current" : ""}${lit(n) ? "" : " dim"}`, "data-key": n.key, title: n.number ? `${n.number} ${n.title}` : n.title },
        twisty, n.number ? el("span", { class: "num" }, n.number) : "", el("span", { class: "title" }, n.title));
      item.style.paddingLeft = `${4 + level * 14}px`;
      item.onclick = () => (isDoc ? openDoc(n.doc!) : goTo(n.key));
      list.append(item);
      if (open) add(n.children, level + 1);
    }
  };
  add(tocTree(), 0);
  if (!list.childElementCount) list.append(el("p", { class: "muted" }, "No chapters."));
  tocEl.append(list);
  tocEl.scrollTop = scrollTop;
  markActive();
}

function openDoc(d: ReqifDoc): void {
  if (allDocs()) {
    const first = d.rows[0];
    if (first) goTo(first.key);
    return;
  }
  state.doc = d.index;
  save();
  render();
  wrap?.scrollTo({ top: 0 });
}

/** Scrolls the table to a row; switches documents when the row is in another one. */
function goTo(key: string): void {
  const docIndex = parseInt(key, 10);
  if (!allDocs() && docIndex !== currentDoc()?.index) {
    state.doc = docIndex;
    save();
    render();
  }
  const at = shown.findIndex((r) => r.key === key);
  if (at < 0) {
    notice("This chapter is hidden by the filters.");
    return;
  }
  // Near what is drawn: draw on to it. Far away: start drawing at it, earlier rows follow when scrolled to.
  if (at < first || at >= drawn + CHUNK) drawFrom(Math.max(0, at - 20), at + CHUNK);
  else if (at >= drawn) drawRows(at + CHUNK);
  const tr = tbody?.querySelector<HTMLElement>(`tr[data-key="${CSS.escape(key)}"]`);
  if (!tr || !wrap) return;
  const head = wrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  wrap.scrollTo({ top: tr.offsetTop - head });
  // Also when the table cannot scroll that far: the chapter clicked is the one to mark.
  setActive(shown[at]!.chapter);
  pinned = key;
  tr.classList.remove("flash");
  void tr.offsetWidth;
  tr.classList.add("flash");
}

function pinnedInView(): boolean {
  if (!pinned || !wrap) return false;
  const tr = tbody?.querySelector<HTMLElement>(`tr[data-key="${CSS.escape(pinned)}"]`);
  if (!tr) return false;
  const b = tr.getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  return b.bottom > w.top && b.top < w.bottom;
}

/** Marks the chapter at the top of the table in the table of contents. */
function markActive(): void {
  if (!wrap || !tbody || !tocEl) return;
  const head = wrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  const top = wrap.scrollTop + head + 2;
  const trs = tbody.rows;
  let lo = 0;
  let hi = trs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const r = trs[mid]!;
    if (r.offsetTop + r.offsetHeight <= top) lo = mid + 1;
    else hi = mid;
  }
  // The placeholder for earlier rows is no chapter: take the first row after it.
  while (lo < trs.length - 1 && !trs[lo]!.dataset.key) lo++;
  const key = trs[lo]?.dataset.key;
  setActive(key ? shown.find((r) => r.key === key)?.chapter : undefined);
}

function setActive(chapter: string | undefined): void {
  if (!tocEl) return;
  tocEl.querySelectorAll(".toc-item.active").forEach((n) => n.classList.remove("active"));
  if (!chapter) return;
  const item = tocEl.querySelector<HTMLElement>(`.toc-item[data-key="${CSS.escape(chapter)}"]`);
  if (item) {
    item.classList.add("active");
    const list = item.parentElement!;
    const b = item.getBoundingClientRect();
    const lb = list.getBoundingClientRect();
    if (b.top < lb.top || b.bottom > lb.bottom) item.scrollIntoView({ block: "nearest" });
  }
}

function notice(message: string): void {
  const n = el("div", { class: "notice" }, message);
  document.body.append(n);
  setTimeout(() => n.remove(), 2500);
}

// --- table --------------------------------------------------------------------

function table(): HTMLElement {
  const cols = visible(columns(), layout);
  const tableEl = el("table", { class: state.compact ? "compact" : "" });
  const colgroup = el("colgroup");
  let total = 0;
  const colEls = new Map<string, HTMLTableColElement>();
  for (const c of cols) {
    const w = widthOf(c, layout);
    total += w;
    const col = el("col");
    col.style.width = `${w}px`;
    colEls.set(c.id, col);
    colgroup.append(col);
  }
  tableEl.style.width = `${total}px`;

  const names = el("tr");
  const filters = el("tr", { class: "filters" });
  for (const c of cols) {
    const label = el("span", { class: "th-label" }, c.label);
    const hide = button("×", (e) => {
      e.stopPropagation();
      setLayout(setHidden(layout, c.id, true));
      redraw();
    }, "hide", "Hide this column");
    const grip = el("div", { class: "resize", title: "Drag to resize, double-click for the first width" });
    const th = el("th", { title: c.id.startsWith("@") ? c.label : c.id }, label, hide, grip);
    dropTarget(th, c.id, "x");
    resizable(grip, th, c, colEls.get(c.id)!, tableEl);
    names.append(th);

    const input = el("input", { type: "search", class: "col-filter", placeholder: "Filter…", value: state.columns[c.id] ?? "" });
    input.oninput = () => {
      if (input.value) state.columns[c.id] = input.value;
      else delete state.columns[c.id];
      input.classList.toggle("invalid", input.value.startsWith("/") && input.value.length > 1 && !compile(input.value));
      save();
      refreshSoon();
    };
    filters.append(el("th", {}, input));
  }
  tbody = el("tbody");
  tableEl.append(colgroup, el("thead", {}, names, filters), tbody);
  return tableEl;
}

/** The right edge of a header resizes its column. */
function resizable(grip: HTMLElement, th: HTMLElement, c: Column, col: HTMLTableColElement, tableEl: HTMLTableElement): void {
  grip.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    th.draggable = false;
    const startX = e.clientX;
    const startW = widthOf(c, layout);
    const startTable = tableEl.offsetWidth;
    document.body.classList.add("resizing");
    const onMove = (m: MouseEvent) => {
      const w = Math.max(40, startW + m.clientX - startX);
      col.style.width = `${w}px`;
      tableEl.style.width = `${startTable + w - startW}px`;
    };
    const onUp = (m: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("resizing");
      th.draggable = true;
      setLayout(setWidth(layout, c.id, startW + m.clientX - startX));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  grip.onclick = (e) => e.stopPropagation();
  grip.ondblclick = (e) => {
    e.stopPropagation();
    const widths = { ...layout.widths };
    delete widths[c.id];
    setLayout({ ...layout, widths });
    redraw();
  };
}

/** The column indented by depth so the hierarchy shows: the main column, else the first with text. */
function indentColumn(cols: Column[]): string | undefined {
  return cols.find((c) => c.id === MAIN)?.id ?? cols.find((c) => !c.id.startsWith("@"))?.id;
}

function rowEl(row: Row, cols: Column[], indent: string | undefined): HTMLTableRowElement {
  const cls = [row.heading ? `heading level-${Math.min(row.depth, 5)}` : "", matches.has(row) ? "" : "context"].filter(Boolean).join(" ");
  const tr = el("tr", { "data-key": row.key, class: cls || undefined });
  for (const c of cols) {
    const td = el("td");
    const box = el("div", { class: "cell" });
    const cell = c.id === MAIN ? mainCell(row, docOf(row)) : row.cells[c.id];
    if (cell?.html) box.append(renderXhtml(cell.html, file?.resources ?? {}));
    else box.textContent = text(row, c.id);
    if (c.id === indent && row.depth > 0) td.style.paddingLeft = `${6 + row.depth * 16}px`;
    if (c.id === IDENTIFIER || c.id === NUMBER) {
      td.className = "mono";
      td.title = "Double-click to copy";
      td.ondblclick = () => send({ type: "copy", text: text(row, c.id) });
    }
    td.append(box);
    tr.append(td);
  }
  return tr;
}

/** Keeps a placeholder row at one end of the table that draws more rows when it comes into view. */
function placeholder(where: "before" | "after", cols: Column[]): void {
  tbody!.querySelector(`tr.more.${where}`)?.remove();
  const missing = where === "before" ? first : shown.length - drawn;
  if (missing <= 0) return;
  const label = where === "before" ? `↑ ${missing} earlier rows` : `Loading more rows… (${drawn} of ${shown.length})`;
  const tr = el("tr", { class: `more ${where}` }, el("td", { colspan: String(cols.length) }, label));
  if (where === "before") tbody!.prepend(tr);
  else tbody!.append(tr);
  watcher?.observe(tr);
}

/** Draws rows up to `upTo`, a chunk at a time, so large files open fast. */
function drawRows(upTo: number): void {
  if (!tbody) return;
  const cols = visible(columns(), layout);
  const indent = indentColumn(cols);
  const end = Math.min(upTo, shown.length);
  const frag = document.createDocumentFragment();
  for (; drawn < end; drawn++) frag.append(rowEl(shown[drawn]!, cols, indent));
  tbody.querySelector("tr.more.after")?.remove();
  tbody.append(frag);
  placeholder("after", cols);
}

/** Draws the chunk of rows before the first one drawn; the browser keeps the rows in view where they are. */
function drawEarlier(): void {
  if (!tbody || first === 0) return;
  const cols = visible(columns(), layout);
  const indent = indentColumn(cols);
  const from = Math.max(0, first - CHUNK);
  const frag = document.createDocumentFragment();
  for (let i = from; i < first; i++) frag.append(rowEl(shown[i]!, cols, indent));
  const top = tbody.querySelector("tr.more.before");
  const height = wrap?.scrollHeight ?? 0;
  tbody.insertBefore(frag, top ? top.nextSibling : tbody.firstChild);
  first = from;
  placeholder("before", cols);
  // Keep the rows in view where they are: the new ones go above them.
  if (wrap) wrap.scrollTop += wrap.scrollHeight - height;
}

/** Draws the rows from `from` on: all rows before it are left out until scrolled to. */
function drawFrom(from: number, upTo: number): void {
  if (!tbody) return;
  watcher?.disconnect();
  watcher = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const tr = e.target as HTMLElement;
      watcher?.unobserve(tr);
      if (tr.classList.contains("before")) drawEarlier();
      else drawRows(drawn + CHUNK);
    }
  }, { root: wrap, rootMargin: "600px" });
  tbody.replaceChildren();
  first = from;
  drawn = from;
  drawRows(upTo);
  placeholder("before", visible(columns(), layout));
}

function drawBody(): void {
  if (!tbody) return;
  tbody.replaceChildren();
  first = 0;
  drawn = 0;
  if (shown.length === 0) {
    const cols = visible(columns(), layout);
    const why = rowsInScope().length === 0 ? "This document has no rows." : "No row matches the filters.";
    tbody.append(el("tr", {}, el("td", { colspan: String(Math.max(cols.length, 1)), class: "empty" }, why)));
    return;
  }
  drawFrom(0, CHUNK);
  wrap?.scrollTo({ top: 0 });
}

// --- the page -----------------------------------------------------------------

function render(): void {
  const app = document.getElementById("app")!;
  if (error) {
    app.replaceChildren(el("p", { class: "error" }, error));
    return;
  }
  if (!file) return;
  if (docs().length === 0) {
    app.replaceChildren(el("p", { class: "empty" }, "This file holds no specification."), ...file.warnings.map((w) => el("p", { class: "warning" }, w)));
    return;
  }
  state.doc = Math.min(state.doc, docs().length - 1);
  refilter();

  const main = el("div", { class: "main" });
  tocEl = undefined;
  if (state.toc) {
    tocEl = el("nav", { class: "toc" });
    tocEl.style.width = `${state.tocWidth}px`;
    const splitter = el("div", { class: "splitter", title: "Drag to resize" });
    splitter.onmousedown = (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = state.tocWidth;
      document.body.classList.add("resizing");
      const onMove = (m: MouseEvent) => {
        state.tocWidth = Math.max(140, Math.min(800, startW + m.clientX - startX));
        tocEl!.style.width = `${state.tocWidth}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing");
        save();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
    main.append(tocEl, splitter);
  }
  wrap = el("div", { class: "table-wrap" });
  wrap.append(table());
  let ticking = false;
  wrap.onscroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      // The scroll of a jump keeps the chapter clicked, even at the end of the table.
      if (!pinnedInView()) {
        pinned = undefined;
        markActive();
      }
    });
  };
  main.append(wrap);

  const warnings = file.warnings.length ? [el("div", { class: "warning" }, ...file.warnings.map((w) => el("div", {}, `⚠ ${w}`)))] : [];
  app.replaceChildren(toolbar(), ...warnings, main);
  drawBody();
  updateCount();
  drawToc();
}

window.addEventListener("message", (e: MessageEvent<ToWebview>) => {
  const msg = e.data;
  if (msg.type === "error") {
    error = msg.message;
    file = undefined;
  } else if (msg.type === "load") {
    error = undefined;
    // The rules of this tab, else those kept for the file.
    if (!file && !state.rules?.children.length) state.rules = msg.rules ?? structuredClone(EMPTY_GROUP);
    file = msg;
    layout = msg.layout ?? defaultLayout(msg.docs);
  }
  render();
});

document.addEventListener("click", () => closePanel());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    (document.getElementById("search") as HTMLInputElement | null)?.focus();
  } else if (e.key === "Escape") {
    closePanel();
  }
});

send({ type: "ready" });
