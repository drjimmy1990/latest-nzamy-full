/**
 * piiMask.ts — S5-3 (owner standing rule: the community's automatic help is
 * pre-publish filtering and PII masking ONLY, never an automatic answer).
 *
 * Before a community question, answer or edit is stored, the API replaces
 * personal identifiers with a short Arabic placeholder, stores the masked
 * text (so every reader, the reviewer included, sees only the masked form),
 * and tells the author politely what was hidden — by kind, never by value.
 *
 * What is masked:
 *   phone        Saudi mobiles (05…, 5…, +966 5…, 00966 5…), international
 *                numbers with + / 00, Saudi landlines (01x…), 9200… and 800…
 *                — the phone half reuses contactSanitizer.ts, so the
 *                community and the rest of the platform agree on what a
 *                phone is.
 *   email        incl. «name (at) host (dot) com».
 *   national_id  a standalone 10-digit number starting 1 (citizen) or 2
 *                (iqama); with an ID word before it («رقم الهوية …») the
 *                digits may also be spaced or dashed.
 *   iban         SA + 22 digits (spaces allowed); any other country's IBAN
 *                when it passes the mod-97 check.
 *   cr           10 digits after a commercial-registration word («السجل
 *                التجاري», «س.ت», CR, «الرقم الموحد») or a standalone
 *                unified number 70xxxxxxxx.
 *
 * What is NOT masked (false-positive guards, see piiMask.test.ts): article
 * numbers, years, decree numbers «م/٥١», amounts (thousands separators, or a
 * currency word right after / «مبلغ» right before), and a 10-digit case,
 * deed or decision number written right after its own word («القضية رقم …»,
 * «الصك …») — Najiz numbers are 10 digits too. A CR number is masked only
 * with its own word, for the same reason.
 *
 * Offsets: normalizeDigits maps one code unit to one, so hits found on the
 * ASCII-digit copy cut the original text at the same places, and the digits
 * the author wrote elsewhere (an article number in Arabic-Indic digits) stay
 * as written. The placeholders carry no digit and no «@», so masking twice
 * gives the same text as masking once.
 *
 * No imports beyond a relative .ts file — `node --test` loads this directly.
 */

import { findOffPlatformContact, normalizeDigits } from "../services/contactSanitizer.ts";

export type PiiKind = "phone" | "email" | "national_id" | "iban" | "cr";

export interface PiiHit {
  kind: PiiKind;
  /** Start offset in the input. */
  index: number;
  /** End offset (exclusive) in the input. */
  end: number;
}

export const PII_PLACEHOLDER_AR: Record<PiiKind, string> = {
  phone: "[رقم هاتف محجوب]",
  email: "[بريد محجوب]",
  national_id: "[رقم هوية محجوب]",
  iban: "[رقم حساب محجوب]",
  cr: "[رقم سجل محجوب]",
};

const KIND_LABEL_AR: Record<PiiKind, string> = {
  phone: "رقم الهاتف",
  email: "البريد الإلكتروني",
  national_id: "رقم الهوية أو الإقامة",
  iban: "رقم الحساب البنكي",
  cr: "رقم السجل التجاري",
};

/** Stable order for the notice and the API's `masked` list. */
const KIND_ORDER: PiiKind[] = ["phone", "email", "national_id", "iban", "cr"];

/** Overlap priority: the longer, more specific identifier wins. */
const PRIORITY: Record<PiiKind, number> = { iban: 0, email: 1, cr: 2, phone: 3, national_id: 4 };

// ── guards ──────────────────────────────────────────────────────────────────

/** A currency word right after the number: it is an amount. */
const CURRENCY_AFTER = /^\s*(?:ريالاً|ريالا|ريال|ر\s?\.\s?س|﷼|هللة|دولار|درهم|دينار|جنيه|يورو|SAR|SR|USD|EUR)/i;
/** «مبلغ / قيمة / قدره» or a currency sign right before: it is an amount. */
const AMOUNT_BEFORE = /(?:مبلغ|المبلغ|بمبلغ|قيمة|قيمته|قيمتها|قدره|قدرها|SAR|USD|﷼|ر\s?\.\s?س)\s*[:：]?\s*$/i;
/**
 * A case, deed, decision… number written right after its own word. Only the
 * word immediately before the number counts (optionally followed by «رقم»),
 * so «هوية» earlier in the sentence does not let a case number through.
 */
