/**
 * accountDeletionServer.ts — the IO half of D6, account deletion (owner ٢٩٨).
 * The pure half (who is frozen, the copy, the error classes) is
 * src/lib/auth/accountFreeze.ts. The database half is
 * supabase/migrations/20261026_70_account_deletion.sql.
 *
 * Every function takes the SERVICE-ROLE client: app_metadata is written only
 * by the service role, and the purge functions are granted to it alone.
 *
 *   syncFreezeMetadata      the gates' cached copy (app_metadata) ← the table
 *   freezeAccountWith       admin «تجميد ثم حذف بعد ٦٠ يوماً»
 *   cancelAccountFreezeWith admin «استعادة الحساب المجمّد»
 *   purgeAccountWith        one claimed request: prepare (a dry run) →
 *                           deleteUser → the file list → Storage → finish. The
 *                           cron and «حذف نهائي الآن» both use it.
 *   purgeNowWith            «حذف نهائي الآن» after its claim: the gates' copy
 *                           says frozen BEFORE the purge runs, and stays frozen
 *                           whenever the account survives it (blocked / retry).
 *
 * ── WHY NOTHING IS WRITTEN BEFORE deleteUser ───────────────────────────────
 * A refused deleteUser ends the request as `blocked`, and a blocked account
 * can still be restored. So `account_purge_prepare` is a dry run: the keep
 * rules (firm rows to the firm owner, documents kept for the other party, the
 * buyer on the invoices) run only inside the auth.users trigger, in the
 * delete's own transaction — a refused delete rolls them back. The files to
 * remove are listed only AFTER the delete (`account_purge_storage_paths`,
 * which refuses while the account exists), from what no surviving row
 * references. A failed list or remove is recorded on the request
 * (`storage_failed`) for a hand clean-up; the rows are already gone.
 *
 * ── THE LETTERHEAD LOGO ────────────────────────────────────────────────────
 * The lawyer's own letterhead vault (20261026_63) goes with his profile (its
 * FK cascades), but its logo lives in the private `branding` bucket under
 * `u/<his id>/`, which account_purge_storage_paths (the `documents` bucket)
 * does not list. After the delete, every object in that folder is removed —
 * the current logo and any an earlier upload left (each upload takes a fresh
 * name). A firm's vault (`f/<firm id>/`) belongs to the firm and is never
 * touched by a member's purge. A failed list (63 not run: no bucket) or
 * remove is recorded on the request like the documents' (`branding_failed`).
 * The same `u/<his id>/` folder of the `branding-files` bucket (his uploaded
 * Word / PDF letterhead, stamp and signature — 20261030_10) is cleared the
 * same way, right after; that bucket not existing yet means nothing to clear.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeAppMetadata,
  classifyDeleteUserError,
  deletionErrorAr,
  freezeStateFromUser,
  frozenAppMetadata,
  isMissingAccountDeletionSchema,
  normalizeOwnerBlock,
  type EntityOwnerBlock,
  type PurgeOutcome,
} from "../auth/accountFreeze.ts";
import { BRANDING_BUCKET } from "../branding/brandingVault.ts";
import { BRANDING_FILES_BUCKET } from "../branding/brandingAssets.ts";

export const DELETION_SCHEMA_MISSING_AR =
  "تجميد الحساب غير متاح بعد: لم يُنفَّذ ملف قاعدة البيانات 20261026_70 (حذف الحساب).";

const STORAGE_BUCKET = "documents";
const REMOVE_CHUNK = 100;
const BRANDING_LIST_PAGE = 100;

export interface DeletionRequestView {
  id: string;
  status: string;
  requested_at: string;
  purge_after: string;
  requested_by?: string;
}

export type DeletionResult =
  | { ok: true; request: DeletionRequestView | null }
  | { ok: false; status: number; error: string; schemaMissing?: boolean };

interface RpcError {
  code?: string | null;
  message?: string | null;
}

function refusalStatus(err: RpcError): number {
  if (err.code === "42501") return 403;
  if (err.code === "55000") return 409;
  if (err.code === "P0002") return 404;
  return 500;
}

/**
 * Writes the gates' copy of the freeze. Reads the user first and spreads his
 * existing app_metadata (provider, providers…), so nothing else is lost. A
 * no-op when the copy already says the same thing.
 */
