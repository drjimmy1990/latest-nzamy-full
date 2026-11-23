import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { ENTRY_COLUMNS, parseEntryInput } from "@/lib/journal/journal";
import { isJournalSchemaMissing } from "@/lib/journal/journalServer";

/**
 * /api/v1/admin/journal/entries/[id] — edit, approve, return to draft, or
 * delete one entry (owner Q194/Q195, batch l13). Staff role content.delete;
 * every change audited.
 *
 * PATCH body:
 *   {action: "approve"}    draft → approved (who / when stamped)
 *   {action: "unapprove"}  approved → draft
 *   {title?, published_on?, issuing_body?, source_url?, impact_lines?,
 *    badge?, effective_on?}  edit; an APPROVED entry goes back to draft, so
 *                           an edited text is never published unapproved.
 * Leaving the approved state also takes the entry out of a draft issue.
 * An entry inside an issue that is approved or sent is locked (409).
 *
 * DELETE — only an entry not in an approved / sent issue.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKED_AR = "الخبر داخل عدد معتمد أو مُرسل، فلا يُعدّل ولا يُحذف";

type Db = Awaited<ReturnType<typeof createServiceClient>>;

/** The entry and the status of the issue it is in (null: none). */
async function readEntry(db: Db, id: string) {
  const { data: entry, error } = await db.from("journal_entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { error } as const;
  if (!entry) return { entry: null } as const;
  const { data: link, error: lErr } = await db.from("journal_issue_entries").select("issue_id").eq("entry_id", id).maybeSingle();
  if (lErr) return { error: lErr } as const;
  let issueStatus: string | null = null;
  const issueId = (link as { issue_id?: string } | null)?.issue_id ?? null;
  if (issueId) {
    const { data: issue, error: iErr } = await db.from("journal_issues").select("status").eq("id", issueId).maybeSingle();
    if (iErr) return { error: iErr } as const;
    issueStatus = (issue as { status?: string } | null)?.status ?? null;
  }
  return { entry: entry as unknown as Record<string, unknown> & { status: string }, issueId, issueStatus } as const;
}

function dbFail(where: string, err: { code?: string | null }) {
  if (isJournalSchemaMissing(err)) {
    return NextResponse.json({ error: "جداول المجلة غير موجودة بعد", code: "schema_missing" }, { status: 503 });
  }
  console.error(`[admin/journal/entries/[id] ${where}]`, err.code ?? "no-code");
  return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("content.delete");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  try {
    const db = await createServiceClient();
    const read = await readEntry(db, id);
    if ("error" in read && read.error) return dbFail("PATCH read", read.error);
    if (!read.entry) return NextResponse.json({ error: "الخبر غير موجود" }, { status: 404 });
    const { entry, issueId, issueStatus } = read;
    if (issueStatus && issueStatus !== "draft") return NextResponse.json({ error: LOCKED_AR }, { status: 409 });

    const nowIso = new Date().toISOString();
    let update: Record<string, unknown>;
    let action: string;
    if (body.action === "approve") {
      if (entry.status === "approved") return NextResponse.json({ data: { ...entry, issue_id: issueId } });
      update = { status: "approved", approved_by: gate.userId, approved_at: nowIso };
      action = "journal_entry_approve";
    } else if (body.action === "unapprove") {
      if (entry.status === "draft") return NextResponse.json({ data: { ...entry, issue_id: issueId } });
      update = { status: "draft", approved_by: null, approved_at: null };
      action = "journal_entry_unapprove";
    } else if (body.action === undefined) {
      const parsed = parseEntryInput(body, true);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      if (Object.keys(parsed.value).length === 0) return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
      update = { ...parsed.value };
      if (entry.status === "approved") Object.assign(update, { status: "draft", approved_by: null, approved_at: null });
      action = "journal_entry_update";
    } else {
      return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
    }

    const { data, error } = await db
      .from("journal_entries")
      .update(update)
      .eq("id", id)
      .eq("status", entry.status)
      .select(ENTRY_COLUMNS)
      .maybeSingle();
    if (error) return dbFail("PATCH update", error);
    if (!data) return NextResponse.json({ error: "تغيّر الخبر للتو — أعد تحميل الصفحة" }, { status: 409 });

    // Back to draft → out of the draft issue it was in.
    let removedFromIssue = false;
    if (issueId && (data as { status?: string }).status === "draft") {
      const { error: dErr } = await db.from("journal_issue_entries").delete().eq("entry_id", id).eq("issue_id", issueId);
      if (dErr) console.error("[admin/journal/entries/[id] PATCH unlink]", dErr.code ?? "no-code");
      else removedFromIssue = true;
    }

    await logAdminAction({
      actorId: gate.userId,
      action,
      targetType: "journal_entry",
      targetId: id,
      before: entry,
      after: data,
      metadata: removedFromIssue ? { removed_from_issue: issueId } : undefined,
    });
    return NextResponse.json({ data: { ...(data as object), issue_id: removedFromIssue ? null : issueId }, removedFromIssue });
  } catch (err) {
    console.error("[admin/journal/entries/[id] PATCH] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("content.delete");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  try {
    const db = await createServiceClient();
    const read = await readEntry(db, id);
    if ("error" in read && read.error) return dbFail("DELETE read", read.error);
    if (!read.entry) return NextResponse.json({ error: "الخبر غير موجود" }, { status: 404 });
    const { entry, issueId, issueStatus } = read;
    if (issueStatus && issueStatus !== "draft") return NextResponse.json({ error: LOCKED_AR }, { status: 409 });

    if (issueId) {
      const { error: uErr } = await db.from("journal_issue_entries").delete().eq("entry_id", id).eq("issue_id", issueId);
      if (uErr) return dbFail("DELETE unlink", uErr);
    }
    const { error } = await db.from("journal_entries").delete().eq("id", id);
    if (error) return dbFail("DELETE", error);
    await logAdminAction({
      actorId: gate.userId,
      action: "journal_entry_delete",
      targetType: "journal_entry",
      targetId: id,
      before: entry,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/journal/entries/[id] DELETE] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}
