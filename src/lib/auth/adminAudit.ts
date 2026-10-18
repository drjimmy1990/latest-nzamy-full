import { createServiceClient } from "@/lib/supabase/server";
import {
  buildAdminAuditRow,
  isMissingAuditColumn,
  type AdminActionInput,
} from "@/lib/auth/adminAuditRow";

export type { AdminActionInput } from "@/lib/auth/adminAuditRow";

/**
 * logAdminAction — the one writer of admin actions into
 * public.admin_audit_events (owner answer ٢١٠).
 *
 * A route calls it AFTER its write succeeded and before it answers. It inserts
 * with the service role: since 20261019_30 the API roles cannot write the
 * table at all, and it is append-only.
 *
 * It never throws and never changes the route's answer: a write that already
 * happened must not be reported as failed because its trace did not land. A
 * failure is logged, never swallowed.
 *
 * actor_email is looked up once per call, from auth.users (GoTrue admin API),
 * then from profiles.email. Before 20261019_30 runs the column does not exist
 * (42703 / PGRST204): the insert is retried once without it and the gap is
 * logged once per process.
 */

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

const LOG = "[adminAudit]";
let missingEmailColumnLogged = false;

export async function logAdminAction(input: AdminActionInput): Promise<void> {
  try {
    const admin = await createServiceClient();
    const actorEmail = await lookupActorEmail(admin, input.actorId);

    let { error } = await admin
      .from("admin_audit_events")
      .insert(buildAdminAuditRow(input, actorEmail));

    if (error && actorEmail && isMissingAuditColumn(error.code)) {
      if (!missingEmailColumnLogged) {
        missingEmailColumnLogged = true;
        console.warn(
          `${LOG} admin_audit_events.actor_email does not exist yet (20261019_30 not applied); writing audit rows without it`,
        );
      }
      ({ error } = await admin
        .from("admin_audit_events")
        .insert(buildAdminAuditRow(input, null)));
    }

    if (error) {
      console.error(`${LOG} insert failed for ${input.action}:`, error.code, error.message);
    }
  } catch (err) {
    console.error(
      `${LOG} logAdminAction failed for ${input.action}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** The actor's address now, or null. Never throws. */
async function lookupActorEmail(admin: ServiceClient, actorId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(actorId);
    const email = data?.user?.email;
    if (!error && typeof email === "string" && email !== "") return email;
  } catch (err) {
    console.error(`${LOG} auth lookup of the actor failed:`, err instanceof Error ? err.message : err);
  }
  try {
    const { data } = await admin.from("profiles").select("email").eq("id", actorId).maybeSingle();
    const email = (data as { email?: unknown } | null)?.email;
    return typeof email === "string" && email !== "" ? email : null;
  } catch (err) {
    console.error(`${LOG} profile lookup of the actor failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
