/** Convert Arabic-Indic and Extended Arabic-Indic digits to ASCII. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Keep phone fields numeric while accepting digits typed on Arabic keyboards. */
export function sanitizePhoneDigits(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, "").slice(0, 14);
}

/**
 * Return a Saudi mobile in E.164 form (`+9665XXXXXXXX`), or `null` when the
 * value cannot be dialled as a Saudi mobile.
 */
export function normalizeSaudiMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = toAsciiDigits(raw).replace(/[\s()\u200e\u200f-]/g, "");
  if (value.startsWith("00966")) value = `+${value.slice(2)}`;
  else if (value.startsWith("966")) value = `+${value}`;
  else if (/^0?5\d{8}$/.test(value)) value = `+966${value.replace(/^0/, "")}`;
  return /^\+9665\d{8}$/.test(value) ? value : null;
}
