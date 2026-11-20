/**
 * communityService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode community Q&A service.
 *
 * ── THE LOCAL FALLBACK IS DEMO-MODE ONLY ────────────────────────────────────
 *
 * Same reasoning as src/lib/services/workflowService.ts (read its header for
 * the long version) and notificationService. In demo mode `communityStore` IS
 * the backend and the `!isSupabaseMode` branches below are correct, untouched.
 *
 * In supabase mode every function answered a failed API call out of that same
 * browser store, which produced two different lies:
 *
 *   - READS returned this browser's own locally-written questions as though
 *     they were the community's. On a fresh browser (the normal case) the store
 *     is empty, so a failed load rendered as «لا توجد أسئلة» — an empty forum.
 *   - WRITES fell back to `createCommunityQuestionLocal` / `addCommunityAnswerLocal`,
 *     which is the `createWorkflowRequest` phantom-success defect exactly: the
 *     user was shown their published question, with an id, over a row that
 *     existed only in their own browser and that nobody else would ever see.
 *
 * So reads report failure and writes throw.
 *
 * ── AND A PLAIN UNWRAPPING BUG ──────────────────────────────────────────────
 * Three of the four API calls read the wrong shape: the routes answer
 * `{ data: … }` (posts/[id]/route.ts:41, posts/route.ts:92,
 * posts/[id]/answers/route.ts:57) but were typed as the bare row. So
 * `getCommunityPost()` handed the page `{ data: … }`, whose `.votes` and
 * `.answers` are `undefined` — src/app/community/[id]/page.tsx:157 reads both.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
import {
  readCommunityQuestionsLocal,
  createCommunityQuestion as createCommunityQuestionLocal,
  findDemoCommunityQuestion,
  addCommunityAnswerLocal,
  COMMUNITY_STORAGE_KEY,
  COMMUNITY_UPDATED_EVENT,
} from "@/lib/communityStore";
import { ALL_QUESTIONS } from "@/constants/communityData";
import type {
  StoredCommunityQuestion,
  StoredCommunityAnswer,
  CommunityQuestionInput,
  CommunityTab,
  CommunityCategory,
} from "@/lib/communityStore";

// Re-export types
export type { StoredCommunityQuestion, StoredCommunityAnswer, CommunityQuestionInput, CommunityTab, CommunityCategory };
export { COMMUNITY_STORAGE_KEY, COMMUNITY_UPDATED_EVENT };

// ─── API types ────────────────────────────────────────────────────────────────

interface PostListResponse {
  data: StoredCommunityQuestion[];
  total: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getCommunityPosts(opts?: {
  tab?: CommunityTab;
  category?: CommunityCategory;
  limit?: number;
  offset?: number;
  /** Server search (supabase mode): Arabic-folded title + body — see posts/_search.ts. */
  q?: string;
  /** Server order (supabase mode): hot = votes, top = answers, new = newest. */
  sort?: "hot" | "new" | "top";
  /** The signed-in reader's own questions only. */
  mine?: boolean;
}): Promise<ListRead<StoredCommunityQuestion>> {
  // Demo path unchanged: communityStore is the backend in that mode.
  if (!isSupabaseMode) {
    let posts = readCommunityQuestionsLocal();
    if (opts?.tab) posts = posts.filter(p => p.tab === opts.tab);
    if (opts?.category && opts.category !== "all") posts = posts.filter(p => p.category === opts.category);
    return listOk(posts, posts.length);
  }
  try {
    const response = await apiGet<PostListResponse>("/api/v1/community/posts", {
      tab: opts?.tab,
      category: opts?.category !== "all" ? opts?.category : undefined,
      limit: opts?.limit,
      offset: opts?.offset,
      q: opts?.q?.trim() ? opts.q.trim() : undefined,
      sort: opts?.sort,
      mine: opts?.mine ? "1" : undefined,
    });
    // The route 500s on a Supabase error (posts/route.ts:46) — no `degraded`
    // envelope, so a throw or a missing array is the failure signal.
    if (!Array.isArray(response?.data)) return listFailed<StoredCommunityQuestion>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[communityService] getCommunityPosts failed:", error);
    return listFailed<StoredCommunityQuestion>();
  }
}

/**
 * One question. `null` means the server said 404 — the question is not there.
 * Any other failure THROWS, so «هذا السؤال غير موجود» is never printed over a
 * read that simply did not happen.
 *
 * Direct fetch rather than `apiGet` for the same reason as casesService: the
 * helper discards the status code, and 404-vs-broken is exactly the distinction
 * this function exists to make.
 */
