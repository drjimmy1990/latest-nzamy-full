import Link from "next/link";
import { Coins } from "@phosphor-icons/react";
import { TOPUP_BUTTON_AR, TOPUP_HREF } from "@/lib/payments/topUpLinks";
import { arabicDigits, billingDateAr, pointsByType, pointsSummary, POINTS_SPEND_ORDER_AR, POINTS_SPEND_REFUND_NOTE_AR, type BillingData } from "@/lib/payments/billingView";

/**
 * PointsBalanceCard — the points balance and the nearest expiry, for the
 * settings tabs «الخطة والحدود» and «المدفوعات». It renders only data that was
 * actually read (useBillingData's "ready"); the per-batch list lives on
 * /dashboard/billing, which the card links to.
 */
export function PointsBalanceCard({ data }: { data: Pick<BillingData, "pointsBalance" | "lots"> }) {
  const { balance, nearestExpiry } = pointsSummary(data);
  const groups = pointsByType(data.lots);
  return (
    <div className="rounded-[2rem] border border-slate-200/50 bg-white/80 px-6 py-6 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#161b22]/80">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
            <Coins size={22} weight="fill" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {arabicDigits(balance)} <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">نقطة</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {nearestExpiry ? `أقرب انتهاء: ${billingDateAr(nearestExpiry)}` : "لا توجد نقاط صالحة للاستخدام حالياً."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* l16 (A-57, owner 25 Nov §7.7.2): top up from the balance itself */}
          <Link href={TOPUP_HREF} className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0B3D2E]/90 dark:bg-[#C8A762] dark:text-[#0B3D2E]">
            {TOPUP_BUTTON_AR}
          </Link>
          <Link href="/dashboard/billing" className="text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]">
            تفاصيل النقاط
          </Link>
        </div>
      </div>
      {/* Owner ١٦٥ (l13): the balance by kind, each with its soonest end, in spend order. */}
      {groups.length > 0 && (<>
        <ul className="mt-4 space-y-1 border-t border-slate-200/60 pt-3 dark:border-white/[0.06] text-xs text-zinc-600 dark:text-zinc-300" aria-label="الرصيد حسب نوع النقاط">
          {groups.map(group => (
            <li key={group.type} className="flex flex-wrap justify-between gap-2">
              <span className="font-bold">{group.label}: {arabicDigits(group.points)} نقطة</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {group.lots.length > 1 ? "أقربها تنتهي في" : "تنتهي في"} {billingDateAr(group.nearestExpiry)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">{POINTS_SPEND_ORDER_AR} {POINTS_SPEND_REFUND_NOTE_AR}</p>
      </>)}
    </div>
  );
}
