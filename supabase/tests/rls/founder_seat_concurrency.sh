#!/usr/bin/env bash
# founder_seat_concurrency.sh — S10-a (owner package 17 Nov, required security
# test): 1,100 founder seat reservations by 1,100 different verified
# advocates, fired CONCURRENTLY against capacity 1096 → exactly 1096 seats,
# no oversell.
#
# Usage (Git Bash, from the repo root):
#   bash supabase/tests/rls/founder_seat_concurrency.sh
# Env: CLIENTS (default 25 parallel sessions), PG_IMAGE (default postgres:16-alpine).
#
# How: the same throwaway container as run.sh (stubs.sql, then the founder
# chain of founder_l2_2026_11_17.test.sql up to 20261124_10 — the LIVE
# founder_reserve_seat, 15-minute hold), then
# prelude_founder_seat_concurrency_setup.sql (1,100 users + orders, window
# open, capacity 1096), then pgbench: CLIENTS sessions × 1100/CLIENTS
# transactions, each one SELECT s10_attempt() = founder_reserve_seat for the
# next distinct pair (a sequence), in its own transaction. Then
# founder_seat_concurrency.test.sql asserts the outcome (raises on failure).
# The script prints how many backends really ran attempts and the time span,
# so the overlap is visible, not assumed. Fails closed like run.sh.
# NEGATIVE_CONTROL=1 removes the function's advisory lock before the burst:
# the run must then FAIL (oversell), proving the assertions can see a race.
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/supabase/migrations"
T="$HERE"
CLIENTS="${CLIENTS:-25}"
TOTAL=1100
if [ $((TOTAL % CLIENTS)) -ne 0 ]; then
  echo "CLIENTS must divide $TOTAL (e.g. 20, 22, 25, 44, 50)" >&2
  exit 2
fi
PER=$((TOTAL / CLIENTS))

CHAIN=(
  "$T/prelude_lawyer_profiles_live.sql"
  "$T/prelude_signup_metadata_live.sql"
  "$M/20260921_04_profiles_phone_e164_check.sql"
  "$M/20261016_10_lawyer_profiles_select_column_lock.sql"
  "$M/20260627_platform_settings.sql"
  "$M/20261019_10_library_access_grants.sql"
  "$M/20261019_20_lawyer_practice_kind.sql"
  "$M/20261021_50_founder_campaign.sql"
  "$M/20261026_01_founder_no_signup_grant.sql"
  "$M/20260603_phase1_003_subscriptions_billing.sql"
  "$M/20261022_10_payments_core.sql"
  "$T/prelude_points_lots_fixture.sql"
  "$M/20261022_20_points_lots.sql"
  "$M/20261022_30_claim_payment_order.sql"
  "$M/20261027_10_ai_runs.sql"
  "$M/20261030_65_library_grant_admin.sql"
  "$M/20261101_10_founder_membership.sql"
  "$M/20261107_60_founder_rejoinder_410.sql"
  "$M/20261122_10_founder_campaign_nov18.sql"
  "$M/20261124_10_founder_hold_15min_and_library_points.sql"
  "$T/prelude_founder_seat_concurrency_setup.sql"
)
for f in "${CHAIN[@]}" "$T/founder_seat_concurrency.pgbench.sql" "$T/founder_seat_concurrency.test.sql"; do
  [ -f "$f" ] || { echo "missing input: $f" >&2; exit 2; }
done

NAME="nz_s10_$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw "${PG_IMAGE:-postgres:16-alpine}" -c max_connections=200 >/dev/null
ready=0
for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "Timed out waiting for the Postgres container." >&2; exit 1; }
# pg_isready can answer during the image's init restart; wait for a real query
for _ in $(seq 1 20); do
  docker exec "$NAME" psql -U postgres -qtAc "select 1" >/dev/null 2>&1 && break
  sleep 1
done

w() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

run_file() {
  docker cp "$(w "$1")" "$NAME:/tmp/in.sql"
  docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/in.sql 2>&1 \
    | sed -E '/does not exist, skipping/d; /^(INSERT|UPDATE|DELETE|SET|DO|CREATE|t|f|[0-9a-f-]{36})( [0-9]+)*$/d'
}

run_file "$HERE/stubs.sql"
i=0
for f in "${CHAIN[@]}"; do
  i=$((i + 1))
  echo "── $i: $(basename "$f") ──"
  run_file "$f"
done

if [ "${NEGATIVE_CONTROL:-0}" = "1" ]; then
  # RED check: the same function WITHOUT its advisory lock must oversell (or
  # the test proves nothing). Expect the assertions below to FAIL.
  echo "── NEGATIVE CONTROL: founder_reserve_seat without pg_advisory_xact_lock ──"
  docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -c "do \$\$ declare d text := pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure); begin if strpos(d, 'pg_advisory_xact_lock') = 0 then raise exception 'no lock to remove'; end if; execute replace(d, 'perform pg_advisory_xact_lock(hashtext(''founder_seats:founder-2026''));', ''); if strpos(pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), 'pg_advisory_xact_lock') > 0 then raise exception 'lock still there'; end if; end \$\$;"
fi

echo "── pgbench: $CLIENTS concurrent sessions × $PER attempts = $TOTAL ──"
docker cp "$(w "$T/founder_seat_concurrency.pgbench.sql")" "$NAME:/tmp/attempt.sql"
docker exec "$NAME" pgbench -U postgres -n -c "$CLIENTS" -j 4 -t "$PER" -f /tmp/attempt.sql postgres 2>&1 \
  | grep -E "number of (clients|transactions|failed)|tps|latency average" || true

echo "── overlap evidence ──"
docker exec "$NAME" psql -U postgres -qtAc \
  "select 'backends that ran attempts: ' || count(distinct pid) || ', span ' ||
          round(extract(epoch from max(at) - min(at))::numeric * 1000) || ' ms, attempts ' || count(*)
     from public.s10_results"

echo "── assertions ──"
run_file "$T/founder_seat_concurrency.test.sql"
echo "S10-a PASS"
