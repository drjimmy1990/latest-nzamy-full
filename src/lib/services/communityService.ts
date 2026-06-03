/**
 * communityService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode community Q&A service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
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
}): Promise<StoredCommunityQuestion[]> {
  if (!isSupabaseMode) {
    let posts = readCommunityQuestionsLocal();
    if (opts?.tab) posts = posts.filter(p => p.tab === opts.tab);
    if (opts?.category && opts.category !== "all") posts = posts.filter(p => p.category === opts.category);
    return posts;
  }
  try {
    const response = await apiGet<PostListResponse>("/api/v1/community/posts", {
      tab: opts?.tab,
      category: opts?.category !== "all" ? opts?.category : undefined,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return response.data;
  } catch {
    return readCommunityQuestionsLocal();
  }
}

export async function getCommunityPost(id: number | string): Promise<StoredCommunityQuestion | null> {
  if (!isSupabaseMode) return findCommunityQuestionLocal(Number(id));
  try {
    const post = await apiGet<StoredCommunityQuestion>(`/api/v1/community/posts/${id}`);
    return post;
  } catch {
    return findCommunityQuestionLocal(Number(id));
  }
}

export async function createCommunityPost(input: CommunityQuestionInput): Promise<StoredCommunityQuestion> {
  if (!isSupabaseMode) return createCommunityQuestionLocal(input);
  try {
    return await apiMutate<StoredCommunityQuestion>("/api/v1/community/posts", "POST", input);
  } catch {
    return createCommunityQuestionLocal(input);
  }
}

export async function addCommunityAnswer(
  postId: number | string,
  answer: Omit<StoredCommunityAnswer, "id" | "votes" | "isAccepted" | "ago">,
): Promise<StoredCommunityAnswer | null> {
  if (!isSupabaseMode) return addCommunityAnswerLocal(Number(postId), answer);
  try {
    return await apiMutate<StoredCommunityAnswer>(
      `/api/v1/community/posts/${postId}/answers`,
      "POST",
      answer,
    );
  } catch {
    return addCommunityAnswerLocal(Number(postId), answer);
  }
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
