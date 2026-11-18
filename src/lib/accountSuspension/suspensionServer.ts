/**
 * suspensionServer.ts — the writes of a real admin suspension (TODO 3.5,
 * ticket S7). Every function takes the SERVICE-ROLE client (the caller has
 * already passed requireStaff("users.suspend")); the pure half and the gates
 * are in src/lib/auth/accountSuspension.ts.
 *
 *   suspendAccountWith   GoTrue ban (ban_duration) + app_metadata copy in ONE
 *                        admin update, then the open sessions are ended
 *                        (public.admin_revoke_user_sessions, 20261124_60).
 *   liftSuspensionWith   ban_duration "none" + app_metadata "active".
 *   freezeEntitlementsWith / thawEntitlementsWith  owner ٢٥ (20261127_60):
 *                        the suspension freezes what is live; the lift gives
 *                        the suspended days back. Nothing is cancelled.
 *   readSuspendedIds     which of a page of ids are banned now
 *                        (public.admin_suspended_user_ids), for the admin list.
 *
 * No `next/*` or `@/` imports, so `node --test` loads it with a fake client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUSPENSION_BAN_DURATION,
  LIFT_BAN_DURATION,
  suspendedAppMetadata,
  activeSuspensionAppMetadata,
  isMissingSuspensionSchema,
} from "../auth/accountSuspension.ts";

/** How the open sessions fared after the ban. */
export type SessionsOutcome =
  | { state: "ended"; count: number }
  /** 20261124_60 has not run: the ban and the app gates hold; open tokens live until they expire. */
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

export type SuspendResult =
  | { ok: true; sessions: SessionsOutcome }
  | { ok: false; status: 404 | 500; error: string };

export type LiftResult = { ok: true } | { ok: false; status: 404 | 500; error: string };

type Admin = Pick<SupabaseClient, "auth" | "rpc">;

async function readAuthUser(
  admin: Admin,
  userId: string,
): Promise<{ ok: true; appMetadata: unknown } | { ok: false; status: 404 | 500; error: string }> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    const status = (error as { status?: number } | null)?.status === 404 || (!error && !data?.user) ? 404 : 500;
    return { ok: false, status, error: error?.message ?? "user not found" };
  }
  return { ok: true, appMetadata: data.user.app_metadata };
}

/**
 * Bans the account and ends its sessions. The ban and the app_metadata copy
 * are one GoTrue call, so the gates never disagree with GoTrue. A failure
 * there is a failure of the whole suspension (nothing was written); a
 * failure to end the sessions is NOT — the account is suspended, and the
 * outcome says what happened to the sessions.
 */
export async function suspendAccountWith(
  admin: Admin,
  args: { userId: string; actorId: string; nowIso: string },
): Promise<SuspendResult> {
  const current = await readAuthUser(admin, args.userId);
  if (!current.ok) return current;

  const { error: banError } = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: SUSPENSION_BAN_DURATION,
    app_metadata: suspendedAppMetadata(current.appMetadata, args.actorId, args.nowIso),
  });
  if (banError) return { ok: false, status: 500, error: banError.message };

  let sessions: SessionsOutcome;
  try {
    const { data, error } = await admin.rpc("admin_revoke_user_sessions", { p_user: args.userId });
    if (error) {
      sessions = isMissingSuspensionSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    } else {
      sessions = { state: "ended", count: typeof data === "number" ? data : Number(data) || 0 };
    }
  } catch (err) {
    sessions = { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
  return { ok: true, sessions };
}

/** Lifts the ban and marks the app's copy "active". */
export async function liftSuspensionWith(
  admin: Admin,
  args: { userId: string; actorId: string; nowIso: string },
): Promise<LiftResult> {
  const current = await readAuthUser(admin, args.userId);
  if (!current.ok) return current;
  const { error } = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: LIFT_BAN_DURATION,
    app_metadata: activeSuspensionAppMetadata(current.appMetadata, args.actorId, args.nowIso),
  });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

/**
 * The ids (of those given) banned now, or null when it cannot be known (the
 * migration has not run, or the read failed): the caller then shows no
 * suspension rather than guessing one. At most 500 ids are asked.
 */
