"use client";

import { useTheme } from "@/components/ThemeProvider";
import { ClientLetterWorkflow } from "@/app/dashboard/client/_components/ClientLetterWorkflow";
import { Envelope, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import AdvisoryTemplateNotice from "@/components/ai/AdvisoryTemplateNotice";

/**
 * /dashboard/client/letters — «صياغة خطاب رسمي».
 *
 * Three claims were removed from this page, all of the same kind: they told the
 * client something was happening that was not.
 *
 * THIS PAGE ONLY. src/app/ai/letter-drafter/page.tsx hosts the SAME
 * ClientLetterWorkflow behind its own chrome and still carries every claim
 * listed below — the «AI · فوري» badge, «الخطاب يُعدّه الذكاء الاصطناعي», «جاهز
 * في دقيقة», the find-lawyer link and the credits banner. It was outside this
 * pass's file list; the tool is honest here and not yet there.
 *
 *  - The «AI» badge and «الخطاب يُعدّه الذكاء الاصطناعي». No model is called
 *    anywhere in ClientLetterWorkflow. The letter is assembled from a template
 *    by a synchronous pure function (src/lib/services/letterExport.ts).
 *
 *  - The «احجز مراجعة من محامٍ متخصص» link into /dashboard/client/find-lawyer.
 *    Replaced by AdvisoryTemplateNotice, which is the component the owner's
 *    ruling س٣ / item ١٨ already produced for exactly this class of tool
 *    («نماذج وقوالب استرشادية فورية» + «طلب التدقيق والاعتماد من محامي
 *    المكتب»). Rendering it here rather than writing a fourth bespoke banner is
 *    the point of it existing. Its handoff is `legal-notice` («إنذار قانوني
 *    رسمي») — the catalogue's human counterpart to this tool; `contract-review`
 *    is a contract service and would land the client on the wrong form.
 *    The notice's button is the pre-composition escape hatch; once a letter
 *    exists, the workflow's own «طلب التدقيق والاعتماد» sends THAT letter as a
 *    service request instead of navigating to a blank form that would discard
 *    it.
 *
 *  - The credits-exhausted banner. This route spends no credits: there is no
 *    deduction, no entitlement check and no API call in the whole workflow, and
 *    the tool works identically at a zero balance. An "you are out of credits"
 *    upgrade prompt over a feature that never charged one implies a meter that
 *    does not exist. `useUser` went with it — it had no other reader here.
 */
export default function ClientLettersPage() {
  const { isDark } = useTheme();

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
              إنذار · مطالبة · اعتراض · شكوى — قوالب تُعبّئها وتعدّلها بنفسك
            </p>
          </div>
        </div>
      </div>

      {/* Owner ruling س٣ — what this tool is, said before the client uses it. */}
      <AdvisoryTemplateNotice handoffServiceId="legal-notice" className="mb-5" />

      {/* Client-specific Letter Workflow */}
      <ClientLetterWorkflow
        isDark={isDark}
        card={card}
        onBack={() => window.history.back()}
      />
    </div>
  );
}
