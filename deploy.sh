#!/usr/bin/env bash
# NZAMY deploy prep — apply migrations, verify schema, then build.
# Run from the nzamy-website/ directory on the deploy host.
set -euo pipefail

echo "▶ Applying Supabase migrations…"
npx supabase db push            # applies everything under supabase/migrations

echo "▶ Verifying critical schema/RLS is live…"
npx supabase db execute --file supabase/migrations/_verify.sql

echo "▶ Lint + type-check + build…"
npm run lint
npm run type-check
npm run build

echo "✔ Deploy prep complete. (Now restart the app, e.g. 'pm2 reload nzamy'.)"
