"use client";

import { useEffect } from "react";
import { loadToolDraft } from "@/lib/payments/topUpDraft";

/**
 * useToolDraft — l6-pay (TopUpModal): once, when the tool's page mounts, hands
 * `apply` the input a run of `tool` was refused with for insufficient points
 * (saved by useAiRun, src/lib/payments/topUpDraft.ts), so the buyer comes back
 * from a top-up to the text he typed. Nothing saved, a stale draft or blocked
 * storage → `apply` is never called. The draft is cleared by useAiRun once a
 * run of the tool is accepted, not here: leaving again before sending keeps it.
 */
export function useToolDraft(tool: string, apply: (input: Record<string, unknown>) => void): void {
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    const draft = loadToolDraft(storage, tool, Date.now());
    if (draft) apply(draft);
    // once per tool: a new `apply` each render must not re-apply the draft over what the user types
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
}
