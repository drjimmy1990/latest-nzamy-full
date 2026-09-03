/**
 * clientIdentityRules.ts
 * ─────────────────────────────────────────────────────────
 * Pure validation for a client card's identity fields (Phase 2, item 80).
 * No I/O, no hashing (that is clientIdentityHash.ts, server-only) — so the
 * modal and the API route validate with the same functions.
 *
 * `CLIENT_FLAGS` mirrors the CHECK on public.lawyer_clients.flags exactly —
 * «bad» and «late_pay» are absent on purpose (migration 20260903_phase2,
 * DECISION 2).
 */

export type ClientType = "individual" | "company";
export type ClientFlag = "vip" | "new" | "loyal" | "urgent" | "corporate" | "inactive";
export type ClientStatus = "active" | "inactive" | "archived";

export const CLIENT_FLAGS: readonly ClientFlag[] = ["vip", "new", "loyal", "urgent", "corporate", "inactive"];

export function isClientFlag(value: unknown): value is ClientFlag {
  return typeof value === "string" && (CLIENT_FLAGS as readonly string[]).includes(value);
}

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII; everything else kept. */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
              .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/** Digits only, Arabic-Indic normalised. "" when nothing is left. */
export function normalizeNationalId(input: string): string {
  return normalizeDigits(input).replace(/\D/g, "");
}

/**
 * Saudi national ID / iqama: 10 digits, first digit 1 (citizen) or 2
 * (resident). No checksum here — a typo is refused by length/prefix only;
 * the point of this check is to keep garbage out of the uniqueness index,
 * not to authenticate a person.
 */
export function isValidNationalId(input: string): boolean {
  const n = normalizeNationalId(input);
  return /^[12]\d{9}$/.test(n);
}

/** Commercial register: 10 digits (SR) — normalised the same way. */
export function normalizeCommercialRegister(input: string): string {
  return normalizeDigits(input).replace(/\D/g, "");
}
export function isValidCommercialRegister(input: string): boolean {
  return /^\d{10}$/.test(normalizeCommercialRegister(input));
}

/** Tax number (VAT): 15 digits starting with 3. */
export function isValidTaxNumber(input: string): boolean {
  return /^3\d{14}$/.test(normalizeDigits(input).replace(/\D/g, ""));
}

/** Unified national number for establishments: 10 digits starting with 7. */
export function isValidUnifiedNumber700(input: string): boolean {
  return /^7\d{9}$/.test(normalizeDigits(input).replace(/\D/g, ""));
}

/** A money figure the table accepts: finite and not negative. */
export function isMoneyFigure(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isRatingFigure(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * The one rule the fee pair must satisfy, shared by modal and route:
 * an advance needs a positive total, and cannot exceed it.
 * Returns the Arabic message to show, or null when the pair is fine.
 */
export function feePairIssue(total: number | null | undefined, paid: number | null | undefined): string | null {
  const hasTotal = total !== null && total !== undefined;
  const hasPaid = paid !== null && paid !== undefined;
  if (hasTotal && !isMoneyFigure(total)) return "إجمالي الأتعاب يجب أن يكون رقمًا غير سالب.";
  if (hasPaid && !isMoneyFigure(paid)) return "المبلغ المقدّم يجب أن يكون رقمًا غير سالب.";
  if (hasPaid && !(hasTotal && (total as number) > 0)) return "لا يمكن حفظ مبلغ مقدّم دون إجمالي أتعاب أكبر من صفر.";
  if (hasPaid && hasTotal && (paid as number) > (total as number)) return "المبلغ المقدّم لا يمكن أن يتجاوز إجمالي الأتعاب.";
  return null;
}
