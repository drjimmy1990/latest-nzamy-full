/**
 * The pure half of logAdminAction() (./adminAudit.ts), owner answer ٢١٠: the
 * public.admin_audit_events row one admin action writes.
 *
 * Pure, with no imports, so `node --test` can load it
 * (src/lib/auth/adminRouteGates.test.ts executes it).
 */

export interface AdminActionInput {
  /** The acting admin (requireStaff's userId). */
  actorId: string;
  /** A snake_case label; the audit-log screen derives severity from its words. */
  action: string;
  targetType: string;
  /** admin_audit_events.target_id is text, so a setting key is a valid id. */
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * `before` → before_state, `after` → after_state (null when absent), actor_type
 * 'admin', and metadata `{}` when absent (the column is NOT NULL).
 *
 * actor_email (added by 20261019_30) is sent only when there is one, so a row
 * written before the migration runs carries nothing the table lacks.
 */
export function buildAdminAuditRow(
  input: AdminActionInput,
  actorEmail: string | null,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    actor_id: input.actorId,
    actor_type: "admin",
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    before_state: input.before ?? null,
    after_state: input.after ?? null,
    metadata: input.metadata ?? {},
  };
  if (typeof actorEmail === "string" && actorEmail.trim() !== "") {
    row.actor_email = actorEmail.trim();
  }
  return row;
}

/**
 * Codes meaning "admin_audit_events has no actor_email column yet": Postgres
 * 42703 (undefined column) or PostgREST PGRST204 (not in its schema cache).
 */
export function isMissingAuditColumn(code: string | undefined): boolean {
  return code === "42703" || code === "PGRST204";
}
