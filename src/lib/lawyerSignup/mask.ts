/**
 * Masks shown to the lawyer (decision ٢١: the OTP goes only to the registry
 * mobile, and the browser never sees that number — only its last two digits).
 * Pure.
 */

/** Last two digits of a phone number, or null when it is not a usable number. */
export function mobileHint(raw: string | null | undefined): string | null {
  const d = String(raw ?? "")
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-2) : null;
}

/** «••12» for the UI. */
export function maskedMobile(hint: string | null | undefined): string | null {
  return hint && /^\d{2}$/.test(hint) ? `••••••••${hint}` : null;
}

/** «a•••@example.com» — the first character of the local part only. */
export function maskEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return null;
  return `${s[0]}•••${s.slice(at)}`;
}
