// A .reqif or .reqifz file, read into the documents it holds. A .reqifz is a
// ZIP archive of one or more .reqif files and the files they embed.

import { unzipSync } from "fflate";
import type { ReqifDoc, ReqifFile } from "./model";
import { parseReqif } from "./reqif";

export interface Loaded extends ReqifFile {
  /** The other files of a .reqifz, by their path in the archive. */
  attachments: Map<string, Uint8Array>;
}

export function isArchive(name: string): boolean {
  return /\.reqifz$/i.test(name) || /\.zip$/i.test(name);
}

export function load(name: string, bytes: Uint8Array): Loaded {
  const warnings: string[] = [];
  const attachments = new Map<string, Uint8Array>();
  const sources: { name: string; xml: string }[] = [];
  if (isArchive(name)) {
    const entries = unzipSync(bytes);
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith("/")) continue;
      if (/\.reqif$/i.test(path)) sources.push({ name: path, xml: new TextDecoder().decode(data) });
      else attachments.set(path, data);
    }
    if (sources.length === 0) warnings.push("The archive holds no .reqif file.");
    sources.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sources.push({ name: name.split(/[\\/]/).pop() ?? name, xml: new TextDecoder().decode(bytes) });
  }

  const docs: ReqifDoc[] = [];
  for (const src of sources) {
    try {
      const parsed = parseReqif(src.xml);
      if (parsed.docs.length === 0) warnings.push(`${src.name}: no specification.`);
      for (const d of parsed.docs) {
        const index = docs.length;
        // Row keys start with the document's index in the file, not in its .reqif.
        for (const row of d.rows) {
          row.key = rekey(row.key, index);
          if (row.parent) row.parent = rekey(row.parent, index);
          if (row.chapter) row.chapter = rekey(row.chapter, index);
        }
        const fixToc = (nodes: ReqifDoc["toc"]) => nodes.forEach((n) => { n.key = rekey(n.key, index); fixToc(n.children); });
        fixToc(d.toc);
        const title = sources.length > 1 && parsed.docs.length === 1 && d.title === d.id ? parsed.title || src.name : d.title;
        docs.push({ ...d, title, index, source: src.name });
      }
    } catch (e) {
      warnings.push(`${src.name}: ${(e as Error).message}`);
    }
  }
  return { docs, warnings, attachments };
}

function rekey(key: string, index: number): string {
  return `${index}:${key.slice(key.indexOf(":") + 1)}`;
}

/** The archive path a reference from a .reqif inside the archive points to. */
export function resolveIn(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.replace(/\\/g, "/").split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function imageType(path: string): string | undefined {
  return IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
}
