import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { COMMUNITY_REPORT_REASON_LABELS_AR, type CommunityReportReason } from "@/lib/services/communityReportsInput";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * GET /api/v1/admin/community/moderation — Community moderation queue.
 *
 * There is NO dedicated reports/flags table in the community schema
 * (community_posts / community_answers only). So the review queue is built from
 * recent community_posts, and the moderation "status" shown to the admin is
 * DERIVED from the post's own `status` column:
 *   community_posts.status ∈ ('active', 'closed', 'moderated', 'deleted')
 *     active    → pending   (needs review)
 *     closed    → approved  (kept / resolved)
 *     moderated → escalated (held for legal/senior review)
 *     deleted   → rejected  (removed)
 *
 * Query params:
 *   - status ('pending' | 'approved' | 'rejected' | 'escalated' | 'all', default 'all')
 *   - search (matches post title/body)
 *   - limit  (default 50)
 *   - offset (default 0)
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. This used to return `{ data: [] }` at
 * HTTP 200 "so the page degrades to its local fallback", and the page reads an
 * empty array as «لا توجد منشورات مجتمع بعد»
 * (src/app/dashboard/admin/community/moderation/page.tsx:102) — a moderation
 * queue reporting itself clear over a query that never ran. That page already
 * throws on `!res.ok` into its own distinct toast («تعذر الاتصال بطابور
 * الإشراف»), so the honest branch already exists and nothing depends on the 200.
 *
 * `total` is now returned alongside `data`: the `.range()` below is a silent cap
 * without it, and a queue that shows 50 of 300 pending posts with no notice is
 * the same understatement in a quieter form.
 *
 * ── real reports (owner item ٦٩ remainder) ──────────────────────────────────
 * `public.community_reports` (20260911_community_reports.sql) now exists —
 * the ONE thing this route did not have when the comment above was written.
 * Scope of this change is `reportReason` ONLY, as the task named it — every
 * OTHER field (`reporter` included) is untouched, because the admin
 * moderation page that renders them lives outside this route's ownership.
 *
 * For every post on THIS page that has at least one real row there,
 * `reportReason` is now an Arabic-joined tally of the real reasons (e.g.
 * "إزعاج / محتوى مكرر (٢)، إساءة أو تنمّر (١)") instead of the guess.
 * `reportCount` is new and additive: the real row count, 0 when there are
 * none. `syntheticReportReason` is ALSO new and additive: the exact
 * placeholder text this route used to call `reportReason` unconditionally,
 * always present, clearly named as what it is — a derived guess, not a
 * submitted reason — so a caller can tell the two apart instead of trusting
 * a field that used to lie about its own nature. `reportReason` itself is
 * kept (existing consumers read it) and now only falls back to that
 * synthesized text when a post has zero real reports.
 */

// Map the DB post status → the UI CommunityModerationStatus vocabulary.
const DB_TO_UI_STATUS: Record<string, "pending" | "approved" | "rejected" | "escalated"> = {
  active: "pending",
  closed: "approved",
  moderated: "escalated",
  deleted: "rejected",
};

// The reverse map, used to translate a ?status= filter back to DB values.
const UI_TO_DB_STATUS: Record<string, string> = {
  pending: "active",
  approved: "closed",
  rejected: "deleted",
  escalated: "moderated",
};

interface AuthorJoin {
  id: string;
  display_name: string | null;
  display_name_en: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? "all";
    const search = searchParams.get("search");
    // Clamped to 200: `postIds` below (one id per row on this page) feeds a
    // `.in("target_id", postIds)` against community_reports, and this repo's
    // own PostgREST has already been caught silently truncating an `.in()`
    // list past ~396 entries (library-postgrest-arabic-gotchas) — a caller
    // passing `?limit=1000` must not be able to push this past that ceiling.
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Service client: admins read across all posts regardless of RLS visibility.
    const admin = await createServiceClient();

