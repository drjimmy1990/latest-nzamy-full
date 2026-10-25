/**
 * Who sees a law's موجز and identity card (N2.1 / N2.2).
 *
 * Owner answer ٢٦٠ (أ), 2026-10-25: the موجز and the card's public fields are
 * for EVERYONE — guests included. LAW_SUMMARY_AUDIENCE = "everyone".
 *
 * What stays as it was (nothing else opens):
 *   - the article text and its paywall (hasFullAccess / effectiveFreeLimit
 *     ١٨٤ in the law route, the server-only article tables of 20260929_01);
 *   - the ديباجة itself: the law route still sends `preamble: ''` to a
 *     non-subscriber (T28-22, its decree text);
 *   - the T28-22 rows of the card — the issuing / amending instrument, the
 *     issue and publication dates, the official links and the gazette — are
 *     subscribers'. cardForViewer below gives anyone else an ALLOWLIST: the
 *     النوع / الحالة / الجهة المصدرة rows only, their values cleaned; the
 *     sidebar shows one «للمشتركين» row in place of the rest. The law's
 *     official link is public (owner ٢٩٧) and travels on its own field.
 *
 * library.laws.summary_brief stays column-locked for the anon key: the
 * catalogue (/api/library/init) and the law route read it, and the preamble
 * it is cut from, with the service role and send only these fields.
 *
 * Pure: `node --test` loads it directly.
 */

import { extractLawPreambleBlocks, isHollowPreamble, type LawMetadataCard, type LawCardField } from "./lawPreambleBlocks.ts";
import { LAW_CARD_PRIMARY_FIELDS, type LawCardFieldId } from "./lawCardFields.ts";

export type LawSummaryAudience = "subscribers" | "everyone";

/** THE flag for owner question ٢٦٠ — answered (أ): everyone. */
export const LAW_SUMMARY_AUDIENCE: LawSummaryAudience = "everyone";

/** May this viewer see the موجز and the card? `isSubscriber` = hasFullLibraryAccess. */
export function lawSummaryVisible(isSubscriber: boolean, audience: LawSummaryAudience = LAW_SUMMARY_AUDIENCE): boolean {
  return audience === "everyone" || isSubscriber === true;
}

/**
 * A guest's card is an ALLOWLIST (review of b0317922, 2026-10-26): a blocklist
 * of keys and value shapes kept leaking on last_owner — «قرار وزاري 5595»,
 * «تعميم (19/3227)», a key «الرقم», «22 رمضان 1442هـ», «2019/12/01م»,
 * «1442.9.22», «م/14» with a hidden U+200F, «www.boe.gov.sa/…», keys «سنة الإصدار» /
 * «السند النظامي» / «صك الإصدار».
 *
 * A guest receives ONLY the rows of the always-shown fields (owner ٢٦١ / ٢٩٧,
 * LAW_CARD_PRIMARY_FIELDS) that are not subscribers': النوع، الحالة، الجهة
 * المصدرة. تاريخ الإصدار and آخر تعديل are T28-22 rows (subscribers); every
 * other row is dropped. The sidebar's one «للمشتركين» row stands in for them.
 */
const GUEST_FIELD_IDS: ReadonlySet<LawCardFieldId> = new Set<LawCardFieldId>(["type", "status", "issuer"]);

/** The card keys a guest may receive (exact, after trimming) — read from the one field list. */
export const GUEST_CARD_KEYS: ReadonlySet<string> = new Set(
  LAW_CARD_PRIMARY_FIELDS.filter((f) => GUEST_FIELD_IDS.has(f.id)).flatMap((f) => f.keys),
);

/** Bidi controls: LRM / RLM / ALM, the embeddings and overrides, the isolates. */
const BIDI_CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

/**
 * What a guest's value may not carry: any digit (Western, Arabic-Indic,
 * Persian — every instrument number and every date has one) or a link / bare
 * domain (the official link is sent on its own, `officialLink`).
 */
