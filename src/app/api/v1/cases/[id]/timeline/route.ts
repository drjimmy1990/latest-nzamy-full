import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { hydrateAuthorNames, type CaseNoteRow } from "@/app/api/v1/cases/[id]/notes/_shared";
import { buildCaseTimeline, type TimelineNote } from "@/lib/caseTimeline/buildCaseTimeline";
import { degreeFromDb } from "@/lib/services/caseStageVocabulary";
import { ledgerActivityTitle } from "@/lib/ledger/ledgerInput";
import { liveRowsOnly } from "@/lib/services/archivedRows";

/**
 * GET /api/v1/cases/[id]/timeline — the case file's «السجل الزمني» (N3.7,
 * owner §٤٥ axis 1). Hearings, litigation stages, ledger entries (not
 * archived) and the notes the caller may read, on one line, newest first
 * (src/lib/caseTimeline/buildCaseTimeline.ts).
 *
 * Every read is the caller's own session: RLS decides each row. Hearings and
 * stages are also kept only when their owner is the caller or an active
 * member of the case's firm — their INSERT policies check owner_user_id alone
 * (20260903_phase1), so a stranger's row carrying this case id must not land
 * on its timeline.
 *
 * → { data: TimelineItem[], partial: boolean } — `partial` when a source could
 * not be read, so the screen says so instead of presenting a shorter history.
 */

const OUTCOME_AR: Record<string, string> = {
  won: "كسب القضية", lost: "خسارة", partial: "حكم جزئي", settled: "تسوية", withdrawn: "تنازل", pending: "قيد النظر",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!id || id.length > 200) return NextResponse.json({ error: "معرّف القضية غير صالح." }, { status: 400 });

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests").select("id, firm_id").eq("id", id).maybeSingle();
    if (caseError) {
      console.error("[cases/timeline] case read failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر تحميل السجل الزمني." }, { status: 500 });
    }
    if (!caseRow) return NextResponse.json({ error: "القضية غير موجودة." }, { status: 404 });
    const caseFirm = (caseRow as { firm_id: string | null }).firm_id;

    const [hearingsRes, stagesRes, ledgerRes, caseNotesRes, wallNotesRes, membersRes] = await Promise.all([
      supabase.from("hearings").select("id, owner_user_id, hearing_date, hearing_time, title, status, location").eq("case_request_id", id).limit(500),
      supabase.from("case_stages").select("id, owner_user_id, degree, court_name, opened_on, closed_on, outcome, created_at").eq("case_request_id", id).limit(100),
      supabase.from("legal_ledger_entries").select("id, direction, channel, title, notes, occurred_at").eq("case_request_id", id).is("archived_at", null).limit(500),
      // Archived notes (N3.9) leave the timeline; they live in «المحذوفات».
      liveRowsOnly((excludeArchived) => {
        const q = supabase.from("case_notes").select("id, author_user_id, body, visibility, created_at").eq("request_id", id);
        return (excludeArchived ? q.is("deleted_at", null) : q).limit(500);
      }),
      supabase.from("dashboard_notes").select("id, author_user_id, body, visibility, created_at").eq("case_request_id", id).limit(200),
      caseFirm
        ? supabase.from("firm_members").select("user_id").eq("firm_id", caseFirm).eq("status", "active")
        : Promise.resolve({ data: [] as Array<{ user_id: string }>, error: null }),
    ]);

    const failed = [hearingsRes, stagesRes, ledgerRes, caseNotesRes, wallNotesRes, membersRes].filter((r) => r.error);
    for (const r of failed) console.error("[cases/timeline] a source failed:", r.error?.message, r.error?.code);

    const trusted = new Set<string>([user.id, ...((membersRes.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)]);
    const ownedByCaseWorker = (owner: string | null) => !!owner && trusted.has(owner);

    type HearingRow = { id: string; owner_user_id: string; hearing_date: string; hearing_time: string | null; title: string; status: string; location: string | null };
    type StageRow = { id: string; owner_user_id: string | null; degree: string; court_name: string | null; opened_on: string | null; closed_on: string | null; outcome: string | null; created_at: string };
    type LedgerRow = { id: string; direction: string; channel: string; title: string; notes: string | null; occurred_at: string };
    type NoteRow = { id: string; author_user_id: string; body: string; visibility: string; created_at: string };

    const caseNotes = (caseNotesRes.data ?? []) as NoteRow[];
    const wallNotes = (wallNotesRes.data ?? []) as NoteRow[];
    const names = await hydrateAuthorNames([...caseNotes, ...wallNotes] as unknown as CaseNoteRow[]);
    const toNote = (source: TimelineNote["source"]) => (n: NoteRow): TimelineNote => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility,
      createdAt: n.created_at,
      authorName: n.author_user_id === user.id ? null : names.get(n.author_user_id) ?? "زميل",
      source,
    });

    const items = buildCaseTimeline({
      nowMs: Date.now(),
      labels: {
        degree: (d) => degreeFromDb(d),
        outcome: (o) => OUTCOME_AR[o] ?? null,
        ledgerTitle: (direction, channel, title) => ledgerActivityTitle(direction, channel, title),
      },
      hearings: ((hearingsRes.data ?? []) as HearingRow[])
        .filter((h) => ownedByCaseWorker(h.owner_user_id))
        .map((h) => ({ id: h.id, date: h.hearing_date, time: h.hearing_time, title: h.title, status: h.status, location: h.location })),
      stages: ((stagesRes.data ?? []) as StageRow[])
        .filter((s) => ownedByCaseWorker(s.owner_user_id))
        .map((s) => ({ id: s.id, degree: s.degree, courtName: s.court_name, openedOn: s.opened_on, closedOn: s.closed_on, outcome: s.outcome, createdAt: s.created_at })),
      ledger: ((ledgerRes.data ?? []) as LedgerRow[]).map((l) => ({ id: l.id, direction: l.direction, channel: l.channel, title: l.title, notes: l.notes, occurredAt: l.occurred_at })),
      notes: [...caseNotes.map(toNote("case_note")), ...wallNotes.map(toNote("dashboard_note"))],
    });

    return NextResponse.json({ data: items, partial: failed.length > 0 });
  } catch (err) {
    console.error("[cases/timeline] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل السجل الزمني." }, { status: 500 });
  }
}
