/**
 * viewAsCore.ts — S2 «عرض كمستخدم» (owner security ticket S2, package of
 * 17 Nov 2026): an admin sees, READ-ONLY, what one user sees — the dashboard
 * home summary, the cases list and the profile.
 *
 * How (and how not):
 *   - server-side only, with the SERVICE client, and every query filtered to
 *     the target user's id (`.eq(<owner column>, targetId)`) — never by
 *     signing in as the user or minting their token, and never by embedding
 *     the user's own pages (their fetches would run with the admin's session);
 *   - reads only: this module issues `select` and one read RPC
 *     (points_balance); viewAs.test.ts proves no insert / update / delete;
 *   - named columns, never `select("*")` on a shared table, and no
 *     `metadata` (it can carry metadata.internalNotes, the team's private
 *     note — the user never sees it, so the view must not either);
 *   - every session is logged in admin_audit_events: one `view_as_start`
 *     row, then one `view_as_page` row per page viewed, all carrying the same
 *     session id ({session_id, page, started_at}). The writer is strict
 *     (viewAsAudit.ts): no audit row → no data (503).
 *
 * Pure (type-only Supabase import, relative imports), so `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminActionInput } from "../auth/adminAuditRow.ts";

export const VIEW_AS_PAGES = ["home", "cases", "profile"] as const;
export type ViewAsPage = (typeof VIEW_AS_PAGES)[number];

export const VIEW_AS_START_ACTION = "view_as_start";
export const VIEW_AS_PAGE_ACTION = "view_as_page";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function parseViewAsPage(v: unknown): ViewAsPage | null {
  return typeof v === "string" && (VIEW_AS_PAGES as readonly string[]).includes(v) ? (v as ViewAsPage) : null;
}

/** The audit rows of one session: `start` once, `page` for every page viewed (the start page included). */
export function viewAsAuditInput(input: {
  adminId: string;
  targetId: string;
  sessionId: string;
  page: ViewAsPage;
  kind: "start" | "page";
  at: Date;
}): AdminActionInput {
  return {
    actorId: input.adminId,
    action: input.kind === "start" ? VIEW_AS_START_ACTION : VIEW_AS_PAGE_ACTION,
    targetType: "user",
    targetId: input.targetId,
    metadata: {
      session_id: input.sessionId,
      page: input.page,
      ...(input.kind === "start" ? { started_at: input.at.toISOString() } : { viewed_at: input.at.toISOString() }),
      read_only: true,
    },
  };
}

// ── what the view shows ──────────────────────────────────────────────────────

/** The client dashboard's «open» statuses (api/v1/dashboard/summary). */
export const OPEN_CASE_STATUSES = ["pending_assignment", "assigned", "in_review"] as const;

export interface ViewAsTarget {
  id: string;
  name: string | null;
  email: string | null;
  userType: string | null;
  isDemo: boolean;
}

export interface ViewAsHome {
  /** Open cases the user filed (the client dashboard's welcome line). */
  openRequested: number | null;
  /** Open cases assigned to the user (a lawyer's work). */
  openAssigned: number | null;
  /** The user's next scheduled consultation, either side. */
  nextConsultationAt: string | null;
  /** lawyer_clients the user owns. */
  clients: number | null;
  unreadNotifications: number | null;
  pointsBalance: number | null;
  plan: { name: string | null; tier: string | null; endsAt: string | null } | null;
}

export interface ViewAsCase {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  createdAt: string | null;
  /** the user's side of the case */
  side: "requester" | "assignee";
}

export interface ViewAsProfile {
  displayName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  userType: string | null;
  createdAt: string | null;
  isDemo: boolean;
  lawyer: { verificationStatus: string | null; practiceKind: string | null; marketplaceVisible: boolean | null } | null;
}

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A count from `{ count: "exact", head: true }`; null when the read failed (shown as «—», never 0). */
function countOf(r: Res): number | null {
  if (r.error) return null;
  return typeof r.count === "number" ? r.count : Array.isArray(r.data) ? r.data.length : null;
}

/** The header line: the target's name, email, type and demo flag. */
export async function readViewAsTarget(admin: SupabaseClient, targetId: string): Promise<ViewAsTarget | null> {
  // select("*"): profiles.is_demo exists only after 20261125_50; a named list
  // with it would fail on a database without the column.
  const r = (await admin.from("profiles").select("*").eq("id", targetId).maybeSingle()) as Res;
  if (r.error || !r.data) return null;
  const p = r.data as Row;
  return {
    id: targetId,
    name: str(p.display_name) ?? str(p.full_name),
    email: str(p.email),
    userType: str(p.user_type),
    isDemo: p.is_demo === true,
  };
}

