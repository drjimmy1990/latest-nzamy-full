#!/usr/bin/env bash
# =============================================================================
# backup-supabase.sh — logical backup of the نظامي Supabase project
#                      + self-host-ready copies of every file
#
#   Runs on Linux/macOS (the VPS, WSL). Windows users: backup-supabase.ps1.
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require' \
#     ./backup-supabase.sh                      # full backup (schema + data)
#   ./backup-supabase.sh --env-file ../../.env.local   # read SUPABASE_DB_URL from a .env file instead
#   ./backup-supabase.sh --schema-only          # no data files
#   ./backup-supabase.sh -o /srv/backups/nzamy  # choose the output directory
#
# WHAT IT NEEDS
#   * pg_dump + psql whose MAJOR version >= the server's (a 17.x client dumps 15/16/17 servers).
#     Ubuntu/Debian:  sudo apt install postgresql-client-17   (needs the PGDG apt repo for 17;
#                     the stock postgresql-client-16 is fine when the server is 15 or 16).
#   * The "Session pooler" connection string (port 5432 on *.pooler.supabase.com) — the direct
#     db.<ref>.supabase.co host is IPv6-only, and the transaction pooler (6543) cannot run pg_dump.
#
# WHAT IT WRITES  (default: $HOME/nzamy-backups/supabase-<timestamp>/ — deliberately OUTSIDE the repo)
#   00-server-info.txt   facts about the source (versions, extensions, schemas, roles, triggers…)     — safe to share
#   01-row-counts.csv    exact row count per table                                                     — safe to share
#   02-extras.sql        auth/storage triggers, buckets, storage policies, realtime members (idempotent)— safe to share
#   10-schema.sql        schema-only dump of the user schemas (+ supabase_migrations)                   — safe to share
#   20-data.sql          data-only dump of the user schemas (+ supabase_migrations)                     — PRIVATE (user data)
#   21-auth-data.sql     data-only dump of auth.users/identities/mfa_factors/sso/saml/instances        — PRIVATE (password hashes)
#   selfhost/01-schema.sql, 02-auth-data.sql, 03-data.sql
#                        the same files post-processed so a self-hosted Supabase accepts them as-is
#   MANIFEST.txt         sizes + sha256 of everything, and which files are safe to send
#   backup.log           this run's console output
#
# It never modifies the source database (pg_dump/psql read only).
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$HERE/sql"

ENV_FILE=""; OUT_DIR=""; SCHEMA_ONLY=0; ALLOW_INSIDE_REPO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -o|--out) OUT_DIR="$2"; shift 2 ;;
    --schema-only) SCHEMA_ONLY=1; shift ;;
    --allow-inside-repo) ALLOW_INSIDE_REPO=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ---------- connection string (never printed) ---------------------------------
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE" >&2; exit 2; }
  SUPABASE_DB_URL="$(grep -E '^\s*SUPABASE_DB_URL\s*=' "$ENV_FILE" | tail -1 | sed -E 's/^\s*SUPABASE_DB_URL\s*=\s*//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/\s+$//')"
fi
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  cat >&2 <<'MSG'
SUPABASE_DB_URL is not set.
  Dashboard -> Connect -> "Session pooler" -> copy the URI and put the real password in it, then either
    export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
  or add that line (SUPABASE_DB_URL=...) to .env.local and pass --env-file .env.local
  Special characters in the password must be percent-encoded (@ -> %40, # -> %23, / -> %2F, ? -> %3F, : -> %3A, % -> %25).
MSG
  exit 2
fi
# tolerate CRLF env files (docker --env-file passes a trailing CR through) and stray quotes/spaces
SUPABASE_DB_URL="${SUPABASE_DB_URL//$'\r'/}"
SUPABASE_DB_URL="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
case "$SUPABASE_DB_URL" in
  *sslmode=*) : ;;
  *\?*) SUPABASE_DB_URL="${SUPABASE_DB_URL}&sslmode=require" ;;
  *) SUPABASE_DB_URL="${SUPABASE_DB_URL}?sslmode=require" ;;
esac
MASKED="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#://([^:/@]+):[^@]*@#://\1:****@#')"
export PGCLIENTENCODING=UTF8

# ---------- tools -------------------------------------------------------------
for t in pg_dump psql; do
  command -v "$t" >/dev/null 2>&1 || { echo "$t not found in PATH (install postgresql-client-17)" >&2; exit 2; }
done
CLIENT_MAJOR="$(pg_dump --version | sed -E 's/.*\) ([0-9]+).*/\1/')"

# ---------- output dir --------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
[ -n "$OUT_DIR" ] || OUT_DIR="$HOME/nzamy-backups/supabase-$TS"
mkdir -p "$OUT_DIR/selfhost"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
if [ "$ALLOW_INSIDE_REPO" -eq 0 ] && git -C "$OUT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "refusing to write inside a git work tree ($OUT_DIR): a data dump must never reach GitHub. Use -o <dir outside the repo> or --allow-inside-repo." >&2
  exit 2
