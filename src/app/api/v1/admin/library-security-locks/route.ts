import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LOCK_SELECT,
  LOCKS_MIGRATION_MISSING_AR,
  isMigrationMissing,
  lockDbError,
  parseCreateLockBody,
  toLockDto,
  type LockRow,
  type PersonRef,
} from "@/lib/library/securityLockAdmin";

/**
 * Owner note ١٣ C09 — library-only security locks (public.library_security_locks,
 * 20261030_80). A lock stops library reading only; it never freezes or deletes
 * the account (that is account deletion, /account-frozen, a different thing).
 *
 * GET  ?state=open|all — the locks, newest first (open = not lifted; `active`
 *      also checks the end date). Any admin (requireStaff("read")).
 * POST { email | userId, note, until? } — an admin locks a user's library
 *      reading (requireStaff("settings.write"), the same action the security
 *      page is classified under), audited.
 *
 * The table holds no grant for the API roles, so it is read and written with
 * the service client, after the staff check, only through these routes.
 */

export const dynamic = "force-dynamic";
const MAX_ROWS = 200;

async function peopleFor(ids: string[]): Promise<Map<string, PersonRef>> {
  const out = new Map<string, PersonRef>();
  if (ids.length === 0) return out;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name, email").in("id", ids);
    if (error) {
      console.error("[admin/library-security-locks] profile lookup failed:", error.code);
      return out;
    }
    for (const p of (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
      out.set(p.id, { name: p.display_name ?? null, email: p.email ?? null });
    }
  } catch (err) {
    console.error("[admin/library-security-locks] profile lookup threw:", err instanceof Error ? err.name : "error");
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;

    const state = new URL(request.url).searchParams.get("state") === "all" ? "all" : "open";
    const service = await createServiceClient();
    let query = service
      .from("library_security_locks")
      .select(LOCK_SELECT)
      .order("locked_at", { ascending: false })
      .limit(MAX_ROWS);
    if (state === "open") query = query.is("lifted_at", null);

    const { data, error } = await query;
    if (error) {
      if (isMigrationMissing(error.code)) {
        return NextResponse.json({ data: [], migrationMissing: true, message: LOCKS_MIGRATION_MISSING_AR });
      }
      console.error("[admin/library-security-locks GET] query failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل أقفال المكتبة." }, { status: 500 });
    }

    const rows = (data ?? []) as LockRow[];
    const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.locked_by, r.lifted_by]).filter((x): x is string => !!x))];
    const people = await peopleFor(ids);
    const now = Date.now();
    return NextResponse.json(
      { data: rows.map((r) => toLockDto(r, people, now)), migrationMissing: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/library-security-locks GET] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const parsed = parseCreateLockBody(body, Date.now());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const service = await createServiceClient();
    let userId = input.userId;
    if (!userId && input.email) {
      const { data: found, error: findError } = await service
        .from("profiles")
        .select("id")
        .ilike("email", input.email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .limit(2);
      if (findError) {
        console.error("[admin/library-security-locks POST] user lookup failed:", findError.code);
        return NextResponse.json({ error: "تعذّر البحث عن المستخدم." }, { status: 500 });
      }
      if (!found || found.length === 0) return NextResponse.json({ error: "لا يوجد مستخدم بهذا البريد." }, { status: 404 });
      if (found.length > 1) return NextResponse.json({ error: "أكثر من حساب بهذا البريد؛ استخدم المعرّف." }, { status: 409 });
      userId = (found[0] as { id: string }).id;
    }

    const { data, error } = await service.rpc("library_security_lock_create", {
      p_user: userId,
      p_admin: gate.userId,
      p_note: input.note,
      p_until: input.until,
    });
    if (error) {
      const mapped = lockDbError(error);
      if (mapped.status === 500) console.error("[admin/library-security-locks POST] create failed:", error.code);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    const row = (Array.isArray(data) ? data[0] : data) as LockRow | null;
    if (!row) return NextResponse.json({ error: "تعذّر حفظ العملية." }, { status: 500 });

    await logAdminAction({
      actorId: gate.userId,
      action: "library_security_lock_created",
      targetType: "library_security_lock",
      targetId: row.id,
      after: { user_id: row.user_id, reference: row.reference, locked_until: row.locked_until, reason: row.reason },
    });

    const people = await peopleFor([row.user_id, gate.userId]);
    return NextResponse.json({ data: toLockDto(row, people, Date.now()) }, { status: 201 });
  } catch (err) {
    console.error("[admin/library-security-locks POST] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
