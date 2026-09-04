import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import type { ConsultationNote } from "@/lib/services/lawyerConsultationsService";

/**
 * /api/v1/lawyer/consultations/[id]/notes — Phase 3 (DECISION 3 of
 * 20260905_phase3_consultations_and_contracts.sql).
 *
 * Mirrors /api/v1/lawyer/clients/[id]/notes exactly in shape and error
 * handling, on `public.consultation_notes` instead of `lawyer_client_notes`.
 * `visibility`: `private` = the author alone; `firm` = the author's active
 * firm colleagues too, IF the consultation itself has a `firm_id` — the
 * table carries no `firm_id` of its own (unlike lawyer_client_notes), the
 * RLS select policy resolves it through the parent consultation row.
 */

interface NoteRow {
  id: string;
  consultation_id: string;
  author_user_id: string;
  visibility: string;
  body: string;
  created_at: string;
}

const NOTE_SELECT = "id, consultation_id, author_user_id, visibility, body, created_at";
const MAX_BODY_LENGTH = 4000;
const VALID_VISIBILITY = new Set(["private", "firm"]);

/** Display names for a set of author ids, through the service client — RLS already scoped which ids reach here. */
async function authorNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name").in("id", unique);
    if (error) {
      console.error("[lawyer/consultations/notes] profile names failed:", error.message, error.code);
      return out;
    }
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) out.set(p.id, p.display_name);
    }
  } catch (err) {
    console.error("[lawyer/consultations/notes] profile names threw:", err);
  }
  return out;
}

function toDto(row: NoteRow, names: Map<string, string>): ConsultationNote {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    authorUserId: row.author_user_id,
    authorName: names.get(row.author_user_id) ?? null,
    visibility: row.visibility as ConsultationNote["visibility"],
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/v1/lawyer/consultations/[id]/notes
 * Ordered created_at desc — most recent note first, matching every other
 * note/activity feed in this product.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data, error, count } = await supabase
      .from("consultation_notes")
      .select(NOTE_SELECT, { count: "exact" })
      .eq("consultation_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[lawyer/consultations/notes GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل ملاحظات الاستشارة." }, { status: 500 });
    }

    const rows = (data ?? []) as NoteRow[];
    const names = await authorNames(rows.map((r) => r.author_user_id));
    return NextResponse.json({ data: rows.map((row) => toDto(row, names)), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/consultations/notes GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل ملاحظات الاستشارة." }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/consultations/[id]/notes
 * Body: { body, visibility }
 *
 * The RLS insert policy already refuses a note on a consultation the caller
 * cannot work on (`exists (... can_access_case_row ...)`), which surfaces as
 * Postgres 42501 — mapped here to a screen-copy 403 rather than a raw
 * permission-denied string.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const requestBody = await request.json();
    const { body, visibility } = requestBody as { body?: string; visibility?: string };

    const trimmedBody = typeof body === "string" ? body.trim() : "";
    if (!trimmedBody) {
      return NextResponse.json({ error: "نص الملاحظة مطلوب." }, { status: 400 });
    }
    if (trimmedBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `نص الملاحظة يجب ألا يتجاوز ${MAX_BODY_LENGTH} حرفًا.` }, { status: 400 });
    }
    if (!visibility || !VALID_VISIBILITY.has(visibility)) {
      return NextResponse.json({ error: "نطاق الملاحظة يجب أن يكون خاصة أو ضمن المكتب." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("consultation_notes")
      .insert({
        consultation_id: id,
        author_user_id: user.id,
        body: trimmedBody,
        visibility,
      })
      .select(NOTE_SELECT)
      .single();

    if (error || !data) {
      console.error("[lawyer/consultations/notes POST] insert error:", error?.message, error?.code);
      if (error?.code === "42501") {
        return NextResponse.json(
          { error: "لا يمكنك إضافة ملاحظة على استشارة لا تملك صلاحية العمل عليها." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
    }

    const names = await authorNames([user.id]);
    return NextResponse.json({ data: toDto(data as NoteRow, names) });
  } catch (err) {
    console.error("[lawyer/consultations/notes POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
  }
}
