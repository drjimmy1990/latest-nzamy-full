/**
 * sectionEdits.ts — owner ٤١٠ «عدّل هذا القسم» in «الصائغ القانوني» (legal-drafter).
 *
 * Owner: «يُمنح المستخدم ٥ تعديلات مجانية على المذكرة ككل، بسقف تعديلين كحد أقصى
 * للقسم الواحد، وما زاد يكون بـ 10 نقاط لكل تعديل قسم إضافي (توليد جزئي للقسم
 * المستهدف فقط).»
 *
 * Controller ruling (batch 2026-11-08, B3): an edit is FREE while the memo (one
 * drafter conversation) has used fewer than 5 free edits AND that section has
 * used fewer than 2 free edits. Every other edit costs 10 points, debited at
 * start and refunded only on a technical failure, like any other run. There is
 * no hard stop per section (asked of the owner); a memo takes at most 30 section
 * edits in all (a technical ceiling).
 *
 * The counts come from the conversation's own runs, read on the server
 * (runCore), never from the browser: a run that failed (and was refunded) is not
 * read, so it does not use a free edit. A run is a free edit when it was priced
 * 0 (ai_runs.price_points, recorded whether or not points are enforced). The
 * same rule is applied again under the start lock in SQL
 * (public.ai_start_section_edit, 20261108_40), so two edits at once cannot both
 * take the last free one.
 *
 * Pure: `node --test` runs it, and the draft screen reads the same quote.
 */

export const SECTION_EDIT_PHASE = "section";
export const SECTION_EDIT_FREE_PER_MEMO = 5;
export const SECTION_EDIT_FREE_PER_SECTION = 2;
export const SECTION_EDIT_PRICE = 10;
/** Technical ceiling (not the owner's): section edits per memo, free and paid together. */
export const SECTION_EDIT_MAX_PER_MEMO = 30;
/** The edit instruction the lawyer types. */
export const SECTION_INSTRUCTION_MAX = 1000;

export interface SectionEditCounts {
  /** Section edits of the memo that did not fail (running or succeeded). */
  total: number;
  /** Of those, the free ones. */
  freeMemo: number;
  /** Free edits per section index. */
  freeBySection: Record<number, number>;
}

export const NO_SECTION_EDITS: SectionEditCounts = Object.freeze({ total: 0, freeMemo: 0, freeBySection: Object.freeze({}) }) as SectionEditCounts;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A section index as stored in a run's input, or null. */
export function sectionIndexOf(input: unknown): number | null {
  if (!isPlainObject(input) || input.phase !== SECTION_EDIT_PHASE) return null;
  const n = input.section_index;
  return Number.isInteger(n) && (n as number) >= 0 ? (n as number) : null;
}

/**
 * The memo's section edits so far, from its runs as runCore reads them (only
 * running / review / succeeded rows; a failed run is never passed in). A row
 * whose price is unknown counts as free: the count can then only make the next
 * edit dearer, never give one away.
 */
export function countSectionEdits(
  prior: ReadonlyArray<{ input: unknown; status: string; price_points?: unknown; output?: unknown }>,
): SectionEditCounts {
  const freeBySection: Record<number, number> = {};
  let total = 0;
  let freeMemo = 0;
  for (const r of prior) {
    if (r.status === "failed") continue;
    const index = sectionIndexOf(r.input);
    if (index === null) continue;
    total += 1;
    const paid = typeof r.price_points === "number" && r.price_points > 0;
    if (paid) continue;
    freeMemo += 1;
    freeBySection[index] = (freeBySection[index] ?? 0) + 1;
  }
  return { total, freeMemo, freeBySection };
}

export interface SectionEditQuote {
  free: boolean;
  price: number;
  /** Free edits left on the memo, 0..5. */
  memoFreeLeft: number;
  /** Free edits left on this section, 0..2 (never more than the memo's). */
  sectionFreeLeft: number;
  /** The technical ceiling is reached: no edit at any price. */
  limitReached: boolean;
}