export async function syncFreezeMetadata(
  admin: SupabaseClient,
  userId: string,
  want: { frozen: boolean; purgeAfter: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return { ok: false, error: error?.message ?? "user not found" };
  const current = freezeStateFromUser(data.user);
  if (current.frozen === want.frozen && (!want.frozen || current.purgeAfter === want.purgeAfter)) {
    return { ok: true };
  }
  const next = want.frozen
    ? frozenAppMetadata(data.user.app_metadata, want.purgeAfter)
    : activeAppMetadata(data.user.app_metadata);
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { app_metadata: next });
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

/** The user's active request (requested / purging / blocked), read with any client the caller may use. */
export async function readActiveRequest(
  client: SupabaseClient,
  userId: string,
): Promise<{ ok: true; request: DeletionRequestView | null } | { ok: false; schemaMissing: boolean; error: string }> {
  const { data, error } = await client
    .from("account_deletion_requests")
    .select("id, status, requested_at, purge_after, requested_by")
    .eq("user_id", userId)
    .in("status", ["requested", "purging", "blocked"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, schemaMissing: isMissingAccountDeletionSchema(error.code), error: error.message };
  }
  return { ok: true, request: (data as DeletionRequestView | null) ?? null };
}

/**
 * Owner ٣٠٧: the entity whose ownership blocks the CALLER's own deletion
 * (20261030_10 account_deletion_owner_block(), auth.uid() only), read with
 * the caller's session. Null when there is none, and also when the function
 * is not there yet or the read fails — the database still refuses the request
 * itself (request_account_deletion, 55000), so null only means "not known in
 * advance".
 */
export async function readOwnerBlock(client: SupabaseClient): Promise<EntityOwnerBlock | null> {
  try {
    const { data, error } = await client.rpc("account_deletion_owner_block");
    if (error) {
      if (!isMissingAccountDeletionSchema(error.code)) {
        console.error("[accountDeletion] reading the caller's owner block failed:", error.code, error.message);
      }
      return null;
    }
    return normalizeOwnerBlock(data);
  } catch (err) {
    console.error("[accountDeletion] reading the caller's owner block threw:", err);
    return null;
  }
}

/** Admin freeze: the row first, then the gates' copy; a failed copy undoes the row. */
export async function freezeAccountWith(
  admin: SupabaseClient,
  args: { userId: string; actorId: string; reason: string | null },
): Promise<DeletionResult> {
  const { data, error } = await admin.rpc("account_deletion_request_for", {
    p_user: args.userId,
    p_actor: args.actorId,
    p_reason: args.reason,
  });
  if (error) {
    if (isMissingAccountDeletionSchema(error.code)) {
      return { ok: false, status: 503, error: DELETION_SCHEMA_MISSING_AR, schemaMissing: true };
    }
    return { ok: false, status: refusalStatus(error), error: deletionErrorAr(error.message) };
  }
  const request = data as DeletionRequestView;
  const synced = await syncFreezeMetadata(admin, args.userId, { frozen: true, purgeAfter: request.purge_after ?? null });
  if (!synced.ok) {
    console.error("[accountDeletion] freeze: writing app_metadata failed — undoing the request:", synced.error);
    await admin.rpc("account_deletion_cancel_for", { p_user: args.userId, p_actor: args.actorId });
    return { ok: false, status: 500, error: "تعذّر تجميد الحساب الآن. لم يتغير شيء، أعد المحاولة." };
  }
  return { ok: true, request };
}

/** Admin restore: cancels the request, then lifts the gates' copy (always re-synced). */
export async function cancelAccountFreezeWith(
  admin: SupabaseClient,
  args: { userId: string; actorId: string },
): Promise<DeletionResult & { cancelled?: boolean }> {
  const { data, error } = await admin.rpc("account_deletion_cancel_for", { p_user: args.userId, p_actor: args.actorId });
  if (error && !isMissingAccountDeletionSchema(error.code)) {
    return { ok: false, status: 500, error: deletionErrorAr(error.message) };
  }
  const still = error ? null : await readActiveRequest(admin, args.userId);
  if (still && still.ok && still.request) {
    // A purge holds the row: the copy stays frozen.
    return { ok: false, status: 409, error: "يجري حذف هذا الحساب الآن ولا يمكن استعادته." };
  }
  const synced = await syncFreezeMetadata(admin, args.userId, { frozen: false, purgeAfter: null });
  if (!synced.ok) {
    console.error("[accountDeletion] restore: writing app_metadata failed:", synced.error);
    return { ok: false, status: 500, error: "أُلغي طلب الحذف، لكن تعذّر فتح الحساب الآن. أعد المحاولة." };
  }
  return { ok: true, request: null, cancelled: data === true };
}

export interface PurgeRun {
  outcome: PurgeOutcome;
  reason?: string;
  storageRemoved: number;
  storageFailed: number;
}

async function finish(
  admin: SupabaseClient,
  requestId: string,
  outcome: PurgeOutcome,
  report: Record<string, unknown>,
  errorText: string | null,
): Promise<void> {
  const { error } = await admin.rpc("account_purge_finish", {
    p_request: requestId,
    p_outcome: outcome,
    p_report: report,
    p_error: errorText,
  });
  if (error) console.error("[accountDeletion] finish failed:", requestId, outcome, error.code, error.message);
}

/**
 * After the account is gone: every object under `u/<userId>/` in the
 * `branding` bucket (the lawyer's letterhead logo, current and replaced).
 * Never `f/…` — a firm's logo is the firm's. Lists the whole folder first,
 * then removes it, so paging is not shifted by the removals.
 */
export async function removeLawyerBrandingWith(
  admin: SupabaseClient,
  userId: string,
): Promise<{ removed: number; failed: string[] | "list_failed" }> {
  const logos = await removeBrandingFolderWith(admin.storage.from(BRANDING_BUCKET), BRANDING_BUCKET, userId, false);
  const files = await removeBrandingFolderWith(admin.storage.from(BRANDING_FILES_BUCKET), BRANDING_FILES_BUCKET, userId, true);
  const failed = logos.failed === "list_failed" || files.failed === "list_failed"
    ? "list_failed" as const
    : [...logos.failed, ...files.failed];
  return { removed: logos.removed + files.removed, failed };
}

async function removeBrandingFolderWith(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  bucketId: string,
  userId: string,
  missingBucketIsEmpty: boolean,
): Promise<{ removed: number; failed: string[] | "list_failed" }> {
  const folder = `u/${userId.toLowerCase()}`;
  const paths: string[] = [];
  for (let offset = 0; ; offset += BRANDING_LIST_PAGE) {
    const { data, error } = await bucket.list(folder, { limit: BRANDING_LIST_PAGE, offset });
    if (error) {
      // 20261030_10 not run yet: no stationery bucket, so no stationery to clear.
      if (missingBucketIsEmpty && /bucket/i.test(error.message ?? "") && /not found/i.test(error.message ?? "")) {
        return { removed: 0, failed: [] };
      }
      console.error("[accountDeletion] listing the letterhead folder failed:", bucketId, folder, error.message);
      return { removed: 0, failed: "list_failed" };
    }
    const page = (data ?? []) as Array<{ name?: unknown; id?: unknown }>;
    for (const entry of page) {
      // A sub-folder comes back with id null; the vault writes none.
      if (typeof entry.name === "string" && entry.name && entry.id !== null) paths.push(`${folder}/${entry.name}`);
    }
    if (page.length < BRANDING_LIST_PAGE) break;
  }
  let removed = 0;
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await bucket.remove(chunk);
    if (error) {
      console.error("[accountDeletion] letterhead files remove failed:", bucketId, folder, error.message);
      failed.push(...chunk);
    } else {
      removed += chunk.length;
    }
  }
  return { removed, failed };
}

