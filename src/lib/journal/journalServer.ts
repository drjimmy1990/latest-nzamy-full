/**
 * journalServer.ts — the database side of «المجلة التشريعية» (owner
 * Q190–Q195, batch l13). SERVER ONLY (service role). The rules are in
 * ./journal.ts (pure) and ./journalSend.ts (who gets the e-mail).
 *
 * Every read here is the service role, because no visitor or subscriber
 * session may read the tables (20261203_70: admin-only RLS); what a viewer
 * sees is shaped by shapeEntryForViewer() before anything leaves the server.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/access-control";
import { activeLibraryGrantPlanRefs } from "@/lib/libraryAccessServer";
import { isFeatureOn } from "@/lib/featureFlags/featureFlagsServer";
import { readSuspendedIds } from "@/lib/accountSuspension/suspensionServer";
import { emailConfigured, sendEmail, siteLink } from "@/lib/email/sendEmail";
import {
  ENTRY_COLUMNS,
  ISSUE_COLUMNS,
  JOURNAL_FLAG,
  entriesForIssue,
  issueIsPublic,
  issuePaths,
  issueTitleAr,
  pdfConfigured,
  shapeEntryForViewer,
  type JournalEntryRow,
  type JournalIssueRow,
  type JournalViewer,
  type PublicJournalEntry,
} from "./journal";
import { issueEmailKey, issueEmailMessage } from "./journalRender";
import { planIssueBatch, sendLogStatus } from "./journalSend";

/** Missing table / column / function: 20261203_70 has not run. */
export const JOURNAL_SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"]);

export function isJournalSchemaMissing(err: { code?: string | null } | null | undefined): boolean {
  return !!err && JOURNAL_SCHEMA_MISSING.has(err.code ?? "");
}

export function journalEnabled(): Promise<boolean> {
  return isFeatureOn(JOURNAL_FLAG);
}

/**
 * Who counts as «المشترك» for Q190: a platform admin or an account with an
 * active library grant (the library subscription — the same grant that opens
 * the official legislative metadata, T28-22). The 50-point browsing gate is
 * NOT applied: reading a badge spends nothing. A failed read is a visitor.
 */
export async function journalViewerFor(userId: string | null): Promise<JournalViewer> {
  if (!userId) return "visitor";
  const [admin, refs] = await Promise.all([isPlatformAdmin(userId), activeLibraryGrantPlanRefs(userId)]);
  return admin || (Array.isArray(refs) && refs.length > 0) ? "subscriber" : "visitor";
}

type Db = SupabaseClient;

export interface PublicJournal {
  state: "ok" | "schema_missing" | "error";
  entries: PublicJournalEntry[];
  issues: Array<Pick<JournalIssueRow, "id" | "period_month" | "title">>;
}

/** The approved entries (newest first) and the approved issues, shaped for the viewer. */
export async function loadPublicJournal(viewer: JournalViewer, limit = 100): Promise<PublicJournal> {
  try {
    const db = await createServiceClient();
    const [entries, issues] = await Promise.all([
      db.from("journal_entries").select(ENTRY_COLUMNS).eq("status", "approved")
        .order("published_on", { ascending: false }).order("id", { ascending: true }).limit(limit),
      db.from("journal_issues").select("id, period_month, title, status").in("status", ["approved", "sending", "sent"])
        .order("period_month", { ascending: false }).limit(36),
    ]);
    const err = entries.error ?? issues.error;
    if (err) {
      if (isJournalSchemaMissing(err)) return { state: "schema_missing", entries: [], issues: [] };
      console.error("[journal] public read failed:", err.code ?? "no-code");
      return { state: "error", entries: [], issues: [] };
    }
    const shaped = ((entries.data ?? []) as unknown as JournalEntryRow[])
      .map((r) => shapeEntryForViewer(r, viewer))
      .filter((x): x is PublicJournalEntry => x !== null);
    const iss = ((issues.data ?? []) as unknown as JournalIssueRow[]).map(({ id, period_month, title }) => ({ id, period_month, title }));
    return { state: "ok", entries: shaped, issues: iss };
  } catch (err) {
    console.error("[journal] public read threw:", err instanceof Error ? err.name : "error");
    return { state: "error", entries: [], issues: [] };
  }
}

export interface IssueWithEntries {
  issue: JournalIssueRow;
  rows: JournalEntryRow[];
}

