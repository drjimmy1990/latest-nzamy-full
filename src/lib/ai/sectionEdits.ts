/**
 * sectionEdits.ts — «عدّل هذا القسم» (the revisions, «التنقيح») in «الصائغ القانوني» (legal-drafter).
 *
 * Owner ١٦٦ (22 Nov 2026, batch l13): «التنقيح مشمول في سعر المذكرة، حتى ٥
 * تعديلات». A memo (one drafter conversation) takes up to N section edits, all
 * included in the price already paid for the memo (price 0); edit N+1 is
 * refused with a clear message (start a new memo). N is the admin setting
 * `drafter_revisions_per_memo` = {"included": N}, 5 until saved.
 *
 * This replaces owner ٤١٠ (batch 2026-11-08 B3: 5 free per memo, at most 2
 * free per section, then 10 points per edit): there is no paid edit and no
 * per-section cap any more.
 *
 * The counts come from the conversation's own runs, read on the server
 * (runCore), never from the browser: a run that failed (and was refunded) is not
 * read, so it does not use an edit. The same ceiling is applied again under the
 * start lock in SQL (public.ai_start_section_edit, 20261108_40, called with
 * free-per-memo = free-per-section = max-per-memo = N and a paid price of 0), so
 * two edits at once cannot both take the last one.
 *
 * Pure: `node --test` runs it, and the draft screen reads the same quote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SECTION_EDIT_PHASE = "section";
/** Technical ceiling (not the owner's): the setting's highest value, and the conversation window (tools.ts). */
export const SECTION_EDIT_MAX_PER_MEMO = 30;
/** Owner ١٦٦: revisions included in the memo price, until the admin saves another number. */
export const SECTION_EDITS_INCLUDED_DEFAULT = 5;
/** The admin setting that holds N. */
export const SECTION_EDITS_SETTING_KEY = "drafter_revisions_per_memo";
/** The edit instruction the lawyer types. */
export const SECTION_INSTRUCTION_MAX = 1000;

export interface SectionEditCounts {
  /** Section edits of the memo that did not fail (running or succeeded). */
  total: number;
  /** Of those, the ones priced 0 (kept for the server's 409 details; owner ٤١٠ history). */
  freeMemo: number;
  /** Price-0 edits per section index (same). */
  freeBySection: Record<number, number>;
}

export const NO_SECTION_EDITS: SectionEditCounts = Object.freeze({ total: 0, freeMemo: 0, freeBySection: Object.freeze({}) }) as SectionEditCounts;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ── the admin setting ───────────────────────────────────────────────────────

/** {"included": N} → N (0..30); anything else → the default 5. */
export function sectionEditsIncludedFrom(value: unknown): number {
  if (!isPlainObject(value)) return SECTION_EDITS_INCLUDED_DEFAULT;
  const n = value.included;
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= SECTION_EDIT_MAX_PER_MEMO ? (n as number) : SECTION_EDITS_INCLUDED_DEFAULT;
}

/** The admin settings validator: an error string, or null. */
export function sectionEditsIncludedIssue(value: unknown): string | null {
  const ok =
    isPlainObject(value) &&
    Object.keys(value).length === 1 &&
    Number.isInteger(value.included) &&
    (value.included as number) >= 0 &&
    (value.included as number) <= SECTION_EDIT_MAX_PER_MEMO;
  return ok ? null : `قيمة ${SECTION_EDITS_SETTING_KEY} يجب أن تكون بالشكل {"included": عدد صحيح من 0 إلى ${SECTION_EDIT_MAX_PER_MEMO}}`;
}

/** N from platform_settings; a failed read gives the default (every edit is free either way). */
export async function readSectionEditsIncluded(admin: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", SECTION_EDITS_SETTING_KEY).maybeSingle();
    if (error) return SECTION_EDITS_INCLUDED_DEFAULT;
    return sectionEditsIncludedFrom((data as { value?: unknown } | null)?.value);
  } catch {
    return SECTION_EDITS_INCLUDED_DEFAULT;
  }
}

