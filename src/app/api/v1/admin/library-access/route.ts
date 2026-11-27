import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LIBRARY_ACCESS_DEFAULTS,
  LIBRARY_ACCESS_SETTING_KEY,
  LIBRARY_ACCOUNT_KEYS,
  LIBRARY_ACCOUNT_LABELS_AR,
  overrideEndFromRow,
  overrideInForce,
  parseLibraryAccessMap,
  parseLibraryAccessPatch,
  parseOverrideInput,
} from "@/lib/library/accountAccess";
import { hasActiveLibraryGrant } from "@/lib/libraryAccessServer";

/**
 * /api/v1/admin/library-access — owner item 9 (batch l8): the legal library
 * per account type, and per-account exceptions.
 *
 * GET    any staff role (requireStaff("read")): the switch map (the stored row
 *        over the defaults), the exceptions with each account's name, e-mail
 *        and type, and the last 30 changes from admin_audit_events.
 * PUT    { map: { lawyer?, consultant?, firm?, individual?, business?, provider? } }
 *        requireStaff("settings.write"). Upserts platform_settings
 *        library_access_by_account_type; audited with the whole map before and
 *        after. Takes effect on the next library request (nothing caches it).
 * POST   { email | userId, allowed, reason, expiresAt?, endsWithSubscription? }
 *        requireStaff("settings.write"): one account's exception (upsert);
 *        audited before/after. Q94a (batch l12, 20261202_50): an exception
 *        may end on a date and/or with the account's library subscription
 *        (held while a library grant covers now). «Ends with the
 *        subscription» with no date needs a subscription held now (409
 *        otherwise: give a date to buy before).
 * DELETE ?userId= requireStaff("settings.write"): removes an exception;
 *        404 when there is none; audited.
 *
 * Before 20261128_20 runs: the map still saves (the row is a plain
 * platform_settings row) and applies at once; the exceptions table is missing,
 * so GET says so and POST / DELETE answer 503 with the file to run.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MIGRATION_MISSING_AR = "شغّل ملف الترحيل 20261128_20_library_access_by_account_type.sql أولاً";
const END_MIGRATION_MISSING_AR = "انتهاء الاستثناء غير متاح بعد: شغّل ملف الترحيل 20261202_50_l12_rules.sql أولاً";
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);
/** A column PostgREST does not know yet (20261202_50 not run). */
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);
const NO_SUBSCRIPTION_AR =
  "لا يوجد اشتراك مكتبة ساري لهذا الحساب الآن. حدّد تاريخاً ينتهي فيه الاستثناء (مهلة ليشترك)، ويستمر بعده ما دام اشتراكه سارياً.";
const TARGET_TYPE = "library_access";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
type Row = Record<string, unknown>;

async function readMap(service: ServiceClient) {
  const { data, error } = await service
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", LIBRARY_ACCESS_SETTING_KEY)
    .maybeSingle();
  return { row: (data ?? null) as Row | null, error };
}

