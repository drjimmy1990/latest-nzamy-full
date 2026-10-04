"use client";

import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import { useTheme } from "@/components/ThemeProvider";
import AttachmentSqueezer from "./_components/AttachmentSqueezer";
import SmartAnalyzer from "./_components/SmartAnalyzer";
import { useUser } from "@/hooks/useUser";
import AdvisoryTemplateNotice from "@/components/ai/AdvisoryTemplateNotice";

/**
 * T28-14:
 *  - The page used to render its own <Navbar/> for everyone, inside the /ai
 *    layout that already wraps a signed-in account in its dashboard chrome —
 *    two headers stacked. src/app/ai/layout.tsx renders a GUEST unwrapped
 *    (this route is public), so the marketing Navbar stays for guests only.
 *  - «انتهى رصيدك من الكريديت» (CreditsBanner) showed for every account: it
 *    read `user.credits`, i.e. user_metadata.credit_balance, which nothing
 *    writes, so it was always 0. This tool has no credit metering, so there
 *    is no "out of credits" state to show — the banner is gone.
 *  - Lawyer vs client analyzer was chosen before the session had loaded, so
 *    a lawyer briefly got the client analyzer. A neutral skeleton holds the
 *    slot until `loading` is false.
 */
function AnalyzePageInner() {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  const user = useUser();
  const isGuest = !user.loading && !user.isLoggedIn;

  return (
    <div className={`min-h-[100dvh] ${isDark ? "bg-[#0d1117]" : "bg-slate-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      {isGuest && <Navbar />}
      <div className={`max-w-5xl mx-auto px-5 sm:px-8 ${isGuest ? "pt-28 pb-24" : "pt-4 pb-16"}`}>
        {/* Owner item ١٨ — one of the three tools he named. Above the analyzer,
            not under its verdict: the reader has to know this is a guidance
            template before they act on what it says. */}
        <AdvisoryTemplateNotice handoffServiceId="contract-review" className="mb-5" />
        {user.loading ? (
          <div aria-busy="true" aria-label="جارٍ التحميل" className="space-y-4 animate-pulse">
            <div className={`h-10 w-1/3 rounded-xl ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
            <div className={`h-64 rounded-2xl ${isDark ? "bg-white/[0.04]" : "bg-slate-200/70"}`} />
          </div>
        ) : user.userType === "lawyer" || user.userType === "firm" ? (
          <AttachmentSqueezer isDark={isDark} isRTL={isRTL} />
        ) : (
          <SmartAnalyzer isDark={isDark} isRTL={isRTL} />
        )}
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzePageInner />
    </Suspense>
  );
}
