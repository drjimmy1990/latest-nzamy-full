import Link from "next/link";
import QRCode from "qrcode";
import { PrintReceiptButton } from "@/components/payments/BillingControls";
import type { creditNoteView, receiptView } from "@/lib/payments/billingView";

/**
 * The printable tax documents (batch l7): the paid order's simplified tax
 * invoice (or its receipt, with the reason it is not a tax invoice) and the
 * credit note of a refund / void. Server components shared by the user's
 * pages (/dashboard/billing/…) and the staff pages
 * (/dashboard/admin/subscriptions/orders/[id]/…).
 */

type InvoiceView = NonNullable<ReturnType<typeof receiptView>>;
type NoteView = NonNullable<ReturnType<typeof creditNoteView>>;

export const DOC_BACK_LINK = "inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 print:hidden";
/** The cream notices: amber on screen in both themes, black on paper. */
const NOTICE = "rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 print:border-zinc-400! print:text-black!";
const ARTICLE = "rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:bg-white print:text-black!";
const MUTED = "text-zinc-600 dark:text-zinc-400 print:text-black!";

/** The QR as inline SVG, black on a white box so it scans in dark mode too. Null when it cannot be drawn. */
async function qrSvg(payload: string): Promise<string | null> {
  try { return await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } }); }
  catch { return null; }
}

function Seller({ company, notice }: { company: InvoiceView["company"]; notice: string }) {
  return company
    ? <address className="mt-6 space-y-1 text-sm not-italic"><p className="font-bold">{company.legal_name_ar}</p><p>السجل التجاري: <bdi>{company.cr_number}</bdi></p><p>الرقم الضريبي: <bdi>{company.vat_number}</bdi></p><p>{company.address_ar}</p></address>
    : <p className={`mt-6 text-sm ${NOTICE}`}>{notice}</p>;
}

function Amounts({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="space-y-4 text-sm">{rows.map(([label, amount]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-bold">{amount}</dd></div>)}</dl>;
}

/** compact: inside the admin console (its own sidebar and top bar), no room for the site navbar's offset. */
export function DocumentShell({ backHref, backLabel, compact = false, children }: { backHref: string; backLabel: string; compact?: boolean; children: React.ReactNode }) {
  return <main dir="rtl" className={`min-h-screen bg-zinc-50 px-4 pb-12 ${compact ? "pt-8" : "pt-32"} text-zinc-900 dark:bg-[#0A0A0A] dark:text-zinc-100 print:bg-white print:p-0 print:text-black!`}>
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden"><Link href={backHref} className={DOC_BACK_LINK}>{backLabel}</Link><PrintReceiptButton /></div>
      {children}
    </div>
  </main>;
}

export async function InvoiceDocument({ view, refundedHalalas, creditNoteHref }: { view: InvoiceView; refundedHalalas: number; creditNoteHref: string | null }) {
  const svg = view.qrPayload ? await qrSvg(view.qrPayload) : null;
  return <article className={ARTICLE} data-document={view.isTaxInvoice ? "tax-invoice" : "receipt"}>
    {view.testNotice ? <p className={`mb-5 font-bold ${NOTICE}`}>{view.testNotice}</p> : null}
    <div className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-200 pb-6 dark:border-zinc-800 print:border-zinc-300!">
      <div><p className="font-extrabold text-[#0B3D2E] dark:text-[#C8A762] print:text-[#0B3D2E]!">نظامي</p><h1 className="mt-3 text-3xl font-extrabold">{view.title}</h1></div>
      <div className="text-sm"><p>{view.isTaxInvoice ? "رقم الفاتورة" : "رقم الإيصال"}: <bdi dir="ltr" className="font-mono">{view.number}</bdi></p><p className="mt-2">تاريخ ووقت الإصدار: {view.issuedAt}</p><p className="mt-2 font-semibold">{view.status}</p></div>
    </div>
    <Seller company={view.company} notice={view.companyNotice} />
    <p className="mt-8 text-lg font-bold">{view.item}</p>
    {view.billing ? <p className={`mt-1 text-sm ${MUTED}`}>مدة الاشتراك: {view.billing}</p> : null}
    <div className="mb-8" />
    <Amounts rows={[["المبلغ قبل الضريبة", view.net], [view.vatLabel, view.vat], ["الإجمالي شاملاً الضريبة", view.total]]} />
    {refundedHalalas > 0 ? <p className="mt-5 text-sm font-semibold">المبلغ المسترد: {view.refunded}{view.creditNoteNumber ? <> — بموجب الإشعار الدائن <bdi dir="ltr" className="font-mono">{view.creditNoteNumber}</bdi></> : null}</p> : null}
    {creditNoteHref ? <p className="mt-2 text-sm print:hidden"><Link href={creditNoteHref} className="font-semibold text-[#0B3D2E] underline dark:text-[#C8A762] print:hidden">عرض الإشعار الدائن</Link></p> : null}
    <p className="mt-8 text-sm">طريقة الدفع: {view.lastFour ? `بطاقة تنتهي بـ ${view.lastFour}` : "تفاصيل البطاقة غير متاحة"}</p>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-zinc-200 pt-5 dark:border-zinc-800 print:border-zinc-300!">
      <p className={`max-w-sm text-sm ${MUTED}`}>{view.taxInvoiceNotice}</p>
      {svg ? <div className="h-36 w-36 shrink-0 rounded-lg bg-white p-1" role="img" aria-label="رمز الاستجابة السريعة للفاتورة الضريبية" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    </div>
  </article>;
}

export function CreditNoteDocument({ view, invoiceHref }: { view: NoteView; invoiceHref: string | null }) {
  return <article className={ARTICLE} data-document="credit-note">
    {view.testNotice ? <p className={`mb-5 font-bold ${NOTICE}`}>{view.testNotice}</p> : null}
    <div className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-200 pb-6 dark:border-zinc-800 print:border-zinc-300!">
      <div><p className="font-extrabold text-[#0B3D2E] dark:text-[#C8A762] print:text-[#0B3D2E]!">نظامي</p><h1 className="mt-3 text-3xl font-extrabold">{view.title}</h1></div>
      <div className="text-sm"><p>رقم الإشعار: <bdi dir="ltr" className="font-mono">{view.number}</bdi></p><p className="mt-2">تاريخ ووقت الإصدار: {view.issuedAt}</p></div>
    </div>
    <Seller company={view.company} notice={view.companyNotice} />
    <p className="mt-6 text-sm">يخص الفاتورة رقم <bdi dir="ltr" className="font-mono">{view.invoiceNumber}</bdi> الصادرة في {view.invoiceDate}{invoiceHref ? <> — <Link href={invoiceHref} className="font-semibold text-[#0B3D2E] underline dark:text-[#C8A762] print:hidden">عرضها</Link></> : null}</p>
    <p className="mt-6 text-lg font-bold">{view.item}</p>
    {view.billing ? <p className={`mt-1 text-sm ${MUTED}`}>مدة الاشتراك: {view.billing}</p> : null}
    <p className="mt-2 text-sm">السبب: {view.reason}</p>
    <div className="mb-8" />
    <Amounts rows={[["المبلغ المسترد قبل الضريبة", view.net], [view.vatLabel, view.vat], ["الإجمالي المسترد شاملاً الضريبة", view.total]]} />
    <p className={`mt-8 border-t border-zinc-200 pt-5 text-sm dark:border-zinc-800 print:border-zinc-300! ${MUTED}`}>{view.feeNote}</p>
  </article>;
}
