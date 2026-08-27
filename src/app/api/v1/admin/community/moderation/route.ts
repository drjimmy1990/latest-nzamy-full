import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

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
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
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

    const items = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const author = (r.profiles ?? null) as AuthorJoin | null;
      const dbStatus = (r.status as string) ?? "active";
      return {
        id: r.id as string,
        postId: r.id as string,
        postTitle: (r.title as string) ?? "",
        // No report/flag table exists, so the "report reason" is derived from the
        // post's category/visibility rather than a real reporter submission.
        reportReason:
          dbStatus === "moderated"
            ? "محتوى محجوز للمراجعة القانونية"
            : dbStatus === "deleted"
              ? "تمت إزالة المحتوى"
              : `مراجعة منشور (${(r.category as string) ?? "general"})`,
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
