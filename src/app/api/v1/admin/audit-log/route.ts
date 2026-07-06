import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * Severity derivation from an action name.
 * Mirrors the client mock's three-level model (info | warning | critical).
 * The table has no severity column, so we classify by action keyword.
 */
type Severity = "info" | "warning" | "critical";

const CRITICAL_KEYWORDS = [
  "suspend",
  "delete",
  "impersonate",
  "ban",
  "revoke",
  "failed",
  "purge",
  "wipe",
  "destroy",
];
const WARNING_KEYWORDS = [
  "approve",
  "reject",
  "cancel",
  "release",
  "refund",
  "update",
  "disable",
  "enable",
  "grant",
  "moderate",
  "escrow",
];

function deriveSeverity(action: string): Severity {
  const a = (action ?? "").toLowerCase();
  if (CRITICAL_KEYWORDS.some((k) => a.includes(k))) return "critical";
  if (WARNING_KEYWORDS.some((k) => a.includes(k))) return "warning";
  return "info";
}

/**
 * GET /api/v1/admin/audit-log — List admin audit events (read-only).
 * Query params:
 *   - action   (filter by exact action string)
 *   - severity ('info' | 'warning' | 'critical' — derived, filtered in memory)
 *   - limit    (default 200)
 *
 * Requires: authenticated admin user. Uses the service-role client because
 * admin_audit_events has no user-facing SELECT policy (blocked by RLS).
 * Resilient: on any failure returns { data: [] } (200) so the page degrades.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const severity = searchParams.get("severity") as Severity | null;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 500);

    const admin = await createServiceClient();

    let query = admin
      .from("admin_audit_events")
      .select(
        "id, actor_id, actor_type, action, target_type, target_id, before_state, after_state, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action) {
      query = query.eq("action", action);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error(
        "[admin/audit-log GET] Supabase error:",
        error.message,
        error.details,
        error.hint,
        error.code,
      );
      return NextResponse.json({ data: [] });
    }

    const rows = (events ?? []) as Array<Record<string, unknown>>;

    // ── Resolve actor display names in a second query, then map ───────────────
    const actorIds = Array.from(
      new Set(
        rows
          .map((r) => r.actor_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );

    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, display_name_en")
        .in("id", actorIds);
      (profiles ?? []).forEach((p: Record<string, unknown>) => {
        const id = p.id as string;
        const name =
          (p.display_name as string) || (p.display_name_en as string) || "";
        if (id) actorNames.set(id, name);
      });
    }

    const data = rows.map((r) => {
      const derived = deriveSeverity(r.action as string);
      const actorId = typeof r.actor_id === "string" ? r.actor_id : null;
      const actorType = (r.actor_type as string) ?? "user";
      const actorName = actorId ? actorNames.get(actorId) ?? "" : "";

      return {
        id: r.id,
        actor_id: actorId,
        actor_type: actorType,
        actor_name: actorName,
        action: r.action,
        target_type: r.target_type ?? null,
        target_id: r.target_id ?? null,
        before_state: r.before_state ?? null,
        after_state: r.after_state ?? null,
        metadata: r.metadata ?? {},
        severity: derived,
        created_at: r.created_at,
      };
    });

    // Severity is derived, so filter it in memory after mapping.
    const filtered =
      severity && ["info", "warning", "critical"].includes(severity)
        ? data.filter((d) => d.severity === severity)
        : data;

    return NextResponse.json({ data: filtered });
  } catch (err) {
    console.error("[admin/audit-log GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}
