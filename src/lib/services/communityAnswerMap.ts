/**
 * communityAnswerMap.ts
 * ─────────────────────────────────────────────────────────
 * Item 147 — one answer, two wire shapes, one honest mapping.
 *
 * `src/app/community/[id]/page.tsx` reads a community answer from two
 * different places depending on mode (see communityService.ts's own header
 * for the long version):
 *
 *   - demo mode: a `StoredCommunityAnswer` from `communityStore` — a friendly
 *     shape the browser itself wrote (`author`, `authorType`, `content`,
 *     `votes`, `ago`, `isAccepted`).
 *   - supabase mode: a raw `community_answers` row from
 *     `GET /api/v1/community/posts/[id]` — real DB column names (`body`,
 *     `vote_count`, `created_at`, `is_lawyer_verified`), plus a `lawyerSlug`
 *     the route attaches additively for verified, marketplace-visible
 *     lawyers.
 *
 * `isLawyer`/`isVerified` are the load-bearing fields here: they come ONLY
 * from `is_lawyer_verified` when the row carries it — never from a
 * client-supplied `authorType`. In demo mode there is no server column at
 * all (the browser IS the backend there), so `authorType` is the only signal
 * and using it is correct, not a workaround.
 */

export interface CommunityAnswerLike {
  id?: string | number;
  author?: string;
  authorType?: string;
  authorRating?: number;
  content?: string;
  body?: string;
  votes?: number;
  vote_count?: number;
  isAccepted?: boolean;
  ago?: string;
  created_at?: string;
  is_lawyer_verified?: boolean;
  lawyerSlug?: string | null;
  /** Owner ٤٢ + N18: «مكتب معتمد» — the route's verifiedOffice flag (20261202_80). */
  verifiedOffice?: boolean;
  /** Owner ٤٢: the author's own answer under review / rejected (route's reviewState). */
  reviewState?: "pending" | "rejected" | null;
  /** The raw row's status (the POST answer returns the row itself). */
  status?: string;
  review_note?: string | null;
}

export interface MappedCommunityReply {
  type: "lawyer" | "user";
  author: string;
  text: string;
  date: string;
  likes: number;
  isVerified: boolean;
  isBest: boolean;
  rating?: number;
  lawyerSlug?: string;
  /** «مكتب معتمد» (owner ٤٢, N18): a registered law firm with an active office plan. */
  isVerifiedOffice: boolean;
  /** The reader's own answer still under review («بانتظار المراجعة») or rejected. */
  reviewState: "pending" | "rejected" | null;
  reviewNote: string | null;
}

/** Real answers carry no display name on the wire yet — see the route note. */
const FALLBACK_AUTHOR = "عضو في المجتمع";

/**
 * @param answer            One answer, either shape above.
 * @param acceptedAnswerId  The post's `accepted_answer_id` (supabase mode
 *                           only — demo answers carry `isAccepted` on
 *                           themselves already).
 */
export function mapCommunityAnswer(
  answer: CommunityAnswerLike,
  acceptedAnswerId?: string | number | null,
): MappedCommunityReply {
  const hasServerVerifiedFlag = typeof answer.is_lawyer_verified === "boolean";
  const isLawyer = hasServerVerifiedFlag
    ? (answer.is_lawyer_verified as boolean)
    : answer.authorType === "lawyer";

  const author = (typeof answer.author === "string" && answer.author.trim()) || FALLBACK_AUTHOR;
  const text = answer.content ?? answer.body ?? "";
  const date = answer.ago ?? answer.created_at ?? "";
  const likes =
    typeof answer.votes === "number"
      ? answer.votes
      : typeof answer.vote_count === "number"
        ? answer.vote_count
        : 0;
  const isBest =
    typeof answer.isAccepted === "boolean"
      ? answer.isAccepted
      : acceptedAnswerId != null && answer.id != null && String(answer.id) === String(acceptedAnswerId);
  const lawyerSlug =
    typeof answer.lawyerSlug === "string" && answer.lawyerSlug.length > 0 ? answer.lawyerSlug : undefined;
  const rating = typeof answer.authorRating === "number" ? answer.authorRating : undefined;
  const reviewState: "pending" | "rejected" | null =
    answer.reviewState === "pending" || answer.status === "pending_review"
      ? "pending"
      : answer.reviewState === "rejected" || answer.status === "rejected"
        ? "rejected"
        : null;

  return {
    type: isLawyer ? "lawyer" : "user",
    author,
    text,
    date,
    likes,
    isVerified: isLawyer,
    isBest,
    rating,
    lawyerSlug,
    isVerifiedOffice: answer.verifiedOffice === true,
    reviewState,
    reviewNote: reviewState === "rejected" && typeof answer.review_note === "string" ? answer.review_note : null,
  };
}
