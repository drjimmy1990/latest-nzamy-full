/**
 * najizDraftLink — «ابدأ صياغة هذه الدعوى» on a «دليل ناجز» type card
 * (owner package 13 Nov, N06-6..10): the link to the legal drafter with the
 * najiz court, class and type, and what /ai/draft prefills from it.
 *
 * /ai/draft reads `?from=najiz&court=…&class=…&type=…` and fills ONLY fields
 * its form already has:
 *   - notesText («ملاحظات ومرئيات»): «تصنيف الدعوى في ناجز: المحكمة › التصنيف › النوع» —
 *     it reaches the AI run (facts.notes) and the team order (lawyerNotes);
 *   - memoType «case» (تحرير دعوى) — except for the إنهاءات, which are not claims;
 *   - legalBranch, only where the court names one of the form's branches
 *     without doubt (الأحوال الشخصية، التجارية، العمالية، الجزائية، التنفيذ).
 *     The general courts and the إنهاءات get none: the person picks.
 * The sub-type and the client's role are never guessed.
 *
 * The params are URL input that ends up in a prompt: control characters
 * dropped, spaces collapsed, each capped; rendered as text only.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */
import { najizBreadcrumb } from "./najizSearch.ts";

export const NAJIZ_DRAFT_FROM = "najiz";
export const NAJIZ_DRAFT_PATH = "/ai/draft";
/** Longest court / class / type text read from the URL (the guide's longest title is 65). */
export const NAJIZ_PARAM_MAX = 200;

export function najizDraftHref(court: { title: string }, klass: { title: string }, type: { name: string }): string {
  const params = new URLSearchParams({ from: NAJIZ_DRAFT_FROM, court: court.title, class: klass.title, type: type.name });
  return `${NAJIZ_DRAFT_PATH}?${params.toString()}`;
}

/** Court title → a branch of the drafter's LEGAL_BRANCHES_REGULAR (draftConstants.ts). */
const COURT_BRANCH: readonly [RegExp, string][] = [
  [/الأحوال الشخصية/, "أسرة (أحوال شخصية)"],
  [/التجارية/, "تجاري"],
  [/العمالية/, "عمالي"],
  [/الجزائية/, "جزائي"],
  [/التنفيذ/, "تنفيذ"],
];

export interface NajizDraftSeed {
  court: string;
  klass: string;
  type: string;
  /** المحكمة › التصنيف › النوع */
  path: string;
  memoType: "case" | "";
  legalBranch: string;
  notesText: string;
}

function clean(value: string | null | undefined): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, NAJIZ_PARAM_MAX).join("").trim();
}

/** What /ai/draft prefills from its URL, or null when it was not opened from «دليل ناجز». */
export function najizDraftSeed(get: (key: string) => string | null): NajizDraftSeed | null {
  if (get("from") !== NAJIZ_DRAFT_FROM) return null;
  const court = clean(get("court"));
  const klass = clean(get("class"));
  const type = clean(get("type"));
  if (!court || !klass || !type) return null;
  const path = najizBreadcrumb({ title: court }, { title: klass }, { name: type }).text;
  return {
    court,
    klass,
    type,
    path,
    memoType: /الإنهاءات/.test(court) ? "" : "case",
    legalBranch: COURT_BRANCH.find(([re]) => re.test(court))?.[1] ?? "",
    notesText: `تصنيف الدعوى في ناجز: ${path}`,
  };
}
