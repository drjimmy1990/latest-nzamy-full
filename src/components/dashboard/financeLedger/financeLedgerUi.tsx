"use client";

/**
 * Shared bits of the l6-ledger screens (time / expenses / trust / fee
 * statement): money text, the case + client pickers, the void-with-reason
 * box and the theme classes. Dark mode follows src/lib/ui/darkModeGuard:
 * no text-gray-100/200 (they are dark SURFACES in this app).
 */

import { useEffect, useState } from "react";
import { formatSar } from "@/lib/financeLedger/financeLedgerRules";
import { getCases } from "@/lib/services/casesService";
import { getLawyerClients } from "@/lib/services/lawyerClientsService";

export const sar = (h: number) => `${formatSar(h)} ر.س`;

export function themeCls(isDark: boolean) {
  return {
    card: isDark
      ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
      : "rounded-2xl border border-slate-200/70 bg-white shadow-sm",
    title: isDark ? "text-white" : "text-slate-800",
    text: isDark ? "text-zinc-300" : "text-slate-700",
    muted: isDark ? "text-zinc-500" : "text-slate-500",
    input: isDark
      ? "w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#C8A762]"
      : "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B3D2E]",
    label: `block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`,
    primary: "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#0B3D2E]/90 disabled:opacity-50",
    ghost: isDark
      ? "inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50"
      : "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50",
    row: isDark ? "border-b border-white/[0.05]" : "border-b border-slate-100",
    error: isDark ? "rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300" : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700",
    warn: isDark ? "rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300" : "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800",
    chip: (tone: "green" | "amber" | "red" | "gray") => {
      const map = {
        green: isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700",
        amber: isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-700",
        red: isDark ? "bg-red-500/15 text-red-300" : "bg-red-50 text-red-700",
        gray: isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500",
      };
      return `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${map[tone]}`;
    },
  };
}

export interface PickOption { id: string; label: string }

/** The caller's cases and client cards, for the add forms and the statement. Loaded once. */
export function useFinancePickers(enabled: boolean) {
  const [cases, setCases] = useState<PickOption[] | null>(null);
  const [clients, setClients] = useState<PickOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([getCases({ limit: 200 }), getLawyerClients()]).then(([c, k]) => {
      if (!alive) return;
      if (c.ok) setCases(c.items.map((x) => ({ id: String(x.id), label: x.title || "قضية بلا عنوان" })));
      else setCases([]);
      if (k.ok) setClients(k.items.map((x) => ({ id: String(x.id), label: x.name || "موكل" })));
      else setClients([]);
      if (!c.ok || !k.ok) setError("تعذّر تحميل قائمة القضايا أو الموكلين كاملة — أعد فتح الصفحة.");
    });
    return () => { alive = false; };
  }, [enabled]);
  return { cases, clients, error };
}

/** The void-with-reason box: the reason is required (3+ characters), never a confirm() click. */
export function VoidBox({
  isDark, busy, onCancel, onConfirm,
}: { isDark: boolean; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const t = themeCls(isDark);
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <div className={`mt-2 rounded-xl p-3 ${isDark ? "bg-red-500/[0.06]" : "bg-red-50/60"}`}>
      <label className={t.label}>سبب الإلغاء (يبقى القيد ظاهراً بعلامة «ملغى» ولا يُحذف)</label>
      <input className={t.input} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
        placeholder="مثال: قيد مكرر، مبلغ خاطئ" autoFocus />
      <div className="mt-2 flex gap-2">
        <button type="button" className={t.primary.replace("bg-[#0B3D2E]", "bg-red-600").replace("hover:bg-[#0B3D2E]/90", "hover:bg-red-700")}
          disabled={!ok || busy} onClick={() => onConfirm(reason.trim())}>
          {busy ? "جارٍ الإلغاء…" : "إلغاء القيد"}
        </button>
        <button type="button" className={t.ghost} onClick={onCancel} disabled={busy}>تراجع</button>
      </div>
    </div>
  );
}

/** Case / client selects. A fixed case (the case page) hides the case select. */
export function TargetFields({
  isDark, pickers, caseId, clientId, onCase, onClient, fixedCase, requireClient,
}: {
  isDark: boolean;
  pickers: { cases: PickOption[] | null; clients: PickOption[] | null };
  caseId: string;
  clientId: string;
  onCase: (v: string) => void;
  onClient: (v: string) => void;
  fixedCase?: boolean;
  requireClient?: boolean;
}) {
  const t = themeCls(isDark);
  return (
    <>
      {!fixedCase && (
        <div>
          <label className={t.label}>القضية{requireClient ? " (اختياري)" : ""}</label>
          <select className={t.input} value={caseId} onChange={(e) => onCase(e.target.value)}>
            <option value="">{pickers.cases === null ? "جارٍ التحميل…" : "— بدون قضية —"}</option>
            {(pickers.cases ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={t.label}>الموكل{requireClient ? "" : " (اختياري إن اخترت قضية)"}</label>
        <select className={t.input} value={clientId} onChange={(e) => onClient(e.target.value)}>
          <option value="">{pickers.clients === null ? "جارٍ التحميل…" : "— بدون موكل —"}</option>
          {(pickers.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
    </>
  );
}

export function riyadhTodayIso(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}