/**
 * One claimed request (status `purging`). Idempotent: a re-run after a crash
 * re-prepares (the keep rules are idempotent) and deleteUser of a user who is
 * already gone counts as purged.
 */
export async function purgeAccountWith(
  admin: SupabaseClient,
  args: { requestId: string; userId: string },
): Promise<PurgeRun> {
  const run: PurgeRun = { outcome: "retry", storageRemoved: 0, storageFailed: 0 };

  const prep = await admin.rpc("account_purge_prepare", { p_user: args.userId });
  if (prep.error) {
    // An error the database answered (a SQLSTATE / PGRST code: a trigger, a
    // privilege, a column) is deterministic — blocked, not re-claimed every
    // day. Only a transport failure (no code) is retried.
    const outcome: PurgeOutcome = prep.error.code ? "blocked" : "retry";
    await finish(admin, args.requestId, outcome, {}, `prepare: ${prep.error.code ?? ""} ${prep.error.message}`);
    return { ...run, outcome, reason: "prepare_failed" };
  }
  const prepared = (prep.data ?? {}) as { ok?: boolean; blocked?: string; keep_preview?: unknown };
  if (!prepared.ok) {
    await finish(admin, args.requestId, "blocked", { prepare: prepared }, `blocked: ${prepared.blocked ?? "unknown"}`);
    return { ...run, outcome: "blocked", reason: prepared.blocked ?? "unknown" };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(args.userId);
  if (deleteError) {
    const verdict = classifyDeleteUserError(deleteError.message);
    if (verdict.outcome !== "purged") {
      await finish(admin, args.requestId, verdict.outcome, { preview: prepared.keep_preview ?? null }, `deleteUser: ${verdict.reason}: ${deleteError.message}`);
      return { ...run, outcome: verdict.outcome, reason: verdict.reason };
    }
  }

  // Only now, with the account gone: what of his folders no kept row uses.
  const listed = await admin.rpc("account_purge_storage_paths", { p_user: args.userId });
  if (listed.error) {
    console.error("[accountDeletion] listing the files failed:", args.requestId, listed.error.code, listed.error.message);
    const branding = await removeLawyerBrandingWith(admin, args.userId);
    run.storageRemoved += branding.removed;
    run.storageFailed += Array.isArray(branding.failed) ? branding.failed.length : 0;
    await finish(
      admin,
      args.requestId,
      "purged",
      {
        preview: prepared.keep_preview ?? null,
        storage_removed: 0,
        storage_failed: "list_failed",
        branding_removed: branding.removed,
        branding_failed: branding.failed,
      },
      null,
    );
    return { ...run, outcome: "purged", reason: "storage_list_failed" };
  }
  const paths = Array.isArray(listed.data)
    ? (listed.data as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];

  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error: removeError } = await admin.storage.from(STORAGE_BUCKET).remove(chunk);
    if (removeError) {
      console.error("[accountDeletion] storage remove failed:", args.requestId, removeError.message);
      failed.push(...chunk);
    } else {
      run.storageRemoved += chunk.length;
    }
  }
  run.storageFailed = failed.length;
  const documentsRemoved = run.storageRemoved;

  const branding = await removeLawyerBrandingWith(admin, args.userId);
  run.storageRemoved += branding.removed;
  run.storageFailed += Array.isArray(branding.failed) ? branding.failed.length : 0;

  await finish(
    admin,
    args.requestId,
    "purged",
    {
      preview: prepared.keep_preview ?? null,
      storage_removed: documentsRemoved,
      storage_failed: failed,
      branding_removed: branding.removed,
      branding_failed: branding.failed,
    },
    null,
  );
  return { ...run, outcome: "purged" };
}