/** One issue and its entries (in issue order), or null / "schema_missing". */
export async function loadIssue(db: Db, issueId: string): Promise<IssueWithEntries | null | "schema_missing"> {
  if (!/^[0-9a-f-]{36}$/i.test(issueId)) return null;
  const { data: issue, error } = await db.from("journal_issues").select(ISSUE_COLUMNS).eq("id", issueId).maybeSingle();
  if (error) {
    if (isJournalSchemaMissing(error)) return "schema_missing";
    throw new Error(`journal issue read: ${error.code ?? "error"}`);
  }
  if (!issue) return null;
  const { data: links, error: linkErr } = await db
    .from("journal_issue_entries").select("entry_id, position").eq("issue_id", issueId).order("position", { ascending: true });
  if (linkErr) throw new Error(`journal issue entries read: ${linkErr.code ?? "error"}`);
  const ids = ((links ?? []) as Array<{ entry_id: string }>).map((l) => l.entry_id);
  let rows: JournalEntryRow[] = [];
  if (ids.length) {
    const { data, error: eErr } = await db.from("journal_entries").select(ENTRY_COLUMNS).in("id", ids);
    if (eErr) throw new Error(`journal entries read: ${eErr.code ?? "error"}`);
    const byId = new Map(((data ?? []) as unknown as JournalEntryRow[]).map((r) => [r.id, r]));
    rows = ids.map((id) => byId.get(id)).filter((r): r is JournalEntryRow => !!r);
  }
  return { issue: issue as unknown as JournalIssueRow, rows };
}

export type BuildOutcome =
  | { ok: true; issueId: string; entries: number; rebuilt: boolean }
  | { ok: false; reason: "no_entries" | "not_draft" | "schema_missing" | "error"; messageAr: string };

/**
 * Builds (or, while still a draft, rebuilds) the issue for `periodMonth`
 * from the approved entries not yet in another issue (entriesForIssue). An
 * approved / sent issue is never touched.
 */
export async function buildIssue(db: Db, periodMonth: string, actorId: string | null): Promise<BuildOutcome> {
  const { data: existing, error: exErr } = await db
    .from("journal_issues").select("id, status").eq("period_month", periodMonth).maybeSingle();
  if (exErr) {
    if (isJournalSchemaMissing(exErr)) return { ok: false, reason: "schema_missing", messageAr: "جداول المجلة غير موجودة بعد" };
    return { ok: false, reason: "error", messageAr: "تعذّر قراءة الأعداد" };
  }
  const ex = existing as { id: string; status: string } | null;
  if (ex && ex.status !== "draft") {
    return { ok: false, reason: "not_draft", messageAr: "هذا العدد معتمد أو أُرسل، فلا يُعاد بناؤه" };
  }

  // Entries already carried by OTHER issues stay there.
  const { data: linked, error: lErr } = await db.from("journal_issue_entries").select("entry_id, issue_id").limit(10000);
  if (lErr) return { ok: false, reason: "error", messageAr: "تعذّر قراءة أخبار الأعداد" };
  const taken = new Set(
    ((linked ?? []) as Array<{ entry_id: string; issue_id: string }>)
      .filter((l) => !ex || l.issue_id !== ex.id)
      .map((l) => l.entry_id),
  );
  const { data: approved, error: aErr } = await db
    .from("journal_entries").select("id, status, published_on").eq("status", "approved").limit(5000);
  if (aErr) return { ok: false, reason: "error", messageAr: "تعذّر قراءة الأخبار المعتمدة" };
  const picked = entriesForIssue((approved ?? []) as Array<Pick<JournalEntryRow, "id" | "status" | "published_on">>, periodMonth, taken);
  if (picked.length === 0) {
    return { ok: false, reason: "no_entries", messageAr: "لا توجد أخبار معتمدة لهذا الشهر لم تدخل عدداً سابقاً" };
  }

  let issueId = ex?.id ?? null;
  if (!issueId) {
    const { data: created, error: cErr } = await db
      .from("journal_issues")
      .insert({ period_month: periodMonth, title: issueTitleAr(periodMonth), built_by: actorId })
      .select("id").single();
    if (cErr || !created) {
      // A concurrent build created it first: report, do not double-build.
      return { ok: false, reason: "error", messageAr: "تعذّر إنشاء العدد — ربما أُنشئ للتو، أعد تحميل الصفحة" };
    }
    issueId = (created as { id: string }).id;
  } else {
    const { error: dErr } = await db.from("journal_issue_entries").delete().eq("issue_id", issueId);
    if (dErr) return { ok: false, reason: "error", messageAr: "تعذّر تحديث أخبار العدد" };
    await db.from("journal_issues").update({ built_at: new Date().toISOString(), built_by: actorId }).eq("id", issueId).eq("status", "draft");
  }
  const { error: iErr } = await db
    .from("journal_issue_entries")
    .insert(picked.map((p, i) => ({ issue_id: issueId, entry_id: p.id, position: i })));
  if (iErr) return { ok: false, reason: "error", messageAr: "تعذّر ربط الأخبار بالعدد" };
  return { ok: true, issueId: issueId!, entries: picked.length, rebuilt: !!ex };
}

