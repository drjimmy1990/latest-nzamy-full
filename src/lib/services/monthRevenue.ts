/**
 * monthRevenue.ts — «الإيرادات هذا الشهر» on the lawyer home, from money
 * actually collected.
 *
 * CODE-F15 / LAW-DETAIL-010 (owner code review 2026-10-30): the tile summed
 * `payments` rows with status `paid` CREATED this month. So an invoice issued
 * in September and collected in October was missing from October, a partial
 * collection counted nothing until the last riyal, and issuing an invoice
 * that was paid at once moved revenue to the issue date.
 *
 * Now, for the office's own invoices (`payments.metadata.invoice = true`):
 *   • collected   — every collection whose date falls in Riyadh's current
 *                   month: one row per collection in `invoice_collections`
 *                   (`collected_at`, written by record_invoice_collection,
 *                   lawyer-finance branch 20261030_10). An invoice with no
 *                   ledger rows — collected before the ledger existed, or the
 *                   ledger not deployed yet — falls back to the single
 *                   collection the old PATCH kept (`metadata.paidAt` /
 *                   `paidAmount`). A paid invoice with no collection date at
 *                   all is NOT counted: its date is unknown, and the issue
 *                   date is exactly the wrong answer this replaces.
 *   • issued      — invoice amounts issued this Riyadh month.
 *   • outstanding — what is still owed on every open invoice, whenever issued.
 *
 * Pure — `node --test` loads it.
 */

export interface InvoicePaymentRow {
  id: string;
  amount: number | string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CollectionRow {
  payment_id: string;
  amount: number | string | null;
  collected_at: string;
}

export interface MonthRevenue {
  collected: number;
  issued: number;
  outstanding: number;
  /** "ledger" when invoice_collections was read; "legacy" when it does not exist yet. */
  basis: "ledger" | "legacy";
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const cents = (n: number) => Math.round(n * 100);

/** [start, end) of Riyadh's month containing `riyadhDay` ("YYYY-MM-DD"), as epoch ms. Saudi Arabia has no DST. */
export function riyadhMonthBounds(riyadhDay: string): { start: number; end: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(riyadhDay);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  const start = Date.parse(`${m[1]}-${m[2]}-01T00:00:00+03:00`);
  const end = Date.parse(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+03:00`);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

export function isOfficeInvoice(row: { metadata: Record<string, unknown> | null }): boolean {
  return row.metadata?.invoice === true;
}

export function computeMonthRevenue(
  invoices: readonly InvoicePaymentRow[],
  collections: readonly CollectionRow[] | null,
  month: { start: number; end: number },
): MonthRevenue {
  const inMonth = (iso: unknown) => {
    const t = typeof iso === "string" ? Date.parse(iso) : NaN;
    return Number.isFinite(t) && t >= month.start && t < month.end;
  };
  const live = invoices.filter((r) => r.status === "requires_payment" || r.status === "paid");

  let issued = 0;
  let outstanding = 0;
  for (const r of live) {
    const total = toNum(r.amount);
    if (inMonth(r.created_at)) issued += cents(total);
    if (r.status === "requires_payment") {
      outstanding += Math.max(0, cents(total) - cents(toNum(r.metadata?.paidAmount)));
    }
  }

  let collected = 0;
  const withLedger = new Set<string>();
  if (collections) {
    for (const c of collections) {
      withLedger.add(c.payment_id);
      if (inMonth(c.collected_at)) collected += cents(toNum(c.amount));
    }
  }
  for (const r of live) {
    if (withLedger.has(r.id)) continue;
    const paidAt = r.metadata?.paidAt;
    if (!inMonth(paidAt)) continue;
    const paidAmount = r.metadata?.paidAmount;
    collected += cents(typeof paidAmount === "number" || typeof paidAmount === "string" ? toNum(paidAmount) : r.status === "paid" ? toNum(r.amount) : 0);
  }

  return {
    collected: collected / 100,
    issued: issued / 100,
    outstanding: outstanding / 100,
    basis: collections ? "ledger" : "legacy",
  };
}

/** PostgREST / Postgres codes for "that table is not there" — the ledger migration not run yet. */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