async function findUser(service: ServiceClient, userId: string | null, email: string | null) {
  let q = service.from("profiles").select("id, display_name, email, user_type");
  // ilike for case only: the e-mail's own % _ \ are escaped, never wildcards
  q = userId ? q.eq("id", userId) : q.ilike("email", (email ?? "").replace(/[\\%_]/g, (c) => "\\" + c));
  const { data, error } = await q.limit(2);
  if (error) return { error: true as const };
  const rows = (data ?? []) as Row[];
  if (rows.length !== 1) return { error: false as const, user: null, ambiguous: rows.length > 1 };
  return { error: false as const, user: rows[0], ambiguous: false };
}

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();

    const [map, overrides, history] = await Promise.all([
      readMap(service),
      // "*": the end columns (Q94a, 20261202_50) are listed when they exist.
      service
        .from("library_access_user_overrides")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500),
      service
        .from("admin_audit_events")
        .select("action, actor_email, target_id, before_state, after_state, created_at")
        .eq("target_type", TARGET_TYPE)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (map.error) {
      console.error("[admin/library-access GET] setting read failed:", map.error.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعداد" }, { status: 500 });
    }

    const overridesMissing = !!overrides.error && MISSING_TABLE.has(overrides.error.code ?? "");
    if (overrides.error && !overridesMissing) {
      console.error("[admin/library-access GET] overrides read failed:", overrides.error.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستثناءات" }, { status: 500 });
    }
    const overrideRows = overridesMissing ? [] : ((overrides.data ?? []) as Row[]);
    const ids = overrideRows.map((r) => String(r.user_id));
    const people = new Map<string, Row>();
    if (ids.length > 0) {
      const { data } = await service.from("profiles").select("id, display_name, email, user_type").in("id", ids);
      for (const p of (data ?? []) as Row[]) people.set(String(p.id), p);
    }
    // Q94a: who among the «ends with the subscription» exceptions holds a library grant now.
    const withSub = overrideRows.filter((r) => overrideEndFromRow(r).endsWithSubscription).map((r) => String(r.user_id));
    const subscribed = new Set<string>();
    if (withSub.length > 0) {
      const nowIso = new Date().toISOString();
      const { data } = await service
        .from("library_access_grants")
        .select("user_id")
        .in("user_id", withSub)
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso);
      for (const g of (data ?? []) as Row[]) subscribed.add(String(g.user_id));
    }

    return NextResponse.json(
      {
        keys: LIBRARY_ACCOUNT_KEYS,
        labels: LIBRARY_ACCOUNT_LABELS_AR,
        defaults: LIBRARY_ACCESS_DEFAULTS,
        map: parseLibraryAccessMap(map.row?.value),
        settingStored: map.row !== null,
        updatedAt: typeof map.row?.updated_at === "string" ? map.row.updated_at : null,
        overrides: overrideRows.map((r) => {
          const p = people.get(String(r.user_id));
          const end = overrideEndFromRow(r);
          return {
            userId: String(r.user_id),
            allowed: r.allowed === true,
            reason: typeof r.reason === "string" ? r.reason : "",
            expiresAt: end.expiresAt,
            endsWithSubscription: end.endsWithSubscription,
            inForce: overrideInForce(end, subscribed.has(String(r.user_id))),
            updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
            name: typeof p?.display_name === "string" ? p.display_name : "",
            email: typeof p?.email === "string" ? p.email : "",
            userType: typeof p?.user_type === "string" ? p.user_type : null,
          };
        }),
        overridesMigrationMissing: overridesMissing,
        // Q94a: the end columns exist (20261202_50 run) — the page offers the end fields.
        overrideEndAvailable: !overridesMissing && (overrideRows.length === 0 || "ends_with_subscription" in (overrideRows[0] ?? {})),
        history: history.error ? [] : (history.data ?? []),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/library-access GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => null);
    const parsed = parseLibraryAccessPatch(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = await createServiceClient();
    const current = await readMap(service);
    if (current.error) {
      console.error("[admin/library-access PUT] setting read failed:", current.error.code);
      return NextResponse.json({ error: "تعذّر قراءة الإعداد" }, { status: 500 });
    }
    const before = parseLibraryAccessMap(current.row?.value);
    const after = { ...before, ...parsed.patch };

    const { error } = await service.from("platform_settings").upsert(
      {
        key: LIBRARY_ACCESS_SETTING_KEY,
        value: after,
        description: "المكتبة القانونية مفتوحة لكل نوع حساب أو مغلقة (المحامي والمستشار ومكتب المحاماة مفتوحة والباقي مغلق افتراضياً) — owner item 9 + ق٢٦-٢",
        updated_by: gate.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      console.error("[admin/library-access PUT] save failed:", error.code);
      return NextResponse.json({ error: "تعذّر حفظ الإعداد" }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "library_access_by_account_type_updated",
      targetType: TARGET_TYPE,
      targetId: LIBRARY_ACCESS_SETTING_KEY,
      before,
      after,
      metadata: { changed: Object.keys(parsed.patch) },
    });
    return NextResponse.json({ map: after }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-access PUT] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => null);
    const input = parseOverrideInput(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    const service = await createServiceClient();
    const found = await findUser(service, input.userId, input.email);
    if (found.error) return NextResponse.json({ error: "تعذّر البحث عن الحساب" }, { status: 500 });
    if (!found.user) {
      return NextResponse.json(
        { error: found.ambiguous ? "أكثر من حساب بهذا البريد — استخدم معرّف الحساب" : "لا يوجد حساب بهذا البريد أو المعرّف" },
        { status: 404 },
      );
    }
    const userId = String(found.user.id);

    const prev = await service
      .from("library_access_user_overrides")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (prev.error) {
      if (MISSING_TABLE.has(prev.error.code ?? "")) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-access POST] read failed:", prev.error.code);
      return NextResponse.json({ error: "تعذّر حفظ الاستثناء" }, { status: 500 });
    }

    // Q94a: «ends with the subscription» and no date → a subscription must be held now.
    if (input.endsWithSubscription && !input.expiresAt && !(await hasActiveLibraryGrant(userId))) {
      return NextResponse.json({ error: NO_SUBSCRIPTION_AR }, { status: 409 });
    }

    const now = new Date().toISOString();
    const hasEnd = input.expiresAt !== null || input.endsWithSubscription;
    const row = {
      user_id: userId,
      allowed: input.allowed,
      reason: input.reason,
      updated_by: gate.userId,
      updated_at: now,
      ...(prev.data ? {} : { created_by: gate.userId, created_at: now }),
    };
    let { error } = await service.from("library_access_user_overrides").upsert(
      { ...row, expires_at: input.expiresAt, ends_with_subscription: input.endsWithSubscription },
      { onConflict: "user_id" },
    );
    // Before 20261202_50 the end columns do not exist: a permanent exception
    // still saves (as before); one with an end is refused, never saved without it.
    if (error && MISSING_COLUMN.has(error.code ?? "")) {
      if (hasEnd) return NextResponse.json({ error: END_MIGRATION_MISSING_AR }, { status: 503 });
      ({ error } = await service.from("library_access_user_overrides").upsert(row, { onConflict: "user_id" }));
    }
    if (error) {
      if (MISSING_TABLE.has(error.code ?? "")) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-access POST] save failed:", error.code);
      return NextResponse.json({ error: "تعذّر حفظ الاستثناء" }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "library_access_override_set",
      targetType: TARGET_TYPE,
      targetId: userId,
      before: prev.data ?? null,
      after: { allowed: input.allowed, reason: input.reason, expires_at: input.expiresAt, ends_with_subscription: input.endsWithSubscription },
      metadata: { user_type: found.user.user_type ?? null },
    });
    return NextResponse.json({ ok: true, userId }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-access POST] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const userId = request.nextUrl.searchParams.get("userId") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: "معرّف الحساب غير صالح" }, { status: 400 });
    }

    const service = await createServiceClient();
    const { data, error } = await service
      .from("library_access_user_overrides")
      .delete()
      .eq("user_id", userId.toLowerCase())
      .select("*");
    if (error) {
      if (MISSING_TABLE.has(error.code ?? "")) return NextResponse.json({ error: MIGRATION_MISSING_AR }, { status: 503 });
      console.error("[admin/library-access DELETE] failed:", error.code);
      return NextResponse.json({ error: "تعذّر حذف الاستثناء" }, { status: 500 });
    }
    const removed = (data ?? []) as Row[];
    if (removed.length === 0) return NextResponse.json({ error: "لا يوجد استثناء لهذا الحساب" }, { status: 404 });

    await logAdminAction({
      actorId: gate.userId,
      action: "library_access_override_removed",
      targetType: TARGET_TYPE,
      targetId: userId.toLowerCase(),
      before: removed[0],
      after: null,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-access DELETE] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
