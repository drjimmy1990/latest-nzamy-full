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
  findCommunityQuestionLocal,
  addCommunityAnswerLocal,
  COMMUNITY_STORAGE_KEY,
  COMMUNITY_UPDATED_EVENT,
} from "@/lib/communityStore";
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
  if (!isSupabaseMode) return findCommunityQuestionLocal(Number(id));
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

export async function createCommunityPost(input: CommunityQuestionInput): Promise<StoredCommunityQuestion> {
  if (!isSupabaseMode) return createCommunityQuestionLocal(input);
  // THROWS: the local-write fallback published the question to nobody but the
  // author's own browser and then reported it posted. `{ data }` unwrapped.
  const res = await apiMutate<{ data: StoredCommunityQuestion }>(
    "/api/v1/community/posts",
    "POST",
    input,
  );
  if (!res?.data) throw new Error("لم يصل تأكيد نشر السؤال من الخادم");
  return res.data;
}

export async function addCommunityAnswer(
  postId: number | string,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
): Promise<StoredCommunityAnswer> {
  if (!isSupabaseMode) {
    const saved = addCommunityAnswerLocal(Number(postId), answer);
    // The local store returns null when the question id does not exist there.
    if (!saved) throw new Error("تعذّر حفظ الإجابة: السؤال غير موجود");
    return saved;
  }
  // THROWS, and no longer returns `null` — a `null` answer was indistinguishable
  // from "saved, nothing to show" at the call site. `{ data }` unwrapped.
  const res = await apiMutate<{ data: StoredCommunityAnswer }>(
    `/api/v1/community/posts/${postId}/answers`,
    "POST",
    answer,
  );
  if (!res?.data) throw new Error("لم يصل تأكيد نشر الإجابة من الخادم");
  return res.data;
}

export async function voteCommunityPost(
  postId: number | string,
  targetType: "post" | "answer",
  targetId: string,
  value: 1 | -1,
): Promise<void> {
  if (!isSupabaseMode) return; // Demo mode: no voting persistence
  await apiMutate(`/api/v1/community/posts/${postId}/vote`, "POST", {
    target_type: targetType,
    target_id: targetId,
    value,
  });
}
