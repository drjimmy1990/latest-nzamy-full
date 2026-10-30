import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import {
  CSV_MAX_ROWS,
  EXPIRING_WINDOW_DAYS,
  GRANT_CSV_HEADER,
  LIST_PAGE_SIZE,
  grantCsvRow,
  grantStatus,
  parseGrantListQuery,
  toCsv,
  type GrantListRow,
} from "@/lib/libraryAccessAdmin";

/**
 * GET /api/v1/admin/library-grants — «اشتراكات المكتبة» (owner note ١٨ C03):
 * every library_access_grants row with who holds it, the plan, the source
 * (شراء / طلب / كود / زميل / أدمن), who granted it, the order, the window,
 * the revoke, and the admin's reason (library_access_grant_admin, 20261030_65).
 *
 * Query (parseGrantListQuery — anything unrecognised is dropped):
 *   q          name or email of the holder
 *   status     active | expiring (ends within 30 days) | upcoming | expired | revoked
 *   source     purchase | request | invite_code | colleague_invite | admin | founder_campaign
 *   plan       lib-q1 | lib-q2 | lib-annual | lib-invite | lib-trial | lib-founder | lib-admin
 *   grantedBy  an admin's uuid;  orderId  a payment order's uuid
 *   endsFrom / endsTo  YYYY-MM-DD (Riyadh days) bounding the end
 *   page       50 rows a page;  format=csv → the whole filtered list (up to
 *              5,000 rows) as a UTF-8 CSV with a BOM, so Excel shows Arabic.
 *
 * Gate: requireStaff("entitlements.grant") — the list carries every holder's
 * email and the admins' reasons, and its rows carry the revoke / end-change
 * buttons. The CSV is built here, on the server, behind the same gate; it is
 * never assembled in the browser. Reads with the service role (the side table
 * is service-role only). Never cached.
 */

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

interface GrantDbRow {
  id: string;
  user_id: string;
  plan_ref: string;
  source: string;
  starts_at: string;
  ends_at: string;
  granted_by: string | null;
  order_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  library_access_grant_admin:
    | { reason: string | null; notes: string | null; revoke_reason: string | null; adjust_reason: string | null }
    | { reason: string | null; notes: string | null; revoke_reason: string | null; adjust_reason: string | null }[]
    | null;
}

const SELECT =
  "id, user_id, plan_ref, source, starts_at, ends_at, granted_by, order_id, revoked_at, revoked_by, created_at, " +
  "library_access_grant_admin(reason, notes, revoke_reason, adjust_reason)";

