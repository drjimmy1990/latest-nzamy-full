import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function migration(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

test("subscription hardening removes browser write policies", () => {
  const sql = migration("20260906_fix_subscriptions_rls_security.sql");
  assert.match(sql, /drop policy if exists "users create own subscriptions"/i);
  assert.match(sql, /drop policy if exists "users update own subscriptions"/i);
  assert.match(sql, /create policy "users read own subscriptions"[\s\S]*for select/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*for (insert|update)[\s\S]*subscriptions/i);
});

test("court-cost migration is transactional and enables RLS on both ledgers", () => {
  const sql = migration("20260906_court_costs_and_firm_profile_fields.sql");
  assert.match(sql, /(?:^|\n)begin;/i);
  assert.match(sql, /create table if not exists public\.court_cost_notices/i);
  assert.match(sql, /create table if not exists public\.case_disbursements/i);
  assert.match(sql, /court_cost_within_statutory_cap/i);
  assert.match(sql, /alter table public\.court_cost_notices enable row level security/i);
  assert.match(sql, /alter table public\.case_disbursements enable row level security/i);
  assert.match(sql, /commit;\s*$/im);
});

test("library enactment migration extends library.laws without a write-time clock", () => {
  const sql = migration("20260911_library_laws_enactment_gazette_schema.sql");
  assert.match(sql, /alter table library\.laws/i);
  assert.match(sql, /create or replace view library\.v_laws_enactment_status/i);
  assert.match(sql, /effective_date_gregorian/i);
  assert.doesNotMatch(sql, /alter table public\.laws/i);
  assert.doesNotMatch(sql, /update\s+library\.laws[\s\S]*current_date/i);
});

test("business ownership migration binds requests to an exact active membership", () => {
  const sql = migration("20260914_entity_memberships_and_business_requests.sql");
  assert.match(sql, /add column if not exists business_id uuid/i);
  assert.match(sql, /ensure_business_owner_membership/i);
  assert.match(sql, /business_id is not null[\s\S]*is_active_business_member\(business_id\)/i);
  assert.match(sql, /commit;/i);
});

test("stub payment enablement is never part of the automatic migration chain", () => {
  assert.throws(
    () => migration("20260916_enable_test_payment_gateway.sql"),
    /ENOENT/,
  );

  const proposal = readFileSync(
    join(
      process.cwd(),
      "supabase",
      "proposals",
      "20260916_enable_test_payment_gateway.STAGING_ONLY.sql",
    ),
    "utf8",
  );
  assert.match(proposal, /outside supabase\/migrations/i);
  assert.match(proposal, /app\.environment/i);
  assert.match(proposal, /local.*staging/i);
  assert.match(proposal, /raise exception/i);
});
