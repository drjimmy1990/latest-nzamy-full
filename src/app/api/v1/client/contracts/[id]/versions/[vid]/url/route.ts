import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/client/contracts/[id]/versions/[vid]/url — a 5-minute signed
 * download link for one file version of a contract shared with this client
 * (contractsService.ts's `getClientContractVersionUrl`).
 *
 * Two RLS-scoped reads bind the version to a contract this client account
 * owns (`client_user_id = auth.uid()`) BEFORE anything is signed — the same
 * "belongs to this named parent, not just independently readable" pattern as
 * service-requests/[id]/attachments/[attachmentId]/route.ts. Signing itself
 * goes through the SERVICE client only after that check, per house rules
 * (storage.createSignedUrl needs a role Storage RLS on `documents` does not
 * otherwise grant this route's cookie-scoped client).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; vid: string }> },
) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id, vid } = await context.params;

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id")
      .eq("id", id)
      .eq("client_user_id", user.id)
      .maybeSingle();
    if (contractError) {
      console.error("[client/contracts/versions/url GET] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { data: version, error: versionError } = await supabase
      .from("contract_versions")
      .select("id, contract_id, storage_path")
      .eq("id", vid)
      .maybeSingle();
    if (versionError) {
      console.error("[client/contracts/versions/url GET] version lookup failed:", versionError.message, versionError.code);
    }
    // Bound to THIS contract, not merely readable in isolation — vid is a
    // freely client-chosen URL param, so a mismatch (tampering, or a stale
    // link after the version moved) gets the identical 404 rather than
    // leaking which half failed.
    if (!version || version.contract_id !== id) {
      console.error(`[client/contracts/versions/url GET] version/contract mismatch: contract=${id} version=${vid}`);
      return NextResponse.json({ error: "النسخة غير موجودة" }, { status: 404 });
    }

    const service = await createServiceClient();
    const { data: signed, error: signError } = await service.storage
      .from("documents")
      .createSignedUrl(version.storage_path as string, 300);

    if (signError || !signed?.signedUrl) {
      console.error("[client/contracts/versions/url GET] signing failed:", signError?.message);
      return NextResponse.json({ url: null });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[client/contracts/versions/url GET] Unexpected error:", err);
    return NextResponse.json({ url: null });
  }
}