export interface SendReport {
  ok: boolean;
  skipped?: "journal_disabled" | "email_unavailable" | "not_approved" | "schema_missing";
  sent: number;
  sunk: number;
  failed: number;
  skippedAccounts: number;
  done: boolean;
  error?: string;
}

/** Ids per read: each page is also an `in (...)` filter, so the request URL stays short. */
const OPTED_IN_PAGE = 100;
const OPTED_IN_SCAN_MAX = 20_000;
/** E-mails per run (each send may take up to 20 s; a cron run must end). */
export const SEND_BATCH = 40;

/**
 * Sends one batch of an APPROVED issue (status approved | sending) and marks
 * it sent once nobody opted-in is left. Never sends a draft, never sends
 * while the journal switch is off or e-mail is not set up.
 */
export async function sendIssueBatch(db: Db, issueId: string, limit = SEND_BATCH): Promise<SendReport> {
  const empty = { sent: 0, sunk: 0, failed: 0, skippedAccounts: 0, done: false };
  if (!(await journalEnabled())) return { ok: true, skipped: "journal_disabled", ...empty };
  if (!emailConfigured(process.env)) return { ok: true, skipped: "email_unavailable", ...empty };

  const loaded = await loadIssue(db, issueId);
  if (loaded === "schema_missing") return { ok: true, skipped: "schema_missing", ...empty };
  if (!loaded) return { ok: false, error: "not_found", ...empty };
  const { issue, rows } = loaded;
  if (issue.status === "sent") return { ok: true, ...empty, done: true };
  if (issue.status !== "approved" && issue.status !== "sending") return { ok: true, skipped: "not_approved", ...empty };

  if (issue.status === "approved") {
    await db.from("journal_issues")
      .update({ status: "sending", send_started_at: new Date().toISOString() })
      .eq("id", issueId).eq("status", "approved");
  }

  // The opted-in accounts not yet in the log, page by page.
  const pending: string[] = [];
  const logged = new Set<string>();
  let cursor: string | null = null;
  let scanned = 0;
  let exhausted = false;
  while (pending.length < limit && scanned < OPTED_IN_SCAN_MAX) {
    let q = db.from("user_settings").select("user_id").eq("newsletter", true).order("user_id", { ascending: true }).limit(OPTED_IN_PAGE);
    if (cursor) q = q.gt("user_id", cursor);
    const { data, error } = await q;
    if (error) return { ok: false, error: `user_settings:${error.code ?? "error"}`, ...empty };
    const ids = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean);
    if (ids.length === 0) {
      exhausted = true;
      break;
    }
    scanned += ids.length;
    cursor = ids[ids.length - 1];
    const { data: done, error: dErr } = await db
      .from("journal_issue_sends").select("user_id").eq("issue_id", issueId).in("user_id", ids);
    if (dErr) return { ok: false, error: `sends:${dErr.code ?? "error"}`, ...empty };
    for (const r of (done ?? []) as Array<{ user_id: string }>) logged.add(r.user_id);
    for (const id of ids) if (!logged.has(id) && pending.length < limit) pending.push(id);
    if (ids.length < OPTED_IN_PAGE) {
      exhausted = pending.length < limit || exhausted;
      break;
    }
  }

  if (pending.length === 0) {
    if (exhausted) {
      await db.from("journal_issues").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", issueId).eq("status", "sending");
      return { ok: true, ...empty, done: true };
    }
    return { ok: true, ...empty };
  }

  const [{ data: profiles, error: pErr }, suspended] = await Promise.all([
    db.from("profiles").select("id, email").in("id", pending),
    readSuspendedIds(db, pending),
  ]);
  if (pErr) return { ok: false, error: `profiles:${pErr.code ?? "error"}`, ...empty };
  const addresses = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((p) => [p.id, p.email]));
  const plan = planIssueBatch({ optedIn: pending, alreadyLogged: logged, addresses, suspended, limit });
  if (plan.blocked) return { ok: false, error: "suspension_unknown", ...empty };

  if (plan.skip.length) {
    await db.from("journal_issue_sends").upsert(
      plan.skip.map((s) => ({ issue_id: issueId, user_id: s.userId, status: "failed", last_error: s.reason })),
      { onConflict: "issue_id,user_id", ignoreDuplicates: true },
    );
  }

  const paths = issuePaths(issueId);
  const message = issueEmailMessage({
    title: issue.title,
    periodMonth: issue.period_month,
    entries: rows.map((r) => shapeEntryForViewer(r, "visitor")).filter((x): x is PublicJournalEntry => x !== null),
    pageHref: siteLink(paths.page),
    pdfHref: pdfConfigured() ? siteLink(paths.pdf) : null,
  });

  const report: SendReport = { ok: true, ...empty, skippedAccounts: plan.skip.length };
  for (const r of plan.send) {
    // Claim first: only a row this call created is ours.
    const { data: claimed, error: cErr } = await db
      .from("journal_issue_sends")
      .upsert({ issue_id: issueId, user_id: r.userId, status: "sending" }, { onConflict: "issue_id,user_id", ignoreDuplicates: true })
      .select("user_id");
    if (cErr || !Array.isArray(claimed) || claimed.length === 0) continue;
    const result = await sendEmail({
      to: r.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      tag: "journal_issue",
      idempotencyKey: issueEmailKey(issueId, r.userId),
      userIds: [r.userId],
    });
    const { status, lastError } = sendLogStatus(result);
    await db.from("journal_issue_sends").update({ status, last_error: lastError })
      .eq("issue_id", issueId).eq("user_id", r.userId);
    if (status === "sent") report.sent += 1;
    else if (status === "sunk") report.sunk += 1;
    else report.failed += 1;
  }
  return report;
}