export async function getCommunityPost(id: number | string): Promise<StoredCommunityQuestion | null> {
  // Demo mode: the feed lists this browser's questions AND the seed cards, so the
  // detail lookup reads both, or every seed card opened «غير موجود».
  if (!isSupabaseMode) {
    return findDemoCommunityQuestion(
      Number(id),
      readCommunityQuestionsLocal(),
      ALL_QUESTIONS as unknown as StoredCommunityQuestion[],
    );
  }
  const res = await fetch(`/api/v1/community/posts/${encodeURIComponent(String(id))}`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("تعذّر تحميل السؤال");
  const body = await res.json().catch(() => null);
  // `{ data: post }` — see the header. Reading the envelope as the post is what
  // made `.votes` and `.answers` undefined on the question page.
  if (!body?.data) throw new Error("تعذّر تحميل السؤال");
  return body.data as StoredCommunityQuestion;
}

/**
 * S5-3: the server masks personal data before storing a post or an answer and
 * says so in `maskedNotice` (null = nothing was hidden). It rides on the
 * returned object as an optional extra, so existing callers are unaffected.
 */
export type WithMaskedNotice<T> = T & { maskedNotice?: string | null };

export async function createCommunityPost(input: CommunityQuestionInput): Promise<WithMaskedNotice<StoredCommunityQuestion>> {
  if (!isSupabaseMode) return createCommunityQuestionLocal(input);
  // THROWS: the local-write fallback published the question to nobody but the
  // author's own browser and then reported it posted. `{ data }` unwrapped.
  const res = await apiMutate<{ data: StoredCommunityQuestion; maskedNotice?: string | null }>(
    "/api/v1/community/posts",
    "POST",
    input,
  );
  if (!res?.data) throw new Error("لم يصل تأكيد نشر السؤال من الخادم");
  return { ...res.data, maskedNotice: res.maskedNotice ?? null };
}

export async function addCommunityAnswer(
  postId: number | string,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
): Promise<WithMaskedNotice<StoredCommunityAnswer>> {
  if (!isSupabaseMode) {
    // Demo is local only and self-consistent (owner ١١٥): a seed card the demo
    // feed shows can be answered too — it is copied into this browser's store.
    const saved = addCommunityAnswerLocal(
      Number(postId),
      answer,
      ALL_QUESTIONS as unknown as StoredCommunityQuestion[],
    );
    // null only when the id is in neither this browser's store nor the seed.
    if (!saved) throw new Error("تعذّر حفظ الإجابة: السؤال غير موجود");
    return saved;
  }
  // THROWS, and no longer returns `null` — a `null` answer was indistinguishable
  // from "saved, nothing to show" at the call site. `{ data }` unwrapped.
  const res = await apiMutate<{ data: StoredCommunityAnswer; maskedNotice?: string | null }>(
    `/api/v1/community/posts/${postId}/answers`,
    "POST",
    answer,
  );
  if (!res?.data) throw new Error("لم يصل تأكيد نشر الإجابة من الخادم");
  return { ...res.data, maskedNotice: res.maskedNotice ?? null };
}

/** What the vote route answers: the caller's vote now, and the server's count. */
export interface CommunityVoteResult {
  myVote: -1 | 0 | 1;
  votes: number;
}

/**
 * Vote on a post or an answer; `0` removes the caller's vote (toggle off).
 * Resolves to the server's own count — the page shows that number, never one
 * it added up itself. THROWS on a refusal (a guest's 401, an unreadable
 * target), so the screen can say the vote was not counted. Demo mode has no
 * vote persistence and resolves `null`.
 */
export async function voteCommunityPost(
  postId: number | string,
  targetType: "post" | "answer",
  targetId: string,
  value: 1 | -1 | 0,
): Promise<CommunityVoteResult | null> {
  if (!isSupabaseMode) return null; // Demo mode: no voting persistence
  const res = await apiMutate<{ data?: { myVote?: number; votes?: number } }>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}/vote`,
    "POST",
    { target_type: targetType, target_id: targetId, value },
  );
  if (!res?.data || typeof res.data.votes !== "number") throw new Error("لم يصل تأكيد التصويت من الخادم");
  const my = res.data.myVote;
  return { myVote: my === 1 ? 1 : my === -1 ? -1 : 0, votes: res.data.votes };
}

/** «حفظ» / إلغاء الحفظ. Resolves the saved state the server now holds; THROWS on failure. */
export async function setCommunityPostSaved(postId: string, saved: boolean): Promise<boolean> {
  if (!isSupabaseMode) throw new Error("الحفظ غير متاح في وضع العرض التجريبي.");
  const res = await apiMutate<{ data?: { saved?: boolean } }>(
    `/api/v1/community/posts/${encodeURIComponent(postId)}/save`,
    saved ? "POST" : "DELETE",
  );
  if (typeof res?.data?.saved !== "boolean") throw new Error("لم يصل تأكيد الحفظ من الخادم");
  return res.data.saved;
}

/** «أفضل إجابة» — the question's author only (the database checks). `null` clears it. THROWS on refusal. */
export async function setCommunityBestAnswer(postId: string, answerId: string | null): Promise<string | null> {
  if (!isSupabaseMode) throw new Error("اختيار أفضل إجابة غير متاح في وضع العرض التجريبي.");
  const res = await apiMutate<{ data?: { accepted_answer_id?: string | null } }>(
    `/api/v1/community/posts/${encodeURIComponent(postId)}/best-answer`,
    "POST",
    { answer_id: answerId },
  );
  if (!res?.data) throw new Error("لم يصل تأكيد الاختيار من الخادم");
  return res.data.accepted_answer_id ?? null;
}

/** The signed-in reader's saved questions, newest save first (GET /api/v1/community/saved). */
export async function getSavedCommunityPosts(opts?: {
  limit?: number;
  offset?: number;
}): Promise<ListRead<StoredCommunityQuestion>> {
  if (!isSupabaseMode) return listOk<StoredCommunityQuestion>([], 0);
  try {
    const response = await apiGet<PostListResponse>("/api/v1/community/saved", {
      limit: opts?.limit,
      offset: opts?.offset,
    });
    if (!Array.isArray(response?.data)) return listFailed<StoredCommunityQuestion>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[communityService] getSavedCommunityPosts failed:", error);
    return listFailed<StoredCommunityQuestion>();
  }
}
