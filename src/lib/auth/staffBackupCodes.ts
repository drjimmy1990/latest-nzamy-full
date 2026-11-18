/**
 * staffBackupCodes.ts — the 10 one-time backup codes of a staff account's
 * two-step sign-in (owner item 18, batch l7). Server only.
 *
 * GoTrue v2.196 has no recovery codes of its own, and nothing can mint an
 * aal2 session except a factor GoTrue knows. So a backup code does not sign
 * anyone in: it RESETS the lost authenticator (the server deletes the
 * account's TOTP factors through the GoTrue admin API) and the staff member
 * enrols a new one on the spot, which ends in a real aal2 session.
 *
 *   - 10 codes, 16 characters each from a 32-letter alphabet (80 bits),
 *     shown ONCE as XXXX-XXXX-XXXX-XXXX.
 *   - Stored only as SHA-256 of a per-user, versioned string
 *     (public.admin_mfa_backup_codes, service role only, 20261127_50).
 *   - Used once: public.admin_mfa_backup_code_consume marks used_at in one
 *     UPDATE … WHERE used_at IS NULL, so two requests cannot spend one code.
 *   - Regenerating replaces the whole set.
 *
 * Relative imports only: `node --test` loads it (staffBackupCodes.test.ts).
 */
import { createHash, randomBytes } from "node:crypto";

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 16;
/** No I, O, 0 or 1: nothing that reads as another character. 32 symbols. */
export const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** One code, grouped for reading: XXXX-XXXX-XXXX-XXXX. */
export function generateBackupCode(random: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  const bytes = random(BACKUP_CODE_LENGTH);
  let raw = "";
  // 256 is a multiple of 32, so `byte % 32` is uniform.
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) raw += BACKUP_CODE_ALPHABET[bytes[i] % 32];
  return raw.match(/.{1,4}/g)!.join("-");
}

/** A fresh set of BACKUP_CODE_COUNT distinct codes. */
export function generateBackupCodes(random?: (n: number) => Uint8Array): string[] {
  const set = new Set<string>();
  while (set.size < BACKUP_CODE_COUNT) set.add(generateBackupCode(random));
  return [...set];
}

/**
 * What the person typed, reduced to the 16 code characters: Arabic-Indic
 * digits to Latin, upper case, spaces and dashes dropped. null when what is
 * left cannot be a code (wrong length or a character outside the alphabet).
 */
export function normalizeBackupCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const latin = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
  if (latin.length !== BACKUP_CODE_LENGTH) return null;
  for (const ch of latin) if (!BACKUP_CODE_ALPHABET.includes(ch)) return null;
  return latin;
}

/** The stored hash: per user and versioned, so equal codes of two users differ. */
export function hashBackupCode(userId: string, normalizedCode: string): string {
  return createHash("sha256").update(`nzamy-admin-backup:v1:${userId}:${normalizedCode}`).digest("hex");
}