fi
LOG="$OUT_DIR/backup.log"
exec > >(tee -a "$LOG") 2>&1
echo "== backup-supabase.sh  $(date -Is)"
echo "   source : $MASKED"
echo "   output : $OUT_DIR"
echo "   client : pg_dump $(pg_dump --version | sed -E 's/.*\) //')"

# ---------- retry wrapper ------------------------------------------------------
# The Supabase pooler answers from several nodes; right after a password reset (or under load) one node can still
# reject the password while another accepts it. Every connection below is therefore retried a few times.
retry() {  # retry <command…>  — up to 6 attempts, 8 s apart, only for connection-level failures;
           # stdout passes through untouched so $(retry …) stays clean, stderr is replayed after each attempt
  local n=1 err
  err="$(mktemp)"
  while :; do
    if "$@" 2>"$err"; then cat "$err" >&2; rm -f "$err"; return 0; fi
    cat "$err" >&2
    if [ "$n" -ge 6 ] || ! grep -qiE 'password authentication failed|connection to server|could not connect|server closed the connection|timeout expired|SSL SYSCALL|connection reset|connection refused|could not translate host name|too many connections' "$err"; then
      rm -f "$err"; return 1
    fi
    echo "   attempt $n hit a connection error — retrying in 8s" >&2
    n=$((n + 1)); sleep 8
  done
}

# ---------- server check ------------------------------------------------------
SERVER_VERSION="$(retry psql "$SUPABASE_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "show server_version")" || {
  echo "cannot connect. Check the URL (session pooler, port 5432), the password encoding, and that your network allows outbound 5432." >&2; exit 3; }
SERVER_MAJOR="${SERVER_VERSION%%.*}"
echo "   server : PostgreSQL $SERVER_VERSION"
if [ "$SERVER_MAJOR" -gt "$CLIENT_MAJOR" ]; then
  echo "pg_dump $CLIENT_MAJOR cannot dump a PostgreSQL $SERVER_MAJOR server. Install postgresql-client-$SERVER_MAJOR (or newer) and re-run." >&2
  exit 3
fi

run_psql_file() {  # label, sql file, output file, extra psql flags…
  local label="$1" sql="$2" out="$3"; shift 3
  echo "-- $label -> $(basename "$out")"
  retry psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@" -f "$sql" -o "$out"
}

# ---------- 00 / 01 / 02 -------------------------------------------------------
run_psql_file "server facts"      "$SQL_DIR/00-server-info.sql"    "$OUT_DIR/00-server-info.txt"
run_psql_file "row counts"        "$SQL_DIR/01-row-counts.sql"     "$OUT_DIR/01-row-counts.csv" --csv
run_psql_file "extras (auth/storage/realtime objects)" "$SQL_DIR/02-export-extras.sql" "$OUT_DIR/02-extras.sql" -A -t

# ---------- which schemas are ours ---------------------------------------------
USER_SCHEMAS="$(retry psql "$SUPABASE_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "
  select string_agg(nspname, ' ' order by nspname) from pg_namespace
  where nspname not in ('auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
                        'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
                        'pgbouncer','cron','pgtle','_analytics','_supavisor','repack','information_schema')
    and nspname not like 'pg\_%'")"
echo "-- user schemas: $USER_SCHEMAS  (+ supabase_migrations for the migration history)"
SCHEMA_ARGS=()
for s in $USER_SCHEMAS supabase_migrations; do SCHEMA_ARGS+=(-n "$s"); done

COMMON=(--no-owner --quote-all-identifiers --no-publications --no-subscriptions --no-security-labels --no-tablespaces)

# ---------- 10 schema ------------------------------------------------------------
echo "-- schema dump -> 10-schema.sql"
retry pg_dump "$SUPABASE_DB_URL" --schema-only "${COMMON[@]}" "${SCHEMA_ARGS[@]}" -f "$OUT_DIR/10-schema.sql"

# ---------- 20 / 21 data ---------------------------------------------------------
if [ "$SCHEMA_ONLY" -eq 0 ]; then
  echo "-- data dump (user schemas + migration history) -> 20-data.sql"
  retry pg_dump "$SUPABASE_DB_URL" --data-only "${COMMON[@]}" "${SCHEMA_ARGS[@]}" -f "$OUT_DIR/20-data.sql"
  echo "-- data dump (auth users/identities/mfa/sso) -> 21-auth-data.sql"
  # Transient auth tables are left out on purpose (sessions, refresh_tokens, mfa_amr_claims, mfa_challenges,
  # flow_state, one_time_tokens, saml_relay_states, audit_log_entries, schema_migrations): everybody signs in
  # again on the new host anyway, and GoTrue owns its own migration table.
  retry pg_dump "$SUPABASE_DB_URL" --data-only "${COMMON[@]}" \
    -t auth.users -t auth.identities -t auth.instances -t auth.mfa_factors \
    -t auth.sso_providers -t auth.sso_domains -t auth.saml_providers \
    -f "$OUT_DIR/21-auth-data.sql"
else
  echo "-- --schema-only: data dumps skipped"
