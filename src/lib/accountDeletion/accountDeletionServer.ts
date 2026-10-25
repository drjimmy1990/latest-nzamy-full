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
 *   purgeAccountWith        one claimed request: prepare → deleteUser → Storage
 *                           → finish. The cron and «حذف نهائي الآن» both use it.
 *
 * ── WHY deleteUser BEFORE THE STORAGE REMOVE ───────────────────────────────
 * A refused deleteUser ends the request as `blocked`, and a blocked account
 * can still be restored. If its files had already been removed, it would come
 * back with documents that point at nothing. So the bytes go only once the
 * account is gone. A failed remove after that is recorded on the request
 * (`storage_failed`) for a hand clean-up; the rows are already gone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeAppMetadata,
  classifyDeleteUserError,
  deletionErrorAr,
  freezeStateFromUser,
  frozenAppMetadata,
  isMissingAccountDeletionSchema,
  type PurgeOutcome,
} from "@/lib/auth/accountFreeze";

export const DELETION_SCHEMA_MISSING_AR =
  "تجميد الحساب غير متاح بعد: لم يُنفَّذ ملف قاعدة البيانات 20261026_70 (حذف الحساب).";

const STORAGE_BUCKET = "documents";
const REMOVE_CHUNK = 100;

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
    await finish(admin, args.requestId, "retry", {}, `prepare: ${prep.error.code ?? ""} ${prep.error.message}`);
    return { ...run, reason: "prepare_failed" };
  }
  const prepared = (prep.data ?? {}) as { ok?: boolean; blocked?: string; storage_paths?: unknown; keep?: unknown };
  if (!prepared.ok) {
    await finish(admin, args.requestId, "blocked", { prepare: prepared }, `blocked: ${prepared.blocked ?? "unknown"}`);
    return { ...run, outcome: "blocked", reason: prepared.blocked ?? "unknown" };
  }
  const paths = Array.isArray(prepared.storage_paths)
    ? prepared.storage_paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];

  const { error: deleteError } = await admin.auth.admin.deleteUser(args.userId);
  if (deleteError) {
    const verdict = classifyDeleteUserError(deleteError.message);
    if (verdict.outcome !== "purged") {
      await finish(admin, args.requestId, verdict.outcome, { keep: prepared.keep ?? null }, `deleteUser: ${verdict.reason}: ${deleteError.message}`);
      return { ...run, outcome: verdict.outcome, reason: verdict.reason };
    }
  }

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

  await finish(
    admin,
    args.requestId,
    "purged",
    { keep: prepared.keep ?? null, storage_removed: run.storageRemoved, storage_failed: failed },
    null,
  );
  return { ...run, outcome: "purged" };
}
