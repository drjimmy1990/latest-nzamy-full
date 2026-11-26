import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";

/**
 * GET /api/v1/admin/documents/hold-requests — the latest «طلب رفع الحجز» rows
 * (owner decision س٢٠٣, table public.attachment_hold_lift_requests of
 * 20261206_11), newest first, with the file's name and whether it is still on
 * hold, so an admin can act through PATCH /api/v1/admin/documents/[id]/hold.
 * orders.manage. Before the migration runs: { installed: false, data: [] }.
 */
export async function GET() {
  const gate = await requireStaff("orders.manage");
  if (!gate.ok) return gate.response;

  try {
    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("attachment_hold_lift_requests")
      .select("id, attachment_id, request_id, file_owner, requested_by, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return NextResponse.json({ installed: false, data: [] });
      }
      console.error("[admin/documents/hold-requests] read failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل الطلبات." }, { status: 500 });
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const fileIds = [...new Set(rows.map((r) => r.attachment_id).filter((v) => v != null).map(String))];
    const people = [...new Set(rows.flatMap((r) => [r.file_owner, r.requested_by]).filter((v): v is string => typeof v === "string"))];
    const [files, profs] = await Promise.all([
      fileIds.length
        ? admin.from("attachments").select("id, file_name, legal_hold").in("id", fileIds)
        : Promise.resolve({ data: [] }),
      people.length
        ? admin.from("profiles").select("id, display_name").in("id", people)
        : Promise.resolve({ data: [] }),
    ]);
    const fileMap = new Map(((files.data ?? []) as Array<Record<string, unknown>>).map((f) => [String(f.id), f]));
    const nameMap = new Map(((profs.data ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), String(p.display_name ?? "")]));

    return NextResponse.json({
      installed: true,
      data: rows.map((r) => {
        const f = fileMap.get(String(r.attachment_id));
        return {
          id: r.id,
          attachmentId: r.attachment_id,
          requestId: r.request_id,
          fileName: f ? String(f.file_name ?? "") : null,
          stillOnHold: f ? f.legal_hold === true : null,
          fileOwnerName: typeof r.file_owner === "string" ? nameMap.get(r.file_owner) || null : null,
          requestedByName: typeof r.requested_by === "string" ? nameMap.get(r.requested_by) || null : null,
          reason: r.reason ?? "",
          createdAt: r.created_at,
        };
      }),
    });
  } catch (err) {
    console.error("[admin/documents/hold-requests] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل الطلبات." }, { status: 500 });
  }
}
