import { formatHalalas, orderLabelAr, orderLabelWithPointsAr, PAYABLE_ITEMS, type PayableItem } from "./catalog.ts";
import { BILLING_LABEL_AR, isBilling } from "../pricing/priceBook.ts";
import { isBillingCompanyComplete } from "./moyasarConfig.ts";
import { zatcaQrPayload } from "./zatcaQr.ts";

export interface BillingOrder {
  id: string;
  item_id: string;
  /** monthly / quarterly / semiannual / yearly / once (payment_orders.billing). */
  billing?: string | null;
  net_halalas: number;
  vat_halalas: number;
  total_halalas: number;
  currency: string;
  status: string;
  receipt_number: string | null;
  paid_at: string | null;
  refunded_halalas: number;
  created_at?: string;
  last_four?: string | null;
  live?: boolean | null;
  /**
   * Task F fix round 1: the points this order's purchase lot credited
   * (points_lots.points_total), read beside the order. Absent or null when
   * there is no lot or the read failed — the label then comes from the book.
   */
  credited_points?: number | null;
  /** payment_orders.merchant: only a 'platform' order is the platform's tax invoice (l7). */
  merchant?: string | null;
  /** l7: the number of this order's credit note (payment_credit_notes), when one was issued. */
  credit_note_number?: string | null;
}
/** One payment_credit_notes row (20261127_30), as the user's RLS client or the service client reads it. */
export interface BillingCreditNote {
  number: string;
  order_id: string;
  invoice_number: string;
  invoice_issued_at: string;
  item_id: string;
  billing: string | null;
  method: string;
  net_halalas: number;
  vat_halalas: number;
  total_halalas: number;
  currency: string;
  live: boolean;
  issued_at: string;
}
export const CREDIT_NOTE_COLUMNS = "number,order_id,invoice_number,invoice_issued_at,item_id,billing,method,net_halalas,vat_halalas,total_halalas,currency,live,issued_at";
export interface BillingCard {
  id: string;
  merchant: string;
  brand: string | null;
  last_four: string | null;
  exp_month: string | null;
  exp_year: string | null;
  status: string;
}
export interface BillingLot {
  id: string;
  points_left: number;
  points_total: number;
  expires_at: string;
  source: string;
}
export interface BillingData {
  orders: BillingOrder[];
  cards: BillingCard[];
  lots: BillingLot[];
  pointsBalance: number;
}
export interface BillingCompany {
  legal_name_ar: string;
  cr_number: string;
  vat_number: string;
  address_ar: string;
}
export const arabicDigits = (value: string | number) => String(value).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
export function cardLabel(lastFour: unknown): string {
  return typeof lastFour === "string" && /^\d{4}$/.test(lastFour)
    ? `بطاقة تنتهي بـ ${arabicDigits(lastFour)}` : "بطاقة محفوظة";
}
export function billingItemAr(itemId: string, catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS): string {
  // resolve, not sell: a receipt for a retired plan keeps the name it was sold under (R3)
  return orderLabelAr(itemId, catalog) ?? "عملية شراء";
}
/** An order's line: a top-up names the points its lot actually credited (Task F fix round 1), else billingItemAr. */
export function billingOrderItemAr(order: Pick<BillingOrder, "item_id" | "credited_points">, catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS): string {
  return orderLabelWithPointsAr(order.item_id, order.credited_points, catalog) ?? "عملية شراء";
}
/** «شهري» / «ربع سنوي» / «نصف سنوي» / «سنوي» / «دفعة واحدة» for an order's billing; null when unknown. */
export function orderBillingAr(billing: string | null | undefined): string | null {
  return isBilling(billing) ? BILLING_LABEL_AR[billing] : null;
}
export function orderStatusAr(status: string): string {
  const labels: Record<string, string> = { created: "قيد التجهيز", initiated: "بانتظار الدفع", paid: "مدفوع", failed: "لم يكتمل الدفع", refunded: "مسترد", voided: "ملغى لدى مزوّد الدفع", cancelled: "ملغى" };
  return Object.hasOwn(labels, status) ? labels[status] : "غير معروف";
}
export function billingDateAr(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(value));
}
/** «١٩ نوفمبر ٢٠٢٦، ٩:٠٠ ص» — the issue time a tax invoice must carry (Riyadh). */
export function billingDateTimeAr(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
}
/** A receipt exists only for money actually taken: paid, or paid then refunded. A voided payment never settled. */
const RECEIPT_STATUSES: readonly string[] = ["paid", "refunded"];
export function hasReceipt(order: Pick<BillingOrder, "status" | "receipt_number">): boolean {
  return !!order.receipt_number && RECEIPT_STATUSES.includes(order.status);
}
export const TAX_INVOICE_TITLE_AR = "فاتورة ضريبية مبسطة";
export const RECEIPT_TITLE_AR = "إيصال دفع";
/** The honest line under a document that is NOT (yet) a tax invoice, by cause. */
export const NOT_TAX_INVOICE_AR = {
  company: "لا تصدر الفاتورة الضريبية المبسطة حتى تكتمل بيانات المنشأة (الاسم والرقم الضريبي)؛ هذا إيصال بالمبلغ المدفوع.",
  test: "عملية تجريبية: لا تصدر لها فاتورة ضريبية.",
  office: "هذا إيصال بالمبلغ المدفوع؛ تصدر الفاتورة الضريبية من الجهة المستفيدة.",
} as const;
export const TAX_INVOICE_NOTE_AR = "فاتورة ضريبية مبسطة صادرة آلياً عند الدفع، ورقمها رقم العملية.";

