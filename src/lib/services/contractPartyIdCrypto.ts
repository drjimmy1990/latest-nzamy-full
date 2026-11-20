/**
 * contractPartyIdCrypto.ts — SERVER ONLY (imports node:crypto). N01-5, owner ٢٤.
 * ─────────────────────────────────────────────────────────
 * The other party's national ID on a contract is kept ENCRYPTED, so that the
 * contract's author can read it back when he writes the contract — unlike the
 * client card, where the number is only ever hashed (clientIdentityHash.ts).
 *
 *   cipher   AES-256-GCM, a fresh 12-byte IV per write, 16-byte tag;
 *   AAD      "nzamy:contract-party-id:v1:<contract id>" — a ciphertext copied
 *            onto another contract does not decrypt;
 *   format   "v1:<iv b64>:<tag b64>:<data b64>" (the column CHECK in
 *            20261201_40 accepts exactly this shape);
 *   key      env CONTRACT_PARTY_ID_KEY: 32 bytes, as 64 hex characters or as
 *            base64. Generate one with
 *              node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *            It never reaches the database. Losing it makes every stored
 *            number unreadable (the hash still matches).
 *
 * Without a usable key the routes store the SHA-256 only (today's rule for
 * national IDs) and say the number cannot be shown — never the plain number.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CONTRACT_PARTY_ID_KEY_ENV = "CONTRACT_PARTY_ID_KEY";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function aad(contractId: string): Buffer {
  return Buffer.from(`nzamy:contract-party-id:${VERSION}:${contractId}`, "utf8");
}

/** The raw env value → a 32-byte key, or null when absent or malformed. */
export function parsePartyIdKey(raw: string | undefined | null): Buffer | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    const b = Buffer.from(v, "base64");
    if (b.length === 32) return b;
  }
  return null;
}

/** The key from the environment (null → hash-only mode). */
export function readPartyIdKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  return parsePartyIdKey(env[CONTRACT_PARTY_ID_KEY_ENV]);
}

export function encryptPartyId(plain: string, contractId: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("contract party id key must be 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(contractId));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

/** The plain number, or null when the value is malformed, the key is wrong or the row was moved. */
export function decryptPartyId(stored: string, contractId: string, key: Buffer): string | null {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION || key.length !== 32) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const data = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(contractId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