fi

# ---------- self-host copies -------------------------------------------------------
# 1. "\restrict"/"\unrestrict" psql meta-commands (pg_dump >= 15.14/16.10/17.6) break older psql binaries such as
#    the one inside the supabase/postgres image.
# 2. "SET transaction_timeout" only exists on PostgreSQL 17 — fatal under ON_ERROR_STOP on a 15/16 self-host.
# 3. CREATE SCHEMA "public" already exists on any target — make every CREATE SCHEMA idempotent.
# 4. ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" needs superuser; the self-host image already has those defaults.
# 5. MAINTAIN is a PostgreSQL 17 privilege (it appears once a GRANT ALL was narrowed by a REVOKE); a 15/16 self-host
#    rejects it and no app role needs it, so it is dropped from every GRANT list.
selfhostify() {  # in -> stdout
  sed -E \
    -e '/^\\(un)?restrict /d' \
    -e 's/^SET transaction_timeout = 0;$/-- SET transaction_timeout = 0;  -- removed: parameter unknown before PostgreSQL 17/' \
    -e 's/^CREATE SCHEMA "([A-Za-z0-9_]+)";$/CREATE SCHEMA IF NOT EXISTS "\1";/' \
    -e 's/^(ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin".*)$/-- \1  -- removed: needs supabase_admin; a self-host already carries these defaults/' \
    -e '/^GRANT /{s/,MAINTAIN//g; s/MAINTAIN,//g}' \
    -e 's/^GRANT MAINTAIN ON (.*)$/-- GRANT MAINTAIN ON \1  -- removed: privilege unknown before PostgreSQL 17/' \
    "$1"
}
echo "-- assembling selfhost/ copies"
{
  echo "-- selfhost/01-schema.sql — assembled $(date -Is) from PostgreSQL $SERVER_VERSION ($MASKED)"
  echo "-- Target: a FRESH self-hosted Supabase (supabase/docker) database, connected as postgres."
  echo "--   psql \"\$NEW_DB_URL\" -v ON_ERROR_STOP=1 --single-transaction -f selfhost/01-schema.sql"
  echo "-- Contents: extensions guard + 10-schema.sql (post-processed) + 02-extras.sql. See RESTORE-SELFHOST.md."
  echo
  echo "create extension if not exists pgcrypto with schema extensions;"
  echo "create extension if not exists \"uuid-ossp\" with schema extensions;"
  echo
  echo "-- ===================== 10-schema.sql ====================="
  selfhostify "$OUT_DIR/10-schema.sql"
  echo
  echo "-- ===================== 02-extras.sql ====================="
  cat "$OUT_DIR/02-extras.sql"
} > "$OUT_DIR/selfhost/01-schema.sql"
if [ "$SCHEMA_ONLY" -eq 0 ]; then
  selfhostify "$OUT_DIR/21-auth-data.sql" > "$OUT_DIR/selfhost/02-auth-data.sql"
  selfhostify "$OUT_DIR/20-data.sql"      > "$OUT_DIR/selfhost/03-data.sql"
fi

# ---------- manifest ---------------------------------------------------------------
{
  echo "nzamy Supabase backup — $(date -Is)"
  echo "source: $MASKED"
  echo "server: PostgreSQL $SERVER_VERSION   client: $(pg_dump --version | sed -E 's/.*\) //')"
  echo "user schemas: $USER_SCHEMAS"
  echo
  echo "SAFE TO SHARE (no user data): 00-server-info.txt 01-row-counts.csv 02-extras.sql 10-schema.sql selfhost/01-schema.sql MANIFEST.txt backup.log"
  echo "PRIVATE — never send, never commit: 20-data.sql 21-auth-data.sql selfhost/02-auth-data.sql selfhost/03-data.sql"
  echo
  echo "bytes       sha256                                                            file"
  (cd "$OUT_DIR" && find . -type f ! -name MANIFEST.txt ! -name backup.log | sort | while read -r f; do
     printf '%-11s %s  %s\n' "$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")" "$(sha256sum "$f" | cut -d' ' -f1)" "${f#./}"; done)
  echo
  echo "row counts (user schemas + auth + storage):"
  awk -F, 'NR>1 && ($1!="realtime" && $1!="net" && $1!="vault" && $1!="pgsodium" && $1!="extensions" && $1!="graphql" && $1!="graphql_public" && $1!="supabase_functions" && $1!="cron" && $1!="pgbouncer" && $1!="_realtime" && $1!="_analytics") {printf "  %-28s %-40s %s %s\n", $1, $2, $3, $4}' "$OUT_DIR/01-row-counts.csv"
} > "$OUT_DIR/MANIFEST.txt"

echo
echo "== done. $(du -sh "$OUT_DIR" | cut -f1) in $OUT_DIR"
echo "   send for review : 00-server-info.txt 01-row-counts.csv 02-extras.sql 10-schema.sql MANIFEST.txt backup.log"
echo "   keep private    : 20-data.sql 21-auth-data.sql selfhost/02-auth-data.sql selfhost/03-data.sql"
