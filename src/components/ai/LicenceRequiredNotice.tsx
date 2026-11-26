"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { readToolStatus } from "@/lib/ai/toolStatusClient";
import { lawyerOnlyAiTool } from "@/lib/ai/lawyerOnlyTools";
import {
  LICENCE_REQUIRED_EVENT,
  LICENCE_REQUIRED_FIRM_AR,
  LICENCE_REQUIRED_TOOLS_AR,
  LICENCE_VERIFY_HREF,
} from "@/lib/auth/verifiedProvider";

/**
 * Owner س٢١٤ (25 Nov 2026, batch l16): a lawyer's or a firm's drafting AI
 * tools run only once the licence is verified (the run path refuses them with
 * 403 provider_not_verified, runCore.ts). Without this notice a tool page
 * reading tool-status would show «قريباً» — untrue: the tool is live, the
 * account is what waits.
 *
 * `useLicenceGate` (the /ai layout): on a lawyer-only tool page
 * (lawyerOnlyTools.ts) it asks tool-status for that page's tool; "required"
 * replaces the page with LicenceRequiredNotice. Display only — the server
 * refuses either way.
 * `LicenceRequiredBanner`: for the pages that host a professional tool next to
 * something else (/ai/draft, /ai/analyze), the line a refused run raises
 * (useAiRun → LICENCE_REQUIRED_EVENT).
 */

export type LicenceGate = { state: "unknown" | "ok" } | { state: "required"; verifyHref: string | null };

export function useLicenceGate(pathname: string, userType: string | null | undefined, enabled: boolean): LicenceGate {
  const tool = enabled && (userType === "lawyer" || userType === "firm") ? lawyerOnlyAiTool(pathname) : null;
  const [answer, setAnswer] = useState<{ tool: string; gate: LicenceGate } | null>(null);

  useEffect(() => {
    if (!tool) return;
    let live = true;
    void readToolStatus(tool).then((status) => {
      if (!live) return;
      setAnswer({ tool, gate: status.licence ? { state: "required", verifyHref: status.licence.verifyHref } : { state: "ok" } });
    });
    return () => {
      live = false;
    };
  }, [tool]);

  if (!tool) return { state: "ok" };
  return answer && answer.tool === tool ? answer.gate : { state: "unknown" };
}

function Body({ verifyHref, firm, isDark }: { verifyHref: string | null; firm: boolean; isDark: boolean }) {
  return (
    <>
      <p role="status" className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
        {firm ? "توثيق مكتبك لم يكتمل بعد" : "وثّق رخصتك لتفعيل هذه الأداة"}
      </p>
      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        {firm ? LICENCE_REQUIRED_FIRM_AR : LICENCE_REQUIRED_TOOLS_AR}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {verifyHref && (
          <Link href={verifyHref} className="inline-flex items-center rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white">
            إكمال توثيق الرخصة
          </Link>
        )}
        <Link
          href="/ai/quick-answer"
          className={`inline-flex items-center rounded-xl border px-4 py-2 text-[12px] font-bold ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-200 text-zinc-700"}`}
        >
          سؤال قانوني سريع
        </Link>
      </div>
    </>
  );
}

export function LicenceRequiredNotice({ verifyHref, userType }: { verifyHref: string | null; userType: string | null | undefined }) {
  const { isDark } = useTheme();
  return (
    <div dir="rtl" className="p-5 md:p-7 max-w-2xl mx-auto">
      <div className={`rounded-2xl border p-6 space-y-3 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70"}`}>
        <Body verifyHref={verifyHref} firm={userType === "firm"} isDark={isDark} />
      </div>
    </div>
  );
}

export function LicenceRequiredBanner({ userType }: { userType: string | null | undefined }) {
  const { isDark } = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(LICENCE_REQUIRED_EVENT, on);
    return () => window.removeEventListener(LICENCE_REQUIRED_EVENT, on);
  }, []);
  if (!shown || (userType !== "lawyer" && userType !== "firm")) return null;
  const firm = userType === "firm";
  return (
    <div dir="rtl" className="mx-auto mt-3 max-w-4xl px-4">
      <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? "bg-zinc-900 border-amber-500/20" : "bg-amber-50/80 border-amber-200"}`}>
        <Body verifyHref={firm ? null : LICENCE_VERIFY_HREF} firm={firm} isDark={isDark} />
        <button type="button" onClick={() => setShown(false)} className={`text-[11px] underline ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          إخفاء
        </button>
      </div>
    </div>
  );
}
