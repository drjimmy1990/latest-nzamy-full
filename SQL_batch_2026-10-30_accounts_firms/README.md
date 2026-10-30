# Owner answers ٣٠٧–٣١٣ (2026-10-30): accounts, firms, freezes — your steps

One SQL file. It builds on `20261026_70_account_deletion.sql`, which is already live (26-Oct batch). Ledger: `docs/audits/2026-10-30-owner-package-accounts-firms.md`.

| File (full path on your PC) | When |
|---|---|
| `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-10-30_accounts_firms\10_ANY_TIME_20261030_12_accounts_firms_owner_answers.sql` | any time, before or after the deploy |

It is the same file, byte for byte, as `supabase/migrations/20261030_12_accounts_firms_owner_answers.sql`.

What it does:
- **٣٠٨:** a new column `original_author_id` on `case_notes`, `dashboard_notes`, `lawyer_client_notes` and `consultation_notes`.
  - It is filled for every existing note. A note that already moved to a firm owner gets the member who wrote it, read from the `firm_asset_transfers` trail.
  - No note's «آخر تعديل» changes. The fill runs with the tables' triggers off inside the transaction, and they are switched back on before it ends.
  - From then on the column is set on insert and never changes.
- **٣١٢:** in a consulting office (Art. 18), removing a lawyer keeps his hearings, appointments, case stages and court deadlines in his name. They move to the office owner only when the lawyer's account is deleted.
- **٣٠٧:** a function that tells the signed-in user, ahead of time, that his deletion is refused because he owns an entity that has members.
- **٣١٠:** a paid or refunded invoice (`payment_orders`) can never be deleted. The buyer's data on it is never dropped, and it now includes the national address.

Nothing existing is deleted or rewritten. The only change to existing rows is filling the new column.

## Step 1: the SQL (SQL editor, as postgres)
1. Open the Supabase dashboard → **SQL Editor** → New query.
2. Paste the whole file above and press **Run**.
3. The result is **one row** (this is screen output, not a file). Expect:

   | notes_without_author | specs_312 | owner_block_fn | invoice_guard | invoice_fk_set_null |
   |---|---|---|---|---|
   | 0 | true | true | true | true |

4. **Send us that row.** If it says `ERROR`, send the error and stop. The whole file rolls back, and nothing is half-applied.

## Step 2: `_verify.sql`, by hand (deploy.sh does not run it)
On the server:
```
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261030_|ERROR"
```
Run it after the code with this commit is on the server; `_verify.sql` comes with the code. Expect the line `_verify: 20261030_12 OK — …` and no `ERROR`.

## Re-run order
If `20261026_70_account_deletion.sql` is ever run again, run this file again after it. Re-running 70 puts back its own list, and the consulting-office rule (٣١٢) is lost. `_verify.sql` raises when that happens.

## Docker proof (already run)
`supabase/tests/rls/accounts_firms_owner_answers.test.sql`: the chain is in its header. It covers T1–T8 and two negative controls that must fail. `account_deletion.test.sql` (D6) still passes with this file applied.
