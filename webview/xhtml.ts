// XHTML from a ReqIF file, made safe to show: only text markup survives, no
// scripts, styles, links or handlers. Embedded images show from `resources`.

const ALLOWED = new Set([
  "p", "div", "span", "br", "hr", "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "big", "small", "tt",
  "code", "pre", "blockquote", "q", "cite", "abbr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "caption", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col",
]);
const DROP = new Set(["script", "style", "iframe", "frame", "frameset", "embed", "applet", "form", "input", "button", "textarea", "select", "link", "meta", "head", "title", "svg", "math"]);
const KEEP_ATTRS = new Set(["colspan", "rowspan"]);

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function convert(node: Node, resources: Record<string, string>, out: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const e = child as Element;
    const tag = e.localName.toLowerCase();
    if (DROP.has(tag)) continue;
    if (tag === "object" || tag === "img") {
      const src = e.getAttribute(tag === "img" ? "src" : "data") ?? "";
      const url = resources[src];
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = fileName(src);
        img.title = src;
        out.appendChild(img);
      } else if (e.childNodes.length > 0) {
        // An object the webview cannot show, e.g. an OLE object: its fallback, often a picture.
        convert(e, resources, out);
      } else if (src) {
        const span = document.createElement("span");
        span.className = "attachment";
        span.textContent = `📎 ${fileName(src)}`;
        span.title = src;
        out.appendChild(span);
      }
      continue;
    }
    if (tag === "a") {
      const span = document.createElement("span");
      span.className = "link";
      const href = e.getAttribute("href");
      if (href) span.title = href;
      convert(e, resources, span);
      out.appendChild(span);
      continue;
    }
    if (!ALLOWED.has(tag)) {
      convert(e, resources, out);
      continue;
    }
    const copy = document.createElement(tag);
    for (const a of Array.from(e.attributes)) {
      if (KEEP_ATTRS.has(a.name.toLowerCase())) copy.setAttribute(a.name, a.value);
    }
    convert(e, resources, copy);
    out.appendChild(copy);
  }
}

/** The XHTML of a cell as safe DOM nodes. */
export function renderXhtml(raw: string, resources: Record<string, string>): DocumentFragment {
  // Namespace prefixes (xhtml:p, reqif-xhtml:div) off, so the HTML parser knows the tags.
  const html = raw.replace(/<(\/?)[\w-]+:([\w-]+)/g, "<$1$2").replace(/\sxmlns(:[\w-]+)?=(["']).*?\2/g, "");
  // A template is inert: nothing in it runs or loads while it is converted.
  const template = document.createElement("template");
  template.innerHTML = html;
  const out = document.createDocumentFragment();
  convert(template.content, resources, out);
  return out;
}
