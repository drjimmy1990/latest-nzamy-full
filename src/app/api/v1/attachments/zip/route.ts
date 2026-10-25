import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { assertRole } from "@/lib/auth/assertRole";
import { mayDownloadRequestFiles } from "@/lib/requestFileAccess";
import { checkZipCaps, isZipScope, type ZipScope } from "@/lib/attachmentsZipShared";
import {
  archiveFileName,
  buildZipStream,
  visibleContractFiles,
  visibleRequestFiles,
  zipContentDisposition,
  ZIP_RESPONSE_HEADERS,
  type ZipSourceFile,
} from "@/lib/attachmentsZip";

/**
 * GET /api/v1/attachments/zip?scope=<scope>&id=<id> — «تحميل الكل (ZIP)»
 * (owner answer ٢٥٦, plan D3). ONE route for every surface, the scope saying
 * which: case · request · consultation (a service_requests id) · contract
 * (lawyer / firm side) · client_contract (the client's own share). See
 * src/lib/attachmentsZipShared.ts for the scope table.
 *
 * WHO SEES WHAT — no new rule. Each scope runs the access check of the route
 * that already serves ONE of those files, plus the list rule of the screen
 * that lists them:
 *   case / request / consultation
 *     gate  = service-requests/[id]/attachments/[attachmentId]/route.ts — the
 *             order read with the service client, then requester / assignee /
 *             admin (mayDownloadRequestFiles, now shared with that route and
 *             with deliverable/route.ts); 404 for no order, 403 otherwise.
 *     files = service-requests/[id]/route.ts's attachments list — the caller's
 *             own RLS client, `request_id = id`, `deleted_at is null` — then
 *             visibleRequestFiles() re-checks both on every row. The gate AND
 *             the list, never one alone: the list alone would let a case
 *             supervisor's «archived documents» SELECT policy (20261025_51)
 *             through if the filter were ever dropped; the gate alone would
 *             skip RLS.
 *   contract
 *     = lawyer/contracts/[id]/versions/[vid]/url/route.ts — assertRole(lawyer,
 *       firm), then the versions the caller's RLS client can read
 *       (`can_access_contract`), bound to this contract.
 *   client_contract
 *     = client/contracts/[id]/versions/[vid]/url/route.ts — assertRole(), the
 *       contract read with `client_user_id = auth.uid()`, then its versions.
 *
 * Deleted documents never go in: the soft-deleted ones by the filter above;
 * a hard-deleted contract version has no row. Bytes are read with the service
 * client, exactly as every per-file route signs with it (Storage RLS on
 * `documents` only lets a session read its own folder); this route reads and
 * never writes or removes anything, so the storage guard
 * storage_object_is_case_document (DELETE / UPDATE) is untouched.
 *
 * CAPS — at most 200 files and 500 MB of listed sizes, refused with an Arabic
 * 413 before a byte is sent; sizes the tables do not know are counted while
 * streaming and the stream errors past 500 MB. Rate-limited in src/proxy.ts
 * (isAttachmentsZipRoute, src/lib/rateLimitRoutes.ts).
 *
 * The response streams (attachmentsZip.ts buildZipStream): one file at a time,
 * stored not deflated, never the whole archive in memory.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BAD_REQUEST = { error: "طلب غير صالح" } as const;
const NO_FILES = { error: "لا توجد مرفقات لتحميلها" } as const;
// Every id this route takes is a uuid or a short reference (REQ-…); anything
// else is refused before it reaches a query.
const ID_SHAPE = /^[A-Za-z0-9_-]{1,100}$/;

type Listing = { files: ZipSourceFile[] } | { response: NextResponse };

/** case / request / consultation — see the header. */
async function listRequestFiles(requestId: string): Promise<Listing> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return { response: authUnavailableResponse() };
  if (!user) return { response: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests")
    .select("id, requester_user_id, assigned_to")
    .eq("id", requestId)
    .maybeSingle();
  if (!order) return { response: NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 }) };

  const { data: profile } = await admin
    .from("profiles").select("user_type").eq("id", user.id).single();
  if (!mayDownloadRequestFiles(order, user.id, profile?.user_type as string | undefined)) {
    return { response: NextResponse.json({ error: "غير مصرح" }, { status: 403 }) };
  }

  const { data: rows, error } = await supabase
    .from("attachments")
    .select("request_id, file_name, storage_path, size_bytes, deleted_at")
    .eq("request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[attachments/zip] attachments read failed:", error.message, error.code);
    return { response: NextResponse.json({ error: "تعذّرت قراءة المرفقات. حاول مرة أخرى." }, { status: 500 }) };
  }
  return { files: visibleRequestFiles(rows, requestId) };
}

