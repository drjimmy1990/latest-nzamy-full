"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Coins, Spinner, UsersThree, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import { sumMemberPoints, type MemberPointsUsage } from "@/lib/services/firmMemberPoints";

/**
 * «استهلاك النقاط لكل عضو» — owner answer ٤٤٤ part 2.
 *
 * GET /api/v1/firm/members/points-usage (firm owner / active managing partner
 * only). Points consumed = AI debits net of their refunds, counted from the
 * day each member joined the office; active members only. Five honest states:
 * loading, failed, not available yet (the migration is not applied — never
 * shown as zeros), refused (403), and the table (or its empty state).
 *
 * Colours: zinc/slate only, no light-gray text (globals.css turns gray-50/100/200
 * into dark SURFACES, so such text would vanish in dark mode).
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "ready"; members: MemberPointsUsage[] };

const nf = new Intl.NumberFormat("ar-SA");

function roleLabel(role: string): string {
  return (FIRM_ROLE_LABEL as Record<string, string>)[role] ?? "عضو";
}

export default function MemberPointsUsageCard() {
  const { isDark } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/firm/members/points-usage", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      const body = (await res.json()) as { available?: boolean; members?: MemberPointsUsage[] };
      if (body.available === false) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({ kind: "ready", members: Array.isArray(body.members) ? body.members : [] });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const title = isDark ? "text-white" : "text-slate-800";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-300" : "text-slate-700";
  const rule = isDark ? "border-white/[0.06]" : "border-slate-100";

  return (
    <section className={`${card} p-5 sm:p-6`} dir="rtl" aria-labelledby="member-points-title">
      <div className="flex items-start gap-3 mb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C8A762]/15 text-[#C8A762]">
          <Coins size={20} weight="duotone" />
        </span>
        <div className="min-w-0">
          <h2 id="member-points-title" className={`text-lg font-black ${title}`}>استهلاك النقاط لكل عضو</h2>
          <p className={`mt-1 text-xs ${muted}`}>
            النقاط التي استهلكها كل عضو نشط في المكتب من رصيده (بعد خصم ما أُعيد من نقاط)، منذ انضمامه إلى المكتب.
          </p>
        </div>
      </div>

      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-10">
          <Spinner size={18} className="text-royal animate-spin" />
          <span className={`text-xs ${muted}`}>جارٍ تحميل استهلاك النقاط...</span>
        </div>
      ) : state.kind === "error" ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Warning size={26} weight="duotone" className="text-red-500" />
          <p className={`text-sm font-bold ${strong}`}>تعذّرت قراءة استهلاك النقاط</p>
          <p className={`text-xs ${muted}`}>هذه ليست أرقاماً صفرية — قد يكون هناك استهلاك لم يُقرأ.</p>
          <button type="button" onClick={() => { setState({ kind: "loading" }); void load(); }}
            className="mt-1 flex items-center gap-1.5 text-xs font-bold text-royal hover:underline">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : state.kind === "forbidden" ? (
        <p className={`py-8 text-center text-sm ${muted}`}>هذا العدّاد يظهر للشريك المدير وحساب المكتب فقط.</p>
      ) : state.kind === "unavailable" ? (
        <p className={`py-8 text-center text-sm ${muted}`}>هذا العدّاد غير متاح بعد — سيظهر بعد تحديث قاعدة البيانات.</p>
      ) : state.members.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <UsersThree size={26} className={muted} />
          <p className={`text-sm font-bold ${strong}`}>لا يوجد أعضاء نشطون في المكتب بعد</p>
          <p className={`text-xs ${muted}`}>يظهر هنا كل عضو يقبل دعوة المكتب من صفحة الفريق.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-right text-xs font-semibold ${muted}`}>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>العضو</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule} hidden sm:table-cell`}>الدور</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>هذا الشهر</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((m, i) => (
                <tr key={`${m.displayName}-${i}`} className={`border-b ${rule} last:border-b-0`}>
                  <td className={`px-3 py-3 font-bold ${title}`}>
                    {m.displayName}
                    {m.isOwner && <span className={`ms-2 text-[11px] font-semibold ${muted}`}>(حساب المكتب)</span>}
                  </td>
                  <td className={`px-3 py-3 hidden sm:table-cell ${muted}`}>{roleLabel(m.role)}</td>
                  <td className={`px-3 py-3 font-mono font-bold ${strong}`}>{nf.format(m.pointsMonth)}</td>
                  <td className={`px-3 py-3 font-mono font-bold ${strong}`}>{nf.format(m.pointsTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(() => {
                const sum = sumMemberPoints(state.members);
                return (
                  <tr className={`text-xs font-bold ${muted}`}>
                    <td className="px-3 pt-3">مجموع المكتب</td>
                    <td className="px-3 pt-3 hidden sm:table-cell" />
                    <td className="px-3 pt-3 font-mono">{nf.format(sum.month)}</td>
                    <td className="px-3 pt-3 font-mono">{nf.format(sum.total)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
          <p className={`mt-3 text-[11px] ${muted}`}>
            «هذا الشهر» بالتقويم الميلادي وتوقيت الرياض. لا تظهر هنا تفاصيل ما استخدمه العضو — فقط مجموع النقاط.
          </p>
        </div>
      )}
    </section>
  );
}
