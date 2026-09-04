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
import { listFromApi, listFailed, listOk, type ListRead } from "@/lib/services/listRead";

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
  /** 'upload' | 'generated' | 'imported' | 'contract_version' — see attachments.source's CHECK. */
  source: string;
  /** Phase 6 bin (20260906_phase6_settings_out_of_browser.sql): set once soft-deleted, null otherwise. */
  deleted_at: string | null;
  deleted_by: string | null;
  legal_hold: boolean;
  hold_reason: string | null;
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
 * what uploadDocumentFile() throws. One renders `err.message` into a red
 * banner verbatim (`dashboard/lawyer/cases/[id]/page.tsx`), and three more
 * read `.message` back on purpose, as the Arabic wording for a timeout. A bare
 * token therefore reached those screens as raw English, which this project
 * forbids. Splitting the two audiences serves both in one move:
 *   - `.message` is the Arabic sentence a client may safely read.
 *   - `.code` is the token that code branches on, via isUploadTimeoutError().
 *
 * SCOPE, so nobody reads more into this than it does: this closes the timeout
 * path only. Two lines of raw English still reach the lawyer-case banner by
 * their own routes — `uploadError.message` straight from Supabase Storage, and
 * apiMutate's "API error: <status>" fallback — because that one banner renders
 * a caught `.message` whatever it holds. Neither is fixed here. The other four
 * callers never render a raw message: three map every non-timeout cause to
 * fixed Arabic copy, and the admin one passes an already-Arabic error body
 * through while replacing anything else.
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
 *   - dashboard/client/consultation/new/page.tsx, attachmentErrorAr() and the
 *     attachment loop in confirmConsultation() — same two rules as the hook,
 *     duplicated there deliberately because the hook's helper is
 *     module-private; the failures are listed per file on the confirmation
 *     screen.
 *   - dashboard/client/documents/page.tsx, uploadFailureAr() and handleFiles()
 *     — reads `.message` back unprefixed for a timeout (so the banner is one
 *     sentence, not «فشل رفع الملف: تعذّر الرفع …» twice over), maps every
 *     other cause to fixed Arabic copy, reports each file's failure as it
 *     happens and stops the batch only on a timeout.
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

// ─── Read / delete timeout ────────────────────────────────────────────────────

/**
 * Ceiling on every document call that is NOT the upload: the list GET, the
 * signed-URL request, and the delete (its API call and its storage cleanup
 * together, on one shared deadline).
 *
 * WHY THESE NEEDED BOUNDING AT ALL — bounding the upload only ever released
 * the upload. handleFiles() in dashboard/client/documents/page.tsx uploads and
 * then refreshes the list; an unbounded list GET meant the refresh could hang
 * *after* the file had already landed, so the page kept its spinner turning
 * and said nothing — the same frozen screen owner ruling س٣ was raised about,
 * one stage further along. The signed-URL call and the delete are the same
 * shape: «عرض», «تنزيل» and «حذف» each await a network call with nothing on
 * screen to say the wait has stopped being normal.
 *
 * WHY A SMALLER NUMBER THAN UPLOAD_TIMEOUT_MS — none of these three carries
 * file bytes. Each is one small JSON round trip, the same shape as the
 * metadata POST that METADATA_RESERVE_MS already funds with 10 s. This is that
 * figure with room to spare for a list response that can be far longer than a
 * single-row insert's, and well under the 60 s the upload needs, because
 * nothing here waits for 20 MB to travel.
 *
 * It is a hang detector, not a measured percentile. No timing data for these
 * routes exists in this repo and the number claims none.
 */
const DOCUMENT_OP_TIMEOUT_MS = 15_000;

/**
 * The machine-readable cause of a document read or delete the client stopped
 * waiting for. Deliberately a different token from UPLOAD_TIMEOUT_CODE, so the
 * two guards below cannot match each other's errors.
 */
