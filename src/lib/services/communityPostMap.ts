/**
 * communityPostMap.ts
 * ─────────────────────────────────────────────────────────
 * Item 147 (question half) — same two-wire-shapes problem
 * `communityAnswerMap.ts` solves for answers, one level up for the question
 * itself.
 *
 * `src/app/community/[id]/page.tsx`'s old `mapStoredQuestion` assumed every
 * question was a demo-mode `StoredCommunityQuestion` (`asker`, `askerType`,
 * `views`, `votes`, `ago` — fields the browser's own `communityStore` wrote).
 * In supabase mode `getCommunityPost` hands it a raw `community_posts` row
 * instead (20260603_phase1_004_community_features.sql:34-58): real columns
 * are `author_id` (a uuid, no display name), `view_count`, `vote_count`,
 * `created_at` — none of `asker`/`askerType`/`views`/`votes`/`ago` exist on
 * that row.
 *
 * The crash: `mapStoredQuestion` did `question.asker.includes("مجهول")` with
 * no guard. On a real row `asker` is `undefined`, so opening ANY real post
 * (signed in, any role — a guest's 401 caught this before it ever reached
 * here) threw synchronously during render, outside the load effect's
 * try/catch, with no `error.tsx` under `src/app/community` to soften it —
 * a hard crash of the whole detail page.
 *
 * Real posts carry no display name for the asker at all (only `author_id`),
 * so — same call as `communityAnswerMap`'s `FALLBACK_AUTHOR` — an honest
 * generic label stands in rather than an undefined-guarded blank. This does
 * NOT invent a real name; it is the same "no data, admit it" fallback the
 * answers side already uses.
 */

export interface CommunityPostLike {
  asker?: string;
  askerType?: string;
  views?: number;
  view_count?: number;
  votes?: number;
  vote_count?: number;
  ago?: string;
  created_at?: string;
}

export interface MappedCommunityPost {
  asker: string;
  askerType?: string;
  isAnon: boolean;
  views: number;
  votes: number;
  ago: string;
}

/** Real posts carry no display name on the wire yet — see the file header. */
const FALLBACK_ASKER = "عضو في المجتمع";

export function mapCommunityPost(question: CommunityPostLike): MappedCommunityPost {
  const asker = (typeof question.asker === "string" && question.asker.trim()) || FALLBACK_ASKER;
  const isAnon =
    (typeof question.asker === "string" && question.asker.includes("مجهول")) ||
    question.askerType === "guest";
  const views =
    typeof question.views === "number"
      ? question.views
      : typeof question.view_count === "number"
        ? question.view_count
        : 0;
  const votes =
    typeof question.votes === "number"
      ? question.votes
      : typeof question.vote_count === "number"
        ? question.vote_count
        : 0;
  const ago = question.ago ?? question.created_at ?? "";

  return { asker, askerType: question.askerType, isAnon, views, votes, ago };
}
