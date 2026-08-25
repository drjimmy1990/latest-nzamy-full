import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DB_USER_TYPES, isDbUserType, type DbUserType } from "@/lib/auth/userTypes";

/**
 * The PostgREST `or=` clause for a free-text search over the three name/email
 * columns, or `null` when there is nothing to search for.
 *
 * The term is stripped of the four characters that terminate or nest a
 * PostgREST filter token — `,` `(` `)` and `\` — before it is interpolated.
 * Without that, a comma typed into the search box splits one `ilike` into two
 * malformed filters and the whole request comes back 400. Stripping rather than
 * escaping is deliberate: none of the four can appear in an email address, and
 * a display name containing one still matches on the rest of the term, because
 * both ends are wrapped in `%`.
 *
 * Built as a function because the clause is needed twice — once for the page of
 * users and once per type for the filter-bar counts — and the two must not be
 * able to disagree about what "search" means.
 */
function searchClause(search: string | null): string | null {
  const term = (search ?? "").replace(/[,()\\]/g, "").trim();
  if (!term) return null;
  return `display_name.ilike.%${term}%,display_name_en.ilike.%${term}%,email.ilike.%${term}%`;
}

/**
 * GET /api/v1/admin/users — List all users with subscription info
 *
 * Query params:
 *   - search         (filter on display_name / display_name_en / email)
 *   - role           (`profiles.user_type`; must be one of the nine
 *                     `DB_USER_TYPES`, otherwise 400 — see the check below)
 *   - tier           (subscription tier — read the note at the filter first)
 *   - status         (subscription status — read the note at the filter first)
 *   - include_counts (`1` → also return a per-`user_type` count; off by default)
 *   - page           (default 1)
 *   - limit          (default 20)
 *
 * Requires: authenticated admin user
 */
