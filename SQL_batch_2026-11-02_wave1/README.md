# Wave 1 safety (2026-11-02): your steps, in order

Two SQL files. Both only UPDATE two rows of `admin_pricing_catalog`, both are safe to run twice, and each runs in one transaction: if it says `ERROR`, nothing changed. Send us the error and stop.

| File | What it changes | When |
|---|---|---|
| `20261102_10_retire_cancelled_prices.sql` | contract review 800 → **600** (individuals, q327); contract drafting drops the «99 ر.س» note and the «الأكثر طلبا» tag | after the deploy (Step 3) |
| `20261102_11_contract_draft_points_price.sql` | contract drafting: «مشمول في الباقة» → «بالنقاط · ٥٠٠ نقطة للعقد» | after the deploy **and after `_10`** (Step 4) |

**Order: deploy → `_10` → `_11` → the final check → `_verify` by hand.**
- `_11` must not run before the deploy. The old code has no label for the new price mode `points`, so the contract-drafting card would show a blank price until the deploy lands.
- `_10` could run at any time, but it goes right after the deploy, so the code and the rows change together.
- Nothing that takes money reads this table. Checkout prices come from the code's price book. The rows only change what the services pages show.

**The rest of the batch is code.** It stops selling the cancelled plans, adds a real password reset, closes the free library-AI routes, retires the AI "review" mode, and makes shown points equal the charged points. The owner report lists every item:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\تقرير_للمالك_٢٠٢٦-١١-٠٢_الدفعة_الأولى.md
```

**Moyasar live comes after this deploy, never before.** The cancelled plans (ind-preventive, ind-litigation, the monthly, quarterly and semiannual ind-ai cycles, and the 199 launch price) stop being sold only once this code is live. See "Moyasar live" below.

---

## Step 1: before the deploy (server; no SQL)

### 1a. Turnstile site key: only if you turn the captcha on with this deploy

The site key is baked in at **build** time. If you set it after the deploy, you need another deploy.

The full steps are in the operator guide. In the worktree it is here:

```
D:\nzwt\founder\docs\security\captcha-turnstile-operator-guide.md
```

In the main folder, after `git pull` on main:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\docs\security\captcha-turnstile-operator-guide.md
```

On the server:

```
/www/wwwroot/nzamy/latest-nzamy-full/docs/security/captcha-turnstile-operator-guide.md
```

In short:
1. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` goes into this file **before** Step 2. Never paste its value in chat.

```
/www/wwwroot/nzamy/latest-nzamy-full/.env.local
```

2. The secret goes into GoTrue (the guide's step 2: `CAPTCHA_ENABLED=true`, `CAPTCHA_SECRET`, passed through the `auth` service's `environment:` list, then `docker compose up -d auth`).
3. **Both go live together.** Once GoTrue checks the captcha, it refuses a login or a reset request that has no token. A site built without the key sends none.

If you leave the captcha off for now, the new reset page still works: it simply sends no token.

### 1b. GoTrue: email (SMTP) and the redirect allow-list, for the new password reset

The new «نسيت كلمة المرور» page sends a real reset email. It needs these on auth.nezamy.sa (GoTrue's env). In the official self-hosted `docker-compose.yml` they come from the Supabase folder's `.env` names in brackets. Check with `docker compose config | grep GOTRUE_` that each one reaches the `auth` container, as in the captcha guide's step 2c.

1. **SMTP:** `GOTRUE_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `_ADMIN_EMAIL` and `_SENDER_NAME` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`).
2. **Site URL:** `GOTRUE_SITE_URL=https://nezamy.sa` (`SITE_URL`).
3. **The redirect allow-list:** add `https://nezamy.sa/auth/callback**` to `GOTRUE_URI_ALLOW_LIST` (`ADDITIONAL_REDIRECT_URLS`, comma-separated).
   - Keep the `**`: the link carries `?next=%2Freset-password`.
   - If the URL is not allowed, GoTrue silently sends the link to the home page, which does nothing with it.
   - `https://nezamy.sa/reset-password` may be added too. It is harmless but not needed: GoTrue only ever sends the user to `/auth/callback`, and the site moves them on to `/reset-password`.
4. **Keep GoTrue's default recovery email template** (`{{ .ConfirmationURL }}`). Do not switch it to a `token_hash` link: the site refuses those on purpose.
5. Restart auth with `docker compose up -d auth` (not `restart`, which keeps the old env).
6. Send **one** test email to a real inbox and check the spam folder. The full reset test is Step 7.

### 1c. GitHub and keys (any time; the sooner the better)

Make the repository private, then **rotate every key that was ever committed**. Making it private does not un-leak anything already pushed. Never paste a key in chat.

---

## Step 2: deploy (server terminal)

