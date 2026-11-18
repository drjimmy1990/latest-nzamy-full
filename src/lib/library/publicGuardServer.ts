/**
 * publicGuardServer.ts — reads the public-library protection settings
 * (platform_settings: library_public_protection,
 * public_full_rulings_per_collection, library_feqh_free_pages) for the proxy
 * and the library routes, remembered for 60 seconds per process.
 *
 * A plain fetch to PostgREST as the service role (as readQuotaServer.ts), so
 * the proxy bundle gains no client. FAILS TO THE DEFAULTS: no key, a timeout,
 * a missing row or any error answers LIBRARY_GUARD_DEFAULTS (the owner's
 * numbers), so the code works before 20261128_30 seeds the rows.
 */
import { guardSettingsFromRows, LIBRARY_GUARD_DEFAULTS, LIBRARY_PUBLIC_PROTECTION_KEY, PUBLIC_FULL_RULINGS_KEY, LIBRARY_FEQH_FREE_PAGES_KEY, type LibraryGuardSettings } from "./publicGuard";

const TTL_MS = 60 * 1000;
const FAIL_TTL_MS = 15 * 1000;
const TIMEOUT_MS = 1_500;

let cached: { value: LibraryGuardSettings; expiresAt: number } | null = null;
let inflight: Promise<LibraryGuardSettings> | null = null;

async function fetchSettings(): Promise<{ value: LibraryGuardSettings; ok: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { value: LIBRARY_GUARD_DEFAULTS, ok: false };
  try {
    const keys = [LIBRARY_PUBLIC_PROTECTION_KEY, PUBLIC_FULL_RULINGS_KEY, LIBRARY_FEQH_FREE_PAGES_KEY].join(",");
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/platform_settings?select=key,value&key=in.(${keys})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { value: LIBRARY_GUARD_DEFAULTS, ok: false };
    return { value: guardSettingsFromRows(await res.json()), ok: true };
  } catch {
    return { value: LIBRARY_GUARD_DEFAULTS, ok: false };
  }
}

/** The settings now (memoised 60 s; 15 s after a failed read). Never throws. */
export async function loadLibraryGuardSettings(): Promise<LibraryGuardSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight) return inflight;
  inflight = fetchSettings()
    .then(({ value, ok }) => {
      cached = { value, expiresAt: Date.now() + (ok ? TTL_MS : FAIL_TTL_MS) };
      return value;
    })
    .catch(() => LIBRARY_GUARD_DEFAULTS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
