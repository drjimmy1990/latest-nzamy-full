/**
 * contactFieldRules.ts
 * ─────────────────────────────────────────────────────────
 * One validator for the contact and identity fields that several forms ask
 * for — a contract party (LIVE-F39), a client card (LIVE-F22), a volunteer
 * (LIVE-F22) — so the modal and the API route that receives it refuse the
 * same values with the same sentence.
 *
 * Owner package 2026-10-30: a party was saved with phone «000» and e-mail
 * «not-an-email», and a client card with mobile «0000000000». Each route
 * checked only that the value was a string.
 *
 * Rules:
 *   • An optional field left empty is fine and comes back as `null`.
 *   • A filled field must have the right FORMAT. That is all these checks
 *     prove: a well-formed national ID or mobile says nothing about whose it
 *     is, so no message here says «تم التحقق» or implies the person was
 *     verified (FORMAT_ONLY_NOTE says it in so many words for the forms).
 *   • A phone is stored normalised (E.164 `+9665XXXXXXXX`, or a 920 number as
 *     dialled), never as typed.
 *
 * Pure, relative `.ts` imports only, so `node --test` loads it directly.
 */

import { normalizeContactPhone, contactPhoneMessage } from "./saudiMobile.ts";
import { normalizeNationalId, isValidNationalId } from "./clientIdentityRules.ts";

export type FieldCheck =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Shown next to an ID or phone field: a format check is not identity verification. */
export const FORMAT_ONLY_NOTE = "نتحقق من صيغة الرقم فقط، ولا يعني ذلك التحقق من هوية صاحبه.";

/**
 * One `@`, a dot in the domain, no whitespace — the same three-part shape the
 * registration and entity-settings forms already use (profileEntityFields.ts),
 * deliberately not an RFC-5322 attempt. 254 is the practical address limit.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

function emptyish(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
}

/** An optional e-mail: empty → null, otherwise trimmed and shape-checked. */
export function checkOptionalEmail(raw: unknown): FieldCheck {
  if (emptyish(raw)) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "البريد الإلكتروني غير صالح." };
  const trimmed = raw.trim();
  if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "صيغة البريد الإلكتروني غير صحيحة — مثال: name@example.com" };
  }
  return { ok: true, value: trimmed };
}

/**
 * A phone: a Saudi mobile (stored E.164), or — when `allowUnified`, for a
 * company / government / other entity — also a 920 unified number. Empty is
 * fine unless `required`. The message names WHICH rule failed
 * (saudiMobile.ts's per-reason copy), never a bare «غير صحيح».
 */
export function checkSaudiPhone(
  raw: unknown,
  opts: { allowUnified?: boolean; required?: boolean } = {},
): FieldCheck {
  const allowUnified = opts.allowUnified === true;
  if (emptyish(raw)) {
    return opts.required ? { ok: false, error: "رقم الجوال مطلوب." } : { ok: true, value: null };
  }
  if (typeof raw !== "string") return { ok: false, error: "رقم الهاتف غير صالح." };
  const result = normalizeContactPhone(raw, { allowUnified });
  if (!result.ok) return { ok: false, error: contactPhoneMessage(result, { allowUnified }) };
  return { ok: true, value: result.value };
}

/**
 * A Saudi national ID / iqama number by FORMAT only: 10 digits starting with
 * 1 or 2 (clientIdentityRules.isValidNationalId — no checksum). An all-zero
 * value fails the prefix. Returns the digits, Arabic-Indic normalised.
 */
export function checkNationalIdFormat(raw: unknown, opts: { required?: boolean } = {}): FieldCheck {
  if (emptyish(raw)) {
    return opts.required ? { ok: false, error: "رقم الهوية الوطنية / الإقامة مطلوب." } : { ok: true, value: null };
  }
  if (typeof raw !== "string" || !isValidNationalId(raw)) {
    return { ok: false, error: "صيغة رقم الهوية / الإقامة غير صحيحة — ١٠ أرقام تبدأ بـ ١ أو ٢." };
  }
  return { ok: true, value: normalizeNationalId(raw) };
}

/**
 * Whether a contact phone for this kind of entity may be a 920 number. A
 * person's number must be a mobile (owner decision ٥٥); a company's,
 * government body's or other organisation's may be the unified number.
 */
export function phoneAllowsUnified(entityType: string | null | undefined): boolean {
  return typeof entityType === "string" && entityType !== "individual";
}

/** The pair a party / client card carries: both checked, first error wins. */
export function checkContactPair(
  input: { phone?: unknown; email?: unknown },
  opts: { allowUnified?: boolean; phoneRequired?: boolean } = {},
): { ok: true; phone: string | null; email: string | null } | { ok: false; field: "phone" | "email"; error: string } {
  const phone = checkSaudiPhone(input.phone, { allowUnified: opts.allowUnified, required: opts.phoneRequired });
  if (!phone.ok) return { ok: false, field: "phone", error: phone.error };
  const email = checkOptionalEmail(input.email);
  if (!email.ok) return { ok: false, field: "email", error: email.error };
  return { ok: true, phone: phone.value, email: email.value };
}
