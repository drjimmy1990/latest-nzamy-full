import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readVaultForPrint, resolveBrandingCaller } from "@/lib/branding/brandingServer";
import { exportFileAnswer, parseExportKind } from "@/lib/docx/exportFile";

/**
 * GET /api/v1/branding/export-file?scope=lawyer|firm&kind=logo|letterhead_docx
 * (q345): the bytes the browser needs to build a .docx, through the app's own
 * origin, so there is no CORS on the storage host and no tainted canvas.
 *
 * The same gate as printing: `letterhead.print`, then the session read of the
 * vault. The service role only downloads a path that read vouched for. Always
 * an attachment, never sniffed, never cached. Reads no document text and writes
 * nothing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const caller = await resolveBrandingCaller(request.nextUrl.searchParams.get("scope"), "letterhead.print");
  if (!caller.ok) return caller.response;
  const { supabase, owner } = caller;

  const kind = parseExportKind(request.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "نوع الملف غير صالح" }, { status: 400, headers: NO_STORE });

  const answer = await exportFileAnswer(owner, kind, {
    read: () => readVaultForPrint(supabase, owner),
    download: async (bucket, path) => {
      const service = await createServiceClient();
      const { data, error } = await service.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
  });
  if (answer.status !== 200) {
    return NextResponse.json({ error: answer.error }, { status: answer.status, headers: NO_STORE });
  }

  return new NextResponse(new Blob([answer.bytes as BlobPart], { type: answer.contentType }), {
    status: 200,
    headers: {
      "Content-Type": answer.contentType,
      "Content-Disposition": `attachment; filename="${answer.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
