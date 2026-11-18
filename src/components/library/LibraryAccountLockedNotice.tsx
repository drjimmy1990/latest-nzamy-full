"use client";

import { BookOpen, ArrowRight, Lock } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { LIBRARY_ACCOUNT_LOCKED_AR } from "@/lib/library/accountAccess";

/**
 * Owner item 9 (batch l8): what an account whose library is locked for its
 * type sees in place of any library page — the owner's sentence, nothing else:
 * no price, no buy button, no library offer.
 */
export default function LibraryAccountLockedNotice({ message }: { message?: string | null }) {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center" dir="rtl" data-library-account-locked>
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-[#C8A762]/10">
        <BookOpen size={40} weight="duotone" className="text-[#C8A762]" />
        <span
          className={`absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full ring-4 ${
            isDark ? "bg-zinc-900 ring-[#0C0F12]" : "bg-white ring-white"
          }`}
        >
          <Lock size={16} weight="fill" className="text-[#C8A762]" />
        </span>
      </div>
      <h1 className={`mb-3 text-2xl font-bold ${tp}`}>المكتبة القانونية</h1>
      <p className={`text-sm leading-relaxed ${ts}`}>{message || LIBRARY_ACCOUNT_LOCKED_AR}</p>
      <Link
        href="/"
        className={`mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
          isDark ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
        }`}
      >
        <ArrowRight size={16} weight="bold" />
        العودة للرئيسية
      </Link>
    </div>
  );
}
