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
 *   staffMaySeeRunOutput  another user's row through the admin route: only
 *                         a TEST account's run, only for settings.write
 *                         (super_admin). Owner file 03 ل11 (20 Nov 2026,
 *                         batch l12): a user's questions and answers are his
 *                         alone — «لا يطّلع عليه فريق الإدارة إلا الحسابات
 *                         التجريبية» — which replaces the earlier rule that
 *                         let a super admin read a real user's review row.
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
 * output. Only when the run's owner is a test account (isTestAccountUser —
 * profiles.is_demo or public.test_accounts, never a staff account), and only
 * for a staff role holding settings.write (super_admin). A real user's run —
 * any status, the retired "review" rows included — gives staff the metadata
 * the list already shows (tool, status, points, error code, times), never the
 * question or the answer. `runOwnerIsTestAccount` null (could not be read)
 * is "no".
 */
export function staffMaySeeRunOutput(role: StaffRole | null | undefined, runOwnerIsTestAccount: boolean | null): boolean {
  return runOwnerIsTestAccount === true && staffCan(role, "settings.write");
}
