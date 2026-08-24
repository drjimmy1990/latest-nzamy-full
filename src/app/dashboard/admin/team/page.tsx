"use client";

import Link from "next/link";
import { ShieldWarning, UsersFour } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

// This screen used to render a demo team (invented names, emails and "access levels") held in
// local state, plus an RBAC matrix that the platform does not enforce. Nothing reads a per-admin
// permission list: any account whose user_type is "admin" passes every server allow-list
// (src/lib/auth/assertRole.ts:46) and every dashboard guard
// (src/components/dashboard/UserTypeGuard.tsx:32). The real team members live in the admin
// dashboard's «فريق نظامي» tab, which reads /api/v1/admin/teams.
export default function AdminTeamPage() {
  const { isDark } = useTheme();

  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-3xl mx-auto pb-32" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-xl ${isDark ? "bg-indigo-900/20 text-indigo-400" : "bg-indigo-100 text-indigo-700"}`}>
            <UsersFour size={24} weight="duotone" />
          </div>
          <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>فريق نظامي والمشرفون</h1>
        </div>
        <p className={`text-sm ${muted}`}>إدارة أعضاء الفريق تتم من لوحة الإدارة، وهذه الصفحة تشرح ما تمنحه الدعوة فعلياً.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 md:p-6 space-y-3 ${isDark ? "border-rose-500/25 bg-rose-500/[0.07]" : "border-rose-200 bg-rose-50"}`}>
        <div className="flex items-center gap-2">
          <ShieldWarning size={20} weight="fill" className={isDark ? "text-rose-400" : "text-rose-600"} />
          <h2 className={`font-black text-sm ${isDark ? "text-rose-200" : "text-rose-900"}`}>عضو الفريق = مدير بصلاحية كاملة</h2>
        </div>
        <p className={`text-sm leading-relaxed ${isDark ? "text-rose-100/80" : "text-rose-900/80"}`}>
          لا توجد مستويات صلاحية إدارية متفاوتة في المنصة. كل من تتم دعوته إلى الفريق يُنشأ كحساب «مدير»
          يصل إلى كل شيء: إعدادات المنصة، خطط الأسعار، الاشتراكات، منح الصلاحيات، الكوبونات، الإيرادات،
          وبيانات كل المستخدمين.
        </p>
        <p className={`text-sm leading-relaxed ${isDark ? "text-rose-100/80" : "text-rose-900/80"}`}>
          المسمى الوظيفي والقسم اللذان يُدخَلان عند الدعوة وصف تنظيمي فقط، ولا يُقيّدان ما يستطيع العضو فعله.
          لذلك لا تُوجَّه الدعوة إلا لمن تثق به على المنصة بالكامل.
        </p>
      </motion.div>

      <div className={`${card} p-5 md:p-6 space-y-3`}>
        <h2 className={`font-black text-sm ${isDark ? "text-white" : "text-gray-900"}`}>أين تُدار قائمة الفريق؟</h2>
        <p className={`text-sm leading-relaxed ${muted}`}>
          الأعضاء الحقيقيون ودعوة عضو جديد وتعليق حساب — كلها في تبويب «فريق نظامي» داخل لوحة الإدارة.
        </p>
        <Link href="/dashboard/admin" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
          <UsersFour size={16} weight="bold" />
          فتح لوحة الإدارة
        </Link>
      </div>

      <p className={`text-xs text-center ${muted}`}>
        تقسيم الصلاحيات الإدارية (مدير عام مقابل صلاحيات محدودة) لم يُبنَ بعد وينتظر اعتماد نموذج الأدوار.
      </p>
    </div>
  );
}
