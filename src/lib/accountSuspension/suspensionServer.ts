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
 *   owner س٢١٥ (20261206_20): every suspension has an end. The ban lasts
 *   exactly until it, the copy carries it as `until`, and the terms (end,
 *   template, reason) are written on the open freeze row
 *   (recordSuspensionTermsWith), where the automatic lift finds them
 *   (readDueSuspensionsWith). Appeals: insertAppealWith / readAppealsWith /
 *   closeAppealsWith.
 *
 * No `next/*` or `@/` imports, so `node --test` loads it with a fake client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIFT_BAN_DURATION,
  suspendedAppMetadata,
  activeSuspensionAppMetadata,
  isMissingSuspensionSchema,
} from "../auth/accountSuspension.ts";
import { banDurationUntil, type SuspensionTemplate } from "../auth/suspensionTerms.ts";
import { escapeLikePattern } from "../services/likePattern.ts";

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
 *
 * Owner س٢١٥: `endsAt` is required — the GoTrue ban lasts exactly until then
 * and the copy carries it as `until`, so no suspension is open-ended.
 */
export async function suspendAccountWith(
  admin: Admin,
  args: { userId: string; actorId: string; nowIso: string; endsAt: string },
): Promise<SuspendResult> {
  if (!Number.isFinite(Date.parse(args.endsAt))) {
    return { ok: false, status: 500, error: "suspension end is not a time" };
  }
  const current = await readAuthUser(admin, args.userId);
  if (!current.ok) return current;

  const { error: banError } = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: banDurationUntil(args.endsAt, Date.parse(args.nowIso)),
    app_metadata: suspendedAppMetadata(current.appMetadata, args.actorId, args.nowIso, args.endsAt),
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

// ── owner س٢١٥ (20261206_20): the terms of a suspension and its appeals ────

/** PostgREST / Postgres codes for "the 20261206_20 columns or table do not exist yet". */
export function isMissingTermsSchema(code: unknown): boolean {
  return code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205" || code === "PGRST200";
}

type Db = Pick<SupabaseClient, "from">;

/** What writing the terms on the open freeze did. */
export type TermsOutcome =
  | { state: "recorded"; freezeId: string }
  /** No open freeze row (its write failed or 20261127_60 is missing): the ban still ends on time. */
  | { state: "no_open_freeze" }
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

/**
 * Writes the end, template and reason on the account's OPEN freeze (the row
 * account_freeze_open just made or found). Never throws.
 */
export async function recordSuspensionTermsWith(
  db: Db,
  args: { userId: string; endsAt: string; template: SuspensionTemplate; reason: string },
): Promise<TermsOutcome> {
  try {
    const { data, error } = await db
      .from("account_suspension_freezes")
      .update({ ends_at: args.endsAt, template: args.template, suspend_reason: args.reason })
      .eq("user_id", args.userId)
      .is("lifted_at", null)
      .select("id");
    if (error) {
      return isMissingTermsSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    }
    const id = Array.isArray(data) && data.length > 0 ? (data[0] as { id?: unknown }).id : null;
    return typeof id === "string" ? { state: "recorded", freezeId: id } : { state: "no_open_freeze" };
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
}

/** The open suspension of one account, as the admin page shows it. */
export interface OpenSuspension {
  freezeId: string;
  reasonKind: string | null;
  frozenAt: string | null;
  frozenBy: string | null;
  endsAt: string | null;
  template: string | null;
  reason: string | null;
}

/**
 * The account's open freeze with its terms, or null (none, or unreadable —
 * logged). Before 20261206_20 runs the terms are read as null.
 */
export async function readOpenSuspensionWith(db: Db, userId: string): Promise<OpenSuspension | null> {
  const pick = (row: Record<string, unknown>): OpenSuspension => ({
    freezeId: String(row.id),
    reasonKind: typeof row.reason === "string" ? row.reason : null,
    frozenAt: typeof row.frozen_at === "string" ? row.frozen_at : null,
    frozenBy: typeof row.frozen_by === "string" ? row.frozen_by : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    template: typeof row.template === "string" ? row.template : null,
    reason: typeof row.suspend_reason === "string" ? row.suspend_reason : null,
  });
  try {
    const full = await db
      .from("account_suspension_freezes")
      .select("id, reason, frozen_at, frozen_by, ends_at, template, suspend_reason")
      .eq("user_id", userId)
      .is("lifted_at", null)
      .maybeSingle();
    if (!full.error) return full.data ? pick(full.data as Record<string, unknown>) : null;
    if (full.error.code !== "42703" && full.error.code !== "PGRST204") {
      if (full.error.code !== "42P01" && full.error.code !== "PGRST205") {
        console.error("[suspension] reading the open suspension failed:", full.error.code, full.error.message);
      }
      return null;
    }
    // 20261206_20 has not run: the freeze without its terms.
    const bare = await db
      .from("account_suspension_freezes")
      .select("id, reason, frozen_at, frozen_by")
      .eq("user_id", userId)
      .is("lifted_at", null)
      .maybeSingle();
    return !bare.error && bare.data ? pick(bare.data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface DueSuspension {
  freezeId: string;
  userId: string;
  endsAt: string;
  /** Failed tries of the automatic lift on this row so far (20261206_20). */
  liftAttempts: number;
}

/**
 * l16 review: the automatic lift gives up on a row after this many failed
 * tries (an admin audit row says so); the admin's manual lift still works.
 */
export const LIFT_MAX_ATTEMPTS = 5;

export type DueRead =
  | { state: "ok"; rows: DueSuspension[] }
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

/**
 * The open suspensions whose end has passed and that the automatic lift has
 * not given up on (lift_attempts below LIFT_MAX_ATTEMPTS), oldest end first
 * (at most `limit`).
 */
export async function readDueSuspensionsWith(db: Db, nowIso: string, limit: number): Promise<DueRead> {
  try {
    const { data, error } = await db
      .from("account_suspension_freezes")
      .select("id, user_id, ends_at, lift_attempts")
      .is("lifted_at", null)
      .not("ends_at", "is", null)
      .lte("ends_at", nowIso)
      .lt("lift_attempts", LIFT_MAX_ATTEMPTS)
      .order("ends_at", { ascending: true })
      .limit(limit);
    if (error) {
      return isMissingTermsSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    }
    const rows = (Array.isArray(data) ? data : [])
      .map((r) => r as { id?: unknown; user_id?: unknown; ends_at?: unknown; lift_attempts?: unknown })
      .filter((r) => typeof r.id === "string" && typeof r.user_id === "string" && typeof r.ends_at === "string")
      .map((r) => ({
        freezeId: r.id as string,
        userId: r.user_id as string,
        endsAt: r.ends_at as string,
        liftAttempts: typeof r.lift_attempts === "number" && Number.isFinite(r.lift_attempts) ? r.lift_attempts : 0,
      }));
    return { state: "ok", rows };
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
}

/** What sending an appeal did. The route never tells the sender which one. */
export type AppealInsertOutcome =
  | { state: "recorded" }
  /** Three appeals for this suspension are already waiting. */
  | { state: "already_pending" }
  /** The e-mail is not an account, or the account has no open suspension. */
  | { state: "no_suspension" }
  | { state: "migration_missing" }
  | { state: "failed"; error: string };

/**
 * Records an appeal for the account with this e-mail when it has an open
 * suspension. The address is matched without regard to case (an account
 * stored as «Ahmed@…» is found from «ahmed@…»), as a literal — `%`, `_`, `*`
 * and `\` are escaped. Up to three waiting appeals per suspension, each its
 * own row (the database answers 23505 beyond that → already_pending), so an
 * appeal filed first by someone else who knows the address never blocks the
 * account's own. Never throws.
 */
export async function insertAppealWith(db: Db, args: { email: string; message: string }): Promise<AppealInsertOutcome> {
  try {
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id")
      .ilike("email", escapeLikePattern(args.email.trim()))
      .limit(1)
      .maybeSingle();
    if (profileError) return { state: "failed", error: profileError.code ?? profileError.message ?? "error" };
    const userId = (profile as { id?: unknown } | null)?.id;
    if (typeof userId !== "string") return { state: "no_suspension" };

    const { data: freeze, error: freezeError } = await db
      .from("account_suspension_freezes")
      .select("id")
      .eq("user_id", userId)
      .is("lifted_at", null)
      .maybeSingle();
    if (freezeError) {
      return isMissingTermsSchema(freezeError.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: freezeError.code ?? freezeError.message ?? "error" };
    }
    const freezeId = (freeze as { id?: unknown } | null)?.id;
    if (typeof freezeId !== "string") return { state: "no_suspension" };

    const { error } = await db
      .from("account_suspension_appeals")
      .insert({ freeze_id: freezeId, user_id: userId, message: args.message });
    if (error) {
      if (error.code === "23505") return { state: "already_pending" };
      return isMissingTermsSchema(error.code)
        ? { state: "migration_missing" }
        : { state: "failed", error: error.code ?? error.message ?? "error" };
    }
    return { state: "recorded" };
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "error" };
  }
}

export interface AppealRow {
  id: string;
  freezeId: string;
  message: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** The account's latest appeals (at most 10), newest first; [] when unreadable. */
export async function readAppealsWith(db: Db, userId: string): Promise<AppealRow[]> {
  try {
    const { data, error } = await db
      .from("account_suspension_appeals")
      .select("id, freeze_id, message, status, created_at, decided_at, decision_note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        freezeId: String(row.freeze_id),
        message: typeof row.message === "string" ? row.message : "",
        status: typeof row.status === "string" ? row.status : "new",
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
        decisionNote: typeof row.decision_note === "string" ? row.decision_note : null,
      };
    });
  } catch {
    return [];
  }
}

/** The ids (of those given) with an appeal waiting; empty when unreadable. */
export async function readPendingAppealIds(db: Db, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))].slice(0, 500);
  if (unique.length === 0) return new Set();
  try {
    const { data, error } = await db
      .from("account_suspension_appeals")
      .select("user_id")
      .in("user_id", unique)
      .eq("status", "new");
    if (error || !Array.isArray(data)) return new Set();
    return new Set(
      data.map((r) => (r as { user_id?: unknown }).user_id).filter((v): v is string => typeof v === "string"),
    );
  } catch {
    return new Set();
  }
}

/**
 * Closes the account's waiting appeals when its suspension ends: «lifted»
 * (an admin lifted it) or «ended» (it ran out). Returns how many; null when
 * the write failed. Never throws.
 */
export async function closeAppealsWith(
  db: Db,
  args: { userId: string; status: "lifted" | "ended"; actorId: string | null; nowIso: string },
): Promise<number | null> {
  try {
    const { data, error } = await db
      .from("account_suspension_appeals")
      .update({ status: args.status, decided_at: args.nowIso, decided_by: args.actorId })
      .eq("user_id", args.userId)
      .eq("status", "new")
      .select("id");
    if (error) return isMissingTermsSchema(error.code) ? 0 : null;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return null;
  }
}

/**
 * l16 review: one failed try of the automatic lift on a row — lift_attempts
 * goes up by one (from the value the due read saw) and the short error code
 * is kept. Returns the new count, or null when the write failed. Never throws.
 */
export async function recordLiftFailureWith(
  db: Db,
  args: { freezeId: string; attemptsBefore: number; error: string },
): Promise<number | null> {
  const next = Math.max(0, Math.trunc(args.attemptsBefore)) + 1;
  try {
    const { error } = await db
      .from("account_suspension_freezes")
      .update({ lift_attempts: next, lift_last_error: args.error.slice(0, 200) })
      .eq("id", args.freezeId)
      .is("lifted_at", null);
    return error ? null : next;
  } catch {
    return null;
  }
}

/**
 * l16 review: is this due row still the account's CURRENT open suspension,
 * and is its end still due? A fresh re-suspension (a new row, or new terms
 * written on the same row) must not be lifted by a run that read the old one.
 * A failed read answers false (skip this run, try the next).
 */
export async function isStillDueWith(db: Db, row: DueSuspension, nowMs: number): Promise<boolean> {
  const open = await readOpenSuspensionWith(db, row.userId);
  if (!open || open.freezeId !== row.freezeId || !open.endsAt) return false;
  const endMs = Date.parse(open.endsAt);
  return Number.isFinite(endMs) && endMs <= nowMs;
}
