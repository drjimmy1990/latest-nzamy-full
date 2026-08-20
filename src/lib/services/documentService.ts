/**
 * documentService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode document management service.
 *
 * Backed by the `attachments` table (id, request_id, owner_user_id, file_name,
 * storage_path, mime_type, size_bytes, created_at) and the `documents` storage
 * bucket (private; objects stored under `<user_id>/<timestamp>-<name>`).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  request_id: string | null;
  owner_user_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface DocumentInput {
  file_name: string;
  storage_path: string;
  mime_type?: string;
  size_bytes?: number;
  request_id?: string | null;
}

// ─── API types ────────────────────────────────────────────────────────────────

interface DocumentListResponse {
  data: Document[];
}

interface DocumentCreateResponse {
  data: Document;
}

// ─── Upload timeout ───────────────────────────────────────────────────────────

/**
 * Ceiling on how long the client waits for the storage upload before it gives
 * up. A hung upload used to leave the caller's `uploading` flag true forever —
 * and since that flag now disables the wizard's "التالي"/"إرسال الطلب"
 * buttons, a stalled request meant a client who could not proceed at all and
 * had no way out but reloading the page (owner question س٣).
 *
 * 20 MB is the largest file validateUploadFile() lets through, so 60 s is also
 * a floor of roughly 2.7 Mbps: a genuinely slow-but-working upload of a large
 * file on a weak mobile link will be cut off and reported as a timeout. That
 * is the trade the 60-second figure buys.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The machine-readable cause of an upload the client stopped waiting for.
 * It lives on `UploadTimeoutError.code` and never inside `.message` — see the
 * class below for why the two are kept apart.
 */
export const UPLOAD_TIMEOUT_CODE = "upload_timeout";

/**
 * Thrown when the storage upload passes UPLOAD_TIMEOUT_MS.
 *
 * WHY A CLASS INSTEAD OF `new Error("upload_timeout")` — five call sites catch
 * what uploadDocumentFile() throws, and two of them put `err.message` into a
 * red banner (`dashboard/lawyer/cases/[id]/page.tsx` verbatim,
 * `dashboard/client/documents/page.tsx` after an Arabic prefix). A bare token
 * therefore reached those
 * screens as raw English, which this project forbids. Splitting the two
 * audiences serves both in one move:
 *   - `.message` is the Arabic sentence a client may safely read.
 *   - `.code` is the token that code branches on, via isUploadTimeoutError().
 *
 * SCOPE, so nobody reads more into this than it does: this closes the timeout
 * path only. Two lines of raw English still reach those same two banners by
 * their own routes — `uploadError.message` straight from Supabase Storage, and
 * apiMutate's "API error: <status>" fallback. Neither is fixed here.
 *
 * The wording says only what is true: we stopped waiting. It does not claim
 * the upload was cancelled — the request may still be running, and the file
 * may still land in the bucket without ever becoming an attachment.
 */
export class UploadTimeoutError extends Error {
  readonly code = UPLOAD_TIMEOUT_CODE;
  constructor() {
    super("تعذّر الرفع — استغرق وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.");
    this.name = "UploadTimeoutError";
  }
}

/**
 * True when `err` is the upload timeout above. Tests the class first, then
 * falls back to the `code` field so the guard still holds if this module ever
 * ends up duplicated in a bundle — two copies of the class would make
 * `instanceof` false for an object that is otherwise identical.
 */
export function isUploadTimeoutError(err: unknown): err is UploadTimeoutError {
  if (err instanceof UploadTimeoutError) return true;
  return err instanceof Error && (err as { code?: unknown }).code === UPLOAD_TIMEOUT_CODE;
}

/**
 * Reject `work` with `makeError()` once `ms` have passed. The error is built
 * by a factory rather than passed in ready-made so that each timeout gets its
 * own stack trace, and so nothing is constructed on the (normal) path where
 * the work settles first.
 *
 * WHAT THIS DOES AND DOES NOT DO — racing a timer against a promise releases
 * the *caller*. It does not cancel the in-flight request: `fetch` keeps
 * running and the bytes keep going up. An upload we stopped waiting for may
 * still land in the bucket afterwards, leaving a storage object that no
 * `attachments` row ever points at (no metadata row at all, so no
 * `request_id`). That is already this app's norm for an abandoned upload —
 * the metadata-POST rollback below can leave the mirror-image leftover when
 * the POST succeeds server-side but fails for the client — and an orphaned
 * object is a far cheaper failure than a frozen client.
 *
 * Cancelling for real would need an AbortSignal, and the installed Supabase
 * storage client will not take one on `.upload()`. @supabase/storage-js
 * 2.107.0 types it as `upload(path, fileBody, fileOptions?: FileOptions)`
 * (dist/index.d.mts:882) with no third fetch-parameters argument, and
 * `FileOptions` (dist/index.d.mts:238-262) has no `signal` field — only
 * `FetchParameters` (dist/index.d.mts:356-360) does, and that type is
 * accepted by `download()`/`createSignedUrl()`, not by `upload()`. The
 * runtime agrees: `uploadOrUpdate` (dist/index.mjs:603-635) never forwards a
 * signal into its `post()` call, so even an untyped one would be ignored. A
 * race is the only tool this version leaves us.
 */
