import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminActionsStrict } from "@/lib/auth/adminAudit";
import {
  isUuid,
  parseViewAsPage,
  readViewAsPage,
  readViewAsTarget,
  viewAsAuditInput,
} from "@/lib/admin/viewAsCore";
import { isTestAccountForViewAs, VIEW_AS_TEST_ONLY_AR, VIEW_AS_TEST_ONLY_CODE } from "@/lib/admin/viewAsTestOnly";

/**
 * GET /api/v1/admin/users/[id]/view-as?page=home|cases|profile[&session=<uuid>]
 * — S2 «عرض كمستخدم»: a READ-ONLY view of what this user sees, built with the
 * service client filtered to the user's id (src/lib/admin/viewAsCore.ts). No
 * sign-in as the user, no token, and no write method on this route.
 *
 * Without `session` a new view session starts: `view_as_start` + the first
 * `view_as_page`; with it, one more `view_as_page`. The rows land in
 * admin_audit_events BEFORE any of the user's page data is read (only the
 * header — name / email / type, which the 404 needs — is read first); if they
 * do not land, 503 and nothing is shown.
 *
 * Gate: requireStaff("users.view_as") — super_admin only (and every admin
 * while platform_staff does not exist, requireStaff's deploy-order rule).
 *
 * Owner ١٠٨ (batch l12): TEST ACCOUNTS ONLY. Before anything is read or
 * audited, public.is_test_account(target) must answer true; otherwise 403
 * (src/lib/admin/viewAsTestOnly.ts — a failed check is a refusal).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("users.view_as");
  if (!gate.ok) return gate.response;

  const { id: targetId } = await params;
  if (!isUuid(targetId)) return json({ error: "معرّف المستخدم غير صالح" }, 400);

  const url = new URL(request.url);
  const page = parseViewAsPage(url.searchParams.get("page") ?? "home");
  if (!page) return json({ error: "صفحة غير معروفة" }, 400);
  const sessionParam = url.searchParams.get("session");
  if (sessionParam !== null && !isUuid(sessionParam)) return json({ error: "جلسة العرض غير صالحة" }, 400);

  try {
    const admin = await createServiceClient();
    // Owner ١٠٨ (l12): a real user is never viewed — refused before any read or audit row.
    if (!(await isTestAccountForViewAs(admin, targetId))) {
      return json({ error: VIEW_AS_TEST_ONLY_AR, code: VIEW_AS_TEST_ONLY_CODE }, 403);
    }
    const target = await readViewAsTarget(admin, targetId);
    if (!target) return json({ error: "المستخدم غير موجود" }, 404);

    const now = new Date();
    const sessionId = sessionParam ?? randomUUID();
    const base = { adminId: gate.userId, targetId, sessionId, page, at: now };
    const rows = sessionParam
      ? [viewAsAuditInput({ ...base, kind: "page" })]
      : [viewAsAuditInput({ ...base, kind: "start" }), viewAsAuditInput({ ...base, kind: "page" })];
    if (!(await logAdminActionsStrict(rows))) {
      return json({ error: "تعذّر تسجيل جلسة العرض في سجل التدقيق، لذلك لم تُعرض البيانات" }, 503);
    }

    const data = await readViewAsPage(admin, targetId, page, now);
    if (data === null) return json({ error: "تعذّر قراءة بيانات المستخدم" }, 503);

    return json({ sessionId, readOnly: true, target, page, data });
  } catch (err) {
    console.error("[admin/view-as] failed:", err instanceof Error ? err.message : "unknown");
    return json({ error: "تعذّر إتمام العملية، حاول مرة أخرى" }, 500);
  }
}
