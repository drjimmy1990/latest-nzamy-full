/**
 * shareSecrets.ts — SERVER ONLY (imports node:crypto).
 * ─────────────────────────────────────────────────────────
 * Owner item 174 — the share-token and passcode generator for
 * `document_shares`. Pure functions, no Supabase, no request/response — kept
 * separate from the routes so they can be unit-tested directly and so
 * verify/route.ts and share/route.ts hash the same way.
 *
 * `generateShareToken()`/`generatePasscode()` replace
 * useContractsState.generateShareLink's old `Math.random()` scheme (never
 * cryptographically strong, and it never persisted anywhere anyway).
 * `sha256Hex()` is what both the write side (POST /api/v1/share, which
 * stores only the hash) and the read side (verify/route.ts, which looks up
 * by hash and never by the plaintext token) call — one hashing rule instead
 * of two copies that could drift apart.
 */

import { randomBytes, randomInt, createHash } from "node:crypto";

/** 32 random bytes, hex-encoded (64 chars) — the share link's `/share/<token>` segment. */
export function generateShareToken(): string {
  return randomBytes(32).toString("hex");
}

/** A 6-digit passcode, each digit uniformly random via crypto.randomInt (not Math.random). */
export function generatePasscode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** SHA-256 of `value`, hex-encoded — the only form either persisted column stores. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
