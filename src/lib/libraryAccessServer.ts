import { createServiceClient } from '@/lib/supabase/server';
import {
  grantWindow,
  isMissingLibraryGrantsTable,
  stackedGrantWindow,
  type LibraryGrantSource,
  type LibraryPlanRef,
} from '@/lib/libraryAccess';

/**
 * The IO half of ./libraryAccess.ts: reads and writes
 * public.library_access_grants (20261019_10) with the service client.
 *
 * The service client bypasses RLS, so every caller passes the id of the
 * user it has already authenticated (or, for grantLibraryAccess, the user an
 * admin has chosen) — never an id taken unchecked from a request body.
 *
 * Deploy order: the code may ship before the migration runs. A missing table
 * (42P01 / PGRST205) means "no library grant", so access falls back to the
 * subscription tier alone (the read logs this once per process; a failed
 * grant logs every time). Neither function throws.
 *
 * A new grant EXTENDS the user's current access (controller ruling,
 * 2026-10-18): it starts at the later of now and the latest ends_at among the
 * user's grants that end after now, so an early renewal or a code redeemed
 * during an active grant adds its full length instead of overlapping.
 */

const TABLE = 'library_access_grants';
const MISSING_TABLE_ERROR = 'library_access_grants table missing';

let missingTableLogged = false;

function logMissingTableOnce(): void {
  if (missingTableLogged) return;
  missingTableLogged = true;
  console.warn(
    `[libraryAccess] hasActiveLibraryGrant: public.${TABLE} does not exist yet (20261019_10 not applied); treating every user as holding no library grant`,
  );
}

/**
 * True when the user holds a library grant whose window covers now:
 * starts_at <= now < ends_at. Any failure — the table missing, a query error,
 * a missing env — answers false (fail closed to the tier) and never throws.
 */