export interface SendCounts {
  sent: number;
  sunk: number;
  failed: number;
  sending: number;
}

/** Per-issue counts of the send log (admin page). */
export async function sendCounts(db: Db, issueIds: string[]): Promise<Map<string, SendCounts>> {
  const out = new Map<string, SendCounts>();
  if (!issueIds.length) return out;
  const { data, error } = await db.from("journal_issue_sends").select("issue_id, status").in("issue_id", issueIds).limit(50000);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ issue_id: string; status: keyof SendCounts }>) {
    const c = out.get(r.issue_id) ?? { sent: 0, sunk: 0, failed: 0, sending: 0 };
    if (r.status in c) c[r.status] += 1;
    out.set(r.issue_id, c);
  }
  return out;
}

/** How many accounts have the newsletter switch on (admin page). */
export async function optedInCount(db: Db): Promise<number | null> {
  const { count, error } = await db.from("user_settings").select("user_id", { count: "exact", head: true }).eq("newsletter", true);
  return error ? null : count ?? 0;
}

// ── the issue page and the PDF ───────────────────────────────────────────────

export type IssueView =
  | { kind: "ok"; issue: JournalIssueRow; entries: PublicJournalEntry[]; viewer: JournalViewer; preview: boolean }
  | { kind: "disabled" }
  | { kind: "not_found" }
  | { kind: "schema_missing" }
  | { kind: "error" };

/** The signed-in user's id from the request cookies, or null (never throws). */
export async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * One issue as `userId` may see it: switch off → "disabled" (an admin still
 * previews); a draft → "not_found" for everyone but an admin; the entries
 * shaped for the viewer (visitor: title + date).
 */
export async function issueViewFor(issueId: string, userId: string | null): Promise<IssueView> {
  try {
    const [enabled, admin] = await Promise.all([journalEnabled(), userId ? isPlatformAdmin(userId) : Promise.resolve(false)]);
    if (!enabled && !admin) return { kind: "disabled" };
    const db = await createServiceClient();
    const loaded = await loadIssue(db, issueId);
    if (loaded === "schema_missing") return { kind: "schema_missing" };
    if (!loaded) return { kind: "not_found" };
    const isPublic = issueIsPublic(loaded.issue);
    if (!isPublic && !admin) return { kind: "not_found" };
    const viewer: JournalViewer = admin ? "subscriber" : await journalViewerFor(userId);
    const entries = loaded.rows
      .map((r) => shapeEntryForViewer(r, viewer))
      .filter((x): x is PublicJournalEntry => x !== null);
    return { kind: "ok", issue: loaded.issue, entries, viewer, preview: !isPublic };
  } catch (err) {
    console.error("[journal] issue view failed:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return { kind: "error" };
  }
}
