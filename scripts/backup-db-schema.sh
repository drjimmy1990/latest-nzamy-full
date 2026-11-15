#!/usr/bin/env bash
# =============================================================================
# backup-db-schema.sh — Pre-change PostgreSQL schema snapshot for نظامي (VPS)
#
# Takes a complete, read-only, SHA-256 verified schema backup of the live
# database BEFORE applying any migration or schema change, stored OUTSIDE the
# git worktree so it is never lost on git operations and never committed.
#
# USAGE ON THE PRODUCTION VPS (zero config — uses Docker container `supabase-db`):
#   npm run db:backup-schema
#   # or directly:
#   bash scripts/backup-db-schema.sh
#
# OPTIONAL FLAGS:
#   --container <name>      Docker container name (default: ${SUPABASE_DB_CONTAINER:-supabase-db})
#   --db-url <uri>          Use direct/pooler PostgreSQL URI instead of docker exec
#   --env-file <path>       Load SUPABASE_DB_URL from an env file
#   -o, --out <dir>         Output folder (default: $HOME/nzamy-schema-backups/schema-<timestamp>)
#   --allow-inside-repo     Allow writing inside a git work tree (not recommended)
#   --dry-run               Validate flags, output directory, and print the backup plan without DB I/O
#
# WHAT IT SAVES:
#   00-server-info.txt          PostgreSQL version, extensions, schemas, roles, triggers, RLS posture
#   01-row-counts.csv           Live row counts across all schemas before migration
#   02-extras.sql               Auth/storage triggers, storage buckets/policies, realtime tables
#   10-full-user-schemas.sql    Full pg_dump --schema-only of all user schemas + supabase_migrations
#   11-schema-<name>.sql        Individual per-schema dumps (public, library, library_graph, academy, ...)
#   20-selfhost-ready-schema.sql Idempotent restore-ready bundle (pgcrypto, uuid-ossp, vector + schemas)
#   SHA256SUMS.txt              Cryptographic SHA-256 checksums of every generated file
#   MANIFEST.txt                Metadata, git commit, sizes, and exact one-line restore instructions
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
SELFHOST_SQL_DIR="$HERE/selfhost/sql"

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_URL="${SUPABASE_DB_URL:-}"
ENV_FILE=""
OUT_DIR=""
ALLOW_INSIDE_REPO=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --db-url) DB_URL="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -o|--out) OUT_DIR="$2"; shift 2 ;;
    --allow-inside-repo) ALLOW_INSIDE_REPO=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$DB_URL" ] && [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || { echo "Env file not found: $ENV_FILE" >&2; exit 2; }
  DB_URL="$(grep -E '^\s*SUPABASE_DB_URL\s*=' "$ENV_FILE" | tail -1 | sed -E 's/^\s*SUPABASE_DB_URL\s*=\s*//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/\s+$//')"
  DB_URL="${DB_URL//$'\r'/}"
fi

MODE="docker"
SOURCE_LABEL="docker:${CONTAINER} (${DB_USER}@${DB_NAME})"
if [ -n "$DB_URL" ]; then
  MODE="url"
  DB_URL="${DB_URL//$'\r'/}"
  SOURCE_LABEL="$(printf '%s' "$DB_URL" | sed -E 's#://([^:/@]+):[^@]*@#://\1:****@#')"
fi

TS="$(date +%Y%m%d-%H%M%S)"
BASE_PARENT="${HOME:-/root}/nzamy-schema-backups"
[ -n "$OUT_DIR" ] || OUT_DIR="$BASE_PARENT/schema-$TS"

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

if [ "$ALLOW_INSIDE_REPO" -eq 0 ] && command -v git >/dev/null 2>&1 && git -C "$OUT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  rmdir "$OUT_DIR" 2>/dev/null || true
  echo "Refusing to write schema backup inside a git work tree ($OUT_DIR). Use default (\$HOME/nzamy-schema-backups) or pass -o <dir outside repo>." >&2
  exit 2
fi

COMMON_DUMP_FLAGS=(
  --schema-only
  --no-owner
  --quote-all-identifiers
  --no-publications
  --no-subscriptions
  --no-security-labels
  --no-tablespaces
)

if [ "$DRY_RUN" -eq 1 ]; then
  echo "== backup-db-schema.sh [DRY RUN]"
  echo "   source : $SOURCE_LABEL"
  echo "   output : $OUT_DIR"
  echo "   files  : 00-server-info.txt, 01-row-counts.csv, 02-extras.sql, 10-full-user-schemas.sql, 11-schema-<name>.sql, 20-selfhost-ready-schema.sql, SHA256SUMS.txt, MANIFEST.txt"
  echo "   flags  : pg_dump ${COMMON_DUMP_FLAGS[*]}"
  exit 0
