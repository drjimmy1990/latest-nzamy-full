/**
 * researchProgress — follows one library question's progress while its POST is
 * in flight (owner file 11 item 6, V3 phase A2): GET
 * /api/v1/ai/runs/progress?key=K&after=N every 1.5 s, the same read useAiRun
 * makes (aiRunClient.watchKey), for the key askLibrary reports through onKey.
 *
 * It never decides anything about the answer: it only hands new events to the
 * page. A 429 waits as long as the server asks; any other failure just tries
 * again on the next tick. `finish()` makes one last read (the citation check is
 * written after the answer settles, in the same request) and stops.
 *
 * Pure (deps injected), so `node --test` runs it.
 */
import type { StageEvent } from "./researchStages.ts";

export const PROGRESS_POLL_MS = 1500;
export const PROGRESS_LIMIT_MS = 10 * 60 * 1000;
const KEY = /^[A-Za-z0-9_-]{8,100}$/;

export interface ProgressDeps {
  fetchImpl: typeof fetch;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
}

export interface ProgressWatch {
  /** Follow another key (a full conversation's retry mints a new one); the events so far stay. */
  follow: (key: string) => void;
  /** One last read, then stop. */
  finish: () => Promise<void>;
  /** Stop now (the page unmounted). */
  stop: () => void;
}

function asEvents(raw: unknown): StageEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StageEvent =>
      typeof e === "object" && e !== null && typeof (e as StageEvent).kind === "string" && typeof (e as StageEvent).label === "string",
  );
}

function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get("Retry-After"));
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 30_000) : 3000;
}

export function watchResearchProgress(onEvents: (events: StageEvent[]) => void, deps: ProgressDeps): ProgressWatch {
  let key: string | null = null;
  let cursor = 0;
  let timer: unknown = null;
  let stopped = false;
  let since = deps.now();

  const read = async (): Promise<number> => {
    if (!key) return PROGRESS_POLL_MS;
    try {
      const res = await deps.fetchImpl(`/api/v1/ai/runs/progress?key=${encodeURIComponent(key)}&after=${cursor}`, { cache: "no-store" });
      if (res.status === 429) return retryAfterMs(res);
      if (!res.ok) return PROGRESS_POLL_MS;
      const body = (await res.json().catch(() => null)) as { events?: unknown } | null;
      const events = asEvents(body?.events);
      for (const e of events) if (typeof e.id === "number" && e.id > cursor) cursor = e.id;
      if (events.length && !stopped) onEvents(events);
    } catch {
      // A failed read is tried again on the next tick.
    }
    return PROGRESS_POLL_MS;
  };

  const schedule = (ms: number) => {
    if (stopped) return;
    timer = deps.setTimer(async () => {
      timer = null;
      if (stopped) return;
      const wait = await read();
      if (deps.now() - since >= PROGRESS_LIMIT_MS) return;
      schedule(wait);
    }, ms);
  };

  const stop = () => {
    stopped = true;
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  return {
    follow(next: string) {
      if (stopped || !KEY.test(next)) return;
      const first = key === null;
      key = next;
      // A new key is a new run: its events start from the beginning.
      cursor = 0;
      since = deps.now();
      if (first || timer === null) schedule(PROGRESS_POLL_MS);
    },
    async finish() {
      if (stopped) return;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      await read();
      stop();
    },
    stop,
  };
}
