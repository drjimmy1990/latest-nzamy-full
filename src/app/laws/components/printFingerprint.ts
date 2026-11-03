/**
 * The printed page's fingerprint (owner q371, owner package 2026-11-02
 * §2.2-8c): the platform, the subscriber's name, a short account number and
 * the date and time of printing in Riyadh — so a leaked print can be traced
 * to its account and moment. Never a phone number or an email.
 *
 * The time is taken when the browser prints (PrintWatermark's `beforeprint`
 * handler), never at render: a date made during SSR would be cached by nginx
 * and go stale (the SSR cached-date trap).
 *
 * Pure, no imports: `node --test src/app/laws/components/printFingerprint.test.ts`.
 */

/** The first 8 characters of the account id (no dashes, upper case), or null. */
export function watermarkAccountRef(userId: string | undefined | null): string | null {
  if (!userId) return null;
  const ref = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return ref.length === 8 ? ref : null;
}

/**
 * The name to print, or null. The session's name falls back to the account
 * email when the profile has none (userSession.ts), and a name field may hold
 * a phone number: neither is ever printed.
 */
export function fingerprintName(name: string | undefined | null): string | null {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!n || n.includes("@")) return null;
  if (/[+\d٠-٩][\d٠-٩\s()-]{6,}/.test(n)) return null;
  return n;
}

/** «2026-11-03 00:30» — the instant in Asia/Riyadh, Gregorian, Latin digits, 24h. */
export function formatPrintStamp(at: Date): string {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export interface PrintFingerprintLines {
  platform: string;
  /** «المشترك: …» — null for a guest (no subscriber to name). */
  subscriber: string | null;
  /** «حساب XXXXXXXX» — null for a guest or an unreadable id. */
  account: string | null;
  /** «طُبع: … (توقيت الرياض)» — null until the browser prints. */
  printedAt: string | null;
}

/**
 * The fingerprint's lines. The name is the official one first (full_name,
 * owner q371), then the display name, then «عضو نظامي». A guest gets the
 * neutral mark — the platform and the print time only — never
 * «المشترك: …» for someone who is not one.
 */
export function printFingerprintLines(
  user: { isLoggedIn: boolean; fullName?: string | null; name?: string | null; userId?: string | null },
  stamp: string,
  isRTL = true,
): PrintFingerprintLines {
  const printedAt = stamp ? (isRTL ? `طُبع: ${stamp} (توقيت الرياض)` : `Printed: ${stamp} (Riyadh time)`) : null;
  const platform = "نظامي - Nezamy";
  if (!user.isLoggedIn) return { platform, subscriber: null, account: null, printedAt };
  const name = fingerprintName(user.fullName) ?? fingerprintName(user.name) ?? (isRTL ? "عضو نظامي" : "Nezamy Member");
  const ref = watermarkAccountRef(user.userId ?? undefined);
  return {
    platform,
    subscriber: isRTL ? `المشترك: ${name}` : `Subscriber: ${name}`,
    account: ref ? (isRTL ? `حساب ${ref}` : `Account ${ref}`) : null,
    printedAt,
  };
}
