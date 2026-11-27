"use client";

import Link from "next/link";
import { Lightning } from "@phosphor-icons/react";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { useUser } from "@/hooks/useUser";
import { individualTopupButtons, individualTopupFor } from "@/lib/payments/individualTopup";
import { SALE_PAUSED_LINE_AR, saleGatewayPaused } from "@/lib/payments/checkoutView";

/**
 * IndividualTopupCard — owner ق٢٦-٦ (batch l19): «شحن ١٠٠» / «شحن ٢٥٠» in the
 * individual's wallet, for the AI tools priced in points and for the smart
 * plan's subscriber once his month's fair use is used. Anchored #topup (the
 * AI screens' «اشحن رصيدك» link). Shown to an individual only (the packs'
 * buyers); every other account renders nothing.
 */
export default function IndividualTopupCard({ isDark }: { isDark: boolean }) {
  const user = useUser();
  const payments = usePaymentsStatus();
  if (user.loading || !user.isLoggedIn || !individualTopupFor(user.userType)) return null;
  const buttons = individualTopupButtons(payments, true);
  if (buttons.length === 0) return null;
  const paused = !payments.loading && saleGatewayPaused(payments);
  return (
    <section
      id="topup"
      aria-labelledby="topup-title"
      className={`rounded-2xl border p-5 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100 shadow-sm"}`}
    >
      <div className="flex items-center gap-2">
        <Lightning size={18} weight="fill" className="text-amber-500" />
        <h2 id="topup-title" className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
          شحن رصيد النقاط
        </h2>
      </div>
      <p className={`mt-2 text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        النقطة بريال واحد، وتُستخدم في أدوات الذكاء الاصطناعي للأفراد، وفيما زاد على الاستخدام العادل للباقة الذكية.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {buttons.map((b) =>
          b.waiting ? (
            <span
              key={b.id}
              aria-disabled="true"
              className="flex flex-col items-center justify-center rounded-xl bg-[#0B3D2E]/60 px-4 py-3 text-white"
            >
              <span className="text-sm font-bold">{b.labelAr}</span>
              <span className="text-[11px] text-white/70">{b.pointsAr}</span>
            </span>
          ) : (
            <Link
              key={b.id}
              href={b.href}
              className="flex flex-col items-center justify-center rounded-xl bg-[#0B3D2E] px-4 py-3 text-white transition-colors hover:bg-[#0a5040]"
            >
              <span className="text-sm font-bold">{b.labelAr}</span>
              <span className="text-[11px] text-white/70">{b.pointsAr}</span>
            </Link>
          ),
        )}
      </div>
      {paused && (
        <p className={`mt-3 text-[11px] leading-relaxed ${isDark ? "text-amber-300" : "text-amber-700"}`}>{SALE_PAUSED_LINE_AR}</p>
      )}
    </section>
  );
}
