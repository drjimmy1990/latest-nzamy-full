/**
 * invoiceMessage.ts — what «إرسال بيان الأتعاب للموكّل» says (owner TODO
 * 17-Nov, N01-13). Pure — `node --test` runs it.
 *
 * WHY NOT A «PAYMENT LINK». An office collects its own fees in cash or by
 * bank transfer and records them by hand («تسجيل تحصيل»); there is no page on
 * which a client pays an office's statement online. /checkout sells the
 * platform's own catalog through the platform's Moyasar account, and routing a
 * client's fee to an office through it is the open office-payments step (B3),
 * an owner decision. So the message never says «ادفع الآن» and carries no link:
 * it states the statement — subtotal, VAT (Q484) or «غير خاضع», total, what is
 * still due — and that payment goes to the office directly.
 */
import { formatSar, VAT_LINE_AR, VAT_NOT_SUBJECT_AR, type InvoiceVatSnapshot } from "./invoiceVat.ts";

/** Owner ٤٣٠ — the label every fee statement carries (same text as the finance page). */
export const FEE_STATEMENT_LABEL_AR = "بيان أتعاب — ليست فاتورة ضريبية إلكترونية";
export const PAY_DIRECTLY_AR =
  "يُسدَّد هذا البيان للمكتب مباشرة (نقداً أو بتحويل بنكي) — لا يُدفع عبر منصة نظامي.";

export interface InvoiceMessageInput {
  /** The issuer: the office's or the lawyer's name (from the VAT snapshot or the issuer read). */
  issuerName: string;
  clientName: string;
  description: string;
  /** Short reference shown to the client (the first block of the statement id). */
  reference: string;
  /** The statement date as the page shows it. */
  date: string;
  /** What the client owes in total, halalas (payments.amount). */
  totalHalalas: number;
  /** Already collected, halalas. */
  paidHalalas: number;
  /** null: a statement issued before VAT was computed — no tax line at all. */
  vat: InvoiceVatSnapshot | null;
}

export interface InvoiceMessage {
  subject: string;
  heading: string;
  paragraphs: string[];
  details: Array<[string, string]>;
  footer: string[];
  /** The same message as plain text — what «نسخ» puts on the clipboard. */
  text: string;
}

export function statementReference(id: string): string {
  return id.split("-")[0].slice(0, 12).toUpperCase();
}

export function buildInvoiceMessage(input: InvoiceMessageInput): InvoiceMessage {
  const issuer = input.issuerName.trim() || "مكتب المحاماة";
  const remaining = Math.max(0, input.totalHalalas - input.paidHalalas);
  const details: Array<[string, string]> = [
    ["المرجع", input.reference],
    ["التاريخ", input.date],
    ["البيان", input.description],
  ];
  if (input.vat) {
    details.push(["الأتعاب", formatSar(input.vat.subtotalHalalas)]);
    details.push(
      input.vat.rateBp > 0
        ? [VAT_LINE_AR, formatSar(input.vat.vatHalalas)]
        : ["ضريبة القيمة المضافة", VAT_NOT_SUBJECT_AR],
    );
    if (input.vat.vatNumber) details.push(["الرقم الضريبي للمُصدِر", input.vat.vatNumber]);
  }
  details.push(["الإجمالي", formatSar(input.totalHalalas)]);
  if (input.paidHalalas > 0) details.push(["المحصّل", formatSar(input.paidHalalas)]);
  details.push(["المتبقي", formatSar(remaining)]);

  const heading = `بيان أتعاب من ${issuer}`;
  const paragraphs = [`السيد/ة ${input.clientName.trim() || "الموكّل"}،`, `أصدر ${issuer} بيان الأتعاب التالي:`, PAY_DIRECTLY_AR];
  const footer = [FEE_STATEMENT_LABEL_AR, "أُرسلت هذه الرسالة بطلب من المكتب عبر منصة نظامي."];
  const text = [
    heading,
    "",
    ...paragraphs.slice(0, 2),
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    PAY_DIRECTLY_AR,
    FEE_STATEMENT_LABEL_AR,
  ].join("\n");
  return { subject: heading, heading, paragraphs, details, footer, text };
}

/** The in-app notification: short, no link (the client has no screen for an office's statement). */
export function invoiceNotification(input: InvoiceMessageInput): { title: string; body: string } {
  const remaining = Math.max(0, input.totalHalalas - input.paidHalalas);
  const issuer = input.issuerName.trim() || "مكتب المحاماة";
  return {
    title: `بيان أتعاب من ${issuer}`,
    body: `${input.description} — المتبقي ${formatSar(remaining)} (المرجع ${input.reference}). ${PAY_DIRECTLY_AR}`,
  };
}
