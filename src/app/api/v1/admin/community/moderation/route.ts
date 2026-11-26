import { COMMUNITY_AI_SETTING_KEY, communityAiConfigured, communityAiReviewOn } from "@/lib/community/aiReview";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { COMMUNITY_REPORT_REASON_LABELS_AR, type CommunityReportReason } from "@/lib/services/communityReportsInput";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  COMMUNITY_REVIEW_SETTING_KEY,
  dbStatusesFor,
  moderationStatusOf,
  prepublishReviewOn,
} from "@/lib/community/review";

/**
 * GET /api/v1/admin/community/moderation — the community review queue
 * (owner ٤٢, 18 Nov 2026; batch l7 decision 13).
 *
 * While `community_prepublish_review` is on (platform_settings, default ON —
 * 20261127_60), a member's new question or answer is stored 'pending_review'
 * and nobody but its author sees it until a reviewer approves it here. The
 * queue reads both tables with the service role:
 *
 *   ?kind=post (default) | answer
 *   ?status=pending (default) | approved | rejected | escalated | all
 *     pending   → 'pending_review'
 *     approved  → 'active', 'closed'
 *     rejected  → 'rejected', 'deleted'
 *     escalated → 'moderated'
 *   ?search  (title/body for posts, body for answers)
 *   ?limit (≤ 200, default 50), ?offset
 *
 * The answer carries `total` for the filter, the pending count of each kind
 * (`pending`), and the setting (`prepublishReview`, null when it cannot be
 * read or its row does not exist yet — before 20261127_60). The writer's name is shown to staff here only — the public pages
 * never carry it.
 *
 * Before 20261127_60 runs there is no 'pending_review' row: the pending
 * filter is honestly empty, and approve/reject still write the status column.
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST: an empty queue would read as «nothing
 * to review» over a query that never ran.
 *
 * Real reports (community_reports) are tallied per row as before
 * (`reportReason`, `reportCount`).
 */

interface AuthorJoin {
  id: string;
  display_name: string | null;
  display_name_en: string | null;
}

const POST_SELECT =
  "id, title, body, category, status, visibility, author_id, created_at, review_note, profiles:author_id(id, display_name, display_name_en)";
const ANSWER_SELECT =
  "id, post_id, body, status, author_id, created_at, review_note, is_lawyer_verified, profiles:author_id(id, display_name, display_name_en), post:community_posts!community_answers_post_id_fkey(id, title)";
/** Before 20261127_60 the review_note column does not exist. */
const POST_SELECT_OLD = POST_SELECT.replace(", review_note", "");
const ANSWER_SELECT_OLD = ANSWER_SELECT.replace(", review_note", "");

const isMissingColumn = (code: unknown) => code === "42703" || code === "PGRST204";

