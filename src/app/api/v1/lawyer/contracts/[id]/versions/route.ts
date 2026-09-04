import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { isVersionLabel } from "@/lib/services/contractVocabulary";
import { VERSION_SELECT, dbErrorResponse, toVersionDto, profileNames, type VersionRow } from "../../_shared";

/**
 * /api/v1/lawyer/contracts/[id]/versions — Phase 3 (مدير العقود). File
 * bytes go straight from the browser to the `documents` bucket under the
 * uploader's own folder (contractsService.uploadContractVersionFile); this
 * route only registers a row for a file already there — RLS, version
 * numbering and the audit trail stay on the server. See ../../route.ts.
 */

/**
 * GET /api/v1/lawyer/contracts/[id]/versions — Response: { data, total },
 * ordered version_no desc.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data, error, count } = await supabase
      .from("contract_versions")
      .select(VERSION_SELECT, { count: "exact" })
      .eq("contract_id", id)
      .order("version_no", { ascending: false });

    if (error) {
      console.error("[lawyer/contracts versions GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل نسخ العقد." }, { status: 500 });
    }

    const rows = (data ?? []) as VersionRow[];
    const names = await profileNames(rows.map((r) => r.uploaded_by));
    const dtos = rows.map((r) => toVersionDto(r, r.uploaded_by ? names.get(r.uploaded_by) ?? null : null));

    return NextResponse.json({ data: dtos, total: count ?? dtos.length });
  } catch (err) {
    console.error("[lawyer/contracts versions GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

interface VersionBody {
  fileName?: string;
  storagePath?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  label?: string;
  notes?: string;
  makeCurrent?: boolean;
}

/**
 * POST /api/v1/lawyer/contracts/[id]/versions — Response: 201 { data: ContractVersion }.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json()) as VersionBody;

    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    if (!fileName) return NextResponse.json({ error: "اسم الملف مطلوب." }, { status: 400 });

    const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
    if (!storagePath) return NextResponse.json({ error: "مسار الملف مطلوب." }, { status: 400 });
    // The uploader's own folder — same guard as every other signed-upload
    // registration route in this product (attachments, deliverables, …).
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "مسار الملف غير صالح" }, { status: 400 });
    }

    const label = body.label !== undefined ? body.label : "draft";
    if (!isVersionLabel(label)) {
      return NextResponse.json({ error: "تصنيف النسخة غير صالح." }, { status: 400 });
    }

    let sizeBytes: number | null = null;
    if (body.sizeBytes !== undefined && body.sizeBytes !== null) {
      if (typeof body.sizeBytes !== "number" || !Number.isFinite(body.sizeBytes) || body.sizeBytes < 0) {
        return NextResponse.json({ error: "حجم الملف غير صالح." }, { status: 400 });
      }
      sizeBytes = body.sizeBytes;
    }

    const mimeType = typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const makeCurrent = body.makeCurrent !== false;

    const nextVersionNo = async (): Promise<number> => {
      const { data: maxRow, error: maxErr } = await supabase
        .from("contract_versions")
        .select("version_no")
        .eq("contract_id", id)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) console.error("[lawyer/contracts versions POST] max lookup failed:", maxErr.message, maxErr.code);
      return (maxRow?.version_no ?? 0) + 1;
    };

    const insertRow = (versionNo: number) =>
      supabase
        .from("contract_versions")
        .insert({
          contract_id: id,
          version_no: versionNo,
          label,
          file_name: fileName,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          uploaded_by: user.id,
          notes,
        })
        .select(VERSION_SELECT)
        .single();

    let versionNo = await nextVersionNo();
    let result = await insertRow(versionNo);

    // A concurrent upload took this version number — retry once with a
    // freshly-read max.
    if (result.error?.code === "23505") {
      versionNo = await nextVersionNo();
      result = await insertRow(versionNo);
    }

    if (result.error || !result.data) {
      console.error("[lawyer/contracts versions POST] insert failed:", result.error?.message, result.error?.code);
      const { status: httpStatus, message } = dbErrorResponse(result.error, "النسخة");
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    const row = result.data as VersionRow;

    if (makeCurrent) {
      const { error: curErr } = await supabase.from("contracts").update({ current_version_id: row.id }).eq("id", id);
      if (curErr) console.error("[lawyer/contracts versions POST] set current_version_id failed:", curErr.message, curErr.code);
    }

    const names = await profileNames([row.uploaded_by]);
    return NextResponse.json(
      { data: toVersionDto(row, row.uploaded_by ? names.get(row.uploaded_by) ?? null : null) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[lawyer/contracts versions POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
