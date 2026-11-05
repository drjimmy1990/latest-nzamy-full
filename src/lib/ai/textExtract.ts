/**
 * textExtract.ts — the text of a .docx, .txt or .md, for the AI tools.
 *
 * The model reads PDF and images, not Word. So the server extracts the text and
 * hands n8n a text/plain file through a short-lived link (fileTextServe.ts);
 * nothing new is stored. A legacy .doc (binary CFB) has no reader among the
 * direct dependencies: it is refused with honest copy (aiFiles.FILE_COPY.doc).
 *
 * Bomb guard. A .docx is a zip, and fflate's one-shot unzipSync trusts the
 * declared size for its buffer but keeps inflating to the end of the stream: a
 * zip that understates its size comes back cut short and "ok", after any amount
 * of work. So the central directory is read here, and the one entry is inflated
 * in small compressed chunks with a count of the REAL bytes, stopping at
 * DOCX_XML_MAX_BYTES. A deflate stream expands at most about 1032:1, so one
 * chunk adds at most about 17 MB past the cap. A zip with the entry twice is
 * refused, so copies cannot multiply the work.
 *
 * Only word/document.xml is read: headers, footers, footnotes and comments are
 * not part of the text sent.
 *
 * Pure: fflate only, so `node --test` runs it. Server code only (not for a page).
 */
import { Inflate } from "fflate";

export type TextKind = "docx" | "txt" | "md";

/** The expanded word/document.xml, at most. */
export const DOCX_XML_MAX_BYTES = 20 * 1024 * 1024;
/** The stored file, at most: the AI tools' byte cap (aiFiles FileRules.maxBytes). */
export const TEXT_SOURCE_MAX_BYTES = 22 * 1024 * 1024;
/**
 * The pinned page rule: it feeds case-brief's page price and every 30-page cap.
 * Word's own count (docProps/app.xml) is not used, because it is often stale.
 */
export const TEXT_CHARS_PER_PAGE = 3000;
/** 30 pages: the most text one file may carry. */
export const TEXT_FILE_MAX_CHARS = 90_000;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_ENTRY = "word/document.xml";
const INFLATE_CHUNK_BYTES = 16 * 1024;

const MIME_KINDS: Readonly<Record<string, TextKind | "doc">> = {
  [DOCX_MIME]: "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "application/msword": "doc",
};
const EXTENSION_KINDS: Readonly<Record<string, TextKind | "doc">> = {
  docx: "docx",
  txt: "txt",
  md: "md",
  markdown: "md",
  doc: "doc",
};

/**
 * What the file is, or null when it is none of these. The mime decides; a file
 * with no useful mime (a .md usually arrives as "") goes by its extension. A
 * mime the model opens (PDF, an image) is never second-guessed by its name.
 */
export function textKindOf(mime: string | null, fileName: string | null): TextKind | "doc" | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MIME_KINDS, m)) return MIME_KINDS[m];
  if (m === "application/pdf" || m.startsWith("image/")) return null;
  const dot = (fileName ?? "").lastIndexOf(".");
  if (dot < 0) return null;
  const ext = (fileName ?? "").slice(dot + 1).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXTENSION_KINDS, ext) ? EXTENSION_KINDS[ext] : null;
}

export function textPages(text: string): number {
  return Math.max(1, Math.ceil(text.length / TEXT_CHARS_PER_PAGE));
}

/** UTF-8 (a BOM dropped), UTF-16 when its BOM says so, else legacy Arabic Windows. */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

// ── the zip ──────────────────────────────────────────────────────────────────

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARK = 0xffffffff;

interface ZipEntry {
  method: number;
  encrypted: boolean;
  compressedSize: number;
  declaredSize: number;
  localOffset: number;
}

