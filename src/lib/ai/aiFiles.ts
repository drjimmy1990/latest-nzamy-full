/**
 * aiFiles.ts — the files a wave-3 tool reads (plan §1.2, §2.2 `files`).
 *
 * The browser uploads each file to the user's vault first (documentService
 * uploadDocumentFile → an `attachments` row) and sends the row ids as
 * `fileIds`. Before anything is charged, this module:
 *   1. reads those rows with the service client, keeping only the caller's own
 *      (`owner_user_id`) and not in the bin (`deleted_at` null) — the plan's
 *      shared-case access (requestFileAccess.ts) is a later step;
 *   2. refuses a type the model cannot open, more files than the tool takes,
 *      or a total over the tool's byte cap;
 *   3. downloads each file and counts its pages (pdf-lib for a PDF, one for an
 *      image) — an encrypted or broken PDF cannot be counted and is refused —
 *      and refuses a total over the tool's page cap;
 *   4. signs a 15-minute link per file for n8n, which downloads them.
 * The page total is what the tool's price is read from (L7: 30 / 150).
 *
 * Word and text files: Gemini's document input does not open a .docx, so when
 * the route passes `textFiles` (NZAMY_AI_TEXT_FILES on, textFilesConfig.ts) a
 * .docx, .txt or .md is read here as text, counted by textPages, and handed to
 * n8n as text/plain through the signed link of fileTextServe.ts. Nothing new is
 * stored. With the flag off they are refused like any other type, before the
 * charge. A legacy .doc has no reader and is refused with its own copy.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { AI_FILES_BUCKET, FILE_TEXT_TTL_MS, signFileTextToken, storagePathInOwnFolder } from "./fileTextToken.ts";
import { TEXT_FILE_MAX_CHARS, extractText, textKindOf, textPages, type TextKind } from "./textExtract.ts";
import { fileTextUrl, type TextFilesOption } from "./textFilesConfig.ts";

export interface FileRules {
  /** Files per run, at most. */
  max: number;
  /** Pages over all files, at most. */
  maxPages: number;
  /** Bytes over all files, at most. */
  maxBytes: number;
  /**
   * Wave 4: the tool also runs on the user's text alone. No fileIds (or an
   * empty list) skips the file step; any list given is checked in full.
   */
  optional?: boolean;
}

export interface AiFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  pages: number;
  url: string;
  url_expires_at: string;
}

export type FilesCheck =
  | { ok: true; files: AiFile[]; pages: number }
  | { ok: false; error: string; code: string };

/** What the model reads: PDF (text or scanned) and images. */
export const AI_FILE_MIMES: Readonly<Record<string, "pdf" | "image">> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
};

/** n8n downloads the files at once; the link outlives that by a wide margin. */
export const SIGNED_URL_SECONDS = 15 * 60;
const BUCKET = AI_FILES_BUCKET;
// `attachments.id` is a bigserial: PostgREST hands it to the browser as a JSON
// number (prod: 37, 38, 39…). A UUID is still taken, lower-cased, for any
// vault row keyed that way.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_ID = /^[1-9][0-9]{0,17}$/;

/** One id as the canonical string, or null when it is not an attachment id. */
function fileId(v: unknown): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (ROW_ID.test(t)) return t;
  return UUID.test(t) ? t.toLowerCase() : null;
}

export const FILE_COPY = {
  none: "أرفق ملفاً واحداً على الأقل",
  tooMany: (n: number) => `الحد ${n.toLocaleString("ar-SA")} ملفات في الطلب الواحد`,
  missing: "تعذّر العثور على أحد الملفات في مستنداتك — ارفعه من جديد",
  type: "نوع ملف غير مدعوم — أرفق PDF أو صورة",
  typeWithText: "نوع ملف غير مدعوم — أرفق PDF أو صورة أو Word (.docx) أو نصاً (.txt / .md)",
  doc: "ملف Word القديم (.doc) لا يُقرأ — احفظه بصيغة .docx أو PDF ثم أرفقه",
  unreadableText: "تعذّر قراءة نص أحد الملفات (قد يكون تالفاً)",
  textTooLong: "نص أحد الملفات أطول مما تقرؤه الأداة في الطلب الواحد — قسّمه على ملفين",
  size: (mb: number) => `حجم الملفات أكبر من ${mb.toLocaleString("ar-SA")} ميغابايت`,
  unreadable: "تعذّر قراءة أحد ملفات PDF (قد يكون محمياً بكلمة مرور أو تالفاً)",
  pages: (n: number) => `عدد الصفحات أكثر من ${n.toLocaleString("ar-SA")} صفحة — قسّم الملفات على طلبين`,
  unavailable: "تعذّر تجهيز الملفات الآن — حاول بعد قليل",
} as const;

