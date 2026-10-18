"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Key, ShieldCheck, Info } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { STAFF_ROLES_IN_ORDER, STAFF_ROLE_LABELS_AR, STAFF_ROLE_SUMMARY_AR } from "@/lib/auth/staffManagement";

// The admin roles as the platform enforces them (owner answer ٢١٠, Task 3.4).
// Each admin holds one staff role in public.platform_staff (20261019_30), and
// src/lib/auth/staffRoles.ts says which admin-console action each role may
// take; the server checks it on every admin write (requireStaff). Roles are
// set on /dashboard/admin/team, which also says when roles are not live yet
// (before 20261019_30 runs every admin keeps full access). This page states
// the model only, so it cannot go stale once the migration is applied.
export default function AdminRolesPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const strong = isDark ? "text-white" : "text-gray-900";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-rose-500/10" : "bg-rose-50"}`}><Key size={22} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} /></div>
          <div><h1 className={`text-lg font-black ${strong}`}>الأدوار والصلاحيات</h1><p className={`text-xs ${muted}`}>لكل مدير دور واحد يحدد ما يستطيع تنفيذه من لوحة الإدارة</p></div>
        </div>

        {/* The three staff roles, as staffRoles.ts grants them */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 md:p-6 space-y-3 shadow-sm`}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
            <h2 className={`font-black text-sm ${strong}`}>أدوار فريق نظامي</h2>
          </div>
          <ul className="space-y-2">
            {STAFF_ROLES_IN_ORDER.map((role) => (
              <li key={role} className={`text-sm leading-relaxed ${muted}`}>
                <span className={`font-bold ${strong}`}>{STAFF_ROLE_LABELS_AR[role]}:</span> {STAFF_ROLE_SUMMARY_AR[role]}
              </li>
            ))}
          </ul>
          <p className={`text-xs leading-relaxed ${muted}`}>
            كل الأدوار حسابات «مدير» تطّلع على بيانات المنصة؛ الدور يحدد ما يستطيع العضو تغييره من لوحة الإدارة. المدير الذي لم يُعيَّن له
            دور يُعامَل «مراجعاً». حالة الأدوار الحالية لكل عضو في صفحة الفريق.
          </p>
          <Link href="/dashboard/admin/team" className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            تعيين الأدوار من صفحة الفريق
          </Link>
        </motion.div>

        {/* What the labels shown elsewhere in the admin area actually mean */}
        <div className={`${card} p-5 md:p-6 space-y-3 shadow-sm`}>
          <div className="flex items-center gap-2">
            <Info size={18} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
            <h2 className={`font-black text-sm ${strong}`}>ماذا تعني المسميات المعروضة في لوحة الإدارة؟</h2>
          </div>
          <p className={`text-sm leading-relaxed ${muted}`}>
            «الدور الوظيفي» و«القسم» اللذان يُدخَلان عند دعوة عضو فريق وصف تنظيمي للعرض فقط؛ ما يستطيع العضو فعله
            يحدده دوره في لوحة الإدارة.
          </p>
          <p className={`text-sm leading-relaxed ${muted}`}>
            أما أنواع الحسابات الأخرى — محامٍ، عميل، شركة، جهة حكومية — فتُحدَّد عند التسجيل وتُدار من صفحة
            المستخدمين، وهي أنواع حسابات لا أدواراً إدارية.
          </p>
          <Link href="/dashboard/admin/users" className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            الذهاب إلى كل المستخدمين
          </Link>
        </div>
      </div>
    </div>
  );
}
