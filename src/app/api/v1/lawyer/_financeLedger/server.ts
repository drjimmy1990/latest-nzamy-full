/**
 * _financeLedger/server.ts — what the time / expenses / trust / fee-statement
 * routes share (batch l6-ledger, migration 20261126_40).
 *
 * Every read and write goes through the caller's SESSION client: RLS decides
 * which rows exist for him (the writer, the firm owner / managing partner /
 * partner / finance manager; never a restricted case outside its team). The
 * firm of a row is read from its case or its client card here, never taken
 * from the request; the insert policies check it again.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hydrateAuthorNames, type CaseNoteRow } from "@/app/api/v1/cases/[id]/notes/_shared";
import type { Named } from "@/lib/financeLedger/financeLedgerRules";

type Pg = { code?: string | null; message?: string | null } | null | undefined;

export const MIGRATION_MISSING_AR =
  "سجلات الوقت والمصروفات والأمانات غير مفعّلة بعد على قاعدة البيانات — يلزم تشغيل ملف الترحيل 20261126_40.";

/** A Postgres / PostgREST error → status + Arabic message. */
export function financeDbError(error: Pg): { status: number; message: string } {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883") {
    return { status: 503, message: MIGRATION_MISSING_AR };
  }
  if (code === "55000") return { status: 409, message: "هذا القيد مُلغى — القيد الملغى لا يُعدَّل." };
  if (code === "42501") {
    if (msg.includes("billed")) {
      return { status: 409, message: "لا يعدّل القيد إلا من سجّله، وقبل إدخاله في فاتورة. ألغِه بسبب وسجّل قيداً جديداً." };
    }
    return { status: 403, message: "لا تملك صلاحية هذا القيد — القضية أو الموكل ليس من عملك أو من مكتبك." };
  }
  if (code === "23514") return { status: 400, message: "قيمة غير مقبولة — تحقق من المبلغ والمدة وسبب الإلغاء (3 أحرف على الأقل)." };
  if (code === "23505") return { status: 409, message: "جلسة العمل هذه سُجّلت قيدَ وقتٍ من قبل." };
  if (code === "23503") return { status: 400, message: "القضية أو الموكل أو الفاتورة غير موجودة." };
  return { status: 500, message: "تعذّر حفظ القيد." };
}

export function errorResponse(error: Pg, tag: string): NextResponse {
  console.error(`[${tag}]`, error?.code, error?.message);
  const m = financeDbError(error);
  return NextResponse.json({ error: m.message }, { status: m.status });
}

/**
 * The firm a new row must carry: the case's (NULL on a solo case), else the
 * client card's. An unreadable case or card → 404 (RLS hides it, or it does
 * not exist — the same answer).
 */
export async function resolveRowFirm(
  supabase: SupabaseClient,
  caseId: string | null,
  clientId: string | null,
): Promise<{ ok: true; firmId: string | null } | { ok: false; response: NextResponse }> {
  if (caseId) {
    const { data, error } = await supabase.from("service_requests").select("id, firm_id").eq("id", caseId).maybeSingle();
    if (error) {
      console.error("[financeLedger] case lookup failed:", error.message, error.code);
      return { ok: false, response: NextResponse.json({ error: "تعذّر التحقق من القضية." }, { status: 500 }) };
    }
    if (!data) {
      return { ok: false, response: NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية الوصول إليها." }, { status: 404 }) };
    }
    return { ok: true, firmId: (data as { firm_id: string | null }).firm_id ?? null };
  }
  if (clientId) {
    const { data, error } = await supabase.from("lawyer_clients").select("id, firm_id").eq("id", clientId).maybeSingle();
    if (error) {
      console.error("[financeLedger] client lookup failed:", error.message, error.code);
      return { ok: false, response: NextResponse.json({ error: "تعذّر التحقق من الموكل." }, { status: 500 }) };
    }
    if (!data) {
      return { ok: false, response: NextResponse.json({ error: "الموكل غير موجود أو لا تملك صلاحية الوصول إليه." }, { status: 404 }) };
    }
    return { ok: true, firmId: (data as { firm_id: string | null }).firm_id ?? null };
  }
  return { ok: false, response: NextResponse.json({ error: "اختر القضية أو الموكل." }, { status: 400 }) };
}

interface LabelSource {
  case_request_id: string | null;
  lawyer_client_id: string | null;
  created_by: string | null;
}

/**
 * Case titles, client names and writer names for a page of rows. Labels only
 * — the rows were already chosen by RLS. Titles and names the caller cannot
 * read stay null (the screen shows «قضية» / «موكل» then).
 */
export async function labelRows(
  supabase: SupabaseClient,
  rows: readonly LabelSource[],
): Promise<(r: LabelSource) => Named> {
  const caseIds = [...new Set(rows.map((r) => r.case_request_id).filter((x): x is string => !!x))];
  const clientIds = [...new Set(rows.map((r) => r.lawyer_client_id).filter((x): x is string => !!x))];
  const cases = new Map<string, string>();
  const clients = new Map<string, string>();
  if (caseIds.length) {
    const { data } = await supabase.from("service_requests").select("id, title").in("id", caseIds.slice(0, 300));
    for (const c of (data ?? []) as { id: string; title: string | null }[]) if (c.title) cases.set(c.id, c.title);
  }
  if (clientIds.length) {
    const { data } = await supabase.from("lawyer_clients").select("id, name").in("id", clientIds.slice(0, 300));
    for (const c of (data ?? []) as { id: string; name: string | null }[]) if (c.name) clients.set(c.id, c.name);
  }
  const authors = rows
    .filter((r) => !!r.created_by)
    .map((r) => ({ author_user_id: r.created_by as string })) as unknown as CaseNoteRow[];
  const writers = authors.length ? await hydrateAuthorNames(authors).catch(() => new Map<string, string>()) : new Map<string, string>();
  return (r) => ({
    caseTitle: r.case_request_id ? cases.get(r.case_request_id) ?? null : null,
    clientName: r.lawyer_client_id ? clients.get(r.lawyer_client_id) ?? null : null,
    writerName: r.created_by ? writers.get(r.created_by) ?? null : null,
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