/** Pages in one file, or null when a PDF cannot be opened (encrypted, corrupt). */
export async function countPages(bytes: Uint8Array, kind: "pdf" | "image"): Promise<number | null> {
  if (kind === "image") return 1;
  try {
    // An encrypted PDF throws here (ignoreEncryption stays false): the model
    // could not read it either.
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const n = doc.getPageCount();
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * The run's `fileIds`: 1..max distinct attachment ids (numbers, digit strings
 * or UUIDs), as strings, or null when any one is not an id.
 */
export function parseFileIds(raw: unknown, max: number): string[] | null | "too_many" {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const each = raw.map(fileId);
  if (each.some((v) => v === null)) return null;
  const ids = [...new Set(each as string[])];
  if (ids.length !== raw.length) return null;
  return ids.length > max ? "too_many" : ids;
}

interface Row {
  id: string | number;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
}

export async function resolveAiFiles(
  admin: SupabaseClient,
  userId: string,
  raw: unknown,
  rules: FileRules,
  now: Date = new Date(),
  opts: { textFiles?: TextFilesOption } = {},
): Promise<FilesCheck> {
  const ids = parseFileIds(raw, rules.max);
  if (ids === "too_many") return { ok: false, error: FILE_COPY.tooMany(rules.max), code: "too_many_files" };
  if (!ids) return { ok: false, error: FILE_COPY.none, code: "no_files" };

  const { data, error } = await admin
    .from("attachments")
    .select("id, file_name, storage_path, mime_type, size_bytes")
    .in("id", ids)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);
  if (error) {
    console.error("[ai/files] attachments read failed:", error.code, error.message);
    return { ok: false, error: FILE_COPY.unavailable, code: "files_unavailable" };
  }
  const rows = (Array.isArray(data) ? data : []) as Row[];
  // Someone else's file, a binned one, or an id that does not exist: all the
  // same answer, which says nothing about whose file it was.
  if (rows.length !== ids.length || rows.some((r) => !r.storage_path)) {
    return { ok: false, error: FILE_COPY.missing, code: "file_not_found" };
  }
  const ordered = ids.map((id) => rows.find((r) => String(r.id).toLowerCase() === id)!);

  // What each file is: a kind the model opens, or (flag on) a kind read as text.
  const kinds: Array<"pdf" | "image" | TextKind> = [];
  for (const r of ordered) {
    const modelKind = AI_FILE_MIMES[String(r.mime_type ?? "").toLowerCase()];
    if (modelKind) {
      kinds.push(modelKind);
      continue;
    }
    if (!opts.textFiles) return { ok: false, error: FILE_COPY.type, code: "file_type" };
    const textKind = textKindOf(r.mime_type, r.file_name);
    if (textKind === "doc") return { ok: false, error: FILE_COPY.doc, code: "file_type_doc" };
    if (!textKind) return { ok: false, error: FILE_COPY.typeWithText, code: "file_type" };
    // The link will refuse a path outside the owner's folder, so a run must not
    // start on one: it would be charged and then fail to download.
    if (!storagePathInOwnFolder(r.storage_path, userId)) return { ok: false, error: FILE_COPY.missing, code: "file_not_found" };
    kinds.push(textKind);
  }
  const mb = Math.floor(rules.maxBytes / (1024 * 1024));
  // The recorded sizes first, so an obviously oversized request downloads nothing.
  if (ordered.reduce((s, r) => s + (r.size_bytes ?? 0), 0) > rules.maxBytes) {
    return { ok: false, error: FILE_COPY.size(mb), code: "files_too_large" };
  }

  const files: AiFile[] = [];
  let pages = 0;
  let bytes = 0;
  for (const [index, r] of ordered.entries()) {
    const kind = kinds[index];
    const got = await admin.storage.from(BUCKET).download(r.storage_path!);
    if (got.error || !got.data) {
      console.error("[ai/files] download failed:", r.id, got.error?.message);
      return { ok: false, error: FILE_COPY.missing, code: "file_not_found" };
    }
    const body = new Uint8Array(await got.data.arrayBuffer());
    bytes += body.byteLength;
    if (bytes > rules.maxBytes) return { ok: false, error: FILE_COPY.size(mb), code: "files_too_large" };

    if (kind !== "pdf" && kind !== "image") {
      const extracted = extractText(kind, body);
      if (!extracted.ok) {
        return extracted.code === "docx_too_large" || extracted.code === "text_too_large"
          ? { ok: false, error: FILE_COPY.textTooLong, code: "files_too_large" }
          : { ok: false, error: FILE_COPY.unreadableText, code: "file_unreadable" };
      }
      // Refused, never cut: the link serves at most this much, and a run must
      // not be charged for a text the model would read only part of.
      const textPageCount = textPages(extracted.text);
      if (pages + textPageCount > rules.maxPages) return { ok: false, error: FILE_COPY.pages(rules.maxPages), code: "too_many_pages" };
      if (extracted.text.length > TEXT_FILE_MAX_CHARS) return { ok: false, error: FILE_COPY.textTooLong, code: "files_too_large" };
      pages += textPageCount;
      const expiresAt = now.getTime() + FILE_TEXT_TTL_MS;
      files.push({
        id: String(r.id),
        name: (r.file_name ?? "ملف").slice(0, 200),
        mime: "text/plain",
        bytes: new TextEncoder().encode(extracted.text).length,
        pages: textPageCount,
        url: fileTextUrl(opts.textFiles!.baseUrl, signFileTextToken({ a: String(r.id), u: userId, e: expiresAt }, opts.textFiles!.secret)),
        url_expires_at: new Date(expiresAt).toISOString(),
      });
      continue;
    }

    const n = await countPages(body, kind);
    if (n === null) return { ok: false, error: FILE_COPY.unreadable, code: "file_unreadable" };
    pages += n;
    if (pages > rules.maxPages) return { ok: false, error: FILE_COPY.pages(rules.maxPages), code: "too_many_pages" };

    const signed = await admin.storage.from(BUCKET).createSignedUrl(r.storage_path!, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      console.error("[ai/files] signing failed:", r.id, signed.error?.message);
      return { ok: false, error: FILE_COPY.unavailable, code: "files_unavailable" };
    }
    files.push({
      id: String(r.id),
      name: (r.file_name ?? "ملف").slice(0, 200),
      mime: String(r.mime_type).toLowerCase(),
      bytes: body.byteLength,
      pages: n,
      url: signed.data.signedUrl,
      url_expires_at: new Date(now.getTime() + SIGNED_URL_SECONDS * 1000).toISOString(),
    });
  }
  return { ok: true, files, pages };
}
