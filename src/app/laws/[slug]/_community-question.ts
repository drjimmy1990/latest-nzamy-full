/**
 * The readers' «اسأل في المجتمع القانوني» window (N05-L9 / owner F-22): what it
 * posts through POST /api/v1/community/posts (communityService
 * createCommunityPost), the same route /community/ask uses. Pure, so
 * `node --test` loads it.
 *
 * The categories are /community/ask's six, so a question from a reader lands
 * in a category the community page can filter on. A post carries no display
 * name (the feed shows «عضو في المجتمع» for every real post), so the window
 * offers no «نشر كمجهول» switch.
 */

export const COMMUNITY_QUESTION_CATEGORIES = [
  { id: "labor", label: "عمالي" },
  { id: "commercial", label: "تجاري" },
  { id: "civil", label: "مدني" },
  { id: "criminal", label: "جنائي" },
  { id: "family", label: "أحوال شخصية" },
  { id: "real-estate", label: "عقاري" },
] as const;

export type CommunityQuestionCategory = (typeof COMMUNITY_QUESTION_CATEGORIES)[number]["id"];

/** /community/ask's rule: a title of more than ten characters. */
export const COMMUNITY_TITLE_MIN = 11;
/** The route's 400 when the title is missing; the page keeps titles short. */
export const COMMUNITY_TITLE_MAX = 200;

/** The reference the question's details open with: «بخصوص: نظام العمل — المادة الثمانون». */
export function communityQuestionPrefill(lawName?: string | null, articleRef?: string | null): string {
  const law = (lawName ?? "").trim();
  const article = (articleRef ?? "").trim();
  const ref = [law, article].filter(Boolean).join(" — ");
  return ref ? `بخصوص: ${ref}\n\n` : "";
}

export function canPostCommunityQuestion(title: string, category: string): boolean {
  const t = title.trim();
  return t.length >= COMMUNITY_TITLE_MIN && t.length <= COMMUNITY_TITLE_MAX && COMMUNITY_QUESTION_CATEGORIES.some((c) => c.id === category);
}

/** Sign in and come back to the page the reader is on (its path only: no question text in the URL). */
export function communityLoginHref(pathname: string): string {
  const path = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname.split(/[?#]/)[0] : "/";
  return `/login?next=${encodeURIComponent(path)}`;
}

/** The new question's page, or the community page when the server sent no id. */
export function communityQuestionHref(id: unknown): string {
  const s = typeof id === "number" || typeof id === "string" ? String(id).trim() : "";
  return /^[A-Za-z0-9-]{1,64}$/.test(s) ? `/community/${s}` : "/community";
}