There are no new npm packages in this batch, so `npm install` is not needed. The branch must be merged into main first.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261102-wave1.log 2>&1 &
```

```bash
tail -f /root/deploy-20261102-wave1.log
```

---

## Step 3: `20261102_10`, AFTER the deploy (Supabase dashboard → SQL Editor, as postgres)

The file on your PC.

In the worktree, before the merge:

```
D:\nzwt\founder\supabase\migrations\20261102_10_retire_cancelled_prices.sql
```

In the main folder, after `git pull` on main:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261102_10_retire_cancelled_prices.sql
```

On the server:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261102_10_retire_cancelled_prices.sql
```

1. Open the file and copy all of it.
2. Paste it into a new query and press **Run**.
3. The result appears on the screen (it is not a file). Read it **now**, before Step 4. Expect **two rows**, `ok = t` in both:

```
service_id      | in_table | audience   | base_price | price_note                                 | tag | ok
contract-draft  | t        | individual | 0.00       | أو ٥٠٠ نقطة للعقد                          |     | t
contract-review | t        | individual | 600.00     | سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد |     | t
```

- `in_table = f` means the row does not exist on the live database. That is also fine: the code then shows the same values.
- `ok = f` on any row: send us the row and stop.
- **This file's own check is valid only until Step 4.** After `_11`, the contract-draft note becomes «٥٠٠ نقطة للعقد» (no «أو»), so re-running this SELECT then shows `ok = f` for contract-draft. That is expected. The check to keep is Step 5.

## Step 4: `20261102_11`, AFTER the deploy and AFTER Step 3 (SQL Editor, new query)

In the worktree, before the merge:

```
D:\nzwt\founder\supabase\migrations\20261102_11_contract_draft_points_price.sql
```

In the main folder, after `git pull` on main:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261102_11_contract_draft_points_price.sql
```

On the server:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261102_11_contract_draft_points_price.sql
```

1. Open the file, copy all of it, paste it into a new query and press **Run**.
2. The result appears on the screen (it is not a file). Expect **one row**:

```
service_id     | in_table | price_mode | base_price | price_note     | included_by_plan | ok
contract-draft | t        | points     | 0.00       | ٥٠٠ نقطة للعقد |                  | t
```

## Step 5: the final check, after both files (SQL Editor, new query)

The SQL editor hides NOTICE messages, so run this SELECT and read the rows. The result appears on the screen (it is not a file).

```sql
select service_id, audience, price_mode, base_price,
       metadata->>'priceNote'                    as price_note,
       coalesce(metadata ? 'tag', false)            as has_tag,
       coalesce(metadata ? 'includedByPlan', false) as has_included_by_plan
  from public.admin_pricing_catalog
 where service_id in ('contract-draft', 'contract-review')
 order by service_id;
```

Expect two rows:

```
service_id      | audience   | price_mode    | base_price | price_note                                 | has_tag | has_included_by_plan
contract-draft  | individual | points        | 0.00       | ٥٠٠ نقطة للعقد                             | f       | f
contract-review | individual | starting_from | 600.00     | سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد | f       | f
```

- contract-review's `price_mode` is whatever the row had; these files do not change it. `starting_from` is the seed's value.
- No row at all for a service is also fine (the code shows the same values).
- Anything else: send us the rows.

Then on the site, `/dashboard/client/services` (a client account): the contract-drafting card reads «بالنقاط» and «٥٠٠ نقطة للعقد», not «مشمول في الباقة»; the contract-review card reads from 600.

## Step 6: `_verify.sql` by hand (server, after Step 5; deploy.sh does not run it)

The file on the server:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/_verify.sql
```

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261102_|_verify: 20261101_|ERROR"
```

Expect on the screen (it is not a file), and no `ERROR`:
- `_verify: 20261101_10 OK — …` (the founder batch, unchanged)
- `_verify: 20261102_10 OK — contract review 600 for individuals; contract drafting 0 SAR with no «الأكثر طلبا» tag …`
- `_verify: 20261102_11 OK — contract drafting is priced in points («٥٠٠ نقطة للعقد»), not «مشمول في الباقة» …`

This new block is the last one in the file, and it **raises an ERROR** in every wrong state, naming the file(s) to re-run:
- `_verify: 20261102_10 — contract-review shows 800.00 …` or `contract-draft shows 99.00 …`: `_10` did not run, or the 20260518 seed was re-run after it. Run Step 3, then Step 4, then this step again.
- `_verify: 20261102_11 — contract-draft is price_mode included …` or `… with the note «أو ٥٠٠ نقطة للعقد» …`: `_11` did not run, or `_10` was re-run after it. Run Step 4, then this step again.

## Step 7: test the password reset (after the deploy and Step 1b)

On https://nezamy.sa, in one browser:
1. «نسيت كلمة المرور» from the login page, with a real registered address. Open the email's link **in the same browser** that asked for it, set a new password, and sign in with it.
2. Open the same link again. It must show «رابط الاستعادة غير صالح» (expired, already used, or opened in another browser), not a success.
3. Ask for a reset for an address that has no account. It must show the same neutral message as step 1 («إن كان البريد مسجلاً فستصلك رسالة…»).

**Watch the logs from now on, not just today.** The page shows the same neutral message for every failure that could reveal whether an account exists, an SMTP failure included. So a mail outage that starts next week is invisible in the site. Only the logs show it:
- the GoTrue log, for 5xx on `/recover`, for example `docker logs <auth container> 2>&1 | grep '/recover'`;
- the nginx or Cloudflare access log, for 5xx, 504 or 524 on `/auth/v1/recover`.

An alert on either is better than looking by hand.

## Step 8 (optional): AI runs stuck in the old "review" mode

After this deploy the admin can no longer choose «بمراجعة» (review) for an AI tool, and a tool still stored as review runs as «للمشرفين فقط» (staff). Two read-only SELECTs show whether anything is left from before. The results appear on the screen (they are not files).

**8a. Which tools are stored as review (read-only):**

```sql
select s.value from (select value from public.platform_settings where key = 'ai_tools') s;

