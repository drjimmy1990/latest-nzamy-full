import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DeleteCardButton } from "@/components/payments/BillingControls";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, getBillingWith } from "@/lib/payments/billingCore";
import { arabicDigits, billingDateAr, billingItemAr, cardLabel, orderStatusAr, type BillingData } from "@/lib/payments/billingView";
import { formatHalalas } from "@/lib/payments/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفوترة والمدفوعات | نظامي", robots: { index: false, follow: false } };
const PANEL = "rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 dark:border-zinc-800 dark:bg-zinc-900";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Fbilling");
  let data: BillingData | null = null;
  try {
    const result = await getBillingWith(await createServiceClient(), user.id);
    if (result.status === 200) data = result.body as BillingData;
  } catch { /* The page keeps a useful unavailable state while configuration is missing. */ }
  return <>
    <Navbar />
    <main dir="rtl" className="min-h-[75dvh] bg-zinc-50 px-4 pb-20 pt-32 text-zinc-900 dark:bg-[#0A0A0A] dark:text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-sm text-zinc-500">حسابك في نظامي</p><h1 className="text-3xl font-extrabold">الفوترة والمدفوعات</h1></div>
          <Link href="/settings?tab=subscription" className="text-sm font-semibold text-[#0B3D2E] dark:text-[#C8A762]">إعدادات الاشتراك</Link>
        </div>
        {!data ? <p role="alert" className={PANEL}>{BILLING_UNAVAILABLE_AR}</p> : <>
          <section className={PANEL}>
            <h2 className="text-xl font-bold">رصيد النقاط</h2>
            <p className="mt-3 text-3xl font-extrabold text-[#0B3D2E] dark:text-[#C8A762]">{arabicDigits(data.pointsBalance)} <span className="text-base">نقطة</span></p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">تُستخدم النقاط الأقرب انتهاءً أولاً. النقاط مخصصة لاستخدام أدوات الذكاء الاصطناعي ولا تُحوّل إلى نقد.</p>
            {data.lots.length ? <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">{data.lots.map(lot => <li key={lot.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{arabicDigits(lot.points_left)} نقطة متبقية من {arabicDigits(lot.points_total)}</span><span className="text-zinc-500 dark:text-zinc-400">تنتهي في {billingDateAr(lot.expires_at)}</span></li>)}</ul> : <p className="mt-5 text-sm text-zinc-500">لا توجد نقاط صالحة للاستخدام حالياً.</p>}
          </section>
          <section className={PANEL}>
            <h2 className="text-xl font-bold">البطاقات المحفوظة</h2>
            {data.cards.length ? <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">{data.cards.map(card => <li key={card.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold">{cardLabel(card.last_four)}</p><p className="mt-1 text-xs text-zinc-500">{card.status === "inactive" ? "غير نشطة" : "محفوظة"}</p></div><DeleteCardButton id={card.id} /></li>)}</ul> : <p className="mt-4 text-sm text-zinc-500">لا توجد بطاقات محفوظة.</p>}
          </section>
          <section className={PANEL}>
            <h2 className="text-xl font-bold">عمليات الدفع</h2><p className="mt-2 text-xs text-zinc-500">آخر ١٠٠ عملية في حسابك</p>
            {data.orders.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-right text-sm"><thead className="text-zinc-500"><tr>{["العملية", "التاريخ", "المبلغ", "الحالة", "الإيصال"].map(label => <th key={label} className="py-3 pl-4 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{data.orders.map(order => <tr key={order.id}><td className="py-4 pl-4 font-semibold">{billingItemAr(order.item_id)}</td><td className="py-4 pl-4">{billingDateAr(order.paid_at ?? order.created_at)}</td><td className="py-4 pl-4 whitespace-nowrap">{formatHalalas(order.total_halalas)}</td><td className="py-4 pl-4">{orderStatusAr(order.status)}</td><td className="py-4">{order.receipt_number ? <Link href={`/dashboard/billing/receipt/${order.id}`} className="font-semibold text-[#0B3D2E] dark:text-[#C8A762]">عرض الإيصال</Link> : "—"}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-zinc-500">لا توجد عمليات دفع في حسابك.</p>}
          </section>
        </>}
      </div>
    </main>
    <Footer />
  </>;
}
