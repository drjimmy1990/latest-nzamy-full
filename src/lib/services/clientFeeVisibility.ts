/**
 * clientFeeVisibility.ts — who may see (and write) the fee fields of a client
 * card (`lawyer_clients.fee_total_sar` / `fee_paid_sar`). Owner ticket S3.
 *
 * RLS lets every active member of a firm read the firm's client cards, and the
 * card carries the agreed fee. The fee is the partners' and the finance
 * manager's business, not the whole office's:
 *   - a card the caller owns: always (he wrote the fee);
 *   - a firm card: only when the caller's role in THAT firm is one of
 *     FEE_VISIBLE_FIRM_ROLES;
 *   - anything else (no role known for that firm, a failed membership read):
 *     hidden. Deny by default.
 * A card with no firm that the caller does not own is not readable through RLS
 * at all, so it is hidden here too rather than guessed at.
 *
 * Pure (no imports), so `node --test` loads it directly.
 */

/** Firm roles that see colleagues' client fees (ticket S3: partners + finance manager). */
export const FEE_VISIBLE_FIRM_ROLES: readonly string[] = ["managing_partner", "partner", "finance_manager"];

export interface FeeCard {
  owner_user_id: string;
  firm_id: string | null;
}

/**
 * @param firmRoles the caller's ACTIVE firm roles, firm id → role. The firm
 *   owner counts as managing_partner (resolveCallerFirm does the same).
 */
export function canSeeClientFees(uid: string, card: FeeCard, firmRoles: ReadonlyMap<string, string>): boolean {
  if (card.owner_user_id === uid) return true;
  if (!card.firm_id) return false;
  const role = firmRoles.get(card.firm_id);
  return role !== undefined && FEE_VISIBLE_FIRM_ROLES.includes(role);
}

/** The DTO with both fee fields set to null when the caller may not see them. */
export function withFeesVisibleTo<T extends { feeTotalSar: number | null; feePaidSar: number | null }>(
  dto: T,
  visible: boolean,
): T {
  return visible ? dto : { ...dto, feeTotalSar: null, feePaidSar: null };
}

/**
 * O1 (20261201_10): the session no longer reads the two fee columns of
 * `lawyer_clients`. The fees come from `public.lawyer_client_fees(ids)`, which
 * applies the same rule as canSeeClientFees in SQL and simply leaves out the
 * cards the caller may not see.
 */
export interface CardFees {
  fee_total_sar: number | null;
  fee_paid_sar: number | null;
}

/** The ids per call of lawyer_client_fees (the SQL refuses more than 1000). */
export const CARD_FEES_CHUNK = 500;

function feeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** RPC / fallback rows → id → fees. Rows without an id are dropped. */
export function parseCardFeeRows(rows: unknown): Map<string, CardFees> {
  const map = new Map<string, CardFees>();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    map.set(r.id, { fee_total_sar: feeNumber(r.fee_total_sar), fee_paid_sar: feeNumber(r.fee_paid_sar) });
  }
  return map;
}

/**
 * Each card with its fees from the map, or both null when the card is not in
 * it (not visible to the caller) or the fees could not be read (`fees` null).
 */
export function withCardFees<T extends { id: string }>(
  rows: readonly T[],
  fees: ReadonlyMap<string, CardFees> | null,
): Array<T & CardFees> {
  return rows.map((row) => {
    const f = fees?.get(row.id);
    return { ...row, fee_total_sar: f?.fee_total_sar ?? null, fee_paid_sar: f?.fee_paid_sar ?? null };
  });
}

/** The PostgREST / Postgres codes for "lawyer_client_fees is not there yet" (before 20261201_10). */
export function isMissingFeeFunction(code: unknown): boolean {
  return code === "PGRST202" || code === "42883";
}

/**
 * Builds the firm id → role map from the caller's active `firm_members` rows
 * and the firms he owns. An owned firm is managing_partner whatever its
 * member row says.
 */
export function firmRoleMap(
  memberships: ReadonlyArray<{ firm_id: string | null; role: string | null }>,
  ownedFirmIds: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of memberships) {
    if (m.firm_id && m.role) map.set(m.firm_id, m.role);
  }
  for (const id of ownedFirmIds) map.set(id, "managing_partner");
  return map;
}
