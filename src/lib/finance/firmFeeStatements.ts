/**
 * firmFeeStatements.ts — the firm-wide fee statements list (O23, batch l11).
 *
 * A fee statement is a `payments` row issued by create_lawyer_invoice_v2/v3
 * (metadata.invoice = true). Those functions stamp `payments.firm_id` with the
 * issuer's active firm. Migration 20261201_40 adds a SELECT policy so that the
 * firm OWNER and an ACTIVE managing partner or finance manager read every
 * statement carrying their firm's id — statements issued by any member. The
 * route GET /api/v1/firm/fee-statements reads them through that policy (the
 * RLS client), never through the service role.
 *
 * No figure is invented here: every number is a column of a real row. The
 * screen shows a row count, never a sum over one page presented as a total.
 *
 * Pure (no imports), so `node --test` loads it.
 */

/**
 * Firm roles that read every member's statements, besides the firm owner.
 * Held equal to public.firm_fee_statement_reader (20261201_40).
 */
export const FIRM_FEE_STATEMENT_ROLES: readonly string[] = ["managing_partner", "finance_manager"];

/** The caller's firm as resolveCallerFirm answers it. */
export function canReadFirmStatements(firm: { isOwner: boolean; role: string } | null): boolean {
  if (!firm) return false;
  return firm.isOwner || FIRM_FEE_STATEMENT_ROLES.includes(firm.role);
}

export const FIRM_STATEMENTS_DEFAULT_LIMIT = 50;
export const FIRM_STATEMENTS_MAX_LIMIT = 100;

/** Which statements the list shows. `open` = not paid yet (pending, part paid, failed). */
export const FIRM_STATEMENT_FILTERS = ["all", "open", "paid", "void"] as const;
export type FirmStatementFilter = (typeof FIRM_STATEMENT_FILTERS)[number];

/** payments.status values each filter reads. */
export const FIRM_STATEMENT_STATUSES: Record<FirmStatementFilter, readonly string[]> = {
  all: ["requires_payment", "paid", "failed", "void"],
  open: ["requires_payment", "failed"],
  paid: ["paid"],
  void: ["void"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FirmStatementsQuery {
  limit: number;
  offset: number;
  filter: FirmStatementFilter;
  /** One member's statements only (his user id), or null for every member. */
  issuer: string | null;
}

/** URL params → a bounded query. Anything malformed falls back to the default. */
export function parseFirmStatementsQuery(params: { get(name: string): string | null }): FirmStatementsQuery {
  const rawLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, FIRM_STATEMENTS_MAX_LIMIT)
    : FIRM_STATEMENTS_DEFAULT_LIMIT;
  const rawOffset = Number.parseInt(params.get("offset") ?? "", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.min(rawOffset, 100_000) : 0;
  const rawFilter = params.get("filter") ?? "all";
  const filter = (FIRM_STATEMENT_FILTERS as readonly string[]).includes(rawFilter)
    ? (rawFilter as FirmStatementFilter)
    : "all";
  const rawIssuer = (params.get("issuer") ?? "").trim();
  const issuer = UUID_RE.test(rawIssuer) ? rawIssuer.toLowerCase() : null;
  return { limit, offset, filter, issuer };
}

export type FirmStatementStatus = "paid" | "pending" | "partial" | "overdue" | "void";

export interface FirmStatementDto {
  id: string;
  issuerUserId: string | null;
  issuerName: string;
  client: string;
  description: string;
  caseTitle: string | null;
  totalFee: number;
  paidAmount: number;
  currency: string;
  status: FirmStatementStatus;
  createdAt: string | null;
  voidReason: string | null;
}

/** The status the list shows — the same rules the issuer's own page uses. */
export function firmStatementStatus(status: string, amount: number, paidAmount: number): FirmStatementStatus {
  if (status === "void") return "void";
  if (status === "paid") return "paid";
  if (status === "failed") return "overdue";
  return paidAmount > 0 && paidAmount < amount ? "partial" : "pending";
}

/**
 * payments row → the list row. `issuerNames` maps a user id to the display
 * name the server read for exactly the issuers on this page.
 */
export function mapFirmStatement(
  row: Record<string, unknown>,
  issuerNames: ReadonlyMap<string, string>,
): FirmStatementDto {
  const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const amount = Number(row.amount ?? 0);
  const status = String(row.status ?? "");
  const paidAmount = status === "paid" ? amount : Number(meta.paidAmount ?? 0) || 0;
  const issuerUserId = typeof row.owner_user_id === "string" ? row.owner_user_id : null;
  return {
    id: String(row.id),
    issuerUserId,
    issuerName: (issuerUserId && issuerNames.get(issuerUserId)) || "عضو في المكتب",
    client: typeof meta.client === "string" && meta.client ? meta.client : "عميل",
    description: typeof meta.description === "string" && meta.description ? meta.description : "أتعاب قانونية",
    caseTitle: typeof meta.caseTitle === "string" && meta.caseTitle ? meta.caseTitle : null,
    totalFee: Number.isFinite(amount) ? amount : 0,
    paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
    currency: typeof row.currency === "string" && row.currency ? row.currency : "SAR",
    status: firmStatementStatus(status, amount, paidAmount),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    voidReason: status === "void" && typeof row.void_reason === "string" ? row.void_reason : null,
  };
}

export const FIRM_STATEMENT_STATUS_AR: Record<FirmStatementStatus, string> = {
  paid: "مدفوع",
  pending: "بانتظار الدفع",
  partial: "مدفوع جزئياً",
  overdue: "متأخر",
  void: "ملغى",
};
