#!/usr/bin/env bash
# Validate migrations against throwaway Postgres with RLS enforced.
#
# Usage:
#   supabase/tests/rls/run.sh <migration.sql> [more migrations…] <test.sql>
#
# The last argument is always the RLS assertion script. RLS does not apply to
# superusers; stubs.sql creates a non-superuser role and auth.uid() controlled
# through set_config('test.uid', …), so assertions exercise actual isolation.
# This runner deliberately fails closed: a failed copy, container readiness
# check, migration, or SQL assertion exits non-zero.
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$#" -ge 2 ] || {
  echo "usage: run.sh <migration.sql> [more migrations…] <test.sql>" >&2
  exit 2
}

TEST="${@: -1}"
MIGS=("${@:1:$#-1}")
NAME="nz_rls_$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for input in "${MIGS[@]}" "$TEST"; do
  [ -f "$input" ] || {
    echo "RLS input is not a readable file: $input" >&2
    exit 2
  }
done

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
ready=0
for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "Timed out waiting for the isolated RLS Postgres container." >&2
  exit 1
fi

w() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    echo "$1"
  fi
}

docker cp "$(w "$HERE/stubs.sql")" "$NAME:/tmp/stubs.sql"
i=0
for migration in "${MIGS[@]}"; do
  i=$((i + 1))
  docker cp "$(w "$migration")" "$NAME:/tmp/mig$i.sql"
done
docker cp "$(w "$TEST")" "$NAME:/tmp/test.sql"

run_psql_file() {
  # sed is intentional: grep returns 1 when a successful psql run has no
  # remaining output after filtering. With pipefail, psql failures still fail.
  docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f "$1" 2>&1 \
    | sed '/does not exist, skipping/d'
}

run_psql_file /tmp/stubs.sql
i=0
for migration in "${MIGS[@]}"; do
  i=$((i + 1))
  echo "── migration $i: $(basename "$migration") ──"
  run_psql_file "/tmp/mig$i.sql"
done

echo "── tests (non-superuser, RLS on) ──"
docker exec "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/test.sql 2>&1 \
  | sed -E '/^(INSERT|UPDATE|SET|set_config|DO|t|f|[0-9a-f-]{36})$/d'