const DOCUMENT_NUMBER_BEFORE =
  /(?:القضية|قضية|قضيه|القضيه|الدعوى|دعوى|الصك|صك|القرار|قرار|الحكم|حكم|المعاملة|معاملة|الطلب|طلب|العقد|عقد|الفاتورة|فاتورة|المرسوم|التعميم|تعميم|الخطاب|خطاب|البلاغ|بلاغ|الوكالة|وكالة|الملف|ملف|الإحالة|إحالة|القيد|قيد)\s*(?:رقم|رقمها|رقمه|ذات الرقم|ذي الرقم|ذو الرقم|بالرقم)?\s*[:：#/]?\s*$/;

function looksLikeAmount(text: string, index: number, end: number): boolean {
  return CURRENCY_AFTER.test(text.slice(end, end + 16)) || AMOUNT_BEFORE.test(text.slice(Math.max(0, index - 16), index));
}

function looksLikeDocumentNumber(text: string, index: number): boolean {
  return DOCUMENT_NUMBER_BEFORE.test(text.slice(Math.max(0, index - 24), index));
}

// ── detectors (all run on the ASCII-digit copy) ─────────────────────────────

// Not part of a longer number: no digit, and no thousands/decimal separator
// followed by a digit, on either side («1,500,000,000» is an amount).
const NOT_AFTER_NUMBER = String.raw`(?<![\d]|[\d][.,٬٫])`;
const NOT_BEFORE_NUMBER = String.raw`(?![\d]|[.,٬٫][\d])`;

const NATIONAL_ID_RE = new RegExp(`${NOT_AFTER_NUMBER}[12]\\d{9}${NOT_BEFORE_NUMBER}`, "g");
const NATIONAL_ID_CUED_RE = new RegExp(
  String.raw`(?:الهوية|هوية|الهويه|هويه|الإقامة|إقامة|الاقامة|اقامة|الإقامه|إقامه|اقامه|السجل المدني|سجل مدني|سجله المدني|سجلي المدني|iqama|national\s*id|\bID\b)[^\d\n]{0,20}?([12](?:[\s\-]?\d){9})` +
    NOT_BEFORE_NUMBER,
  "gi",
);
const CR_CUED_RE = new RegExp(
  String.raw`(?:السجل التجاري|سجل تجاري|السجلّ التجاري|سجلّ تجاري|سجلها التجاري|سجله التجاري|سجلنا التجاري|س\s?\.\s?ت|رقم السجل|سجل رقم|الرقم الموحد|الرقم الوطني الموحد|\bC\.?R\b|commercial\s+registration|unified\s+number)[^\d\n]{0,20}?(\d(?:[\s\-]?\d){9})` +
    NOT_BEFORE_NUMBER,
  "gi",
);
const UNIFIED_NUMBER_RE = new RegExp(`${NOT_AFTER_NUMBER}70\\d{8}${NOT_BEFORE_NUMBER}`, "g");
const SA_IBAN_RE = /(?<![A-Za-z0-9])SA\s?\d{2}(?:[\s\-]?\d){20}(?!\d)/gi;
const OTHER_IBAN_RE = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Za-z0-9])/g;
const LANDLINE_RE = /(?<!\d)01[1-7](?:[\s\-.]?\d){7}(?!\d)/g;
const UNIFIED_PHONE_RE = /(?<!\d)(?:9200(?:[\s\-.]?\d){5}|800[\s\-.]?\d{3}[\s\-.]?\d{4})(?!\d)/g;

