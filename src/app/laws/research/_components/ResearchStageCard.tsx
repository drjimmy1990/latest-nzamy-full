"use client";

/**
 * The live «التفكير والتأصيل الحي» card while a question runs, and the folded
 * «خطوات البحث والتأصيل» after it (owner file 11 item 6, V3 phase A2). Both
 * read only what the server reported (researchStages.ts): no timer moves a
 * stage, and the folded steps list only recorded search phrases, texts,
 * principles and checks.
 */
import { useEffect, useState } from "react";
import { CaretDown, CheckCircle } from "@phosphor-icons/react";
import {
  foldedIsEmpty,
  foldedSteps,
  RESEARCH_STAGES,
  sourcesCountAr,
  stageView,
  type StageEvent,
} from "./researchStages";

const ROYAL = "#0B3D2E";
const GOLD = "#C8A762";

function elapsedAr(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ResearchStageCard({ events, startedAt, isDark }: { events: StageEvent[]; startedAt: number; isDark: boolean }) {
  const v = stageView(events, false);
  // Empty until the first tick on the client, so SSR renders no time.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const pct = Math.round((v.done / RESEARCH_STAGES.length) * 100);
  return (
    <section
      role="status"
      aria-live="polite"
      data-research="stages"
      className={`rounded-2xl border px-4 py-3.5 space-y-3 ${isDark ? "border-[#C8A762]/40 bg-white/[0.03]" : "border-[#C8A762]/45 bg-white"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`flex items-center gap-2.5 text-[13px] font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
          <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full motion-safe:animate-pulse" style={{ background: GOLD }} />
          {v.headline}
        </p>
        <span className="flex items-center gap-2">
          {now !== null && <span className={`text-[11px] tabular-nums ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{elapsedAr(now - startedAt)}</span>}
          <span className="rounded-full px-2 py-0.5 font-mono text-[11px]" style={{ background: "rgba(200,167,98,0.14)", color: GOLD }}>{v.counter}</span>
        </span>
      </div>
      <div className={`h-1 w-full overflow-hidden rounded-full ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ROYAL}, ${GOLD})` }} />
      </div>
      {v.completed.length > 0 && (
        <ul className={`space-y-1.5 text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          {v.completed.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <CheckCircle size={13} weight="bold" className="text-emerald-500" aria-hidden="true" /> {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** «خطوات البحث والتأصيل · ٣ مراجع»: closed by default, opens the recorded steps. */
export function ResearchStepsFold({ events, sourceCount, isDark }: { events: StageEvent[]; sourceCount: number; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const f = foldedSteps(events);
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const groups: Array<[string, string[]]> = [
    ["عمليات البحث", f.queries],
    ["النصوص المسترجعة", f.texts],
    ["المبادئ القضائية", f.principles],
    ["التحقق", f.checks],
  ];
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-transform motion-safe:active:scale-[0.97] ${
          isDark ? "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-[#C8A762]/40" : "border-slate-200 bg-white text-slate-700 hover:border-[#0B3D2E]/40"
        }`}
      >
        <CaretDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        خطوات البحث والتأصيل
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{sourcesCountAr(sourceCount)}</span>
      </button>
      {open && (
        <div className={`space-y-2.5 rounded-xl border-r-2 px-3.5 py-3 text-[12px] leading-relaxed ${isDark ? "bg-white/[0.02] text-zinc-300" : "bg-slate-50 text-slate-700"}`} style={{ borderRightColor: GOLD }}>
          {foldedIsEmpty(f) ? (
            <p className={muted}>لم تُسجَّل خطوات هذا البحث تفصيلاً؛ مصادره مذكورة مع الإجابة.</p>
          ) : (
            groups.map(([title, items]) =>
              items.length === 0 ? null : (
                <div key={title}>
                  <p className={`mb-1 text-[11px] font-bold ${muted}`}>{title}</p>
                  <ul className="space-y-0.5">
                    {items.map((label) => <li key={label} className="break-words">{label}</li>)}
                  </ul>
                </div>
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}
