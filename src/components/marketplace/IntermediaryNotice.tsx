"use client";

/**
 * IntermediaryNotice — N9 (owner, RAW[38]; F02 §1 #34): «المنصة وسيط لا ضامن
 * ولا أمين على الأتعاب», written on the market terms and at every offer /
 * request card. One component so the wording never drifts; the text lives in
 * src/lib/marketplace/marketSettings.ts (INTERMEDIARY_NOTICE_AR).
 *
 * `withPayment` adds the honest line that fees are not collected through the
 * platform today (payment through the platform is OFF, P3).
 */
import { ShieldWarning } from "@phosphor-icons/react";
import { INTERMEDIARY_NOTICE_AR, NO_PLATFORM_PAYMENT_AR } from "@/lib/marketplace/marketSettings";

export default function IntermediaryNotice({
  withPayment = false,
  className = "",
}: {
  withPayment?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300 ${className}`}
      data-testid="market-intermediary-notice"
    >
      <ShieldWarning size={14} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {INTERMEDIARY_NOTICE_AR}
        {withPayment ? ` ${NO_PLATFORM_PAYMENT_AR}` : ""}
      </span>
    </p>
  );
}
