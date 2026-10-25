/**
 * lawCardFields — which rows of a law's identity card are always shown and
 * which wait behind «المزيد» (owner answer ٢٦١: five fields always, the rest
 * behind one button).
 *
 * THE LIST is LAW_CARD_PRIMARY_FIELDS below. Owner question ٢٩٧ asks which
 * five; until he answers, it is the default he was offered (أ): النوع، تاريخ
 * الإصدار، آخر تعديل، الحالة، الجهة المصدرة. Changing the five is a change to
 * that one array (drop, add or reorder an entry).
 *
 * Each field names the card keys it reads, matched EXACTLY (after trimming):
 * «تاريخ النشر» is a publication date and never fills «تاريخ الإصدار». The
 * keys are the ones measured on last_owner «أنظمة ولوائح» (2026-10-25, 1,560
 * cards): the main table and the «➕ المزيد» table are pooled, because the
 * files put «تاريخ الإصدار» (883 of 1,051) and «الجهة المصدرة» (854 of 1,497)
 * mostly in the ➕ table.
 *
 * الحالة comes from the database (library.laws.status through
 * lawStatusPresentation), the same value as the catalogue and the repealed
 * banner, and only when one is recorded (owner ٢٥٩). The file's own
 * «حالة التشريع» row then goes behind «المزيد» — unless it says exactly the
 * same as the badge, when it is not repeated. With no recorded status the
 * file's row is the status field, if the card has one; else there is none.
 *
 * Values are never invented: a field the card does not have is absent
 * (except تاريخ الإصدار, which falls back to library.laws.issue_date_hijri
 * when the caller passes it — the subscriber-only database value).
 *
 * Pure: `node --test` loads it directly.
 */

import type { LawCardField, LawMetadataCard } from "./lawPreambleBlocks.ts";

export type LawCardFieldId = "type" | "issueDate" | "lastAmendment" | "status" | "issuer";

export interface LawCardFieldSpec {
  id: LawCardFieldId;
  /** The label the sidebar prints when the value does not come from a card row. */
  label: string;
  /** Card keys that fill the field, in order of preference (exact match). */
  keys: readonly string[];
}

/** Owner ٢٦١ / ٢٩٧ (default أ): the fields always shown, in display order. */
export const LAW_CARD_PRIMARY_FIELDS: readonly LawCardFieldSpec[] = [
  { id: "type", label: "النوع", keys: ["نوع التشريع", "نوع الوثيقة", "نوع المستند"] },
  { id: "issueDate", label: "تاريخ الإصدار", keys: ["تاريخ الإصدار", "تاريخ الإصدار (هجري)", "تاريخ الإصدار (ميلادي)"] },
  {
    id: "lastAmendment",
    label: "آخر تعديل",
    keys: ["آخر تعديل", "أداة آخر تعديل", "أداة إصدار آخر تعديل", "آخر تحديث", "أداة آخر تحديث", "أداة إصدار آخر تحديث"],
  },
  { id: "status", label: "الحالة", keys: ["حالة التشريع"] },
  { id: "issuer", label: "الجهة المصدرة", keys: ["الجهة المصدرة", "الجهة الإدارية المصدرة"] },
];

/** The values the sidebar already treats as "nothing to show". */
const EMPTY_VALUES = new Set(["لا يوجد", "غير متوفر", "غير محدد", "لا يتوفر", "غير متوفرة", "غير مبينة"]);

export function isShownCardValue(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v !== "" && !EMPTY_VALUES.has(v);
}

export interface LawStatusBadge {
  labelAr: string;
  labelEn: string;
  tone: string;
}

export type LawCardPrimaryField =
  | { id: LawCardFieldId; source: "card"; key: string; value: string }
  | { id: "status"; source: "db"; key: string; value: string; badge: LawStatusBadge }
  | { id: "issueDate"; source: "db"; key: string; value: string };

export interface LawCardLayout {
  /** The always-shown fields, in LAW_CARD_PRIMARY_FIELDS order; absent ones left out. */
  primary: LawCardPrimaryField[];
  /** Every other card row, file order (main table, then the ➕ table): behind «المزيد». */
  more: LawCardField[];
}

export interface LawCardLayoutInput {
  /** lawStatusPresentation(law.law_status): null when no status is recorded. */
  status?: LawStatusBadge | null;
  /** library.laws.issue_date_hijri as the law route sent it ('' when withheld). */
  issueDate?: string | null;
  /** The field list; LAW_CARD_PRIMARY_FIELDS unless a test passes another. */
  fields?: readonly LawCardFieldSpec[];
}

export function lawCardLayout(card: LawMetadataCard, input: LawCardLayoutInput = {}): LawCardLayout {
  const fields = input.fields ?? LAW_CARD_PRIMARY_FIELDS;
  const rows = [...card.main, ...card.more].filter((f) => isShownCardValue(f.value));
  const used = new Set<LawCardField>();
  const take = (keys: readonly string[]): LawCardField | undefined => {
    for (const key of keys) {
      const row = rows.find((f) => !used.has(f) && f.key.trim() === key);
      if (row) {
        used.add(row);
        return row;
      }
    }
    return undefined;
  };

  const primary: LawCardPrimaryField[] = [];
  for (const spec of fields) {
    if (spec.id === "status" && input.status) {
      const badge = input.status;
      primary.push({ id: "status", source: "db", key: spec.label, value: badge.labelAr, badge });
      // The file's own status row: not repeated when it says the same thing.
      for (const key of spec.keys) {
        for (const f of rows) {
          if (!used.has(f) && f.key.trim() === key && f.value.trim() === badge.labelAr) used.add(f);
        }
      }
      continue;
    }
    const row = take(spec.keys);
    if (row) {
      primary.push({ id: spec.id, source: "card", key: row.key, value: row.value });
    } else if (spec.id === "issueDate" && isShownCardValue(input.issueDate)) {
      primary.push({ id: "issueDate", source: "db", key: spec.label, value: String(input.issueDate).trim() });
    }
  }
  return { primary, more: rows.filter((f) => !used.has(f)) };
}
