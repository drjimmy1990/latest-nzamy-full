import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, readReceiptWith } from "@/lib/payments/billingCore";
import { receiptView } from "@/lib/payments/billingView";
import { PrintReceiptButton } from "@/components/payments/BillingControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "إيصال دفع | نظامي", robots: { index: false, follow: false } };

/** The site Navbar (as on /dashboard/billing) on screen only: the printout is the receipt alone. */
function ScreenNavbar() {
  return <div className="print:hidden"><Navbar /></div>;
}
const BACK_LINK = "inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 print:hidden";
function Unavailable() {
  return <><ScreenNavbar /><div dir="rtl" className="mx-auto max-w-2xl px-4 pb-10 pt-32 print:pt-0"><p>{BILLING_UNAVAILABLE_AR}</p><Link href="/dashboard/billing" className={`mt-6 ${BACK_LINK}`}>العودة إلى الفوترة</Link></div></>;
}

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/billing/receipt/${orderId}`)}`);
  let result: Awaited<ReturnType<typeof readReceiptWith>>;
  // The order through the user's RLS client; the service client reads only the masked card details.
  try { result = await readReceiptWith(supabase, await createServiceClient(), user.id, orderId); }
  catch { return <Unavailable />; }
  if (result.unavailable) return <Unavailable />;
  if (!result.order) notFound();
  const view = receiptView(result.order, result.company);
  if (!view) notFound();
  return <><ScreenNavbar /><main dir="rtl" className="min-h-screen bg-zinc-50 px-4 pb-12 pt-32 text-zinc-900 dark:bg-[#0A0A0A] dark:text-zinc-100 print:bg-white print:p-0 print:text-black">
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden"><Link href="/dashboard/billing" className={BACK_LINK}>العودة إلى الفوترة</Link><PrintReceiptButton /></div>
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:bg-white print:text-black">
        {view.testNotice ? <p className="mb-5 rounded-lg bg-amber-50 p-3 font-bold text-amber-900">{view.testNotice}</p> : null}
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-200 pb-6"><div><p className="font-extrabold text-[#0B3D2E] dark:text-[#C8A762] print:text-[#0B3D2E]">نظامي</p><h1 className="mt-3 text-3xl font-extrabold">{view.title}</h1></div><div className="text-sm"><p dir="ltr" className="font-mono">{view.number}</p><p className="mt-2">{view.date}</p><p className="mt-2 font-semibold">{view.status}</p></div></div>
        {view.company ? <address className="mt-6 space-y-1 text-sm not-italic"><p className="font-bold">{view.company.legal_name_ar}</p><p>السجل التجاري: <bdi>{view.company.cr_number}</bdi></p><p>الرقم الضريبي: <bdi>{view.company.vat_number}</bdi></p><p>{view.company.address_ar}</p></address> : <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{view.companyNotice}</p>}
        <p className="my-8 text-lg font-bold">{view.item}</p>
        <dl className="space-y-4 text-sm">{[["المبلغ قبل الضريبة", view.net], [view.vatLabel, view.vat], ["الإجمالي", view.total]].map(([label, amount]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-bold">{amount}</dd></div>)}</dl>
        {result.order.refunded_halalas > 0 ? <p className="mt-5 text-sm font-semibold">المبلغ المسترد: {view.refunded}</p> : null}
        <p className="mt-8 text-sm">طريقة الدفع: {view.lastFour ? `بطاقة تنتهي بـ ${view.lastFour}` : "تفاصيل البطاقة غير متاحة"}</p>
        <p className="mt-8 border-t border-zinc-200 pt-5 text-sm text-zinc-500 print:text-black">{view.taxInvoiceNotice}</p>
      </article>
    </div>
  </main></>;
}
