#!/usr/bin/env bash
# =============================================================================
# rehearse-staging-order.sh — dry-run the plan §3 staging apply order
#
#   PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres \
#     supabase/tests/rls/rehearse-staging-order.sh
#
#   SKIP=20260921_04 supabase/tests/rls/rehearse-staging-order.sh
#     …leaves that one file out of the order, to prove the matching gate in
#     supabase/migrations/_verify.sql actually bites. Nothing else uses SKIP.
#
# WHAT THIS IS
#   A fresh throwaway PostgreSQL database is created, seeded with the harness
#   stubs + the real migrations the live project already holds, given the
#   fixtures the live project has that this chain does not (a platform_settings
#   row and a storage.objects shape), seeded with two malformed phone numbers so
#   the 20260921_04 backfill has real work, and then the apply order from
#   docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md §3 is run against it, in
#   order, stopping at the first error — exactly as the runner on staging will.
#   Exit status and the printed rc= are psql's. The database is dropped on
#   exit, whatever happens.
#
#   It reproduces, re-runnably, the ad-hoc rehearsal recorded in
#   docs/audits/2026-09-20-profiles-uat/WP1-report.md §4 — with
#   20260921_04_profiles_phone_e164_check.sql in its plan §3 position, which the
#   original ad-hoc run predated.
#
# WHAT THIS IS NOT
#   ⚠️  This is a rehearsal ON STUBS, not a substitute for a staging apply.
#   The base is supabase/tests/rls/stubs.sql plus seven real migrations, NOT the
#   live schema: the live database carries ~70 migrations, real rows, real
#   grants, real roles and a real storage stack. Passing here proves the files
#   apply in this order against a schema shaped like the parts they touch, and
#   that _verify.sql's gates fire; it does NOT prove anything about live data
#   volume, lock contention, live policies this chain does not model, or the
#   42501 that makes storage_policies_documents.sql a hand-applied side file in
#   the first place (here it runs as the owner, on staging it does not).
#   Back up, then apply on staging, then read _verify.sql's output there.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"

: "${PGHOST:=localhost}"; : "${PGPORT:=5432}"; : "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER

DB="nz_rehearse_$$_$RANDOM"
cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb "$DB"

# Shorten psql's absolute "psql:/…/file.sql:NN:" prefixes to repo-relative ones
# so a run pasted into a report is the same text on every machine, and drop the
# "does not exist, skipping" NOTICEs that `drop … if exists` emits (the same
# filter run-local.sh uses). Nothing else is filtered: every other NOTICE is a
# record of what the order did.
trim() { sed -e "s|psql:$ROOT/|psql:|g" -e '/does not exist, skipping/d'; }

psql_file() {   # $1 = banner label, $2 = path, $3… = extra psql flags.
  local label="$1" path="$2" st; shift 2
  echo "── $label"
  set +e
  psql -d "$DB" -q -v ON_ERROR_STOP=1 "$@" -f "$path" 2>&1 | trim
  st=${PIPESTATUS[0]}
  set -e
  return "$st"
}

psql_stdin() {  # $1 = banner label; SQL on stdin.
  local st
  echo "── $1"
  set +e
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1 | trim
  st=${PIPESTATUS[0]}
  set -e
  return "$st"
}

die() { echo "rc=$1 ($2)"; exit "$1"; }

