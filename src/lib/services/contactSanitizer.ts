/**
 * contactSanitizer.ts — keeping contact off the platform's public text (item 179).
 * ─────────────────────────────────────────────────────────
 * A lawyer's bio, a service description, a review, a marketplace message: none
 * of them may carry a phone number, an e-mail address, a WhatsApp/URL link or
 * a social handle — that is how a deal walks off the platform. Pure: no I/O.
 * Used by the API routes (refuse with the Arabic reason) and by the screens
 * (inline warning before submit) so the two never disagree.
 *
 * Detection is generous for the things that ARE contact (Arabic-Indic digits,
 * spaced digits, «واتساب ٠٥…», «@handle», «t.me/…») and strict about what is
 * NOT: an article number, a 10-digit commercial register, a case number or a
 * date is never a phone. A false positive costs the author a rewrite; a false
 * negative costs the platform the client — but flagging «المادة ١٨٧» would
 * make lawyers stop trusting the check altogether.
 */

export type ContactKind = "phone" | "email" | "url" | "handle" | "whatsapp";

export interface ContactMatch {
  kind: ContactKind;
  /** The offending text as written (digits normalised to ASCII). */
  text: string;
  index: number;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic and Eastern-Indic digits → ASCII, everything else untouched. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EASTERN_INDIC.indexOf(d));
  });
}

// (1) an international number with a dialling prefix: + or 00, then 9–14 digits
//     with optional spaces/dashes/dots between them;
// (2) a Saudi mobile: optional +966 / 00966 / 0 prefix, then 5 and eight more
//     digits — the lookarounds refuse to read a mobile out of the middle of a
//     longer identifier (a commercial register, a case number).
const PHONE_RE = new RegExp(
  String.raw`(?<!\d)(?:\+\s*|00\s*)\d(?:[\s\-.]?\d){8,13}(?!\d)` +
  `|` +
  String.raw`(?<!\d)(?:\+?\s*966|00\s*966|0)?\s*5(?:[\s\-.]?\d){8}(?!\d)`,
  "g",
);
const EMAIL_RE = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|＠)\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,}/gi;
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+|\b(?:wa\.me|t\.me|telegram\.me|linkedin\.com|instagram\.com|x\.com|twitter\.com|snapchat\.com|tiktok\.com|facebook\.com|youtube\.com|bit\.ly)\/?[^\s]*/gi;
const HANDLE_RE = /(?:^|[\s(،,])@[A-Za-z0-9_.]{3,}/g;
const WHATSAPP_RE = /(?:واتس\s*اب|واتساب|whats\s*app|wa\b)\s*[:：]?\s*(?:\+?\d[\d\s\-]{6,})/gi;

export function findOffPlatformContact(input: string): ContactMatch[] {
  if (!input) return [];
  const text = normalizeDigits(input);
  const out: ContactMatch[] = [];
  const push = (kind: ContactKind, re: RegExp) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const hit = m[0].trim();
      if (!hit) continue;
      out.push({ kind, text: hit, index: m.index ?? 0 });
    }
  };
  push("email", EMAIL_RE);
  push("url", URL_RE);
  push("whatsapp", WHATSAPP_RE);
  push("handle", HANDLE_RE);
  push("phone", PHONE_RE);
  // a phone already reported inside a whatsapp/url hit is the same finding
  const covered = out.filter((m) => m.kind !== "phone");
  const phones = out.filter(
    (m) => m.kind === "phone" && !covered.some((c) => m.index >= c.index && m.index < c.index + c.text.length),
  );
  return [...covered, ...phones].sort((a, b) => a.index - b.index);
}

export function hasOffPlatformContact(input: string): boolean {
  return findOffPlatformContact(input).length > 0;
}

const KIND_AR: Record<ContactKind, string> = {
  phone: "رقم هاتف",
  email: "بريد إلكتروني",
  url: "رابط",
  handle: "معرّف حساب",
  whatsapp: "رقم واتساب",
};

/** The Arabic refusal the API and the screen both show, naming what was found. */
export function offPlatformContactIssue(input: string): string | null {
  const found = findOffPlatformContact(input);
  if (found.length === 0) return null;
  const kinds = [...new Set(found.map((m) => KIND_AR[m.kind]))];
  return `لا يُسمح بوضع ${kinds.join(" أو ")} في هذا الحقل — التواصل يتم عبر المنصّة.`;
}

/** Replace every hit with «[محذوف]» — for feeds that must render anyway (never for storage of new text). */
export function stripOffPlatformContact(input: string): string {
  const found = findOffPlatformContact(input);
  if (found.length === 0) return input;
  const normalized = normalizeDigits(input);
  let out = "";
  let cursor = 0;
  for (const m of found) {
    if (m.index < cursor) continue;
    out += normalized.slice(cursor, m.index) + "[محذوف]";
    cursor = m.index + m.text.length;
  }
  return out + normalized.slice(cursor);
}
