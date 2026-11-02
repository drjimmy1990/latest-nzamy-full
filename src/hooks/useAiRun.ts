"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FOUNDER_CREDIT_REFUNDED_FAILURE, founderCreditRefundText } from "@/lib/membership/founderPlan";

/**
 * useAiRun — the one client for the AI tools (plan §2.4). `start(tool, input)`
 * POSTs /api/v1/ai/runs with a fresh idempotency key:
 *
 *   fast tool → the answer comes back on the same request;
 *   job tool  → 202, then GET /api/v1/ai/runs/<id> every 3 s until the run
 *               leaves `running` (the step n8n reports is shown meanwhile).
 *
 * Errors are the server's Arabic message (402 points, 429 daily limit, 423
 * tool off, 504 timeout with points refunded…), never an invented result.
 *
 * A conversation tool answers with its `conversationId`; it is kept so the
 * page can send the next turn into the same conversation.
 *
 * `start(tool, input, { useCredit: true })` asks to pay with a founder credit
 * (P3) instead of points; the server decides whether the run qualifies and
 * answers `creditUsed`. A run that does not qualify is charged points as usual;
 * no credit left is a 402 «لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة».
 * A failed credit run says «أُعيد رصيد باقة المؤسس», never «أُعيدت نقاطك»
 * (R20); a page passes useCredit only when the run qualifies
 * (founderCreditChoiceView), so the two agree.
 */

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
}

const IDLE: AiRunState = {
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
};

const POLL_MS = 3000;
const POLL_LIMIT_MS = 20 * 60 * 1000;
const FALLBACK_ERROR = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function useAiRun() {
  const [state, setState] = useState<AiRunState>(IDLE);
  const alive = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const poll = useCallback((runId: string, startedAt: number) => {
    pollTimer.current = setTimeout(async () => {
      if (!alive.current) return;
      try {
        const res = await fetch(`/api/v1/ai/runs/${runId}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { run?: Record<string, unknown>; error?: string };
        const run = json.run;
        if (!res.ok || !run) throw new Error(json.error ?? FALLBACK_ERROR);
        if (run.status === "running") {
          if (Date.now() - startedAt > POLL_LIMIT_MS) throw new Error("ما زال الطلب قيد التنفيذ — ستجده في السجل عند اكتماله");
          setState((s) => ({ ...s, step: typeof run.progress_step === "string" ? run.progress_step : s.step }));
          poll(runId, startedAt);
          return;
        }
        if (run.status === "succeeded") {
          setState((s) => ({
            ...s,
            phase: "done",
            output: (run.output as Record<string, unknown>) ?? null,
            citations: Array.isArray(run.citations) ? run.citations : [],
            chargedPoints: typeof run.charged_points === "number" ? run.charged_points : s.chargedPoints,
          }));
          return;
        }
        if (run.status === "review") {
          setState((s) => ({ ...s, phase: "review" }));
          return;
        }
        setState((s) => ({
          ...s,
          phase: "error",
          code: typeof run.error_code === "string" ? run.error_code : "failed",
          error: s.creditUsed
            ? FOUNDER_CREDIT_REFUNDED_FAILURE
            : run.refunded_at
              ? "تعذّر إكمال الطلب، وأُعيدت نقاطك"
              : "تعذّر إكمال الطلب",
        }));
      } catch (err) {
        if (alive.current) setState((s) => ({ ...s, phase: "error", error: (err as Error).message || FALLBACK_ERROR }));
      }
    }, POLL_MS);
  }, []);

  const start = useCallback(
    async (
      tool: string,
      input: Record<string, unknown>,
      opts: { variant?: string; fileIds?: string[]; conversationId?: string; useCredit?: boolean } = {},
    ) => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      setState({ ...IDLE, phase: "starting" });
      try {
        const res = await fetch("/api/v1/ai/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, input, ...opts, idempotencyKey: newKey() }),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive.current) return;
        const runId = typeof json.runId === "string" ? json.runId : null;
        const chargedPoints = typeof json.chargedPoints === "number" ? json.chargedPoints : 0;
        const creditUsed = json.creditUsed === true;
        const conversationId = typeof json.conversationId === "string" ? json.conversationId : opts.conversationId ?? null;
        if (res.status === 202 && runId) {
          setState({ ...IDLE, phase: "running", runId, chargedPoints, creditUsed, conversationId });
          poll(runId, Date.now());
          return;
        }
        if (res.ok && json.status === "review") {
          setState({ ...IDLE, phase: "review", runId, chargedPoints, creditUsed, conversationId });
          return;
        }
        if (res.ok) {
          setState({
            ...IDLE,
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
        setState({
          ...IDLE,
          phase: "error",
          runId,
          conversationId,
          code: typeof json.code === "string" ? json.code : null,
          // A credit run that failed after it started got its credit back,
          // though the server's message says «وأُعيدت نقاطك» (R20).
          error: typeof json.error === "string" ? founderCreditRefundText(json.error, opts.useCredit === true) : FALLBACK_ERROR,
        });
      } catch {
        if (alive.current) setState({ ...IDLE, phase: "error", error: FALLBACK_ERROR });
      }
    },
    [poll],
  );

  const reset = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setState(IDLE);
  }, []);

  return { ...state, start, reset, busy: state.phase === "starting" || state.phase === "running" };
}