export const DOCUMENT_TIMEOUT_CODE = "document_timeout";

/**
 * Thrown when getDocuments(), getDocumentFileUrl() or deleteDocument() passes
 * DOCUMENT_OP_TIMEOUT_MS.
 *
 * SEPARATE FROM UploadTimeoutError ON PURPOSE — that class's sentence opens
 * with «تعذّر الرفع», which would be a false statement on screen for a list
 * refresh, a preview link or a delete. Same mechanism (withTimeout below),
 * different fact.
 *
 * WHAT CALLERS DO WITH IT — no screen renders this `.message` today; both
 * documents pages own fixed Arabic copy for these failures, because the right
 * sentence depends on which button was pressed. dashboard/client/documents
 * does branch on isDocumentTimeoutError() in two places, fileLinkFailureAr()
 * («عرض» and «تنزيل») and handleDelete() — because there a timeout and a
 * failure are genuinely different facts:
 * a delete we stopped waiting for may still have been executed server-side, so
 * calling it a failure would be a guess printed as a statement. The Arabic
 * below exists so that a caller which *does* render `.message` later cannot
 * leak English into a banner.
 */
export class DocumentTimeoutError extends Error {
  readonly code = DOCUMENT_TIMEOUT_CODE;
  constructor() {
    super("انتهت المهلة قبل وصول ردّ الخادم. تحقق من اتصالك وحاول مجدداً.");
    this.name = "DocumentTimeoutError";
  }
}

/**
 * True when `err` is the read/delete timeout above. Two-step check for the
 * same reason as isUploadTimeoutError(): a duplicated module in a bundle would
 * break `instanceof` for an otherwise identical object.
 */
