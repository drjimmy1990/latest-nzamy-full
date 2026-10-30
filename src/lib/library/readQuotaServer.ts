/**
 * readQuotaServer.ts — the I/O half of owner note ١٣ C07 / C09: one call to
 * public.library_read_quota_hit (20261030_80) as the service role, with the
 * in-process memo in front of it. Used by src/proxy.ts (Node runtime in
 * Next 16) on the heavy library reads, and by GET /api/v1/library/status.
 *
 * FAILS OPEN, ALWAYS. A missing function (PGRST202 / 42883 — the migration not
 * applied yet), a missing service key, a timeout (1.5 s) or any other error
 * answers null: "no decision", and the request goes on exactly as it did
 * before this file existed. The per-visitor buckets in the proxy still apply.
 * So this code may be deployed before or after the migration.
 *
 * A plain fetch to PostgREST rather than supabase-js, so the proxy bundle
 * gains no client and no session machinery. The key is read from the
 * environment per call and never logged.
 */
import {
  LIBRARY_READ_QUOTA,
  TtlMemo,
  parseQuotaRow,
  type QuotaRow,
} from "./readQuota";

const RPC = "library_read_quota_hit";
const RPC_TIMEOUT_MS = 1_500;
const MISSING_RETRY_MS = 10 * 60 * 1000;
/** (user, document) already allowed — skip the database for this long. */
const ALLOWED_TTL_MS = 60 * 1000;
/** An admin is exempt; remember it a little longer. */
const EXEMPT_TTL_MS = 5 * 60 * 1000;

let functionMissingUntil = 0;
let missingLogged = false;
const allowedMemo = new TtlMemo<QuotaRow>(ALLOWED_TTL_MS, 20_000);

function memoKey(userId: string, docKey: string | null): string {
  return `${userId}\u0000${docKey ?? "*"}`;
}

function isMissingFunction(status: number, body: unknown): boolean {
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  return code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01" || status === 404;
}

/**
 * Counts `docKey` for `userId` (or, with docKey null, only reads the lock and
 * today's counts) and returns the row — or null when there is no decision.
 * `memoLockCheck`: a docKey-null call from the proxy (search, library AI) may
 * reuse an unlocked answer for 60 s; the status route's state call never does.
 */
export async function libraryReadQuotaHit(
  userId: string,
  docKey: string | null,
  opts: { memoLockCheck?: boolean } = {},
): Promise<QuotaRow | null> {
  const ownKey = docKey === null ? (opts.memoLockCheck ? "!lock" : null) : docKey;
  const memoHit =
    (ownKey !== null ? allowedMemo.get(memoKey(userId, ownKey)) : undefined) ??
    allowedMemo.get(memoKey(userId, "!exempt"));
  if (memoHit) return memoHit;
  if (Date.now() < functionMissingUntil) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        p_user: userId,
        p_doc_key: docKey,
        p_daily_docs: LIBRARY_READ_QUOTA.dailyDocs,
        p_member_daily_docs: LIBRARY_READ_QUOTA.memberDailyDocs,
        p_hourly_docs: LIBRARY_READ_QUOTA.hourlyDocs,
        p_lock_after_refused: LIBRARY_READ_QUOTA.lockAfterRefused,
      }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      if (isMissingFunction(res.status, body)) {
        functionMissingUntil = Date.now() + MISSING_RETRY_MS;
        if (!missingLogged) {
          missingLogged = true;
          console.warn("[library-quota] public.library_read_quota_hit is missing (20261030_80 not applied); reads are not counted");
        }
      } else {
        console.error("[library-quota] quota call failed:", res.status);
      }
      return null;
    }
    const row = parseQuotaRow(body);
    if (!row) return null;
    if (row.status === "exempt") allowedMemo.set(memoKey(userId, "!exempt"), row, EXEMPT_TTL_MS);
    // Only an allowed document or lock check is remembered: the status
    // route's state call must stay fresh, and a refusal or a lock is re-asked
    // every time.
    else if (row.status === "ok" && ownKey !== null) allowedMemo.set(memoKey(userId, ownKey), row);
    return row;
  } catch (err) {
    console.error("[library-quota] quota call threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
