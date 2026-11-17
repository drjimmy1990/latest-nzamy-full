"use client";

/**
 * /register/provider/verify — finish the licence verification after sign-in
 * (owner decisions ٢٠–٢١). The signup sends the lawyer here when e-mail
 * confirmation left him without a session: the photo he picked in the form
 * could not survive that round trip, so the panel asks for it again.
 * The page itself is public; every call behind it needs a lawyer session
 * (/api/v1/lawyer/* — 401 at the edge), and the panel shows «تسجيل الدخول».
 */

import Link from "next/link";
import { Scales } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { LawyerVerificationPanel } from "@/components/lawyerSignup/LawyerVerificationPanel";

export default function LawyerVerifyPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-surface font-body dark:bg-dark-bg">
      <div className="mx-auto w-full max-w-[560px] px-5 py-10">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
            <Scales weight="bold" size={18} />
          </span>
          <span className="font-brand text-xl font-bold text-royal dark:text-gold">{isAr ? "نظامي" : "Nezamy"}</span>
        </Link>
        <LawyerVerificationPanel isAr={isAr} />
      </div>
    </div>
  );
}
