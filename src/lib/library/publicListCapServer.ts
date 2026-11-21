/**
 * publicListCapServer.ts — the I/O half of publicListCap.ts (Q100a, batch
 * l12): the settings (60-second memo, its own read so a missing column never
 * touches the view cap's), the subjects of one list answer, the call to
 * public.library_public_list_hit (20261202_50), and the items to keep.
 *
 * Called by /api/library/init and /api/library/search AFTER the answer is
 * built, with the route's own "has the full library" answer.
 *
 * WHILE THE CAP IS OFF (the shipped state) this does one memoised settings
 * read per minute per process and nothing else: no database call per
 * request, no DNS lookup.
 *
 * FAILS OPEN, ALWAYS: no key, a missing column or function (the SQL not run
 * yet), a timeout or any error → every item is served, as before.
 */
import { isSupabaseMode } from "@/lib/runtimeMode";
import {
  loadPublicViewSettings,
  provenCrawlerRequest,
  sessionIdFromCookieHeader,
  viewHashSecret,
  visitorAddress,
} from "./publicViewCapServer";
import { subjectHash } from "./publicViewCap";
import {
  LIST_CAP_MAX_ITEMS,
  LIST_CAP_SELECT,
  allowedListKeys,
  listCapSettingsFromRow,
  listLimitNotice,
  parseListHitRow,
  type ListCapSettings,
  type ListLimitNotice,
} from "./publicListCap";

const TTL_MS = 60 * 1000;
const FAIL_TTL_MS = 15 * 1000;
const TIMEOUT_MS = 1_500;
const MISSING_RETRY_MS = 10 * 60 * 1000;

let cached: { value: ListCapSettings; expiresAt: number } | null = null;
let inflight: Promise<ListCapSettings> | null = null;
let functionMissingUntil = 0;

async function fetchSettings(): Promise<{ value: ListCapSettings; ok: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { value: listCapSettingsFromRow(null), ok: false };
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/library_monitor_settings?select=${encodeURIComponent(LIST_CAP_SELECT)}&id=eq.true`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
    // 400 = a column is missing (20261202_50 not run yet): the cap stays off.
    if (!res.ok) return { value: listCapSettingsFromRow(null), ok: res.status === 400 };
    const rows: unknown = await res.json();
    const row = Array.isArray(rows) && rows[0] && typeof rows[0] === "object" ? (rows[0] as Record<string, unknown>) : null;
    return { value: listCapSettingsFromRow(row), ok: true };
  } catch {
    return { value: listCapSettingsFromRow(null), ok: false };
  }
}

/** The list-cap settings now (memoised 60 s; 15 s after a failed read). Never throws. */
export async function loadListCapSettings(): Promise<ListCapSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight) return inflight;
  inflight = fetchSettings()
    .then(({ value, ok }) => {
      cached = { value, expiresAt: Date.now() + (ok ? TTL_MS : FAIL_TTL_MS) };
      return value;
    })
    .catch(() => listCapSettingsFromRow(null))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function callHit(subjects: string[], items: string[]): Promise<unknown> {
  if (Date.now() < functionMissingUntil) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/library_public_list_hit`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ p_subjects: subjects, p_items: items }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json && typeof json === "object" ? (json as { code?: unknown }).code : undefined;
    if (code === "PGRST202" || code === "42883" || res.status === 404) functionMissingUntil = Date.now() + MISSING_RETRY_MS;
    else console.error("[library-list-cap] call failed:", res.status);
    return null;
  }
  return json;
}

export interface ListCapOutcome {
  /** The keys that may be served; null = every item (off, exempt, or a failure). */
  allowed: Set<string> | null;
  /** Set when some items were held back: the answer carries it as `listLimit`. */
  notice: ListLimitNotice | null;
}

const ALL: ListCapOutcome = Object.freeze({ allowed: null, notice: null }) as ListCapOutcome;

/**
 * Counts the items of one list answer for a viewer WITHOUT full library
 * access and says which may be served. `keys` in the order the answer lists
 * them (publicListCap.listItemKey). A subscriber, an empty list, a proven
 * crawler, the cap off or any failure → every item.
 */
export async function spendPublicListItems(
  request: Request,
  viewer: { userId: string | null; hasFullLibrary: boolean },
  keys: readonly string[],
): Promise<ListCapOutcome> {
  if (viewer.hasFullLibrary || !isSupabaseMode || keys.length === 0) return ALL;
  try {
    const settings = await loadListCapSettings();
    if (!settings.enabled) return ALL;
    if (await provenCrawlerRequest(request, await loadPublicViewSettings())) return ALL;

    const getHeader = (name: string) => request.headers.get(name);
    const secret = viewHashSecret();
    const subjects: string[] = [];
    if (viewer.userId) subjects.push(`u:${viewer.userId}`);
    else {
      const sid = sessionIdFromCookieHeader(getHeader("cookie"));
      const address = visitorAddress(getHeader);
      if (sid) subjects.push(`s:${await subjectHash(secret, "sid", sid)}`);
      if (address) subjects.push(`a:${await subjectHash(secret, "addr", address)}`);
    }
    if (subjects.length === 0) return ALL;

    const unique = [...new Set(keys)].slice(0, LIST_CAP_MAX_ITEMS);
    const row = parseListHitRow(await callHit(subjects, unique));
    const allowed = allowedListKeys(row);
    if (!allowed) return ALL;
    // Keys past the function's maximum were not counted: never served.
    return { allowed, notice: listLimitNotice(row, settings) };
  } catch {
    return ALL;
  }
}