# ─────────────────────────────────────────────────────────────────────────────
# 1. Base — the harness stubs, the chain steps, and the migrations the live
#    database already has. A failure here is a bug in this script, not a
#    finding about the apply order, so it aborts before the order even starts.
# ─────────────────────────────────────────────────────────────────────────────
echo "=========== BASE (stubs + the migrations the live DB already has) ==========="
BASE=(
  "$HERE/stubs.sql"
  "$HERE/prelude_profiles_rls_chain.sql"  # drops the profiles/lawyer_profiles stubs, adds the auth.users columns, creates groups/group_members
  "$HERE/prelude_entity_rls_chain.sql"    # drops the firm_profiles/firm_members stubs so 20260616 builds the real ones
  "$HERE/prelude_rehearsal_base.sql"      # public.user_settings — see that file's header for why prelude_profiles_phone.sql cannot be used here
  "$MIG/20260603_phase1_001_profiles.sql"
  "$MIG/20260614_auto_create_role_profiles.sql"
  "$MIG/20260616_production_readiness_fixes.sql"
  "$MIG/20260625_fix_rls_recursion.sql"
  "$MIG/20260616_entities_setup_and_rls_fix.sql"
  "$MIG/20260617_fix_remaining_rls.sql"
  "$MIG/20260603_phase1_003_subscriptions_billing.sql"
  "$MIG/20260903_phase2_clients_and_firm_membership.sql"
  # ── added 2026-09-22 so the 20260922_* files and their _verify.sql gates can run here.
  #    20260821 + 20260826 must precede 20260827: each CREATE OR REPLACEs handle_new_user(),
  #    and 20260827 carries the newest body (the one that copies the signup phone).
  "$MIG/20260821_fix_provider_signup_sub_role.sql"
  "$MIG/20260826_corporate_identity_persisted.sql"     # legal_rep_* columns 20260922_03 grants
  "$MIG/20260827_signup_contact_fields.sql"
  "$MIG/20260906_phase6_settings_out_of_browser.sql"   # nationality / office_address / license_issued_on
  "$MIG/20260907_phase7_profile_services_reviews.sql"  # slug / headline_ar / education
  "$MIG/20260626_legal_library_schema.sql"             # library schema 20260922_01 grants on
  "$MIG/20260627_platform_settings.sql"
  "$MIG/20260729_library_status.sql"
  "$MIG/20260730_article_regulations.sql"
  "$MIG/20260824_laws_effective_date_gregorian_columns.sql"
  "$MIG/20260911_library_laws_enactment_gazette_schema.sql"
)
for f in "${BASE[@]}"; do
  psql_file "$(basename "$f")" "$f" \
    || die $? "BASE chain failed — the plan §3 order was never reached"
done

# ─────────────────────────────────────────────────────────────────────────────
# 2. Fixtures — three things the live database has that the base chain above
#    does not model, and that the plan §3 order reads or rewrites.
# ─────────────────────────────────────────────────────────────────────────────
echo "=========== FIXTURES (live-shaped: platform_settings · storage · bad phones) ==========="

psql_stdin "fixture: platform_settings (live value: payments_gateway disabled)" <<'SQL' || die $? "fixture failed"
-- public.platform_settings comes from 20260627_platform_settings.sql, which is
-- outside this rehearsal's base chain. Shape and policies copied from it; the
-- row's VALUE is the one probed read-only on the live database on 2026-09-20
-- (appendix 06): {"status":"disabled","provider":null}. It is seeded with the
-- LIVE value on purpose — _verify.sql must be able to tell this apart from the
-- {"status":"test","provider":"stub"} that
-- _staging_only_20260916_enable_test_payment_gateway.sql would write.
create table if not exists public.platform_settings (
  key         text          primary key,
  value       jsonb         not null default '{}'::jsonb,
  description text,
  updated_by  uuid          references auth.users(id) on delete set null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists "Anyone can read platform settings" on public.platform_settings;
create policy "Anyone can read platform settings"
  on public.platform_settings for select using (true);
drop policy if exists "Admins can modify platform settings" on public.platform_settings;
create policy "Admins can modify platform settings"
  on public.platform_settings for all
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid() and profiles.user_type = 'admin'));

insert into public.platform_settings (key, value, description) values
  ('payments_gateway',
   '{"status": "disabled", "provider": null}'::jsonb,
   'حالة بوابة الدفع — القيمة الحية بتاريخ 2026-09-20')
on conflict (key) do nothing;
SQL

psql_stdin "fixture: storage.objects + storage.foldername + the permissive live policy" <<'SQL' || die $? "fixture failed"
-- storage.objects is owned by supabase_storage_admin on a real project and is
-- not created by any migration in this repo. This is the reduced shape the
-- plan §3 step 8 (supabase/storage_policies_documents.sql) and _verify.sql
-- operate on, plus the permissive rule audit 01 §3 says is live — the one the
-- side file is there to remove.
create schema if not exists storage;

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);

-- Mirrors Supabase's own storage.foldername/1: split on '/', drop the last
-- element (the file name), so 'a/b/c.pdf' → {a,b} and the owner-only policies'
-- `(storage.foldername(name))[1]` is the uid folder.
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

