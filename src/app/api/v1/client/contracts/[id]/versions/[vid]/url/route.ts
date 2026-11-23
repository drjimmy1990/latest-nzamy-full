import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { fileFolderOwner, isPathInOwnerFolder } from "@/lib/storagePathOwnership";
import { openableLink } from "@/lib/attachments/inlineSafety";
import { clientContractVersions } from "../../../../_clientRead";

/**
 * GET /api/v1/client/contracts/[id]/versions/[vid]/url — a 5-minute signed
 * download link for one file version of a contract shared with this client
 * (contractsService.ts's `getClientContractVersionUrl`).
 *
 * The version is bound to a NON-DRAFT contract this client account owns
 * (`client_user_id = auth.uid()`, owner file 15 #4) BEFORE anything is signed:
 * public.client_contract_versions() (20261129_20 — the client no longer reads
 * the contract tables through RLS), or its whitelisted fallback while the
 * function is missing (_clientRead.ts) — the same "belongs to this named
 * parent, not just independently readable" pattern as
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

    const files = await clientContractVersions(supabase, user.id, id);
    if (!files.ok) {
      return NextResponse.json({ url: null });
    }
    if (files.data.length === 0) {
      // not his contract, a draft, or a contract without files: one answer
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const version = files.data.find((v) => v.id === vid) ?? null;
    // Bound to THIS contract, not merely readable in isolation — vid is a
    // freely client-chosen URL param, so a mismatch (tampering, or a stale
    // link after the version moved) gets the identical 404 rather than
    // leaking which half failed.
    if (!version || version.contract_id !== id) {
      console.error(`[client/contracts/versions/url GET] version/contract mismatch: contract=${id} version=${vid}`);
      return NextResponse.json({ error: "النسخة غير موجودة" }, { status: 404 });
    }
    // The file must sit in its uploader's own folder: signing uses the service
    // role, and before 20261026_65 a version row could point at anybody's file
    // (security review 2026-10-26, finding 1). Same 404.
    if (!isPathInOwnerFolder(version.storage_path, fileFolderOwner(version.folder_owner_id, version.uploaded_by))) {
      console.error(`[client/contracts/versions/url GET] storage_path outside the uploader's folder: contract=${id} version=${vid}`);
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
    // Inline only for a PDF or an image the stored object really is; anything
    // else is handed over as a download (inlineSafety.ts, batch l13 vault).
    const url = await openableLink(signed.signedUrl, () =>
      service.storage.from("documents").createSignedUrl(version.storage_path as string, 300, { download: true }));
    if (!url) {
      console.error("[client/contracts/versions/url GET] signing (download) failed");
      return NextResponse.json({ url: null });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[client/contracts/versions/url GET] Unexpected error:", err);
    return NextResponse.json({ url: null });
  }
}