async function readContractVersions(supabase: SupabaseClient, contractId: string): Promise<Listing> {
  const { data: rows, error } = await supabase
    .from("contract_versions")
    .select("contract_id, version_no, file_name, storage_path, size_bytes")
    .eq("contract_id", contractId)
    .order("version_no", { ascending: false });
  if (error) {
    console.error("[attachments/zip] contract_versions read failed:", error.message, error.code);
    return { response: NextResponse.json({ error: "تعذّر تحميل نسخ العقد." }, { status: 500 }) };
  }
  return { files: visibleContractFiles(rows, contractId) };
}

/** contract — the lawyer / firm side, see the header. */
async function listLawyerContractFiles(contractId: string): Promise<Listing> {
  const auth = await assertRole(["lawyer", "firm"]);
  if (!auth.ok) return { response: auth.response };
  return readContractVersions(auth.supabase, contractId);
}

/** client_contract — the client's own share, see the header. */
async function listClientContractFiles(contractId: string): Promise<Listing> {
  const auth = await assertRole();
  if (!auth.ok) return { response: auth.response };
  const { data: contract, error } = await auth.supabase
    .from("contracts")
    .select("id")
    .eq("id", contractId)
    .eq("client_user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.error("[attachments/zip] client contract lookup failed:", error.message, error.code);
  }
  if (!contract) return { response: NextResponse.json({ error: "العقد غير موجود" }, { status: 404 }) };
  return readContractVersions(auth.supabase, contractId);
}

function listFiles(scope: ZipScope, id: string): Promise<Listing> {
  switch (scope) {
    case "case":
    case "request":
    case "consultation":
      return listRequestFiles(id);
    case "contract":
      return listLawyerContractFiles(id);
    case "client_contract":
      return listClientContractFiles(id);
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scope = params.get("scope");
    const id = (params.get("id") ?? "").trim();
    if (!isZipScope(scope) || !ID_SHAPE.test(id)) {
      return NextResponse.json(BAD_REQUEST, { status: 400 });
    }

    const listing = await listFiles(scope, id);
    if ("response" in listing) return listing.response;
    const { files } = listing;

    if (files.length === 0) return NextResponse.json(NO_FILES, { status: 404 });
    const caps = checkZipCaps(files.map((f) => f.size));
    if (!caps.ok) return NextResponse.json({ error: caps.message, reason: caps.reason }, { status: 413 });

    const service = await createServiceClient();
    const stream = buildZipStream(
      files,
      async (file) => {
        const { data, error } = await service.storage.from("documents").download(file.storagePath);
        if (error || !data) {
          console.error("[attachments/zip] storage download failed:", file.storagePath, error?.message);
          return null;
        }
        return data.stream() as ReadableStream<Uint8Array>;
      },
      {
        signal: request.signal,
        onFileError: (file, err) => console.error("[attachments/zip] file read failed:", file.storagePath, err),
      },
    );

    return new Response(stream, {
      status: 200,
      headers: {
        ...ZIP_RESPONSE_HEADERS,
        "Content-Disposition": zipContentDisposition(archiveFileName(scope, id)),
      },
    });
  } catch (err) {
    console.error("[attachments/zip GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
