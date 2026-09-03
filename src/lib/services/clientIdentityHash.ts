/**
 * clientIdentityHash.ts — SERVER ONLY (imports node:crypto).
 * ─────────────────────────────────────────────────────────
 * The only place a national ID becomes the `national_id_hash` the database
 * stores. SHA-256 over the normalised digits, hex, lower-case — matching the
 * column CHECK (`^[0-9a-f]{64}$`). The raw number is never persisted and
 * never returned by any route.
 *
 * Unsalted on purpose: the hash's job is equality (the same person filed
 * twice inside one firm; a conflict-check hit), which a per-row salt would
 * defeat. A 10-digit ID space is small, so this is NOT a secrecy control —
 * the secrecy control is that the hash is behind the same RLS as the card
 * and is never exposed to the client (`hasNationalId: boolean` only).
 */

import { createHash } from "node:crypto";
import { normalizeNationalId, normalizeCommercialRegister } from "./clientIdentityRules.ts";

export function hashNationalId(raw: string): string | null {
  const n = normalizeNationalId(raw);
  if (!n) return null;
  return createHash("sha256").update(n, "utf8").digest("hex");
}

/** The commercial register is stored in the clear (it is public information), but normalised so uniqueness compares like with like. */
export function normalizedCommercialRegister(raw: string): string | null {
  const n = normalizeCommercialRegister(raw);
  return n || null;
}
