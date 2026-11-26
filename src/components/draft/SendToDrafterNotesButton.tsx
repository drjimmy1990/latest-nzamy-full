"use client";

/**
 * «أرسل إلى الصائغ» (Q485 / P1-13): hands a library text — an answer of the
 * library researcher, or a law article — to the legal drafter's notes field
 * («ملاحظات ومرئيات»). Writes the one-shot sessionStorage handoff
 * (lib/ai/libraryDrafterHandoff.ts) and opens /ai/draft?from=library in the
 * same tab; nothing is submitted, nothing is charged.
 *
 * Shown only to the accounts the drafter's AI is open to (tools.ts roles:
 * lawyer and firm), the same rule /ai/draft applies; everyone else sees
 * nothing. Source markers ([S1]…) are stripped first.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimpleLine } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { AI_TOOLS } from "@/lib/ai/tools";
import { toolRoleRefusal } from "@/lib/ai/aiToolsConfig";
import { stripCitationMarkers } from "@/lib/ai/citationMarkers";
import { sessionStorageOrNull, canSendToDrafter } from "@/lib/ai/transcriptHandoff";
import { DRAFTER_LIBRARY_URL, writeLibraryHandoff } from "@/lib/ai/libraryDrafterHandoff";

/** The two lines under the button (B-24). */
const DRAFTER_HINT = [
  "يفتح الصائغ القانوني ويضع هذا النص في خانة «ملاحظات ومرئيات».",
  "لا يُرسل شيئاً ولا يخصم نقاطاً؛ تكمل أنت الطلب هناك.",
] as const;

interface Props {
  text: string;
  /** What the text is, shown in the drafter («باحث المكتبة», «نظام العمل — المادة ٧٧»). */
  sourceLabel: string;
  isDark: boolean;
  className?: string;
}

export default function SendToDrafterNotesButton({ text, sourceLabel, isDark, className = "" }: Props) {
  const user = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (user.loading || !user.isLoggedIn) return null;
  if (toolRoleRefusal(AI_TOOLS["legal-drafter"], { userType: user.userType ?? "", practiceKind: null }) !== null) return null;

  const clean = stripCitationMarkers(text).trim();
  if (!canSendToDrafter(clean)) return null;

  function send() {
    const result = writeLibraryHandoff(sessionStorageOrNull(), clean, sourceLabel);
    if (!result.ok) {
      setError("تعذّر حفظ النص في هذا المتصفح — انسخه والصقه في «ملاحظات ومرئيات» لدى الصائغ القانوني.");
      return;
    }
    router.push(DRAFTER_LIBRARY_URL);
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={send}
        title="يفتح الصائغ القانوني والنص في خانة «ملاحظات ومرئيات» — لا يُرسل شيئاً ولا يخصم نقاطاً"
        className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-[#0B3D2E]"}`}
      >
        <PencilSimpleLine size={12} /> أرسل إلى الصائغ
      </button>
      {/* Owner package 25-Nov §2.8 (5) (batch l16, B-24): what it does, in two visible lines. */}
      <span data-testid="send-to-drafter-hint" className={`max-w-[16rem] text-[10.5px] leading-snug ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
        <span className="block">{DRAFTER_HINT[0]}</span>
        <span className="block">{DRAFTER_HINT[1]}</span>
      </span>
      {error && <span role="alert" className={`text-[11px] ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</span>}
    </span>
  );
}
