# scripts/selfhost

Verbatim copy of the Supabase backup/restore kit from `_fix-delivery-2026-09-20/backup/`, moved into the repo so the migration off hosted Supabase is reproducible from a clean clone.

- `backup-supabase.ps1` / `backup-supabase.sh` — read-only logical backup (schema + data + auth) that also writes self-host-ready copies under `selfhost/`. Neither writes to the source database.
- `sql/00-server-info.sql`, `sql/01-row-counts.sql`, `sql/02-export-extras.sql` — the read-only probes those scripts run.
- `copy-storage.mjs` — copies every Storage bucket and file to the new project (the SQL dump carries only metadata).
- `README-BACKUP.md` / `RESTORE-SELFHOST.md` — the kit's own notes, kept as written.

Backup output goes OUTSIDE the repo by design; never commit a `*-data.sql`. The step-by-step Arabic procedure is `دليل_الاستضافة_الذاتية_استيراد_المخطط_٢٠٢٦-٠٩-٢٢.md` at the repo root.