fi

LOG="$OUT_DIR/backup.log"
exec > >(tee -a "$LOG") 2>&1

echo "== backup-db-schema.sh  $(date -Is)"
echo "   source : $SOURCE_LABEL"
echo "   output : $OUT_DIR"

export PGCLIENTENCODING=UTF8

run_psql_query() {
  local sql="$1"
  shift
  if [ "$MODE" = "docker" ]; then
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -X -v ON_ERROR_STOP=1 "$@" -c "$sql"
  else
    psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@" -c "$sql"
  fi
}

run_psql_stdin() {
  local sql_file="$1"
  shift
  if [ "$MODE" = "docker" ]; then
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -X -q -v ON_ERROR_STOP=1 "$@" < "$sql_file"
  else
    psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@" -f "$sql_file"
  fi
}

run_pg_dump() {
  if [ "$MODE" = "docker" ]; then
    docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" "${COMMON_DUMP_FLAGS[@]}" "$@"
  else
    pg_dump "$DB_URL" "${COMMON_DUMP_FLAGS[@]}" "$@"
  fi
}

# ---------- preflight checks --------------------------------------------------
if [ "$MODE" = "docker" ]; then
  command -v docker >/dev/null 2>&1 || { echo "docker not found in PATH" >&2; exit 3; }
  docker inspect "$CONTAINER" >/dev/null 2>&1 || {
    echo "Docker container '$CONTAINER' not found. Pass --container <name> or --db-url <uri>." >&2
    exit 3
  }
else
  for bin in psql pg_dump; do
    command -v "$bin" >/dev/null 2>&1 || { echo "$bin not found in PATH" >&2; exit 3; }
  done
fi

SERVER_VERSION="$(run_psql_query "SHOW server_version;" -At)"
echo "   server : PostgreSQL $SERVER_VERSION"

# ---------- 00: server info & extensions --------------------------------------
echo "-- [1/6] exporting server info, extensions & roles -> 00-server-info.txt"
if [ -f "$SELFHOST_SQL_DIR/00-server-info.sql" ]; then
  run_psql_stdin "$SELFHOST_SQL_DIR/00-server-info.sql" > "$OUT_DIR/00-server-info.txt"
else
  run_psql_query "
    SELECT 'server_version', current_setting('server_version');
    SELECT extname, extversion, n.nspname AS schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     ORDER BY extname;
    SELECT nspname AS schema_name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' ORDER BY nspname;
  " > "$OUT_DIR/00-server-info.txt"
fi

# ---------- 01: row counts snapshot -------------------------------------------
echo "-- [2/6] exporting pre-change table row counts -> 01-row-counts.csv"
if [ -f "$SELFHOST_SQL_DIR/01-row-counts.sql" ]; then
  run_psql_stdin "$SELFHOST_SQL_DIR/01-row-counts.sql" --csv > "$OUT_DIR/01-row-counts.csv"
else
  run_psql_query "
    SELECT schemaname, relname AS tablename, n_live_tup AS approx_rows
      FROM pg_stat_user_tables
     ORDER BY schemaname, relname
  " --csv > "$OUT_DIR/01-row-counts.csv"
fi

# ---------- 02: auth/storage/realtime extras ----------------------------------
echo "-- [3/6] exporting auth/storage triggers & policies -> 02-extras.sql"
if [ -f "$SELFHOST_SQL_DIR/02-export-extras.sql" ]; then
  run_psql_stdin "$SELFHOST_SQL_DIR/02-export-extras.sql" -A -t > "$OUT_DIR/02-extras.sql"
else
  echo "-- 02-export-extras.sql not present; skipped" > "$OUT_DIR/02-extras.sql"
fi

# ---------- discover all user schemas (+ library_graph, academy, etc.) --------
USER_SCHEMAS="$(run_psql_query "
  SELECT string_agg(nspname, ' ' ORDER BY nspname)
    FROM pg_namespace
   WHERE nspname NOT IN (
     'auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
     'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
     'pgbouncer','cron','pgtle','_analytics','_supavisor','repack','information_schema'
   )
     AND nspname NOT LIKE 'pg\_%'
" -At)"

echo "   schemas: $USER_SCHEMAS (+ supabase_migrations)"

SCHEMA_ARGS=()
for s in $USER_SCHEMAS supabase_migrations; do
  SCHEMA_ARGS+=(-n "$s")
done

