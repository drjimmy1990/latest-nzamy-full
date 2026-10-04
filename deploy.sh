#!/usr/bin/env bash
# =============================================================================
# NZAMY — deploy on the app VPS without taking the site down.
#
#   bash deploy.sh             pull the current branch, build, switch, reload
#   bash deploy.sh main        switch to branch main first (used once, at the
#                              self-hosted cutover), then pull, build, switch
#   bash deploy.sh <commit>    deploy one exact commit (detached HEAD)
#   bash deploy.sh --rollback  switch back to the previous build and reload
#   bash deploy.sh --status    show which build folder is live
#
# How it works: two build folders, .next-a and .next-b. The live one is named
# in .env.production.local (NEXT_DIST_DIR=…), which Next.js loads before
# next.config.ts reads it. A deploy builds into the folder that is NOT live
# while the site keeps serving the live one, and switches only after the build
# finished (pm2 reload: a few seconds). A failed build changes nothing on the
# site, and the previous build stays on disk for an instant --rollback.
#
# Why not simpler:
#   * building straight into .next deletes the build the running server uses
#     (2026-09-25: 43 crash-restarts, site down for the whole ~6-minute build);
#   * building elsewhere and renaming the folder to .next does not work either:
#     Next.js 16 bakes the folder name into the compiled server.
#
# Database migrations are NOT run here: they are applied by hand in the
# Supabase SQL Editor.
#
# Optional settings (environment variables):
#   PM2_APP          pm2 process name          (default: nzamy)
#   BUILD_HEAP_MB    Node heap for the build   (default: 4096)
#   NGINX_CACHE_DIR  proxy cache to purge      (default: /www/server/nginx/proxy_cache_dir)
# =============================================================================
set -euo pipefail

APP_NAME="${PM2_APP:-nzamy}"
HEAP_MB="${BUILD_HEAP_MB:-4096}"
NGINX_CACHE="${NGINX_CACHE_DIR:-/www/server/nginx/proxy_cache_dir}"
POINTER=".env.production.local"
REPO_DIR="${NZAMY_REPO_DIR:-$(cd "$(dirname "$0")" && pwd)}"

# `git pull` below can rewrite this very file while bash is still reading it,
# so run from a private copy of the script.
if [ -z "${NZAMY_DEPLOY_COPY:-}" ]; then
  tmp="$(mktemp /tmp/nzamy-deploy.XXXXXX)"
  cp "$0" "$tmp"
  NZAMY_DEPLOY_COPY=1 NZAMY_REPO_DIR="$REPO_DIR" exec bash "$tmp" "$@"
fi
trap 'rm -f "$0"' EXIT

cd "$REPO_DIR"

live_dir() {
  local v=""
  if [ -f "$POINTER" ]; then
    v="$(sed -n 's/^[[:space:]]*NEXT_DIST_DIR[[:space:]]*=[[:space:]]*//p' "$POINTER" | tail -n 1 | tr -d "\r\"' ")"
  fi
  echo "${v:-.next}"
}

set_live() {
  local tmpfile
  tmpfile="$(mktemp "${POINTER}.XXXXXX")"
  if [ -f "$POINTER" ]; then
    grep -v '^[[:space:]]*NEXT_DIST_DIR[[:space:]]*=' "$POINTER" > "$tmpfile" || true
  fi
  echo "NEXT_DIST_DIR=$1" >> "$tmpfile"
  mv "$tmpfile" "$POINTER"
}

purge_cache() {
  if [ -d "$NGINX_CACHE" ]; then
    find "$NGINX_CACHE" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
}

LIVE="$(live_dir)"
if [ "$LIVE" = ".next-a" ]; then OTHER=".next-b"; else OTHER=".next-a"; fi

case "${1:-}" in
  --status)
    echo "Live build folder: $LIVE ($(cat "$LIVE/BUILD_ID" 2>/dev/null || echo 'no BUILD_ID!'))"
    for d in .next .next-a .next-b; do
      [ -f "$d/BUILD_ID" ] && echo "  $d  BUILD_ID $(cat "$d/BUILD_ID")  built $(date -r "$d/BUILD_ID" '+%F %T')"
    done
    echo "Code on disk: $(git log -1 --format='%h %s')"
    exit 0
    ;;
  --rollback)
    if [ -f "$OTHER/BUILD_ID" ]; then
      PREV="$OTHER"
    elif [ "$LIVE" != ".next" ] && [ -f .next/BUILD_ID ]; then
      PREV=".next"
    else
      echo "✗ No previous build on disk to roll back to." >&2
      exit 1
    fi
    set_live "$PREV"
    pm2 reload "$APP_NAME"
    purge_cache
    echo "✔ Rolled back: the site now runs the build in $PREV (was $LIVE)."
    echo "  The code on disk was not changed — 'git log -1' shows what is checked out."
    exit 0
    ;;
esac

echo "▶ Fetching code…"
git fetch origin
if [ -n "${1:-}" ]; then
  git checkout "$1"
fi
if git symbolic-ref -q HEAD >/dev/null; then
  git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
fi
echo "  Deploying $(git log -1 --format='%h %s')"

TARGET="$OTHER"
echo "▶ Building into $TARGET — the site keeps running on $LIVE…"
rm -rf "$TARGET"
# Route types of older builds (type-check only, never read at runtime) would
# break the new type-check when a page was removed or renamed.
rm -rf .next/types .next/dev/types .next-a/types .next-b/types
NEXT_DIST_DIR="$TARGET" NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" npm run build
if [ ! -f "$TARGET/BUILD_ID" ]; then
  echo "✗ The build produced no BUILD_ID — the live site was not touched." >&2
  exit 1
fi

echo "▶ Switching the site to $TARGET…"
set_live "$TARGET"
pm2 reload "$APP_NAME"
purge_cache

echo "✔ Deployed $(git rev-parse --short HEAD) — live build folder: $TARGET."
echo "  The previous build is still in $LIVE — 'bash deploy.sh --rollback' switches back to it."
