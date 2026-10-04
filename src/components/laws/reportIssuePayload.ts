/**
 * reportIssuePayload.ts — compose the reader's «أبلغ عن خطأ في هذه المادة»
 * body (T28-28, owner test 2026-09-28).
 * ─────────────────────────────────────────────────────────────────────────────
 * Four reader-facing categories ride the EXISTING `library_issue_reports.kind`
 * values (CHECK: typo, wrong_text, missing_article, outdated, other) — no
 * migration. The two that share `other` are told apart by a short prefix on
 * the description so the admin list can still see which one it was.
 *
 * The body is composed inside the server's own bounds (feedbackInput.ts):
 *   articleRef ≤ 100 chars — the article's display label only. It used to be
 *     «num — lawTitle», which passed 100 on long titles and came back 400;
 *   description 5..2000 chars after trim — the 5-char minimum is applied to
 *     the reader's OWN text, so a bare «[اقتراح] » prefix never counts;
 *   the optional highlighted text is quoted after the note, capped at 500.
 *
 * Pure (its one import is pure): `node --test src/components/laws/reportIssuePayload.test.ts`.
 */

import {
  ARTICLE_REF_MAX,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_DESCRIPTION_MIN,
  type LibraryIssueKindInput,
} from "../../lib/services/feedbackInput.ts";

export type ReportCategoryId = "text_error" | "technical" | "missing_or_unmerged" | "suggestion";

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  kind: LibraryIssueKindInput;
  /** Prepended to the description to tell apart categories that share a kind. */
  prefix: string;
}

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  { id: "text_error", label: "خطأ نصي أو تصحيف في المادة", kind: "wrong_text", prefix: "" },
  { id: "technical", label: "مشكلة تقنية في الصفحة", kind: "other", prefix: "[مشكلة تقنية] " },
  { id: "missing_or_unmerged", label: "نقص في اللائحة أو تعديل لم يُدمج", kind: "missing_article", prefix: "" },
  { id: "suggestion", label: "اقتراح أو ملاحظة عامة", kind: "other", prefix: "[اقتراح] " },
] as const;

export const HIGHLIGHT_MAX = 500;
const HIGHLIGHT_OPEN = "\n\nالنص المظلل: «";
const HIGHLIGHT_CLOSE = "»";
const LONGEST_PREFIX = Math.max(...REPORT_CATEGORIES.map((c) => c.prefix.length));

/**
 * The textarea's maxLength: whatever the longest prefix and a full highlight
 * quote leave of the server's 2000, so the composed body always fits.
 */
export const REPORT_TEXT_MAX =
  ISSUE_DESCRIPTION_MAX - LONGEST_PREFIX - HIGHLIGHT_OPEN.length - HIGHLIGHT_MAX - HIGHLIGHT_CLOSE.length;

export function reportCategory(id: ReportCategoryId): ReportCategory {
  return REPORT_CATEGORIES.find((c) => c.id === id) ?? REPORT_CATEGORIES[0];
}

/** The reader's own note is long enough to send (the server's 5-char rule, on the note alone). */
export function reportTextIsValid(text: string): boolean {
  return text.trim().length >= ISSUE_DESCRIPTION_MIN;
}

/** Collapse whitespace and cap the highlight; "" when there is none. */
export function capHighlight(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= HIGHLIGHT_MAX) return s;
  return `${s.slice(0, HIGHLIGHT_MAX - 1).trimEnd()}…`;
}

/** The article's display label, trimmed to the server's 100-char column. */
export function reportArticleRef(label: string | null | undefined): string {
  return String(label ?? "").replace(/\s+/g, " ").trim().slice(0, ARTICLE_REF_MAX);
}

export interface IssueReportBody {
  kind: LibraryIssueKindInput;
  description: string;
  articleRef: string;
}

export function buildIssueReport(input: {
  categoryId: ReportCategoryId;
  text: string;
  highlight?: string | null;
  articleLabel?: string | null;
}): IssueReportBody {
  const category = reportCategory(input.categoryId);
  const highlight = capHighlight(input.highlight);
  const note = `${category.prefix}${input.text.trim()}`;
  const quote = highlight ? `${HIGHLIGHT_OPEN}${highlight}${HIGHLIGHT_CLOSE}` : "";
  // The textarea's maxLength already keeps this under the cap; the slice is a
  // guard for a caller that skipped it — the note is kept whole before the quote.
  const description = `${note.slice(0, ISSUE_DESCRIPTION_MAX)}${quote}`.slice(0, ISSUE_DESCRIPTION_MAX);
  return { kind: category.kind, description, articleRef: reportArticleRef(input.articleLabel) };
}
