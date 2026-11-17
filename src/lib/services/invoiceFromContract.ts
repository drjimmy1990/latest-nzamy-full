/**
 * invoiceFromContract.ts — N01-10 (owner package 13-Nov, partial): «إنشاء
 * فاتورة» from a contract opens the lawyer's invoice form with the contract,
 * its client card and an amount already filled.
 *
 * The link carries only the contract id and, from a payment-schedule row, that
 * row's amount — nothing personal (the finance page reads the client and the
 * title from the contract itself, through the contracts API).
 *
 * Pure: shared by ContractDetail (the link) and the finance page (the read).
 */

export const INVOICE_PAGE = "/dashboard/lawyer/finance";

export function invoiceFromContractHref(contractId: string, amountSar?: number | null): string {
  const params = new URLSearchParams({ newInvoice: "1", contractId });
  if (typeof amountSar === "number" && Number.isFinite(amountSar) && amountSar > 0) {
    params.set("amount", String(Math.round(amountSar * 100) / 100));
  }
  return `${INVOICE_PAGE}?${params.toString()}`;
}

/** The finance page's query string → what to open, or null when nothing was asked. */
export function readInvoiceIntent(search: string): { contractId: string; amountSar: number | null } | null {
  const params = new URLSearchParams(search);
  if (params.get("newInvoice") !== "1") return null;
  const contractId = (params.get("contractId") ?? "").trim();
  if (!contractId || contractId.length > 100) return null;
  const raw = params.get("amount");
  const n = raw === null ? NaN : Number(raw);
  return { contractId, amountSar: Number.isFinite(n) && n > 0 ? n : null };
}

/**
 * The amount the form starts with: the schedule row's when the link carried
 * one, otherwise the contract's value — or empty, never a guessed 0.
 */
export function initialInvoiceAmount(linkAmount: number | null, contractValueSar: number | null): string {
  if (linkAmount !== null) return String(linkAmount);
  if (contractValueSar !== null && contractValueSar > 0) return String(contractValueSar);
  return "";
}
