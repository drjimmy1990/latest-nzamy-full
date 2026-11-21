/**
 * viewAsTestOnly.ts — owner answer ١٠٨ (20 Nov 2026, batch l12):
 * «العرض للقراءة للحسابات التجريبية فقط». «عرض كمستخدم» opens ONLY a test
 * account — public.is_test_account(uuid) (20261127_80): profiles.is_demo, or
 * a row in public.test_accounts that is not staff. A real user's data is
 * never shown through it, whoever the admin is.
 *
 * The predicate is the database's own (service role only). A read that fails
 * — the function missing, a network error, anything not a literal boolean —
 * answers "not a test account": the view stays shut (fail closed).
 *
 * Pure apart from the client it is handed (type-only import), so `node --test`
 * runs it with a stub.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const VIEW_AS_TEST_ONLY_AR =
  "«عرض كمستخدم» متاح للحسابات التجريبية وحدها؛ لا تُعرض بيانات مستخدم حقيقي.";

export const VIEW_AS_TEST_ONLY_CODE = "view_as_test_accounts_only";

/** True only when the database says this account is a test account. */
export async function isTestAccountForViewAs(
  admin: Pick<SupabaseClient, "rpc">,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("is_test_account", { p_user: userId });
    if (error) {
      console.error("[view-as] is_test_account failed:", error.code);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("[view-as] is_test_account threw:", err instanceof Error ? err.name : "error");
    return false;
  }
}