# ---------- 10: full combined schema dump -------------------------------------
echo "-- [4/6] dumping combined user schemas -> 10-full-user-schemas.sql"
run_pg_dump "${SCHEMA_ARGS[@]}" > "$OUT_DIR/10-full-user-schemas.sql"

# ---------- 11: individual per-schema dumps -----------------------------------
echo "-- [5/6] dumping individual per-schema files -> 11-schema-*.sql"
for s in $USER_SCHEMAS supabase_migrations; do
  if [ -n "$(run_psql_query "SELECT 1 FROM pg_namespace WHERE nspname = '$s'" -At)" ]; then
    run_pg_dump -n "$s" > "$OUT_DIR/11-schema-${s}.sql"
  fi
done

# ---------- 20: selfhost-ready idempotent bundle ------------------------------
selfhostify() {
  sed -E \
    -e '/^\\(un)?restrict /d' \
    -e 's/^SET transaction_timeout = 0;$/-- SET transaction_timeout = 0;  -- removed for PG15\/16 compatibility/' \
    -e 's/^CREATE SCHEMA "([A-Za-z0-9_]+)";$/CREATE SCHEMA IF NOT EXISTS "\1";/' \
    -e 's/^(ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin".*)$/-- \1/' \
    -e '/^GRANT /{s/,MAINTAIN//g; s/MAINTAIN,//g}' \
    -e 's/^GRANT MAINTAIN ON (.*)$/-- GRANT MAINTAIN ON \1/' \
    "$1"
}

echo "-- [6/6] assembling idempotent restore bundle -> 20-selfhost-ready-schema.sql"
{
  echo "-- 20-selfhost-ready-schema.sql — assembled $(date -Is) from PostgreSQL $SERVER_VERSION ($SOURCE_LABEL)"
  echo "-- Restore on VPS Docker:"
  echo "--   docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 --single-transaction < \"$OUT_DIR/20-selfhost-ready-schema.sql\""
  echo
  echo "create extension if not exists pgcrypto with schema extensions;"
  echo "create extension if not exists \"uuid-ossp\" with schema extensions;"
  echo "create extension if not exists vector with schema extensions;"
  echo
  echo "-- ===================== 10-full-user-schemas.sql ====================="
  selfhostify "$OUT_DIR/10-full-user-schemas.sql"
  echo
  echo "-- ===================== 02-extras.sql ====================="
  cat "$OUT_DIR/02-extras.sql"
} > "$OUT_DIR/20-selfhost-ready-schema.sql"

# ---------- checksums & manifest ----------------------------------------------
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  fi
}

(
  cd "$OUT_DIR"
  find . -maxdepth 1 -type f ! -name SHA256SUMS.txt ! -name MANIFEST.txt ! -name backup.log | sort | while read -r f; do
    clean="${f#./}"
    printf '%s  %s\n' "$(hash_file "$clean")" "$clean"
  done
) > "$OUT_DIR/SHA256SUMS.txt"

GIT_REV="unknown"
if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --short HEAD >/dev/null 2>&1; then
  GIT_REV="$(git -C "$REPO_ROOT" rev-parse --short HEAD) ($(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached))"
fi

{
  echo "نظامي (Nzamy) Database Schema Backup — $(date -Is)"
  echo "source     : $SOURCE_LABEL"
  echo "postgres   : $SERVER_VERSION"
  echo "git commit : $GIT_REV"
  echo "schemas    : $USER_SCHEMAS (+ supabase_migrations)"
  echo "directory  : $OUT_DIR"
  echo
  echo "VERIFY CHECKSUMS:"
  echo "  (cd \"$OUT_DIR\" && sha256sum -c SHA256SUMS.txt)"
  echo
  echo "INSPECT OR RESTORE A SINGLE SCHEMA (example: library):"
  echo "  less \"$OUT_DIR/11-schema-library.sql\""
  echo
  echo "FULL SCHEMA RESTORE (onto a fresh self-hosted Supabase Postgres):"
  echo "  docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 --single-transaction < \"$OUT_DIR/20-selfhost-ready-schema.sql\""
  echo
  echo "FILES & SHA-256:"
  cat "$OUT_DIR/SHA256SUMS.txt"
} > "$OUT_DIR/MANIFEST.txt"

# Update `latest` symlink when parent is default backup root
if [ "$(dirname "$OUT_DIR")" = "$BASE_PARENT" ]; then
  ln -sfn "$OUT_DIR" "$BASE_PARENT/latest" 2>/dev/null || true
fi

echo
echo "== Schema backup complete!"
echo "   saved to : $OUT_DIR"
echo "   manifest : $OUT_DIR/MANIFEST.txt"
