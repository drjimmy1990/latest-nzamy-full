/** Convert Arabic-Indic and Extended Arabic-Indic digits to ASCII. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Keep phone fields numeric while accepting digits typed on Arabic keyboards. */
export function sanitizePhoneDigits(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, "").slice(0, 14);
}

/** Why a value is not a Saudi mobile. One reason per message; see `AR_MESSAGE`. */
export type SaudiMobileReason = "empty" | "letters" | "length" | "prefix";

export type SaudiMobileResult =
  | { ok: true; e164: string }
  | { ok: false; reason: SaudiMobileReason };

/**
 * Arabic copy, one line per reason.
 *
 * Before this, every caller wrote its own «رقم الجوال غير صحيح» beside a
 * `null`, which told the user nothing about WHICH of the four things they got
 * wrong. Appendix 03 §(a) — docs/audits/2026-09-20-profiles-uat/.
 */
const AR_MESSAGE: Record<SaudiMobileReason, string> = {
  empty: "رقم الجوال مطلوب.",
  letters: "رقم الجوال يجب أن يحتوي على أرقام فقط.",
  length: "رقم الجوال السعودي مكوّن من ١٠ أرقام — مثال: 0512345678",
  prefix: "أدخل رقم جوال سعودي يبدأ بـ 05 — مثال: 0512345678",
};

/** The Arabic message for a failed result; `""` for a successful one. */
export function saudiMobileMessage(result: SaudiMobileResult): string {
  return result.ok ? "" : AR_MESSAGE[result.reason];
}

/**
 * Characters a human can legitimately put between the digits of a phone
 * number, all removed before parsing: ASCII whitespace, parentheses, hyphen,
 * dot, underscore, slash, NBSP (U+00A0), zero-width space (U+200B) and the
 * LRM/RLM marks (U+200E/U+200F) that a copy-paste into an RTL form carries
 * invisibly. The dot, underscore, slash, NBSP and ZWSP are new in this
 * revision — `05.12.34.56.78` and a ZWSP-prefixed paste used to be rejected
 * as if they were letters.
 */
const STRIP_RE = /[\s()._/ ​‎‏-]/g;

/** After stripping, only digits and at most one leading `+` may remain. */
const DIGITS_RE = /^\+?[0-9]+$/;

/**
 * Parse a Saudi mobile into E.164 (`+9665XXXXXXXX`), or say why it is not one.
 *
 * Accepted, all folding to the same value: `0512345678`, `512345678`,
 * `966512345678`, `00966512345678`, `+966 51 234 5678`, `٠٥١٢٣٤٥٦٧٨`.
 *
 * The trunk `0` is stripped ONLY when no country code was given, which is what
 * keeps `+9660512345678` a rejection rather than a silent repair of a number
 * nobody can dial.
 */
export function normalizeSaudiMobile(raw: unknown): SaudiMobileResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };

  const stripped = toAsciiDigits(raw).replace(STRIP_RE, "");
  if (stripped === "") return { ok: false, reason: "empty" };
  if (!DIGITS_RE.test(stripped)) return { ok: false, reason: "letters" };

  const digits = stripped.replace(/^\+/, "");

  let subscriber: string;
  if (digits.startsWith("00966")) subscriber = digits.slice(5);
  else if (digits.startsWith("966")) subscriber = digits.slice(3);
  else if (digits.startsWith("0")) subscriber = digits.slice(1);
  else subscriber = digits;

  // Order matters: a number that is not a mobile at all ("0112345678", a
  // foreign number) is a different mistake from a mobile with a digit missing,
  // and telling someone "Saudi mobiles are 10 digits" about a Cairo number is
  // worse than saying nothing.
  if (!subscriber.startsWith("5")) return { ok: false, reason: "prefix" };
  if (subscriber.length !== 9) return { ok: false, reason: "length" };

  return { ok: true, e164: `+966${subscriber}` };
}

/**
 * Back-compat shim — the E.164 string or `null`.
 *
 * Kept for call sites that only need the value and have their own message.
 * Prefer `normalizeSaudiMobile` + `saudiMobileMessage` for anything a user
 * reads, so the reason reaches them.
 */
export function saudiMobileOrNull(raw: unknown): string | null {
  const result = normalizeSaudiMobile(raw);
  return result.ok ? result.e164 : null;
}

/**
 * `true` when `raw` is a dialable Saudi mobile in ANY accepted form.
 *
 * The onboarding gate asks one question — "is there a number we can reach this
 * user on?" — and its caller used to answer it with `(phone ?? "").trim() !==
 * ""`. That is a presence test, not a reachability test: a row holding
 * `letters-and-email@example.test` passed it, cleared the gate, and flowed
 * into the WhatsApp dispatch payload (src/lib/n8n/payload.ts) as a recipient.
 * UAT-REG-002 / appendix 03 §5.
 */
export function hasValidSaudiMobile(raw: unknown): boolean {
  return normalizeSaudiMobile(raw).ok;
}
