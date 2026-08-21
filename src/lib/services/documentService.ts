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
 * Ceiling on the WHOLE attach operation — session check, storage upload and
 * metadata POST together — not on any one call inside it. A hung upload used
 * to leave the caller's `uploading` flag true forever, and since that flag
 * disables the wizard's "التالي"/"إرسال الطلب" buttons, a stalled request
 * meant a client who could not proceed at all and had no way out but
 * reloading the page (owner question س٣).
 *
 * WHY ONE BUDGET RATHER THAN ONE CEILING PER CALL — uploadDocumentFile() makes
 * three sequential network round trips, and can make a fourth (the rollback).
 * Giving each its own 60-second ceiling would have let a client wait three or
 * four minutes before seeing a word, which is not the minute the owner asked
 * for. So the deadline is stamped once at the top of the call and every wait
 * is raced against whatever is left of it. The number below is therefore what
 * the client actually waits, whichever stage stalls — not what any single
 * call is allowed to take.
 *
 * WHAT THE NUMBER COSTS — MAX_UPLOAD_BYTES (fileValidation.ts) is
 * 20 × 1024 × 1024 = 20,971,520 bytes ≈ 167.8 Mbit, and after the reserve
 * below the bytes get at most 50 s of the budget, so this is also a
 * throughput floor of about 3.4 Mbps: a genuinely slow-but-working upload of
 * a maximum-size file on a weak mobile link will be cut off and reported as a
 * timeout. That is the trade the 60-second figure buys.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The tail of UPLOAD_TIMEOUT_MS held back for the metadata POST, so the
 * storage upload cannot spend the whole budget and leave a finished upload
 * with no time left to be recorded.
 *
 * The POST is one small JSON round trip to our own /api/v1/documents route
 * (one auth check, two ownership checks, one insert), so 10 s is roughly an
 * order of magnitude more than it costs on a healthy link, bought for one
 * sixth of the bytes' slice.
 *
 * This is what makes the reserve a guarantee rather than a hope: stages 1 and
 * 2 are raced against UPLOAD_TIMEOUT_MS − METADATA_RESERVE_MS, so any call
 * that reaches the POST at all reaches it with more than METADATA_RESERVE_MS
 * still on the clock.
 */
const METADATA_RESERVE_MS = 10_000;

/**
 * The machine-readable cause of an upload the client stopped waiting for.
 * It lives on `UploadTimeoutError.code` and never inside `.message` — see the
 * class below for why the two are kept apart.
 */
export const UPLOAD_TIMEOUT_CODE = "upload_timeout";

