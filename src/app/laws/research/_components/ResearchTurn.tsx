"use client";

/**
 * One question of a research session and what came back (owner file 11, V3):
 * the question bubble; while it runs, the live stage card; then either the
 * server's refusal in its own words with its link, or the answer — the folded
 * «خطوات البحث والتأصيل» with the real source count, the text with its cited
 * numbers, the sources (each opens the side panel), and the action strip. No
 * guidance text sits inside the answer (item 2): the tour explains the page.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CitedText, SourceList, type Citation } from "@/components/ai/CitedAnswer";
import type { ResearchTurn as Turn } from "./useLibraryResearch";
import { ResearchStageCard, ResearchStepsFold } from "./ResearchStageCard";
import { ResearchAnswerActions } from "./ResearchAnswerActions";

const ROYAL = "#0B3D2E";
const GOLD = "#C8A762";

export function ResearchTurnView({
  turn,
  isDark,
  onOpenCite,
  renderPlain,
}: {
  turn: Turn;
  isDark: boolean;
  onOpenCite: (c: Citation, n: number) => void;
  /** How an answer without citations is shown (the page's light Markdown). */
  renderPlain: (text: string) => ReactNode;
}) {
  const a = turn.answer;
  return (
    <div className="space-y-3">
      <div className="flex justify-start">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13.5px] leading-relaxed text-white" style={{ background: ROYAL }}>
          {turn.question}
        </p>
      </div>

      {a === null && <ResearchStageCard events={turn.events} startedAt={turn.startedAt} isDark={isDark} />}

      {a?.refused && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${isDark ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="whitespace-pre-line">{a.text}</p>
          {a.action && (
            <Link href={a.action.href} className="mt-2.5 inline-block rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition-transform hover:opacity-90 motion-safe:active:scale-[0.97]" style={{ background: ROYAL }}>
              {a.action.label}
            </Link>
          )}
        </div>
      )}

      {a && !a.refused && (
        <article className={`space-y-4 rounded-2xl border px-4 py-4 ${isDark ? "border-white/[0.07] bg-white/[0.02] text-zinc-100" : "border-slate-200 bg-slate-50/60 text-slate-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold" style={{ color: isDark ? GOLD : ROYAL }}>باحث المكتبة</p>
            <ResearchStepsFold events={turn.events} sourceCount={a.cites.length} isDark={isDark} />
          </div>
          <div data-research="answer">
            {a.cites.length > 0
              ? <CitedText text={a.text} cites={a.cites} isDark={isDark} className="text-[14px] leading-[1.95]" onOpenCite={onOpenCite} />
              : <div className="text-[14px] leading-[1.95]">{renderPlain(a.text)}</div>}
          </div>
          {a.cites.length > 0 && (
            <div data-research="sources">
              <p className={`mb-1.5 text-[11.5px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المصادر</p>
              <SourceList cites={a.cites} isDark={isDark} compact onOpenCite={onOpenCite} />
            </div>
          )}
          <div className={`border-t pt-3 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
            <ResearchAnswerActions text={a.text} question={turn.question} isDark={isDark} />
          </div>
        </article>
      )}
    </div>
  );
}
