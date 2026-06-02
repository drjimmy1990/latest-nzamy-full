"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Key, Lock, CheckCircle, Warning, User, Buildings, Scales, ShieldCheck } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const ROLES = [
  { key: "admin",       label: "مدير النظام",         icon: ShieldCheck, level: "full",       color: "text-rose-500",    bg: "bg-rose-500/10" },
  { key: "gov_counsel", label: "مستشار حكومي",        icon: Buildings,   level: "high",       color: "text-purple-500",  bg: "bg-purple-500/10" },
  { key: "arbitrator",  label: "محكّم",                icon: Scales,      level: "high",       color: "text-indigo-500",  bg: "bg-indigo-500/10" },
  { key: "lawyer",      label: "محامي",                icon: User,        level: "standard",   color: "text-blue-500",    bg: "bg-blue-500/10" },
  { key: "notary",      label: "موثّق",                icon: User,        level: "standard",   color: "text-teal-500",    bg: "bg-teal-500/10" },
  { key: "bailiff",     label: "معقّب حكومي",         icon: User,        level: "standard",   color: "text-amber-500",   bg: "bg-amber-500/10" },
];
const PERMS = [
  { label: "عرض بيانات المستخدمين",    admin: true,  gov: false, arb: false, lawyer: false },
  { label: "تعديل الاشتراكات",         admin: true,  gov: false, arb: false, lawyer: false },
  { label: "الوصول لأدوات AI الحكومية",admin: true,  gov: true,  arb: false, lawyer: false },
  { label: "قبول طلبات التحكيم",       admin: true,  gov: false, arb: true,  lawyer: false },
  { label: "قبول طلبات الخدمة",        admin: true,  gov: false, arb: true,  lawyer: true  },
  { label: "عرض لوحة التحكم الإدارية", admin: true,  gov: false, arb: false, lawyer: false },
];
export default function AdminRolesPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-rose-500/10" : "bg-rose-50"}`}><Key size={22} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>الأدوار والصلاحيات</h1><p className={`text-xs ${muted}`}>مصفوفة صلاحيات كل دور في المنصة</p></div>
        </div>
        {/* Roles grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ROLES.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div key={r.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className={`${card} p-4 shadow-sm`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${r.bg} mb-2`}><Icon size={17} weight="duotone" className={r.color} /></div>
                <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{r.label}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${r.level === "full" ? "bg-rose-500/10 text-rose-500" : r.level === "high" ? "bg-amber-500/10 text-amber-500" : "bg-gray-400/10 text-gray-400"}`}>
                  {r.level === "full" ? "وصول كامل" : r.level === "high" ? "صلاحيات عالية" : "قياسي"}
                </span>
              </motion.div>
            );
          })}
        </div>
        {/* Permissions matrix */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`px-5 py-3 border-b text-xs font-bold ${isDark ? "border-[#2d3748] bg-[#0c0f12] text-gray-500" : "border-gray-100 bg-gray-50 text-gray-400"}`}>
            مصفوفة الصلاحيات
          </div>
          <div className={`overflow-x-auto`}>
            <table className="w-full text-xs">
              <thead><tr className={isDark ? "bg-white/2" : "bg-gray-50"}>
                <th className={`px-5 py-3 text-start font-bold ${isDark ? "text-gray-400" : "text-gray-600"}`}>الصلاحية</th>
                <th className={`px-4 py-3 text-center font-bold ${isDark ? "text-rose-400" : "text-rose-600"}`}>مدير</th>
                <th className={`px-4 py-3 text-center font-bold ${isDark ? "text-purple-400" : "text-purple-600"}`}>مستشار</th>
                <th className={`px-4 py-3 text-center font-bold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>محكّم</th>
                <th className={`px-4 py-3 text-center font-bold ${isDark ? "text-blue-400" : "text-blue-600"}`}>محامي</th>
              </tr></thead>
              <tbody className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
                {PERMS.map((p, i) => (
                  <tr key={i} className={`transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                    <td className={`px-5 py-3 font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>{p.label}</td>
                    {[p.admin, p.gov, p.arb, p.lawyer].map((v, j) => (
                      <td key={j} className="px-4 py-3 text-center">
                        {v ? <CheckCircle size={14} weight="fill" className="text-emerald-500 mx-auto" /> : <Warning size={14} weight="fill" className={`mx-auto ${isDark ? "text-gray-700" : "text-gray-300"}`} />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