export async function hasActiveLibraryGrant(userId: string): Promise<boolean> {
  if (typeof userId !== 'string' || userId.length === 0) return false;
  try {
    const supabase = await createServiceClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .select('id')
      .eq('user_id', userId)
      .lte('starts_at', nowIso)
      .gt('ends_at', nowIso)
      .limit(1);
    if (error) {
      if (isMissingLibraryGrantsTable(error.code)) {
        logMissingTableOnce();
      } else {
        console.error('[libraryAccess] hasActiveLibraryGrant query failed:', error.code, error.message);
      }
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('[libraryAccess] hasActiveLibraryGrant failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * The latest ends_at among the user's grants that end after `nowIso` — the
 * point a new grant extends from — or null. Every failure (the table missing,
 * a query error, a throw) answers null, i.e. "start now": this read must
 * never fail the grant. A missing table still fails the grant, at the insert.
 */
async function latestActiveGrantEnd(
  supabase: ServiceClient,
  userId: string,
  nowIso: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('ends_at')
      .eq('user_id', userId)
      .gt('ends_at', nowIso)
      .order('ends_at', { ascending: false })
      .limit(1);
    if (error) {
      // A missing table is reported by the insert that follows.
      if (!isMissingLibraryGrantsTable(error.code)) {
        console.warn(
          '[libraryAccess] grantLibraryAccess: could not read the current grant end; the new grant starts now:',
          error.code,
          error.message,
        );
      }
      return null;
    }
    const row = Array.isArray(data) ? (data[0] as { ends_at?: unknown } | undefined) : undefined;
    return row && typeof row.ends_at === 'string' ? row.ends_at : null;
  } catch (err) {
    console.warn(
      '[libraryAccess] grantLibraryAccess: the current grant end read threw; the new grant starts now:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** PostgREST / Postgres codes meaning "the function does not exist here yet". */
function isMissingGrantFunction(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883';
}

let missingGrantFunctionLogged = false;

/**
 * Inserts one grant lasting `days` whole days (an integer from 1 to 3660),
 * starting at the later of now and the end of the user's latest active grant
 * (stackedGrantWindow). Returns the grant's end — the extended end — as an
 * ISO string. Never throws.
 *
 * ATOMIC (owner note ١٨ C01, 20261030_65): the read of the latest end and the
 * insert run in ONE database function, public.library_grant_access, under a
 * per-user lock — two grants at the same moment (two orders, an approval and
 * a code) can no longer read the same end and overlap. Where that function
 * does not exist yet (PGRST202 / 42883: the SQL has not run) the old read
 * then insert below is the fallback, logged once. The function also keeps the
 * admin's `reason` / `notes` (service-role-only table); the fallback cannot,
 * so a grant that carries a reason FAILS there instead of dropping it.
 *
 * `orderId` (a paid order, source 'purchase', B1 Task 5) is written to
 * order_id, which is UNIQUE: a second grant for the same order fails with
 * `code` 23505, which the caller reads as "already granted". The column is
 * sent only when an order is given, so the other callers keep working on a
 * database where 20261022_10 has not run. A failure carries the database
 * error `code` when there is one.
 *
 * Logging: an insert failure or a throw is logged here; the two input checks
 * (userId, days) are not. Callers that hide `error` from users log it
 * themselves.
 */
export async function grantLibraryAccess(input: {
  userId: string;
  planRef: LibraryPlanRef;
  days: number;
  source: LibraryGrantSource;
  grantedBy?: string | null;
  orderId?: string | null;
  /** The admin's reason (mandatory for source 'admin' — the function refuses a blank one). */
  reason?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; endsAt: string; grantId?: string; startsAt?: string } | { ok: false; error: string; code?: string }> {
  if (typeof input.userId !== 'string' || input.userId.length === 0) {
    return { ok: false, error: 'userId is required' };
  }
  const now = new Date();
  if (!grantWindow(input.days, now)) {
    return { ok: false, error: 'days must be an integer from 1 to 3660' };
  }
  try {
    const supabase = await createServiceClient();

    // 1. the atomic path (20261030_65)
    const { data: granted, error: rpcError } = await supabase.rpc('library_grant_access', {
      p_user: input.userId,
      p_plan_ref: input.planRef,
      p_source: input.source,
      p_days: input.days,
      p_granted_by: input.grantedBy ?? null,
      p_order: input.orderId ?? null,
      p_reason: input.reason ?? null,
      p_notes: input.notes ?? null,
    });
    if (!rpcError) {
      const row = (granted ?? null) as { id?: unknown; starts_at?: unknown; ends_at?: unknown } | null;
      if (row && typeof row.ends_at === 'string') {
        return {
          ok: true,
          endsAt: new Date(row.ends_at).toISOString(),
          grantId: typeof row.id === 'string' ? row.id : undefined,
          startsAt: typeof row.starts_at === 'string' ? new Date(row.starts_at).toISOString() : undefined,
        };
      }
      console.error('[libraryAccess] grantLibraryAccess: library_grant_access answered without ends_at');
      return { ok: false, error: 'library_grant_access: no result' };
    }
    if (!isMissingGrantFunction(rpcError.code)) {
      if (isMissingLibraryGrantsTable(rpcError.code)) {
        console.error(`[libraryAccess] grantLibraryAccess: ${MISSING_TABLE_ERROR} (20261019_10 not applied)`);
        return { ok: false, error: MISSING_TABLE_ERROR, code: rpcError.code };
      }
      if (rpcError.code === '23505' && input.orderId) {
        // the order's grant already exists — the caller treats it as done
        return { ok: false, error: rpcError.message, code: rpcError.code };
      }
      console.error('[libraryAccess] grantLibraryAccess: library_grant_access failed:', rpcError.code, rpcError.message);
      return { ok: false, error: rpcError.message, code: rpcError.code };
    }

    // 2. the fallback (20261030_65 not applied): read then insert, not atomic
    if (!missingGrantFunctionLogged) {
      missingGrantFunctionLogged = true;
      console.warn(
        '[libraryAccess] grantLibraryAccess: public.library_grant_access does not exist yet (20261030_65 not applied); granting with the non-atomic read then insert',
      );
    }
    if ((input.reason && input.reason.trim()) || (input.notes && input.notes.trim())) {
      // the reason has nowhere to go without 20261030_65 — refuse, never drop it
      return { ok: false, error: 'library grant reasons need 20261030_65', code: rpcError.code };
    }
    const latestActiveEnd = await latestActiveGrantEnd(supabase, input.userId, now.toISOString());
    const window = stackedGrantWindow(input.days, now, latestActiveEnd);
    if (!window) {
      // Unreachable while grantWindow accepted these days; kept for the type.
      return { ok: false, error: 'days must be an integer from 1 to 3660' };
    }
    const { error } = await supabase.from(TABLE).insert({
      user_id: input.userId,
      plan_ref: input.planRef,
      source: input.source,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      granted_by: input.grantedBy ?? null,
      ...(input.orderId ? { order_id: input.orderId } : {}),
    });
    if (error) {
      if (isMissingLibraryGrantsTable(error.code)) {
        // A rare admin write: log every failed grant, not just the first.
        console.error(`[libraryAccess] grantLibraryAccess: ${MISSING_TABLE_ERROR} (20261019_10 not applied)`);
        return { ok: false, error: MISSING_TABLE_ERROR, code: error.code };
      }
      if (error.code === '23505' && input.orderId) {
        // the order's grant already exists — the caller treats it as done
        return { ok: false, error: error.message, code: error.code };
      }
      console.error('[libraryAccess] grantLibraryAccess insert failed:', error.code, error.message);
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: true, endsAt: window.endsAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[libraryAccess] grantLibraryAccess failed:', message);
    return { ok: false, error: message };
  }
}
