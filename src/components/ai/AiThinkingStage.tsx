"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { RUN_STILL_RUNNING_CODE, type AiRunState } from "@/lib/ai/aiRunClient";
import {
  currentStepLabel,
  formatElapsed,
  groupProgress,
  stageHeader,
  stillRunningLinks,
  STAGE_NO_EVENTS_AR,
  STAGE_STALE_AR,
} from "./aiThinkingStage.logic";

/**
 * <AiThinkingStage/> — what a run is doing while it works: the files it read, its
 * searches, the titles it retrieved and its checks, as the run reported them
 * (useAiRun), and the real time since the press. There is no percentage and no
 * stage timing, because the run reports neither. With nothing reported yet it says
 * so. A page mounts it once, whatever the phase: it shows while the run works, and
 * after useAiRun stops watching a run it shows the links to follow it, beside the
 * page's own error text. Otherwise it renders nothing.
 */

export type AiStageRun = Pick<AiRunState, "phase" | "step" | "events" | "startedAt" | "runId" | "code" | "stale">;

interface Props {
  run: AiStageRun;
  isDark: boolean;
  toolLabel?: string;
}

const GROUP_TITLES = [
  ["files", "الملفات المقروءة"],
  ["queries", "عمليات البحث"],
  ["sources", "النصوص المسترجعة"],
  ["verify", "التحقق"],
  ["notes", "ملاحظات المحرّك"],
] as const;

export function AiThinkingStage({ run, isDark, toolLabel }: Props) {
  const { phase, step, events, startedAt, runId, code, stale } = run;
  const { userType } = useUser();
  const working = phase === "starting" || phase === "running";
  // Empty until the first tick on the client, so SSR renders no time.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [working]);

  const card = `rounded-2xl border px-4 py-3 ${isDark ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"}`;
  const body = isDark ? "text-zinc-300" : "text-zinc-700";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";

  if (phase === "error" && code === RUN_STILL_RUNNING_CODE && runId) {
    return (
      <nav aria-label="متابعة الطلب" className="flex flex-wrap gap-3 text-[12px] font-bold">
        {stillRunningLinks(runId, userType).map((l) => (
          <Link key={l.href} href={l.href} className={`underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    );
  }
  if (!working) return null;

  const groups = groupProgress(events);
  return (
    <section className={`${card} space-y-2.5`} dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <p className={`flex items-center gap-2 text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          <span aria-hidden="true" className={`h-2 w-2 flex-shrink-0 rounded-full motion-safe:animate-pulse ${isDark ? "bg-[#C8A762]" : "bg-[#0B3D2E]"}`} />
          {stageHeader(toolLabel)}
        </p>
        {now !== null && startedAt !== null && (
          <span className={`text-[12px] tabular-nums ${muted}`}>{formatElapsed(now - startedAt)}</span>
        )}
      </div>
      <div aria-live="polite" className="space-y-2.5">
        <p className={`text-[12px] ${body}`}>{currentStepLabel(step, events)}</p>
        {events.length === 0 && !stale && <p className={`text-[11px] ${muted}`}>{STAGE_NO_EVENTS_AR}</p>}
        {stale && <p className={`text-[11px] ${muted}`}>{STAGE_STALE_AR}</p>}
        {GROUP_TITLES.map(([key, title]) =>
          groups[key].length === 0 ? null : (
            <div key={key}>
              <p className={`mb-1 text-[11px] font-bold ${muted}`}>{title}</p>
              <ul className={`max-h-32 space-y-0.5 overflow-y-auto text-[12px] ${body}`}>
                {groups[key].map((label) => (
                  <li key={label} className="break-words">{label}</li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

export default AiThinkingStage;