/**
 * Thrown when the attach operation passes UPLOAD_TIMEOUT_MS, at whichever of
 * its stages the clock ran out.
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
 *
 * ONE SENTENCE FOR ALL THREE STAGES, deliberately: in every one of them the
 * client ends up without the attachment they were told to expect, and trying
 * again is their only move. What each stage can leave behind on the server
 * differs, and that belongs in the comments at the racing call sites below,
 * not in copy a client reads.
 *
 * HOW THE FIVE CALLERS EACH BEHAVE when they catch this — verified by reading
 * each catch block, and referenced by handler name rather than line number so
 * the note cannot rot when those files move:
 *   - useOrderAttachments.ts, attachErrorMessageAr() — isUploadTimeoutError()
 *     reads `.message` back rather than repeating the sentence, and also
 *     stops a multi-file batch instead of re-timing-out on every remaining
 *     file.
 *   - dashboard/admin/service-orders/page.tsx, deliver() — uploadErrorMessage()
 *     in _errorCopy.ts passes an already-Arabic message through unchanged, so
 *     the admin sees this specific sentence instead of its generic one.
 *   - dashboard/client/consultation/new/page.tsx, the attachment loop in the
 *     submit handler — console.error only; nothing user-visible there.
 *   - dashboard/client/documents/page.tsx, handleUpload() — renders `.message`
 *     inside "فشل رفع الملف: …", so the banner is Arabic but reads doubled.
 *   - dashboard/lawyer/cases/[id]/page.tsx, handleUpload() — `e?.message ??
 *     "…"`; `.message` is truthy, and it is the Arabic sentence rather than a
 *     bare token.
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
 * running, the bytes keep going up, and a POST we stopped waiting for may
 * still be executed server-side. This matters differently at each of the four
 * waits below, so each one says what its own leftover is. An upload we
 * stopped waiting for may still land in the bucket afterwards, leaving a
 * storage object that no `attachments` row ever points at (no metadata row at
 * all, so no `request_id`). That is already this app's norm for an
 * abandoned upload —
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
 * signal into its `post()` call, so even an untyped one would be ignored. For
 * the storage calls a race is the only tool this version leaves us. (The
 * metadata POST is a plain `fetch` and could take a real signal — but only by
 * changing apiMutate, which the whole app shares.)
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

  // One clock for the whole call, stamped before the first round trip. Each
  // wait below is raced against what is left of it rather than against a fresh
  // 60 s — see UPLOAD_TIMEOUT_MS for why that distinction is the whole point.
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  const bytesDeadline = deadline - METADATA_RESERVE_MS;
  const msUntil = (at: number) => at - Date.now();

  const supabase = createBrowserClient();

  // Wait 1 — the session check, which is a network call: it validates the
  // access token against the auth server and may refresh it. It used to run
  // unraced and it runs *before* the upload, so on a dead link the client hung
  // here and never reached the stage where the ceiling lived — a frozen screen
  // with no message, the exact failure س٣ was raised about. Racing it is what
  // makes the ceiling cover the call instead of only its middle.
  //
  // A timeout here leaves nothing behind: no object, no row, nothing uploaded.
  const {
    data: { user },
  } = await withTimeout(
    supabase.auth.getUser(),
    msUntil(bytesDeadline),
    () => new UploadTimeoutError(),
  );
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

  // Wait 2 — the bytes. Shares its deadline with the session check above, so a
  // slow session check eats into the upload's slice instead of adding to the
  // client's total wait. UploadTimeoutError carries Arabic in `.message` and
  // the token in `.code`, so every caller that renders a caught `.message`
  // renders Arabic here — the five call sites are enumerated on the class.
  //
  // A timeout here can leave an orphaned storage object (the bytes may finish
  // after we stop waiting), with no row pointing at it.
  const { error: uploadError } = await withTimeout(
    supabase.storage.from("documents").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    }),
    msUntil(bytesDeadline),
    () => new UploadTimeoutError(),
  );
  if (uploadError) throw new Error(uploadError.message);

  // Wait 3 — the metadata POST, and the one place where a timeout must NOT
  // trigger the rollback in the catch below.
  //
  // Rolling back on a timeout would delete the storage object while the insert
  // may still be executed server-side (the race cancels nothing), leaving an
  // `attachments` row whose storage_path points at a file that no longer
  // exists — a dead download button on somebody's order, strictly worse than a
  // stray object. So the timeout path keeps the object; every other failure
  // still rolls back.
  //
  // WHAT A TIMEOUT HERE LEAVES BEHIND, said plainly rather than hidden: the row
  // may well have been created, but the client never learned its id, so the
  // file is uploaded — and possibly recorded — yet never attached to the order
  // the client was filling in. If the insert never happened, the object is
  // orphaned instead. Both are leftovers a human has to clear; neither is a
  // frozen screen, and the client is told in Arabic either way.
  try {
    const response = await withTimeout(
      apiMutate<DocumentCreateResponse>(
        "/api/v1/documents",
        "POST",
        {
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          request_id: opts.requestId ?? null,
        },
      ),
      msUntil(deadline),
      () => new UploadTimeoutError(),
    );
    return response.data;
  } catch (err) {
    if (!isUploadTimeoutError(err)) {
      // Wait 4 — the rollback itself, which could freeze the client just as
      // thoroughly as the upload could. The `.catch(() => {})` swallows
      // *errors*; it bounded nothing about the *waiting*, so a POST that
      // failed fast for any non-timeout reason led
      // straight into an unbounded remove() — and on a dead link the client
      // stopped here forever with no message, the same freeze the ceiling
      // exists to prevent, one stage further along.
      //
      // Bounded by the same deadline, and its timeout is swallowed with
      // everything else: a rollback we stop waiting for just leaves the
      // orphaned object the timeout path above already leaves, and `err` — the
      // real reason the POST failed — is still what propagates to the caller.
      //
      // The `> 0` guard is defensive. Reaching this line means the POST
      // settled before the deadline, so in practice there is always time left.
      const rollbackBudget = msUntil(deadline);
      if (rollbackBudget > 0) {
        await withTimeout(
          supabase.storage.from("documents").remove([storagePath]),
          rollbackBudget,
          () => new UploadTimeoutError(),
        ).catch(() => {});
      }
    }
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
