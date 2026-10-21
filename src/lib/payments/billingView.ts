import { formatHalalas, PAYABLE_ITEMS } from "./catalog.ts";
import { isBillingCompanyComplete } from "./moyasarConfig.ts";

export interface BillingOrder {
  id: string;
  item_id: string;
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
}
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
export function billingItemAr(itemId: string): string {
  return Object.hasOwn(PAYABLE_ITEMS, itemId) ? PAYABLE_ITEMS[itemId].labelAr : "عملية شراء";
}
export function orderStatusAr(status: string): string {
  const labels: Record<string, string> = { created: "قيد التجهيز", initiated: "بانتظار الدفع", paid: "مدفوع", failed: "لم يكتمل الدفع", refunded: "مسترد", voided: "ملغى لدى مزوّد الدفع", cancelled: "ملغى" };
  return Object.hasOwn(labels, status) ? labels[status] : "غير معروف";
}
export function billingDateAr(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(value));
}
/** Receipts use the paid order's amounts; current catalog prices never replace them. */
export function receiptView(order: BillingOrder, company: unknown) {
  if (!order.receipt_number || !order.paid_at || !["paid", "refunded", "voided"].includes(order.status)) return null;
  const amounts = [order.net_halalas, order.vat_halalas, order.total_halalas, order.refunded_halalas];
  if (order.currency !== "SAR" || !amounts.every(v => Number.isSafeInteger(v) && v >= 0) || order.total_halalas <= 0 || order.total_halalas !== order.net_halalas + order.vat_halalas || order.refunded_halalas > order.total_halalas) return null;
  return {
    title: "إيصال دفع",
    testNotice: order.live === false ? "إيصال تجريبي — لم تُخصم أموال حقيقية" : null,
    number: order.receipt_number,
    date: billingDateAr(order.paid_at),
    item: billingItemAr(order.item_id),
    net: formatHalalas(order.net_halalas),
    vat: formatHalalas(order.vat_halalas),
    total: formatHalalas(order.total_halalas),
    refunded: formatHalalas(order.refunded_halalas),
    status: orderStatusAr(order.status),
    lastFour: typeof order.last_four === "string" && /^\d{4}$/.test(order.last_four) ? arabicDigits(order.last_four) : null,
    company: isBillingCompanyComplete(company) ? company as BillingCompany : null,
    companyNotice: "بيانات المنشأة غير مكتملة",
    taxInvoiceNotice: "تصدر الفاتورة الضريبية الرسمية بشكل منفصل",
  };
}
