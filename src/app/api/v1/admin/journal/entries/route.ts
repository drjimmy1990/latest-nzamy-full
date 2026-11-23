import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { ENTRY_COLUMNS, parseEntryInput } from "@/lib/journal/journal";
import { isJournalSchemaMissing } from "@/lib/journal/journalServer";

/**
 * /api/v1/admin/journal/entries — «المجلة التشريعية» entries (owner Q195:
 * manual entry first; batch l13).
 *
 * GET  — every entry (drafts and approved), newest first, with the issue
 *        each one is in. Any staff role may look (requireStaff("read")).
 * POST — a new entry, always a DRAFT (approval is its own step, PATCH
 *        [id] {action:"approve"}). Staff role content.delete — the same
 *        action as the blog's articles (super admin today; Q194 «محامي
 *        المنصة» is not named yet). Audited.
 *
 * Works whether the journal switch is on or off: entries are prepared before
 * the journal opens. Before 20261203_70 runs: 503 {code:"schema_missing"}.
 */
export const dynamic = "force-dynamic";

const SCHEMA_MISSING_BODY = { error: "جداول المجلة غير موجودة بعد — يلزم تشغيل ملف قاعدة البيانات 20261203_70", code: "schema_missing" };

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  try {
    const db = await createServiceClient();
    const [entries, links] = await Promise.all([
      db.from("journal_entries").select(ENTRY_COLUMNS).order("published_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      db.from("journal_issue_entries").select("entry_id, issue_id").limit(10000),
    ]);
    const err = entries.error ?? links.error;
    if (err) {
      if (isJournalSchemaMissing(err)) return NextResponse.json(SCHEMA_MISSING_BODY, { status: 503 });
      console.error("[admin/journal/entries GET]", err.code ?? "no-code");
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    const issueOf = new Map(((links.data ?? []) as Array<{ entry_id: string; issue_id: string }>).map((l) => [l.entry_id, l.issue_id]));
    const data = ((entries.data ?? []) as unknown as Array<Record<string, unknown>>).map((e) => ({
      ...e,
      issue_id: issueOf.get(String(e.id)) ?? null,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[admin/journal/entries GET] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff("content.delete");
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = parseEntryInput(raw, false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const db = await createServiceClient();
    const { data, error } = await db
      .from("journal_entries")
      .insert({ ...parsed.value, status: "draft", created_by: gate.userId })
      .select(ENTRY_COLUMNS)
      .single();
    if (error) {
      if (isJournalSchemaMissing(error)) return NextResponse.json(SCHEMA_MISSING_BODY, { status: 503 });
      console.error("[admin/journal/entries POST]", error.code ?? "no-code");
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    const row = data as unknown as { id: string; title: string };
    await logAdminAction({
      actorId: gate.userId,
      action: "journal_entry_create",
      targetType: "journal_entry",
      targetId: row.id,
      after: data,
    });
    return NextResponse.json({ data: { ...(data as object), issue_id: null } }, { status: 201 });
  } catch (err) {
    console.error("[admin/journal/entries POST] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}
