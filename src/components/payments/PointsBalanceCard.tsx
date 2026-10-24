import Link from "next/link";
import { Coins } from "@phosphor-icons/react";
import { arabicDigits, billingDateAr, pointsSummary, type BillingData } from "@/lib/payments/billingView";

/**
 * PointsBalanceCard — the points balance and the nearest expiry, for the
 * settings tabs «الخطة والحدود» and «المدفوعات». It renders only data that was
 * actually read (useBillingData's "ready"); the per-batch list lives on
 * /dashboard/billing, which the card links to.
 */
export function PointsBalanceCard({ data }: { data: Pick<BillingData, "pointsBalance" | "lots"> }) {
  const { balance, nearestExpiry } = pointsSummary(data);
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
        <Link href="/dashboard/billing" className="text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]">
          تفاصيل النقاط
        </Link>
      </div>
    </div>
  );
}
