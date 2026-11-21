/**
 * aiReviewServer.ts — Q131a: run the AI pre-publish review on one community
 * question or answer that the database just stored as `pending_review`.
 * The pure rules are in ./aiReview.ts.
 *
 * Called after the response (next/server `after`) by the posts POST / PATCH
 * and answers POST routes, so the member never waits on the model. It:
 *   1. returns at once unless platform_settings.community_ai_review is on AND
 *      N8N_AI_BASE_URL + NZAMY_AI_KEY are set — the human queue is untouched;
 *   2. re-reads the row with the service role: it must still be pending_review
 *      (a reviewer may have decided already);
 *   3. sends the masked title/body (never the author) to n8n «community-review»;
 *   4. approve → `active`; reject (known category) → `rejected` + a fixed reason;
 *      anything else → stays pending for a human (fail closed). The write is
 *      guarded on status = pending_review AND the same updated_at, so an edit
 *      made while the model was thinking is reviewed again, never approved by
 *      the old verdict;
 *   5. logs one public.community_ai_reviews row (20261202_70) and tells the
 *      author on approve / reject, as a human reviewer's decision does.
 * Never throws.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { callN8n } from "@/lib/ai/n8nClient";
import { reviewNotificationAr } from "@/lib/community/review";
import {
  COMMUNITY_AI_SETTING_KEY,
  COMMUNITY_REVIEW_PATH,
  COMMUNITY_REVIEW_TIMEOUT_MS,
  aiRejectNoteAr,
  communityAiConfigured,
  communityAiReviewOn,
  communityReviewInput,
  readAiVerdict,
} from "@/lib/community/aiReview";

type Kind = "post" | "answer";

export async function runCommunityAiReview(kind: Kind, id: string): Promise<void> {
  try {
    if (!communityAiConfigured(process.env)) return;
    const admin = await createServiceClient();

    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", COMMUNITY_AI_SETTING_KEY)
      .maybeSingle();
    if (!communityAiReviewOn((setting as { value?: unknown } | null)?.value)) return;

    const table = kind === "post" ? "community_posts" : "community_answers";
    const { data: row, error: readError } = await admin
      .from(table)
      .select(kind === "post" ? "id, title, body, status, author_id, updated_at" : "id, body, status, author_id, post_id, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (readError || !row) return;
    const r = row as unknown as {
      title?: string;
      body?: string;
      status?: string;
      author_id?: string;
      post_id?: string;
      updated_at?: string;
    };
    if (r.status !== "pending_review") return;

    const input = communityReviewInput(kind, { title: r.title, body: r.body });
    if (!input) return;

    const outcome = await callN8n({
      baseUrl: process.env.N8N_AI_BASE_URL,
      key: process.env.NZAMY_AI_KEY,
      path: COMMUNITY_REVIEW_PATH,
      mode: "sync",
      body: { tool: "community-review", input },
      timeoutMs: COMMUNITY_REVIEW_TIMEOUT_MS,
    });

    const log = (decision: "approve" | "reject" | "hold" | "error", category: string | null, detail: string | null) =>
      admin
        .from("community_ai_reviews")
        .insert({ kind, target_id: id, decision, category, detail: detail ? detail.slice(0, 300) : null })
        .then(({ error }) => {
          if (error) console.error("[community ai review] log failed:", error.code);
        });

    if (outcome.kind !== "result") {
      await log("error", null, outcome.kind === "failed" ? `${outcome.code}: ${outcome.detail}` : "unexpected 202");
      return; // stays pending for the human queue
    }
    const verdict = readAiVerdict(outcome.result);
    if (verdict.decision === "hold") {
      await log("hold", verdict.category, null);
      return;
    }

    const nowIso = new Date().toISOString();
    const patch =
      verdict.decision === "approve"
        ? { status: "active", reviewed_at: nowIso, updated_at: nowIso }
        : { status: "rejected", review_note: aiRejectNoteAr(verdict.category), reviewed_at: nowIso, updated_at: nowIso };
    let q = admin.from(table).update(patch).eq("id", id).eq("status", "pending_review");
    if (r.updated_at) q = q.eq("updated_at", r.updated_at);
    const { data: written, error: writeError } = await q.select("id").maybeSingle();
    if (writeError) {
      console.error("[community ai review] write failed:", writeError.code);
      await log("error", verdict.category, `write ${writeError.code}`);
      return;
    }
    if (!written) {
      // Decided by a human, or edited, meanwhile: the verdict is dropped.
      await log("hold", verdict.category, "row changed before the verdict");
      return;
    }
    await log(verdict.decision, verdict.category, null);

    const note = reviewNotificationAr(
      kind,
      verdict.decision === "approve" ? "active" : "rejected",
      verdict.decision === "reject" ? aiRejectNoteAr(verdict.category) : null,
    );
    if (note && r.author_id) {
      const postId = kind === "post" ? id : r.post_id;
      const { error: notifyError } = await admin.from("notifications").insert({
        user_id: r.author_id,
        title: note.title,
        body: note.body,
        href: postId ? `/community/${postId}` : null,
      });
      if (notifyError) console.error("[community ai review] notification failed:", notifyError.code);
    }
  } catch (err) {
    console.error("[community ai review] unexpected:", err instanceof Error ? err.message : err);
  }
}
