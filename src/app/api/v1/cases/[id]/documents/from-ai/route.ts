import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { createServiceClient } from "@/lib/supabase/server";
import { aiDocumentFile, parseAiDocumentBody } from "./_fromAi";

/**
 * POST /api/v1/cases/[id]/documents/from-ai — N01-21/22 «حفظ في مستندات القضية».
 * Body: `{ text, title?, runId? }` → 201 `{ data: { id, fileName } }`.
 *
 * Saves one AI tool result as a document of the case (an `attachments` row
 * with `source = 'generated'`, the same table and bucket the case's
 * «المستندات» tab lists), and, when the result came from a stored run, links
 * the run to the case (`ai_runs.case_request_id`, migration 20261125_40).
 *
 * ── WHO MAY SAVE TO WHICH CASE ─────────────────────────────────────────────
 *   1. The case is read through the caller's RLS client — the participant
 *      arms, the firm arm and the restricted-case rule (20261125_40) decide,
 *      so a case the caller cannot open is a 404 here too.
 *   2. Reading is not enough to file a document: the caller must be its filer
 *      or its lead (the rule POST /api/v1/documents and the attachments insert
 *      policy apply) or a member of its case team (public.is_case_team_member,
 *      20261017_41) — a colleague who merely reads a firm case does not add
 *      files to it.
 *
 * ── THE WRITE ───────────────────────────────────────────────────────────────
 * The bytes go to the caller's own folder of the `documents` bucket with the
 * caller's own client — `${uid}/${Date.now()}-${name}`, the two-segment shape
 * every document route (delete, copy, zip, preview) keys on. The row is
 * inserted with the service role, after the checks above, because the
 * attachments insert policy only knows the filer/lead and would refuse a case
 * team member; owner_user_id is always the caller. The run link is written
 * with the service role too (authenticated cannot UPDATE ai_runs) and only for
 * a run whose user_id is the caller.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const parsed = parseAiDocumentBody(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests")
      .select("id, requester_user_id, assigned_to, firm_id")
      .eq("id", id)
      .maybeSingle();
    if (caseError) {
      console.error("[cases/documents/from-ai] case read failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر قراءة القضية." }, { status: 500 });
    }
    if (!caseRow) {
      return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية قراءتها." }, { status: 404 });
    }
    const row = caseRow as { requester_user_id: string | null; assigned_to: string | null; firm_id: string | null };
    let mayFile = row.requester_user_id === user.id || row.assigned_to === user.id;
    if (!mayFile && row.firm_id) {
      const team = await supabase.rpc("is_case_team_member", { p_request: id });
      if (team.error) console.error("[cases/documents/from-ai] team check failed:", team.error.message, team.error.code);
      mayFile = team.data === true;
    }
    if (!mayFile) {
      return NextResponse.json(
        { error: "يحفظ في مستندات القضية المحامي المسؤول عنها ومنشئها وفريقها فقط." },
        { status: 403 },
      );
    }

    const file = aiDocumentFile(parsed.value.text, parsed.value.title);
    const storagePath = `${user.id}/${Date.now()}-${file.storageName}`;
    const bytes = new TextEncoder().encode(file.content);

    const upload = await supabase.storage.from("documents").upload(storagePath, bytes, {
      contentType: file.mimeType,
      upsert: false,
    });
    if (upload.error) {
      console.error("[cases/documents/from-ai] upload failed:", upload.error.message);
      return NextResponse.json({ error: "تعذّر حفظ الملف." }, { status: 500 });
    }

    const service = await createServiceClient();
    const { data: doc, error: insertError } = await service
      .from("attachments")
      .insert({
        owner_user_id: user.id,
        file_name: file.fileName,
        storage_path: storagePath,
        mime_type: file.mimeType,
        size_bytes: bytes.byteLength,
        request_id: id,
        source: "generated",
      })
      .select("id")
      .single();
    if (insertError || !doc) {
      console.error("[cases/documents/from-ai] insert failed:", insertError?.message, insertError?.code);
      await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: "تعذّر حفظ المستند في القضية." }, { status: 500 });
    }

    if (parsed.value.runId) {
      const link = await service
        .from("ai_runs")
        .update({ case_request_id: id })
        .eq("id", parsed.value.runId)
        .eq("user_id", user.id);
      // Best effort: the document is saved either way; 42703 = 20261125_40 not applied.
      if (link.error) console.error("[cases/documents/from-ai] run link failed:", link.error.message, link.error.code);
    }

    return NextResponse.json(
      { data: { id: String((doc as { id: number | string }).id), fileName: file.fileName } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[cases/documents/from-ai] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ المستند في القضية." }, { status: 500 });
  }
}
