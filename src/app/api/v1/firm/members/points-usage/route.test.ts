/**
 * Owner answer ٤٤٤ (2026-11-08) — source contracts for:
 *   part 1  the firm account's OWN AI runs in /api/v1/firm/activity (never
 *           its members' runs — merging them is the later item «23»);
 *   part 2  the per-member points counter (this route, the finance card, and
 *           migration 20261108_30).
 * The routes import next/server and a Supabase session, so they are pinned
 * by source assertions (the firm/members route.test.ts technique). The pure
 * half has its own test: src/lib/services/firmMemberPoints.test.ts. The SQL
 * behaviour is proved in Docker: supabase/tests/rls/firm_member_points_1108.test.sql.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

const route = read("./route.ts");
const activity = read("../../activity/route.ts");
const finance = repo("src/app/dashboard/firm/finance/page.tsx");
const card = repo("src/app/dashboard/firm/finance/_components/MemberPointsUsageCard.tsx");
const migration = repo("supabase/migrations/20261108_30_firm_member_points_usage.sql");

test("٤٤٤ part 2: the route authorises before it reads, with the session client", () => {
  const check = route.indexOf("canViewMemberPoints(firm)");
  const rpc = route.indexOf('supabase.rpc("firm_member_points_usage", { p_firm: firm.id })');
  assert.ok(check > 0 && rpc > check, "owner/managing-partner check must come before the RPC");
  assert.ok(route.includes("resolveCallerFirm(supabase, user.id)"), "the firm is resolved server-side from the session");
  // auth.uid() is null under the service role; the function's own check needs the session
  assert.doesNotMatch(route, /createServiceClient/);
  assert.doesNotMatch(route, /from\("points_ledger"\)|from\("ai_runs"\)/);
  assert.match(route, /status: 403/);
  assert.match(route, /outcome === "unavailable"[\s\S]*available: false, members: \[\]/);
});

test("٤٤٤ part 2: migration 20261108_30 is a locked-down definer with its check inside", () => {
  assert.match(migration, /security definer\s*\n\s*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.firm_member_points_usage\(uuid\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.firm_member_points_usage\(uuid\) to authenticated, service_role;/);
  assert.match(migration, /m\.status = 'active' and m\.role = 'managing_partner'/);
  assert.match(migration, /errcode = '42501'/);
  assert.match(migration, /l\.reason in \('usage', 'usage_refund'\)/);
  assert.match(migration, /l\.created_at >= coalesce\(m\.accepted_at, m\.created_at\)/);
  assert.match(migration, /where m\.firm_id = p_firm\s*\n\s*and m\.status = 'active'/);
  // totals only: no tool / ref / e-mail column leaves the function
  const returns = /returns table \(([\s\S]*?)\)\nlanguage/.exec(migration)?.[1] ?? "";
  assert.ok(returns.includes("points_month") && returns.includes("points_total"));
  for (const leak of ["tool", "ref", "email", "input", "output"]) assert.ok(!new RegExp(`\\b${leak}\\b`).test(returns), leak);
});

test("٤٤٤ part 2: the production finance page renders the real card; the fixtures stay demo-only", () => {
  assert.match(finance, /if \(!isDemoMode\) return <FirmFinancePageLive \/>;/);
  const live = finance.slice(finance.indexOf("function FirmFinancePageLive"));
  assert.ok(live.includes("<MemberPointsUsageCard />"));
  for (const fixture of ["KPIS", "MOCK_INVOICES", "MONTHLY_DATA"]) assert.ok(!live.includes(fixture), fixture);
  assert.ok(card.includes('"/api/v1/firm/members/points-usage"'));
  // dark-safe: gray-100/200 text turns into a surface colour in dark mode
  assert.doesNotMatch(card, /text-gray-(50|100|200)\b/);
  for (const state of ['"forbidden"', '"unavailable"', '"error"', '"loading"']) assert.ok(card.includes(state), state);
});

test("٤٤٤ part 1: the firm log reads the firm ACCOUNT's own AI runs only", () => {
  assert.ok(activity.includes("readAiRunActivity(supabase, user.id, before, PAGE_SIZE)"));
  // no member fan-out: the activity route never reads the member list or another user's runs
  assert.ok(!activity.includes('.from("firm_members")'));
  assert.doesNotMatch(activity, /createServiceClient/);
  assert.doesNotMatch(activity, /\.in\("user_id"/);
  // the own runs appear even without a firm row, and paging follows both streams
  assert.match(activity, /if \(!firm\) \{[\s\S]*items: aiItems/);
  // Both streams page (final review 2026-11-08: through mergeActivityPage).
  assert.match(activity, /\{ items: eventItems, full: rows\.length === PAGE_SIZE \}/);
  assert.match(activity, /\{ items: aiItems, full: aiRes\.rows\.length === PAGE_SIZE \}/);
});