/**
 * The paid order's document (batch l7): a simplified tax invoice with its
 * ZATCA QR when the order is a LIVE PLATFORM payment and billing_company is
 * complete (name, CR, VAT no., address); otherwise the payment receipt with
 * the reason it is not a tax invoice. Amounts are the order's own; current
 * catalog prices never replace them. Issue time = paid_at.
 */
export function receiptView(order: BillingOrder, company: unknown) {
  if (!hasReceipt(order) || !order.paid_at) return null;
  const amounts = [order.net_halalas, order.vat_halalas, order.total_halalas, order.refunded_halalas];
  if (order.currency !== "SAR" || !amounts.every(v => Number.isSafeInteger(v) && v >= 0) || order.total_halalas <= 0 || order.total_halalas !== order.net_halalas + order.vat_halalas || order.refunded_halalas > order.total_halalas) return null;
  const seller = isBillingCompanyComplete(company) ? company as BillingCompany : null;
  const cause: keyof typeof NOT_TAX_INVOICE_AR | null = order.live === false ? "test" : order.merchant !== "platform" || order.live !== true ? "office" : !seller ? "company" : null;
  let qrPayload: string | null = null;
  if (!cause && seller) {
    try { qrPayload = zatcaQrPayload({ sellerName: seller.legal_name_ar, vatNumber: seller.vat_number, timestamp: order.paid_at, totalHalalas: order.total_halalas, vatHalalas: order.vat_halalas }); }
    catch { qrPayload = null; }
  }
  const isTaxInvoice = !!qrPayload;
  return {
    title: isTaxInvoice ? TAX_INVOICE_TITLE_AR : RECEIPT_TITLE_AR,
    isTaxInvoice,
    qrPayload,
    issuedAt: billingDateTimeAr(order.paid_at),
    creditNoteNumber: order.credit_note_number ?? null,
    testNotice: order.live === false ? "إيصال تجريبي — لم تُخصم أموال حقيقية" : null,
    number: order.receipt_number,
    date: billingDateAr(order.paid_at),
    item: billingOrderItemAr(order),
    billing: orderBillingAr(order.billing),
    net: formatHalalas(order.net_halalas),
    vatLabel: "ضريبة القيمة المضافة ١٥٪",
    vat: formatHalalas(order.vat_halalas),
    total: formatHalalas(order.total_halalas),
    refunded: formatHalalas(order.refunded_halalas),
    status: orderStatusAr(order.status),
    lastFour: typeof order.last_four === "string" && /^\d{4}$/.test(order.last_four) ? arabicDigits(order.last_four) : null,
    company: isBillingCompanyComplete(company) ? company as BillingCompany : null,
    companyNotice: "بيانات المنشأة غير مكتملة",
    taxInvoiceNotice: isTaxInvoice ? TAX_INVOICE_NOTE_AR : NOT_TAX_INVOICE_AR[cause ?? "company"],
  };
}

const CREDIT_METHOD_AR: Record<string, string> = { refund: "استرداد كامل إلى وسيلة الدفع نفسها", void: "إلغاء العملية لدى مزوّد الدفع قبل تسويتها" };
/**
 * The credit note of a refunded / voided order (batch l7, decision 10): it
 * names the original invoice, and reverses the full amount incl. VAT with no
 * fee. Null for a malformed row (the page then says it is unavailable).
 */