export function isDocumentTimeoutError(err: unknown): err is DocumentTimeoutError {
  if (err instanceof DocumentTimeoutError) return true;
  return err instanceof Error && (err as { code?: unknown }).code === DOCUMENT_TIMEOUT_CODE;
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
 * still be executed server-side. This matters differently at each of the
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

/**
 * Every document the signed-in user may see.
 *
 * THROWS on failure instead of returning []. It used to swallow every error
 * into an empty array, which put «لا توجد مستندات» on the client's screen
 * while their files sat safely on the server and only the network had failed —
 * a false sentence, and a failure with nothing on screen to show for it. Both
 * callers already had a catch and neither needed changing for this:
 *   - dashboard/client/documents/page.tsx — shows an Arabic banner, releases
 *     its spinner, and now suppresses the «لا توجد مستندات» empty state so the
 *     page never claims an empty library it could not read.
 *   - dashboard/lawyer/documents/page.tsx — catches to an empty list, which is
 *     byte for byte what it used to be handed.
 * Demo mode still returns [] — there is no request there to fail.
 */
export async function getDocuments(): Promise<Document[]> {
  if (!isSupabaseMode) {
    return [];
  }

  // A timeout here leaves nothing behind: a GET changes nothing server-side,
  // so the only cost of giving up on it is a view that stays stale.
  const response = await withTimeout(
    apiGet<DocumentListResponse>("/api/v1/documents"),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
  return response.data ?? [];
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

/**
 * Build a signed URL for viewing/downloading a stored document.
 *
 * NULL vs THROW, because the caller owes the client different sentences:
 *   - `null` means there is no link — demo mode, a row with no storage_path,
 *     or a sign request that came back with an error. The caller must still
 *     say so; «عرض» used to do `if (url) window.open(...)` and show nothing at
 *     all when it was null, which is a button whose failure is invisible.
 *   - a throw means we stopped waiting. «استغرق وقتاً طويلاً» and «فشل» are
 *     different facts and the client is owed the true one.
 *
 * A timeout here leaves nothing behind: signing creates no object and no row.
 */
export async function getDocumentFileUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseMode || !storagePath) return null;
  const supabase = createBrowserClient();
  const { data, error } = await withTimeout(
    supabase.storage.from("documents").createSignedUrl(storagePath, 300),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Delete a document — a SOFT delete now (Phase 6, DECISION 3 in
 * 20260906_phase6_settings_out_of_browser.sql): the row moves to the bin
 * (deleted_at/deleted_by set server-side) and the storage object is left in
 * place. The hourly cron purges the object 30 days later (attachmentPurge.ts),
 * or purgeDocument() below removes it immediately once the row is in the bin.
 *
 * STOPPED REMOVING THE STORAGE OBJECT ITSELF, on purpose — a soft delete that
 * also deleted the file would defeat the bin. `storagePath` stays in the
 * signature (five call sites across the two callers still pass it, and the
 * API's DELETE response no longer echoes it back for them to use anyway) but
 * is no longer read; kept rather than removed to avoid an unrelated signature
 * change on a function two dashboard pages already call.
 *
 * WHAT A TIMEOUT LEAVES BEHIND — racing cancels nothing, so the DELETE may
 * still be executed server-side after we give up on it. A timeout therefore
 * does NOT mean the document survived undeleted, and a caller that reports it
 * as «فشل الحذف» is printing a guess as a statement.
 * dashboard/client/documents/page.tsx says the timeout happened and asks the
 * client to refresh and check.
 */
export async function deleteDocument(id: string, _storagePath?: string | null): Promise<void> {
  if (!isSupabaseMode) return;

  await withTimeout(
    apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}`, "DELETE", {}),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
}

// ─── Bin (Phase 6) ────────────────────────────────────────────────────────────

interface TrashApiResponse {
  data?: Document[] | null;
  total?: number | null;
}

/**
 * Every soft-deleted document the signed-in user may see (`?trash=1`).
 *
 * Returns `ListRead<Document>` rather than throwing, unlike getDocuments()
 * above — this is the newer contract (listRead.ts) that lets a screen render
 * "could not read the bin" distinctly from "the bin is empty" without a
 * try/catch of its own. Demo mode reads as an honest empty list — there is no
 * request to fail.
 */
export async function getTrash(): Promise<ListRead<Document>> {
  if (!isSupabaseMode) return listOk<Document>([]);
  try {
    const response = await withTimeout(
      apiGet<TrashApiResponse>("/api/v1/documents", { trash: 1 }),
      DOCUMENT_OP_TIMEOUT_MS,
      () => new DocumentTimeoutError(),
    );
    return listFromApi(response);
  } catch {
    return listFailed<Document>();
  }
}

/** Pull a document back out of the bin (deleted_at/deleted_by cleared server-side). Throws on failure. */
export async function restoreDocument(id: string): Promise<void> {
  if (!isSupabaseMode) return;
  await withTimeout(
    apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}/restore`, "POST", {}),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
}

/**
 * Permanently remove a document already in the bin — the storage object AND
 * the row. Only valid for a row whose deleted_at is already set and which
 * carries no legal hold; the API answers 409 otherwise. Throws on failure.
 */
export async function purgeDocument(id: string): Promise<void> {
  if (!isSupabaseMode) return;
  await withTimeout(
    apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}?permanent=1`, "DELETE", {}),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
}

/**
 * Set or clear a document's legal hold. A document already in the bin cannot
 * be placed on hold (the API answers 409 — restore it first); clearing a hold
 * is always allowed. `reason` is only meaningful while `on` is true — the API
 * drops it when clearing. Throws on failure.
 */
export async function setLegalHold(id: string, on: boolean, reason?: string): Promise<void> {
  if (!isSupabaseMode) return;
  await withTimeout(
    apiMutate<{ ok: boolean }>(`/api/v1/documents/${id}/hold`, "PATCH", {
      legalHold: on,
      ...(reason !== undefined ? { holdReason: reason } : {}),
    }),
    DOCUMENT_OP_TIMEOUT_MS,
    () => new DocumentTimeoutError(),
  );
}
