#!/usr/bin/env bash
# Validate a migration against a throwaway Postgres WITH RLS enforced.
#
#   supabase/tests/rls/run.sh supabase/migrations/<file>.sql [more migrations…] supabase/tests/rls/<name>.test.sql
#
#   Several migrations are applied in the order given (Phase 3 depends on
#   Phase 2 + Phase 5); the LAST argument is always the test file.
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
[ "$#" -ge 2 ] || { echo "usage: run.sh <migration.sql> [more.sql…] <test.sql>" >&2; exit 2; }
TEST="${@: -1}"; MIGS=("${@:1:$#-1}")
NAME="nz_rls_$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done
w() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
docker cp "$(w "$HERE/stubs.sql")" "$NAME:/tmp/stubs.sql"
i=0; for m in "${MIGS[@]}"; do i=$((i+1)); docker cp "$(w "$m")" "$NAME:/tmp/mig$i.sql"; done
docker cp "$(w "$TEST")"           "$NAME:/tmp/test.sql"
docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/stubs.sql
i=0; for m in "${MIGS[@]}"; do i=$((i+1)); echo "── migration $i: $(basename "$m") ──"
  docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f "/tmp/mig$i.sql" 2>&1 | grep -v "does not exist, skipping" || true
done
echo "── tests (non-superuser, RLS on) ──"
docker exec "$NAME" psql -U postgres -q -f /tmp/test.sql 2>&1 \
  | grep -v "^INSERT\|^UPDATE\|^SET\|^set_config\|^$\|^DO$\|^t$\|^f$\|^[0-9a-f-]\{36\}$"
