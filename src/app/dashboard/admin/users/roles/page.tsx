"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Key, ShieldWarning, Info } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// This screen used to render a roles/permissions matrix that the platform does not enforce.
// Nothing in the codebase reads a per-admin permission list: any account whose user_type is
// "admin" passes every server allow-list (src/lib/auth/assertRole.ts:46) and every dashboard
// guard (src/components/dashboard/UserTypeGuard.tsx:32). Until a real admin-tier model exists,
// the page states what is actually enforced instead of inventing tiers.
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
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>الأدوار والصلاحيات</h1><p className={`text-xs ${muted}`}>الصلاحيات الإدارية غير مُجزّأة في المنصة حالياً</p></div>
        </div>

        {/* The single honest fact about admin authority today */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 md:p-6 space-y-3 ${isDark ? "border-rose-500/25 bg-rose-500/[0.07]" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex items-center gap-2">
            <ShieldWarning size={20} weight="fill" className={isDark ? "text-rose-400" : "text-rose-600"} />
            <h2 className={`font-black text-sm ${isDark ? "text-rose-200" : "text-rose-900"}`}>كل حساب «مدير» يملك صلاحية كاملة</h2>
          </div>
          <p className={`text-sm leading-relaxed ${isDark ? "text-rose-100/80" : "text-rose-900/80"}`}>
            لا توجد في المنصة مستويات صلاحية إدارية متفاوتة. أي حساب نوعه «مدير» يصل إلى كل شيء دون استثناء:
            إعدادات المنصة، خطط الأسعار، الاشتراكات، منح الصلاحيات، الكوبونات، الإيرادات، وبيانات كل المستخدمين.
          </p>
          <p className={`text-sm leading-relaxed ${isDark ? "text-rose-100/80" : "text-rose-900/80"}`}>
            لا يمكن حالياً حصر مدير في قسم أو تبويب أو مجموعة إجراءات محددة، ولا يمكن منحه صلاحية أقل من الكاملة.
          </p>
        </motion.div>

        {/* What the labels shown elsewhere in the admin area actually mean */}
        <div className={`${card} p-5 md:p-6 space-y-3 shadow-sm`}>
          <div className="flex items-center gap-2">
            <Info size={18} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
            <h2 className={`font-black text-sm ${isDark ? "text-white" : "text-gray-900"}`}>ماذا تعني المسميات المعروضة في لوحة الإدارة؟</h2>
          </div>
          <p className={`text-sm leading-relaxed ${muted}`}>
            «الدور الوظيفي» و«القسم» اللذان يُدخَلان عند دعوة عضو فريق هما وصف تنظيمي للعرض فقط، ولا يُقيّدان
            ما يستطيع العضو فعله بعد قبول الدعوة.
          </p>
          <p className={`text-sm leading-relaxed ${muted}`}>
            أما أنواع الحسابات الأخرى — محامٍ، عميل، شركة، جهة حكومية — فتُحدَّد عند التسجيل وتُدار من صفحة
            المستخدمين، وهي أنواع حسابات لا أدواراً إدارية.
          </p>
          <Link href="/dashboard/admin/users" className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${isDark ? "bg-white/5 text-gray-200 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            الذهاب إلى كل المستخدمين
          </Link>
        </div>

        <p className={`text-xs text-center ${muted}`}>
          مصفوفة صلاحيات مُجزّأة للمديرين ستُضاف بعد اعتماد نموذج الأدوار، وحتى ذلك الحين تُمنح الدعوة صلاحية كاملة.
        </p>
      </div>
    </div>
  );
}