export async function readViewAsHome(admin: SupabaseClient, targetId: string, now: Date): Promise<ViewAsHome> {
  const [requested, assigned, nextAsRequester, nextAsLawyer, clients, unread, points, subs] = (await Promise.all([
    admin
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_user_id", targetId)
      .in("status", [...OPEN_CASE_STATUSES]),
    admin
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", targetId)
      .in("status", [...OPEN_CASE_STATUSES]),
    admin
      .from("consultations")
      .select("scheduled_at")
      .eq("requester_user_id", targetId)
      .gt("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1),
    admin
      .from("consultations")
      .select("scheduled_at")
      .eq("lawyer_user_id", targetId)
      .gt("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1),
    admin.from("lawyer_clients").select("id", { count: "exact", head: true }).eq("owner_user_id", targetId),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetId)
      .is("read_at", null),
    admin.rpc("points_balance", { p_user: targetId }),
    admin
      .from("subscriptions")
      .select("tier, status, current_period_end, subscription_plans(name_ar)")
      .eq("user_id", targetId)
      .eq("status", "active"),
  ])) as Res[];

  const firstAt = (r: Res): string | null =>
    !r.error && Array.isArray(r.data) && r.data.length > 0 ? str((r.data[0] as Row).scheduled_at) : null;
  const next = [firstAt(nextAsRequester), firstAt(nextAsLawyer)].filter((v): v is string => v !== null).sort()[0] ?? null;

  let plan: ViewAsHome["plan"] = null;
  if (!subs.error && Array.isArray(subs.data)) {
    // an ended period is not current (getUserTier's rule); of the rest, the
    // one that ends last is the one the user is on (no end = open-ended)
    const row = (subs.data as Row[])
      .filter((s) => {
        const end = str(s.current_period_end);
        return end === null || Date.parse(end) > now.getTime();
      })
      .sort((a, b) => String(b.current_period_end ?? "9999").localeCompare(String(a.current_period_end ?? "9999")))[0];
    if (row) {
      const planRel = row.subscription_plans as Row | Row[] | null | undefined;
      const planRow = Array.isArray(planRel) ? planRel[0] : planRel;
      plan = { name: str(planRow?.name_ar), tier: str(row.tier), endsAt: str(row.current_period_end) };
    }
  }

  return {
    openRequested: countOf(requested),
    openAssigned: countOf(assigned),
    nextConsultationAt: next,
    clients: countOf(clients),
    unreadNotifications: countOf(unread),
    pointsBalance: points.error ? null : num(points.data),
    plan,
  };
}

const CASE_COLUMNS = "id, title, type, status, created_at, receiver";
const CASES_LIMIT = 50;

export async function readViewAsCases(admin: SupabaseClient, targetId: string): Promise<ViewAsCase[] | null> {
  const [mine, assigned] = (await Promise.all([
    admin
      .from("service_requests")
      .select(CASE_COLUMNS)
      .eq("requester_user_id", targetId)
      .order("created_at", { ascending: false })
      .limit(CASES_LIMIT),
    admin
      .from("service_requests")
      .select(CASE_COLUMNS)
      .eq("assigned_to", targetId)
      .order("created_at", { ascending: false })
      .limit(CASES_LIMIT),
  ])) as Res[];
  if (mine.error && assigned.error) return null;
  const seen = new Set<string>();
  const out: ViewAsCase[] = [];
  const add = (r: Res, side: ViewAsCase["side"]) => {
    if (r.error || !Array.isArray(r.data)) return;
    for (const row of r.data as Row[]) {
      const id = str(row.id);
      // an AI workspace run is not a case in any of the user's lists
      if (!id || seen.has(id) || row.receiver === "ai_workspace") continue;
      seen.add(id);
      out.push({
        id,
        title: str(row.title),
        type: str(row.type),
        status: str(row.status),
        createdAt: str(row.created_at),
        side,
      });
    }
  };
  add(mine, "requester");
  add(assigned, "assignee");
  return out.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).slice(0, CASES_LIMIT);
}

export async function readViewAsProfile(admin: SupabaseClient, targetId: string): Promise<ViewAsProfile | null> {
  const [profile, lawyer] = (await Promise.all([
    admin.from("profiles").select("*").eq("id", targetId).maybeSingle(),
    admin
      .from("lawyer_profiles")
      .select("verification_status, practice_kind, marketplace_visible")
      .eq("user_id", targetId)
      .maybeSingle(),
  ])) as Res[];
  if (profile.error || !profile.data) return null;
  const p = profile.data as Row;
  const l = !lawyer.error && lawyer.data ? (lawyer.data as Row) : null;
  return {
    displayName: str(p.display_name) ?? str(p.full_name),
    email: str(p.email),
    phone: str(p.phone),
    city: str(p.city),
    userType: str(p.user_type),
    createdAt: str(p.created_at),
    isDemo: p.is_demo === true,
    lawyer: l
      ? {
          verificationStatus: str(l.verification_status),
          practiceKind: str(l.practice_kind),
          marketplaceVisible: typeof l.marketplace_visible === "boolean" ? l.marketplace_visible : null,
        }
      : null,
  };
}

export async function readViewAsPage(
  admin: SupabaseClient,
  targetId: string,
  page: ViewAsPage,
  now: Date,
): Promise<ViewAsHome | ViewAsCase[] | ViewAsProfile | null> {
  if (page === "home") return readViewAsHome(admin, targetId, now);
  if (page === "cases") return readViewAsCases(admin, targetId);
  return readViewAsProfile(admin, targetId);
}
