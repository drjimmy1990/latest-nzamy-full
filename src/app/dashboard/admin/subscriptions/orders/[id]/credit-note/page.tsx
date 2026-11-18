import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, readCreditNoteWith } from "@/lib/payments/billingCore";
import { creditNoteView } from "@/lib/payments/billingView";
import { CreditNoteDocument, DocumentShell } from "@/components/payments/TaxDocuments";

export const dynamic = "force-dynamic";
export const metadata = { title: "إشعار دائن | إدارة نظامي", robots: { index: false, follow: false } };

const BACK = "/dashboard/admin/subscriptions/orders";

/** Staff view of any order's credit note (batch l7, decision 10). */
export default async function AdminOrderCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("payments.read");
  if (!gate.ok) notFound();
  const { id } = await params;
  let result: Awaited<ReturnType<typeof readCreditNoteWith>>;
  try { const admin = await createServiceClient(); result = await readCreditNoteWith(admin, admin, null, id); }
  catch { result = { note: null, company: null, unavailable: true }; }
  if (result.unavailable) return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات"><p>{BILLING_UNAVAILABLE_AR}</p></DocumentShell>;
  if (!result.note) return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات"><p>لم يصدر إشعار دائن لهذه العملية بعد. أصدره من صفحة المدفوعات («إصدار الإشعار الدائن»).</p></DocumentShell>;
  const view = creditNoteView(result.note, result.company);
  if (!view) notFound();
  return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات">
    <CreditNoteDocument view={view} invoiceHref={result.note.method === "refund" ? `${BACK}/${result.note.order_id}/invoice` : null} />
  </DocumentShell>;
}
