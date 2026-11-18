import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, readCreditNoteWith } from "@/lib/payments/billingCore";
import { creditNoteView } from "@/lib/payments/billingView";
import { CreditNoteDocument, DOC_BACK_LINK, DocumentShell } from "@/components/payments/TaxDocuments";

export const dynamic = "force-dynamic";
export const metadata = { title: "إشعار دائن | نظامي", robots: { index: false, follow: false } };

function ScreenNavbar() {
  return <div className="print:hidden"><Navbar /></div>;
}
function Message({ text }: { text: string }) {
  return <><ScreenNavbar /><div dir="rtl" className="mx-auto max-w-2xl px-4 pb-10 pt-32 print:pt-0"><p>{text}</p><Link href="/dashboard/billing" className={`mt-6 ${DOC_BACK_LINK}`}>العودة إلى الفوترة</Link></div></>;
}

/**
 * The VAT credit note of the user's refunded / voided order (batch l7,
 * decision 10), read through his RLS client (payment_credit_notes: own rows).
 * Not issued yet (or 20261127_30 not run) → an honest «لم يصدر بعد», never a
 * made-up document.
 */
export default async function CreditNotePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/billing/credit-note/${orderId}`)}`);
  let result: Awaited<ReturnType<typeof readCreditNoteWith>>;
  try { result = await readCreditNoteWith(supabase, await createServiceClient(), user.id, orderId); }
  catch { return <Message text={BILLING_UNAVAILABLE_AR} />; }
  if (result.unavailable) return <Message text={BILLING_UNAVAILABLE_AR} />;
  if (!result.note) return <Message text="لم يصدر الإشعار الدائن لهذه العملية بعد؛ يصدر عند إتمام الاسترداد، وإن تأخر فتواصل مع الدعم." />;
  const view = creditNoteView(result.note, result.company);
  if (!view) notFound();
  return <><ScreenNavbar /><DocumentShell backHref="/dashboard/billing" backLabel="العودة إلى الفوترة">
    <CreditNoteDocument view={view} invoiceHref={result.note.method === "refund" ? `/dashboard/billing/receipt/${result.note.order_id}` : null} />
  </DocumentShell></>;
}
