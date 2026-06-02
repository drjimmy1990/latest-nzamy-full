"use client";

import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import AttachmentSqueezer from "./_components/AttachmentSqueezer";
import SmartAnalyzer from "./_components/SmartAnalyzer";
import { useUser } from "@/hooks/useUser";
import { CreditsBanner } from "@/components/PaywallGate";

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
        {user.userType === "lawyer" || user.userType === "firm" ? (
          <AttachmentSqueezer isDark={isDark} isRTL={isRTL} />
        ) : (
          <SmartAnalyzer isDark={isDark} isRTL={isRTL} />
        )}
      </div>
      <FloatingButtons />
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
