/**
 * aiRunClient.ts — the machine behind useAiRun, the one client for the AI tools.
 * `start(tool, input)` POSTs /api/v1/ai/runs with a fresh idempotency key:
 *
 *   while the POST is in flight → GET /runs/progress?key= every 1.5 s, so a fast
 *     tool's searches and the moment before a job's 202 still show. Its failures
 *     are ignored: the POST's reply is the real answer.
 *   fast tool → the answer comes back on the POST;
 *   job tool  → 202, then GET /runs/<id>/events every 3 s, and once it is final
 *     one GET /runs/<id> for the output.
 *
 * Only a final state, the 20-minute limit or a signed-out / missing reply ends a
 * run's screen. A failed poll or a 429 keeps it going, because the run is not over
 * and it is already charged: nothing here says «حاول مرة أخرى» after a 202, since a
 * retry mints a new key and is a second charge. A POST cut at the gateway after the
 * run was seen follows that run for the same reason.
 *
 * Errors are the server's Arabic message (402 points, 429 daily limit, 423 tool
 * off…) or runFailureMessage, never an invented result. A failed credit run says
 * «أُعيد رصيد باقة المؤسس», never «أُعيدت نقاطك» (R20); a page passes useCredit only
 * when the run qualifies (founderCreditChoiceView), so the two agree.
 *
 * A conversation tool answers with its `conversationId`; it is kept so the page
 * can send the next turn into the same conversation.
 *
 * Exactly one timer at a time, and no interval: every step schedules the next only
 * if it is still the current one. Stopping (unmount) or resetting clears the timer
 * and drops any reply still on its way.
 *
 * Pure, with timers and fetch injectable, so `node --test` can count what is left.
 */
import { founderCreditRefundText } from "../membership/founderPlan.ts";
import {
  mergeProgressEvents,
  RUN_NOT_FOUND_AR,
  RUN_SESSION_LOST_AR,
  RUN_STILL_RUNNING_AR,
  runFailureMessage,
  type ProgressItem,
} from "./runErrors.ts";

export type AiRunPhase = "idle" | "starting" | "running" | "done" | "review" | "error";

export interface AiRunState {
  phase: AiRunPhase;
  runId: string | null;
  output: Record<string, unknown> | null;
  citations: unknown[];
  chargedPoints: number;
  /** True when the run was paid with a founder credit instead of points. */
  creditUsed: boolean;
  step: string | null;
  error: string | null;
  code: string | null;
  conversationId: string | null;
  /** What the run reported so far: titles and stage names only (R7). */
  events: ProgressItem[];
  /** Set by start(), a real clock on the client; null until then. */
  startedAt: number | null;
  /** The last job poll failed; the run itself may be fine. A 429 does not set it. */
  stale: boolean;
}

export const IDLE_RUN: AiRunState = {
  phase: "idle",
  runId: null,
  output: null,
  citations: [],
  chargedPoints: 0,
  creditUsed: false,
  step: null,
  error: null,
  code: null,
  conversationId: null,
  events: [],
  startedAt: null,
  stale: false,
};

/** The code a screen reads to link to /ai/runs/<id>: the run outlived this page's watching. */
export const RUN_STILL_RUNNING_CODE = "still_running";

export const KEY_POLL_MS = 1500;
export const JOB_POLL_MS = 3000;
export const POLL_LIMIT_MS = 20 * 60 * 1000;
const RETRY_AFTER_MAX_MS = 30_000;
const FALLBACK_ERROR = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

export interface AiRunStartOptions {
  variant?: string;
  fileIds?: string[];
  conversationId?: string;
  useCredit?: boolean;
}

export interface AiRunClientDeps {
  onChange: (state: AiRunState) => void;
  fetch?: typeof fetch;
  setTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (id: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
  newKey?: () => string;
}

function defaultKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function waitAfter429(res: Response, base: number): number {
  const raw = res.headers.get("retry-after") ?? "";
  if (!/^\d+$/.test(raw)) return base;
  return Math.max(base, Math.min(Number(raw) * 1000, RETRY_AFTER_MAX_MS));
}

type Reading =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "limited"; wait: number }
  | { kind: "denied" }
  | { kind: "gone" }
  | { kind: "trouble" };