export async function GET(request: NextRequest) {
  try {
    // l16 (C35): the staff-role gate (least privilege, staffRoles.ts), not admin-only.
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") === "answer" ? "answer" : "post";
    const statusFilter = searchParams.get("status") ?? "pending";
    const search = (searchParams.get("search") ?? "").replace(/[%,()]/g, " ").trim();
    // Clamped to 200: the ids of a page feed an `.in()` on community_reports,
    // and this PostgREST truncates long `.in()` lists silently.
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const admin = await createServiceClient();
    const table = kind === "post" ? "community_posts" : "community_answers";

    const run = (select: string) => {
      let query = admin
        .from(table)
        .select(select, { count: "exact" })
        .order("created_at", { ascending: statusFilter === "pending" })
        .range(offset, offset + limit - 1);
      const statuses = dbStatusesFor(statusFilter);
      if (statuses) query = query.in("status", statuses);
      if (search) {
        query = kind === "post"
          ? query.or(`title.ilike.%${search}%,body.ilike.%${search}%`)
          : query.ilike("body", `%${search}%`);
      }
      return query;
    };

    let { data, count, error } = await run(kind === "post" ? POST_SELECT : ANSWER_SELECT);
    if (error && isMissingColumn(error.code)) {
      ({ data, count, error } = await run(kind === "post" ? POST_SELECT_OLD : ANSWER_SELECT_OLD));
    }
    if (error) {
      console.error("[admin/community/moderation GET] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل طابور المراجعة." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id));

    // Real reports for this page's rows (of this kind only).
    const reportsById = new Map<string, Record<CommunityReportReason, number>>();
    if (ids.length > 0) {
      const { data: reportRows, error: reportsError } = await admin
        .from("community_reports")
        .select("target_id, reason")
        .eq("target_type", kind)
        .in("target_id", ids);
      if (reportsError) {
        console.error("[admin/community/moderation GET] reports lookup failed:", reportsError.code, reportsError.message);
      } else {
        for (const r of (reportRows ?? []) as Array<{ target_id: string; reason: string }>) {
          const reason = r.reason as CommunityReportReason;
          const tally = reportsById.get(r.target_id) ?? ({} as Record<CommunityReportReason, number>);
          tally[reason] = (tally[reason] ?? 0) + 1;
          reportsById.set(r.target_id, tally);
        }
      }
    }

    // The pending count of each kind, and the setting — for the page header.
    const [pendingPosts, pendingAnswers, setting] = await Promise.all([
      admin.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      admin.from("community_answers").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      admin.from("platform_settings").select("value").eq("key", COMMUNITY_REVIEW_SETTING_KEY).maybeSingle(),
    ]);
    // Q131a (l12): the AI pre-publish review switch (20261202_70) and whether
    // this server can reach the AI workflows at all.
    const aiSetting = await admin.from("platform_settings").select("value").eq("key", COMMUNITY_AI_SETTING_KEY).maybeSingle();

    const items = rows.map((r) => {
      const author = (r.profiles ?? null) as AuthorJoin | null;
      const post = (r.post ?? null) as { id?: string; title?: string } | null;
      const tally = reportsById.get(String(r.id));
      const reportCount = tally ? Object.values(tally).reduce((sum, n) => sum + n, 0) : 0;
      const reportReason =
        reportCount > 0 && tally
          ? Object.entries(tally)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, n]) => `${COMMUNITY_REPORT_REASON_LABELS_AR[reason as CommunityReportReason] ?? reason} (${toArabicDigits(n)})`)
              .join("، ")
          : null;
      return {
        id: String(r.id),
        kind,
        postId: kind === "post" ? String(r.id) : String(r.post_id ?? post?.id ?? ""),
        postTitle: kind === "post" ? String(r.title ?? "") : String(post?.title ?? ""),
        body: typeof r.body === "string" ? r.body : "",
        author: author?.display_name || author?.display_name_en || "—",
        isLawyerVerified: r.is_lawyer_verified === true,
        status: moderationStatusOf(r.status),
        dbStatus: typeof r.status === "string" ? r.status : null,
        reviewNote: typeof r.review_note === "string" ? r.review_note : null,
        reportCount,
        reportReason,
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
        category: typeof r.category === "string" ? r.category : null,
        visibility: typeof r.visibility === "string" ? r.visibility : null,
      };
    });

    return NextResponse.json({
      data: items,
      total: count ?? null,
      pending: {
        posts: pendingPosts.error ? null : pendingPosts.count ?? 0,
        answers: pendingAnswers.error ? null : pendingAnswers.count ?? 0,
      },
      // No row = 20261127_60 has not run (it inserts the row): unknown, and
      // nothing is held for review yet.
      prepublishReview: setting.error || !setting.data ? null : prepublishReviewOn(setting.data.value),
      aiReview: {
        enabled: aiSetting.error || !aiSetting.data ? null : communityAiReviewOn(aiSetting.data.value),
        configured: communityAiConfigured(process.env),
      },
    });
  } catch (err) {
    console.error("[admin/community/moderation GET] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل طابور المراجعة." }, { status: 500 });
  }
}
