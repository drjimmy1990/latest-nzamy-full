import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { kindToType, urgencyFromDb } from "@/lib/services/hearingVocabulary";

/**
 * GET /api/v1/lawyer/dashboard/summary
 * Auth required (lawyer/firm/admin). Aggregates the lawyer's own workspace.
 *
 * ── Why this route was rewritten (audit 2026-08-27) ───────────────────────────
 *
 * 1. It read the WRONG TABLE for hearings and consultations. `consultations`
 *    has zero rows in production and nothing in the repo writes it; the real
 *    hearings a lawyer adds lived in `service_requests` rows with
 *    `receiver = "lawyer"` and `metadata.date` (AddHearingModal), which is what
 *    /dashboard/lawyer/hearings read back. So the overview printed «لا توجد
 *    جلسات قادمة» over hearings the hearings page was listing.
 *
 *    (2026-09-03 — Phase 1) Hearings moved AGAIN, this time onto a real
 *    `public.hearings` table (migration 20260903_phase1_case_tables.sql), so
 *    they are read from there now — see Round 1 query 4, below. Left the
 *    history above rather than deleting it: it is the same class of bug
 *    fixed twice in a row, once by finding the wrong table and once by the
 *    table not existing yet.
 *
 * 2. Every query swallowed its failure into `0` / `[]` and the route always
 *    answered 200. A DB error, an RLS change or an expired session therefore
 *    rendered as "you have no cases and no hearings" — the single most
 *    dangerous thing this screen can say to a practising lawyer. Now a failed
 *    section is `null` and its key is listed in `degraded`, so the page can
 *    tell COULD-NOT-READ apart from GENUINELY-EMPTY. `null` is deliberate:
 *    zero-filling is indistinguishable from a real zero, which is the bug.
 *
 * 3. The revenue tile summed `payments` with NO lawyer predicate. `payments`
 *    has no payer column, and the RLS policy admits BOTH sides of a request
 *    (requester or assignee), so a lawyer who bought anything as a customer
 *    would have seen his own spending counted as income. Scoped here the same
 *    way /api/v1/lawyer/finance already scopes it: resolve the request ids
 *    assigned to this lawyer, then filter payments by those ids.
 *
 * ── The workspace query, and why the filtering happens in JS ──────────────────
 *
 * `service_requests` used to be this lawyer's WHOLE workspace — cases,
 * hearings, tasks, manually-added clients and finance invoices all in it as
 * `receiver: "lawyer"` rows, told apart ONLY by marker keys inside `metadata`.
 * Phase 1 (2026-09-03) moved hearings and tasks to tables of their own
 * (queries 4 and 5, below); what is left sharing this one is cases, the
 * manually-added clients and the finance invoices. Postgres/PostgREST can
 * express `meta.client === true` as a positive filter but NOT as a safe
 * negative one: `metadata->>'client' <> 'true'` evaluates to NULL — and so
 * DROPS the row — for every row that has no `client` key at all, i.e. for
 * every real case. That single trap would empty «القضايا النشطة» for every
 * lawyer with no error anywhere. So the rows are fetched once and classified
 * in JS, where "key absent" means what it looks like it means.
 *
 * The window is bounded (WORKSPACE_WINDOW). If it fills, the counts computed
 * from it would be understated, so they are reported as `null` (unreadable)
 * rather than as a number that is quietly too small.
 */

// Chosen to stay under the ~380-element ceiling PostgREST puts on an `in`
// list, because the payments query below filters on exactly the ids this
// window produced: cap the window and the `.in("request_id", …)` list is
// capped with it.
const WORKSPACE_WINDOW = 300;

/**
 * Every status in the `service_requests` CHECK constraint (migration 20260616)
 * that is neither finished nor a draft — i.e. still live work.
 */
const LIVE_STATUSES = [
  "pending",
  "pending_payment",
  "pending_assignment",
  "assigned",
  "in_review",
];

