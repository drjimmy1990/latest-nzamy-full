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
 * DOCX is not accepted: Gemini's document input does not open it, so the user
 * is asked to save it as PDF instead of being charged for a file the model
 * cannot read.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

export interface FileRules {
  /** Files per run, at most. */
  max: number;
  /** Pages over all files, at most. */
  maxPages: number;
  /** Bytes over all files, at most. */
  maxBytes: number;
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
const BUCKET = "documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FILE_COPY = {
  none: "أرفق ملفاً واحداً على الأقل",
  tooMany: (n: number) => `الحد ${n.toLocaleString("ar-SA")} ملفات في الطلب الواحد`,
  missing: "تعذّر العثور على أحد الملفات في مستنداتك — ارفعه من جديد",
  type: "نوع ملف غير مدعوم — أرفق PDF أو صورة (ملف Word: احفظه PDF ثم أرفقه)",
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

/** The run's `fileIds`: 1..max distinct UUIDs, or null. */
export function parseFileIds(raw: unknown, max: number): string[] | null | "too_many" {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))];
  if (ids.length !== raw.length) return null;
  return ids.length > max ? "too_many" : ids;
}

interface Row {
  id: string;
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
  const ordered = ids.map((id) => rows.find((r) => r.id.toLowerCase() === id)!);

  for (const r of ordered) {
    if (!AI_FILE_MIMES[String(r.mime_type ?? "").toLowerCase()]) return { ok: false, error: FILE_COPY.type, code: "file_type" };
  }
  const mb = Math.floor(rules.maxBytes / (1024 * 1024));
  // The recorded sizes first, so an obviously oversized request downloads nothing.
  if (ordered.reduce((s, r) => s + (r.size_bytes ?? 0), 0) > rules.maxBytes) {
    return { ok: false, error: FILE_COPY.size(mb), code: "files_too_large" };
  }

  const files: AiFile[] = [];
  let pages = 0;
  let bytes = 0;
  for (const r of ordered) {
    const kind = AI_FILE_MIMES[String(r.mime_type).toLowerCase()];
    const got = await admin.storage.from(BUCKET).download(r.storage_path!);
    if (got.error || !got.data) {
      console.error("[ai/files] download failed:", r.id, got.error?.message);
      return { ok: false, error: FILE_COPY.missing, code: "file_not_found" };
    }
    const body = new Uint8Array(await got.data.arrayBuffer());
    bytes += body.byteLength;
    if (bytes > rules.maxBytes) return { ok: false, error: FILE_COPY.size(mb), code: "files_too_large" };
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
      id: r.id,
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