/** The entry's central record, or null for "not a zip", "no such entry", or the entry twice. */
function findEntry(zip: Uint8Array, name: string): ZipEntry | null {
  if (zip.length < 22) return null;
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  let at = dv.getUint32(eocd + 16, true);
  if (at === ZIP64_MARK) return null;

  let found: ZipEntry | null = null;
  for (let n = 0; n < count; n++) {
    if (at + 46 > zip.length || dv.getUint32(at, true) !== CENTRAL_SIGNATURE) return null;
    const nameLength = dv.getUint16(at + 28, true);
    const extraLength = dv.getUint16(at + 30, true);
    const commentLength = dv.getUint16(at + 32, true);
    if (at + 46 + nameLength > zip.length) return null;
    const entryName = String.fromCharCode(...zip.subarray(at + 46, at + 46 + nameLength));
    if (entryName === name) {
      if (found) return null;
      found = {
        method: dv.getUint16(at + 10, true),
        encrypted: (dv.getUint16(at + 8, true) & 1) === 1,
        compressedSize: dv.getUint32(at + 20, true),
        declaredSize: dv.getUint32(at + 24, true),
        localOffset: dv.getUint32(at + 42, true),
      };
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return found;
}

/** The entry's compressed bytes, or null when its headers point outside the file. */
function entryData(zip: Uint8Array, entry: ZipEntry): Uint8Array | null {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const at = entry.localOffset;
  if (at + 30 > zip.length || dv.getUint32(at, true) !== LOCAL_SIGNATURE) return null;
  const start = at + 30 + dv.getUint16(at + 26, true) + dv.getUint16(at + 28, true);
  const end = start + entry.compressedSize;
  return end > zip.length ? null : zip.subarray(start, end);
}

/** Inflates with a count of the real bytes: "too_large" stops the work, null is a broken stream. */
function inflateCapped(data: Uint8Array, cap: number): Uint8Array[] | "too_large" | null {
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    const inflate = new Inflate((chunk) => {
      total += chunk.length;
      if (total <= cap) parts.push(chunk);
    });
    for (let at = 0; at < data.length; at += INFLATE_CHUNK_BYTES) {
      inflate.push(data.subarray(at, at + INFLATE_CHUNK_BYTES), at + INFLATE_CHUNK_BYTES >= data.length);
      if (total > cap) return "too_large";
    }
    return parts;
  } catch {
    return null;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── the document ─────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** One pass, so `&amp;lt;` stays `&lt;`. An entity it cannot read stays as written. */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g, (whole, dec, hex, named) => {
    if (named) return NAMED_ENTITIES[named];
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/**
 * Document order, in one regex: text runs, tabs, breaks and paragraph ends. A
 * `<w:tab w:val=…/>` inside `<w:tabs>` is a tab stop, not a tab, so only the
 * bare form counts. `<w:delText>` (a tracked deletion) is not matched.
 */
const DOCX_TOKEN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|(<w:tab\s*\/>)|(<w:br(?:\s[^>]*)?\/>|<w:cr(?:\s[^>]*)?\/>|<\/w:p>)/g;

function documentText(xml: string): string {
  const out: string[] = [];
  for (const m of xml.matchAll(DOCX_TOKEN)) {
    if (m[1] !== undefined) out.push(decodeEntities(m[1]));
    else out.push(m[2] ? "\t" : "\n");
  }
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractDocxText(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; code: "docx_unreadable" | "docx_too_large" } {
  const unreadable = { ok: false, code: "docx_unreadable" } as const;
  const tooLarge = { ok: false, code: "docx_too_large" } as const;
  const entry = findEntry(bytes, DOCUMENT_ENTRY);
  if (!entry || entry.encrypted) return unreadable;
  if (entry.declaredSize !== ZIP64_MARK && entry.declaredSize > DOCX_XML_MAX_BYTES) return tooLarge;
  const data = entryData(bytes, entry);
  if (!data) return unreadable;

  let xml: Uint8Array;
  if (entry.method === 0) {
    if (data.length > DOCX_XML_MAX_BYTES) return tooLarge;
    xml = data;
  } else if (entry.method === 8) {
    const parts = inflateCapped(data, DOCX_XML_MAX_BYTES);
    if (parts === "too_large") return tooLarge;
    if (!parts) return unreadable;
    xml = concat(parts);
  } else {
    return unreadable;
  }
  const text = documentText(new TextDecoder("utf-8").decode(xml));
  return text ? { ok: true, text } : unreadable;
}

export type ExtractCode = "docx_unreadable" | "docx_too_large" | "text_unreadable" | "text_too_large";

/**
 * The one entry point for the file checks (aiFiles) and the link (fileTextServe),
 * so the text that was counted and priced is the text that is served. A binary
 * named .txt (a NUL in it) and an empty text are refused: nobody pays for nothing.
 */
export function extractText(kind: TextKind, bytes: Uint8Array): { ok: true; text: string } | { ok: false; code: ExtractCode } {
  if (kind === "docx") {
    return bytes.length > TEXT_SOURCE_MAX_BYTES ? { ok: false, code: "docx_too_large" } : extractDocxText(bytes);
  }
  if (bytes.length > TEXT_SOURCE_MAX_BYTES) return { ok: false, code: "text_too_large" };
  const text = decodeTextBytes(bytes).trim();
  if (!text || text.includes("\0")) return { ok: false, code: "text_unreadable" };
  return { ok: true, text };
}
