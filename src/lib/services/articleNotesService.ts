/**
 * articleNotesService.ts — sticky notes, voice memos and highlights on a law
 * page, out of the browser (Phase 6, item 151).
 * ─────────────────────────────────────────────────────────
 *   GET    /api/v1/library/notes            — all of mine (for «ملاحظاتي»)
 *   GET    /api/v1/library/notes?page=<id>  — one page's note or { data: null }
 *   PUT    /api/v1/library/notes            — upsert by pageId
 *   DELETE /api/v1/library/notes?page=<id>
 *
 * Voice memos are FILES: uploadNoteAudio() puts the bytes in the documents
 * bucket under the user's own folder and the row keeps the object key; the
 * old base64-in-localStorage copy is never written again.
 *
 * Guests (no session) keep the browser as their only store — the screens
 * decide that with useUser().isLoggedIn; this module is the signed-in path.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import { safeStorageFileName } from "@/lib/services/storageKey";

/** Mirrors public.law_article_notes. */
export interface ArticleNote {
  id: string;
  pageId: string;
  noteText: string;
  /** object key in the documents bucket; the screen asks the API for a signed URL to play it */
  audioPath: string | null;
  /** canvas strokes exactly as CanvasHighlighter stores them */
  strokes: unknown[];
  position: { x: number; y: number } | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleNoteInput {
  pageId: string;
  noteText?: string;
  audioPath?: string | null;
  strokes?: unknown[];
  position?: { x: number; y: number } | null;
  isVisible?: boolean;
}

const BASE = "/api/v1/library/notes";

export async function getMyArticleNotes(): Promise<ListRead<ArticleNote>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: ArticleNote[]; total?: number }>(BASE));
  } catch (error) {
    console.error("[articleNotesService] getMyArticleNotes failed:", error);
    return listFailed<ArticleNote>();
  }
}

/** null when the page has no note yet; throws on a read failure (the caller keeps its local copy). */
export async function getArticleNote(pageId: string): Promise<ArticleNote | null> {
  if (!isSupabaseMode) return null;
  const res = await apiGet<{ data: ArticleNote | null }>(BASE, { page: pageId });
  return res?.data ?? null;
}

export async function saveArticleNote(input: ArticleNoteInput): Promise<ArticleNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات السحابية غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: ArticleNote }>(BASE, "PUT", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحفوظة.");
  return res.data;
}

export async function deleteArticleNote(pageId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الملاحظات السحابية غير متاحة في وضع العرض التجريبي");
  await apiMutate<{ ok: true }>(`${BASE}?page=${encodeURIComponent(pageId)}`, "DELETE", {});
}

/** Uploads a recorded memo and returns the object key to store on the note. */
export async function uploadNoteAudio(pageId: string, blob: Blob): Promise<string> {
  if (!isSupabaseMode) throw new Error("التسجيل السحابي غير متاح في وضع العرض التجريبي");
  const supabase = createBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw new Error("انتهت الجلسة — سجّل الدخول ثم أعد المحاولة.");
  const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  const key = `${auth.user.id}/notes/${safeStorageFileName(pageId.replace(/[^a-zA-Z0-9._-]/g, "_"))}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("documents").upload(key, blob, { contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw new Error(`تعذّر رفع التسجيل: ${error.message}`);
  return key;
}

/** A 5-minute signed URL for a memo, minted by the API after the RLS check; null when it cannot be signed. */
export async function getNoteAudioUrl(pageId: string): Promise<string | null> {
  if (!isSupabaseMode) return null;
  try {
    const res = await apiGet<{ url: string | null }>(`${BASE}/audio-url`, { page: pageId });
    return res?.url ?? null;
  } catch (error) {
    console.error("[articleNotesService] getNoteAudioUrl failed:", error);
    return null;
  }
}
