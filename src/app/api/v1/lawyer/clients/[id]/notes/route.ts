import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { liveRowsOnly, isMissingColumnError } from "@/lib/services/archivedRows";
import { NOTE_SELECT, NOTE_SELECT_WITH_ARCHIVE, toNoteDto, type NoteRow } from "./_shared";

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

const MAX_BODY_LENGTH = 4000;
const VALID_VISIBILITY = new Set(["private", "firm"]);

/**
 * GET /api/v1/lawyer/clients/[id]/notes
 * Ordered created_at desc — most recent note first, matching every other
 * note/activity feed in this product.
 *
 * CODE-F36: live notes only (`deleted_at is null`); before migration
 * 20261030_30 there is no such column and `liveRowsOnly` retries without the
 * filter (nothing can be archived there yet).
 * `?archived=1` lists the CALLER'S OWN archived notes on this card — the
 * «المؤرشفة» list the undo / restore works from. Before 20261030_30 it answers
 * an empty list with `archiveAvailable: false`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    if (request.nextUrl.searchParams.get("archived") === "1") {
      const archived = await supabase
        .from("lawyer_client_notes")
        .select(NOTE_SELECT_WITH_ARCHIVE, { count: "exact" })
        .eq("client_id", id)
        .eq("author_user_id", user.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (isMissingColumnError(archived.error, "deleted_at")) {
        return NextResponse.json({ data: [], total: 0, archiveAvailable: false });
      }
      if (archived.error) {
        console.error("[lawyer/clients/notes GET archived] query failed:", archived.error.message, archived.error.code);
        return NextResponse.json({ error: "تعذّر تحميل الملاحظات المؤرشفة." }, { status: 500 });
      }
      const rows = (archived.data ?? []) as NoteRow[];
      return NextResponse.json({ data: rows.map((row) => toNoteDto(row, user.id)), total: archived.count ?? rows.length, archiveAvailable: true });
    }

    const { data, error, count } = await liveRowsOnly((excludeArchived) => {
      let query = supabase
        .from("lawyer_client_notes")
        .select(NOTE_SELECT, { count: "exact" })
        .eq("client_id", id);
      if (excludeArchived) query = query.is("deleted_at", null);
      return query.order("created_at", { ascending: false });
    });

    if (error) {
      console.error("[lawyer/clients/notes GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل ملاحظات الموكّل." }, { status: 500 });
    }

    const rows = (data ?? []) as NoteRow[];
    return NextResponse.json({ data: rows.map((row) => toNoteDto(row, user.id)), total: count ?? rows.length });
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

    // A «للمكتب» note carries the CARD's own firm when the card has one — the
    // same rule case notes follow (`_resolveFirmVisibility.ts`), and since
    // 20261017_41 the RLS rule `client_note_scope_ok` too. An unordered
    // `.limit(1)` membership pick could file a firm-A card's note under firm B.
    // A private note carries no firm at all (it used to be stamped anyway).
    let firmId: string | null = null;
    if (visibility === "firm") {
      const { data: cardRow, error: cardError } = await supabase
        .from("lawyer_clients")
        .select("firm_id")
        .eq("id", id)
        .maybeSingle();
      if (cardError || !cardRow) {
        if (cardError) {
          console.error("[lawyer/clients/notes POST] lawyer_clients lookup failed:", cardError.message, cardError.code);
        }
        return NextResponse.json(
          { error: "لا يمكن مشاركة الملاحظة مع المكتب — تعذّر التحقق من بطاقة الموكّل." },
          { status: 400 },
        );
      }
      const cardFirmId = (cardRow as { firm_id: string | null }).firm_id;
      let membershipQuery = supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (cardFirmId) membershipQuery = membershipQuery.eq("firm_id", cardFirmId);
      const { data: membership, error: membershipError } = await membershipQuery.limit(1).maybeSingle();
      if (membershipError) {
        console.error("[lawyer/clients/notes POST] firm_members lookup failed:", membershipError.message, membershipError.code);
      }
      if (!membership?.firm_id) {
        return NextResponse.json(
          {
            error: cardFirmId
              ? "لا يمكن مشاركة الملاحظة مع المكتب لأنك لست عضوًا نشطًا في مكتب هذا الموكّل."
              : "لا يمكن مشاركة الملاحظة مع المكتب لأنك غير مرتبط بمكتب نشط.",
          },
          { status: 400 },
        );
      }
      firmId = membership.firm_id as string;
    }

    const { data, error } = await supabase
      .from("lawyer_client_notes")
      .insert({
        client_id: id,
        author_user_id: user.id,
        firm_id: firmId,
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

    return NextResponse.json({ data: toNoteDto(data as NoteRow, user.id) });
  } catch (err) {
    console.error("[lawyer/clients/notes POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
  }
}