const included = (n: unknown) =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= SECTION_EDIT_MAX_PER_MEMO ? (n as number) : SECTION_EDITS_INCLUDED_DEFAULT;

// ── the counts and the quote ────────────────────────────────────────────────

/** A section index as stored in a run's input, or null. */
export function sectionIndexOf(input: unknown): number | null {
  if (!isPlainObject(input) || input.phase !== SECTION_EDIT_PHASE) return null;
  const n = input.section_index;
  return Number.isInteger(n) && (n as number) >= 0 ? (n as number) : null;
}

/**
 * The memo's section edits so far, from its runs as runCore reads them (only
 * running / review / succeeded rows; a failed run is never passed in). Every
 * such edit counts toward the memo's included revisions, paid ones from before
 * owner ١٦٦ included.
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

/** Has this memo used all its included revisions? Unknown counts → yes (never an edit by mistake). */
export function sectionEditsExhausted(counts: SectionEditCounts | null | undefined, includedPerMemo: number = SECTION_EDITS_INCLUDED_DEFAULT): boolean {
  return !counts || counts.total >= included(includedPerMemo);
}

export interface SectionEditQuote {
  /** Always true when allowed: the edit is included in the memo price. */
  free: boolean;
  /** Always 0: an edit is never charged (owner ١٦٦). */
  price: number;
  /** Included revisions left on the memo. */
  left: number;
  /** The memo's included revisions (the admin setting). */
  included: number;
  /** All of them are used: the edit is refused. */
  limitReached: boolean;
}

/** What editing a section of this memo means now. */
export function sectionEditQuote(
  counts: SectionEditCounts | null | undefined,
  _index: number,
  includedPerMemo: number = SECTION_EDITS_INCLUDED_DEFAULT,
): SectionEditQuote {
  const n = included(includedPerMemo);
  const used = counts ? counts.total : n;
  const left = Math.max(0, n - used);
  return { free: left > 0, price: 0, left, included: n, limitReached: left === 0 };
}

/** The price `price()` charges for a section edit: always 0, it is included in the memo price (owner ١٦٦). */
export function sectionEditPrice(_counts?: SectionEditCounts | null, _index?: unknown): number {
  return 0;
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

/** «التعديلات المشمولة في سعر المذكرة: بقي ٣ من ٥» */
export function sectionEditAllowanceText(q: SectionEditQuote): string {
  return `التعديلات المشمولة في سعر المذكرة: بقي ${ar(q.left)} من ${ar(q.included)}`;
}

/** The line shown before the lawyer confirms. */
export function sectionEditPriceText(q: SectionEditQuote): string {
  return q.limitReached ? sectionEditLimitText(q.included) : "هذا التعديل مشمول في سعر المذكرة، دون نقاط إضافية";
}

/** The refusal of edit N+1. */
export function sectionEditLimitText(includedPerMemo: number = SECTION_EDITS_INCLUDED_DEFAULT): string {
  const n = included(includedPerMemo);
  return n === 0
    ? "تعديل الأقسام غير متاح على هذه المذكرة — ابدأ صياغة جديدة"
    : `استُخدمت التعديلات المشمولة في سعر هذه المذكرة كلها (${ar(n)}) — ابدأ صياغة جديدة لمذكرة أخرى`;
}

export const SECTION_EDIT_COPY = {
  needDraft: "اكتب المذكرة أولاً، ثم عدّل أقسامها",
  waitDraft: "لم تكتمل كتابة المذكرة بعد — انتظرها ثم عدّل أقسامها",
  draftDone: "المذكرة مكتوبة — عدّل قسماً منها أو ابدأ صياغة جديدة",
  badSection: "القسم المطلوب غير موجود في هذه المذكرة",
  instruction: `اكتب ما تريد تعديله في القسم (حتى ${ar(SECTION_INSTRUCTION_MAX)} حرف)`,
  section: "نص القسم غير صالح",
  priceChanged: "تغيّر عدد التعديلات المتبقية على هذه المذكرة (استُخدم تعديل في طلب آخر) — راجعه وأكّد من جديد",
  unavailable: "تعديل الأقسام غير متاح بعد — حاول لاحقاً",
} as const;
