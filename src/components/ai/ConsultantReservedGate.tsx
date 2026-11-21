"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockSimple, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import { readToolUsable } from "@/lib/ai/toolStatusClient";
import { CONSULTANT_RESERVED_MESSAGE } from "@/lib/auth/practiceKind";

/**
 * Owner ١٤٦ (register 14 #19, batch l12): the legal opinion is reserved for the
 * licensed advocate and the law firm until the consultant's account type opens.
 * A consultant whose paid term was already running keeps it to the term's end
 * (src/lib/ai/consultantTerm.ts); the server decides, and this gate asks it
 * through GET /api/v1/ai/tool-status (the run path's own rule, R5).
 *
 * Every other account gets the page unchanged; no tool-status read is made for
 * them. Known limit: while the tool itself is switched off, tool-status answers
 * "not usable" for a paid consultant too, so he sees this lock until it is on.
 */
export default function ConsultantReservedGate({ tool, children }: { tool: string; children: React.ReactNode }) {
  const { practiceKind, loading, userType } = useUser();
  if (loading) return null;
  if (userType === "admin" || practiceKind !== "consultant") return <>{children}</>;
  return <ConsultantCheck tool={tool}>{children}</ConsultantCheck>;
}

function ConsultantCheck({ tool, children }: { tool: string; children: React.ReactNode }) {
  const usable = useToolUsable(tool);
  const { isDark } = useTheme();
  if (usable === null) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (usable) return <>{children}</>;
  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center" dir="rtl">
      <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"}`}>
        <LockSimple size={32} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
      </div>
      <p role="status" className={`text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
        {CONSULTANT_RESERVED_MESSAGE}
      </p>
      <Link
        href="/dashboard/lawyer"
        className={`mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
          isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]" : "bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90"
        }`}
      >
        <ArrowRight size={16} />
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}

/**
 * The same rule for one control on a page a consultant otherwise keeps (the
 * drafting half of /ai/contracts): true only for a consultant whom tool-status
 * refuses, null while it answers. Every other account is never asked about.
 */
export function useConsultantReserved(tool: string): boolean | null {
  const { practiceKind, loading, userType } = useUser();
  const [answer, setAnswer] = useState<boolean | null>(null);
  const asks = !loading && userType !== "admin" && practiceKind === "consultant";
  useEffect(() => {
    if (!asks) return;
    let live = true;
    void readToolUsable(tool).then((usable) => {
      if (live) setAnswer(!usable);
    });
    return () => {
      live = false;
    };
  }, [asks, tool]);
  if (loading) return null;
  return asks ? answer : false;
}
