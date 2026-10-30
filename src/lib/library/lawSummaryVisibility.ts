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
 *     official links are subscribers' too since owner ٣١٨ (28-Oct, reversing
 *     ٢٩٧'s public link); a guest gets the one public date «آخر تحديث
 *     تشريعي» instead (legislativeEvent.ts, computed by the routes).
 *   - the موجز a guest receives has its decree numbers and issue dates
 *     stripped on the server (owner ٣١٩, summaryForViewer in lawReaderExtras).
 *
 * library.laws.summary_brief stays column-locked for the anon key: the
 * catalogue (/api/library/init) and the law route read it, and the preamble
 * it is cut from, with the service role and send only these fields.
 *
 * Pure: `node --test` loads it directly.
 */

import {
  cardFieldOfCells,
  extractLawCard,
  extractLawPreambleBlocks,
  isHollowPreamble,
  isSeparatorRow,
  lawCardRanges,
  splitRow,
  stripPipelineNotes,
  type LawMetadataCard,
  type LawCardField,
} from "./lawPreambleBlocks.ts";
import { LAW_CARD_PRIMARY_FIELDS, type LawCardFieldId } from "./lawCardFields.ts";
import { formatHijriKey, hijriDateSortKey, summaryForViewer } from "./legislativeEvent.ts";

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
 * domain (official links are a subscriber's, ٣١٨; sent on their own fields).
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
 *   «حالة المراجعة» / «حالة الاكتمال» / «حالة اكتمال النص المستخرج»: the
 *   review notes («ملف جزئي…», «نص مقروء جزئياً — تلف في ترميز …»);
 *   «تاريخ الاستخراج» (42), «طريقة التفريغ» («Gemini Vision OCR…»),
 *   «الملف الأصلي (PDF)» (30), «عدد الصفحات المستخرجة» (2): how the file was made;
 *   «معيار التنسيق» (44) / «معيار الهيكلة» (10): «(V3.3 Zero-Details Protocol)»;
 *   «ملاحظة تحقق», «ملاحظة هيكلية», «⚠️ ملاحظة تكرار محتمل», «ملاحظة
 *   التحديث» («هذا الملف يوثّق …»): notes on our file.
 */
const PIPELINE_ROW_KEYS: ReadonlySet<string> = new Set([
  "حالة المراجعة", "حالة الاكتمال", "حالة اكتمال النص المستخرج",
  "تاريخ الاستخراج", "طريقة التفريغ", "الملف الأصلي (PDF)", "عدد الصفحات المستخرجة",
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
 *
 * Not notes: «تقريباً», «تقديري», «يقدَّر», «المرجَّح» on a date or a gazette
 * number. They say the date is approximate; without them an approximate date
 * reads as exact (review of 81295e33).
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
    "(?<!\\p{L})مرجح\\s+(?:إن|بثقة)", // «(محوّل المنصة مرجّح إن اختلف ±يوم)», «مرجَّح بثقة عالية»
    "غير\\s+محسوب", // «؛ المقابل الهجري غير محسوب»
    "بحسب\\s+(?:ال)?(?:مصدر|صفحة)",
    "(?:مصدر|نص|ديباجة)\\s+(?:المتاح|المستخدم)", // «غير مذكور في المصدر المستخدم», «بالمصدر المتاح»
    "(?:غير\\s+(?:مذكور|مسجل)|لم\\s+يرد)\\s+في\\s+(?:ال)?(?:مصدر|نص|غلاف)", // «تاريخ النشر غير مسجَّل في المصدر»
    "تعذر\\s+(?:احتساب|تحديد)",
    "أفضل\\s+تقدير|أقرب\\s+تصنيف|هذه\\s+الجولة", // «بأفضل تقدير متاح» is stripped in place (BEST_ESTIMATE)
    "الرابط\\s+المسجل", // «(الرابط المسجَّل سابقاً لا يفتح الوثيقة …)»: our link, not the law
    "(?:في|من)\\s+النص\\s+المستخرج", // «؛ الرقم المرجعي وتاريخ الإصدار غير واضحين في النص المستخرج» (09-20 export)
    "(?<!\\p{L})(?:و|ف)?(?:راجع|انظر)\\s+(?:ال)?(?:ملاحظة|حقل)", // «(تقديري، راجع ملاحظة تاريخ النفاذ)»
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
 * «مؤكَّد عبر ncar.gov.sa و…» leading an aside that goes on to cite: the lead
 * goes, the citation stays — «(مؤكَّد عبر ncar.gov.sa وجريدة أم القرى العدد
 * 4746 وتاريخ 1440/01/18هـ)» → «(جريدة أم القرى العدد 4746 وتاريخ 1440/01/18هـ)».
 */
const VERIFIED_VIA_LEAD = /م\p{M}*ؤ\p{M}*ك\p{M}*د\p{M}*\s+عبر\s+[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\s+و(?=\p{L})/gu;
/** «… الموافق 2025-12-14م بأفضل تقدير متاح»: the filler words go, the estimate stays. */
const BEST_ESTIMATE = /\s*(?:ب|و)?أ\p{M}*فضل\s+تقدير\p{M}*(?:\s+متاح\p{M}*)?/gu;
/**
 * Legal substance in an aside: a digit (an article, a date, a number), an
 * article / clause reference or a statutory period, on text without marks.
 */
const SUBSTANCE = /[0-9٠-٩]|(?<!\p{L})(?:ال)?(?:مادة|مواد|بند|فقرة)|(?<!\p{L})(?:يوما|أيام|شهرا|شهر|شهرين|أشهر|سنة|سنتين|سنوات)(?!\p{L})/u;

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

/** `s` split at each top-level match of `sep` (outside «(…)» / «[…]»), each piece with the separator before it. */
function splitOutside(s: string, sep: RegExp): Array<{ sep: string; text: string }> {
  const out: Array<{ sep: string; text: string }> = [];
  let depth = 0;
  let start = 0;
  let before = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0) {
      sep.lastIndex = i;
      const m = sep.exec(s);
      if (m && m[0]) {
        out.push({ sep: before, text: s.slice(start, i) });
        before = m[0];
        start = i + m[0].length;
        i = start - 1;
      }
    }
  }
  out.push({ sep: before, text: s.slice(start) });
  return out;
}

/** The top-level «(…)» asides of `s` (a link's target excluded), and `s` without them. */
function topLevelAsides(s: string): { asides: string[]; outside: string } {
  const asides: string[] = [];
  let outside = "";
  for (let i = 0; i < s.length; ) {
    const close = s[i] === "(" ? closingParen(s, i) : -1;
    if (close < 0) {
      outside += s[i++];
      continue;
    }
    if (s[i - 1] === "]") outside += s.slice(i, close + 1);
    else asides.push(s.slice(i + 1, close).trim());
    i = close + 1;
  }
  return { asides, outside };
}

const SEGMENT_SEP = /\s*،\s*/y;

/**
 * A clause that notes, less the note (owner ٢٥٩, review of 81295e33: never
 * drop legal content with a note). Its «،» segments are kept up to the first
 * that notes — «المادة (21) تنص على النفاذ من تاريخ النشر، وتاريخ النشر
 * الفعلي غير مؤكَّد …» → «المادة (21) تنص على النفاذ من تاريخ النشر». When
 * the clause OPENS with the note and the note carries an aside of substance,
 * the aside is what stays: «لم تُعثر عليها في المكتبة بعد (تصدر خلال 60
 * يوماً … وفق المادة 56)» → «تصدر خلال 60 يوماً … وفق المادة 56».
 */
function clauseLessNote(clause: string): string {
  const segments = splitOutside(clause, SEGMENT_SEP);
  const firstNote = segments.findIndex((seg) => hasGapNote(seg.text));
  if (firstNote > 0) {
    return segments
      .slice(0, firstNote)
      .map((seg, i) => (i ? seg.sep : "") + seg.text)
      .join("");
  }
  const { asides, outside } = topLevelAsides(segments[0]?.text ?? "");
  if (!hasGapNote(outside)) return "";
  // Words and substance: a bare «(2026-07-22)» after «تم التحقق المباشر» is the stamp's date.
  return asides.filter((a) => /\p{L}{2}/u.test(a) && !hasGapNote(a) && SUBSTANCE.test(unmarked(a))).join(" ");
}

/**
 * `text` less its gap notes: stamps go where they stand; an aside «(…)» is
 * cleaned inside out and goes when nothing is left of it; then a clause or
 * sentence that still notes loses its note (clauseLessNote). A markdown
 * link's target «](…)» is never touched.
 */
function withoutGapNotes(input: string): string {
  const text = input.replace(VERIFY_STAMP, "").replace(VERIFIED_VIA_LEAD, "").replace(BEST_ESTIMATE, "");
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
  let out = "";
  for (const c of splitOutside(s, CLAUSE_SEP)) {
    const kept = hasGapNote(c.text) ? clauseLessNote(c.text).replace(EDGE_PUNCT, "") : c.text;
    if (!kept.trim()) continue;
    out += out ? c.sep + kept : kept;
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
 *   «غير متوفر (الرابط المسجَّل سابقاً لا يفتح الوثيقة؛ لم يُعثر على بديل …)» → null;
 *   «لم تُعثر عليها في المكتبة بعد (تصدر خلال 60 يوماً … وفق المادة 56)» → «تصدر خلال 60 يوماً … وفق المادة 56»;
 *   «2024-06-05م تقريباً — وفق المادة (16) …» → as it is (an approximate date says so).
 * English in brackets stays outside a status row: a term's gloss in a subject
 * («(Red Teaming)»), an acronym «(GACA)», an identifier «(TC05)», «(PDF)».
 */
export function cardRowValue(value: string): string | null {
  if (!hasGapNote(value)) return value;
  return withoutGapNotes(value) || null;
}

/**
 * A row as every viewer sees it, or null: file rows dropped, notes removed
 * (a «[بوابة 6/تحقُّق حي …]» aside too — note ١٢ item ٧, stripPipelineNotes),
 * a status its words only.
 */
function rowTidy(f: LawCardField): LawCardField | null {
  if (PIPELINE_ROW_KEYS.has(normalCardKey(f.key))) return null;
  const stripped = stripPipelineNotes(f.value);
  if (!stripped) return null;
  let value = cardRowValue(stripped);
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

// ── The same rows where a reader shows the card's Markdown as it is ────────

/**
 * A precedent's card heading: «### بطاقة تعريف السابقة القضائية وبيانات
 * الحكم», with or without 📊 — in principles.text the table sometimes sits on
 * the heading line itself («… الحكم | الحقل | القيمة | | :--- | …»).
 */
const ANY_CARD_HEADING = /^[ \t]*#{1,6}[^\n]*(?:بطاقة تعريف|البطاقة التعريفية)[^\n]*$/gm;
/**
 * A card in a toggle whose summary has no 📊, so lawCardRanges does not lift
 * it: «<details><summary>🗂️ البطاقة التعريفية للنظام وبيانات التشريع</summary>»
 * — a second card some laws carry, which stays in the preamble a subscriber reads.
 */
const ANY_CARD_DETAILS = /<details[^>]*>\s*<summary>[^<]*(?:بطاقة تعريف|البطاقة التعريفية)[^<]*<\/summary>/g;

/** A «بطاقة تعريف» / «البطاقة التعريفية» toggle, to its own closing `</details>`. */
function cardDetailsBlocks(text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(ANY_CARD_DETAILS)) {
    const start = m.index ?? 0;
    const tag = /<details\b[^>]*>|<\/details>/g;
    tag.lastIndex = start;
    let depth = 0;
    for (let t = tag.exec(text); t; t = tag.exec(text)) {
      depth += t[0] === "</details>" ? -1 : 1;
      if (depth === 0) {
        out.push({ start, end: t.index + t[0].length });
        break;
      }
    }
  }
  return out;
}

/** A «بطاقة تعريف» heading and the blank / table lines right under it. */
function cardHeadingBlocks(text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(ANY_CARD_HEADING)) {
    const start = m.index ?? 0;
    let end = start + m[0].length;
    let sawTable = m[0].includes("|");
    const lineRe = /\n([^\n]*)/y;
    lineRe.lastIndex = end;
    for (let l = lineRe.exec(text); l; l = lineRe.exec(text)) {
      const line = l[1].trim();
      if (line.startsWith("|")) sawTable = true;
      else if (line !== "" || sawTable) break;
      end = lineRe.lastIndex;
    }
    if (sawTable) out.push({ start, end });
  }
  return out;
}

/** The rows of a table line: one, or several when the source collapsed the table onto one line. */
function rowsOfLine(tablePart: string): string[] {
  const parts = tablePart.trim().split(/\|[ \t]+\|/);
  return parts.map((p, i) => (i ? "|" : "") + p + (i < parts.length - 1 ? "|" : ""));
}

/**
 * One card block with every data row as rowTidy gives it: a placeholder or
 * file row out, notes removed, a status its words only, an unchanged row
 * byte for byte. A table left without data rows loses its header too, and
 * so does the sub-heading right above it («### 🔄 بيانات آخر تحديث»).
 */
function cleanCardBlock(block: string): string {
  type Line = { text: string; table: boolean; data: number; kept: number; drop: boolean };
  const lines = block.split("\n");
  const out: Line[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const bar = line.indexOf("|");
    if (bar < 0) {
      out.push({ text: line, table: false, data: 0, kept: 0, drop: false });
      continue;
    }
    const prefix = line.slice(0, bar);
    const rows = rowsOfLine(line.slice(bar));
    // The line's last row is a header when the next line opens with a separator.
    const next = lines[li + 1] ?? "";
    const nextFirst = next.trim().startsWith("|") ? rowsOfLine(next.slice(next.indexOf("|")))[0] : null;
    const kept: string[] = [];
    let data = 0;
    let keptData = 0;
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = splitRow(rows[ri]);
      const following = ri + 1 < rows.length ? rows[ri + 1] : nextFirst;
      if (cells.length < 2 || isSeparatorRow(cells) || (following !== null && isSeparatorRow(splitRow(following)))) {
        kept.push(rows[ri]); // a header, a separator, or not a key | value row
        continue;
      }
      data++;
      const field = cardFieldOfCells(cells);
      const tidy = field ? rowTidy(field) : null;
      if (!field || !tidy) continue; // a placeholder, a file row, or only a note
      keptData++;
      kept.push(tidy.value === field.value ? rows[ri] : `| ${cells[0]} | ${tidy.value.replace(/\n/g, "<br>")} |`);
    }
    if (data === 0) {
      out.push({ text: line, table: !prefix.trim(), data, kept: keptData, drop: false });
      continue;
    }
    // A collapsed table on a heading line with no data row left: the heading text stays.
    const rowsText = keptData === 0 ? "" : kept.join(" ");
    const text = prefix.trim() ? (rowsText ? prefix + rowsText : prefix.replace(/\s+$/, "")) : rowsText;
    out.push({ text, table: !prefix.trim(), data, kept: keptData, drop: text === "" });
  }
  // A multi-line table that lost every data row: header, separator and its sub-heading go.
  for (let i = 0; i < out.length; ) {
    if (!out[i].table) {
      i++;
      continue;
    }
    let j = i;
    let data = 0;
    let kept = 0;
    for (; j < out.length && out[j].table; j++) {
      data += out[j].data;
      kept += out[j].kept;
    }
    if (data > 0 && kept === 0) {
      for (let k = i; k < j; k++) out[k].drop = true;
      let h = i - 1;
      while (h >= 0 && (out[h].drop || out[h].text.trim() === "")) h--;
      if (h >= 0 && /^[ \t]*#{1,6}\s/.test(out[h].text) && !out[h].text.includes("بطاقة تعريف")) out[h].drop = true;
    }
    i = j;
  }
  return out
    .filter((l) => !l.drop)
    .map((l) => l.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Owner ٢٥٩ (أ) where a reader shows the card's Markdown as it is — a
 * decree's ديباجة (the decree route, subscribers only: owner ٢٢١) and a
 * precedent's text (principles.text, whose «بطاقة تعريف السابقة القضائية»
 * table the reader prints): every card row as the law card gives it
 * (rowTidy) — and the law's own preamble, where a second card the reader
 * cannot lift («🗂️ البطاقة التعريفية …») stays (lawReaderExtras), and a
 * decree page that opens with the card. Only the card blocks are touched —
 * lawCardRanges' 📊 cards, any «بطاقة تعريف» / «البطاقة التعريفية» toggle
 * or heading with its table — never a table of the text itself. A text
 * with nothing to clean comes back as it was (same string).
 */
export function withCleanCardRows(input: string): string {
  if (typeof input !== "string" || !/بطاقة تعريف|البطاقة التعريفية/.test(input)) return input;
  const text = input.replace(/\r\n/g, "\n");
  const ranges = [...lawCardRanges(text), ...cardDetailsBlocks(text), ...cardHeadingBlocks(text)].sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const r of ranges) {
    if (r.end <= at) continue;
    const start = Math.max(r.start, at);
    out += text.slice(at, start) + cleanCardBlock(text.slice(start, r.end));
    at = r.end;
  }
  out += text.slice(at);
  return out === text ? input : out;
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
  // A card left in the text («🗂️ البطاقة التعريفية …»): its rows as the card's (owner ٢٥٩).
  const out: LawReaderExtras = { preamble: lifted && isHollowPreamble(blocks.rest) ? "" : withCleanCardRows(blocks.rest) };
  // Owner ٣١٩ (ب): the موجز stays open to everyone, but a non-subscriber's
  // copy loses its decree numbers and issue dates HERE, on the server — a
  // line that still cites after the cleaning is dropped (fail closed). A
  // موجز left empty by that is omitted, label and all.
  const summary = summaryForViewer(blocks.summary, isSubscriber);
  if (summary.trim()) {
    out.summary = summary;
    out.summaryLabel = blocks.summaryLabel;
  }
  const card = cardForViewer(blocks.metadataCard, isSubscriber);
  if (card) out.metadata_card = card;
  return out;
}

/**
 * The regulation part of a merged file (splitStoredPreamble's
 * `regulationPreamble`) for one viewer: its identity card lifted out for
 * the sidebar's regulation group (owner note ٠١ item ٥) — as cardForViewer
 * gives it — and the regulation preamble without it, its rows cleaned
 * (withCleanCardRows). A regulation preamble with no card comes back as
 * withCleanCardRows gives it, with no card.
 */
export function regulationReaderExtras(
  regulationPreamble: string,
  isSubscriber: boolean,
): { preamble: string; card: LawMetadataCard | null } {
  const { card, rest } = extractLawCard(regulationPreamble);
  if (!card) return { preamble: withCleanCardRows(regulationPreamble), card: null };
  return {
    preamble: isHollowPreamble(rest) ? "" : withCleanCardRows(rest),
    card: cardForViewer(card, isSubscriber),
  };
}

/**
 * Keys of library.laws.latest_update (the owner's frontmatter, jsonb) that
 * describe the event, in order of preference. Only `date_hijri`,
 * `instrument` and `attachment_pdf` are seen in the owner's notes (note ١٤
 * item ٩: `latest_update.instrument` leaks review notes in 220 files); the
 * others are read defensively should a file carry them.
 */
const LATEST_UPDATE_TEXT_KEYS = ["event", "description", "type", "instrument"] as const;

/**
 * Owner note ٠١ item ٢: «آخر تعديل» from library.laws.latest_update for a
 * SUBSCRIBER — the date, and what happened in a short parenthesis:
 * «1448/01/08هـ (صدور اللائحة التنفيذية — قرار مجلس الوزراء رقم (43))».
 * The description loses its pipeline notes (stripPipelineNotes, cardRowValue)
 * and the date it repeats; a description that still reads as a note goes,
 * leaving the date alone. '' for a non-subscriber (T28-22 / ٣١٨: a guest
 * sees the public date «آخر تحديث تشريعي» only), or when there is no
 * readable Hijri date.
 */
export function latestUpdateDetail(latestUpdate: unknown, isSubscriber: boolean): string {
  if (!isSubscriber || !latestUpdate || typeof latestUpdate !== "object" || Array.isArray(latestUpdate)) return "";
  const lu = latestUpdate as Record<string, unknown>;
  const date = formatHijriKey(hijriDateSortKey(lu.date_hijri));
  if (!date) return "";
  const parts: string[] = [];
  for (const k of LATEST_UPDATE_TEXT_KEYS) {
    const raw = lu[k];
    if (typeof raw !== "string" || !raw.trim()) continue;
    let v = cardRowValue(stripPipelineNotes(raw)) ?? "";
    // The date it repeats («… وتاريخ 1448/01/08هـ»): said once, outside.
    v = v.replace(/\s*(?:و|ب)?(?:تاريخ|بتاريخ)?\s*[0-9٠-٩]{1,4}\s*[/-]\s*[0-9٠-٩]{1,2}\s*[/-]\s*[0-9٠-٩]{1,4}\s*(?:هـ|ه)?/gu, "");
    v = v.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/[\s،؛:,;—–-]+$/u, "").trim();
    // An English token («amendment») or a note is not shown.
    if (!v || !/\p{Script=Arabic}/u.test(v) || hasNoteWord(v) || parts.some((p) => p === v)) continue;
    parts.push(v);
  }
  return parts.length ? `${date} (${parts.join(" — ")})` : date;
}
