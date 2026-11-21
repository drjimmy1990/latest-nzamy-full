"use client";

/**
 * useLibraryResearch — one research session of «باحث المكتبة الذكي», shared by
 * the /laws AI tab (AiTabContent) and the studio page /laws/research (owner
 * file 11, V3 phase A2/A6). No new backend: every question is the existing
 * library assistant call (askLibrary → POST /api/v1/ai/runs, tool
 * `library-assistant`, 5 points), with the session's conversation id (Q458)
 * and the scope chips (T14-Q485). While it runs, the run's real progress
 * events are read by the key askLibrary reports (researchProgress.ts), and the
 * stage card moves only on them (researchStages.ts).
 *
 * The session lives in this page view only: nothing is written to the browser
 * (the questions are the reader's), and the durable history across devices is
 * phase B (a table and an API), not built yet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { askLibrary } from "../../[slug]/_library-assistant";
import type { LibraryAiAction } from "../../[slug]/_ai-reply";
import { asCitations, type Citation } from "@/components/ai/CitedAnswer";
import { scopeField, type LibraryScopeChoice } from "@/components/ai/LibraryScopeChips";
import { mergeEvents, type StageEvent } from "./researchStages";
import { watchResearchProgress, type ProgressWatch } from "./researchProgress";

export const QUESTION_MAX = 2000;

export interface ResearchAnswer {
  text: string;
  cites: Citation[];
  action?: LibraryAiAction;
  refused: boolean;
}

export interface ResearchTurn {
  id: string;
  question: string;
  scope: LibraryScopeChoice;
  /** null while the run is in flight. */
  answer: ResearchAnswer | null;
  /** What the server reported for this run, in order. */
  events: StageEvent[];
  startedAt: number;
}

export function useLibraryResearch() {
  const [turns, setTurns] = useState<ResearchTurn[]>([]);
  const conversationRef = useRef<string | null>(null);
  const watchRef = useRef<ProgressWatch | null>(null);
  const running = turns.some((t) => t.answer === null);

  useEffect(() => () => watchRef.current?.stop(), []);

  const send = useCallback(async (question: string, scope: LibraryScopeChoice): Promise<boolean> => {
    const q = question.trim().slice(0, QUESTION_MAX);
    if (!q || watchRef.current) return false;
    const id = `t-${Date.now()}`;
    setTurns((prev) => [...prev, { id, question: q, scope, answer: null, events: [], startedAt: Date.now() }]);
    const watch = watchResearchProgress(
      (events) => setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, events: mergeEvents(t.events, events) } : t))),
      {
        fetchImpl: (...args) => fetch(...args),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
        now: () => Date.now(),
      },
    );
    watchRef.current = watch;
    try {
      // The server's reply and citations, or the refusal it gave (askLibrary).
      // Owner Q458: a follow-up carries this session's conversation (the server
      // adds its last six turns).
      const res = await askLibrary(
        { message: q, conversationId: conversationRef.current, ...scopeField(scope) },
        window.location.pathname + window.location.search,
        fetch,
        (key) => watch.follow(key),
      );
      if (res.conversationId) conversationRef.current = res.conversationId;
      setTurns((prev) => prev.map((t) => (t.id === id
        ? { ...t, answer: { text: res.text, cites: asCitations(res.citations), action: res.action, refused: res.refused === true } }
        : t)));
      // The citation check is written after the answer: one last read for the folded steps.
      await watch.finish();
    } finally {
      watch.stop();
      if (watchRef.current === watch) watchRef.current = null;
    }
    return true;
  }, []);

  /** «بحث جديد»: a new conversation; the old questions leave the screen. */
  const reset = useCallback(() => {
    if (watchRef.current) return;
    conversationRef.current = null;
    setTurns([]);
  }, []);

  return { turns, running, send, reset };
}
