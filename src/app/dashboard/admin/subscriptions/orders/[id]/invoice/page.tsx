import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { BILLING_UNAVAILABLE_AR, readOrderAsStaffWith } from "@/lib/payments/billingCore";
import { receiptView } from "@/lib/payments/billingView";
import { DocumentShell, InvoiceDocument } from "@/components/payments/TaxDocuments";

export const dynamic = "force-dynamic";
export const metadata = { title: "فاتورة العملية | إدارة نظامي", robots: { index: false, follow: false } };

const BACK = "/dashboard/admin/subscriptions/orders";

/** Staff view of any order's tax invoice / receipt (batch l7): the same document the buyer sees. */
export default async function AdminOrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("payments.read");
  if (!gate.ok) notFound();
  const { id } = await params;
  let result: Awaited<ReturnType<typeof readOrderAsStaffWith>>;
  try { result = await readOrderAsStaffWith(await createServiceClient(), id); }
  catch { result = { order: null, company: null, unavailable: true }; }
  if (result.unavailable) return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات"><p>{BILLING_UNAVAILABLE_AR}</p></DocumentShell>;
  if (!result.order) notFound();
  const view = receiptView(result.order, result.company);
  if (!view) return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات"><p>لا فاتورة لهذه العملية: تصدر للعمليات المدفوعة أو المستردة فقط.</p></DocumentShell>;
  return <DocumentShell compact backHref={BACK} backLabel="العودة إلى المدفوعات">
    <InvoiceDocument view={view} refundedHalalas={result.order.refunded_halalas} creditNoteHref={view.creditNoteNumber ? `${BACK}/${result.order.id}/credit-note` : null} />
  </DocumentShell>;
}
