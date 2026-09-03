import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * /api/v1/lawyer/clients/[id]/notes — Phase 2 (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §6).
 *
 * Backed by `public.lawyer_client_notes` (migration
 * 20260903_phase2_clients_and_firm_membership.sql). A confidential note a
 * lawyer keeps on a client card — never readable by the client themselves.
 *
 * `visibility`: `private` = the author alone; `firm` = the author's active
 * firm colleagues too (through `can_access_case_row`). RLS already hides a
 * `private` note of someone else's from this account — the SELECT below asks
 * for every row it may read and lets the policy do the filtering; `mine` in
 * the DTO is computed here so the UI knows which notes it may offer to
 * delete.
 */

interface NoteRow {
  id: string;
  client_id: string;
  author_user_id: string;
  visibility: string;
  body: string;
  created_at: string;
  updated_at: string;
}

const NOTE_SELECT = "id, client_id, author_user_id, visibility, body, created_at, updated_at";

const MAX_BODY_LENGTH = 4000;
const VALID_VISIBILITY = new Set(["private", "firm"]);

function toDto(row: NoteRow, uid: string) {
  return {
    id: row.id,
    clientId: row.client_id,
    authorUserId: row.author_user_id,
    mine: row.author_user_id === uid,
    visibility: row.visibility,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/v1/lawyer/clients/[id]/notes
 * Ordered created_at desc — most recent note first, matching every other
 * note/activity feed in this product.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data, error, count } = await supabase
      .from("lawyer_client_notes")
      .select(NOTE_SELECT, { count: "exact" })
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[lawyer/clients/notes GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل ملاحظات الموكّل." }, { status: 500 });
    }

    const rows = (data ?? []) as NoteRow[];
    return NextResponse.json({ data: rows.map((row) => toDto(row, user.id)), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/clients/notes GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل ملاحظات الموكّل." }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/clients/[id]/notes
 * Body: { body, visibility }
 *
 * The RLS insert policy already refuses a note on a client card the caller
 * cannot read (`exists (... can_access_case_row ...)`), which surfaces as
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

    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/clients/notes POST] firm_members lookup failed:", membershipError.message, membershipError.code);
    }
    if (visibility === "firm" && !membership?.firm_id) {
      return NextResponse.json(
        { error: "لا يمكن مشاركة الملاحظة مع المكتب لأنك غير مرتبط بمكتب نشط." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("lawyer_client_notes")
      .insert({
        client_id: id,
        author_user_id: user.id,
        firm_id: membership?.firm_id ?? null,
        body: trimmedBody,
        visibility,
      })
      .select(NOTE_SELECT)
      .single();

    if (error || !data) {
      console.error("[lawyer/clients/notes POST] insert error:", error?.message, error?.code);
      if (error?.code === "42501") {
        return NextResponse.json(
          { error: "لا يمكنك إضافة ملاحظة على موكّل لا تملك صلاحية قراءته." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
    }

    return NextResponse.json({ data: toDto(data as NoteRow, user.id) });
  } catch (err) {
    console.error("[lawyer/clients/notes POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
  }
}
