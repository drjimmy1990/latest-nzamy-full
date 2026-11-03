/**
 * runVisibility.ts — who may see a stored AI run's output.
 *
 * "review" mode is retired (Wave 1 Task 3; slice C §3.1-3, R4): it charged at
 * start and held the result until a release that was never built. Rows
 * stored before the retirement are still "review" (charged, hidden) until
 * they are refunded by hand or Wave 3 releases them. Until then:
 *
 *   runForViewer          the owner's own row: output held from him, never
 *                         from an admin (the owner's rule: «للأدمن: يظهر
 *                         الناتج 100% دائماً»);
 *   viewerIsAdmin         the fail-closed profile read both user routes use;
 *   staffMaySeeRunOutput  another user's row through the admin route: only a
 *                         review row, only for settings.write (super_admin),
 *                         so an admin can triage refunds.
 *
 * Pure apart from viewerIsAdmin's injected client; relative imports only, so
 * `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { staffCan, type StaffRole } from "../auth/staffRoles.ts";

/**
 * A stored run as its owner may see it: a "review" row's output and citations
 * are held back unless the viewer is an admin. `viewerIsAdmin` must fail
 * closed: an unread profile is not an admin.
 */
export function runForViewer<T extends { status?: unknown; output?: unknown; citations?: unknown }>(
  run: T,
  viewerIsAdmin: boolean,
): T {
  return run.status === "review" && !viewerIsAdmin ? { ...run, output: null, citations: [] } : run;
}

/**
 * Whether the signed-in viewer is a platform admin (profiles.user_type).
 * Fails closed: a read error, no row or a throw all mean "not an admin".
 */
export async function viewerIsAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await client.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    return !error && (data as { user_type?: unknown } | null)?.user_type === "admin";
  } catch {
    return false;
  }
}

/**
 * GET /api/v1/admin/ai-runs/<id>: whether the answer carries the run's
 * output. Only a stored "review" row (to judge a refund), and only for a
 * staff role holding settings.write (super_admin). Any other status, or a
 * read-only role, gets the metadata the list already shows. The route's
 * requireStaff("settings.write") already answers 403 to operations and
 * auditor; this is the same rule again, so the output can never ride along.
 */
export function staffMaySeeRunOutput(status: unknown, role: StaffRole | null | undefined): boolean {
  return status === "review" && staffCan(role, "settings.write");
}
