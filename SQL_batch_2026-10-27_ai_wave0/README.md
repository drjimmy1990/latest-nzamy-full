# AI wave 0 (2026-10-27): the foundation — your steps

What this batch adds (plan: `docs/plans/2026-10-26-ai-services-n8n-plan.md`, wave 0):
- `public.ai_runs`: one row per AI tool run;
- `ai_start_run`, which checks the daily limit and the points balance and does the debit in **one** transaction;
- `ai_fail_run`, which refunds a failed run back to the same points lots;
- the sweeper and the 90-day retention function;
- the routes `/api/v1/ai/runs`, `/api/v1/ai/callback`, `/api/v1/cron/ai-sweep` and `/api/v1/admin/ai-runs`;
- the admin page `/dashboard/admin/ai-usage`.

No tool is open to users. Every tool starts **off**; the only tools are the round-trip tests `echo-fast` and `echo-job`. The Docker test is `supabase/tests/rls/ai_runs.test.sql`.

Already done on n8n.asra3.com, all **inactive**, with placeholder values:

| Credential | Header name |
|---|---|
| `NZAMY AI · inbound` | `X-Nzamy-Key` |
| `NZAMY AI · callback` | `X-Nzamy-Key` |
| `NZAMY Anthropic (x-api-key)` | `x-api-key` |
| `NZAMY cron (x-cron-secret)` | `x-cron-secret` |

The workflows: `NZAMY · AI · echo-fast (wave 0 test)`, `NZAMY · AI · echo-job (wave 0 test)` and `NZAMY · AI · schedules (sweep 10 min + retention daily)`.

---

## Step 1: the SQL (SQL editor)
1. Open the Supabase dashboard → **SQL Editor** → New query.
2. Paste the whole of `10_BEFORE_DEPLOY_20261027_10_ai_runs.sql` and press **Run**.
3. At the bottom you should see:
   `NOTICE: 20261027_10 verify: OK — ai_runs (0 rows), start / fail / sweep / retention service role only; points_enforcement = false`
4. **Send us that line.** If it says `ERROR`, send the error and stop.

## Step 2: the server env
1. On the server: `cd /www/wwwroot/nzamy/latest-nzamy-full`
2. On your PC, open **`.env.ai-keys`** in the repo root. It's ignored by git; I generated it and it was never printed. It has two lines, `NZAMY_AI_KEY=…` and `NZAMY_AI_CALLBACK_KEY=…`.
3. On the server: `nano .env.production.local`, and add at the end:
   ```
   N8N_AI_BASE_URL=https://n8n.asra3.com/webhook
   NZAMY_AI_KEY=<paste the value from .env.ai-keys>
   NZAMY_AI_CALLBACK_KEY=<paste the value from .env.ai-keys>
   ```
4. In the same file, check that `NEXT_PUBLIC_SITE_URL=https://nezamy.sa` is there (the callback URL is built from it). Also find `CRON_SECRET=`; you need its value in step 5.
5. Save: Ctrl+O, Enter, Ctrl+X.

## Step 3: deploy
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull && nohup bash deploy.sh > /root/deploy-20261027.log 2>&1 &
```
```bash
tail -f /root/deploy-20261027.log
```
Wait for the end of the deploy (Ctrl+C stops watching only, not the deploy). **Send us the last 10 lines.** No new npm packages in this batch, so no `npm install`.

## Step 4: `_verify` by hand (server)
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "20261027|ERROR"
```
**Send us** the line `_verify: 20261027_10 OK — …`.

## Step 5: the four secret values in n8n (n8n.asra3.com)
Go to **Overview** → **Credentials** tab. Open each credential below, replace the **Value** field (keep the Name as it is), and **Save**:

| Credential | Value to paste |
|---|---|
| `NZAMY AI · inbound` | `NZAMY_AI_KEY` from `.env.ai-keys` (the same as the server) |
| `NZAMY AI · callback` | `NZAMY_AI_CALLBACK_KEY` from `.env.ai-keys` |
| `NZAMY cron (x-cron-secret)` | `CRON_SECRET` from the server's `.env.production.local` |
| `NZAMY Anthropic (x-api-key)` | your Anthropic API key (below) |

**The Anthropic key** (console.anthropic.com):
1. Sign in, then **Settings → Billing**: add credit (start with $20–50).
2. **Settings → Limits**: set a **monthly spend limit**, e.g. $50 for the trial.
3. **Settings → API keys → Create key**, named `nzamy-n8n`. Copy it right away; it's shown once.
4. Paste it into `NZAMY Anthropic (x-api-key)` and nowhere else.

**Never paste any of these keys in chat.** Just tell us "step 5 done".

## Step 6: switch the n8n workflows on
In n8n, open each workflow and flip **Active** on (top right):
1. `NZAMY · AI · schedules (sweep 10 min + retention daily)`: the sweeper refunds any run left stuck, so it must be on **before** any charge test.
2. `NZAMY · AI · echo-fast (wave 0 test)`
3. `NZAMY · AI · echo-job (wave 0 test)`

Or tell us and we switch them on through the n8n connection.

## Step 7: the round-trip test (`https://nezamy.sa/dashboard/admin/ai-usage`, as admin)
1. In **الأدوات**, set `echo-fast` and `echo-job` to **مفعّلة**, then **حفظ**. The green message is «حُفظت إعدادات الأدوات».
2. In **اختبار الاتصال مع n8n**, leave the text, keep «عبر النموذج» **unticked**, and press **echo-fast**. Expect `الحالة: done` and `{"echo": "اختبار الاتصال"}` within about 2 s.
3. Press **echo-job**. Expect `running`, then `done` within about 5 s; this proves the callback.
4. Tick **عبر النموذج (Claude)** and press both again. Expect the same echo, now written by Claude. This proves the Anthropic key.
5. **Send us a screenshot** of the result box and the «آخر التشغيلات» table. Each run should show «نجح», with tokens for the Claude runs.

## Step 8: the charge test (with a test lawyer account; admins are never charged)
1. Admin → **المستخدمون** → open the test lawyer → **منح رصيد**: amount `10`, description `AI wave 0 test` → confirm.
2. Turn charging on (SQL editor):
   ```sql
   update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
   ```
   Only the AI runs read this switch today; nothing else starts charging.
3. In a **private window**, sign in as the test lawyer on nezamy.sa, open the browser console (F12 → Console), and run:
   ```js
   fetch('/api/v1/ai/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:'echo-fast',input:{text:'test'},idempotencyKey:crypto.randomUUID()})}).then(r=>r.json()).then(console.log)
   ```
   Expect `{runId: …, status: "succeeded", output: {echo: "test"}, chargedPoints: 1}`. The account's balance is now **9**, and the admin runs table shows `1`.
4. Turn charging back off (the free trial, decision D1):
   ```sql
   update public.platform_settings set value = 'false'::jsonb where key = 'points_enforcement';
   ```
5. Back in `/dashboard/admin/ai-usage`, set both echo tools to **متوقفة** → **حفظ**.
6. **Send us** the console result.

After step 8 we run the timing check (`scripts/ai-timing-probe.mjs`, 20 Sonnet calls straight to n8n). Then wave 1 starts: المتحدث الذكي, then منقح ناجز.

---

## Also in this deploy (no action needed)
- `/api/v1/cron/deadlines` and `/api/v1/n8n/callback` now compare their secrets in constant time.
- `/api/v1/contact` now sends `X-Webhook-Secret` to n8n, with a 5-second timeout.
- `/api/v1/ai/callback` is exempt from the general rate limit, like the payments webhook.