const GUEST_UNSAFE = /[0-9٠-٩۰-۹]|https?:|www\.|[a-z0-9-]+\.(?:sa|com|net|org|gov|edu)\b/i;

/**
 * An allowed row's value as a guest may see it, or null when it cannot be
 * made safe. Fails closed: whatever survives the trimming below and still
 * holds a digit or a link drops the row.
 *   «ساري — معدّل، آخر تعديل بمرسوم ملكي (م/21) وتاريخ 1447/01/26هـ» → «ساري»;
 *   «هيئة الحكومة الرقمية (dga.gov.sa)» → «هيئة الحكومة الرقمية»;
 *   «مُستبدَل بتنظيم إعانة البحث عن عمل 1442هـ» → dropped.
 */
export function guestCardValue(value: string): string | null {
  let s = value.replace(BIDI_CONTROLS, "");
  // A markdown link reads as its text; a bare link goes.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(?:https?:\/\/|www\.)\S*/gi, "");
  // «ساري — معدّل بقرار … رقم (5)»: the clause after a spaced dash, when it cites.
  const dash = s.match(/\s[—–-]\s/);
  if (dash && dash.index !== undefined && GUEST_UNSAFE.test(s.slice(dash.index))) s = s.slice(0, dash.index);
  // «(تنفيذاً … م/68 وتاريخ …)»: a parenthesis that cites.
  s = s.replace(/\s*\([^()]*\)/g, (group) => (GUEST_UNSAFE.test(group) ? "" : group));
  // «قرار رقم (5)» → «قرار»: no word left waiting for the number it lost.
  s = s.replace(/(?:\s+(?:رقم|بالرقم|وتاريخ|بتاريخ|تاريخ))+\s*$/u, "");
  s = s.replace(/\s+/g, " ").replace(/[\s،؛:,;—–-]+$/u, "").trim();
  if (!s || GUEST_UNSAFE.test(s)) return null;
  return s;
}

/**
 * Owner answer ٢٥٩ (أ): no text that says our data is unverified or
 * incomplete — for EVERY viewer. The export's status rows carry the
 * pipeline's own notes: «ساري (بحاجة تحقق حي — …)», «ساري جزئياً — راجع
 * التنبيه أدناه», «… (راجع «المزيد»)». A status row shows its status words only.
 */

/** ⚠️ ✅ 🚫 and the like, with their variation selector. */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\uFE0F]/gu;

