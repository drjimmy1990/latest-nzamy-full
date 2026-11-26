import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR } from "@/lib/payments/billingCore";
import { billingDateTimeAr } from "@/lib/payments/billingView";
import { FREE_ACTIVATION_COLUMNS, freeActivationView, type FreeActivationRow } from "@/lib/payments/freeActivationView";
import { DOC_BACK_LINK, DocumentShell } from "@/components/payments/TaxDocuments";

export const dynamic = "force-dynamic";
export const metadata = { title: "إيصال تفعيل مجاني | نظامي", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The free-activation receipt of a redeemed free-plan / points code (batch
 * l16; owner س٢١٣ ب): full price → 100 % discount → net 0, no VAT line
 * (nothing was charged). The user's own row only, through his RLS client
 * (policy "own coupon redemptions", 20261206_30).
 */
export default async function FreeActivationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/billing/activation/${id}`)}`);
  if (!UUID.test(id)) notFound();
  const { data, error } = await supabase.from("coupon_redemptions").select(FREE_ACTIVATION_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    return <><div className="print:hidden"><Navbar /></div><div dir="rtl" className="mx-auto max-w-2xl px-4 pb-10 pt-32"><p>{BILLING_UNAVAILABLE_AR}</p><Link href="/dashboard/billing" className={`mt-6 ${DOC_BACK_LINK}`}>العودة إلى الفوترة</Link></div></>;
  }
  const view = freeActivationView(data as FreeActivationRow | null);
  if (!view) notFound();
  return <><div className="print:hidden"><Navbar /></div><DocumentShell backHref="/dashboard/billing" backLabel="العودة إلى الفوترة">
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:bg-white print:text-black!" data-document="free-activation">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-200 pb-6 dark:border-zinc-800 print:border-zinc-300!">
        <div><p className="font-extrabold text-[#0B3D2E] dark:text-[#C8A762] print:text-[#0B3D2E]!">نظامي</p><h1 className="mt-3 text-3xl font-extrabold">{view.title}</h1></div>
        <div className="text-sm"><p>رقم الإيصال: <bdi dir="ltr" className="font-mono">{view.number}</bdi></p><p className="mt-2">تاريخ ووقت الإصدار: {billingDateTimeAr(view.issuedAt)}</p></div>
      </div>
      <p className="mt-8 text-lg font-bold">{view.item}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 print:text-black!">كود المنحة: <bdi dir="ltr" className="font-mono">{view.code}</bdi></p>
      <dl className="mt-8 space-y-4 text-sm">{view.lines.map(([label, amount]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-bold">{amount}</dd></div>)}</dl>
      <p className="mt-8 border-t border-zinc-200 pt-5 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 print:border-zinc-300! print:text-black!">{view.note}</p>
    </article>
  </DocumentShell></>;
}
