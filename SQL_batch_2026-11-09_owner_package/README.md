# Batch 2026-11-09 (owner package 6-Nov, owner-free part): your steps, in order

**Status 2026-11-09: DONE on prod.** Steps 0–6 done: all 8 SQL files ok (`_22` returns `f` only because the library is empty, expected), deploy `68747133`, `_verify` clean (academy answer keys `t`, so Step 6 needed nothing). Left: Step 7 (headers / CSP console) and Step 8 (before the owner's next library load).

**Where the files are.** Until the branch `batch/2026-11-09-owner-package` is merged, the files are in the worktree `D:\nzwt\b1109\`. After the merge they are in `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\`, and on the server after `git pull` in `/www/wwwroot/nzamy/latest-nzamy-full/`. The paths below are relative to that folder.

**Screen or file.** Every SQL result here appears on the screen only. Paste the results back to us.

**The SQL Editor hides NOTICEs and shows only the last result.** Every migration ends with a SELECT you can read, and every row must say `ok = t`.

**No `npm install` needed.** No dependency changed in this batch.

## The whole order

| Step | What | When |
|---|---|---|
| 0 | Read-only checks: nginx peer, live headers, prod facts | before anything |
| 1 | SQL `20261109_10`, `20261109_11` | **before the deploy** |
| 2 | SQL `20261109_20`, `20261109_21` | **before the deploy** and before the owner's next library load |
| 3 | SQL `20261109_12`, `20261109_13`, `20261109_14`, `20261109_22` | any time |
| 4 | Deploy | after Step 0a is clean |
| 5 | `_verify.sql` by hand | after Steps 1–3 |
| 6 | X-5 academy check (read-only; a revoke only if it shows exposure) | any time |
| 7 | Browser and curl checks | after the deploy |
| 8 | Before the owner's next library load | when he sends the export |

---

## Step 0: read-only checks

### 0a. Who nginx sees as the visitor (must be done before the deploy)

The new rate limiter believes the visitor address that Cloudflare sends only when the request reaches nginx from a Cloudflare address or from a local hop. Nobody has checked which one prod sees. Run on the server terminal:

```bash
awk '{print $1}' /var/log/nginx/access.log | tail -n 2000 | sort | uniq -c | sort -rn | head
```

```bash
grep -rnE "real_ip|X-Real-IP|X-Forwarded-For" /etc/nginx/ ; systemctl is-active cloudflared
```

Paste both outputs. The top addresses should be Cloudflare ranges (172.64–172.71.x.x, 162.158/159.x.x, 104.16–104.31.x.x, 2400:cb00:…, 2606:4700:…) or 127.0.0.1 / a private address. **If they are another public address** (another proxy in front of nginx), do not deploy yet: send us the output.

### 0b. Headers today (to compare after the deploy)

```bash
curl -sI https://nezamy.sa/ | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy|content-security|x-powered-by"
```

### 0c. Every nezamy.sa subdomain answers on HTTPS

The new `Strict-Transport-Security` header has `includeSubDomains`: once a browser sees it, it refuses plain HTTP on every subdomain for a year.

```bash
for h in nezamy.sa www.nezamy.sa auth.nezamy.sa n8n.nezamy.sa staging.nezamy.sa; do curl -s -o /dev/null -w "%{http_code} https://$h\n" --max-time 10 "https://$h/"; done
```

Paste the output. A line with `000` means that host has no working HTTPS. Tell us before deploying, and list any other subdomain you use.

### 0d. Prod facts (read-only, SQL Editor)

```sql
select
  (select case when to_regprocedure('public.is_group_member_or_owner(uuid,uuid)') is null then null
               else has_function_privilege('anon','public.is_group_member_or_owner(uuid,uuid)','execute') end) as db01_anon_exec,
  (select count(*) from pg_policies where qual ~ 'is_group_member_or_owner\(' or with_check ~ 'is_group_member_or_owner\(') as db01_policies,
  (select count(*) filter (where max_uses > 1) from library.invitations) as multi_seat_codes,
  (select has_table_privilege('anon','public.admin_audit_events','select')) as x3_anon_audit_select;
```

Expected today: `db01_anon_exec = t`, `db01_policies = 2`, `x3_anon_audit_select = t`. Send us the row. If `db01_policies` is more than 2, `20261109_12` stops by design: send us the row before running it.

---

## Step 1: before the deploy

Run each file in the SQL Editor, one at a time. Every row of the last SELECT must say `ok = t`.

1. `supabase/migrations/20261109_10_library_invitation_redemptions.sql`: a multi-use library invitation code works once per account, recorded in the same transaction as the access grant. It needs `20261030_65` and `20261103_11`, which are already live; if either were missing, it stops with an error naming the file.
2. `supabase/migrations/20261109_11_share_passcode_lockout.sql`: document share passcodes are checked in the database, and 5 wrong tries lock the link for 15 minutes.

Both end with `notify pgrst, 'reload schema'`. If the pm2 log shows «redeem_library_invitation is missing» after the deploy, reload the API schema cache.

## Step 2: before the deploy and before the owner's next library load

3. `supabase/migrations/20261109_20_library_merged_regulations.sql`: the column for the merged regulations list on each law (server only).
4. `supabase/migrations/20261109_21_library_principles_printed_page.sql`: the printed page column on rulings (server only).

The library loader refuses to start without these two columns. The site itself works without them.

## Step 3: any time

5. `supabase/migrations/20261109_12_group_membership_self_check.sql`: the community group membership check answers only for the signed-in user.
6. `supabase/migrations/20261109_13_admin_audit_events_no_guest_grant.sql`: removes the guest read grant on the admin audit table. **Re-run it after any re-run of `20261019_30_platform_staff_roles.sql`.**
7. `supabase/migrations/20261109_14_academy_certificates_policy_service_role.sql`: only the server can write academy certificates. It does nothing if the academy schema does not exist.
8. `supabase/migrations/20261109_22_library_feqh_book_type_data01.sql`: corrects the type of the two fiqh books the old guess mislabelled. **Re-run it after any library load made with code older than this batch.**

All eight files can be re-run safely.

## Step 4: deploy

As usual (`deploy.sh` via nohup), after Step 0a is clean.

## Step 5: `_verify.sql`

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | tail -60
```

The new blocks are `library_invitation_redemptions`, `share_passcode_lockout`, `group_membership_self_check`, `admin_audit_events_no_guest`, `academy_certificates_policy`, `academy_answer_keys`, `library_merged_regulations`, `library_principles_printed_page` and `library_feqh_book_type_data01`. Paste the tail. Every row should be `t`, except that `academy_answer_keys` may be `f` on prod: then do Step 6.

## Step 6: X-5, the academy answer key (read-only)

```sql
select
  to_regnamespace('academy') is not null as academy_schema,
  case when to_regnamespace('academy') is null then null else has_schema_privilege('anon','academy','USAGE') end as anon_usage,
  case when to_regnamespace('academy') is null then null else has_schema_privilege('authenticated','academy','USAGE') end as auth_usage,
  case when to_regclass('academy.questions') is null then null else has_column_privilege('anon','academy.questions','correct_answer','SELECT') end as anon_answer_col,
  case when to_regclass('academy.questions') is null then null else has_column_privilege('authenticated','academy.questions','correct_answer','SELECT') end as auth_answer_col,
  case when to_regclass('public.academy_questions') is null then null else has_table_privilege('anon','public.academy_questions','SELECT') end as anon_view,
  (select c.reloptions from pg_class c where c.oid = to_regclass('public.academy_questions')) as view_options;
```

Send us the row. The answer key is exposed only if `anon_usage` and `anon_answer_col` are both `t`, or `auth_usage` and `auth_answer_col` are both `t`, or `anon_view` is `t` and `view_options` lacks `security_invoker=true`. If it is exposed, we send you the revoke.

## Step 7: after the deploy

1. Headers, each once, and no `x-powered-by`:
   ```bash
   curl -sI https://nezamy.sa/ | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy|content-security|x-powered-by"
   ```
   Expected: `strict-transport-security: max-age=31536000; includeSubDomains`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `content-security-policy-report-only: …`. If one appears twice, nginx or Cloudflare also adds it: send us the output.
2. The CSP is report-only for now. Open a few pages (home, /laws, a law, login, a payment page) with devtools open, and send us any `[Report Only]` lines from the console.
3. The browser checks in the owner report for this batch.

## Step 8: before the owner's next library load

1. Make sure Step 2 has run.
2. Build the rows from his export, then run `npm run library:diff -- --rows <rows folder>`. It is read-only. **No ruling id should change.** If ids do change, stop and send us the output.
3. After `20261109_21` has run, the line «لا تضف حقل الصفحة المطبوعة» in `دليل_المالك_رفع_أحدث_نسخة_من_المكتبة_٢٠٢٦-١١-٠٨.md` changes to say he may add it. We update the guide when you tell us `_21` is done.
4. The loader never deletes rows. The old rows of the 20 laws whose latent articles were folded into a regulation block, and of renamed decrees and books, are listed by `library:diff` as "only in DB"; we send the delete SQL for them after the diff.
5. On that load, 20 fiqh books move from «شرعي» to «وضعي» on purpose (they are law books). The owner report tells him so.

**Never run** `library-clear`, `library:reseed:wipe` or `seed-library-from-owner`.

## Ops (not code, yours)

- Rotate the Evolution API key and `N8N_WEBHOOK_SECRET`, both of which leaked in an old commit.
- Delete the old cloud Supabase project, or rotate its service_role key.
- Rotate the test accounts' passwords.
