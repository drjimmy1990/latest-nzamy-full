import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/documents — List user's documents
 * Auth required.
 *
 * FAILURE IS A 500, NOT AN EMPTY VAULT. This route's empty-200 was the single
 * most-cited instance of the defect in this codebase: three other modules had
 * already been written AROUND it, each explaining that a zero from here is
 * ambiguous and refusing to render a number because of it —
 * src/lib/services/businessOverview.ts:20 and :248-250, and
 * src/app/dashboard/business/page.tsx:480. Those comments are now out of date
 * (see the followUps); the ambiguity they describe is what this change removes.
 *
 * A 500, not a `degraded: true` 200: `documentService.getDocuments`
 * (src/lib/services/documentService.ts:314) reaches this through `apiGet`,
 * which already throws on any non-2xx — so a real status is what its callers
 * are built to receive, and no caller reads a marker inside the body.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[documents GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر تحميل مستنداتك." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[documents GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل مستنداتك." }, { status: 500 });
  }
}

/**
 * Uploads are always written to `${user.id}/${Date.now()}-${safeName}`
 * (documentService.ts uploadDocumentFile — the only writer of this route,
 * confirmed by grepping every call site of both `uploadDocumentFile` and
 * `POST /api/v1/documents`). Accept only a storage_path that matches that
 * exact two-segment shape with the caller's own id as the first segment,
 * and reject any `..` path segment outright rather than trusting the prefix
 * check alone — a value like `"<uid>/../<victim>/file"` would satisfy a
 * naive `startsWith` check and normalise to the victim's prefix once
 * Storage resolves it.
 *
 * The `..` check compares whole segments (`segment === ".."`), not a raw
 * substring scan, because `safeName` in uploadDocumentFile lets `.` through
 * unchanged — a legitimate filename like "report..final.pdf" would
 * false-positive on `path.includes("..")` without ever being a traversal
 * attempt.
 *
 * `segments.length === 2` is a whitelist matching the writer's exact
 * template, not a blacklist of bad shapes — tighten this (or drop it) if a
 * second legitimate writer with a different shape ever appears.
 */
function isOwnedStoragePath(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  const segments = path.split("/");
  if (segments.length !== 2) return false;
  if (segments.some((seg) => seg === "." || seg === "..")) return false;
  return segments[0] === userId;
}

// Both the storage_path and request_id ownership checks below return this
// exact body. Do not give them distinct messages: a caller probing which
// field tripped the rejection should not be able to tell from the response.
// The specific reason is still visible server-side via the console.error
// calls immediately before each return.
const OWNERSHIP_REJECTED = { error: "غير مصرح" } as const;

/**
 * POST /api/v1/documents — Upload a document record
 * Auth required.
 * Body: { file_name?, label?, storage_path, size_bytes, mime_type, request_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const fileName = body.file_name ?? body.label;
    if (!fileName || !body.storage_path) {
      return NextResponse.json(
        { error: "file_name (or label) and storage_path are required" },
        { status: 400 },
      );
    }

    // The insert policy (attachments_insert_policy) only checks
    // owner_user_id = auth.uid() — it never looks at storage_path or
    // request_id. Without this check, a caller could register a row that
    // claims their own honest request_id while pointing storage_path at
    // another tenant's stored object. Reject before insert; log the specific
    // reason server-side but keep the caller-facing message generic (see
    // OWNERSHIP_REJECTED) so a probing caller can't tell which check tripped.
    const storagePath: string = body.storage_path;
    if (!isOwnedStoragePath(storagePath, user.id)) {
      console.error(
        `[documents POST] rejected storage_path not owned by caller: user=${user.id} storage_path=${JSON.stringify(body.storage_path)}`,
      );
      return NextResponse.json(OWNERSHIP_REJECTED, { status: 403 });
    }

    // request_id is nullable by design (general document uploads use it) —
    // a null value stays legal. When supplied, the caller must be a
    // participant (requester or assignee) of that order; otherwise a caller
    // could attach a victim's object under an order they don't belong to at
    // all, or simply mislabel an unrelated order id.
    const requestId: string | null = body.request_id ?? null;
    if (requestId !== null) {
      const { data: order, error: orderError } = await supabase
        .from("service_requests")
        .select("id, requester_user_id, assigned_to")
        .eq("id", requestId)
        .maybeSingle();

      const belongsToCaller =
        !orderError &&
        !!order &&
        (order.requester_user_id === user.id || order.assigned_to === user.id);

      if (!belongsToCaller) {
        console.error(
          `[documents POST] rejected request_id not owned by caller: user=${user.id} request_id=${requestId} orderError=${orderError?.message ?? "none"}`,
        );
        return NextResponse.json(OWNERSHIP_REJECTED, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from("attachments")
      .insert({
        owner_user_id: user.id,
        file_name: body.file_name ?? body.label ?? "Untitled Document",
        storage_path: storagePath,
        mime_type: body.mime_type ?? "application/octet-stream",
        size_bytes: body.size_bytes ?? 0,
        request_id: requestId,
      })
      .select()
      .single();

    if (error) {
      console.error("[documents POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message, code: error.code, hint: error.hint }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[documents POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
