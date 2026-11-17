import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { createServiceClient } from "@/lib/supabase/server";
import { LICENCE_ERRORS, LICENCE_MAX_BYTES, validateLicenceUpload } from "@/lib/services/licenceUpload";
import { UUID_RE, errorResponse } from "../../../_financeLedger/server";

/**
 * /api/v1/lawyer/expenses/[id]/receipt — the receipt of an expense, in the
 * private `documents` bucket under the WRITER's own folder
 * (`<uid>/expense-receipts/<expense id>-<time>.<ext>`), which is what the
 * bucket's own-folder policy and the row's guard both require.
 *
 * POST multipart `file` (JPG / PNG / WEBP / PDF, ≤ 5 MB, bytes must match the
 *      type — the licence-image checks): the writer, while the expense is
 *      neither voided nor billed. Uploaded with the SESSION client; the row
 *      update is RLS + guard checked; a failed update removes the object.
 * GET  → { url } a 5-minute signed link, for whoever can READ the row (RLS
 *      decides; the link itself is signed with the service client, as the
 *      attachment routes do).
 */

const MULTIPART_ALLOWANCE = 64 * 1024;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "المصروف غير موجود." }, { status: 404 });

    const rawLength = (request.headers.get("content-length") ?? "").trim();
    if (!/^\d+$/.test(rawLength)) return NextResponse.json({ error: "حجم الملف غير معروف." }, { status: 411 });
    if (Number(rawLength) > LICENCE_MAX_BYTES + MULTIPART_ALLOWANCE) {
      return NextResponse.json({ error: LICENCE_ERRORS.tooLarge }, { status: 413 });
    }

    const { data: row, error: rowError } = await supabase
      .from("lawyer_expenses")
      .select("id, created_by, receipt_path, voided_at, billed_payment_id")
      .eq("id", id)
      .maybeSingle();
    if (rowError) return errorResponse(rowError, "lawyer/expenses receipt POST read");
    const r = row as { created_by: string | null; receipt_path: string | null; voided_at: string | null; billed_payment_id: string | null } | null;
    if (!r) return NextResponse.json({ error: "المصروف غير موجود." }, { status: 404 });
    if (r.created_by !== user.id) return NextResponse.json({ error: "يرفع الإيصال من سجّل المصروف." }, { status: 403 });
    if (r.voided_at || r.billed_payment_id) {
      return NextResponse.json({ error: "المصروف ملغى أو مفوتر — لا يُغيَّر إيصاله." }, { status: 409 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "تعذّرت قراءة الملف المرفوع." }, { status: 400 });
    }
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0) {
      return NextResponse.json({ error: "اختر صورة الإيصال أو ملف PDF." }, { status: 400 });
    }
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const check = validateLicenceUpload({ size: file.size, type: file.type, head });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    const path = `${user.id}/expense-receipts/${id}-${Date.now()}.${check.ext}`;
    const bucket = supabase.storage.from("documents");
    const { error: uploadError } = await bucket.upload(path, await file.arrayBuffer(), {
      contentType: check.contentType,
      upsert: false,
    });
    if (uploadError) {
      console.error("[lawyer/expenses receipt POST] upload failed:", uploadError.message);
      return NextResponse.json({ error: "تعذّر رفع الإيصال." }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("lawyer_expenses")
      .update({ receipt_path: path })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      await bucket.remove([path]).catch(() => {});
      if (updateError) return errorResponse(updateError, "lawyer/expenses receipt POST update");
      return NextResponse.json({ error: "المصروف غير موجود." }, { status: 404 });
    }
    // The previous receipt (if any) is left in place on purpose: it was
    // attached to a financial record, and the storage is the writer's own.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lawyer/expenses receipt POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر رفع الإيصال." }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "المصروف غير موجود." }, { status: 404 });

    const { data, error } = await supabase.from("lawyer_expenses").select("id, receipt_path").eq("id", id).maybeSingle();
    if (error) return errorResponse(error, "lawyer/expenses receipt GET");
    const path = (data as { receipt_path: string | null } | null)?.receipt_path ?? null;
    if (!data || !path) return NextResponse.json({ error: "لا إيصال لهذا المصروف." }, { status: 404 });

    const service = await createServiceClient();
    const { data: signed, error: signError } = await service.storage.from("documents").createSignedUrl(path, 300);
    if (signError || !signed?.signedUrl) {
      console.error("[lawyer/expenses receipt GET] sign failed:", signError?.message);
      return NextResponse.json({ error: "تعذّر فتح الإيصال." }, { status: 500 });
    }
    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[lawyer/expenses receipt GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر فتح الإيصال." }, { status: 500 });
  }
}
