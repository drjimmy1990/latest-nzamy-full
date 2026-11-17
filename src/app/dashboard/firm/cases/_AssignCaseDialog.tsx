"use client";

/**
 * «إسناد القضية» (owner N03-40) — one dialog for the firm case list and the
 * firm case page. It reads the case's current lawyer and the firm's active
 * legal members from GET /api/v1/firm/cases/[id]/assign and writes with POST;
 * the server re-checks the caller's role, the case's firm and the member.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserSwitch, Warning, X } from "@phosphor-icons/react";
import {
  assignFirmCase, firmAssigneeLabelAr, getFirmCaseAssignment,
  type FirmCaseAssignee, type FirmCaseAssignment,
} from "@/lib/services/firmCaseAssignService";

export default function AssignCaseDialog({ caseId, caseTitle, isDark, onClose, onAssigned }: {
  caseId: string;
  caseTitle: string;
  isDark: boolean;
  onClose: () => void;
  onAssigned?: (assignee: FirmCaseAssignee) => void;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [data, setData] = useState<FirmCaseAssignment | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getFirmCaseAssignment(caseId)
      .then(d => {
        if (!live) return;
        setData(d);
        setSelected(d.assignee?.userId ?? "");
        setState("ready");
      })
      .catch(e => {
        if (!live) return;
        setError(e instanceof Error && e.message ? e.message : "تعذّرت قراءة إسناد القضية.");
        setState("error");
      });
    return () => { live = false; };
  }, [caseId]);

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const assignee = await assignFirmCase(caseId, selected);
      onAssigned?.(assignee);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّر إسناد القضية.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => { if (!saving) onClose(); }}
      role="dialog" aria-modal="true" aria-labelledby="assign-case-title" dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-100"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0">
              <UserSwitch size={18} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 id="assign-case-title" className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>إسناد القضية</h2>
              <p className={`text-[11px] truncate ${muted}`}>{caseTitle}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="إغلاق"
            className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
            <X size={15} />
          </button>
        </div>

        {state === "loading" && <p role="status" className={`text-[12px] ${muted}`}>جارٍ التحميل…</p>}

        {state === "ready" && data && (
          <>
            <p className={`text-[12px] ${muted}`}>
              المحامي المسؤول الآن: <span className={`font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{firmAssigneeLabelAr(data.assignee)}</span>
            </p>
            {!data.assignable ? (
              <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-start gap-1"><Warning size={13} className="mt-0.5 flex-shrink-0" /> {data.reason}</p>
            ) : !data.canAssign ? (
              <p className={`text-[12px] ${muted}`}>إسناد القضايا للشريك المدير والشركاء والمحامين الأوائل.</p>
            ) : data.options.length === 0 ? (
              <p className={`text-[12px] ${muted}`}>لا يوجد في المكتب أعضاء نشطون يمكن الإسناد إليهم بعد.</p>
            ) : (
              <div>
                <label htmlFor="assign-case-select" className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>أسنِد إلى</label>
                <select id="assign-case-select" value={selected} onChange={e => setSelected(e.target.value)} disabled={saving} className={inputCls}>
                  <option value="" disabled>— اختر محامياً —</option>
                  {data.options.map(o => <option key={o.userId} value={o.userId}>{firmAssigneeLabelAr(o)}</option>)}
                </select>
                <p className={`mt-1 text-[11px] ${muted}`}>يصله إشعار، وتظهر القضية في قائمة قضاياه.</p>
              </div>
            )}
          </>
        )}

        {error && <p className="text-[12px] text-red-500 flex items-center gap-1"><Warning size={12} /> {error}</p>}

        {state === "ready" && data?.assignable && data.canAssign && data.options.length > 0 && (
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || !selected || selected === (data.assignee?.userId ?? "")}
              className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "جارٍ الإسناد…" : "إسناد"}
            </button>
            <button onClick={onClose} disabled={saving}
              className={`px-4 py-2.5 rounded-xl font-bold text-[13px] cursor-pointer ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
              إلغاء
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * The case page's «المحامي المسؤول» strip: the current lawyer and, for the
 * roles that may assign, the «إسناد» button. Unreadable → a plain notice, not
 * an invented name.
 */
export function CaseAssigneePanel({ caseId, caseTitle, isDark, card, canAssign }: {
  caseId: string;
  caseTitle: string;
  isDark: boolean;
  card: string;
  canAssign: boolean;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [data, setData] = useState<FirmCaseAssignment | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setState("loading");
    getFirmCaseAssignment(caseId)
      .then(d => { if (live) { setData(d); setState("ready"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [caseId, reload]);

  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  return (
    <div className={`${card} p-4 mb-4 flex items-center justify-between gap-3 flex-wrap`}>
      <div className="flex items-center gap-2 min-w-0">
        <UserSwitch size={15} className="text-royal flex-shrink-0" />
        <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>المحامي المسؤول:</span>
        <span className={`text-[12px] truncate ${state === "ready" ? (isDark ? "text-zinc-300" : "text-slate-600") : muted}`}>
          {state === "loading" ? "جارٍ التحميل…" : state === "error" ? "تعذّرت القراءة" : firmAssigneeLabelAr(data?.assignee)}
        </span>
      </div>
      {state === "ready" && canAssign && data?.canAssign && (
        data.assignable ? (
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] cursor-pointer">
            <UserSwitch size={12} />{data.assignee ? "تغيير المحامي" : "إسناد"}
          </button>
        ) : (
          <span className={`text-[11px] ${muted}`}>{data.reason}</span>
        )
      )}
      {open && (
        <AssignCaseDialog caseId={caseId} caseTitle={caseTitle} isDark={isDark}
          onClose={() => setOpen(false)} onAssigned={() => setReload(k => k + 1)} />
      )}
    </div>
  );
}