export async function GET(request: NextRequest) {
  const gate = await requireStaff("entitlements.grant");
  if (!gate.ok) return gate.response;

  const f = parseGrantListQuery(request.nextUrl.searchParams);
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const admin = await createServiceClient();

    // 1. the holder search → user ids (bounded: `.in()` breaks past ~396 ids)
    let userIds: string[] | null = null;
    if (f.q) {
      const { data: people, error } = await admin
        .from("profiles")
        .select("id")
        .or(`display_name.ilike.%${f.q}%,display_name_en.ilike.%${f.q}%,email.ilike.%${f.q}%`)
        .limit(200);
      if (error) throw new Error(`profiles search: ${error.code}`);
      userIds = (people ?? []).map((p: { id: string }) => p.id);
      if (userIds.length === 0) return reply(f.format, [], 0, f.page, now);
    }

    // 2. the grants
    let query = admin.from("library_access_grants").select(SELECT, { count: "exact" });
    if (userIds) query = query.in("user_id", userIds);
    if (f.source) query = query.eq("source", f.source);
    if (f.planRef) query = query.eq("plan_ref", f.planRef);
    if (f.grantedBy) query = query.eq("granted_by", f.grantedBy);
    if (f.orderId) query = query.eq("order_id", f.orderId);
    if (f.endsFrom) query = query.gte("ends_at", f.endsFrom);
    if (f.endsTo) query = query.lte("ends_at", f.endsTo);
    switch (f.status) {
      case "revoked":
        query = query.not("revoked_at", "is", null);
        break;
      case "expired":
        query = query.is("revoked_at", null).lte("ends_at", nowIso);
        break;
      case "upcoming":
        query = query.is("revoked_at", null).gt("starts_at", nowIso);
        break;
      case "active":
        query = query.is("revoked_at", null).lte("starts_at", nowIso).gt("ends_at", nowIso);
        break;
      case "expiring": {
        const horizon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000).toISOString();
        query = query.is("revoked_at", null).lte("starts_at", nowIso).gt("ends_at", nowIso).lte("ends_at", horizon);
        break;
      }
    }
    query = query.order("ends_at", { ascending: true }).order("id", { ascending: true });
    query =
      f.format === "csv"
        ? query.range(0, CSV_MAX_ROWS - 1)
        : query.range((f.page - 1) * LIST_PAGE_SIZE, f.page * LIST_PAGE_SIZE - 1);

    const { data, error, count } = await query;
    if (error) {
      const needsSql = error.code === "42703" || error.code === "PGRST200" || error.code === "42P01" || error.code === "PGRST205";
      console.error("[admin/library-grants] list failed:", error.code, error.message);
      return NextResponse.json(
        {
          error: needsSql
            ? "صفحة اشتراكات المكتبة تحتاج تشغيل ملف قاعدة البيانات 20261030_65 أولاً"
            : "تعذّر تحميل اشتراكات المكتبة",
        },
        { status: needsSql ? 503 : 500, headers: NO_STORE },
      );
    }
    const grants = (data ?? []) as unknown as GrantDbRow[];

    // 3. names of holders and granting admins, one read
    const ids = Array.from(
      new Set(grants.flatMap((g) => [g.user_id, g.granted_by].filter((x): x is string => typeof x === "string"))),
    );
    const people = new Map<string, { name: string | null; email: string | null; type: string | null }>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: rows } = await admin
        .from("profiles")
        .select("id, display_name, email, user_type")
        .in("id", ids.slice(i, i + 300));
      for (const p of (rows ?? []) as { id: string; display_name: string | null; email: string | null; user_type: string | null }[]) {
        people.set(p.id, { name: p.display_name || null, email: p.email, type: p.user_type });
      }
    }

    const rows: GrantListRow[] = grants.map((g) => {
      const side = Array.isArray(g.library_access_grant_admin) ? g.library_access_grant_admin[0] : g.library_access_grant_admin;
      const holder = people.get(g.user_id);
      return {
        id: g.id,
        user_id: g.user_id,
        user_name: holder?.name ?? null,
        user_email: holder?.email ?? null,
        user_type: holder?.type ?? null,
        plan_ref: g.plan_ref,
        source: g.source,
        starts_at: g.starts_at,
        ends_at: g.ends_at,
        granted_by: g.granted_by,
        granted_by_name: g.granted_by ? (people.get(g.granted_by)?.name ?? null) : null,
        order_id: g.order_id,
        revoked_at: g.revoked_at,
        revoked_by: g.revoked_by,
        reason: side?.reason ?? null,
        notes: side?.notes ?? null,
        revoke_reason: side?.revoke_reason ?? null,
        adjust_reason: side?.adjust_reason ?? null,
        created_at: g.created_at,
      };
    });

    return reply(f.format, rows, count ?? rows.length, f.page, now);
  } catch (err) {
    console.error("[admin/library-grants] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل اشتراكات المكتبة" }, { status: 500, headers: NO_STORE });
  }
}

function reply(format: "json" | "csv", rows: GrantListRow[], total: number, page: number, now: Date) {
  if (format === "csv") {
    const csv = toCsv(GRANT_CSV_HEADER, rows.map((r) => grantCsvRow(r, now)));
    const stamp = now.toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="library-subscriptions-${stamp}.csv"`,
      },
    });
  }
  return NextResponse.json(
    {
      success: true,
      data: rows.map((r) => ({ ...r, status: grantStatus(r, now) })),
      total,
      page,
      pageSize: LIST_PAGE_SIZE,
    },
    { headers: NO_STORE },
  );
}
