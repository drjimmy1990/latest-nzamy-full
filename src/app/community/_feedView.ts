/**
 * The /community feed's view model — pure, so `node --test` can import it.
 *
 * Two shapes reach the feed:
 *   - demo mode: `StoredCommunityQuestion` / the `ALL_QUESTIONS` seed — numeric
 *     ids, an `ago` string, inline `answers`.
 *   - supabase mode: `CommunityFeedItem` from GET /api/v1/community/posts
 *     (api/v1/community/posts/_feed.ts) — a uuid id, `createdAt`, an
 *     `answerCount` and no answer bodies.
 * The page used to treat both as the demo shape: it sorted «الأحدث» with
 * `b.id - a.id` (NaN for a uuid) and counted `answers.length` (0 for every
 * real post). Everything below reads whichever field the item carries.
 */

export type FeedTab = "public" | "lawyers";

export interface FeedAnswer {
  id: number | string;
  author: string;
  authorType: "lawyer" | "user";
  authorRating: number;
  authorYears?: number;
  content: string;
  votes: number;
  isAccepted: boolean;
  ago: string;
}

export interface FeedQuestion {
  /** Always a string, so state keyed by it works for numeric and uuid ids alike. */
  key: string;
  /** What /community/[id] expects in its URL. */
  href: string;
  tab: FeedTab;
  category: string;
  title: string;
  body?: string;
  tags: string[];
  asker: string;
  askerType: string;
  /** Inline answers — demo mode only; the real list read carries none. */
  answers: FeedAnswer[];
  answerCount: number;
  views: number;
  votes: number;
  isAnswered: boolean;
  /** For «الأحدث». `null` when the item carries no date at all. */
  createdAtMs: number | null;
  /** Printed date: the demo's own `ago`, else the formatted `createdAt`. */
  when: string;
  /** The signed-in reader's own vote, from the server (0 for a guest / demo). */
  myVote: -1 | 0 | 1;
  /** The signed-in reader saved this question (server; false in demo). */
  saved: boolean;
}

type Loose = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** «١٦ ربيع الآخر ١٤٤٨ هـ» style date (the site's default ar-SA calendar), or "". */
export function formatPostedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

/** A real ISO timestamp is printed as a date; anything else (a demo «منذ ساعة») as is. */
export function displayWhen(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatPostedDate(v);
  return v;
}

export function toFeedQuestion(raw: unknown): FeedQuestion {
  const q = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const id = q.id;
  const key = String(id ?? "");
  const answers = Array.isArray(q.answers) ? (q.answers as FeedAnswer[]) : [];
  const answerCount = typeof q.answerCount === "number" ? q.answerCount : answers.length;
  const createdAt = str(q.createdAt) || str(q.created_at);
  const createdParsed = createdAt ? Date.parse(createdAt) : NaN;
  // Demo ids are `Date.now()` (communityStore) or small seed numbers — still
  // the order they were written in, which is what «الأحدث» needs.
  const createdAtMs = Number.isFinite(createdParsed)
    ? createdParsed
    : typeof id === "number" && Number.isFinite(id)
      ? id
      : null;
  return {
    key,
    href: `/community/${encodeURIComponent(key)}`,
    tab: q.tab === "lawyers" ? "lawyers" : "public",
    category: str(q.category),
    title: str(q.title),
    body: str(q.body) || undefined,
    tags: Array.isArray(q.tags) ? q.tags.filter((t): t is string => typeof t === "string") : [],
    asker: str(q.asker) || "عضو في المجتمع",
    askerType: str(q.askerType) || "user",
    answers,
    answerCount,
    views: num(q.views),
    votes: num(q.votes),
    isAnswered: q.isAnswered === true,
    createdAtMs,
    when: str(q.ago) || formatPostedDate(createdAt),
    myVote: q.myVote === 1 ? 1 : q.myVote === -1 ? -1 : 0,
    saved: q.saved === true,
  };
}

export type FeedSort = "hot" | "new" | "top";

/**
 * `serverOrdered` (supabase mode): the route already searched (Arabic-folded,
 * every post, not just this page — api/v1/community/posts/_search.ts) and
 * ordered the rows, and «تحميل المزيد» appends the next page of that order.
 * Searching again here with a plain `includes` would DROP rows the server's
 * folding matched (أ/ا, ة/ه), and re-sorting would reshuffle pages — so with
 * it set only the tab/category guards run. Demo mode keeps the local search
 * and sort: its store is the whole forum.
 */
export function filterAndSortFeed(
  items: FeedQuestion[],
  opts: {
    tab: FeedTab;
    category: string;
    search: string;
    sort: FeedSort;
    voteOf?: (q: FeedQuestion) => number;
    serverOrdered?: boolean;
  },
): FeedQuestion[] {
  const needle = opts.search.trim().toLowerCase();
  const voteOf = opts.voteOf ?? ((q: FeedQuestion) => q.votes);
  const guarded = items
    .filter((q) => q.tab === opts.tab)
    .filter((q) => opts.category === "all" || q.category === opts.category);
  if (opts.serverOrdered) return guarded;
  return guarded
    .filter(
      (q) =>
        needle === "" ||
        q.title.toLowerCase().includes(needle) ||
        (q.body ?? "").toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      if (opts.sort === "hot") return voteOf(b) - voteOf(a);
      if (opts.sort === "new") return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
      return b.answerCount - a.answerCount;
    });
}
