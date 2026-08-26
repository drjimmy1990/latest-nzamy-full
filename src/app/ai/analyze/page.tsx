"use client";

import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import { useTheme } from "@/components/ThemeProvider";
import AttachmentSqueezer from "./_components/AttachmentSqueezer";
import SmartAnalyzer from "./_components/SmartAnalyzer";
import { useUser } from "@/hooks/useUser";
import { CreditsBanner } from "@/components/PaywallGate";
import AdvisoryTemplateNotice from "@/components/ai/AdvisoryTemplateNotice";

function AnalyzePageInner() {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  const user = useUser();
  const isExhausted = user.credits <= 0;

  return (
    <div className={`min-h-[100dvh] ${isDark ? "bg-[#0d1117]" : "bg-slate-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-28 pb-24">
        {isExhausted && <CreditsBanner isDark={isDark} />}
        {/* Owner item ١٨ — one of the three tools he named. Above the analyzer,
            not under its verdict: the reader has to know this is a guidance
            template before they act on what it says. */}
        <AdvisoryTemplateNotice handoffServiceId="contract-review" className="mb-5" />
        {user.userType === "lawyer" || user.userType === "firm" ? (
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
