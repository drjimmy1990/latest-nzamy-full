#!/usr/bin/env bash
# Same contract as run.sh, but against an already-running local PostgreSQL
# instead of a throwaway Docker container (for machines without Docker).
#
#   PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres supabase/tests/rls/run-local.sh <migration.sql> [more…] <test.sql>
#
# A fresh database is created per run and dropped afterwards, so runs are
# isolated exactly like the container. Fails closed like run.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$#" -ge 2 ] || { echo "usage: run-local.sh <migration.sql> [more…] <test.sql>" >&2; exit 2; }
: "${PGHOST:=localhost}"; : "${PGPORT:=5432}"; : "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER
TEST="${@: -1}"; MIGS=("${@:1:$#-1}")
for input in "${MIGS[@]}" "$TEST"; do
  [ -f "$input" ] || { echo "RLS input is not a readable file: $input" >&2; exit 2; }
done
DB="nz_rls_$$_$RANDOM"
cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb "$DB"
run_psql_file() {
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1 | sed '/does not exist, skipping/d'
}
run_psql_file "$HERE/stubs.sql"
i=0
for migration in "${MIGS[@]}"; do
  i=$((i + 1)); echo "── migration $i: $(basename "$migration") ──"; run_psql_file "$migration"
done
echo "── tests (non-superuser, RLS on) ──"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$TEST" 2>&1 \
  | sed -E '/^(INSERT|UPDATE|SET|set_config|DO|t|f|[0-9a-f-]{36})$/d'