interface RecentCaseRow {
  id: string;
  title: string;
  status: string;
  updated_at: string | null;
  type: string | null;
}

interface UpcomingHearingRow {
  id: string;
  title: string;
  /** `hearings.hearing_date`, "YYYY-MM-DD". */
  date: string;
  time: string | null;
  /** UI vocabulary (hearing / deadline / gov_review / …) — translated from `hearings.kind` by kindToType(). */
  type: string | null;
  urgency: string | null;
  location: string | null;
  caseName: string | null;
}

interface UrgentTaskRow {
  id: string;
  title: string;
  /** `tasks.due_date`, "YYYY-MM-DD", or null when the lawyer set none. */
  dueDate: string | null;
  /** `tasks.priority` (urgent / high / normal / low). */
  priority: string | null;
  category: string | null;
}

interface RecentActivityRow {
  id: number;
  event: string;
  created_at: string;
  request_id: string;
}

interface WorkspaceRow {
  id: string;
  title: string | null;
  status: string;
  type: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Today's date as a Saudi wall-clock `YYYY-MM-DD`.
 *
 * Hearing dates are wall-clock dates typed into an `<input type="date">`, not
 * instants, so they must be compared against the Saudi calendar day. Using the
 * server's UTC date instead would put the cut-off a day behind for the three
 * hours each night when Riyadh (UTC+3) has rolled over and UTC has not — and a
 * cut-off that is a day AHEAD would hide a hearing happening today, which is
 * the failure mode this whole route exists to prevent.
 */
function saudiToday(): string {
  // en-CA formats as YYYY-MM-DD, which is also the format `<input type="date">`
  // produces, so the two are directly comparable as strings.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;
    const today = saudiToday();

    // Sections that could not be read. Empty = everything below is a real
    // statement about this lawyer's practice.
    const degraded: string[] = [];

    // ── Round 1: the five independent reads ──────────────────────────────────
    const [workspace, pendingConsultations, recentActivity, hearingRows, taskRows] = await Promise.all([
      // 1. The lawyer's whole workspace, unfiltered by status: one read that
      //    feeds cases only now (hearings and tasks both moved to their own
      //    tables — queries 4 and 5, below). `assigned_to` is the predicate
      //    AddCaseModal writes, and it is also what keeps marketplace rows
      //    out: the SELECT policy lets a verified lawyer browse OTHER
      //    people's unassigned requests, so a query without an owner
      //    predicate would count strangers' work as this lawyer's.
      Promise.resolve(
        supabase
          .from("service_requests")
          .select("id, title, status, type, updated_at, metadata")
          .eq("assigned_to", uid)
          .order("updated_at", { ascending: false })
          .limit(WORKSPACE_WINDOW),
      )
        .then(({ data, error }) => {
          if (error) {
            console.error("[lawyer/dashboard/summary] workspace read failed:", error.message);
            return null;
          }
          return (data ?? []) as WorkspaceRow[];
        })
        .catch((err) => {
          console.error("[lawyer/dashboard/summary] workspace read threw:", err);
          return null;
        }),

      // 2. Consultations awaiting a reply.
      //
      //    Not the `consultations` table — that one is empty and unwritten.
      //    These are `service_requests` rows with `type = "consultation"`, which
      //    is exactly what /dashboard/lawyer/consultations lists, so the tile and
      //    that page finally describe the same thing.
      //
      //    Participant predicate (requester OR assignee) rather than
      //    `assigned_to` alone, because a lawyer's own booking modal saves the
      //    row with `assigned_to = null` and the lawyer as requester; scoping to
      //    the assignee would make the tile permanently ٠ again, just for a
      //    different reason. It also excludes the marketplace-browse rows the
      //    RLS policy would otherwise let through.
      //
      //    "Awaiting a reply" = every live status, matching how the
      //    consultations page buckets anything not completed/cancelled as
      //    upcoming. Written as a POSITIVE `.in()` over the status CHECK
      //    constraint (migration 20260616) minus the two closed states and
      //    'draft' — which no consultation is ever created in. A negative
      //    `.not("status","in",…)` would read more directly but has no
      //    precedent in this codebase, and if PostgREST rejected the form the
      //    only visible result would be this tile going from permanently ٠ to
      //    permanently «تعذّرت القراءة», which is not a fix.
      Promise.resolve(
        supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .eq("type", "consultation")
          // `receiver` too, so the tile counts exactly the set
          // /dashboard/lawyer/consultations lists — that page reads
          // getWorkflowRequestsByReceiver("lawyer"). Without it a consultation
          // this lawyer raised as a CUSTOMER through /book/consultation
          // (receiver "ai_workspace", handled by the نظامي team) would be
          // counted here as work waiting on him, and would not appear on the
          // page this tile sends him to.
          .eq("receiver", "lawyer")
          .or(`requester_user_id.eq.${uid},assigned_to.eq.${uid}`)
          .in("status", LIVE_STATUSES),
      )
        .then(({ count, error }) => {
          if (error) {
            console.error("[lawyer/dashboard/summary] consultations count failed:", error.message);
            return null;
          }
          // `count` is null only when the head request itself did not report
          // one; treat that as unreadable rather than as zero.
          return count ?? null;
        })
        .catch((err) => {
          console.error("[lawyer/dashboard/summary] consultations count threw:", err);
          return null;
        }),

      // 3. Recent activity (from request_events).
      // Filtering on actor_user_id alone hid every admin-performed event,
      // because the admin console claims and delivers as the ADMIN — so a
      // lawyer never saw his own order being picked up or delivered. Scope by
      // the REQUEST instead. The predicate is an OR: `assigned_to` alone would
      // be wrong (claiming reassigns it to the admin) and `requester_user_id`
      // alone would drop work a lawyer receives rather than raises. It mirrors
      // the "participants read request events" policy that RLS enforces on this
      // same client anyway.
      Promise.resolve(
        supabase
          .from("request_events")
          // the embed is only here so PostgREST can filter on it; it is
          // stripped below so the response shape stays exactly as before.
          .select("id, event, created_at, request_id, service_requests!inner(id)")
          .or(`requester_user_id.eq.${uid},assigned_to.eq.${uid}`, {
            referencedTable: "service_requests",
          })
          .order("created_at", { ascending: false })
          .limit(8)
          .returns<RecentActivityRow[]>(),
      )
        .then(({ data, error }) => {
          if (error) {
            console.error("[lawyer/dashboard/summary] activity read failed:", error.message);
            return null;
          }
          return (data ?? []).map((row) => ({
            id: row.id,
            event: row.event,
            created_at: row.created_at,
            request_id: row.request_id,
          }));
        })
        .catch((err) => {
          console.error("[lawyer/dashboard/summary] activity read threw:", err);
          return null;
        }),

      // 4. Upcoming hearings — public.hearings (Phase 1, 2026-09-03), not
      //    service_requests. `.eq("owner_user_id", uid)` on top of RLS for the
      //    same reason /api/v1/lawyer/hearings does: this widget is the
      //    lawyer's OWN diary, not a firm-wide one, and RLS alone would also
      //    admit an active colleague's hearings through can_access_case_row.
      //    `>= today` and `status = "scheduled"` together are "upcoming and
      //    not yet resolved" — a held/adjourned/cancelled hearing is not
      //    upcoming even if its date has not passed.
      Promise.resolve(
        supabase
          .from("hearings")
          .select("id, title, kind, hearing_date, hearing_time, urgency, location, metadata")
          .eq("owner_user_id", uid)
          .eq("status", "scheduled")
          .gte("hearing_date", today)
          .order("hearing_date", { ascending: true })
          .order("hearing_time", { ascending: true, nullsFirst: false })
          .limit(50),
      )
        .then(({ data, error }) => {
          if (error) {
            console.error("[lawyer/dashboard/summary] hearings read failed:", error.message);
            return null;
          }
          return (data ?? []) as {
            id: string; title: string; kind: string; hearing_date: string;
            hearing_time: string | null; urgency: string; location: string | null;
            metadata: Record<string, unknown> | null;
          }[];
        })
        .catch((err) => {
          console.error("[lawyer/dashboard/summary] hearings read threw:", err);
          return null;
        }),

      // 5. Open tasks — public.tasks (Phase 1, 2026-09-03), not
      //    service_requests. Same `owner_user_id = uid` scoping as hearings:
      //    this widget is the lawyer's own list, not a firm-wide one.
      //    "Open" = not done and not archived — the DB status column IS the
      //    UI vocabulary now, so this is a plain `.not()`, no enum to map.
      Promise.resolve(
        supabase
          .from("tasks")
          .select("id, title, priority, category, due_date")
          .eq("owner_user_id", uid)
          .not("status", "in", "(done,archived)")
          .limit(200),
      )
        .then(({ data, error }) => {
          if (error) {
            console.error("[lawyer/dashboard/summary] tasks read failed:", error.message);
            return null;
          }
          return (data ?? []) as {
            id: string; title: string; priority: string; category: string | null; due_date: string | null;
          }[];
        })
        .catch((err) => {
          console.error("[lawyer/dashboard/summary] tasks read threw:", err);
          return null;
        }),
    ]);

    if (pendingConsultations === null) degraded.push("pendingConsultations");
    if (recentActivity === null) degraded.push("recentActivity");

    // ── Hearings: now their own read, independent of the workspace query ────
    // Phase 1 moved hearings off service_requests, so a workspace failure no
    // longer takes hearings down with it — and a hearings failure no longer
    // takes cases/tasks down either. Each degrades on its own now.
    let upcomingHearings: UpcomingHearingRow[] | null = null;
    let upcomingHearingsCount: number | null = null;
    let criticalDeadlines: UpcomingHearingRow[] | null = null;
    let criticalDeadlinesCount: number | null = null;

    if (hearingRows === null) {
      degraded.push("hearings");
    } else {
      const hearings: UpcomingHearingRow[] = hearingRows.map((row) => ({
        id: row.id,
        title: row.title || "موعد بدون عنوان",
        date: row.hearing_date,
        time: row.hearing_time,
        type: kindToType(row.kind),
        urgency: urgencyFromDb(row.urgency),
        location: row.location,
        caseName: readString((row.metadata ?? {}) as Record<string, unknown>, "caseName"),
      }));
      // Already ordered by the query (date asc, time asc), so slicing keeps
      // the soonest first.
      upcomingHearingsCount = hearings.length;
      upcomingHearings = hearings.slice(0, 3);
      // «مواعيد حرجة» is a real subset of the same rows, not a second source:
      // an appeal/final deadline (the modal's «موعد طعن / نهائي») or anything
      // the lawyer marked critical when saving it.
      const critical = hearings.filter((h) => h.type === "deadline" || h.urgency === "critical");
      criticalDeadlinesCount = critical.length;
      criticalDeadlines = critical.slice(0, 4);
    }

    // ── Tasks: also its own read now, independent of the workspace query ────
    let urgentTasks: UrgentTaskRow[] | null = null;
    if (taskRows === null) {
      degraded.push("tasks");
    } else {
      const tasks: UrgentTaskRow[] = taskRows.map((row) => ({
        id: row.id,
        title: row.title || "مهمة بدون عنوان",
        dueDate: row.due_date,
        priority: row.priority,
        category: row.category,
      }));
      // Soonest due first; a task with no due date has nothing to sort by and
      // goes last rather than being given an invented date.
      tasks.sort((a, b) => {
        if (a.dueDate === b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      urgentTasks = tasks.slice(0, 4);
    }

    // ── Classify the workspace (cases only now) ──────────────────────────────
    let activeCases: number | null = null;
    let recentCases: RecentCaseRow[] | null = null;
    let revenueThisMonth: number | null = null;

    if (workspace === null) {
      degraded.push("cases", "revenue");
    } else if (workspace.length >= WORKSPACE_WINDOW) {
      // The window filled, so anything counted from it is a floor, not a total.
      // Reporting the floor as the answer is the exact class of lie this route
      // was rewritten to stop, so report nothing instead.
      console.error(
        `[lawyer/dashboard/summary] workspace window (${WORKSPACE_WINDOW}) filled for ${uid}; counts suppressed`,
      );
      degraded.push("cases", "revenue");
    } else {
      const cases: WorkspaceRow[] = [];

      for (const row of workspace) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        // A manually-added client (POST /api/v1/lawyer/clients) and a finance
        // invoice (POST /api/v1/lawyer/finance) are both `type: "service"`
        // rows assigned to this lawyer, so without these two markers the
        // dashboard's cases table listed a client name or an invoice as if
        // it were litigation. Tasks no longer pass through here at all
        // (query 5, above), so the old `meta.task` branch is gone with them.
        const isClient = meta.client === true;
        const isInvoice = meta.invoice === true;
        if (isClient || isInvoice) continue;

        cases.push(row);
      }

      activeCases = cases.filter((c) => c.status === "assigned" || c.status === "in_review").length;

      recentCases = cases
        .filter((c) =>
          ["assigned", "pending_assignment", "in_review", "completed"].includes(c.status),
        )
        // The workspace read is already ordered by updated_at desc, so the
        // first four here are the four most recently touched.
        .slice(0, 4)
        // Whitelist, not `{...row}`: `metadata` on a client-raised request
        // carries `internalNotes`, the team's private note. Naming the four
        // fields the table renders means no future metadata key can leak
        // through this route by being added upstream — which is what a
        // strip-one-key blacklist would have allowed.
        .map((c) => ({
          id: c.id,
          title: c.title || "—",
          status: c.status,
          updated_at: c.updated_at,
          type: c.type,
        }));

      // ── Round 2: revenue, scoped through the ids we just read ─────────────
      // Same scoping as /api/v1/lawyer/finance. No ids ⇒ no payments can
      // reference this lawyer's work, so 0 here is a fact, not a fallback.
      const requestIds = workspace.map((r) => r.id);
      if (requestIds.length === 0) {
        revenueThisMonth = 0;
      } else {
        // «هذا الشهر» means the Saudi month, not the server's. `new Date(y, m,
        // 1)` uses the server's local zone — UTC in every deployment — which
        // puts the boundary three hours early and so counts payments taken on
        // the last evening of the previous month. Saudi Arabia observes no DST,
        // so the +03:00 offset is exact all year.
        const [monthYear, monthNum] = today.split("-");
        const monthStart = new Date(`${monthYear}-${monthNum}-01T00:00:00+03:00`).toISOString();
        const { data: paid, error: payError } = await supabase
          .from("payments")
          .select("amount")
          .in("request_id", requestIds)
          .eq("status", "paid")
          .gte("created_at", monthStart);
        if (payError) {
          console.error("[lawyer/dashboard/summary] payments read failed:", payError.message);
          degraded.push("revenue");
        } else {
          revenueThisMonth = (paid ?? []).reduce(
            (sum: number, p: { amount: number | null }) => sum + (p.amount ?? 0),
            0,
          );
        }
      }
    }

    return NextResponse.json({
      activeCases,
      pendingConsultations,
      revenueThisMonth,
      recentCases,
      upcomingHearings,
      upcomingHearingsCount,
      criticalDeadlines,
      criticalDeadlinesCount,
      urgentTasks,
      recentActivity,
      degraded,
    });
  } catch (err) {
    console.error("[lawyer/dashboard/summary GET] Unexpected error:", err);
    // 500, not a 200 full of zeros. The old handler returned a complete,
    // zeroed, entirely believable dashboard on any unexpected throw.
    return NextResponse.json(
      { error: "تعذّر تحميل بيانات لوحة التحكم" },
      { status: 500 },
    );
  }
}
