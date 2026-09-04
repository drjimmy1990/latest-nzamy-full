/**
 * reviewsService.ts — real reviews (Phase 7, item 192) on public.reviews.
 * ─────────────────────────────────────────────────────────
 *   GET  /api/v1/reviews?lawyer=<id>&limit       — public, active reviews of a lawyer + stats
 *   GET  /api/v1/reviews/eligible                — the client's completed requests that can still be reviewed
 *   POST /api/v1/reviews                         — { requestId, rating, title?, body?, isAnonymous? }
 *   GET  /api/v1/reviews/mine                    — the lawyer: reviews about me (incl. my responses)
 *   PATCH /api/v1/reviews/[id]/response          — the lawyer answers a review once
 *
 * A review is a fact about ONE completed request (DB: unique per request; RLS:
 * only its requester, only when completed). Free-floating ratings do not exist.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export interface Review {
  id: string;
  lawyerUserId: string;
  /** null when the reviewer chose anonymity or the row is read publicly. */
  reviewerName: string | null;
  isAnonymous: boolean;
  requestId: string | null;
  /** «استشارة قانونية» — the service title of the reviewed request, for context. */
  serviceTitleAr: string | null;
  rating: number;
  title: string;
  body: string;
  response: string | null;
  responseAt: string | null;
  createdAt: string;
}

export interface ReviewStats {
  lawyerUserId: string;
  reviewCount: number;
  /** 1.00–5.00, or null with no reviews. */
  avgRating: number | null;
  lastReviewAt: string | null;
}

export interface ReviewableRequest {
  requestId: string;
  lawyerUserId: string;
  lawyerName: string;
  titleAr: string;
  completedAt: string | null;
}

export interface SubmitReviewInput {
  requestId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body?: string;
  isAnonymous?: boolean;
}

const BASE = "/api/v1/reviews";
const DEMO = "التقييمات غير متاحة في وضع العرض التجريبي";

export async function getLawyerReviews(lawyerUserId: string, opts?: { limit?: number }): Promise<{ reviews: ListRead<Review>; stats: ReviewStats | null }> {
  if (!isSupabaseMode) return { reviews: listOk([]), stats: null };
  try {
    const body = await apiGet<{ data: Review[]; total?: number; stats?: ReviewStats | null }>(BASE, { lawyer: lawyerUserId, limit: opts?.limit });
    return { reviews: listFromApi(body), stats: body?.stats ?? null };
  } catch (error) {
    console.error("[reviewsService] getLawyerReviews failed:", error);
    return { reviews: listFailed<Review>(), stats: null };
  }
}

export async function getReviewableRequests(): Promise<ListRead<ReviewableRequest>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: ReviewableRequest[]; total?: number }>(`${BASE}/eligible`));
  } catch (error) {
    console.error("[reviewsService] getReviewableRequests failed:", error);
    return listFailed<ReviewableRequest>();
  }
}

export async function submitReview(input: SubmitReviewInput): Promise<Review> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: Review }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم التقييم المحفوظ.");
  return res.data;
}

export async function getMyReviews(): Promise<{ reviews: ListRead<Review>; stats: ReviewStats | null }> {
  if (!isSupabaseMode) return { reviews: listOk([]), stats: null };
  try {
    const body = await apiGet<{ data: Review[]; total?: number; stats?: ReviewStats | null }>(`${BASE}/mine`);
    return { reviews: listFromApi(body), stats: body?.stats ?? null };
  } catch (error) {
    console.error("[reviewsService] getMyReviews failed:", error);
    return { reviews: listFailed<Review>(), stats: null };
  }
}

export async function respondToReview(id: string, response: string): Promise<Review> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: Review }>(`${BASE}/${encodeURIComponent(id)}/response`, "PATCH", { response });
  if (!res?.data) throw new Error("لم يُعِد الخادم التقييم بعد الردّ.");
  return res.data;
}
