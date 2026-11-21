/**
 * readerDisplaySettingsServer.ts — reads platform_settings.library_reader_display
 * (readerDisplaySettings.ts) for the library routes, remembered 60 seconds per
 * process (15 s after a failed read).
 *
 * A plain GET to PostgREST as the service role (as publicGuardServer.ts).
 * FAILS TO THE DEFAULTS: no key, a timeout, a missing row or any error answers
 * LIBRARY_READER_DISPLAY_DEFAULTS. Never throws.
 */
import {
  LIBRARY_READER_DISPLAY_DEFAULTS,
  LIBRARY_READER_DISPLAY_KEY,
  parseLibraryReaderDisplay,
  type LibraryReaderDisplay,
} from "./readerDisplaySettings";

const TTL_MS = 60 * 1000;
const FAIL_TTL_MS = 15 * 1000;
const TIMEOUT_MS = 1_500;

let cached: { value: LibraryReaderDisplay; expiresAt: number } | null = null;
let inflight: Promise<LibraryReaderDisplay> | null = null;

async function fetchSetting(): Promise<{ value: LibraryReaderDisplay; ok: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { value: LIBRARY_READER_DISPLAY_DEFAULTS, ok: false };
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/platform_settings?select=value&key=eq.${LIBRARY_READER_DISPLAY_KEY}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (!res.ok) return { value: LIBRARY_READER_DISPLAY_DEFAULTS, ok: false };
    const rows = (await res.json()) as Array<{ value?: unknown }>;
    return { value: parseLibraryReaderDisplay(Array.isArray(rows) ? rows[0]?.value : null), ok: true };
  } catch {
    return { value: LIBRARY_READER_DISPLAY_DEFAULTS, ok: false };
  }
}

/** The setting now (memoised). Never throws. */
export async function loadLibraryReaderDisplay(): Promise<LibraryReaderDisplay> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight) return inflight;
  inflight = fetchSetting()
    .then(({ value, ok }) => {
      cached = { value, expiresAt: Date.now() + (ok ? TTL_MS : FAIL_TTL_MS) };
      return value;
    })
    .catch(() => LIBRARY_READER_DISPLAY_DEFAULTS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
