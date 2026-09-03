#!/usr/bin/env bash
# Validate a migration against a throwaway Postgres WITH RLS enforced.
#
#   supabase/tests/rls/run.sh supabase/migrations/<file>.sql supabase/tests/rls/<name>.test.sql
#
# Why this exists: RLS does not apply to superusers, so "it ran as postgres"
# proves nothing about isolation. stubs.sql creates a non-superuser role and an
# auth.uid() driven by `set_config('test.uid', …)`, so a test script can
# impersonate any user. The stubs mirror the live policies of the tables a
# migration touches but does not create (20260518 / 20260616 / 20260625) —
# keep them in sync when those change.
#
# Phase 2 (2026-09-03) is where this caught the firm_members recursion bug
# before it reached anyone: the first SELECT as a member failed with 42P17.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="${1:?migration file}"; TEST="${2:?test file}"
NAME="nz_rls_$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done
w() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
docker cp "$(w "$HERE/stubs.sql")" "$NAME:/tmp/stubs.sql"
docker cp "$(w "$MIG")"            "$NAME:/tmp/mig.sql"
docker cp "$(w "$TEST")"           "$NAME:/tmp/test.sql"
docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/stubs.sql
echo "── migration ──"
docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/mig.sql 2>&1 | grep -v "does not exist, skipping" || true
echo "── tests (non-superuser, RLS on) ──"
docker exec "$NAME" psql -U postgres -q -f /tmp/test.sql 2>&1 \
  | grep -v "^INSERT\|^UPDATE\|^SET\|^set_config\|^$\|^DO$\|^t$\|^f$\|^[0-9a-f-]\{36\}$"
