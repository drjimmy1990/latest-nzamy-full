import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateArticleNoteInput, mergeArticleNoteFields, type ArticleNoteFields } from "@/lib/services/articleNoteInput";
import { ARTICLE_NOTE_SELECT, articleNoteDbErrorResponse, toArticleNoteDto, type ArticleNoteRow } from "./_shared";

/**
 * /api/v1/library/notes — sticky notes, voice-memo pointers and highlight
 * strokes on a law article page, out of the browser (Phase 6, item 151).
 * Contract: src/lib/services/articleNotesService.ts. Any signed-in role.
 *
 *   GET    ?              — all of mine, newest-updated first: { data, total }
 *   GET    ?page=<id>     — one page's note: { data: note | null }
 *   PUT                   — PATCH-by-upsert on (user_id, page_id): { data: note }.
 *                           A field the body omits keeps its stored value —
 *                           see articleNoteInput.ts's mergeArticleNoteFields.
 *   DELETE ?page=<id>     — 204 always (idempotent — a missing note is not an error)
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const pageId = request.nextUrl.searchParams.get("page");

    if (pageId !== null) {
      const { data, error } = await supabase
        .from("law_article_notes")
        .select(ARTICLE_NOTE_SELECT)
        .eq("user_id", user.id)
        .eq("page_id", pageId)
        .maybeSingle();

      if (error) {
        console.error("[library/notes GET] single lookup failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّر تحميل الملاحظة." }, { status: 500 });
      }

      return NextResponse.json({ data: data ? toArticleNoteDto(data as ArticleNoteRow) : null });
    }

    const { data, error, count } = await supabase
      .from("law_article_notes")
      .select(ARTICLE_NOTE_SELECT, { count: "exact" })
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[library/notes GET] list failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الملاحظات." }, { status: 500 });
    }

    const rows = (data ?? []) as ArticleNoteRow[];
    return NextResponse.json({ data: rows.map(toArticleNoteDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[library/notes GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const validated = validateArticleNoteInput(body, user.id);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const patch = validated.value;

    // Read this caller's own existing note (RLS-scoped, redundantly
    // .eq("user_id", ...) too) so a field the patch omits can keep its
    // stored value instead of resetting to the column default — see
    // mergeArticleNoteFields. null when this pageId has no note yet.
    const { data: existingRow, error: readError } = await supabase
      .from("law_article_notes")
      .select("note_text, audio_path, strokes, position, is_visible")
      .eq("user_id", user.id)
      .eq("page_id", patch.pageId)
      .maybeSingle();

    if (readError) {
      console.error("[library/notes PUT] existing-note lookup failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الملاحظة الحالية." }, { status: 500 });
    }

    const existing: ArticleNoteFields | null = existingRow
      ? {
          noteText: existingRow.note_text,
          audioPath: existingRow.audio_path,
          strokes: Array.isArray(existingRow.strokes) ? existingRow.strokes : [],
          position: existingRow.position as { x: number; y: number } | null,
          isVisible: existingRow.is_visible,
        }
      : null;

    const merged = mergeArticleNoteFields(existing, patch);

    const { data, error } = await supabase
      .from("law_article_notes")
      .upsert(
        {
          user_id: user.id,
          page_id: patch.pageId,
          note_text: merged.noteText,
          audio_path: merged.audioPath,
          strokes: merged.strokes,
          position: merged.position,
          is_visible: merged.isVisible,
        },
        { onConflict: "user_id,page_id" },
      )
      .select(ARTICLE_NOTE_SELECT)
      .single();

    if (error) {
      const { status, message } = articleNoteDbErrorResponse(error);
      console.error("[library/notes PUT] upsert failed:", error.message, error.code);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toArticleNoteDto(data as ArticleNoteRow) });
  } catch (err) {
    console.error("[library/notes PUT] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const pageId = request.nextUrl.searchParams.get("page");
    if (!pageId) {
      return NextResponse.json({ error: "معرّف الصفحة مطلوب" }, { status: 400 });
    }

    // Idempotent: deleting a note that is already gone (double-click, a
    // guest note that only ever lived in the browser, a stale retry) is a
    // no-op, not an error — deleteArticleNote()'s Promise<void> has no catch,
    // so a 404 here would throw into the screen for no reason.
    const { error } = await supabase
      .from("law_article_notes")
      .delete()
      .eq("user_id", user.id)
      .eq("page_id", pageId);

    if (error) {
      console.error("[library/notes DELETE] delete failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[library/notes DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