export type PurgeNowResult =
  | { ok: true; run: PurgeRun }
  /** The account survived the purge; the gates' copy is frozen (or the request was cancelled when it could not be). */
  | { ok: false; run: PurgeRun; frozen: boolean };

/** The active request's purge date, for the gates' copy. Null when unreadable or none. */
async function activePurgeAfter(admin: SupabaseClient, userId: string): Promise<{ active: boolean; purgeAfter: string | null }> {
  const active = await readActiveRequest(admin, userId);
  if (!active.ok || !active.request) return { active: false, purgeAfter: null };
  return { active: true, purgeAfter: active.request.purge_after ?? null };
}

/**
 * «حذف نهائي الآن» once `account_purge_claim_user` holds the request. The
 * account is frozen in the gates' copy BEFORE the purge (it signs in only to
 * /account-frozen while it runs), and stays frozen when the purge does not end
 * it (blocked, or retry: the row is back to `requested` with its own
 * purge_after). Never a `requested` / `blocked` row whose user is not frozen:
 * when the copy cannot be written, the request is cancelled instead (the
 * admin is told), exactly as freezeAccountWith undoes a failed freeze.
 */
export async function purgeNowWith(
  admin: SupabaseClient,
  args: { requestId: string; userId: string; actorId: string },
): Promise<PurgeNowResult> {
  const before = await activePurgeAfter(admin, args.userId);
  const early = await syncFreezeMetadata(admin, args.userId, { frozen: true, purgeAfter: before.purgeAfter });
  if (!early.ok) console.error("[accountDeletion] purge now: freezing app_metadata first failed:", early.error);

  const run = await purgeAccountWith(admin, { requestId: args.requestId, userId: args.userId });
  if (run.outcome === "purged") return { ok: true, run };

  const after = await activePurgeAfter(admin, args.userId);
  if (!after.active) {
    // Nothing holds the account any more (cancelled meanwhile): lift the copy.
    await syncFreezeMetadata(admin, args.userId, { frozen: false, purgeAfter: null });
    return { ok: false, run, frozen: false };
  }
  const synced = await syncFreezeMetadata(admin, args.userId, { frozen: true, purgeAfter: after.purgeAfter });
  if (synced.ok) return { ok: false, run, frozen: true };

  console.error("[accountDeletion] purge now: the account survived but app_metadata could not be frozen — cancelling the request:", synced.error);
  await admin.rpc("account_deletion_cancel_for", { p_user: args.userId, p_actor: args.actorId });
  return { ok: false, run, frozen: false };
}
