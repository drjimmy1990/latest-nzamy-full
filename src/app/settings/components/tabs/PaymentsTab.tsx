"use client";

import Link from "next/link";
import { CreditCard, Receipt, WarningCircle } from "@phosphor-icons/react";
import { EmptyPanel, SectionTitle } from "./_shared";
import { DeleteCardButton } from "@/components/payments/BillingControls";
import { PointsBalanceCard } from "@/components/payments/PointsBalanceCard";
import { useBillingData } from "@/components/payments/useBillingData";
import { billingDateAr, billingItemAr, cardTitleAr, hasReceipt, orderStatusAr } from "@/lib/payments/billingView";
import { formatHalalas } from "@/lib/payments/catalog";

// ── Tab 5: Payments ─────────────────────────────────────────────────
// The member's own payment data, read from GET /api/v1/billing — the route
// /dashboard/billing's data comes from, through the user's RLS client
// (useBillingData). Nothing here is a literal: no sample card, no sample row.
//
//   - saved cards: brand and last four only (the token is a server-only
//     column and never leaves the server), with the same delete control as
//     /dashboard/billing (DeleteCardButton, re-reading the list afterwards);
//   - the latest orders: item, date, total, the status in Arabic, and
//     «عرض الإيصال» only for an order that has a receipt (hasReceipt: paid or
//     refunded);
//   - the points balance and its nearest expiry.
// «عرض الكل» opens /dashboard/billing for every order and the per-batch
// points. While loading the tab shows a placeholder; if the read fails it says
// «تعذّر تحميل المدفوعات» and shows no rows and no balance.
const RECENT_ORDERS = 5;
const PANEL =
  "rounded-[2rem] border border-slate-200/50 bg-white/80 px-6 py-5 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#161b22]/80";

export function PaymentsTab() {
  const { state, reload } = useBillingData();

  if (state.status === "loading") {
    return (
      <div className="space-y-8" aria-busy="true">
        {[0, 1].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="h-[92px] animate-pulse rounded-[2rem] border border-slate-200/50 bg-slate-100/60 dark:border-white/[0.06] dark:bg-white/[0.03]"
          />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        <p className="flex items-center gap-2 text-sm font-bold">
          <WarningCircle size={18} weight="fill" /> تعذّر تحميل المدفوعات
        </p>
        <button
          type="button"
          onClick={reload}
          className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]"
        >
          حاول مرة أخرى
        </button>
      </div>
    );
  }

  const { cards, orders } = state.data;
  const recent = orders.slice(0, RECENT_ORDERS);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Link href="/dashboard/billing" className="text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]">
          عرض الكل
        </Link>
      </div>

      <div>
        <SectionTitle>رصيد النقاط</SectionTitle>
        <PointsBalanceCard data={state.data} />
      </div>

      <div>
        <SectionTitle>البطاقات المحفوظة</SectionTitle>
        {cards.length ? (
          <ul className={`${PANEL} divide-y divide-zinc-200 dark:divide-white/[0.06]`}>
            {cards.map((card) => (
              <li key={card.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <CreditCard size={22} className="text-zinc-500 dark:text-zinc-400" />
                  <div>
                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{cardTitleAr(card)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{card.status === "inactive" ? "غير نشطة" : "محفوظة"}</p>
                  </div>
                </div>
                <DeleteCardButton id={card.id} onDeleted={reload} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyPanel icon={<CreditCard size={28} />} title="لا توجد بطاقات محفوظة" description="لا توجد بطاقة محفوظة في حسابك." />
        )}
      </div>

      <div>
        <SectionTitle>آخر عمليات الدفع</SectionTitle>
        {recent.length ? (
          <ul className={`${PANEL} divide-y divide-zinc-200 dark:divide-white/[0.06]`}>
            {recent.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-bold text-zinc-800 dark:text-zinc-100">{billingItemAr(order.item_id)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {billingDateAr(order.paid_at ?? order.created_at)} · {orderStatusAr(order.status)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="whitespace-nowrap font-bold text-zinc-800 dark:text-zinc-100">{formatHalalas(order.total_halalas)}</span>
                  {hasReceipt(order) ? (
                    <Link
                      href={`/dashboard/billing/receipt/${encodeURIComponent(order.id)}`}
                      className="text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]"
                    >
                      عرض الإيصال
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyPanel icon={<Receipt size={28} />} title="لا توجد عمليات دفع" description="لا توجد عمليات دفع في حسابك." />
        )}
      </div>
    </div>
  );
}
