/**
 * freeActivationView.ts — the free-activation receipt of a redeemed free-plan
 * or points code (batch l16; owner س٢١٣ ب: «قيد 3 أسطر: السعر الكامل ← خصم
 * 100% ← صافي 0، وإيصال تفعيل مجاني»), and the «تفعيل كود» box's answers.
 * The row is the user's own coupon_redemptions row (20261206_30), read
 * through his RLS client. No VAT line: nothing was charged.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { formatHalalas, orderLabelAr } from "./catalog.ts";
import { BILLING_LABEL_AR, type Billing } from "../pricing/priceBook.ts";

export interface FreeActivationRow {
  id: string;
  coupon_code: string;
  kind: string;
  item_id: string | null;
  billing: string | null;
  points: number | null;
  list_net_halalas: number;
  discount_halalas: number;
  net_halalas: number;
  vat_halalas: number;
  status: string;
  receipt_number: string;
  created_at: string;
  granted_at: string | null;
}

export const FREE_ACTIVATION_TITLE_AR = "إيصال تفعيل مجاني";
export const FREE_ACTIVATION_NOTE_AR = "تفعيل مجاني بكود منحة: لم يُدفع أي مبلغ، فلا تُستحق عليه ضريبة.";

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const digits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/[0-9]/g, (d) => ARABIC[Number(d)]);

/** «إدارة المكتب — سنوي» / «٥٠٠ نقطة». */
export function freeActivationItemAr(row: Pick<FreeActivationRow, "kind" | "item_id" | "billing" | "points">): string {
  if (row.kind === "points") return `${digits(row.points ?? 0)} نقطة`;
  const label = (row.item_id && orderLabelAr(row.item_id)) || "باقة";
  const billing = row.billing && Object.hasOwn(BILLING_LABEL_AR, row.billing) ? BILLING_LABEL_AR[row.billing as Billing] : null;
  return billing ? `${label} — ${billing}` : label;
}

/** The receipt, or null for a row that is not a granted full discount (the page then says it is unavailable). */
export function freeActivationView(row: FreeActivationRow | null) {
  if (!row || row.status !== "granted" || !row.receipt_number) return null;
  if (!Number.isSafeInteger(row.list_net_halalas) || row.list_net_halalas <= 0) return null;
  if (row.discount_halalas !== row.list_net_halalas || row.net_halalas !== 0 || row.vat_halalas !== 0) return null;
  const full = formatHalalas(row.list_net_halalas);
  return {
    title: FREE_ACTIVATION_TITLE_AR,
    number: row.receipt_number,
    issuedAt: row.granted_at ?? row.created_at,
    item: freeActivationItemAr(row),
    code: row.coupon_code,
    lines: [
      ["السعر الكامل", full],
      ["خصم ١٠٠٪ بكود المنحة", `− ${full}`],
      ["الصافي المدفوع", formatHalalas(0)],
    ] as Array<[string, string]>,
    note: FREE_ACTIVATION_NOTE_AR,
  };
}

/** The box's confirmation for a granted redemption. */
export function redeemDoneAr(body: { kind: string; points?: number; labelAr?: string; billing?: string; receiptNumber?: string }): string {
  const ref = body.receiptNumber ? ` — رقم الإيصال ${body.receiptNumber}` : "";
  if (body.kind === "points") return `أُضيفت ${digits(body.points ?? 0)} نقطة إلى رصيدك${ref}.`;
  const billing = body.billing && Object.hasOwn(BILLING_LABEL_AR, body.billing) ? ` (${BILLING_LABEL_AR[body.billing as Billing]})` : "";
  return `فُعّلت باقة «${body.labelAr ?? "الباقة"}»${billing} مجاناً${ref}.`;
}

/** The coupon_redemptions columns a user may read (20261206_30's column grants). */
export const FREE_ACTIVATION_COLUMNS =
  "id, coupon_code, kind, item_id, billing, points, list_net_halalas, discount_halalas, net_halalas, vat_halalas, status, receipt_number, created_at, granted_at";