select e.key as tool, e.value as setting
  from (select value from public.platform_settings where key = 'ai_tools') s,
       jsonb_each(s.value) e
 where e.value->>'mode' = 'review';
```

No rows in the second SELECT: nothing to do. If a tool shows up, open «تشغيلات الذكاء الاصطناعي» (/dashboard/admin/ai-usage) and save the page once: it rewrites the tool as staff. No SQL is needed for that.

**8b. Runs already stored as review, charged and hidden (read-only):**

```sql
select r.id, r.tool, r.user_id, p.display_name,
       r.price_points, r.charged_points, r.charged, r.refunded_at,
       (u.run_id is not null) as paid_with_founder_credit,
       r.created_at, r.finished_at
  from public.ai_runs r
  left join public.profiles p on p.id = r.user_id
  left join public.membership_credit_uses u on u.run_id = r.id and u.restored_at is null
 where r.status = 'review'
 order by r.created_at;
```

No rows: nothing to do, and the rest of this step does not apply. A run paid with a founder credit shows `charged_points = 0`; for that run the refund gives back the credit, not points.

To decide on a refund, a super admin can read each run's output: «عرض الناتج» in the runs table at /dashboard/admin/ai-usage.

**8c. Refund one review run (a write; optional; your decision).** Replace `<run id>` (three places) with one id from 8b and run the whole block as one query:

```sql
-- كتابة — اختياري
begin;
update public.ai_runs
   set output = null, citations = '[]'::jsonb
 where id = '<run id>' and status = 'review';
select public.ai_fail_run(r.id, 'review_retired', 'review mode retired before release existed')
  from public.ai_runs r
 where r.id = '<run id>' and r.status = 'review';
commit;
```

- It sets the run to `failed` and refunds the debit to the original points lots, once. For a founder-credit run it gives the credit back.
- It clears the output first, in the same transaction, because a `failed` run's output is not hidden from its owner.
- The `where r.status = 'review'` guard matters: `ai_fail_run` also acts on running jobs, so without it a mistyped id of a live run would be failed and refunded.
- The SELECT returns `true` when the refund ran. No row means the id is not a review run, and nothing was changed.

Check afterwards (read-only):

```sql
select status, error_code, refunded_at, output is null as output_cleared, citations
  from public.ai_runs where id = '<run id>';

select delta, reason, tool, created_at
  from public.points_ledger where ref = 'ai_run:<run id>' order by created_at;

-- a founder-credit run: restored_at is now set
select u.run_id, u.restored_at, c.kind, c.remaining, c.total
  from public.membership_credit_uses u
  join public.membership_credits c on c.id = u.credit_id
 where u.run_id = '<run id>';
