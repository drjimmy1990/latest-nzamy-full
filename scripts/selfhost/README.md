# scripts/selfhost

Verbatim copy of the Supabase backup/restore kit from `_fix-delivery-2026-09-20/backup/`, moved into the repo so the migration off hosted Supabase is reproducible from a clean clone.

- `backup-supabase.ps1` / `backup-supabase.sh` — read-only logical backup (schema + data + auth) that also writes self-host-ready copies under `selfhost/`. Neither writes to the source database.
- `sql/00-server-info.sql`, `sql/01-row-counts.sql`, `sql/02-export-extras.sql` — the read-only probes those scripts run.
- `copy-storage.mjs` — copies every Storage bucket and file to the new project (the SQL dump carries only metadata).
- `README-BACKUP.md` / `RESTORE-SELFHOST.md` — the kit's own notes, kept as written.

Backup output goes OUTSIDE the repo by design; never commit a `*-data.sql`. The step-by-step Arabic procedure is `دليل_الاستضافة_الذاتية_استيراد_المخطط_٢٠٢٦-٠٩-٢٢.md` at the repo root.

## Reference / catalog data — `copy-reference-data.mjs`

The self-hosted database was restored from a schema-only dump, so the catalog rows that migrations INSERTed on cloud are missing there: the service price catalog (`admin_pricing_catalog`), `blog_sections`, `jurisdictions`, `court_holidays`, the statutory `deadline_rules`, and two `platform_settings` keys (`library_status`, `library_free_law_overrides`). This script copies those rows and nothing that belongs to a user. Old users are not migrated, so every user FK on a copied row is set to null. The allow-list, with a reason for each table, is at the top of the script.

Run it from the repo root once the schema is on the self-hosted instance, and before go-live:

```bash
node scripts/selfhost/copy-reference-data.mjs                 # 1. DRY-RUN (default): read-only, prints the plan and diffs
node scripts/selfhost/copy-reference-data.mjs --execute       # 2. insert the rows whose primary key is missing on the target
node scripts/selfhost/copy-reference-data.mjs                 # 3. the dry-run again: "to insert" should now read 0 everywhere
```

- The source is `.env.local.backup-2026-09-24` (cloud, override with `--source-env`) and the target is `.env.local` (self-hosted). The script refuses a `*.supabase.co` target and refuses a run where source and target are the same host. The source is only ever read.
- Rows that exist on both sides but differ are shown as a field diff and are not overwritten. Pass `--overwrite` to update them from the source. `platform_settings` keys that already exist are never overwritten, not even by `--overwrite`, unless you also pass `--overwrite-settings`.
- The owner writes coupons and broadcasts himself, so the script only lists them unless you pass `--with-coupons` or `--with-broadcasts`. A copied coupon's `used_count` is reset to 0.
- Blog: cloud posts are matched to self-hosted posts by `slug`. Cloud slugs that are missing on the target are listed. Pass `--with-cloud-blog-extras` to copy them. That also copies each post's cover from the cloud `blog-covers` bucket to the self-hosted one and rewrites the cover URL.
- Every run writes `outputs/selfhost/reference-snapshot-<timestamp>.json` (gitignored), holding every source row it read. Keep the file: it is the archive once the cloud project is paused.
- The script can be re-run safely. It stops with exit 1 at the first failing table, and a second run skips the rows that already landed.
- The dry-run on 2026-09-25 found that all 18 `subscription_plans` on self-hosted have empty `features` and `limits` and `sort_order` 0, because the first version of `scripts/seed-clean-test-accounts.mjs` (before 2026-09-25) upserted the plans without those fields; the current version never writes `subscription_plans`. Prices match. `--overwrite` restores the three fields from cloud, and it is the only table that `--overwrite` changes today.
