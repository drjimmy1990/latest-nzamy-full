"use client";

/**
 * SignupPlanNextStep — LIVE-04 (batch l18): the plan a professional chose on
 * step 4 of /register/provider (or on /pricing) is shown once the account
 * exists, with one button that takes it to payment (/checkout) while online
 * payment is on, or to the plans page otherwise (src/lib/pricing/signupPlan.ts).
 * The checkout page itself says when this account cannot buy the plan yet.
 * Mounted only after the mobile is confirmed, so its payment-status read is
 * never refused.
 */

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { gatewayAllowsCheckout } from "@/lib/payments/checkoutView";
import { bookEntry, BILLING_LABEL_AR, BILLING_LABEL_EN, isBilling } from "@/lib/pricing/priceBook";
import { pendingPlanHref } from "@/lib/pricing/signupPlan";

export default function SignupPlanNextStep({
  planId,
  planName,
  billing,
  isAr,
}: {
  planId: string;
  /** The plan's name as /pricing writes it, in the page language. */
  planName: string;
  billing: string;
  isAr: boolean;
}) {
  const payments = usePaymentsStatus();
  const entry = bookEntry(planId);
  if (!entry || payments.loading) return null;
  const gatewayOn = gatewayAllowsCheckout(payments);
  const href = pendingPlanHref({ plan: planId, billing }, gatewayOn);
  if (!href) return null;
  const cycle = isBilling(billing) ? (isAr ? BILLING_LABEL_AR[billing] : BILLING_LABEL_EN[billing]) : "";
  return (
    <div className="rounded-2xl border-2 border-royal bg-royal/5 p-4 text-start dark:bg-royal/20">
      <div className="text-sm font-bold text-royal dark:text-gold">
        {isAr ? `باقتك المختارة: «${planName}»${cycle ? ` — ${cycle}` : ""}` : `Your chosen plan: ${planName}${cycle ? ` — ${cycle}` : ""}`}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
        {gatewayOn
          ? isAr
            ? "يبدأ اشتراكك بعد إتمام الدفع. حسابك مجاني حتى ذلك الحين."
            : "Your subscription starts once it is paid. Until then your account is free."
          : isAr
            ? "الدفع الإلكتروني غير متاح الآن؛ اطّلع على الباقات واطلب الاشتراك من صفحة الأسعار."
            : "Online payment is not available right now; see the plans and request the subscription from the pricing page."}
      </p>
      <a
        href={href}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-royal px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-royal-light"
      >
        {gatewayOn ? (isAr ? "إتمام الاشتراك والدفع" : "Subscribe and pay") : isAr ? "صفحة الأسعار" : "Pricing page"}
        {isAr ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
      </a>
    </div>
  );
}
