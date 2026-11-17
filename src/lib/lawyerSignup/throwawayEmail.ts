/**
 * Throwaway (disposable) e-mail domains — decision ٢١: «احظر نطاقات البريد
 * المؤقت». Pure; no I/O.
 *
 * Where it is enforced (signup goes from the browser straight to GoTrue, so
 * there is no server step before the account exists):
 *   1. the provider signup form refuses the address on step 3 (UX only);
 *   2. POST /api/v1/lawyer/signup-verification/email/start refuses to send a
 *      code to it, so such an address is never confirmed;
 *   3. the signup decision table holds the account for review.
 * Blocking it before the account exists needs a GoTrue hook — an owner/ops
 * decision listed in the report.
 *
 * A domain matches itself and every sub-domain of it. The list is the common
 * public services (and the ones popular in Arabic-speaking countries, e.g.
 * mohmal / moakt); it is not exhaustive and is easy to extend.
 */

export const THROWAWAY_DOMAINS: readonly string[] = [
  "10minutemail.com", "10minutemail.net", "10minemail.com", "20minutemail.com",
  "33mail.com", "anonbox.net", "anonymbox.com", "burnermail.io",
  "byom.de", "cock.li", "crazymailing.com", "deadaddress.com",
  "discard.email", "discardmail.com", "dispostable.com", "dropmail.me",
  "email-fake.com", "emailfake.com", "emailondeck.com", "emailtemporanea.net",
  "fakeinbox.com", "fakemail.net", "fakemailgenerator.com", "getairmail.com",
  "getnada.com", "nada.email", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "guerrillamailblock.com",
  "grr.la", "sharklasers.com", "pokemail.net", "spam4.me",
  "harakirimail.com", "inboxbear.com", "incognitomail.org", "jetable.org",
  "mail-temp.com", "mail.tm", "mail7.io", "mailcatch.com",
  "maildrop.cc", "mailinator.com", "mailinator.net", "mailinator2.com",
  "mailnesia.com", "mailpoof.com", "mailsac.com", "mailtemp.net",
  "mintemail.com", "moakt.com", "moakt.cc", "moakt.co",
  "mohmal.com", "mohmal.in", "mohmal.im", "mytemp.email",
  "mytrashmail.com", "neverbox.com", "notmailinator.com", "onetimemail.org",
  "throwawaymail.com", "temp-mail.org", "temp-mail.io", "tempmail.com",
  "tempmail.net", "tempmail.dev", "tempmailo.com", "tempmail.plus",
  "tempr.email", "tempinbox.com", "temporary-mail.net", "trash-mail.com",
  "trashmail.com", "trashmail.de", "trashmail.net", "trashmail.io",
  "wegwerfmail.de", "yopmail.com", "yopmail.fr", "yopmail.net",
  "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "courriel.fr.nf",
  "spambox.us", "spamgourmet.com", "spamex.com", "tmail.ws",
  "tmpmail.org", "tmpmail.net", "tmpeml.com", "tempmailaddress.com",
  "linshiyouxiang.net", "emltmp.com", "fexpost.com", "fextemp.com",
  "inboxkitten.com", "luxusmail.org", "mailbox.in.ua", "minuteinbox.com",
  "owlymail.com", "rootfest.net", "spamdecoy.net", "tempemail.co",
];

const SET = new Set(THROWAWAY_DOMAINS);

/** The domain part, lower-cased, without a trailing dot; null for no domain. */
export function emailDomain(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return null;
  const d = s.slice(at + 1).replace(/\.+$/, "");
  return d.includes(".") ? d : null;
}

/** True when the address is on a throwaway domain or a sub-domain of one. */
export function isThrowawayEmail(raw: string | null | undefined): boolean {
  const d = emailDomain(raw);
  if (!d) return false;
  const parts = d.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (SET.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const THROWAWAY_EMAIL_AR = "هذا البريد من نطاق بريد مؤقت. استخدم بريدك المهني أو الشخصي الدائم.";
