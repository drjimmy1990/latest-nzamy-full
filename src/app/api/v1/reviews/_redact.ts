/**
 * _redact.ts — what an anonymous review may and may not carry out of this API.
 * ─────────────────────────────────────────────────────────
 * «تقييم بدون اسم» (ReviewForm.tsx:205-215 → `reviews.is_anonymous`) is a
 * promise to the client that the lawyer he just paid cannot tell it was him.
 * Three fields on the review DTO can break that promise, and only two of them
 * were ever withheld:
 *
 *   • `reviewerName` — withheld since the DTO existed.
 *   • `requestId` — withheld: the reviewee can look a request id up in his own
 *     dashboard (`service_requests.requester_user_id`) and read the name off it.
 *   • `serviceTitleAr` — NOT withheld, which made the first two cosmetic. The
 *     title was resolved from the very `request_id` being hidden and printed
 *     under the review («الخدمة: …» ReviewsPanel.tsx:194-196, «عن: …»
 *     lawyers/[slug]/page.tsx:923-924). A lawyer with a handful of open
 *     requests reads his own case title there and knows exactly who wrote it;
 *     with one matching request it is not an inference, it is the name.
 *
 * So the rule is one rule over all three, stated once here and applied by both
 * routes that build a review DTO (/api/v1/reviews and /api/v1/lawyers/[id]) —
 * each of which had its own copy of the first two, and its own copy of the
 * bug in the third.
 *
 * Pure: no I/O, no Supabase, no framework imports, so `node --test` runs it
 * directly (house style — see ../contact/_validate.ts, ../tickets/_shared.ts).
 */

/** The only two columns the redaction rule reads. */
export interface RedactableReviewRow {
  is_anonymous: boolean;
  request_id: string | null;
}

/** What the caller must put on the DTO for this row. */
export interface RedactedReviewFields {
  requestId: string | null;
  reviewerName: string | null;
  serviceTitleAr: string | null;
}

/**
 * The request ids a page of reviews may resolve a service title for.
 *
 * Anonymous rows are excluded at the QUERY, not only at the DTO: the title of
 * an anonymous reviewer's request is not needed for anything this API returns,
 * so it is never read out of `service_requests` in the first place. Cheaper,
 * and it means a future edit that forgets `redactAnonymousReview` still has no
 * anonymous title in the map to leak.
 */
export function requestIdsForEnrichment(rows: readonly RedactableReviewRow[]): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => !r.is_anonymous && !!r.request_id)
        .map((r) => r.request_id as string),
    ),
  ];
}

/**
 * The three identity-bearing fields, redacted together.
 *
 * `reviewerName` and `serviceTitle` are what the caller resolved (or null);
 * for an anonymous row all three come back null regardless of what was passed,
 * so a caller that resolves more than it should still cannot emit it.
 */
export function redactAnonymousReview(
  row: RedactableReviewRow,
  reviewerName: string | null,
  serviceTitle: string | null,
): RedactedReviewFields {
  if (row.is_anonymous) {
    return { requestId: null, reviewerName: null, serviceTitleAr: null };
  }
  return { requestId: row.request_id, reviewerName, serviceTitleAr: serviceTitle };
}