do $$
begin
  if storage.foldername('a/b/c.pdf') <> array['a','b'] then
    raise exception 'fixture: storage.foldername does not mirror Supabase (got %)',
      storage.foldername('a/b/c.pdf');
  end if;
end $$;

alter table storage.objects enable row level security;

-- The live-shaped permissive policy: every bucket, every command, no bucket_id
-- test at all. storage_policies_documents.sql §2 must drop this by rule.
drop policy if exists "Enable all for authenticated users" on storage.objects;
create policy "Enable all for authenticated users"
  on storage.objects for all to authenticated
  using (true) with check (true);
SQL

psql_stdin "fixture: two profiles with malformed phones (so 20260921_04 has work)" <<'SQL' || die $? "fixture failed"
-- Seeded through auth.users, i.e. the way the bad rows actually got there:
-- handle_new_user() as of 20260827 copies raw_user_meta_data->>'phone' into
-- public.profiles.phone with no format check at all.
--   1111… '0512345678'                      → salvageable, _04 section 3 normalises it
--   2222… 'letters-and-email@example.test'  → unsalvageable, _04 section 4 quarantines it
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'salvageable@example.test',
   '{"user_type":"individual","full_name":"رقم قابل للتطبيع","phone":"0512345678"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'garbage@example.test',
   '{"user_type":"individual","full_name":"رقم غير قابل للتطبيع","phone":"letters-and-email@example.test"}'::jsonb);

select id, phone as phone_before_the_order
  from public.profiles
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222')
 order by id;

do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where phone is not null and phone !~ '^\+9665[0-9]{8}$';
  if n <> 2 then
    raise exception 'fixture: expected 2 malformed phones before the order, found %', n;
  end if;
end $$;
SQL

# ─────────────────────────────────────────────────────────────────────────────
# 3. The apply order — docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md §3,
#    exactly as written there. Stops at the first error, like the runner does.
# ─────────────────────────────────────────────────────────────────────────────
ORDER=(
  "$MIG/20260906_court_costs_and_firm_profile_fields.sql"
  "$MIG/20260906_fix_subscriptions_rls_security.sql"
  "$MIG/20260914_entity_memberships_and_business_requests.sql"
  "$MIG/20260921_01_profiles_rls_lockdown.sql"
  "$MIG/20260921_02_subscriptions_write_revoke.sql"
  "$MIG/20260921_03_entity_rls_recursion_fix.sql"
  "$MIG/20260921_04_profiles_phone_e164_check.sql"
  # ── 2026-09-22 batch (review A4 / A5 / A6) — apply in this order, before the code deploy ──
  "$MIG/20260922_01_library_grants.sql"
  "$MIG/20260922_02_members_accept_own_invitation.sql"
  "$MIG/20260922_03_lawyer_provider_column_grants.sql"
  "$MIG/20260922_04_library_view_security_invoker.sql"
  "$ROOT/supabase/storage_policies_documents.sql"
  "$MIG/_verify.sql"
)

echo "=========== STAGING APPLY ORDER (plan §3)${SKIP:+ — SKIP=$SKIP} ==========="
rc=0
for f in "${ORDER[@]}"; do
  base="$(basename "$f")"
  if [ -n "${SKIP:-}" ] && [[ "$base" == *"$SKIP"* ]]; then
    echo "── $base   ⟨SKIPPED — SKIP=$SKIP⟩"
    continue
  fi
  # _verify.sql is a column of one-row report SELECTs; tuples-only keeps it to
  # one line each, which is the form WP1-report.md §4 records.
  extra=()
  [ "$base" = "_verify.sql" ] && extra=(-t -A -F' | ')
  psql_file "$base" "$f" ${extra[@]+"${extra[@]}"} || { rc=$?; break; }
done

echo "rc=$rc"

# ─────────────────────────────────────────────────────────────────────────────
# 4. What the order did to the two malformed numbers.
# ─────────────────────────────────────────────────────────────────────────────
echo "=========== post-rehearsal phone state ==========="
psql -d "$DB" -q -c "
select id,
       coalesce(phone, '(null)')                             as phone,
       coalesce(metadata->>'invalid_phone_quarantined', '-') as quarantined_original
  from public.profiles
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222')
 order by id;" 2>&1 || true

exit "$rc"