export async function readSuspendedIds(admin: Pick<SupabaseClient, "rpc">, ids: string[]): Promise<Set<string> | null> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))].slice(0, 500);
  if (unique.length === 0) return new Set();
  try {
    const { data, error } = await admin.rpc("admin_suspended_user_ids", { p_ids: unique });
    if (error) {
      if (!isMissingSuspensionSchema(error.code)) {
        console.error("[suspension] reading the banned ids failed:", error.code, error.message);
      }
      return null;
    }
    const rows = Array.isArray(data) ? data : [];
    return new Set(
      rows
        .map((r: unknown) => (typeof r === "string" ? r : (r as { admin_suspended_user_ids?: unknown } | null)?.admin_suspended_user_ids))
        .filter((v): v is string => typeof v === "string"),
    );
  } catch {
    return null;
  }
}

// ── owner ٢٥ (20261127_60): a suspension FREEZES, it never cancels ─────────

/** What the freeze of a suspension did. */
export type FreezeOutcome =
  /** The snapshot was taken (or an open one already existed). counts = rows frozen. */
  | { state: "frozen" | "already_frozen"; counts: Record<string, number> | null }
  /** 20261127_60 has not run: nothing is frozen and nothing will be extended on lift. Nothing is cancelled either. */
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

/** What lifting the freeze did. */
export type ThawOutcome =
  | { state: "lifted"; reason: string | null; extendedDays: number | null; extended: Record<string, number> | null }
  /** No open freeze (a suspension from before 20261127_60, or lifted already): nothing to extend. */
  | { state: "not_frozen" }
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

/** PostgREST / Postgres codes for "account_freeze_* does not exist yet". */
function isMissingFreezeSchema(code: unknown): boolean {
  return code === "42883" || code === "42P01" || code === "PGRST202";
}

function countsOf(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** account_freeze_open's jsonb → FreezeOutcome (pure; exported for the tests). */
export function parseFreezeOpen(data: unknown): FreezeOutcome {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (d.state === "frozen") return { state: "frozen", counts: countsOf(d.counts) };
  if (d.state === "already_frozen") return { state: "already_frozen", counts: null };
  return { state: "failed", error: "unexpected answer" };
}

/** account_freeze_lift's jsonb → ThawOutcome (pure; exported for the tests). */
export function parseFreezeLift(data: unknown): ThawOutcome {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (d.state === "not_frozen") return { state: "not_frozen" };
  if (d.state === "lifted") {
    const days = typeof d.extended_days === "number" ? d.extended_days : Number(d.extended_days);
    return {
      state: "lifted",
      reason: typeof d.reason === "string" ? d.reason : null,
      extendedDays: Number.isFinite(days) ? days : null,
      extended: countsOf(d.extended),
    };
  }
  return { state: "failed", error: "unexpected answer" };
}

/**
 * Opens the freeze of a suspension (public.account_freeze_open): a snapshot of
 * the subscriptions, library grants, founder seat, membership credits and
 * points lots live now. Nothing is cancelled. Never throws.
 */
export async function freezeEntitlementsWith(
  admin: Pick<SupabaseClient, "rpc">,
  args: { userId: string; actorId: string | null; reason: "admin" | "device_limit" },
): Promise<FreezeOutcome> {
  try {
    const { data, error } = await admin.rpc("account_freeze_open", {
      p_user: args.userId,
      p_actor: args.actorId,
      p_reason: args.reason,
    });
    if (error) {
      return isMissingFreezeSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    }
    return parseFreezeOpen(data);
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
}

/**
 * Lifts the freeze (public.account_freeze_lift): the frozen rows still live
 * get the suspended days back. A second lift extends nothing. Never throws.
 */
export async function thawEntitlementsWith(
  admin: Pick<SupabaseClient, "rpc">,
  args: { userId: string; actorId: string | null },
): Promise<ThawOutcome> {
  try {
    const { data, error } = await admin.rpc("account_freeze_lift", { p_user: args.userId, p_actor: args.actorId });
    if (error) {
      return isMissingFreezeSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    }
    return parseFreezeLift(data);
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
}
