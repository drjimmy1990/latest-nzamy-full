/**
 * libraryInvitationRules.ts — the code format, generator and input rules for
 * `library.invitations` (20260626_legal_library_schema.sql), shared by the
 * redeem route and the admin create/list route so neither can drift from the
 * other's idea of what a valid code or a valid `maxUses`/`expiresAt` is.
 *
 * Pure: no I/O, no Supabase, no Next.js. Every branch is testable.
 *
 * `library.invitations` columns: id, code (unique), max_uses (default 1 —
 * the code's seats: how many accounts may use it), current_uses (default 0),
 * expires_at (nullable), grant_days (nullable, 20261103_11), created_by,
 * created_at, updated_at. There is no per-code tier — that is the *other*
 * invitation system (`public.invitations`, colleague referrals,
 * `/api/v1/invite/[code]/accept`). A library code always grants the legal
 * library — a `lib-invite` library grant, not a plan (owner answers
 * ٢٠١–٢٠٣) — for its own grant_days (owner q378), or
 * DEFAULT_INVITE_GRANT_DAYS when it has none.
 */

import { randomInt } from "node:crypto";
import { DEFAULT_INVITE_GRANT_DAYS } from "./libraryInvitationDisplay.ts";

// ── Code format ──────────────────────────────────────────────────────────

/**
 * Excludes 0/O and 1/I — the two pairs an admin reading a code aloud over the
 * phone, or a lawyer retyping one from a screenshot, actually confuses.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERATED_CODE_LENGTH = 10;

/** A code as typed by a user or entered by an admin: trimmed, upper-cased. */
export function normalizeInvitationCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 10 characters from CODE_ALPHABET. Uses `node:crypto`'s randomInt (CSPRNG),
 * not `Math.random()` — this is an access code, not a UI id.
 */
export function generateInvitationCode(): string {
  let code = "";
  for (let i = 0; i < GENERATED_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Format accepted for an admin-SUPPLIED code (the generator's own output
 * always satisfies this). Deliberately wider than the generator's alphabet —
 * 4 to 32 upper-case letters/digits — so an admin can type a memorable code
 * ("NZAMY2026") without being forced through the ambiguous-character filter
 * that only matters for a machine-generated one.
 */
const CODE_FORMAT = /^[A-Z0-9]{4,32}$/;

export function isValidInvitationCodeFormat(code: string): boolean {
  return CODE_FORMAT.test(code);
}

// ── Field validation (admin create) ────────────────────────────────────────

export type FieldValidation<T> = { ok: true; value: T } | { ok: false; error: string };

const MIN_MAX_USES = 1;
const MAX_MAX_USES = 1000;

/** `maxUses`: required, integer, 1..1000 — matches the DB's own `default 1`. */
export function validateMaxUses(raw: unknown): FieldValidation<number> {
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return { ok: false, error: "عدد المقاعد يجب أن يكون عدداً صحيحاً" };
  }
  if (raw < MIN_MAX_USES || raw > MAX_MAX_USES) {
    return {
      ok: false,
      error: `عدد المقاعد يجب أن يكون بين ${MIN_MAX_USES} و${MAX_MAX_USES}`,
    };
  }
  return { ok: true, value: raw };
}

// The length of a code without its own grant_days (owner ٢٠١–٢٠٣). Defined in
// the pure display module so the admin page (a client component, which cannot
// import this node:crypto module) reads the same constant.
export { DEFAULT_INVITE_GRANT_DAYS };

const MIN_GRANT_DAYS = 1;
/** grantLibraryAccess's (and library_grant_access's) upper bound — the same as the column's CHECK. */
const MAX_GRANT_DAYS = 3660;

/**
 * `grantDays` (owner q378): optional. Absent/null → no own length (null: the
 * code gives DEFAULT_INVITE_GRANT_DAYS); otherwise an integer 1..3660.
 */
export function validateGrantDays(raw: unknown): FieldValidation<number | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < MIN_GRANT_DAYS || raw > MAX_GRANT_DAYS) {
    return { ok: false, error: "مدة المنحة يجب أن تكون عدداً صحيحاً بين ١ و٣٦٦٠ يوماً" };
  }
  return { ok: true, value: raw };
}

/** `expiresAt`: optional ISO date string. Absent/null/"" → no expiry (null). */
export function validateExpiresAt(raw: unknown): FieldValidation<string | null> {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "تاريخ الانتهاء غير صالح" };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "تاريخ الانتهاء غير صالح" };
  }
  return { ok: true, value: parsed.toISOString() };
}

// ── Derived status (list display) ───────────────────────────────────────────

export type LibraryInvitationStatus = "active" | "exhausted" | "expired";

export interface LibraryInvitationStatusInput {
  currentUses: number;
  maxUses: number;
  expiresAt: string | null;
}

/**
 * "expired" wins over "exhausted" when both are true — an admin scanning the
 * list wants the reason nobody can use it anymore, and a code that expired
 * last month is a stale-date problem, not a demand problem, even if it also
 * happens to be full.
 */
export function libraryInvitationStatus(input: LibraryInvitationStatusInput): LibraryInvitationStatus {
  if (input.expiresAt && new Date(input.expiresAt).getTime() < Date.now()) return "expired";
  if (input.currentUses >= input.maxUses) return "exhausted";
  return "active";
}
