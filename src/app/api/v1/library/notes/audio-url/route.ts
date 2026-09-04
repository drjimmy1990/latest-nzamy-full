import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/library/notes/audio-url?page=<id> — a 5-minute signed link
 * for the voice memo on this caller's own note (articleNotesService's
 * `getNoteAudioUrl`). Any signed-in role.
 *
 * The row lookup goes through the RLS-scoped client — `page_id` is a
 * freely client-chosen query param, so this is what confines the read to a
 * note THIS user owns before anything is signed. Signing itself needs the
 * service client only after that check, per house rule (storage RLS on
 * `documents` does not otherwise grant the cookie-scoped client sign rights).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const pageId = request.nextUrl.searchParams.get("page");
    if (!pageId) {
      return NextResponse.json({ error: "معرّف الصفحة مطلوب" }, { status: 400 });
    }

    const { data: note, error } = await supabase
      .from("law_article_notes")
      .select("audio_path")
      .eq("user_id", user.id)
      .eq("page_id", pageId)
      .maybeSingle();

    if (error) {
      console.error("[library/notes/audio-url GET] lookup failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل التسجيل." }, { status: 500 });
    }

    const audioPath = (note as { audio_path: string | null } | null)?.audio_path ?? null;
    if (!audioPath) {
      return NextResponse.json({ url: null });
    }

    const service = await createServiceClient();
    const { data: signed, error: signError } = await service.storage
      .from("documents")
      .createSignedUrl(audioPath, 300);

    if (signError || !signed?.signedUrl) {
      console.error("[library/notes/audio-url GET] signing failed:", signError?.message);
      return NextResponse.json({ url: null });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[library/notes/audio-url GET] Unexpected error:", err);
    return NextResponse.json({ url: null });
  }
}
