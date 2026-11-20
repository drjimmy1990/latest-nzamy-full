"use client";

/**
 * «صلاحيات الأقسام والنطاقات» — N03-36 (batch l11).
 *
 * It was a matrix of invented scopes with toggles that saved nothing. Nothing
 * in the platform narrows a role by department (no rule reads
 * firm_members.department), so the honest screen is the real role matrix,
 * read-only, from src/lib/firm/firmRoleRules.ts — the same rules the
 * «الأدوار والصلاحيات» page explains one role at a time.
 */

import { motion } from "framer-motion";
import { Check, Info, ShieldCheck, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import { FIRM_ROLE_ORDER, FIRM_RULE_LABEL, firmRoleRules, type FirmRuleKey } from "@/lib/firm/firmRoleRules";

const COLUMNS: FirmRuleKey[] = ["cases", "assign", "hearings", "clientFees", "firmStatements", "memberPoints", "team", "invite", "letterhead"];

export default function FirmDepartmentPermissionsPage() {
  const { isDark } = useTheme();

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const title = isDark ? "text-white" : "text-slate-800";

  return (
    <SubscriptionGuard featureKey="firm-departments">
      <div className="max-w-7xl mx-auto space-y-5" dir="rtl">
        <div>
          <h1 className={`text-2xl font-black ${title}`}>صلاحيات الأقسام والنطاقات</h1>
          <p className={`mt-1 text-sm ${muted}`}>ما يستطيعه كل دور في المكتب الآن، كما تطبّقه المنصة فعلاً.</p>
        </div>

        <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          <Info size={18} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            الصلاحيات تتبع دور العضو في المكتب كله، ولا يضيّقها القسم الذي ينتمي إليه. هذه القواعد ثابتة ولا تُعدَّل من هنا؛
            صلاحيات خاصة بكل قسم قريباً.
          </span>
        </div>

        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-[980px] w-full text-sm">
            <thead className={isDark ? "bg-white/[0.03]" : "bg-slate-50"}>
              <tr>
                <th scope="col" className={`p-3 text-right font-black ${title}`}>الدور</th>
                {COLUMNS.map((key) => (
                  <th key={key} scope="col" className={`p-3 text-center text-[11px] font-black ${muted}`}>{FIRM_RULE_LABEL[key]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIRM_ROLE_ORDER.map((role, rowIndex) => {
                const rules = new Map(firmRoleRules(role).map((r) => [r.key, r]));
                return (
                  <motion.tr key={role} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: rowIndex * 0.03 }}
                    className={isDark ? "border-t border-white/[0.05]" : "border-t border-slate-100"}>
                    <th scope="row" className={`p-3 text-right font-black ${title}`}>
                      <span className="flex items-center gap-2">
                        <ShieldCheck size={15} className="text-[#C8A762]" />
                        {FIRM_ROLE_LABEL[role]}
                      </span>
                    </th>
                    {COLUMNS.map((key) => {
                      const rule = rules.get(key);
                      const allowed = rule?.allowed === true;
                      return (
                        <td key={key} className="p-2 text-center">
                          <span
                            className={`mx-auto flex h-8 min-w-8 items-center justify-center rounded-lg border px-1 ${
                              allowed
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                                : isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-500" : "border-slate-100 bg-slate-50 text-slate-400"
                            }`}
                            title={`${FIRM_ROLE_LABEL[role]} — ${FIRM_RULE_LABEL[key]}`}
                          >
                            {allowed
                              ? (rule?.note === "المسندة إليه فقط"
                                ? <span className="text-[10px] font-bold">المسندة فقط</span>
                                : <Check size={14} weight="bold" aria-label="مسموح" />)
                              : <X size={14} aria-label="غير مسموح" />}
                          </span>
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SubscriptionGuard>
  );
}
