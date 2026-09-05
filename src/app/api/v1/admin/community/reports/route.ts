import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { parseStatusFilter } from "@/lib/services/feedbackInput";
import { COMMUNITY_REPORT_STATUSES } from "@/lib/services/communityReportsInput";
import {
  COMMUNITY_REPORT_SELECT,
  buildTargetSnippet,
  toCommunityReportDto,
  type CommunityReportRow,
} from "@/app/api/v1/community/reports/_shared";

/**
 * GET /api/v1/admin/community/reports?status=all|new|reviewed|dismissed|actioned
 * — the real report queue behind owner item ٦٩ (the moderation route used
 * to SYNTHESISE a `reportReason` for every post because this table did not
 * exist — see the header of /api/v1/admin/community/moderation/route.ts,
 * now updated to read real counts/reasons from here when any exist).
 *
 * The main SELECT runs on the RLS-scoped client — `community_reports`'s own
 * SELECT policy already grants an admin every row via `public.is_admin()`,
 * so there is no need to bypass RLS for the list itself (defense in depth:
 * a bug in `assertRole` alone would not open this table to a non-admin).
 * The service client is used ONLY for the two hydration lookups this route
 * cannot do under RLS by design: the reporter's `profiles.display_name`
 * (their own profile row, not the reporter's) and a short excerpt of the
 * reported post/answer — an admin needs to see content whose author never
 * gave the admin visibility under RLS in order to judge if it's actually a
 * problem.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["admin"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const filter = parseStatusFilter(searchParams.get("status"), COMMUNITY_REPORT_STATUSES);
    if (!filter.ok) {
      return NextResponse.json(
        { error: `status يجب أن يكون all أو أحد: ${COMMUNITY_REPORT_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    let query = supabase
      .from("community_reports")
      .select(COMMUNITY_REPORT_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });
    if (filter.value) query = query.eq("status", filter.value);

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin/community/reports GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل بلاغات المجتمع." }, { status: 500 });
    }

    const rows = (data ?? []) as CommunityReportRow[];

    const reporterIds = [...new Set(rows.map((r) => r.reporter_user_id).filter((v): v is string => !!v))];
    const postIds = [...new Set(rows.filter((r) => r.target_type === "post").map((r) => r.target_id))];
    const answerIds = [...new Set(rows.filter((r) => r.target_type === "answer").map((r) => r.target_id))];

    const names = new Map<string, string | null>();
    const snippets = new Map<string, string | null>();
    const answerPosts = new Map<string, string>();

    if (reporterIds.length > 0 || postIds.length > 0 || answerIds.length > 0) {
      try {
        const service = await createServiceClient();
        const [profilesRes, postsRes, answersRes] = await Promise.all([
          reporterIds.length > 0
            ? service.from("profiles").select("id, display_name").in("id", reporterIds)
            : Promise.resolve({ data: [], error: null }),
          postIds.length > 0
            ? service.from("community_posts").select("id, title").in("id", postIds)
            : Promise.resolve({ data: [], error: null }),
          answerIds.length > 0
            ? service.from("community_answers").select("id, body, post_id").in("id", answerIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (profilesRes.error) {
          console.error("[admin/community/reports GET] profile lookup failed:", profilesRes.error.message);
        } else {
          for (const p of (profilesRes.data ?? []) as Array<{ id: string; display_name: string | null }>) {
            names.set(p.id, p.display_name ?? null);
          }
        }

        if (postsRes.error) {
          console.error("[admin/community/reports GET] posts lookup failed:", postsRes.error.message);
        } else {
          for (const p of (postsRes.data ?? []) as Array<{ id: string; title: string | null }>) {
            snippets.set(p.id, buildTargetSnippet(p.title));
          }
        }

        if (answersRes.error) {
          console.error("[admin/community/reports GET] answers lookup failed:", answersRes.error.message);
        } else {
          for (const a of (answersRes.data ?? []) as Array<{ id: string; body: string | null; post_id: string | null }>) {
            snippets.set(a.id, buildTargetSnippet(a.body));
            if (a.post_id) answerPosts.set(a.id, a.post_id);
          }
        }
      } catch (err) {
        console.error("[admin/community/reports GET] hydration threw:", err);
      }
    }

    const items = rows.map((row) =>
      toCommunityReportDto(row, {
        reporterName: row.reporter_user_id ? names.get(row.reporter_user_id) ?? null : null,
        targetSnippet: snippets.get(row.target_id) ?? null,
        answerPostId: row.target_type === "answer" ? answerPosts.get(row.target_id) ?? null : null,
      }),
    );

    return NextResponse.json({ data: items, total: count ?? items.length });
  } catch (err) {
    console.error("[admin/community/reports GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
