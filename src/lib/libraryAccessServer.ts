import { createServiceClient } from '@/lib/supabase/server';
import {
  grantWindow,
  isMissingLibraryGrantsTable,
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

/**
 * Inserts one grant starting now and lasting `days` whole days (an integer
 * from 1 to 3660). Returns the grant's end as an ISO string. Never throws.
 */
export async function grantLibraryAccess(input: {
  userId: string;
  planRef: LibraryPlanRef;
  days: number;
  source: LibraryGrantSource;
  grantedBy?: string | null;
}): Promise<{ ok: true; endsAt: string } | { ok: false; error: string }> {
  if (typeof input.userId !== 'string' || input.userId.length === 0) {
    return { ok: false, error: 'userId is required' };
  }
  const window = grantWindow(input.days, new Date());
  if (!window) {
    return { ok: false, error: 'days must be an integer from 1 to 3660' };
  }
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from(TABLE).insert({
      user_id: input.userId,
      plan_ref: input.planRef,
      source: input.source,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      granted_by: input.grantedBy ?? null,
    });
    if (error) {
      if (isMissingLibraryGrantsTable(error.code)) {
        // A rare admin write: log every failed grant, not just the first.
        console.error(`[libraryAccess] grantLibraryAccess: ${MISSING_TABLE_ERROR} (20261019_10 not applied)`);
        return { ok: false, error: MISSING_TABLE_ERROR };
      }
      console.error('[libraryAccess] grantLibraryAccess insert failed:', error.code, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, endsAt: window.endsAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[libraryAccess] grantLibraryAccess failed:', message);
    return { ok: false, error: message };
  }
}
