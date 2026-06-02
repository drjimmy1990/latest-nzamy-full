"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Key, Lock, LockOpen, ShieldCheck, WarningCircle, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

const ROLES = ["شريك مدير", "شريك", "مدير قسم", "محام", "سكرتير قانوني", "مالية", "امتثال"];
const SCOPES = [
  "الشركة كلها",
  "القسم فقط",
  "القضايا المعينة",
  "المالية",
  "النقاط",
  "الفريق",
  "الإعدادات",
  "التقارير",
  "Chinese Walls",
];

const INITIAL = ROLES.reduce<Record<string, Record<string, boolean>>>((acc, role) => {
  acc[role] = {};
  SCOPES.forEach((scope) => {
    acc[role][scope] = role === "شريك مدير"
      || (role === "شريك" && !["الإعدادات", "Chinese Walls"].includes(scope))
      || (role === "مدير قسم" && ["القسم فقط", "القضايا المعينة", "النقاط", "الفريق", "التقارير"].includes(scope))
      || (role === "مالية" && ["المالية", "النقاط", "التقارير"].includes(scope))
      || (role === "امتثال" && ["القسم فقط", "القضايا المعينة", "التقارير", "Chinese Walls"].includes(scope))
      || (role === "محام" && ["القضايا المعينة"].includes(scope))
      || (role === "سكرتير قانوني" && ["القضايا المعينة", "الفريق"].includes(scope))
      || (role === "امتثال" && ["التقارير"].includes(scope));
  });
  return acc;
}, {});

export default function FirmDepartmentPermissionsPage() {
  const { isDark } = useTheme();
  const [matrix, setMatrix] = useState(INITIAL);
  const [toast, setToast] = useState("إعدادات صلاحيات الأقسام Backend-ready: التغييرات محلية فقط حتى ربط Auth/RBAC API وسجل تدقيق.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const toggle = (role: string, scope: string) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [scope]: !prev[role][scope] },
    }));
    setToast(`تم تعديل صلاحية ${role} على نطاق ${scope} محليا فقط. الحفظ الإنتاجي ينتظر RBAC policy API.`);
  };

  return (
    <SubscriptionGuard featureKey="firm-departments">
      <div className="max-w-7xl mx-auto space-y-5" dir="rtl">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-300">
            <Key size={13} weight="duotone" />
            Backend-ready
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>صلاحيات الأقسام والنطاقات</h1>
          <p className={`mt-1 text-sm ${muted}`}>مصفوفة واضحة تفصل صلاحيات الشركة كلها عن القسم والقضايا والنقاط والمالية والتقارير.</p>
        </div>

        <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
          <span>{toast}</span>
        </div>

        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-[980px] w-full text-sm">
            <thead className={isDark ? "bg-white/[0.03]" : "bg-slate-50"}>
              <tr>
                <th className={`p-3 text-right font-black ${isDark ? "text-white" : "text-slate-800"}`}>الدور</th>
                {SCOPES.map((scope) => (
                  <th key={scope} className={`p-3 text-center text-[11px] font-black ${muted}`}>{scope}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role, rowIndex) => (
                <motion.tr key={role} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: rowIndex * 0.03 }} className={isDark ? "border-t border-white/[0.05]" : "border-t border-slate-100"}>
                  <td className={`p-3 font-black ${isDark ? "text-white" : "text-slate-800"}`}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={15} className="text-[#C8A762]" />
                      {role}
                    </div>
                  </td>
                  {SCOPES.map((scope) => {
                    const enabled = matrix[role][scope];
                    return (
                      <td key={scope} className="p-2 text-center">
                        <button
                          onClick={() => toggle(role, scope)}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                            enabled
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                              : isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-600" : "border-slate-100 bg-slate-50 text-slate-300"
                          }`}
                          title={`${role} - ${scope}`}
                        >
                          {enabled ? <Check size={14} weight="bold" /> : <X size={14} />}
                        </button>
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: LockOpen, title: "نطاق الشركة", text: "للشريك المدير فقط في الإنتاج، مع موافقات وسجل تدقيق." },
            { icon: Lock, title: "نطاق القسم", text: "مدير القسم يرى فريقه وصرف قسمه فقط، لا محفظة الشركة كلها." },
            { icon: ShieldCheck, title: "Chinese Walls", text: "تحتاج policy engine خادمي قبل اعتبارها حماية إنتاجية." },
          ].map((item) => (
            <div key={item.title} className={`${card} p-4`}>
              <item.icon size={20} className="text-[#C8A762]" weight="duotone" />
              <p className={`mt-3 text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{item.title}</p>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </SubscriptionGuard>
  );
}
