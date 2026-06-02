"use client";

import { useTheme } from "@/components/ThemeProvider";
import { ClientLetterWorkflow } from "@/app/dashboard/client/_components/ClientLetterWorkflow";
import { Envelope, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { CreditsBanner } from "@/components/PaywallGate";

export default function LetterDrafterPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const user = useUser();
  const isExhausted = user.credits <= 0;

  const card = isDark
    ? "bg-zinc-900/50 border border-white/10 rounded-[2rem] backdrop-blur-xl"
    : "bg-white border border-zinc-200 rounded-[2rem] shadow-lg";

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0d1117] text-zinc-100" : "bg-slate-50 text-zinc-900"}`} dir="rtl">
      {/* ── Topbar breadcrumb ── */}
      <div className={`sticky top-0 z-40 border-b px-6 py-4 flex items-center gap-3 text-[13px] backdrop-blur-xl font-bold ${isDark ? "bg-[#0d1117]/80 border-white/10 text-zinc-400" : "bg-white/80 border-slate-200 text-slate-500"}`}>
        <Link href="/dashboard/client" className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-zinc-900"}`}>لوحة التحكم</Link>
        <ArrowRight size={14} weight="bold" />
        <span className={isDark ? "text-white" : "text-zinc-900"}>صائغ الخطابات</span>
      </div>

      <div className="max-w-4xl mx-auto py-10 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-[1.5rem] bg-blue-500/10 flex items-center justify-center border border-blue-500/20 relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
            <Envelope size={32} weight="duotone" className="text-blue-500 relative z-10" />
          </div>
          <div>
            <h1 className={`text-3xl font-black leading-none mb-2 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
              صائغ الخطابات
            </h1>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              إنذار · مطالبة · اعتراض · شكوى — جاهز في دقيقة
            </p>
          </div>
          <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-[11px] font-black text-blue-500 ms-auto shadow-[0_0_15px_rgba(59,130,246,0.15)]">AI · فوري</span>
        </div>

        {/* Credits exhausted banner */}
        {isExhausted && <CreditsBanner isDark={isDark} />}

        {/* Notice */}
        <div className={`mb-8 px-6 py-4 rounded-[1.5rem] border text-[13px] leading-relaxed font-medium flex items-start gap-3 ${
          isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-500/90" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <div>
            الخطاب يُعدّه الذكاء الاصطناعي — يُنصح بمراجعته من محامٍ متخصص قبل الإرسال الرسمي.
            <Link href="/dashboard/client/find-lawyer" className={`font-bold underline ms-2 transition-colors ${isDark ? "hover:text-amber-400" : "hover:text-amber-600"}`}>احجز مراجعة من محامٍ متخصص</Link>
          </div>
        </div>

        {/* Client-specific Letter Workflow */}
        <ClientLetterWorkflow
          isDark={isDark}
          card={card}
          onBack={() => window.history.back()}
        />
      </div>
    </div>
  );
}
