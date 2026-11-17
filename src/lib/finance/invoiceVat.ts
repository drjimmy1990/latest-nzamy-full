/**
 * invoiceVat.ts — VAT on an office fee statement (owner TODO 17-Nov N01-11,
 * owner decision Q484 — final): 15% ONLY when the issuer (the lawyer, or the
 * firm he is an active member of) has a VAT registration number; otherwise 0%
 * and the statement says «غير خاضع لضريبة القيمة المضافة».
 *
 * The decision itself is made in SQL, at issue time, by
 * public.create_lawyer_invoice_v3 (supabase/migrations/20261126_30_invoice_vat_void.sql),
 * which snapshots it into payments.metadata.vat. This file is the SAME
 * arithmetic for the form's preview and the print view, and the reader of the
 * snapshot. invoiceVat.test.ts and supabase/tests/rls/invoice_vat_void.test.sql
 * pin the same rounding cases on both sides.
 *
 * Money is in halalas (integers). VAT = subtotal × 15%, rounded HALF-UP to the
 * halala: floor((subtotal × 1500 + 5000) / 10000). Exact in doubles for every
 * subtotal up to the numeric(12,2) ceiling (1.5e15 < 2^53).
 *
 * Pure — `node --test` runs it.
 */

/** 15% in basis points. */
export const VAT_RATE_BP = 1500;
/** numeric(12,2): at most 9,999,999,999.99 riyals. */
export const MAX_INVOICE_HALALAS = 999_999_999_999;

export const VAT_NOT_SUBJECT_AR = "غير خاضع لضريبة القيمة المضافة";
export const VAT_LINE_AR = "ضريبة القيمة المضافة (١٥٪)";
export const VAT_NONE_LINE_AR = "ضريبة القيمة المضافة (٠٪)";
/** Statements issued before 20261126_30 carry no VAT snapshot: no tax line, no claim. */
export const VAT_LEGACY_AR = "صدر قبل احتساب ضريبة القيمة المضافة على بيانات الأتعاب";

export type IssuerVatState = "registered" | "not_registered" | "invalid";

/** VAT on a subtotal at a rate, half-up per halala. */
export function vatHalalas(subtotalHalalas: number, rateBp: number): number {
  if (!Number.isSafeInteger(subtotalHalalas) || subtotalHalalas < 0) {
    throw new RangeError("subtotal must be a non-negative whole number of halalas");
  }
  if (rateBp !== 0 && rateBp !== VAT_RATE_BP) throw new RangeError("rate must be 0 or 1500 bp");
  return Math.floor((subtotalHalalas * rateBp + 5000) / 10000);
}

export interface InvoiceVatAmounts {
  rateBp: 0 | 1500;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

/** The three amounts of a statement whose issuer is / is not VAT-registered. */
export function computeInvoiceVat(subtotalHalalas: number, registered: boolean): InvoiceVatAmounts {
  const rateBp = registered ? VAT_RATE_BP : 0;
  const vat = vatHalalas(subtotalHalalas, rateBp);
  return { rateBp, subtotalHalalas, vatHalalas: vat, totalHalalas: subtotalHalalas + vat };
}

/** Arabic-Indic / Persian digits → ASCII; spaces and dashes dropped; "" → null. Same as SQL normalize_vat_number. */
export function normalizeVatNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const out = toAsciiDigits(raw).replace(/[\s-]/g, "");
  return out === "" ? null : out;
}

/** Arabic-Indic and Persian digits → ASCII; nothing else changes. */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A Saudi VAT registration number: 15 digits, first and last 3. */
export function isSaudiVatNumber(value: string | null): value is string {
  return value !== null && /^3\d{13}3$/.test(value);
}

/** What metadata.vat says about an issued statement (null: issued before 20261126_30). */
export interface InvoiceVatSnapshot {
  rateBp: 0 | 1500;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  vatNumber: string | null;
  scope: "lawyer" | "firm";
  issuerName: string;
}

const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function readInvoiceVat(metadata: unknown): InvoiceVatSnapshot | null {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  const v = meta?.vat && typeof meta.vat === "object" ? (meta.vat as Record<string, unknown>) : null;
  if (!v) return null;
  const rate = v.rate_bp;
  if ((rate !== 0 && rate !== VAT_RATE_BP) || !isWhole(v.subtotal_halalas) || !isWhole(v.vat_halalas) || !isWhole(v.total_halalas)) {
    return null;
  }
  if (v.subtotal_halalas + v.vat_halalas !== v.total_halalas) return null;
  return {
    rateBp: rate,
    subtotalHalalas: v.subtotal_halalas,
    vatHalalas: v.vat_halalas,
    totalHalalas: v.total_halalas,
    vatNumber: typeof v.vat_number === "string" && isSaudiVatNumber(v.vat_number) ? v.vat_number : null,
    scope: v.scope === "firm" ? "firm" : "lawyer",
    issuerName: typeof v.issuer_name === "string" ? v.issuer_name : "",
  };
}

/** «١٬١٥٠٫٠٠ ر.س» — two decimals always, Arabic digits. */
export function formatSar(halalas: number): string {
  return `${(halalas / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

/**
 * Riyals typed in a form → halalas, or null. Two decimals at most (the
 * collection form's rule): «1150.5» → 115050, «1.005» → null.
 */
export function riyalsToHalalas(text: string): number | null {
  const t = toAsciiDigits(text).trim().replace(/٫/g, ".").replace(/[,٬]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const h = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(h) && h > 0 && h <= MAX_INVOICE_HALALAS ? h : null;
}