function withTimeout<T>(work: Promise<T>, ms: number, makeError: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(makeError()), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getDocuments(): Promise<Document[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    const response = await apiGet<DocumentListResponse>("/api/v1/documents");
    return response.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Upload a file to the `documents` storage bucket, then create the metadata row.
 * Throws on failure (caller is expected to surface the error to the user — no
 * silent demo fallback, since that would fake a successful upload).
 */
export async function uploadDocumentFile(
  file: File,
  opts: { requestId?: string | null } = {},
): Promise<Document> {
  if (!isSupabaseMode) {
    throw new Error("upload_unavailable_demo");
  }

  const supabase = createBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // The storage key travels inside an HTTP header on the way to S3, and HTTP
  // headers are ASCII-only — so an Arabic or spaced filename makes Supabase
  // reject the upload outright. Strip the KEY to ASCII; the original name
  // (Arabic and all) is still stored verbatim in `attachments.file_name`
  // below, and that is what the client and the admin actually see.
  const dot = file.name.lastIndexOf(".");
  const rawBase = dot > 0 ? file.name.slice(0, dot) : file.name;
  const rawExt = dot > 0 ? file.name.slice(dot + 1) : "";
  const asciiBase = rawBase
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const asciiExt = rawExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  // A fully non-Latin name sanitises to an empty string — fall back rather
  // than building a key that is just a timestamp and a dot.
  const safeName = (asciiBase || "file") + (asciiExt ? `.${asciiExt}` : "");
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;

  // The 60-second ceiling covers the storage upload only. The metadata POST
  // below is deliberately left unraced: a timeout there would run the rollback
  // and delete the storage object while the row may still be created
  // server-side (the race cancels nothing), leaving an `attachments` row whose
  // storage_path points at a file that no longer exists — strictly worse than
  // an orphaned object. Residual, stated rather than hidden: a hung metadata
  // POST still leaves the caller waiting indefinitely.
  const { error: uploadError } = await withTimeout(
    supabase.storage.from("documents").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    }),
    UPLOAD_TIMEOUT_MS,
    // UploadTimeoutError carries Arabic in `.message` and the token in
    // `.code`, so every caller that renders a caught `.message` renders Arabic
    // on this path. How the five callers each behave:
    //   - useOrderAttachments.ts — isUploadTimeoutError() also stops a
    //     multi-file batch instead of re-timing-out on every remaining file.
    //   - admin/service-orders/page.tsx:189 — uploadErrorMessage() in
    //     _errorCopy.ts passes an already-Arabic message through unchanged, so
    //     the admin now sees this specific sentence instead of its generic one.
    //   - client/consultation/new/page.tsx:194 — console.errors only; nothing
    //     user-visible changes there.
    //   - client/documents/page.tsx:215-216 — renders `.message` inside
    //     "فشل رفع الملف: …", so the banner is Arabic but reads doubled.
    //   - lawyer/cases/[id]/page.tsx:325 — `e?.message ?? "…"`; `.message` is
    //     truthy, and it is now the Arabic sentence rather than a bare token.
    () => new UploadTimeoutError(),
  );
  if (uploadError) throw new Error(uploadError.message);

  try {
    const response = await apiMutate<DocumentCreateResponse>(
      "/api/v1/documents",
      "POST",
      {
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        request_id: opts.requestId ?? null,
      },
    );
    return response.data;
  } catch (err) {
    // Roll back the storage object so we don't orphan files.
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
    throw err;
  }
}

/** Build a signed URL for viewing/downloading a stored document. */
export async function getDocumentFileUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseMode || !storagePath) return null;
  const supabase = createBrowserClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Delete a document (storage object + metadata row). */
export async function deleteDocument(id: string, storagePath?: string | null): Promise<void> {
  if (!isSupabaseMode) return;
  await apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}`, "DELETE", {});
  if (storagePath) {
    const supabase = createBrowserClient();
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
  }
}
