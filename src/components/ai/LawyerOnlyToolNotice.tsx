"use client";

import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Owner ٤١٧, answer of 8 Nov 2026: what an account other than a lawyer, a law
 * firm or an admin sees on a lawyer tool's page (src/lib/ai/lawyerOnlyTools.ts)
 * instead of the tool. The edge (src/proxy.ts) normally redirects first; this is
 * the page's own answer when it is reached anyway (a fail-open edge read, a
 * client-side navigation). The run route refuses the tool with 403 either way.
 *
 * It offers what the owner left open to every account: the general guidance
 * tools, and for an individual or a company the consultation request form.
 */
export default function LawyerOnlyToolNotice({ userType }: { userType: string | null | undefined }) {
  const { isDark } = useTheme();
  const canOrderConsultation = userType === "individual" || userType === "corporate";
  const link = `inline-flex items-center rounded-xl px-4 py-2 text-[12px] font-bold`;
  return (
    <div dir="rtl" className="p-5 md:p-7 max-w-2xl mx-auto">
      <div className={`rounded-2xl border p-6 space-y-3 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70"}`}>
        <p role="status" className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
          هذه الأداة للمحامين ومكاتب المحاماة المرخّصة
        </p>
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          أدوات الصياغة والعقود وتحليل القضايا في نظامي مخصّصة للمحامين ومكاتب المحاماة. يمكنك الحصول على توجيه عام من الأدوات المتاحة لحسابك
          {canOrderConsultation ? "، أو طلب استشارة من محامٍ." : "."}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {canOrderConsultation && (
            <Link href="/dashboard/client/consultation/new" className={`${link} bg-[#0B3D2E] text-white`}>
              اطلب استشارة
            </Link>
          )}
          <Link href="/ai/quick-answer" className={`${link} border ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-200 text-zinc-700"}`}>
            سؤال قانوني سريع
          </Link>
          <Link href="/ai/legal-opinion" className={`${link} border ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-200 text-zinc-700"}`}>
            الرأي القانوني
          </Link>
        </div>
      </div>
    </div>
  );
}