/** A card key as compared: no ⚠️ / ✅ marks, no bold, spaces collapsed. */
function normalCardKey(key: string): string {
  return key.replace(PICTOGRAPHS, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Rows about the export's own file, not the law — dropped for EVERY viewer
 * (keys as normalCardKey gives them; counts over last_owner, 2026-10-26):
 *   «حالة المراجعة» / «حالة الاكتمال»: the review notes («ملف جزئي…»);
 *   «تاريخ الاستخراج» (42), «طريقة التفريغ» («Gemini Vision OCR…»),
 *   «الملف الأصلي (PDF)» (30): how the file was made;
 *   «معيار التنسيق» (44) / «معيار الهيكلة» (10): «(V3.3 Zero-Details Protocol)»;
 *   «ملاحظة تحقق», «ملاحظة هيكلية», «⚠️ ملاحظة تكرار محتمل», «ملاحظة
 *   التحديث» («هذا الملف يوثّق …»): notes on our file.
 */
const PIPELINE_ROW_KEYS: ReadonlySet<string> = new Set([
  "حالة المراجعة", "حالة الاكتمال",
  "تاريخ الاستخراج", "طريقة التفريغ", "الملف الأصلي (PDF)",
  "معيار التنسيق", "معيار الهيكلة",
  "ملاحظة تحقق", "ملاحظة هيكلية", "ملاحظة تكرار محتمل", "ملاحظة التحديث",
]);

/** A status row: «حالة التشريع», «الحالة», «حالة الوثيقة», «الحالة التشريعية», «حالة النفاذ» … */
function isStatusKey(key: string): boolean {
  const k = normalCardKey(key);
  return !PIPELINE_ROW_KEYS.has(k) && /^(?:ال)?حالة(?:\s|$)/u.test(k);
}

const DIGITS = /[0-9\u0660-\u0669\u06F0-\u06F9]/g;
/** Tashkeel, superscript alef, tatweel. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
/**
 * A verification / pipeline note («بحاجة تحقق», «لم يُتحقّق», «غير مؤكَّد»,
 * «يحتاج», «راجع …», «انظر …»), on text with its marks removed. Whole words
 * where a substring would bite: «راجع» is inside «والمراجعة».
 */
const NOTE_WORDS = /تحقق|مؤكد|موثق|(?<!\p{L})(?:ي|ت)حتاج(?!\p{L})|(?<!\p{L})(?:و|ف)?(?:راجع|انظر)(?!\p{L})/u;
const unmarked = (s: string) => s.replace(ARABIC_MARKS, "");
const hasNoteWord = (s: string) => NOTE_WORDS.test(unmarked(s));
/** A note word, or a digit (a citation's number or date). */
const notesOrCites = (s: string) => hasNoteWord(s) || /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(s);
/** «معدّل» / «معدَّلة»: the one qualifier kept from a clause that goes on to cite. */
const AMENDED = /^معدل(?:ة)?$/u;

/** The segments («،» / «؛») of a clause up to the first that notes or cites. */
function cleanSegments(clause: string): { kept: string[]; whole: boolean } {
  const segments = clause.split(/\s*[،؛]\s*/);
  const kept: string[] = [];
  for (const seg of segments) {
    if (notesOrCites(seg)) {
      // «معدّل بمرسوم ملكي رقم (م/123) …», «معدّل (المواد 4 و5 و6)» → «معدّل».
      const first = seg.trim().split(/[\s(]/)[0] ?? "";
      if (!kept.length && AMENDED.test(unmarked(first))) kept.push(first);
      return { kept, whole: false };
    }
    kept.push(seg);
  }
  return { kept, whole: true };
}

/**
 * A status value as everyone sees it: the status words, with no verification
 * note, cross-reference or citation. Null when nothing is left (a value that
 * was only a note, «لم يُتحقّق من الحالة»).
 *   «ساري (بحاجة تحقق حي — لا رقم/تاريخ إصدار مؤكَّد …)» → «ساري»;
 *   «ساري جزئياً — راجع التنبيه أدناه» → «ساري جزئياً»;
 *   «ساري — معدّل، آخر تعديل بـ المرسوم الملكي رقم (م/93) وتاريخ …» → «ساري — معدّل»;
 *   «ملغى — مُستبدَل بنظام … (المرسوم الملكي وتاريخ 27/7/1442هـ)» → «ملغى»;
 *   «صدر — لم يُتحقّق من النشر» → «صدر».
 */
export function cardStatusValue(value: string): string | null {
  let s = value.replace(BIDI_CONTROLS, "").replace(PICTOGRAPHS, "");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(?:https?:\/\/|www\.)\S*/gi, "");
  // An aside that is a note goes first, inner parentheses outwards — some
  // hold a dash of their own: «(بحاجة تحقق حي — لا رقم/تاريخ …)».
  for (let prev = ""; prev !== s; ) {
    prev = s;
    // An English gloss or a source note goes too: «نشط (active)», «ساري
    // (Active)», «جاري العمل على النظام (بحسب المصدر الرسمي BOE)».
    s = s.replace(/\s*\(([^()]*)\)/g, (group, inner: string) => (hasNoteWord(inner) || /[A-Za-z]/.test(inner) ? "" : group));
  }
  const [head, ...clauses] = s.split(/\s[—–-]\s/);
  // «لم يُتحقّق من الحالة»: a note, not a status.
  if (hasNoteWord(head)) return null;
  // The head is the status. Its segments up to the first that cites; a head
  // that is one citing segment («مُستبدَل بتنظيم … 1442هـ») stays as it is,
  // less its cited parentheses — guestCardValue still drops it for a guest.
  const headSegments = cleanSegments(head);
  const kept = headSegments.kept.length ? [headSegments.kept.join("، ")] : [head.replace(/\s*\([^()]*\)/g, (g) => (notesOrCites(g) ? "" : g))];
  // Each later clause likewise; a clause that starts with a note or a
  // citation ends the value («— راجع …», «— نفاذه 1448/…»).
  if (headSegments.whole) {
    for (const clause of clauses) {
      const { kept: segs, whole } = cleanSegments(clause);
      if (segs.length) kept.push(segs.join("، "));
      if (!whole) break;
    }
  }
  s = kept.join(" — ");
  s = s.replace(/(?:\s+(?:رقم|بالرقم|وتاريخ|بتاريخ|تاريخ))+\s*$/u, "");
  s = s.replace(/\s+/g, " ").replace(/[\s،؛:,;—–-]+$/u, "").trim();
  return s || null;
}

/**
 * A gap / verification note of the export (owner ٢٥٩ (أ)), on text with its
 * marks removed. Anchored phrases, never a bare «تحقق» or «المرجح»: «قائمة
 * التحقق», «عند التحقق من دخل العميل», «لا يتحقق الالتزام بها», «ومطابقتها
 * للنص المرجح» are the law's own words.
 */
const GAP_NOTE = new RegExp(
  [
    "تحقق\\s+(?:منه|مباشر|حي)", // «— تحقَّق منه 2026-07-28», «تحقق مباشر …», «تحقُّق حي …»
    "تم\\s+التحقق|(?:عند|بعد)\\s+التحقق\\s*\\(?[0-9٠-٩]{4}",
    "لم\\s+[يتن]?تحقق", // «لم يُتحقَّق مما …»
    "تحقق\\s*\\(?[0-9٠-٩]{4}-", // «(تحقَّق 2026-07-20: …)»
    "بحاجة\\s+(?:إلى\\s+)?(?:ال)?تحقق",
    "(?:غير|لا)\\s+(?:مؤكد|متوفر|متاح)", // «غير مؤكَّدين», «غير متوفرة», «غير متوفرهـ»
    "لم\\s+[يتن]?عثر",
    "(?<!\\p{L})مؤكد\\S*\\s+(?:عبر|حيا|بمصدر)", // «(مؤكَّد عبر البوابة الحية …)»
    "^\\s*(?:ال)?مؤكد\\S*\\s*$", // an aside that is only «(مؤكَّد)»
    "(?:أثناء|عند|وقت)\\s+الاستخراج|المصدر\\s+المستخرج|الفرونت|review_|(?<![A-Za-z])OCR(?![A-Za-z])|المكتبة_القانونية",
    "(?<!\\p{L})(?:تقديري|تقريبا)(?!\\p{L})", // «(تقديري، راجع …)», «(تقريباً، مشتق من …)»
    "رقم\\s+[0-9٠-٩]+\\s+المرجح|(?<!\\p{L})مرجح\\s+(?:إن|بثقة)", // «(عدد أم القرى رقم 4963 المرجَّح)»
    "غير\\s+محسوب", // «؛ المقابل الهجري غير محسوب»
    "بحسب\\s+(?:ال)?(?:مصدر|صفحة)",
    "(?:مصدر|نص|ديباجة)\\s+(?:المتاح|المستخدم)", // «غير مذكور في المصدر المستخدم», «بالمصدر المتاح»
    "(?:غير\\s+مذكور|لم\\s+يرد)\\s+في\\s+(?:ال)?(?:مصدر|نص|غلاف)",
    "تعذر\\s+(?:احتساب|تحديد)",
    "أفضل\\s+تقدير|(?<!\\p{L})يقدر(?!\\p{L})|أقرب\\s+تصنيف|هذه\\s+الجولة",
  ].join("|"),
  "u",
);
const hasGapNote = (s: string) => GAP_NOTE.test(unmarked(s));

/**
 * A verification stamp, removed where it stands so the text around it stays:
 * «تحقق مباشر 2026-07-19 من بوابة هيئة الخبراء: نُشر بالفعل …» → «نُشر بالفعل …».
 */
const VERIFY_STAMP = /تح\p{M}*ق\p{M}*ق\p{M}*\s+(?:مباشر|حي)\s+(?:بتاريخ\s+)?[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:\s+من\s+[^:،؛.()]+:)?\s*/gu;
/**
 * «تقريباً» right after a date or after «الموافق» is the date's qualifier:
 * the qualifier goes, the date stays (as «غير مؤكد» on a date row) —
 * «2024-06-05م تقريباً — وفق المادة (16) …», «الموافق تقريباً 1987-08-30م».
 */
const ABOUT_AFTER_DATE = /([0-9٠-٩](?:هـ|ه|م)?)\s+تقريبا\p{M}*(?!\p{L})/gu;
const ABOUT_AFTER_EQUALS = /(الموافق)\s+تقريبا\p{M}*\s+(?=[0-9٠-٩])/gu;

/** Where a clause ends (outside any «(…)» / «[…]»): a spaced dash, «؛», a spaced «·», a sentence's «. ». */
const CLAUSE_SEP = /\s+[—–-]+\s+|\s*؛\s*|\s+·\s+|(?<=\.)\s+/y;
const EDGE_PUNCT = /^[\s،؛:,;—–·-]+|[\s،؛:,;—–·-]+$/gu;

function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * `text` less its gap notes: stamps and a date's «تقريباً» go where they
 * stand; an aside «(…)» is cleaned inside out and goes when nothing is left
 * of it; then a clause or sentence that still notes goes whole. A markdown
 * link's target «](…)» is never touched.
 */
function withoutGapNotes(input: string): string {
  const text = input.replace(VERIFY_STAMP, "").replace(ABOUT_AFTER_DATE, "$1").replace(ABOUT_AFTER_EQUALS, "$1 ");
  let s = "";
  for (let i = 0; i < text.length; ) {
    if (text[i] !== "(") {
      s += text[i++];
      continue;
    }
    const close = closingParen(text, i);
    if (close < 0) {
      s += text.slice(i);
      break;
    }
    const raw = text.slice(i + 1, close);
    // A link's target, or an aside with nothing to remove: as the file has it.
    // An aside a stamp emptied, «(تحقُّق حي 2026-07-20)», goes.
    if (text[i - 1] === "]" || (raw.trim() && !hasGapNote(raw))) s += text.slice(i, close + 1);
    else {
      const inner = withoutGapNotes(raw);
      s = inner ? `${s}(${inner})` : s.replace(/\s+$/, "");
    }
    i = close + 1;
  }
  const clauses: Array<{ sep: string; text: string }> = [];
  let depth = 0;
  let start = 0;
  let sep = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0) {
      CLAUSE_SEP.lastIndex = i;
      const m = CLAUSE_SEP.exec(s);
      if (m && m[0]) {
        clauses.push({ sep, text: s.slice(start, i) });
        sep = m[0];
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  clauses.push({ sep, text: s.slice(start) });
  let out = "";
  for (const c of clauses) {
    if (!c.text.trim() || hasGapNote(c.text)) continue;
    out += out ? c.sep + c.text : c.text;
  }
  return out.replace(EDGE_PUNCT, "").trim();
}

/**
 * Any card row's value as EVERY viewer sees it (owner ٢٥٩ (أ)): the export's
 * gap and verification notes removed, the rest exactly as the file has it.
 * Null when the value was only a note. Over last_owner:
 *   «24 ربيع الآخر 1435هـ — تحقَّق منه 2026-07-28» → «24 ربيع الآخر 1435هـ»;
 *   «1372/01/24هـ (التحويل الميلادي الدقيق غير مؤكد — راجع …)» → «1372/01/24هـ»;
 *   «غير متوفر في المصدر — يعمل به بعد تسعين يوماً من نشره (المادة 49)» → «يعمل به …»;
 *   «غير متوفر (الرابط المسجَّل سابقاً لا يفتح الوثيقة؛ لم يُعثر على بديل …)» → null.
 * English in brackets stays outside a status row: a term's gloss in a subject
 * («(Red Teaming)»), an acronym «(GACA)», an identifier «(TC05)», «(PDF)».
 */
export function cardRowValue(value: string): string | null {
  if (!hasGapNote(value)) return value;
  return withoutGapNotes(value) || null;
}

/** A row as every viewer sees it, or null: file rows dropped, notes removed, a status its words only. */
function rowTidy(f: LawCardField): LawCardField | null {
  if (PIPELINE_ROW_KEYS.has(normalCardKey(f.key))) return null;
  let value = cardRowValue(f.value);
  if (value && isStatusKey(f.key)) value = cardStatusValue(value);
  if (!value) return null;
  return value === f.value ? f : { key: f.key, value };
}

function subscriberRows(rows: readonly LawCardField[]): LawCardField[] {
  const out: LawCardField[] = [];
  for (const row of rows) {
    const tidy = rowTidy(row);
    if (tidy) out.push(tidy);
  }
  return out;
}

function guestRows(rows: readonly LawCardField[]): LawCardField[] {
  const out: LawCardField[] = [];
  for (const row of rows) {
    if (!GUEST_CARD_KEYS.has(row.key.trim())) continue;
    const tidy = rowTidy(row);
    const value = tidy ? guestCardValue(tidy.value) : null;
    if (value) out.push({ key: row.key, value });
  }
  return out;
}

/**
 * The card as this viewer may see it: whole for a subscriber, the allowlisted
 * rows only otherwise — for both, the export's file rows dropped, its gap /
 * verification notes removed (cardRowValue) and a status row its words only.
 */
export function cardForViewer(card: LawMetadataCard | null, isSubscriber: boolean): LawMetadataCard | null {
  if (!card) return null;
  if (isSubscriber) return { main: subscriberRows(card.main), more: subscriberRows(card.more) };
  const main = guestRows(card.main);
  const more = guestRows(card.more);
  return main.length || more.length ? { main, more } : null;
}

export interface LawReaderExtras {
  /** The preamble to display: the moved blocks removed when they are shown. */
  preamble: string;
  /** Present only when the viewer may see it. */
  summary?: string;
  summaryLabel?: string;
  metadata_card?: LawMetadataCard;
}

/**
 * The law route's موجز / card fields for one viewer, from the law part of
 * library.laws.preamble. Keys are OMITTED (not empty) when the viewer may not
 * see them; then the preamble keeps the blocks, so nothing is lost for a
 * reader who does see the preamble.
 */
export function lawReaderExtras(
  lawPreamble: string,
  isSubscriber: boolean,
  audience: LawSummaryAudience = LAW_SUMMARY_AUDIENCE,
): LawReaderExtras {
  if (!lawSummaryVisible(isSubscriber, audience)) return { preamble: lawPreamble };
  const blocks = extractLawPreambleBlocks(lawPreamble);
  // With the card and the موجز gone, what is left is often only the law's H1
  // and an empty ديباجة toggle: no box rather than one that opens on the title.
  const lifted = !!blocks.summary || !!blocks.metadataCard;
  const out: LawReaderExtras = { preamble: lifted && isHollowPreamble(blocks.rest) ? "" : blocks.rest };
  if (blocks.summary) {
    out.summary = blocks.summary;
    out.summaryLabel = blocks.summaryLabel;
  }
  const card = cardForViewer(blocks.metadataCard, isSubscriber);
  if (card) out.metadata_card = card;
  return out;
}
