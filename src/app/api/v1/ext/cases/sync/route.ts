import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { MAX_BODY_BYTES, parseCasesSyncRequest } from "@/lib/ext/casesSync";
import { extError, extJson, requireExtCaller } from "../../_extAuth";

/**
 * POST /api/v1/ext/cases/sync — مزامنة سحبة قضية من إضافة كروم (العقد: docs/plans/2026-11-21-ext-cases-sync-contract.md).
 * تعتمد على باب `/ext` (_extAuth.ts) ونطاق `cases:sync` (مضاف إلى Scope وإلى
 * check الجدول api_tokens في migration_v2.sql)، وعلى SQL_batch_2026-11-21_ext_cases_sync.
 * المستخدم يُستخلص من التوكن فقط. لا يُسجَّل نص الحزمة؛ أعداد فقط.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const caller = await requireExtCaller(request, "cases:sync");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return extError(413, "too_large", "الحزمة أكبر من الحد المسموح (١ م.ب).", rid);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return extError(413, "too_large", "الحزمة أكبر من الحد المسموح (١ م.ب).", rid);

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return extError(422, "invalid_body", "الجسم ليس JSON صالحًا.", rid, { errors: [] }); }

  const parsed = parseCasesSyncRequest(body);
  if (!parsed.ok) return extError(parsed.status, parsed.code, "الحزمة غير مطابقة للعقد.", rid, { errors: parsed.errors });

  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("ext_cases_sync", { p_user: caller.userId, p_req: parsed.value });
    if (error || !data) {
      console.error("[ext/cases/sync] rpc failed:", error?.code ?? "no-data");
      return extError(503, "unavailable", "تعذّرت المزامنة الآن — أعد المحاولة بعد قليل.", rid);
    }
    const res = data as { created: boolean };
    return extJson(res.created ? 201 : 200, { request_id: rid, ...res }, rid);
  } catch (err) {
    console.error("[ext/cases/sync] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّرت المزامنة الآن — أعد المحاولة بعد قليل.", rid);
  }
}
