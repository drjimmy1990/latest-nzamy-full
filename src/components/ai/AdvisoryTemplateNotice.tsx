"use client";

import Link from "next/link";
import { Info, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { resolveAdvisoryHandoff } from "./advisoryHandoff";

/**
 * Owner item ١٨ / س٣ — how the instant tools describe themselves.
 *
 * His ruling, verbatim: «تصنيفها للمستخدم كـ «نماذج وقوالب استرشادية فورية»،
 * مع إبراز زر المسار البشري المباشر: «طلب التدقيق والاعتماد من محامي المكتب»».
 *
 * Rendered at the TOP of the tool rather than under its output. The point of
 * the relabelling is that the reader knows what they are getting BEFORE they
 * act on it; a note that only appears after the document is generated arrives
 * after the decision it was meant to inform. It also cannot then be missed by
 * a reader who copies the output and leaves.
 *
 * Deliberately NOT amber/red. This is not a warning that something is broken
 * — the templates are useful and the office stands behind them as templates.
 * A red banner over every instant tool would teach users to scroll past the
 * one place the human path is offered.
 *
 * ── Owner item ٨٩ — the human path is not offered to the humans who ARE it.
 *
 * `AiResultActions` already refuses to show «طلب مراجعة بمحامٍ» to a lawyer or
 * a firm. This banner had no role logic at all, so on the two routes that sit
 * in the LAWYER's own sidebar — /ai/analyze («عصارة المرفقات») and /ai/consult
 * — a lawyer was invited to buy a lawyer's review of their own draft.
 *
 * The gate lives here rather than in each host page so that every current and
 * future host inherits it; there are five call sites today.
 *
 * Two deliberate choices in its shape:
 *
 *  • It is a DENY list (lawyer, firm), not the toolbar's allow list. The hosts
 *    include client-facing pages reached by government, provider and micro
 *    accounts as well; an allow list would quietly strip the human path from
 *    them, which is removing an honest route nobody asked to remove.
 *
 *  • It waits for `loading` to settle before committing to either branch. The
 *    CTA is not rendered "until proven lawyer" — a lawyer would then see the
 *    offer for a frame on every load, which is the defect at a smaller scale.
 *
 * The prose moves with the button. Line 2 of the body used to read «لاعتماده
 * للاستخدام الرسمي اطلب تدقيق محامي المكتب», which is the same offer written
 * out; hiding the button and keeping the sentence would still be telling a
 * lawyer to go and ask a lawyer.
 */

/** Roles that ARE the human review path, so cannot be sold it. Mirrors the
 *  specialist exclusion in `AiResultActions`. */
const SPECIALIST_TYPES = ["lawyer", "firm"];

export default function AdvisoryTemplateNotice({
  handoffServiceId,
  className = "",
  pendingSelection = false,
}: {
  /** A `serviceId` from CLIENT_SERVICE_CATALOG — the human service this tool hands off to. */
  handoffServiceId: string;
  className?: string;
  /**
   * True on a host that renders this notice before the reader has chosen
   * WHAT to generate (e.g. letters/page.tsx, above the step-1 type picker).
   * «المخرج هنا نموذج استرشادي» reads correctly once a draft exists; before
   * any choice is made there is no "here" yet, so the lead sentence switches
   * to future tense instead of claiming an output that has not been produced.
   */
  pendingSelection?: boolean;
}) {
  const { isDark } = useTheme();
  const user = useUser();
  const handoff = resolveAdvisoryHandoff(handoffServiceId);

  const isSpecialist = SPECIALIST_TYPES.includes(user.userType as string);
  /** Offer the paid human review — everyone except the specialists themselves. */
  const showHumanPath = !user.loading && !isSpecialist;
  /** Tell the specialist whose review it is instead. */
  const showSpecialistNote = !user.loading && isSpecialist;

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
        isDark
          ? "border-white/[0.08] bg-white/[0.03]"
          : "border-zinc-200 bg-zinc-50"
      } ${className}`}
      dir="rtl"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Info
          size={18}
          weight="fill"
          className={`mt-0.5 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
        />
        <div className="min-w-0">
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
            نماذج وقوالب استرشادية فورية
          </p>
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            {pendingSelection
              ? "بعد اختيارك سيُنتَج نموذج استرشادي فوري لم يراجعه محامٍ بعد."
              : "المخرج هنا نموذج استرشادي يُنتج فوراً ولم يراجعه محامٍ بعد."}
            {showHumanPath && " لاعتماده للاستخدام الرسمي اطلب تدقيق محامي المكتب."}
            {showSpecialistNote && " مراجعته واعتماده مسؤوليتك المهنية قبل أي استخدام رسمي."}
          </p>
        </div>
      </div>

      {showHumanPath && (
        <Link
          href={handoff.href}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#155e41]"
        >
          طلب التدقيق والاعتماد من محامي المكتب
          <ArrowLeft size={13} weight="bold" />
        </Link>
      )}
    </div>
  );
}