export function creditNoteView(note: BillingCreditNote | null, company: unknown) {
  if (!note || typeof note.number !== "string" || !note.number) return null;
  const amounts = [note.net_halalas, note.vat_halalas, note.total_halalas];
  if (note.currency !== "SAR" || !amounts.every(v => Number.isSafeInteger(v) && v >= 0) || note.total_halalas <= 0 || note.total_halalas !== note.net_halalas + note.vat_halalas) return null;
  return {
    title: "إشعار دائن",
    number: note.number,
    issuedAt: billingDateTimeAr(note.issued_at),
    testNotice: note.live === false ? "إشعار تجريبي — لم تُخصم أموال حقيقية ولم تُرد" : null,
    invoiceNumber: note.invoice_number,
    invoiceDate: billingDateTimeAr(note.invoice_issued_at),
    item: billingItemAr(note.item_id),
    billing: orderBillingAr(note.billing),
    reason: CREDIT_METHOD_AR[note.method] ?? "استرداد",
    net: formatHalalas(note.net_halalas),
    vatLabel: "ضريبة القيمة المضافة ١٥٪ المستردة",
    vat: formatHalalas(note.vat_halalas),
    total: formatHalalas(note.total_halalas),
    company: isBillingCompanyComplete(company) ? company as BillingCompany : null,
    companyNotice: "بيانات المنشأة غير مكتملة",
    feeNote: "يُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة دون خصم أي رسوم، وتحدد جهة إصدار البطاقة مدة ظهوره في حسابك.",
  };
}

// ── The GET /api/v1/billing answer, read in the browser (settings tabs) ──
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isTextOrNull = (v: unknown) => v === null || v === undefined || typeof v === "string";
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function isOrderRow(v: unknown): boolean {
  return isObject(v) && isText(v.id) && isText(v.item_id) && isText(v.status) && isCount(v.total_halalas)
    && isTextOrNull(v.receipt_number) && isTextOrNull(v.paid_at) && isTextOrNull(v.created_at);
}
function isCardRow(v: unknown): boolean {
  return isObject(v) && isText(v.id) && isText(v.status) && isTextOrNull(v.brand) && isTextOrNull(v.last_four);
}
function isLotRow(v: unknown): boolean {
  return isObject(v) && isText(v.id) && isCount(v.points_left) && isCount(v.points_total) && isText(v.expires_at);
}
/**
 * The billing answer as the settings tabs read it, or null when it is anything
 * else (an error body, a missing or non-integer balance, a malformed row). The
 * caller shows nothing (or its error state) for null — never a 0 balance or an
 * empty list it did not read.
 */
export function parseBillingResponse(body: unknown): BillingData | null {
  if (!isObject(body)) return null;
  const { orders, cards, lots, pointsBalance } = body;
  if (!isCount(pointsBalance)) return null;
  if (!Array.isArray(orders) || !orders.every(isOrderRow)) return null;
  if (!Array.isArray(cards) || !cards.every(isCardRow)) return null;
  if (!Array.isArray(lots) || !lots.every(isLotRow)) return null;
  return body as unknown as BillingData;
}
/** The balance and the nearest expiry among the lots that still hold points (null when none). */
export function pointsSummary(data: Pick<BillingData, "pointsBalance" | "lots">): { balance: number; nearestExpiry: string | null } {
  let nearest: string | null = null;
  let nearestAt = Number.POSITIVE_INFINITY;
  for (const lot of data.lots) {
    const at = Date.parse(lot.expires_at);
    if (lot.points_left > 0 && Number.isFinite(at) && at < nearestAt) { nearestAt = at; nearest = lot.expires_at; }
  }
  return { balance: data.pointsBalance, nearestExpiry: nearest };
}
const BRANDS_AR: Record<string, string> = { mada: "مدى", visa: "فيزا", master: "ماستركارد", mastercard: "ماستركارد", amex: "أمريكان إكسبريس" };
/** The card network in Arabic, or null for one we do not know. */
export function cardBrandAr(brand: unknown): string | null {
  if (typeof brand !== "string") return null;
  const key = brand.trim().toLowerCase();
  return Object.hasOwn(BRANDS_AR, key) ? BRANDS_AR[key] : null;
}
/** «مدى · بطاقة تنتهي بـ ٤٢٤٢» — the brand beside cardLabel, when the brand is known. */
export function cardTitleAr(card: Pick<BillingCard, "brand" | "last_four">): string {
  const brand = cardBrandAr(card.brand);
  return brand ? `${brand} · ${cardLabel(card.last_four)}` : cardLabel(card.last_four);
}
