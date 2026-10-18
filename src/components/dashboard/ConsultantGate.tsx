"use client";

import Link from "next/link";
import { LockSimple, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { CONSULTANT_BLOCKED_MESSAGE } from "@/lib/auth/practiceKind";

/**
 * Art. 18 of نظام المحاماة (owner ١٧٣ / ٢١٩): an independent legal consultant
 * may not plead or manage hearings. Each page on CONSULTANT_BLOCKED_PREFIXES
 * (src/lib/auth/practiceKind.ts) wraps itself in this gate: a consultant gets
 * the lock panel instead of the tool, while an advocate and every other
 * account get the page unchanged. The refusal on the court write routes is the
 * server-side gate; this one keeps the tool off the consultant's screen.
 *
 * It renders nothing while the session is still loading, so a consultant never
 * sees the tool for a moment before the lock replaces it.
 */
export default function ConsultantGate({ children }: { children: React.ReactNode }) {
  const { practiceKind, loading } = useUser();
  if (loading) return null;
  if (practiceKind === "consultant") return <ConsultantBlockedPanel />;
  return <>{children}</>;
}

/**
 * The one-line form of the lock, for a screen a consultant keeps reading but
 * whose court controls he loses (the hearings, stages and deadlines tabs of a
 * case file): the same message, verbatim, where the controls would be.
 */
export function ConsultantBlockedNote({ className = "" }: { className?: string }) {
  const { isDark } = useTheme();

  return (
    <p
      role="note"
      className={`flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
        isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"
      } ${className}`}
    >
      <LockSimple size={13} weight="duotone" className="mt-0.5 flex-shrink-0" />
      <span>{CONSULTANT_BLOCKED_MESSAGE}</span>
    </p>
  );
}

/** The lock itself: the Art. 18 message, verbatim, and the way back. */
export function ConsultantBlockedPanel() {
  const { isDark } = useTheme();

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center" dir="rtl">
      <div
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${
          isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"
        }`}
      >
        <LockSimple size={32} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
      </div>
      <p role="status" className={`text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
        {CONSULTANT_BLOCKED_MESSAGE}
      </p>
      <Link
        href="/dashboard/lawyer"
        className={`mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
          isDark
            ? "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        <ArrowRight size={16} weight="bold" />
        العودة للوحة التحكم
      </Link>
    </div>
  );
}
