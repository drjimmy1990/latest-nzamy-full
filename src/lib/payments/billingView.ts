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
/** A receipt exists only for money actually taken: paid, or paid then refunded. A voided payment never settled. */
const RECEIPT_STATUSES: readonly string[] = ["paid", "refunded"];
export function hasReceipt(order: Pick<BillingOrder, "status" | "receipt_number">): boolean {
  return !!order.receipt_number && RECEIPT_STATUSES.includes(order.status);
}
/** Receipts use the paid order's amounts; current catalog prices never replace them. */
export function receiptView(order: BillingOrder, company: unknown) {
  if (!hasReceipt(order) || !order.paid_at) return null;
  const amounts = [order.net_halalas, order.vat_halalas, order.total_halalas, order.refunded_halalas];
  if (order.currency !== "SAR" || !amounts.every(v => Number.isSafeInteger(v) && v >= 0) || order.total_halalas <= 0 || order.total_halalas !== order.net_halalas + order.vat_halalas || order.refunded_halalas > order.total_halalas) return null;
  return {
    title: "إيصال دفع",
    testNotice: order.live === false ? "إيصال تجريبي — لم تُخصم أموال حقيقية" : null,
    number: order.receipt_number,
    date: billingDateAr(order.paid_at),
    item: billingItemAr(order.item_id),
    net: formatHalalas(order.net_halalas),
    vatLabel: "ضريبة القيمة المضافة ١٥٪",
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
