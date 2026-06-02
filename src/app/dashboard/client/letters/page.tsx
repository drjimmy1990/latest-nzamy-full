"use client";

import { useTheme } from "@/components/ThemeProvider";
import { ClientLetterWorkflow } from "@/app/dashboard/client/_components/ClientLetterWorkflow";
import { Envelope } from "@phosphor-icons/react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { CreditsBanner } from "@/components/PaywallGate";

export default function ClientLettersPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const isExhausted = user.credits <= 0;

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  return (
    <div className={`max-w-3xl mx-auto py-6 px-4 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/client/services"
          className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
            isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
          }`}>
          <ArrowRight size={13} />
          الخدمات
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Envelope size={18} weight="duotone" className="text-blue-500" />
          </div>
          <div>
            <h1 className={`text-base font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>
              صياغة خطاب رسمي
            </h1>
            <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              إنذار · مطالبة · اعتراض · شكوى — جاهز في دقيقة
            </p>
          </div>
          <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[9px] font-black text-blue-500 ms-2">AI</span>
        </div>
      </div>

      {/* Credits exhausted banner */}
      {isExhausted && <CreditsBanner isDark={isDark} />}

      {/* Notice */}
      <div className={`mb-5 px-4 py-3 rounded-2xl border text-[12px] leading-relaxed ${
        isDark ? "border-amber-700/30 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}>
        الخطاب يُعدّه الذكاء الاصطناعي — يُنصح بمراجعته من محامٍ قبل الإرسال الرسمي.
        <Link href="/dashboard/client/find-lawyer" className="font-bold underline ms-1.5">احجز مراجعة من محامٍ متخصص</Link>
      </div>

      {/* Client-specific Letter Workflow */}
      <ClientLetterWorkflow
        isDark={isDark}
        card={card}
        onBack={() => window.history.back()}
      />
    </div>
  );
}