/** What editing section `index` costs now. Unknown counts → paid (never a free edit by mistake). */
export function sectionEditQuote(counts: SectionEditCounts | null | undefined, index: number): SectionEditQuote {
  if (!counts) {
    return { free: false, price: SECTION_EDIT_PRICE, memoFreeLeft: 0, sectionFreeLeft: 0, limitReached: false };
  }
  const memoFreeLeft = Math.max(0, SECTION_EDIT_FREE_PER_MEMO - counts.freeMemo);
  const sectionFreeLeft = Math.min(memoFreeLeft, Math.max(0, SECTION_EDIT_FREE_PER_SECTION - (counts.freeBySection[index] ?? 0)));
  const free = sectionFreeLeft > 0;
  return {
    free,
    price: free ? 0 : SECTION_EDIT_PRICE,
    memoFreeLeft,
    sectionFreeLeft,
    limitReached: counts.total >= SECTION_EDIT_MAX_PER_MEMO,
  };
}

/** The price `price()` charges; missing counts are paid. */
export function sectionEditPrice(counts: SectionEditCounts | null | undefined, index: unknown): number {
  if (!Number.isInteger(index) || (index as number) < 0) return SECTION_EDIT_PRICE;
  return sectionEditQuote(counts, index as number).price;
}

/** The counts after one more edit of `index` at `price` (the screen's own tally between server reads). */
export function withSectionEdit(counts: SectionEditCounts, index: number, price: number): SectionEditCounts {
  const free = price === 0;
  return {
    total: counts.total + 1,
    freeMemo: counts.freeMemo + (free ? 1 : 0),
    freeBySection: free ? { ...counts.freeBySection, [index]: (counts.freeBySection[index] ?? 0) + 1 } : { ...counts.freeBySection },
  };
}

/** Counts sent back by the server (409 price_changed), or null when they are not that shape. */
export function asSectionEditCounts(v: unknown): SectionEditCounts | null {
  if (!isPlainObject(v) || !Number.isInteger(v.total) || !Number.isInteger(v.freeMemo) || !isPlainObject(v.freeBySection)) return null;
  const freeBySection: Record<number, number> = {};
  for (const [k, n] of Object.entries(v.freeBySection)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || !Number.isInteger(n)) return null;
    freeBySection[i] = n as number;
  }
  return { total: v.total as number, freeMemo: v.freeMemo as number, freeBySection };
}

const ar = (n: number) => n.toLocaleString("ar-SA");

/** «تعديلات مجانية متبقية: ٣ من ٥ — هذا القسم: ١ من ٢» */
export function sectionEditAllowanceText(q: SectionEditQuote): string {
  return `تعديلات مجانية متبقية: ${ar(q.memoFreeLeft)} من ${ar(SECTION_EDIT_FREE_PER_MEMO)} — هذا القسم: ${ar(q.sectionFreeLeft)} من ${ar(SECTION_EDIT_FREE_PER_SECTION)}`;
}

/** The price line shown before the lawyer confirms. */
export function sectionEditPriceText(q: SectionEditQuote): string {
  return q.free ? "هذا التعديل مجاني" : `هذا التعديل بـ ${ar(q.price)} نقاط`;
}

export const SECTION_EDIT_COPY = {
  needDraft: "اكتب المذكرة أولاً، ثم عدّل أقسامها",
  waitDraft: "لم تكتمل كتابة المذكرة بعد — انتظرها ثم عدّل أقسامها",
  draftDone: "المذكرة مكتوبة — عدّل قسماً منها أو ابدأ صياغة جديدة",
  badSection: "القسم المطلوب غير موجود في هذه المذكرة",
  limit: `بلغت هذه المذكرة الحد الأقصى لتعديل الأقسام (${ar(SECTION_EDIT_MAX_PER_MEMO)} تعديلاً) — ابدأ صياغة جديدة`,
  instruction: `اكتب ما تريد تعديله في القسم (حتى ${ar(SECTION_INSTRUCTION_MAX)} حرف)`,
  section: "نص القسم غير صالح",
  priceChanged: "تغيّر سعر هذا التعديل (استُخدم تعديل مجاني في طلب آخر) — راجع السعر وأكّد من جديد",
  unavailable: "تعديل الأقسام غير متاح بعد — حاول لاحقاً",
} as const;
