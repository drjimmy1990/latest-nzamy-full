import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readPublicCard } from "@/lib/branding/verifyCard";

/**
 * GET /api/v1/letterhead/verify/[token] — public, read-only (q343). What a
 * printed QR's page may show: the name, the licence number and «موثّق». Every
 * other case is the same `{"state":"home"}` (readPublicCard). The token is
 * never logged, and the service role runs one function that holds the rules
 * (letterhead_verification_card, 20261103_69).
 */

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const answer = await readPublicCard(token, async (checked) => {
    const service = await createServiceClient();
    return service.rpc("letterhead_verification_card", { p_token: checked });
  });
  return NextResponse.json(answer, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
