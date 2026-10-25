"use client";

/**
 * CaseTimeline — «السجل الزمني» tab of the lawyer case file (N3.7, owner §٤٥
 * axis 1): hearings, litigation stages, ledger entries and the notes the
 * reader may see, on one line (GET /api/v1/cases/[id]/timeline), with
 * «إضافة قيد صادر / وارد». Days and times are Riyadh wall clock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CalendarCheck, Scales, ArrowUpRight, ArrowDownLeft, ChatDots, Plus, ArrowClockwise, ClockCounterClockwise } from "@phosphor-icons/react";
import type { TimelineItem } from "@/lib/caseTimeline/buildCaseTimeline";
import { getCaseTimeline, LEDGER_EVENT } from "@/lib/services/ledgerService";
import { DASHBOARD_NOTES_EVENT } from "@/lib/services/dashboardNotesService";
import LedgerEntryModal from "@/components/dashboard/ledger/LedgerEntryModal";

const DAY_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const HEARING_STATUS_AR: Record<string, string> = { scheduled: "مجدولة", held: "انعقدت", adjourned: "مؤجلة", cancelled: "ملغاة" };
const NOTE_SCOPE_AR: Record<string, string> = { private: "خاصة", case_team: "فريق القضية", firm: "المكتب" };

/** "YYYY-MM-DD" (already a Riyadh day) → Arabic long date; read as UTC so the day never shifts. */
function dayLabel(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? day : DAY_AR.format(ms);
}

/** time · hearing status / note scope · court, outcome or ledger notes. */
function metaLine(it: TimelineItem): string {
  const parts: string[] = [];
  if (it.time) parts.push(it.time);
  if (it.kind === "hearing" && it.tag && HEARING_STATUS_AR[it.tag]) parts.push(HEARING_STATUS_AR[it.tag]);
  if (it.kind === "note" && it.tag && NOTE_SCOPE_AR[it.tag]) parts.push(NOTE_SCOPE_AR[it.tag]);
  if (it.kind !== "note" && it.detail) parts.push(it.detail);
  return parts.join(" · ");
}

function iconFor(item: TimelineItem) {
  if (item.kind === "hearing") return CalendarCheck;
  if (item.kind === "ledger") return item.tag === "out" ? ArrowUpRight : ArrowDownLeft;
  if (item.kind === "note") return ChatDots;
  return Scales;
}

export default function CaseTimeline({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [partial, setPartial] = useState(false);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setState("loading");
    getCaseTimeline(caseId)
      .then((r) => { setItems(r.items); setPartial(r.partial); setState("ready"); })
      .catch(() => setState("error"));
  }, [caseId]);

  useEffect(() => {
    load();
    window.addEventListener(LEDGER_EVENT, load);
    window.addEventListener(DASHBOARD_NOTES_EVENT, load);
    return () => {
      window.removeEventListener(LEDGER_EVENT, load);
      window.removeEventListener(DASHBOARD_NOTES_EVENT, load);
    };
  }, [load]);

  const groups = useMemo(() => {
    const out: { day: string; items: TimelineItem[] }[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && last.day === it.day) last.items.push(it);
      else out.push({ day: it.day, items: [it] });
    }
    return out;
  }, [items]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className={`${card} p-5`} dir="rtl">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className={`flex items-center gap-2 text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
          <ClockCounterClockwise size={18} weight="duotone" className="text-[#C8A762]" aria-hidden="true" />
          السجل الزمني للقضية
        </h2>
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#092e22] dark:bg-[#C8A762] dark:text-[#0B3D2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]">
          <Plus size={13} weight="bold" aria-hidden="true" /> إضافة قيد صادر / وارد
        </button>
      </div>

      {partial && state === "ready" && (
        <p role="status" className={`mb-3 rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          تعذّر تحميل جزء من السجل — قد لا يظهر كل ما في القضية الآن.
        </p>
      )}

      {state === "loading" ? (
        <p className={`text-[12px] ${muted}`} aria-live="polite">جارٍ تحميل السجل الزمني…</p>
      ) : state === "error" ? (
        <div role="alert" className={`flex items-center justify-between rounded-xl border px-3 py-3 text-[12px] ${isDark ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <span>تعذّر تحميل السجل الزمني.</span>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><ArrowClockwise size={12} aria-hidden="true" /> إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <p className={`rounded-xl border border-dashed px-4 py-8 text-center text-[12px] ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-slate-500"}`}>
          لا شيء في سجل هذه القضية بعد. الجلسات ودرجات التقاضي وقيود الصادر والوارد والملاحظات تظهر هنا بترتيبها الزمني.
        </p>
      ) : (
        <ol className="space-y-5">
          {groups.map((g) => (
            <li key={g.day}>
              <h3 className={`mb-2 text-[12px] font-bold ${muted}`}>{dayLabel(g.day)}</h3>
              <ol className={`space-y-2 border-s-2 ps-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                {g.items.map((it) => {
                  const Icon = iconFor(it);
                  return (
                    <li key={it.key} className="relative">
                      <span className={`absolute -start-[1.6rem] top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                        it.upcoming ? "bg-[#C8A762] text-[#0B3D2E]" : isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-600"
                      }`}>
                        <Icon size={11} aria-hidden="true" />
                      </span>
                      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                        {it.title}
                        {it.upcoming && <span className="ms-2 rounded-md bg-[#C8A762]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#8a6d2c] dark:text-[#C8A762]">قادمة</span>}
                      </p>
                      {metaLine(it) && <p className={`mt-0.5 text-[11px] ${muted}`}>{metaLine(it)}</p>}
                      {it.kind === "note" && it.detail && (
                        <p className={`mt-1 text-[12px] whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{it.detail}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <AnimatePresence>
        {adding && <LedgerEntryModal isDark={isDark} caseRequestId={caseId} onClose={() => setAdding(false)} />}
      </AnimatePresence>
    </div>
  );
}
