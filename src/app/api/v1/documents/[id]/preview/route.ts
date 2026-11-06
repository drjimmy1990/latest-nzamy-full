import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { previewAttachment } from "@/lib/attachments/previewServe";

/**
 * GET /api/v1/documents/<id>/preview — what AttachmentPreviewModal shows: a
 * five-minute link for a PDF or an image, the first 20,000 characters for a Word
 * or text file. The checks are in previewServe.ts: the session's RLS decides who
 * sees the row, and the service client is reached only after that and the folder
 * check. It has its own rate-limit bucket (proxy.ts), since a .docx is unzipped
 * here on a GET, which the general bucket does not count.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await createClient();
  const auth = await requireApiUser(session, { error: "غير مصرح — يرجى تسجيل الدخول" });
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const reply = await previewAttachment({ session, admin: await createServiceClient() }, id);
    if (reply.status === 200) return NextResponse.json(reply.body, { headers: HEADERS });
    const error = reply.status === 404 ? "الملف غير موجود" : "تعذّرت معاينة الملف الآن";
    return NextResponse.json({ error }, { status: reply.status, headers: HEADERS });
  } catch (err) {
    console.error("[documents/preview] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّرت معاينة الملف الآن" }, { status: 503, headers: HEADERS });
  }
}
