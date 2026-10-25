"use client";

/**
 * LedgerTab — «الصادر والوارد القانوني», tab 3 of /dashboard/lawyer/activity
 * (N3.7, owner §٤٥ axis 1): filters by direction, delivery channel and case,
 * real rows only, archive (never delete — owner directive 5).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { Plus, ArrowUpRight, ArrowDownLeft, Archive, ArrowCounterClockwise, PencilSimple, ArrowClockwise, Tray } from "@phosphor-icons/react";
import { CasePicker } from "@/components/ui/CasePicker";
import {
  LEDGER_CHANNELS,
  LEDGER_CHANNEL_LABEL_AR,
  LEDGER_DIRECTION_LABEL_AR,
  type LedgerChannel,
  type LedgerDirection,
} from "@/lib/ledger/ledgerInput";
import { LEDGER_EVENT, getLedger, updateLedgerEntry, type LedgerEntry } from "@/lib/services/ledgerService";
import LedgerEntryModal from "./LedgerEntryModal";

const WHEN_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
export const formatLedgerWhen = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : WHEN_AR.format(ms);
};

export default function LedgerTab({ isDark }: { isDark: boolean }) {
  const [direction, setDirection] = useState<LedgerDirection | "">("");
  const [channel, setChannel] = useState<LedgerChannel | "">("");
  const [caseId, setCaseId] = useState("");
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const query = useCallback(
    (before: string | null) => getLedger({ direction: direction || null, channel: channel || null, caseId: caseId || null, archived, before }),
    [direction, channel, caseId, archived],
  );

  const load = useCallback(() => {
    setState("loading");
    query(null)
      .then((p) => { setItems(p.items); setCursor(p.nextCursor); setState("ready"); })
      .catch(() => setState("error"));
  }, [query]);

  useEffect(() => {
    load();
    window.addEventListener(LEDGER_EVENT, load);
    return () => window.removeEventListener(LEDGER_EVENT, load);
  }, [load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const p = await query(cursor);
      setItems((prev) => [...prev, ...p.items]);
      setCursor(p.nextCursor);
    } catch {
      setRowError("تعذّر تحميل المزيد.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleArchive(e: LedgerEntry) {
    setRowError(null);
    try { await updateLedgerEntry(e.id, { archived: !e.archived }); }
    catch (err) { setRowError(err instanceof Error ? err.message : "تعذّر تحديث القيد."); }
  }

  const select = `rounded-xl border px-3 py-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
    isDark ? "bg-zinc-950 border-white/10 text-zinc-200" : "bg-white border-slate-200 text-slate-700"
  }`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white";

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-[11px] font-semibold">
          <span className={muted}>الاتجاه</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as LedgerDirection | "")} className={select}>
            <option value="">الكل</option>
            <option value="out">{LEDGER_DIRECTION_LABEL_AR.out}</option>
            <option value="in">{LEDGER_DIRECTION_LABEL_AR.in}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold">
          <span className={muted}>قناة التسليم</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as LedgerChannel | "")} className={select}>
            <option value="">كل القنوات</option>
            {LEDGER_CHANNELS.map((c) => <option key={c} value={c}>{LEDGER_CHANNEL_LABEL_AR[c]}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-[11px] font-semibold min-w-[220px] flex-1">
          <span className={muted}>القضية</span>
          <CasePicker value={caseId} onChange={(id) => setCaseId(id)} isDark={isDark} />
        </div>
        {caseId && (
          <button type="button" onClick={() => setCaseId("")} className={`text-[11px] underline ${muted}`}>كل القضايا</button>
        )}
        <label className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[#0B3D2E]" />
          إظهار المؤرشف
        </label>
        <button type="button" onClick={() => setAdding(true)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#092e22] dark:bg-[#C8A762] dark:text-[#0B3D2E]">
          <Plus size={13} weight="bold" aria-hidden="true" /> إضافة قيد صادر / وارد
        </button>
      </div>

      {rowError && <p role="alert" className="text-[12px] font-semibold text-red-600 dark:text-red-400">{rowError}</p>}

      {state === "loading" ? (
        <p className={`text-[12px] ${muted}`} aria-live="polite">جارٍ تحميل السجل…</p>
      ) : state === "error" ? (
        <div role="alert" className={`flex items-center justify-between rounded-xl border px-3 py-3 text-[12px] ${isDark ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <span>تعذّر تحميل سجل الصادر والوارد.</span>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><ArrowClockwise size={12} aria-hidden="true" /> إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <div className={`${card} px-4 py-10 text-center`}>
          <Tray size={28} className={`mx-auto mb-2 ${muted}`} aria-hidden="true" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا قيود {direction || channel || caseId || archived ? "تطابق هذا التصفية" : "بعد"}</p>
          <p className={`mt-1 text-[12px] ${muted}`}>سجّل كل مستند أو مراسلة تصدر من مكتبك أو ترد إليه، وقناة تسليمها.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id} className={`${card} p-3.5 flex items-start gap-3 ${e.archived ? "opacity-60" : ""}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                e.direction === "out"
                  ? isDark ? "bg-sky-500/10 text-sky-300" : "bg-sky-50 text-sky-700"
                  : isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"
              }`}>
                {e.direction === "out" ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownLeft size={15} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                  <span className="sr-only">{LEDGER_DIRECTION_LABEL_AR[e.direction]}: </span>{e.title}
                </p>
                <p className={`mt-0.5 text-[11px] ${muted}`}>
                  {LEDGER_DIRECTION_LABEL_AR[e.direction]} · {LEDGER_CHANNEL_LABEL_AR[e.channel]} · {formatLedgerWhen(e.occurredAt)} · {e.createdByName}
                  {e.archived && " · مؤرشف"}
                </p>
                {e.notes && <p className={`mt-1 text-[12px] whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{e.notes}</p>}
                <Link href={`/dashboard/lawyer/cases/${encodeURIComponent(e.caseRequestId)}?tab=timeline`} className={`mt-1 inline-block text-[11px] underline ${muted}`}>
                  {e.caseTitle ?? "فتح القضية"}
                </Link>
              </div>
              {e.mine && (
                <div className="flex items-center gap-1">
                  {!e.archived && (
                    <button type="button" onClick={() => setEditing(e)} aria-label="تعديل القيد" title="تعديل" className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                      <PencilSimple size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={() => toggleArchive(e)} aria-label={e.archived ? "استعادة القيد" : "أرشفة القيد"} title={e.archived ? "استعادة" : "أرشفة"} className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                    {e.archived ? <ArrowCounterClockwise size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {cursor && state === "ready" && (
        <button type="button" onClick={more} disabled={loadingMore} className={`w-full rounded-xl border py-2 text-[12px] font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600"}`}>
          {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
        </button>
      )}

      <AnimatePresence>
        {(adding || editing) && (
          <LedgerEntryModal
            key={editing?.id ?? "new"}
            isDark={isDark}
            entry={editing}
            caseRequestId={caseId || undefined}
            onClose={() => { setAdding(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
