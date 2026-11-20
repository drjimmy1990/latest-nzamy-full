"use client";

/**
 * «الأدوار والصلاحيات» — N03-35 (batch l11).
 *
 * It was an editable matrix of invented permissions whose «حفظ» saved nothing
 * and restricted nothing (a display-only mock). It now shows, read-only, what each firm
 * role can do TODAY, read from the rules the platform enforces
 * (src/lib/firm/firmRoleRules.ts): the dashboard sections the role opens and
 * the fixed rules on cases, fees, the team and the letterhead. There is no
 * per-firm permission table, so nothing here can be edited, and no button
 * pretends otherwise. The previous mock is preserved in git history.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Info, ShieldCheck, SquaresFour, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import { FIRM_ROLE_ORDER, firmRoleRules, firmRoleSections, type FirmRoleId } from "@/lib/firm/firmRoleRules";

export default function RolesPage() {
  const { isDark } = useTheme();
  const [selected, setSelected] = useState<FirmRoleId>(FIRM_ROLE_ORDER[0]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const title = isDark ? "text-white" : "text-slate-800";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-300" : "text-slate-700";

  const rules = firmRoleRules(selected);
  const sections = firmRoleSections(selected);

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 ${title}`} style={{ fontFamily: "var(--font-brand)" }}>
          الأدوار والصلاحيات
        </h1>
        <p className={`text-[13px] ${muted}`}>ما يستطيعه كل دور في مكتبك الآن، كما تطبّقه المنصة فعلاً.</p>
      </motion.div>

      <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-[12px] ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <Info size={16} weight="fill" className="mt-0.5 shrink-0" />
        <span>
          هذه القواعد ثابتة في المنصة لكل المكاتب، ولا تُعدَّل من هنا. يُغيَّر ما يستطيعه العضو بتغيير دوره من صفحة «فريق المكتب».
          حساب المكتب نفسه يملك كل الصلاحيات، كالشريك المدير.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-1 space-y-2">
          {FIRM_ROLE_ORDER.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setSelected(role)}
              aria-pressed={selected === role}
              className={`w-full ${card} p-3 text-right transition-all ${selected === role ? "ring-2 ring-royal/40" : ""}`}
            >
              <span className="flex items-center gap-3">
                <ShieldCheck size={18} weight="duotone" className="text-[#C8A762] shrink-0" />
                <span className={`text-[13px] font-bold ${strong}`}>{FIRM_ROLE_LABEL[role]}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-5">
          <section className={`${card} p-5`} aria-labelledby="role-rules-title">
            <h2 id="role-rules-title" className={`text-sm font-bold mb-4 ${title}`}>
              قواعد ثابتة: {FIRM_ROLE_LABEL[selected]}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rules.map((rule) => (
                <li
                  key={rule.key}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border ${
                    rule.allowed
                      ? isDark ? "bg-emerald-500/5 border-emerald-500/10" : "bg-emerald-50/50 border-emerald-100"
                      : isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-slate-50/50 border-slate-100"
                  }`}
                >
                  <span className={`text-[12px] ${rule.allowed ? strong : muted}`}>
                    {rule.label}
                    {rule.note && <span className={`block text-[11px] ${muted}`}>{rule.note}</span>}
                  </span>
                  {rule.allowed
                    ? <Check size={14} weight="bold" className="text-emerald-500 shrink-0" aria-label="مسموح" />
                    : <X size={14} className={`${isDark ? "text-zinc-600" : "text-slate-400"} shrink-0`} aria-label="غير مسموح" />}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${card} p-5`} aria-labelledby="role-sections-title">
            <h2 id="role-sections-title" className={`flex items-center gap-2 text-sm font-bold mb-1 ${title}`}>
              <SquaresFour size={16} weight="duotone" className="text-[#C8A762]" />
              الأقسام التي يفتحها في لوحة المكتب
            </h2>
            <p className={`text-[11px] mb-3 ${muted}`}>غير ما يلي من صفحات المكتب لا يفتح لهذا الدور.</p>
            {sections.length === 0 ? (
              <p className={`text-[12px] ${muted}`}>لا يفتح أي قسم.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <li key={s.path} className={`rounded-full border px-3 py-1 text-[12px] ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600"}`}>
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
