/**
 * isTestAccount.ts — is ONE account a test account? (batch l9-testinfra; the
 * analytics exclusion of owner file 19 §1ج.2).
 *
 * The same rule as public.is_test_account (20261127_80) and
 * readTestAccountIds (./testAccountIds.ts): profiles.is_demo = true, OR a row
 * in public.test_accounts — minus staff (profiles.user_type = 'admin'). Read
 * straight from the tables with the service client, so it works before any
 * SQL of this batch runs.
 *
 *   → true / false
 *   → null when it could not be read (the caller decides; the analytics
 *     route treats it as "exclude").
 * Never throws. Relative / type-only imports: `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

type Res = { data: unknown; error: { code?: string; message?: string } | null };

export function testAccountFrom(profile: { is_demo?: unknown; user_type?: unknown } | null, listed: boolean): boolean {
  if (profile?.is_demo === true) return true;
  if (profile?.user_type === "admin") return false;
  return listed;
}

export async function isTestAccountUser(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const [p, l] = (await Promise.all([
      admin.from("profiles").select("is_demo, user_type").eq("id", userId).maybeSingle(),
      admin.from("test_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
    ])) as Res[];
    let profile = p.error ? null : (p.data as { is_demo?: unknown; user_type?: unknown } | null);
    if (p.error) {
      if (!MISSING.has(p.error.code ?? "")) return null;
      // is_demo missing (before 20261125_50): read the type alone
      const t = (await admin.from("profiles").select("user_type").eq("id", userId).maybeSingle()) as Res;
      if (t.error) return null;
      profile = t.data as { user_type?: unknown } | null;
    }
    if (l.error && !MISSING.has(l.error.code ?? "")) return null;
    return testAccountFrom(profile, !l.error && !!l.data);
  } catch {
    return null;
  }
}
