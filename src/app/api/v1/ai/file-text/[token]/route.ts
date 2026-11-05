import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { serveFileText } from "@/lib/ai/fileTextServe";

/**
 * GET /api/v1/ai/file-text/<token> — n8n downloads a .docx, .txt, .md or pasted
 * text here as text/plain. It needs no session: the token is the credential,
 * like a storage signed URL, and it names one file or run, one owner and an
 * expiry (fileTextToken.ts). The checks are in fileTextServe.ts; this route
 * only maps the reply. GET only and unthrottled, as /api/v1/ai/* is outside
 * PROTECTED_API_PREFIXES and the general bucket covers mutating methods.
 *
 * Nothing is reached unless NZAMY_AI_TEXT_FILES is on: only then do the runs
 * route's file checks and paste step sign a link.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const secret = process.env.NZAMY_AI_KEY;
  // Checked before the service client is built, so a server that is not
  // configured answers the same way whatever else is missing.
  if (!secret) return new NextResponse("unavailable", { status: 503, headers: HEADERS });
  try {
    const { token } = await params;
    const reply = await serveFileText(await createServiceClient(), token, { secret, now: Date.now() });
    if (reply.status === 200) return new NextResponse(reply.text, { status: 200, headers: HEADERS });
    return new NextResponse(reply.status === 503 ? "unavailable" : "not found", { status: reply.status, headers: HEADERS });
  } catch (err) {
    console.error("[ai/file-text] route threw:", (err as { name?: string } | null)?.name ?? "error");
    return new NextResponse("not found", { status: 404, headers: HEADERS });
  }
}
