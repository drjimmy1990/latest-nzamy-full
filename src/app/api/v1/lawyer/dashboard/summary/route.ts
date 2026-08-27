import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * GET /api/v1/lawyer/dashboard/summary
 * Auth required (lawyer/firm/admin). Aggregates the lawyer's own workspace.
 *
 * ── Why this route was rewritten (audit 2026-08-27) ───────────────────────────
 *
 * 1. It read the WRONG TABLE for hearings and consultations. `consultations`
 *    has zero rows in production and nothing in the repo writes it; the real
 *    hearings a lawyer adds live in `service_requests` rows with
 *    `receiver = "lawyer"` and `metadata.date` (AddHearingModal), which is what
 *    /dashboard/lawyer/hearings reads back. So the overview printed «لا توجد
 *    جلسات قادمة» over hearings the hearings page was listing.
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
 * ── The one query, and why the filtering happens in JS ────────────────────────
 *
 * `service_requests` is this lawyer's whole workspace: cases, hearings, tasks,
 * manually-added clients and finance invoices all live in it as
 * `receiver: "lawyer"` rows, told apart ONLY by marker keys inside `metadata`
 * (`task`, `client`, `invoice`, `date`). Postgres/PostgREST can express those
 * as positive filters but NOT as safe negative ones: `metadata->>'task' <> 'true'`
 * evaluates to NULL — and so drops the row — for every row that has no `task`
 * key at all, i.e. for every real case. That single trap would empty
 * «القضايا النشطة» for all six lawyers with no error anywhere. So the rows are
 * fetched once and classified in JS, where "key absent" means what it looks
 * like it means.
 *
 * The window is bounded (WORKSPACE_WINDOW). If it fills, the counts computed
 * from it would be understated, so they are reported as `null` (unreadable)
 * rather than as a number that is quietly too small. Production holds 29
 * `service_requests` rows in total, so this cannot fire today; it exists so
 * that it degrades honestly rather than silently when it one day can.
 */

// Chosen to stay under the ~380-element ceiling PostgREST puts on an `in`
// list, because the payments query below filters on exactly the ids this
// window produced: cap the window and the `.in("request_id", …)` list is
// capped with it.
const WORKSPACE_WINDOW = 300;

/** Statuses that mean "this row is finished"; used by hearings and tasks. */
const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

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
  /** `YYYY-MM-DD`, exactly as AddHearingModal stored it. */
  date: string;
  time: string | null;
  /** Raw `metadata.type` token (hearing / deadline / gov_review / …). */
  type: string | null;
  urgency: string | null;
  location: string | null;
  caseName: string | null;
}

interface UrgentTaskRow {
  id: string;
  title: string;
  /** `YYYY-MM-DD` the lawyer chose, or null when they chose none. */
  dueDate: string | null;
  /** Raw `metadata.priority` token (urgent / high / normal / low). */
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

    // ── Round 1: the three independent reads ────────────────────────────────
    const [workspace, pendingConsultations, recentActivity] = await Promise.all([
      // 1. The lawyer's whole workspace, unfiltered by status: one read that
      //    feeds cases, hearings and tasks. `assigned_to` is the predicate the
      //    modals write (AddCaseModal / AddHearingModal / POST lawyer/tasks all
      //    set assignedTo = the lawyer) and it is also what keeps marketplace
      //    rows out: the SELECT policy lets a verified lawyer browse OTHER
      //    people's unassigned requests, so a query without an owner predicate
      //    would count strangers' work as this lawyer's.
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
    ]);

    if (pendingConsultations === null) degraded.push("pendingConsultations");
    if (recentActivity === null) degraded.push("recentActivity");

    // ── Classify the workspace ──────────────────────────────────────────────
    let activeCases: number | null = null;
    let recentCases: RecentCaseRow[] | null = null;
    let upcomingHearings: UpcomingHearingRow[] | null = null;
    let upcomingHearingsCount: number | null = null;
    let criticalDeadlines: UpcomingHearingRow[] | null = null;
    let criticalDeadlinesCount: number | null = null;
    let urgentTasks: UrgentTaskRow[] | null = null;
    let revenueThisMonth: number | null = null;

    if (workspace === null) {
      degraded.push("cases", "hearings", "tasks", "revenue");
    } else if (workspace.length >= WORKSPACE_WINDOW) {
      // The window filled, so anything counted from it is a floor, not a total.
      // Reporting the floor as the answer is the exact class of lie this route
      // was rewritten to stop, so report nothing instead.
      console.error(
        `[lawyer/dashboard/summary] workspace window (${WORKSPACE_WINDOW}) filled for ${uid}; counts suppressed`,
      );
      degraded.push("cases", "hearings", "tasks", "revenue");
    } else {
      const cases: WorkspaceRow[] = [];
      const hearings: UpcomingHearingRow[] = [];
      const tasks: UrgentTaskRow[] = [];

      for (const row of workspace) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const hearingDate = readString(meta, "date");
        const isTask = meta.task === true;
        // A manually-added client (POST /api/v1/lawyer/clients) and a finance
        // invoice (POST /api/v1/lawyer/finance) are both `type: "service"`
        // rows assigned to this lawyer, so without these two markers the
        // «القضايا النشطة» table listed «موكّل: فلان» and «فاتورة: فلان» as
        // if they were litigation.
        const isClient = meta.client === true;
        const isInvoice = meta.invoice === true;
        const closed = CLOSED_STATUSES.has(row.status);

        if (isTask) {
          if (!closed) {
            tasks.push({
              id: row.id,
              title: row.title || "مهمة بدون عنوان",
              dueDate: readString(meta, "dueDate"),
              priority: readString(meta, "priority"),
              category: readString(meta, "category"),
            });
          }
          continue;
        }

        // `metadata.date` is the only marker that identifies a schedule row, so
        // a row saved without one falls through to `cases` below rather than
        // being dropped. That is deliberate: an unclassifiable row should stay
        // visible under a truthful title, not vanish from the dashboard
        // entirely. (AddHearingModal now refuses to save without a date, so
        // this is a legacy-row path, not a live one.)
        if (hearingDate) {
          // Past and finished hearings are not "upcoming". `>= today` keeps a
          // hearing visible for the whole of its own day.
          if (!closed && hearingDate >= today) {
            hearings.push({
              id: row.id,
              title: row.title || "موعد بدون عنوان",
              date: hearingDate,
              time: readString(meta, "time"),
              type: readString(meta, "type"),
              urgency: readString(meta, "urgency"),
              location: readString(meta, "location"),
              caseName: readString(meta, "caseName"),
            });
          }
          continue;
        }

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

      hearings.sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));
      upcomingHearingsCount = hearings.length;
      upcomingHearings = hearings.slice(0, 3);
      // «مواعيد حرجة» is a real subset of the same rows, not a second source:
      // an appeal/final deadline (the modal's «موعد طعن / نهائي») or anything
      // the lawyer marked critical when saving it. The count travels with the
      // list: this card, unlike the hearings card, has no KPI tile beside it,
      // so without it a fifth critical deadline would be silently invisible.
      const critical = hearings.filter((h) => h.type === "deadline" || h.urgency === "critical");
      criticalDeadlinesCount = critical.length;
      criticalDeadlines = critical.slice(0, 4);

      // Soonest due first; a task with no due date has nothing to sort by and
      // goes last rather than being given an invented date.
      tasks.sort((a, b) => {
        if (a.dueDate === b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      urgentTasks = tasks.slice(0, 4);

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
