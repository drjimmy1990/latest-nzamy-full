import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { createServiceClient } from "@/lib/supabase/server";
import { ARCHIVE_UNAVAILABLE_AR, isMissingColumnError, isMissingFunctionError } from "@/lib/services/archivedRows";
import {
  archivedNameIds,
  toArchivedDocumentDto,
  toArchivedNoteDto,
  type ArchivedDocumentRow,
  type ArchivedNoteRow,
  type ArchivedView,
} from "@/lib/services/archivedView";

/**
 * /api/v1/cases/[id]/archived — «المحذوفات» of one case file (N3.9, owner
 * directive ٥, migration 20261025_51).
 *
 * GET  — the case's archived notes and documents the CALLER may restore. Read
 *        with the caller's own client: RLS decides (the writer sees his own;
 *        the firm owner / case lead see what others archived, never a private
 *        note). `available: false` before 20261025_51 runs.
 * POST — { kind: "note" | "document", id } → public.restore_case_note /
 *        public.restore_case_document. The row is first read through RLS
 *        under THIS case, so an id from another case answers 404.
 *
 * Display names are looked up with the service role, as the notes route does —
 * it labels rows RLS already returned and never widens which rows those are.
 */

const NOTE_SELECT = "id, author_user_id, visibility, body, created_at, deleted_at, deleted_by";
const DOC_SELECT = "id, file_name, owner_user_id, created_at, deleted_at, deleted_by";

async function displayNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name").in("id", ids);
    if (error) {
      console.error("[cases/archived] name lookup failed:", error.message, error.code);
      return names;
    }
    for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name?.trim()) names.set(p.id, p.display_name);
    }
  } catch (err) {
    console.error("[cases/archived] name lookup threw:", err);
  }
  return names;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!id || id.length > 200) return NextResponse.json({ error: "معرّف القضية غير صالح." }, { status: 400 });

    const [notesRes, docsRes] = await Promise.all([
      supabase.from("case_notes").select(NOTE_SELECT).eq("request_id", id)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200),
      supabase.from("attachments").select(DOC_SELECT).eq("request_id", id)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200),
    ]);

    if (isMissingColumnError(notesRes.error, "deleted_at")) {
      const empty: ArchivedView = { available: false, notes: [], documents: [] };
      return NextResponse.json({ data: empty });
    }
    if (notesRes.error || docsRes.error) {
      const e = notesRes.error ?? docsRes.error;
      console.error("[cases/archived GET] read failed:", e?.message, e?.code);
      return NextResponse.json({ error: "تعذّر قراءة المحذوفات." }, { status: 500 });
    }

    const notes = (notesRes.data ?? []) as ArchivedNoteRow[];
    const docs = (docsRes.data ?? []) as ArchivedDocumentRow[];
    const names = await displayNames(archivedNameIds(notes, docs));
    const view: ArchivedView = {
      available: true,
      notes: notes.map((n) => toArchivedNoteDto(n, user.id, names)),
      documents: docs.map((d) => toArchivedDocumentDto(d, names)),
    };
    return NextResponse.json({ data: view });
  } catch (err) {
    console.error("[cases/archived GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر قراءة المحذوفات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    let body: { kind?: unknown; id?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
    }
    const kind = body.kind;
    const recordId = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
    if ((kind !== "note" && kind !== "document") || !recordId) {
      return NextResponse.json({ error: "حدّد ما تريد استرجاعه." }, { status: 400 });
    }
    if (kind === "document" && !/^\d+$/.test(recordId)) {
      return NextResponse.json({ error: "معرّف المستند غير صالح." }, { status: 400 });
    }

    const table = kind === "note" ? "case_notes" : "attachments";
    const { data: row, error: readError } = await supabase
      .from(table)
      .select("id")
      .eq("id", recordId)
      .eq("request_id", id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (readError) {
      if (isMissingColumnError(readError, "deleted_at")) {
        return NextResponse.json({ error: ARCHIVE_UNAVAILABLE_AR }, { status: 503 });
      }
      console.error("[cases/archived POST] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر الاسترجاع." }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "العنصر غير موجود في المحذوفات." }, { status: 404 });

    const { data: restored, error } = kind === "note"
      ? await supabase.rpc("restore_case_note", { p_note: recordId })
      : await supabase.rpc("restore_case_document", { p_id: Number(recordId) });
    if (error) {
      if (isMissingFunctionError(error)) {
        return NextResponse.json({ error: ARCHIVE_UNAVAILABLE_AR }, { status: 503 });
      }
      console.error("[cases/archived POST] restore failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر الاسترجاع." }, { status: 500 });
    }
    if (restored !== true) {
      return NextResponse.json({ error: "لا تملك صلاحية استرجاع هذا العنصر." }, { status: 403 });
    }
    return NextResponse.json({ restored: true });
  } catch (err) {
    console.error("[cases/archived POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر الاسترجاع." }, { status: 500 });
  }
}
