/**
 * _bounded.ts — time limits for the reader's links answers (POST-L18-01,
 * owner package 27 Nov 2026, batch l19: «/laws/judiciary-law hung on GET
 * …/citations?bulk=1 → 502»).
 *
 * The links box is extra: the law's text never waits for it. So no step of the
 * links route may wait without end — the public guard, the admin switch, the
 * graph read and the per-viewer lock read each get a budget, and past it the
 * route answers what it can (fails CLOSED for the viewer lock: a locked
 * article's links never show because a read was slow — owner ٢٣٦). The page's
 * own request has its own limit (_ref-box.tsx LINKS_FETCH_TIMEOUT_MS), longer
 * than the server's whole budget, so the box always ends in «done» or
 * «failed», never in an endless skeleton.
 *
 * And a cold cache (every process restart — each deploy) must not run the
 * same heavy graph read once per waiting reader: concurrent misses of one key
 * share ONE read (createSingleFlight).
 *
 * Pure: `node --test` runs _bounded.test.ts.
 */

/** The public guard (library open/closed + the account-type switch). */
export const GATE_BUDGET_MS = 3_000;
/** The admin switch for the similar-meaning section (cached in-process; normally instant). */
export const FLAGS_BUDGET_MS = 1_500;
/** The graph read of a whole law (graph_rag_law_article_links) or of one article's sections. */
export const GRAPH_BUDGET_MS = 8_000;
/** Who is reading (the decree mask + the locked-article strip): runs beside the graph read. */
export const VIEWER_BUDGET_MS = 3_000;

export type Bounded<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * `work` within `ms`, or `{ timedOut: true }`. The work itself is not stopped
 * (a Supabase read already sent finishes on its own); only the wait is
 * bounded. A rejection of `work` is passed through, as without the bound.
 */
export function withinBudget<T>(work: Promise<T>, ms: number): Promise<Bounded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Bounded<T>>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, ms));
  });
  const settled = work.then((value): Bounded<T> => ({ timedOut: false, value }));
  // A rejection that comes after the budget ran out has no one waiting: keep
  // it from surfacing as an unhandled rejection (the race below still sees a
  // rejection that comes in time).
  settled.catch(() => undefined);
  return Promise.race([settled, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** `work` within `ms`, else `fallback` (and the second value says which). */
export async function orFallback<T>(work: Promise<T>, ms: number, fallback: T): Promise<[T, boolean]> {
  const r = await withinBudget(work, ms);
  return r.timedOut ? [fallback, true] : [r.value, false];
}

export interface SingleFlight<V> {
  /** The in-flight promise for `key`, or a new one from `start()`; forgotten once it settles. */
  run(key: string, start: () => Promise<V>): Promise<V>;
  readonly size: number;
}

/** Concurrent callers of one key share one promise; nothing is kept after it settles (the TTL cache does that). */
export function createSingleFlight<V>(): SingleFlight<V> {
  const inflight = new Map<string, Promise<V>>();
  return {
    run(key, start) {
      const pending = inflight.get(key);
      if (pending) return pending;
      let p: Promise<V>;
      try {
        p = start();
      } catch (err) {
        p = Promise.reject(err);
      }
      const shared = p.finally(() => {
        if (inflight.get(key) === shared) inflight.delete(key);
      });
      inflight.set(key, shared);
      return shared;
    },
    get size() {
      return inflight.size;
    },
  };
}

/**
 * What the viewer step answers when it ran out of time: no subscriber mask
 * lifted, every article's links hidden — the same as a failed read (fails
 * closed, owner ٢٣٦). The box then shows no links for this page view.
 */
export function closedViewer(): { isSubscriber: false; openIds: Set<string> } {
  return { isSubscriber: false, openIds: new Set<string>() };
}

// ── The reader's side (_ref-box.tsx) ─────────────────────────────────────────

/**
 * The route's longest answer (l19 review N7): the ?article= path waits for the
 * guard, the switch, the viewer read, then the article's own-law lock read
 * (each within its budget, one after the other), then the graph read. The
 * bulk path is shorter (its viewer read runs beside the graph read).
 */
export const LINKS_ROUTE_WORST_MS = GATE_BUDGET_MS + FLAGS_BUDGET_MS + 2 * VIEWER_BUDGET_MS + GRAPH_BUDGET_MS;

/**
 * The page's own wait for a links answer: longer than the route's longest
 * answer (LINKS_ROUTE_WORST_MS) plus a margin, so a slow server still answers
 * first; past it the request is dropped and the box shows the article without
 * its links («failed»), never an endless skeleton.
 */
export const LINKS_FETCH_TIMEOUT_MS = LINKS_ROUTE_WORST_MS + 1_500;

/** A non-2xx links answer: its HTTP status (503 = links_busy, POST-L18-01 / l19 review S3). */
export type LinksFetchError = Error & { status?: number };

/** True for the route's «busy» answer (503 links_busy): the reader stops asking for this page view. */
export function isLinksBusyError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as LinksFetchError).status === 503;
}

/**
 * GET `url` as JSON within `ms`: a non-2xx answer, a network error and a
 * timeout all reject (the caller's «failed»). The request is aborted at the
 * deadline, so the browser lets the connection go.
 */
export async function fetchJsonWithin<T>(
  url: string,
  ms: number = LINKS_FETCH_TIMEOUT_MS,
  fetchImpl: (input: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> = (input, init) => fetch(input, init),
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, ms));
  try {
    const r = await fetchImpl(url, { signal: controller.signal });
    if (!r.ok) {
      const err: LinksFetchError = new Error(String(r.status));
      err.status = r.status;
      throw err;
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