    let query = admin
      .from("community_posts")
      .select(
        "id, title, body, category, status, visibility, author_id, created_at, profiles:author_id(id, display_name, display_name_en)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter !== "all" && UI_TO_DB_STATUS[statusFilter]) {
      query = query.eq("status", UI_TO_DB_STATUS[statusFilter]);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error(
        "[admin/community/moderation GET] Supabase error:",
        error.message,
        error.details,
        error.hint,
        error.code,
      );
      return NextResponse.json({ error: "تعذّر تحميل طابور الإشراف." }, { status: 500 });
    }

    const rows = data ?? [];
    const postIds = rows.map((row) => (row as Record<string, unknown>).id as string);

    // Real reports for THIS page's posts. `target_type = 'post'` only — a
    // report on an *answer* is not this post's own report and would inflate
    // the wrong post's count if it were included here by target_id alone.
    const reportsByPost = new Map<string, Record<CommunityReportReason, number>>();
    if (postIds.length > 0) {
      const { data: reportRows, error: reportsError } = await admin
        .from("community_reports")
        .select("target_id, reason")
        .eq("target_type", "post")
        .in("target_id", postIds);
      if (reportsError) {
        console.error("[admin/community/moderation GET] reports lookup failed:", reportsError.message, reportsError.code);
      } else {
        for (const r of (reportRows ?? []) as Array<{ target_id: string; reason: string }>) {
          const reason = r.reason as CommunityReportReason;
          const tally = reportsByPost.get(r.target_id) ?? ({} as Record<CommunityReportReason, number>);
          tally[reason] = (tally[reason] ?? 0) + 1;
          reportsByPost.set(r.target_id, tally);
        }
      }
    }

    const items = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const author = (r.profiles ?? null) as AuthorJoin | null;
      const dbStatus = (r.status as string) ?? "active";

      // Always present, always the OLD derived guess — clearly named so a
      // caller can tell it apart from a real submitted reason.
      const syntheticReportReason =
        dbStatus === "moderated"
          ? "محتوى محجوز للمراجعة القانونية"
          : dbStatus === "deleted"
            ? "تمت إزالة المحتوى"
            : `مراجعة منشور (${(r.category as string) ?? "general"})`;

      const tally = reportsByPost.get(r.id as string);
      const reportCount = tally ? Object.values(tally).reduce((sum, n) => sum + n, 0) : 0;
      const realReportReason =
        reportCount > 0 && tally
          ? Object.entries(tally)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, n]) => `${COMMUNITY_REPORT_REASON_LABELS_AR[reason as CommunityReportReason] ?? reason} (${toArabicDigits(n)})`)
              .join("، ")
          : null;

      return {
        id: r.id as string,
        postId: r.id as string,
        postTitle: (r.title as string) ?? "",
        // Real when this post has ≥1 actual report, else the synthesized guess.
        reportReason: realReportReason ?? syntheticReportReason,
        // Additive — always the derived guess, regardless of real reports.
        syntheticReportReason,
        // Additive — the real row count for this post (0 when none exist).
        reportCount,
        // Unchanged (task scope is `reportReason` only) — the admin
        // moderation page (out of this route's ownership) reads this field
        // and is not being touched here.
        reporter: author?.display_name || author?.display_name_en || "النظام",
        status: DB_TO_UI_STATUS[dbStatus] ?? "pending",
        createdAt: (r.created_at as string) ?? "",
        // Extra fields the client can ignore but are useful for context.
        category: (r.category as string) ?? "general",
        visibility: (r.visibility as string) ?? "public",
      };
    });

    // `count` is the total matching the SAME filters `data` was drawn from
    // (the status/search filters are applied in SQL above, not in memory), so
    // it is directly comparable to `items.length` — unlike the audit-log route,
    // where the severity filter runs after the fetch.
    return NextResponse.json({ data: items, total: count ?? null });
  } catch (err) {
    console.error("[admin/community/moderation GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل طابور الإشراف." }, { status: 500 });
  }
}
