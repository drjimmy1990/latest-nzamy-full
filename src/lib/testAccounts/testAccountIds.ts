/**
 * testAccountIds.ts — who is a TEST ACCOUNT, for the admin numbers (batch l7,
 * decision 3: a test account's payments, rows and sign-up never count in
 * revenue, reports or the admin KPIs).
 *
 * The rule mirrors public.is_test_account (20261127_80):
 *   profiles.is_demo = true, OR a row in public.test_accounts — minus staff
 *   (profiles.user_type = 'admin': admin@ sits in test_accounts from the
 *   20261017_44 backfill, and staff are never treated as test accounts).
 *
 * Read with the service client, straight from the tables (not the SQL
 * function), so it works BEFORE 20261127_80 runs. A missing table / column
 * (42P01 / PGRST205 / 42703 / PGRST204) reads as "nobody from that source";
 * any other error marks the set incomplete (`complete: false`) so a page can
 * say its numbers may still include test accounts. Never throws.
 *
 * Pure apart from the reads: relative / type-only imports, so `node --test`
 * loads it (testAccountIds.test.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TestAccountIds {
  ids: ReadonlySet<string>;
  /** false when a read failed for another reason than a missing table/column. */
  complete: boolean;
}

/** The set: demo ∪ listed, minus admins. */
export function testAccountIdSet(input: {
  demoIds: Iterable<string>;
  listedIds: Iterable<string>;
  adminIds: Iterable<string>;
}): Set<string> {
  const admins = new Set(input.adminIds);
  const out = new Set<string>();
  for (const id of input.demoIds) if (id) out.add(id);
  for (const id of input.listedIds) if (id && !admins.has(id)) out.add(id);
  return out;
}

/** True for the row of a test account (row.user_id / any id) — a filter helper. */
export function isTestAccountId(set: ReadonlySet<string>, id: unknown): boolean {
  return typeof id === "string" && set.has(id);
}

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

type Res = { data: unknown; error: { code?: string; message?: string } | null };

function idsOf(res: Res, key: string): { ids: string[]; ok: boolean; missing: boolean } {
  if (res.error) {
    if (MISSING.has(res.error.code ?? "")) return { ids: [], ok: true, missing: true };
    return { ids: [], ok: false, missing: false };
  }
  const rows = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : [];
  return {
    ids: rows.map((r) => r[key]).filter((v): v is string => typeof v === "string" && v.length > 0),
    ok: true,
    missing: false,
  };
}

const EMPTY: TestAccountIds = Object.freeze({ ids: new Set<string>(), complete: false });

export async function readTestAccountIds(admin: SupabaseClient): Promise<TestAccountIds> {
  try {
    const [demo, listed] = (await Promise.all([
      admin.from("profiles").select("id").eq("is_demo", true).limit(5000),
      admin.from("test_accounts").select("user_id").limit(5000),
    ])) as Res[];
    const d = idsOf(demo, "id");
    const l = idsOf(listed, "user_id");
    let adminIds: string[] = [];
    let adminsOk = true;
    if (l.ids.length > 0) {
      const a = idsOf(
        (await admin.from("profiles").select("id").eq("user_type", "admin").in("id", l.ids)) as Res,
        "id",
      );
      adminIds = a.ids;
      // without the admin read a listed admin would be dropped from the KPIs: treat as incomplete
      adminsOk = a.ok && !a.missing;
    }
    const complete = d.ok && l.ok && adminsOk;
    if (!complete) console.error("[testAccounts] reading the test-account list failed; admin numbers may include test accounts");
    // a listed account whose admin check failed stays OUT of the set (never hide a real admin's numbers)
    return {
      ids: testAccountIdSet({ demoIds: d.ids, listedIds: adminsOk ? l.ids : [], adminIds }),
      complete,
    };
  } catch (err) {
    console.error("[testAccounts] the read threw:", err instanceof Error ? err.message : "unknown");
    return { ids: new Set<string>(), complete: EMPTY.complete };
  }
}