export function createAiRunClient(deps: AiRunClientDeps) {
  const http: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const later = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  const now = deps.now ?? (() => Date.now());
  const newKey = deps.newKey ?? defaultKey;

  let state: AiRunState = IDLE_RUN;
  let startGen = 0; // start, reset and stop: a POST reply of an older one is dropped
  let pollGen = 0; // the same for a poll, and it also moves when the POST settles
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cursor = 0;
  let seenRunId: string | null = null;

  const put = (patch: Partial<AiRunState>) => {
    state = { ...state, ...patch };
    deps.onChange(state);
  };

  const stopPolling = () => {
    pollGen++;
    if (timer !== null) cancel(timer);
    timer = null;
  };

  const next = (gen: number, step: () => void | Promise<void>, ms: number) => {
    if (gen !== pollGen) return;
    if (timer !== null) cancel(timer);
    timer = later(() => {
      timer = null;
      if (gen === pollGen) void step();
    }, ms);
  };

  const read = async (url: string, base: number): Promise<Reading> => {
    try {
      const res = await http(url, { cache: "no-store" });
      if (res.status === 429) return { kind: "limited", wait: waitAfter429(res, base) };
      if (res.status === 401 || res.status === 403) return { kind: "denied" };
      if (res.status === 404) return { kind: "gone" };
      if (!res.ok) return { kind: "trouble" };
      const body: unknown = await res.json();
      return body !== null && typeof body === "object" ? { kind: "ok", body: body as Record<string, unknown> } : { kind: "trouble" };
    } catch {
      return { kind: "trouble" };
    }
  };

  const take = (body: Record<string, unknown>, stale: boolean) => {
    const rows = (Array.isArray(body.events) ? body.events : []) as ProgressItem[];
    for (const row of rows) if (typeof row?.id === "number" && row.id > cursor) cursor = row.id;
    const step = typeof body.step === "string" ? body.step : state.step;
    if (rows.length === 0 && step === state.step && stale === state.stale) return;
    put({ events: rows.length > 0 ? mergeProgressEvents(state.events, rows) : state.events, step, stale });
  };

  const end = (patch: Partial<AiRunState>) => {
    stopPolling();
    put({ stale: false, ...patch });
  };

  const stillRunning = (error: string) => end({ phase: "error", code: RUN_STILL_RUNNING_CODE, error });

  // ── After a 202 ────────────────────────────────────────────────────────────

  const follow = (runId: string) => {
    const gen = ++pollGen;
    const since = now();

    /** A reply that settled nothing: wait, or stop watching at the limit. */
    const again = (step: () => Promise<void>, ms: number) => {
      if (now() - since >= POLL_LIMIT_MS) stillRunning(RUN_STILL_RUNNING_AR);
      else next(gen, step, ms);
    };
    const unsettled = (reading: Exclude<Reading, { kind: "ok" }>, step: () => Promise<void>) => {
      if (reading.kind === "denied") return stillRunning(RUN_SESSION_LOST_AR);
      if (reading.kind === "gone") return end({ phase: "error", code: "not_found", error: RUN_NOT_FOUND_AR });
      if (reading.kind === "trouble" && !state.stale) put({ stale: true });
      again(step, reading.kind === "limited" ? reading.wait : JOB_POLL_MS);
    };

    const events = async () => {
      const reading = await read(`/api/v1/ai/runs/${runId}/events?after=${cursor}`, JOB_POLL_MS);
      if (gen !== pollGen) return;
      if (reading.kind !== "ok") return unsettled(reading, events);
      take(reading.body, false);
      if (reading.body.final === true) return result();
      again(events, JOB_POLL_MS);
    };

    const result = async () => {
      const reading = await read(`/api/v1/ai/runs/${runId}`, JOB_POLL_MS);
      if (gen !== pollGen) return;
      if (reading.kind !== "ok") return unsettled(reading, result);
      const run = reading.body.run as Record<string, unknown> | undefined;
      if (!run || typeof run !== "object") return unsettled({ kind: "trouble" }, result);
      if (run.status === "running") return again(events, JOB_POLL_MS);
      if (run.status === "succeeded") {
        return end({
          phase: "done",
          output: (run.output as Record<string, unknown>) ?? null,
          citations: Array.isArray(run.citations) ? run.citations : [],
          chargedPoints: typeof run.charged_points === "number" ? run.charged_points : state.chargedPoints,
        });
      }
      if (run.status === "review") return end({ phase: "review" });
      const code = typeof run.error_code === "string" ? run.error_code : null;
      end({
        phase: "error",
        code: code ?? "failed",
        error: runFailureMessage(code, Boolean(run.refunded_at), state.creditUsed),
      });
    };

    next(gen, events, JOB_POLL_MS);
  };

  // ── While the POST is in flight ────────────────────────────────────────────

  const watchKey = (key: string) => {
    const gen = ++pollGen;
    const since = now();
    const tick = async () => {
      const reading = await read(`/api/v1/ai/runs/progress?key=${encodeURIComponent(key)}&after=${cursor}`, KEY_POLL_MS);
      if (gen !== pollGen) return;
      if (reading.kind === "ok") {
        if (typeof reading.body.runId === "string") seenRunId = reading.body.runId;
        take(reading.body, false);
        if (reading.body.final === true) return;
      }
      if (now() - since >= POLL_LIMIT_MS) return;
      next(gen, tick, reading.kind === "limited" ? reading.wait : KEY_POLL_MS);
    };
    next(gen, tick, KEY_POLL_MS);
  };

  // ── The public three ───────────────────────────────────────────────────────

  const start = async (tool: string, input: Record<string, unknown>, opts: AiRunStartOptions = {}): Promise<void> => {
    const gen = ++startGen;
    stopPolling();
    cursor = 0;
    seenRunId = null;
    put({ ...IDLE_RUN, phase: "starting", startedAt: now() });
    const key = newKey();
    watchKey(key);

    /** A reply that is not an answer: follow a run that was seen, or say we lost it. */
    const lost = () => {
      stopPolling();
      if (seenRunId) {
        put({ phase: "running", runId: seenRunId, creditUsed: opts.useCredit === true, conversationId: opts.conversationId ?? null });
        follow(seenRunId);
      } else {
        put({ phase: "error", error: FALLBACK_ERROR });
      }
    };

    let res: Response;
    let json: Record<string, unknown>;
    try {
      res = await http("/api/v1/ai/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input, ...opts, idempotencyKey: key }),
      });
      json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch {
      if (gen === startGen) lost();
      return;
    }
    if (gen !== startGen) return;
    stopPolling();

    const runId = typeof json.runId === "string" ? json.runId : null;
    const chargedPoints = typeof json.chargedPoints === "number" ? json.chargedPoints : 0;
    const creditUsed = json.creditUsed === true;
    const conversationId = typeof json.conversationId === "string" ? json.conversationId : opts.conversationId ?? null;

    if (res.status === 202 && runId) {
      put({ phase: "running", runId, chargedPoints, creditUsed, conversationId });
      follow(runId);
      return;
    }
    if (res.ok && json.status === "review") {
      put({ phase: "review", runId, chargedPoints, creditUsed, conversationId });
      return;
    }
    if (res.ok) {
      put({
        phase: "done",
        runId,
        chargedPoints,
        creditUsed,
        conversationId,
        output: (json.output as Record<string, unknown>) ?? null,
        citations: Array.isArray(json.citations) ? json.citations : [],
      });
      return;
    }
    if (typeof json.error !== "string") return lost();
    put({
      phase: "error",
      runId,
      conversationId,
      code: typeof json.code === "string" ? json.code : null,
      // A credit run that failed after it started got its credit back,
      // though the server's message says «وأُعيدت نقاطك» (R20).
      error: founderCreditRefundText(json.error, opts.useCredit === true),
    });
  };

  const stop = () => {
    startGen++;
    stopPolling();
  };

  const reset = () => {
    stop();
    state = IDLE_RUN;
    deps.onChange(state);
  };

  return { start, reset, stop, getState: () => state };
}

export type AiRunClient = ReturnType<typeof createAiRunClient>;
