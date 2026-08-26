/**
 * The receipt serial — owner item ١٥, «سند قبض» with a running number.
 *
 * `REC-2026-00042`. The number is NOT computed here and never could be: a
 * serial handed to a client has to be unique across every receipt the office
 * has ever issued, and the only thing in this system that can promise that is
 * the database. `public.receipts.serial` is a STORED GENERATED column over the
 * table's own bigserial (see 20260826_receipts.sql), so two receipts issued in
 * the same millisecond by two admins get different numbers by construction —
 * no sequence function, no read-then-write, no race.
 *
 * What lives here is the FORMAT: how that number reads, and how to recognise
 * one someone has typed back at you. Both sides in one module so they cannot
 * drift, which is the failure the order reference already had three times over.
 */
const PREFIX = "REC";
const DIGITS = 5;

/** Mirror of the SQL expression in 20260826_receipts.sql. Used for display
 *  from a raw id (a preview before insert), never to decide the stored value. */
export function formatReceiptSerial(year: number, id: number): string {
  if (!Number.isFinite(year) || !Number.isFinite(id) || id < 0) return "";
  return `${PREFIX}-${Math.floor(year)}-${String(Math.floor(id)).padStart(DIGITS, "0")}`;
}

export interface ParsedReceiptSerial { year: number; number: number }

/**
 * Read a serial a human typed. Tolerates lowercase and surrounding space,
 * because those are what a paste actually looks like; rejects anything else
 * rather than guessing, since a mis-parsed serial silently points at the wrong
 * receipt.
 *
 * A number longer than the padding is accepted: the padding is a minimum
 * width, not a maximum, and the 100,000th receipt must not stop parsing.
 */
export function parseReceiptSerial(raw: string | null | undefined): ParsedReceiptSerial | null {
  if (typeof raw !== "string") return null;
  const m = /^REC-(\d{4})-(\d{1,})$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  const year = Number(m[1]);
  const number = Number(m[2]);
  // A four-digit year is enforced by the pattern; a zero one is still not a
  // year anybody issued a receipt in.
  if (!year || !Number.isFinite(number)) return null;
  return { year, number };
}

export function isReceiptSerial(raw: string | null | undefined): boolean {
  return parseReceiptSerial(raw) !== null;
}

/**
 * How the money arrived. Deliberately closed: «other» exists so nothing is
 * forced into a wrong bucket, and it is the only escape — a free-text method
 * would make the finance report unsummarisable, which is the whole point of
 * recording it.
 *
 * No card/online method is listed, and that is not an oversight: there is no
 * payment provider connected, so a receipt claiming a card payment would be
 * describing something that cannot have happened.
 */
export const RECEIPT_METHODS = [
  { id: "bank_transfer", label: "تحويل بنكي" },
  { id: "cash",          label: "نقداً" },
  { id: "cheque",        label: "شيك" },
  { id: "other",         label: "أخرى" },
] as const;

export type ReceiptMethod = (typeof RECEIPT_METHODS)[number]["id"];

export function isReceiptMethod(raw: unknown): raw is ReceiptMethod {
  return typeof raw === "string" && RECEIPT_METHODS.some((m) => m.id === raw);
}

export function receiptMethodLabel(raw: unknown): string {
  return RECEIPT_METHODS.find((m) => m.id === raw)?.label ?? (typeof raw === "string" ? raw : "");
}
