/**
 * contractPartyId.ts — the pure half of the other party's national ID on a
 * contract (N01-5, owner ٢٤; route /api/v1/lawyer/contracts/[id]/party-id).
 *
 * Rules (owner ٢٤): stored encrypted, readable by the contract's AUTHOR only
 * (contracts.owner_user_id), and every read — and every refused read — is
 * logged. Lists and the contract DTO never carry it.
 *
 * Pure (one relative pure import), so `node --test` loads it.
 */
import { isValidNationalId, normalizeNationalId } from "./clientIdentityRules.ts";

export const PARTY_ID_AUTHOR_ONLY_AR = "رقم هوية الطرف الآخر يطّلع عليه كاتب العقد فقط.";
export const PARTY_ID_INVALID_AR = "رقم الهوية غير صالح — ١٠ أرقام تبدأ بـ ١ أو ٢.";
export const PARTY_ID_UNAVAILABLE_AR = "حفظ رقم هوية الطرف الآخر غير متاح بعد.";
export const PARTY_ID_LOG_FAILED_AR = "تعذّر تسجيل الاطلاع، فلم يُعرض الرقم. أعد المحاولة.";

/** The caller may touch the number only when he wrote the contract. */
export function isContractAuthor(contract: { owner_user_id: string | null } | null, uid: string): boolean {
  return !!contract && !!contract.owner_user_id && contract.owner_user_id === uid;
}

/** Body → the normalised 10-digit number, or an error. */
export function parsePartyNationalId(body: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).nationalId : undefined;
  if (typeof raw !== "string" || !isValidNationalId(raw)) return { ok: false, error: PARTY_ID_INVALID_AR };
  return { ok: true, value: normalizeNationalId(raw) };
}

/** Postgres / PostgREST codes that mean "the table is not there yet" (migration not run). */
export function isMissingTable(code: unknown): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST204";
}

/** The status the panel shows, without the number. */
export interface PartyIdStatus {
  stored: boolean;
  /** true when a ciphertext exists (it can be shown to the author with the key). */
  encrypted: boolean;
  /** whether this server can encrypt / decrypt now (the key is set). */
  keyConfigured: boolean;
}

export function partyIdStatus(row: { ciphertext: string | null } | null, keyConfigured: boolean): PartyIdStatus {
  return { stored: !!row, encrypted: !!row?.ciphertext, keyConfigured };
}

