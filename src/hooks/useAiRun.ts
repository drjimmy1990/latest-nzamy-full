"use client";

import { useEffect, useState } from "react";
import { createAiRunClient, IDLE_RUN, type AiRunPhase, type AiRunState } from "@/lib/ai/aiRunClient";

/**
 * useAiRun — the one client for the AI tools (plan §2.4), as a React state.
 * The machine is src/lib/ai/aiRunClient.ts: it POSTs the run, follows its progress
 * events until a final state, and keeps at most one timer, which unmounting clears.
 *
 * `start(tool, input, { useCredit: true })` asks to pay with a founder credit (P3)
 * instead of points; the server decides whether the run qualifies and answers
 * `creditUsed`. A run that does not qualify is charged points as usual; no credit
 * left is a 402 «لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة».
 */

export type { AiRunPhase, AiRunState };

export function useAiRun() {
  const [state, setState] = useState<AiRunState>(IDLE_RUN);
  const [client] = useState(() => createAiRunClient({ onChange: setState }));

  useEffect(() => {
    return () => client.stop();
  }, [client]);

  return { ...state, start: client.start, reset: client.reset, busy: state.phase === "starting" || state.phase === "running" };
}