/** ISO 13616 mod-97 check (letters A=10 … Z=35). */
export function ibanChecksumOk(raw: string): boolean {
  const iban = raw.replace(/[\s\-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

function* matches(re: RegExp, text: string): Generator<RegExpMatchArray> {
  re.lastIndex = 0;
  yield* text.matchAll(re);
}

/** Every PII hit in `input`, overlaps resolved, sorted by position. */
export function findCommunityPii(input: string): PiiHit[] {
  if (!input) return [];
  const text = normalizeDigits(input);
  const raw: PiiHit[] = [];
  const add = (kind: PiiKind, index: number, length: number) => {
    if (length > 0) raw.push({ kind, index, end: index + length });
  };
  /** A captured group at the END of the match (the cue words precede it). */
  const addTail = (kind: PiiKind, m: RegExpMatchArray) => {
    const group = m[1] ?? "";
    add(kind, (m.index ?? 0) + m[0].length - group.length, group.length);
  };

  for (const m of matches(SA_IBAN_RE, text)) add("iban", m.index ?? 0, m[0].length);
  for (const m of matches(OTHER_IBAN_RE, text)) {
    if (!/^SA/i.test(m[0]) && ibanChecksumOk(m[0])) add("iban", m.index ?? 0, m[0].length);
  }

  // Phones and e-mails: the platform-wide detector (contactSanitizer.ts).
  for (const c of findOffPlatformContact(input)) {
    if (c.kind === "email") {
      add("email", c.index, c.text.length);
    } else if (c.kind === "phone" || c.kind === "whatsapp") {
      // «واتساب: 05…» — hide the number, keep the word.
      const lead = c.kind === "whatsapp" ? c.text.search(/[+\d]/) : 0;
      if (lead < 0) continue;
      const index = c.index + lead;
      const end = c.index + c.text.length;
      const plain = !/^[+0]/.test(text.slice(index, end));
      // A bare 5xxxxxxxx followed by «ريال» is an amount, not a mobile.
      if (plain && looksLikeAmount(text, index, end)) continue;
      add("phone", index, end - index);
    }
  }
  for (const m of matches(LANDLINE_RE, text)) add("phone", m.index ?? 0, m[0].length);
  for (const m of matches(UNIFIED_PHONE_RE, text)) {
    const i = m.index ?? 0;
    if (!looksLikeAmount(text, i, i + m[0].length)) add("phone", i, m[0].length);
  }

  for (const m of matches(CR_CUED_RE, text)) addTail("cr", m);
  for (const m of matches(UNIFIED_NUMBER_RE, text)) {
    const i = m.index ?? 0;
    if (!looksLikeAmount(text, i, i + m[0].length) && !looksLikeDocumentNumber(text, i)) add("cr", i, m[0].length);
  }

  for (const m of matches(NATIONAL_ID_CUED_RE, text)) addTail("national_id", m);
  for (const m of matches(NATIONAL_ID_RE, text)) {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    if (looksLikeAmount(text, i, end) || looksLikeDocumentNumber(text, i)) continue;
    add("national_id", i, m[0].length);
  }

  // Resolve overlaps: by priority, then the longer hit, then the earlier one.
  raw.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || (b.end - b.index) - (a.end - a.index) || a.index - b.index);
  const kept: PiiHit[] = [];
  for (const h of raw) {
    if (!kept.some((k) => h.index < k.end && k.index < h.end)) kept.push(h);
  }
  return kept.sort((a, b) => a.index - b.index);
}

export interface MaskResult {
  text: string;
  /** The kinds hidden, in a stable order, each once. */
  kinds: PiiKind[];
}

function orderKinds(kinds: Iterable<PiiKind>): PiiKind[] {
  const set = new Set(kinds);
  return KIND_ORDER.filter((k) => set.has(k));
}

/** `input` with every PII hit replaced by its Arabic placeholder. */
export function maskCommunityPii(input: string): MaskResult {
  const hits = findCommunityPii(input);
  if (hits.length === 0) return { text: input, kinds: [] };
  let out = "";
  let cursor = 0;
  for (const h of hits) {
    out += input.slice(cursor, h.index) + PII_PLACEHOLDER_AR[h.kind];
    cursor = h.end;
  }
  return { text: out + input.slice(cursor), kinds: orderKinds(hits.map((h) => h.kind)) };
}

/**
 * Masks a route's text fields in place of the raw ones: strings are masked,
 * string lists (tags) masked item by item, anything else passed through
 * untouched (the route's own validation decides about it).
 */
export function maskCommunityFields<T extends Record<string, unknown>>(fields: T): { fields: T; kinds: PiiKind[] } {
  const found: PiiKind[] = [];
  const maskOne = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = maskCommunityPii(v);
      found.push(...r.kinds);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(maskOne);
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = maskOne(value);
  return { fields: out as T, kinds: orderKinds(found) };
}

/** «…، و…» */
function joinAr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join("، ")} و${items[items.length - 1]}`;
}

/**
 * The author's notice, by kind only (the hidden values are never echoed).
 * null = nothing was hidden.
 */
export function piiMaskedNoticeAr(kinds: readonly PiiKind[]): string | null {
  const ordered = orderKinds(kinds);
  if (ordered.length === 0) return null;
  return `حفاظاً على الخصوصية أخفينا من نصّك ${joinAr(ordered.map((k) => KIND_LABEL_AR[k]))}، وحفظناه بدونها. التواصل بين الأعضاء يكون عبر المنصّة.`;
}
