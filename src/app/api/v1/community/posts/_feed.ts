/**
 * Pure helpers for the community posts routes — no `next/server`, no Supabase
 * client, so `node --test` can import them.
 *
 * ── WHY THE EMBEDS NAME A FOREIGN KEY ───────────────────────────────────────
 * Two foreign keys join these tables
 * (supabase/migrations/20260603_phase1_004_community_features.sql):
 *   - community_answers_post_id_fkey: community_answers.post_id → community_posts.id
 *   - fk_community_posts_accepted_answer: community_posts.accepted_answer_id → community_answers.id
 * A bare `community_answers(...)` embed is therefore ambiguous and PostgREST
 * refuses the whole request with PGRST201. That is what blanked the live feed
 * («تعذّرت قراءة الأسئلة», verified on production 2026-10-16). Every embed
 * between the two tables must say which key it follows.
 *
 * ── WHAT THE LIST ROUTE RETURNS ─────────────────────────────────────────────
 * The feed at /community filters on `q.tab`, counts `q.answers`, and reads
 * `asker`/`views`/`votes` — the shape the browser's own demo store writes. Raw
 * rows carry none of those (`visibility`, `view_count`, `vote_count`, and an
 * embed count), so a successful read rendered as an empty forum. `toFeedItem`
 * turns a row into that shape, deriving `tab` from the real `visibility`
 * column.
 */

import {
  findOffPlatformContact,
  normalizeDigits,
  offPlatformContactIssue,
} from "../../../../../lib/services/contactSanitizer.ts";
import { reviewStateOf, type ReviewState } from "../../../../../lib/community/review.ts";

/** community_answers.post_id → community_posts.id */
export const POST_ANSWERS_FK = "community_answers_post_id_fkey";

/** List read: every post column plus the number of (RLS-visible) answers. */
export const LIST_SELECT = `*, community_answers!${POST_ANSWERS_FK}(count)`;

/** Detail read: aliased `answers` so the key matches what the page reads. */
export const DETAIL_SELECT = `*, answers:community_answers!${POST_ANSWERS_FK}(*)`;

/** community_posts.visibility CHECK list. */
export type PostVisibility = "public" | "lawyers_only" | "private";

/**
 * The page sends `tab=public|lawyers`; the column stores `public|lawyers_only`.
 * Either spelling of either value is accepted, anything else is `null`
 * (no visibility filter is the caller's decision, not this function's).
 */
export function visibilityForTab(raw: string | null | undefined): PostVisibility | null {
  switch ((raw ?? "").trim()) {
    case "public":
      return "public";
    case "lawyers":
    case "lawyers_only":
      return "lawyers_only";
    case "private":
      return "private";
    default:
      return null;
  }
}

/** community_posts.category CHECK list (20261018_03 added civil). */
export const DB_CATEGORIES = [
  "general", "labor", "commercial", "civil", "criminal", "family", "real_estate",
  "administrative", "intellectual_property", "international", "other",
] as const;
export type DbCategory = (typeof DB_CATEGORIES)[number];

/**
 * UI category id → column value. The UI spells real estate with a hyphen.
 *
 * «مدني» (`civil`) is its own value since migration 20261018_03 (owner answer
 * ١٩٠). Before it, «مدني» was stored as `other`; the migration moved those
 * rows to `civil`, and `other` still reads back as «مدني» in case one is left.
 */
const UI_TO_DB: Record<string, DbCategory> = {
  "real-estate": "real_estate",
};
const DB_TO_UI: Record<string, string> = {
  real_estate: "real-estate",
  other: "civil",
};

export function dbCategoryFor(raw: string | null | undefined): DbCategory | null {
  const value = (raw ?? "").trim();
  if (!value || value === "all") return null;
  if (value in UI_TO_DB) return UI_TO_DB[value];
  return (DB_CATEGORIES as readonly string[]).includes(value) ? (value as DbCategory) : null;
}

export function uiCategoryFor(db: string | null | undefined): string {
  const value = (db ?? "").trim();
  return DB_TO_UI[value] ?? value;
}

/** Real posts carry no display name on the wire — same label as communityPostMap.ts. */
export const FEED_ASKER = "عضو في المجتمع";

export interface CommunityFeedItem {
  id: string;
  tab: "public" | "lawyers";
  visibility: string;
  category: string;
  title: string;
  body?: string;
  tags: string[];
  asker: string;
  askerType: "user";
  /** Answer bodies are not part of the list read — see `answerCount`. */
  answers: [];
  answerCount: number;
  views: number;
  votes: number;
  isAnswered: boolean;
  isPinned: boolean;
  createdAt: string;
  /** The signed-in reader's own vote on this post (0 = none, or a guest). */
  myVote: -1 | 0 | 1;
  /** The signed-in reader saved («حفظ») this post. Always false for a guest. */
  saved: boolean;
  /**
   * Owner ٤٢ (20261127_60): «بانتظار المراجعة» / «مرفوض» on the author's own
   * rows (RLS shows such a row to its author only); null = published.
   */
  reviewState: ReviewState;
  /** The reviewer's reason on a rejection (the author's own row only). */
  reviewNote: string | null;
}

/** What the list route knows about the reader for one row (own vote / save). */
export interface FeedViewerState {
  myVote?: number | null;
  saved?: boolean;
}

/** A vote row's value as the UI's -1 | 0 | 1. */
export function voteValue(v: unknown): -1 | 0 | 1 {
  return v === 1 ? 1 : v === -1 ? -1 : 0;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** `[{ count: 3 }]` from `community_answers!…(count)`; anything else is 0. */
export function embeddedCount(v: unknown): number {
  if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object") {
    return num((v[0] as Row).count);
  }
  return 0;
}

export const CONTACT_REDACTED = "[محذوف]";

