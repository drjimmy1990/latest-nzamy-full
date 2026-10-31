/**
 * activityMeterServer.ts — the I/O half of «نشاط المكتبة» (20261031_10): one
 * tally per server process (activityMeter.ts), sent to
 * public.library_activity_bump at most every 30 seconds, by a timer started
 * on the first request of a batch (unref'd: it never keeps the process up).
 *
 * FAILS OPEN, ALWAYS, and never delays a request: record() only adds to a
 * Map; the flush runs detached. A missing function (the migration not applied
 * yet) pauses sending for 10 minutes; any other failure drops that batch. The
 * key is read from the environment per call and never logged.
 */
import { ActivityMeter, type LibraryActivityKind } from "./activityMeter";

const RPC = "library_activity_bump";
const FLUSH_AFTER_MS = 30 * 1000;
/** Flush at once when this many (reader, hour) rows are waiting. */
const FLUSH_AT_ROWS = 2_000;
const RPC_TIMEOUT_MS = 5_000;
const MISSING_RETRY_MS = 10 * 60 * 1000;

const meter = new ActivityMeter(5_000);
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let functionMissingUntil = 0;
let missingLogged = false;

function isMissingFunction(status: number, body: unknown): boolean {
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  return code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01" || status === 404;
}

async function flush(): Promise<void> {
  timer = null;
  if (flushing) return;
  const rows = meter.drain();
  if (rows.length === 0 || Date.now() < functionMissingUntil) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  flushing = true;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_rows: rows }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      if (isMissingFunction(res.status, body)) {
        functionMissingUntil = Date.now() + MISSING_RETRY_MS;
        if (!missingLogged) {
          missingLogged = true;
          console.warn("[library-activity] public.library_activity_bump is missing (20261031_10 not applied); activity is not recorded");
        }
      } else {
        console.error("[library-activity] batch failed:", res.status);
      }
    }
  } catch (err) {
    console.error("[library-activity] batch threw:", err instanceof Error ? err.name : "error");
  } finally {
    flushing = false;
  }
}

function schedule(): void {
  if (meter.size >= FLUSH_AT_ROWS) {
    if (timer) clearTimeout(timer);
    void flush();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => void flush(), FLUSH_AFTER_MS);
  (timer as { unref?: () => void }).unref?.();
}

/** Counts one library request of a signed-in reader. Never throws, never waits. */
export function recordLibraryActivity(userId: string, kind: LibraryActivityKind): void {
  try {
    if (Date.now() < functionMissingUntil) return;
    if (!meter.record(userId, kind, Date.now())) {
      void flush();
      return;
    }
    schedule();
  } catch {
    // the tally is never worth a failed request
  }
}
