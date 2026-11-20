"use client";

import { useCallback, useEffect, useState } from "react";
import { createAiRunClient, IDLE_RUN, type AiRunPhase, type AiRunStartOptions, type AiRunState } from "@/lib/ai/aiRunClient";
import {
  clearToolDraft,
  INSUFFICIENT_POINTS_CODE,
  INSUFFICIENT_POINTS_EVENT,
  saveToolDraft,
} from "@/lib/payments/topUpDraft";

/**
 * useAiRun — the one client for the AI tools (plan §2.4), as a React state.
 * The machine is src/lib/ai/aiRunClient.ts: it POSTs the run, follows its progress
 * events until a final state, and keeps at most one timer, which unmounting clears.
 *
 * `start(tool, input, { useCredit: true })` asks to pay with a founder credit (P3)
 * instead of points; the server decides whether the run qualifies and answers
 * `creditUsed`. A run that does not qualify is charged points as usual; no credit
 * left is a 402 «لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة».
 *
 * l6-pay (TopUpModal): a 402 insufficient_points refusal keeps the run's input
 * in sessionStorage for this tool (topUpDraft.ts) and sends
 * INSUFFICIENT_POINTS_EVENT, which the /ai layout's TopUpModalHost answers with
 * a top-up modal in place. A run the server accepts (running / done / review)
 * clears the tool's draft; an error never does.
 *
 * l11 (T8-Q511a): `draftState` (optional) is what is kept instead of the
 * run's input — the page's own form state (the labels, ids and raw fields
 * it can put back), for pages that send a transformed input. The page reads
 * it back with useToolDraft. Absent → the input is kept, as before.
 */

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export type { AiRunPhase, AiRunState };

export function useAiRun() {
  const [state, setState] = useState<AiRunState>(IDLE_RUN);
  const [client] = useState(() => createAiRunClient({ onChange: setState }));

  useEffect(() => {
    return () => client.stop();
  }, [client]);

  const start = useCallback(
    async (
      tool: string,
      input: Record<string, unknown>,
      opts?: AiRunStartOptions,
      draftState?: Record<string, unknown>,
    ): Promise<void> => {
      await client.start(tool, input, opts);
      const after = client.getState();
      if (after.phase === "error" && after.code === INSUFFICIENT_POINTS_CODE) {
        saveToolDraft(session(), tool, draftState ?? input, Date.now());
        try {
          window.dispatchEvent(new CustomEvent(INSUFFICIENT_POINTS_EVENT, { detail: { tool } }));
        } catch {
          // no window: nothing to open
        }
      } else if (after.phase === "running" || after.phase === "done" || after.phase === "review") {
        clearToolDraft(session(), tool);
      }
    },
    [client],
  );

  return { ...state, start, reset: client.reset, busy: state.phase === "starting" || state.phase === "running" };
}
