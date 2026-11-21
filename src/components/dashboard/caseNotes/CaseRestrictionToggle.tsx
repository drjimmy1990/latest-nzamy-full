"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, LockSimple, LockSimpleOpen, Spinner } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import CaseOpenLog from "./CaseOpenLog";

/**
 * «قضية مقيّدة» — N01-19 (migration 20261125_40_restricted_cases.sql).
 *
 * GET/POST /api/v1/cases/[id]/restriction. Renders nothing on a case that is
 * not a firm case (there is no one to hide it from) or while the feature is
 * not installed (503). Whoever may change it (firm owner, managing partner, the
 * case's lawyer) gets the switch; everyone else who can read the case sees the
 * state in one line.
 *
 * Colours: zinc/slate only for text (globals.css turns gray-50/100/200 into
 * dark SURFACES).
 */

type State =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "ready"; restricted: boolean; canChange: boolean };

export default function CaseRestrictionToggle({ caseId, card }: { caseId: string; card: string }) {
  const { isDark } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/restriction`, { cache: "no-store" });
      if (res.status === 503 || res.status === 404) { setState({ kind: "hidden" }); return; }
      if (!res.ok) { setState({ kind: "error" }); return; }
      const body = (await res.json()) as { data?: { firmCase?: boolean; restricted?: boolean; canChange?: boolean } };
      if (!body.data?.firmCase) { setState({ kind: "hidden" }); return; }
      setState({ kind: "ready", restricted: body.data.restricted === true, canChange: body.data.canChange === true });
    } catch {
      setState({ kind: "error" });
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  if (state.kind === "hidden") return null;

  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";

  async function toggle(next: boolean) {
    const msg = next
      ? "تقييد القضية: لن يراها من أعضاء المكتب إلا المحامي المسؤول ومنشئ القضية وفريق القضية وصاحب المكتب والشريك المدير. تختفي جلساتها ومهامها وملاحظاتها عن بقية الأعضاء — ومنهم من أُسندت إليه جلسة أو مهمة فيها وليس في فريقها، فأضفه إلى فريق القضية أولاً. متابعة؟"
      : "فتح القضية: سيراها كل أعضاء المكتب النشطين مع جلساتها ومهامها وملاحظات المكتب. متابعة؟";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/restriction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restricted: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { restricted?: boolean }; error?: string };
      if (!res.ok) {
        setError(body.error || "تعذّر حفظ حالة التقييد.");
        return;
      }
      setState({ kind: "ready", restricted: body.data?.restricted === true, canChange: true });
    } catch {
      setError("تعذّر حفظ حالة التقييد — تحقّق من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        {state.kind === "ready" && state.restricted
          ? <LockSimple size={15} weight="duotone" className="text-amber-500" />
          : <LockSimpleOpen size={15} weight="duotone" className="text-royal" />}
        <p className={`text-[12px] font-bold ${strong}`}>قضية مقيّدة</p>
      </div>
      {state.kind === "loading" ? (
        <div className={`flex items-center gap-2 text-[11px] ${muted}`}>
          <Spinner size={13} className="animate-spin" /> جارٍ التحميل…
        </div>
      ) : state.kind === "error" ? (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-red-500 font-semibold">تعذّرت قراءة حالة التقييد.</span>
          <button onClick={() => { setState({ kind: "loading" }); void load(); }} className="flex items-center gap-1 font-bold text-royal hover:underline">
            <ArrowClockwise size={12} /> إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <p className={`text-[10px] leading-relaxed mb-3 ${muted}`}>
            {state.restricted
              ? "هذه القضية مقيّدة: لا يراها من أعضاء المكتب إلا المحامي المسؤول ومنشئ القضية وفريق القضية وصاحب المكتب والشريك المدير. وكل فتح لها من صاحب المكتب أو الشريك المدير يُسجَّل بتاريخه ويراه المحامي المسؤول."
              : "هذه القضية مفتوحة لكل أعضاء المكتب النشطين. التقييد يحصرها في المحامي المسؤول وفريق القضية وصاحب المكتب والشريك المدير."}
          </p>
          {state.canChange && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle(!state.restricted)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all disabled:opacity-50 ${
                state.restricted
                  ? isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  : isDark ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {busy ? <Spinner size={12} className="animate-spin" /> : state.restricted ? <LockSimpleOpen size={12} /> : <LockSimple size={12} />}
              {state.restricted ? "فتح القضية لكل المكتب" : "تقييد القضية"}
            </button>
          )}
          {error && <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>}
          {state.restricted && <CaseOpenLog caseId={caseId} isDark={isDark} />}
        </>
      )}
    </div>
  );
}
