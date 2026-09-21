# scripts/uat

Every script parses `.env.local` through `_env.ps1` and refuses to run unless
the project ref is in `NZAMY_UAT_PROJECT_REFS` (comma-separated). A writer
(`seed-actors`, `teardown-actors -Execute`, most `verify-*`) additionally
refuses the hard-coded production ref (`gdqfqfcxnwrwgaphtfhu`) unless you pass
`-IUnderstandThisIsProduction` **and** set `NZAMY_UAT_ALLOW_PRODUCTION=1`.

- `seed-actors.ps1` — writes; creates the synthetic actor set.
- `verify-*.ps1` — most write (service-role key or a mutating call); see each file's header for what it creates/deletes.
- `backup-test-state.ps1`, `audit-*.ps1` — read-only. `scan-surface-inventory.ps1` — local files only, never touches Supabase.
- `teardown-actors.ps1` — deletes only with `-Execute`; dry run otherwise.

Credentials/output land under `outputs/uat/` (git-ignored).

## Teardown

```
$env:NZAMY_UAT_PROJECT_REFS = "<your test project ref>"
./teardown-actors.ps1              # dry run: counts + first 20 ids, no deletes
./teardown-actors.ps1 -Execute     # only after reviewing the dry run
```

Against production, add `-IUnderstandThisIsProduction` and set `$env:NZAMY_UAT_ALLOW_PRODUCTION = "1"` on either command.