/**
 * Phone numbers, e-mails, links and handles never leave the server in
 * community text: each one becomes «[محذوف]».
 *
 * Written when `stripOffPlatformContact` cut a hit with leading whitespace
 * («تابعني @ahmad_law», «اتصل 501234567») one character early and rewrote
 * every Arabic-Indic digit as ASCII; both are fixed there now (N6, fix plan
 * 2026-10-16) and this does the same thing. Each hit is located by its own
 * text, and the untouched parts come from the original string
 * (`normalizeDigits` is one code unit for one, so offsets agree).
 */
export function cleanText(v: unknown): string {
  const input = text(v);
  const found = findOffPlatformContact(input);
  if (found.length === 0) return input;
  const normalized = normalizeDigits(input);
  let out = "";
  let cursor = 0;
  for (const m of found) {
    const start = normalized.indexOf(m.text, m.index);
    if (start === -1 || start < cursor) continue;
    out += input.slice(cursor, start) + CONTACT_REDACTED;
    cursor = start + m.text.length;
  }
  return out + input.slice(cursor);
}

export function toFeedItem(row: Row, viewer?: FeedViewerState): CommunityFeedItem {
  const visibility = text(row.visibility) || "public";
  // `answer_count` is a real column, but nothing maintains it (no trigger in
  // any migration), so it is always 0. The embed count is the real number.
  const answerCount = embeddedCount(row.community_answers);
  const body = cleanText(row.body).trim();
  return {
    id: String(row.id ?? ""),
    tab: visibility === "lawyers_only" ? "lawyers" : "public",
    visibility,
    category: uiCategoryFor(text(row.category)),
    title: cleanText(row.title),
    body: body || undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string").map(cleanText) : [],
    asker: FEED_ASKER,
    askerType: "user",
    answers: [],
    answerCount,
    views: num(row.view_count),
    votes: num(row.vote_count),
    isAnswered: answerCount > 0 || (typeof row.accepted_answer_id === "string" && row.accepted_answer_id.length > 0),
    isPinned: row.is_pinned === true,
    createdAt: text(row.created_at),
    myVote: voteValue(viewer?.myVote),
    saved: viewer?.saved === true,
    reviewState: reviewStateOf(row.status),
    reviewNote: reviewStateOf(row.status) === "rejected" && typeof row.review_note === "string" ? row.review_note : null,
  };
}

/**
 * The detail read, with every piece of community text passed through the
 * contact filter — the post itself and each answer body. Other fields are
 * returned exactly as read.
 */
/**
 * The public shape of a question page: `author_id`, `metadata`,
 * `search_fts`, `lawyerSlug` and `reviewed_at` are dropped from the post and
 * from every answer. The list route never sent author ids;
 * the detail route reads them only to find the lawyers' profile slugs, and the
 * page never reads them. (Guests can open this route.)
 */
export function publicDetail(post: Row): Row {
  const strip = (r: Row): Row => {
    // search_fts (20261125_53) is the search index of the UNREDACTED text —
    // cleanText() exists to keep phone numbers and links out of the page.
    // lawyerSlug: owner ٤٢ (18 Nov) — the writer's name is not sent to the
    // browser at all, and a profile slug is a name. reviewed_at is internal.
    const { author_id: _a, metadata: _m, search_fts: _s, lawyerSlug: _l, reviewed_at: _r, ...rest } = r;
    void _a;
    void _m;
    void _s;
    void _l;
    void _r;
    return rest;
  };
  const answers = Array.isArray(post.answers)
    ? (post.answers as Row[]).map((a) => (a && typeof a === "object" ? strip(a) : a))
    : post.answers;
  return { ...strip(post), answers };
}

export function cleanDetail<T extends Row>(post: T): T {
  const answers = Array.isArray(post.answers)
    ? (post.answers as Row[]).map((a) => (a && typeof a === "object" ? { ...a, body: cleanText(a.body) } : a))
    : post.answers;
  return {
    ...post,
    title: cleanText(post.title),
    body: cleanText(post.body),
    tags: Array.isArray(post.tags) ? post.tags.map((t) => (typeof t === "string" ? cleanText(t) : t)) : post.tags,
    answers,
  };
}

/**
 * Write-side check (contactSanitizer.ts: routes refuse, they do not rewrite
 * what the author sent). Returns the Arabic refusal for the first value — a
 * string, or a list of strings such as `tags` — that carries a phone number,
 * e-mail, link or handle; `null` means everything may be stored.
 *
 * One rule for every author, lawyers included: a lawyer who chose to publish
 * contact details does so on the profile (`lawyer_profiles.show_contact`),
 * not inside forum text.
 */
/** The refusal for a link or an account handle left after PII masking (S5-3). */
export const LINK_REFUSAL_AR = "لا يُسمح بوضع رابط أو معرّف حساب في نصوص المجتمع — التواصل يتم عبر المنصّة.";

/**
 * S5-3 write-side check, run on text ALREADY masked by
 * src/lib/community/piiMask.ts: phone numbers and e-mail addresses are no
 * longer refused there (they are hidden and the author is told), but a link
 * or an account handle is still refused — that is the off-platform-contact
 * rule (contactSanitizer.ts), not personal data, and there is nothing to mask
 * it to. `null` = the values may be stored.
 */
export function linkIssueIn(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      if (findOffPlatformContact(v).some((m) => m.kind === "url" || m.kind === "handle")) return LINK_REFUSAL_AR;
    } else if (Array.isArray(v)) {
      const found = linkIssueIn(v);
      if (found) return found;
    }
  }
  return null;
}

export function contactIssueIn(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const found = offPlatformContactIssue(v);
      if (found) return found;
    } else if (Array.isArray(v)) {
      const found = contactIssueIn(v);
      if (found) return found;
    }
  }
  return null;
}
