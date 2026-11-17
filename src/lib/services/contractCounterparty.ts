/**
 * contractCounterparty.ts — the contact of «الطرف الآخر» on a contract
 * (owner package 13-Nov, N01-5): a phone and a commercial register / 700
 * unified number, kept in `contracts.metadata.counterparty` (the column exists
 * since 20260518, so no migration and no change to any contract read).
 *
 * No individual national ID is stored here: the platform keeps a national ID
 * only hashed, on the client card (Phase 2 DECISION 2; contract_parties has
 * the same rule). The field takes a 10-digit commercial register or a
 * 700-number — what the card itself stores raw for a company.
 *
 * Pure (shared by the contracts routes and their tests).
 */
import { normalizeDigits, isValidCommercialRegister, isValidUnifiedNumber700 } from "./clientIdentityRules.ts";
import { checkSaudiPhone } from "./contactFieldRules.ts";

export interface CounterpartyContact {
  phone: string | null;
  idNo: string | null;
}

export const COUNTERPARTY_ID_INVALID_AR =
  "رقم السجل التجاري أو الرقم الموحّد للطرف الآخر غير صالح — ١٠ أرقام.";

/** The contact a contract row carries (absent / malformed metadata → nulls). */
export function readCounterparty(metadata: unknown): CounterpartyContact {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).counterparty : null;
  const c = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
  return {
    phone: typeof c.phone === "string" && c.phone ? c.phone : null,
    idNo: typeof c.idNo === "string" && c.idNo ? c.idNo : null,
  };
}

/**
 * Body → the values to store. A key left out of the body is `undefined` (keep
 * what is stored); an empty string or null clears it.
 */
export function parseCounterpartyContact(body: {
  counterpartyPhone?: unknown;
  counterpartyIdNo?: unknown;
}):
  | { ok: true; phone: string | null | undefined; idNo: string | null | undefined }
  | { ok: false; error: string } {
  let phone: string | null | undefined;
  if (body.counterpartyPhone !== undefined) {
    const check = checkSaudiPhone(body.counterpartyPhone, { allowUnified: true });
    if (!check.ok) return { ok: false, error: check.error };
    phone = check.value;
  }
  let idNo: string | null | undefined;
  if (body.counterpartyIdNo !== undefined) {
    const raw = body.counterpartyIdNo;
    if (raw === null || raw === "") {
      idNo = null;
    } else if (typeof raw !== "string") {
      return { ok: false, error: COUNTERPARTY_ID_INVALID_AR };
    } else {
      const digits = normalizeDigits(raw).replace(/\D/g, "");
      if (!digits) idNo = null;
      else if (isValidCommercialRegister(digits) || isValidUnifiedNumber700(digits)) idNo = digits;
      else return { ok: false, error: COUNTERPARTY_ID_INVALID_AR };
    }
  }
  return { ok: true, phone, idNo };
}

/**
 * The metadata to write, or null when nothing changes. Every other metadata
 * key is kept as it is.
 */
export function mergeCounterpartyMetadata(
  current: unknown,
  next: { phone: string | null | undefined; idNo: string | null | undefined },
): Record<string, unknown> | null {
  if (next.phone === undefined && next.idNo === undefined) return null;
  const base = current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  const was = readCounterparty(base);
  const merged: CounterpartyContact = {
    phone: next.phone !== undefined ? next.phone : was.phone,
    idNo: next.idNo !== undefined ? next.idNo : was.idNo,
  };
  if (merged.phone === was.phone && merged.idNo === was.idNo && "counterparty" in base) return null;
  if (!merged.phone && !merged.idNo) {
    if (!("counterparty" in base)) return null;
    delete base.counterparty;
    return base;
  }
  return { ...base, counterparty: { phone: merged.phone, idNo: merged.idNo } };
}