export async function GET(request: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  // ── Parse query params ─────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const role = searchParams.get("role");
  const tier = searchParams.get("tier");
  const status = searchParams.get("status");
  const includeCounts = searchParams.get("include_counts") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  // ── `role` must be a real user_type ────────────────────────────────────────
  //
  // Refused here rather than handed to `.eq("user_type", …)`, which would match
  // nothing and return an empty page with a 200. On screen that is
  // indistinguishable from "there are no users of this kind", and it is exactly
  // how the directory carried a `judge` filter chip for as long as it did:
  // `judge` is not a `profiles.user_type` — it is a `government_profiles.role`
  // — so the chip always came back empty and always looked plausible.
  //
  // `DB_USER_TYPES` is the CHECK-constraint list, so this check cannot fall
  // behind the database, and the message names the accepted values from the
  // same array rather than restating them.
  // `role &&`, not `role !== null`, so this agrees with the `if (role)` at the
  // filter site below: `?role=` with an empty value means "no filter" there and
  // has to mean the same here, rather than 400ing on a param that is ignored
  // twenty lines later.
  if (role && !isDbUserType(role)) {
    return NextResponse.json(
      { error: `قيمة role غير معروفة — القيم المقبولة: ${DB_USER_TYPES.join("، ")}` },
      { status: 400 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Build the query ────────────────────────────────────────────────────
    let query = adminClient
      .from("profiles")
      .select(
        `
        id,
        display_name,
        display_name_en,
        email,
        phone,
        user_type,
        avatar_url,
        verified_at,
        created_at,
        subscriptions!left(
          id,
          tier,
          plan_id,
          status,
          billing_cycle,
          current_period_end
        ),
        lawyer_profiles!left(
          credit_balance
        )
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    // ── Filters ──────────────────────────────────────────────────────────────
    const orClause = searchClause(search);
    if (orClause) {
      query = query.or(orClause);
    }

    if (role) {
      // Proved to be one of the nine by the `isDbUserType` check above.
      query = query.eq("user_type", role);
    }

    // Tier and status filters are applied on the subscriptions relation.
    //
    // NOT LOAD-BEARING, and left exactly as they were on purpose. Because the
    // embed is `subscriptions!left(...)`, PostgREST applies these to the
    // EMBEDDED rows: a profile whose subscription does not match still comes
    // back, just with an empty `subscriptions` array. So neither one narrows
    // the list of users, and neither one moves `count`. Adding `!inner` is the
    // obvious repair and is a worse bug — it would drop every profile with no
    // subscription row at all, which on this platform is most accounts.
    //
    // The caller's status vocabulary does not line up with this column either:
    // the directory's «بانتظار التحقق» and «نشط» are `profiles.verified_at`
    // predicates, not subscription statuses. Repairing that means deciding, per
    // value, whether it belongs on `profiles` or on `subscriptions`, and it is
    // not part of the user-type work this file was opened for.
    if (tier) {
      query = query.eq("subscriptions.tier", tier);
    }

    if (status) {
      query = query.eq("subscriptions.status", status);
    }

    // ── Per-type counts for the filter bar ───────────────────────────────────
    //
    // Nine parallel `head` counts rather than one `select("user_type")` tally:
    // an un-ranged select is capped by PostgREST's `max-rows` (1000 by
    // default), so a tally silently undercounts once the table passes that —
    // precisely the wrong-but-plausible number a filter bar must never show.
    //
    // Gated on `include_counts` because this route has a second caller that
    // must not pay for them: the entitlements screen
    // (src/app/dashboard/admin/entitlements/page.tsx) calls it once per search
    // keystroke and reads `data` alone.
    //
    // Only `search` is applied — deliberately not `tier` or `status`. Per the
    // note above, those two do not narrow which profiles come back, so a count
    // computed from `search` alone is exactly the number of rows the matching
    // chip would show. The day either filter is repaired to narrow the parent
    // rows, these counts have to learn about it in the same change.
    //
    // Started before the page of users is awaited so the ten round trips
    // overlap instead of queueing behind each other.
    const countsPromise = includeCounts
      ? Promise.all(
          DB_USER_TYPES.map((t) => {
            let q = adminClient
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("user_type", t);
            if (orClause) q = q.or(orClause);
            return q;
          }),
        )
      : null;

    // ── Paginate ─────────────────────────────────────────────────────────────
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const countResults = countsPromise ? await countsPromise : null;
    const counts = countResults
      ? (Object.fromEntries(
          DB_USER_TYPES.map((t, i) => [t, countResults[i].count ?? 0]),
        ) as Record<DbUserType, number>)
      : null;

    // ── Transform results ────────────────────────────────────────────────────
    const users = (data ?? []).map((row: Record<string, unknown>) => {
      // Pick the active subscription (first match) or null
      const subs = row.subscriptions as Record<string, unknown>[] | null;
      const activeSub =
        subs?.find((s) => s.status === "active") ?? subs?.[0] ?? null;

      const lawyerProfiles = row.lawyer_profiles as
        | Record<string, unknown>[]
        | Record<string, unknown>
        | null;
      const lp = Array.isArray(lawyerProfiles)
        ? lawyerProfiles[0]
        : lawyerProfiles;

      return {
        id: row.id,
        display_name: row.display_name,
        display_name_en: row.display_name_en,
        email: row.email,
        phone: row.phone,
        user_type: row.user_type,
        avatar_url: row.avatar_url,
        verified_at: row.verified_at,
        created_at: row.created_at,
        subscription: activeSub
          ? {
              id: activeSub.id,
              tier: activeSub.tier,
              plan_id: activeSub.plan_id,
              status: activeSub.status,
              billing_cycle: activeSub.billing_cycle,
              current_period_end: activeSub.current_period_end,
            }
          : null,
        credit_balance: (lp?.credit_balance as number) ?? 0,
      };
    });

    return NextResponse.json({
      data: users,
      total: count ?? 0,
      page,
      limit,
      // Absent — not a zeroed object — when the caller did not ask for counts.
      // Nine zeros would read on the filter bar as "no users of any type",
      // which is a claim this response has not made.
      ...(counts ? { counts } : {}),
    });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب المستخدمين" },
      { status: 500 },
    );
  }
}
