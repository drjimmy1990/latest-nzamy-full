"use client";

import Link from "next/link";
import { Handshake } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import PendingInvitationsBanner from "@/components/dashboard/PendingInvitationsBanner";

/**
 * «انضم إلى مكتب أو محامٍ» — the consultant's way to the lawyer's tools. The
 * tools themselves open through a delegation from the lawyer or the firm (a
 * later phase); today the way in is an invitation to a firm, accepted here,
 * and nothing on this page grants a tool by itself.
 */
export default function JoinOfficePage() {
  const { isDark } = useTheme();
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  return (
    <div className="mx-auto max-w-2xl space-y-5" dir="rtl">
      <header className="flex items-center gap-3">
        <Handshake size={30} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <h1 className={`text-xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>انضم إلى مكتب أو محامٍ سعودي</h1>
      </header>
      <p className={`text-sm leading-relaxed ${muted}`}>
        أدوات العمل (الصائغ القانوني، محترف العقود، الرأي القانوني، إدارة القضايا والعملاء) مقصورة على المحامي السعودي المرخّص.
        ويصلك منها ما يفوّضك به مكتب أو محامٍ تعمل معه.
      </p>
      <ol className={`list-decimal space-y-1 pr-5 text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
        <li>اطلب من المكتب أو المحامي أن يدعوك إلى فريقه ببريدك المسجَّل في نظامي.</li>
        <li>ستظهر الدعوة هنا وفي لوحتك؛ اقبلها لتصبح عضواً في المكتب.</li>
        <li>يحدّد المكتب ما يُتاح لك من أدوات.</li>
      </ol>
      <PendingInvitationsBanner />
      <Link href="/dashboard/lawyer" className={`inline-block text-xs font-bold underline ${muted}`}>العودة إلى اللوحة</Link>
    </div>
  );
}
