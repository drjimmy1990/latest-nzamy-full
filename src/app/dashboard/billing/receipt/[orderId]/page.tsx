import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, readReceiptWith } from "@/lib/payments/billingCore";
import { receiptView } from "@/lib/payments/billingView";
import { DOC_BACK_LINK, DocumentShell, InvoiceDocument } from "@/components/payments/TaxDocuments";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفاتورة | نظامي", robots: { index: false, follow: false } };

/** The site Navbar (as on /dashboard/billing) on screen only: the printout is the document alone. */
function ScreenNavbar() {
  return <div className="print:hidden"><Navbar /></div>;
}
function Unavailable() {
  return <><ScreenNavbar /><div dir="rtl" className="mx-auto max-w-2xl px-4 pb-10 pt-32 print:pt-0"><p>{BILLING_UNAVAILABLE_AR}</p><Link href="/dashboard/billing" className={`mt-6 ${DOC_BACK_LINK}`}>العودة إلى الفوترة</Link></div></>;
}

/**
 * The paid order's simplified tax invoice with its ZATCA QR (batch l7), or
 * its payment receipt with the reason it is not a tax invoice (no seller
 * data yet, a test payment). receiptView decides; the user's own order only.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/billing/receipt/${orderId}`)}`);
  let result: Awaited<ReturnType<typeof readReceiptWith>>;
  // The order through the user's RLS client; the service client reads only the masked card details and billing_company.
  try { result = await readReceiptWith(supabase, await createServiceClient(), user.id, orderId); }
  catch { return <Unavailable />; }
  if (result.unavailable) return <Unavailable />;
  if (!result.order) notFound();
  const view = receiptView(result.order, result.company);
  if (!view) notFound();
  return <><ScreenNavbar /><DocumentShell backHref="/dashboard/billing" backLabel="العودة إلى الفوترة">
    <InvoiceDocument view={view} refundedHalalas={result.order.refunded_halalas} creditNoteHref={view.creditNoteNumber ? `/dashboard/billing/credit-note/${result.order.id}` : null} />
  </DocumentShell></>;
}