```

Expect `status = 'failed'`, `error_code = 'review_retired'` and `output_cleared = true`. For a points run, `refunded_at` is set and a `usage_refund` ledger row matches the `usage` debit. For a credit run, `restored_at` is set.

---

## Your other steps (no SQL)

### n8n: stop keeping successful runs

The 14 workflow files this batch changed in the repo now say "do not save successful runs". The live instance does not read the repo, so do one of these on each n8n instance that runs them (n8n.asra3.com and ours):
- **Per workflow:** open it → Settings → «Save successful production executions» → **Do not save**, then save. Or re-import the workflow file from the repo.
- **Or for the whole instance:** set `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` in its env and restart it. A workflow's own setting still wins over this default, so check the 14 anyway.

The 14 files, under `n8n/ai/` and `n8n/workflows/` in the repo (on the server under `/www/wwwroot/nzamy/latest-nzamy-full/n8n/`):
- `n8n/ai/`: `assistant.json`, `canvas-card.json`, `communicate.json`, `lib-queries.json`, `library-assistant.json`, `najiz-optimizer.json`, `quick-answer.json`;
- `n8n/workflows/`: `wf-1.1-welcome-new-user.json`, `wf-1.2-lawyer-verification.json`, `wf-2.1-new-request-notify-lawyers.json`, `wf-2.2-request-assigned-notify-client.json`, `wf-2.3-request-completed-review.json`, `wf-4.1-whatsapp-triage.json`, `wf-4.2-consultation-reminder.json`.

### The deleted library-AI routes

- The old free routes `/api/ai/library-chat` and `/api/ai/explain-article` are deleted. After the deploy they answer 404.
- Remove their two env vars from the server, since nothing reads them now: `N8N_LIBRARY_CHAT_WEBHOOK_URL` and `N8N_EXPLAIN_WEBHOOK_URL`, in

```
/www/wwwroot/nzamy/latest-nzamy-full/.env.local
```

- **nzamy-mobile** (internal builds only) still calls both routes. It must move to `/api/v1/ai/runs` with the tool `library-assistant` (5 points, an idempotency key, a different reply shape). Until then an installed internal build loses the library chat and «اشرح لي». The mobile repo:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-mobile
```

### Library settings (admin page; no deploy)

In /dashboard/admin/security → «نشاط المكتبة»:
1. **First** set «إيقاف تلقائي بعد محاولة فتح هذا العدد من الوثائق بعد بلوغ الحد اليومي» (`lock_after_refused`) to **0**. Today's locks never expire on their own, so lowering the caps while it is above 0 would lock real readers until an admin lifts each one.
2. Only then lower the caps. The owner's numbers (gap analysis §3): 90 documents a day, 240 requests an hour, 60 searches an hour, 180 documents per 7 days, 6 hours × 25, the action «إبطاء القارئ تلقائياً», 90-day retention.
   - Two of them wait on question ٤٢٥: the hourly document cap (his package gives a range, 35–120) and «٢٥ وثيقة/ساعة لمدة ٦ ساعات», which can never happen under a 90-a-day cap.
   - «إبطاء» lowers a reader's document caps for a while. It does not slow the library AI; only a lock stops that.

From this deploy on, the operations role can lift a library lock too (q372), not only the super admin. A locked reader now gets the lock answer from the library AI as well.

The gap analysis, for §3:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\docs\audits\2026-11-02-owner-package\00-gap-analysis-and-plan.md
```

### Moyasar live

- Switch to live **only after this deploy**. Before it, the live site still sells the cancelled plans.
- A payment that was **opened before the deploy** for a retired plan or cycle may still be completed afterwards. It is fulfilled like any paid order (ruling R10): the buyer gets what he paid for. While the gateway is in test mode only staff and test accounts can pay, so in practice these can only be test payments.
- Existing holders of a retired plan keep it. Nothing renews automatically today; the renewal policy for retired cycles is an owner question in the report.

### Gemini billing

The privacy page now says we never use users' files to train any AI model. That holds for Google only on a **billed** (paid-tier) Gemini API project: on the free tier, Google's terms let it use the inputs to improve its products. Check in Google Cloud / AI Studio that the project behind the server's Gemini key has billing on.

### Optional follow-up: the library «سابق» toggle

A collapsible block in a law's text now shows as «سابق» (previous text) unless it is known current content: the preamble's موجز and info card, or a summary on the allow-list in

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\laws\[slug]\_details-block.ts
```

(`PREAMBLE_SUMMARY_RE` and `LIVE_ANNEX_SUMMARY_ALLOWLIST`). Some current blocks on prod may have other titles, for example «📊 جدول …». A one-time scan of the `<details>` titles on prod would show which ones to add. This is a developer follow-up, not a step for this deploy.

---

## If a file is re-run later

- **Re-running the 20260518 seed by hand puts 99 / 800 and «مشمول في الباقة» back.** Run Step 3, then Step 4, then Step 6 again.
- **Re-running `_10` puts the note «أو ٥٠٠ نقطة للعقد» back.** Run Step 4 again after any `_10` re-run.

## Rollback (by hand, only if the owner reverses a decision)

Each file's header has its own one-statement rollback, under "ROLLBACK". Undo `_11` first, then `_10`:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261102_11_contract_draft_points_price.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261102_10_retire_cancelled_prices.sql
```

The code part of the batch has no SQL to undo.
