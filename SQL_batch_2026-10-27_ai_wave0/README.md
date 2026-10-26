# AI wave 0 (2026-10-27): the foundation — run order

What this batch adds (plan: `docs/plans/2026-10-26-ai-services-n8n-plan.md`, wave 0):
- `public.ai_runs`: one row per AI tool run;
- `ai_start_run`, which checks the daily limit and the points balance and does the debit in **one** transaction;
- `ai_fail_run`, which refunds a failed run back to the same points lots;
- the sweeper and the 90-day retention function;
- the routes `/api/v1/ai/runs`, `/api/v1/ai/callback`, `/api/v1/cron/ai-sweep` and `/api/v1/admin/ai-runs`;
- the admin page `/dashboard/admin/ai-usage`.

No tool is open to users yet. Every tool starts **off**, and the only tools are the two round-trip tests `echo-fast` and `echo-job`.

The Docker test is `supabase/tests/rls/ai_runs.test.sql`. Its chain is in the file header; the migration runs twice, and there is a negative control.

## Steps

| # | What | Where | Send us |
|:-:|---|---|---|
| 1 | `10_BEFORE_DEPLOY_20261027_10_ai_runs.sql` | SQL editor | The line `20261027_10 verify: OK …` |
| 2 | Add 3 lines to `.env.production.local` (below) | Server | — |
| 3 | `git pull`, then deploy (nohup, as usual) | Server | The last lines of the deploy log |
| 4 | `_verify.sql` by hand (command below) | Server, `supabase_admin` | The line `_verify: 20261027_10 OK …` |
| 5 | Paste the 3 secret values into the n8n credentials (below) | n8n.asra3.com | Just say "done". **Never paste the keys in chat** |
| 6 | Tell me, and I switch the two test workflows on in n8n | — | — |
| 7 | Add the two schedules in n8n (below), **before** any charge test: the sweeper is what refunds a run left stuck | n8n | — |
| 8 | Run the round-trip test (below) | `/dashboard/admin/ai-usage` | A screenshot of the result and the runs table |

### Step 2: server env
The values of the two keys are in **`.env.ai-keys`** at the root of your local checkout. It's ignored by git, and I generated it; it was never printed.

```
N8N_AI_BASE_URL=https://n8n.asra3.com/webhook
NZAMY_AI_KEY=<the NZAMY_AI_KEY line from .env.ai-keys>
NZAMY_AI_CALLBACK_KEY=<the NZAMY_AI_CALLBACK_KEY line from .env.ai-keys>
```

`NEXT_PUBLIC_SITE_URL` must stay `https://nezamy.sa`, because the callback URL is built from it.

### Step 4: `_verify` by hand

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql
```

### Step 5: n8n credentials (already created, with placeholder values)
In n8n, go to **Credentials**, open each one, and replace the value:

| Credential | Header name (already set) | Value |
|---|---|---|
| `NZAMY AI · inbound` | `X-Nzamy-Key` | `NZAMY_AI_KEY` from `.env.ai-keys` |
| `NZAMY AI · callback` | `X-Nzamy-Key` | `NZAMY_AI_CALLBACK_KEY` from `.env.ai-keys` |
| `NZAMY Anthropic (x-api-key)` | `x-api-key` | your Anthropic API key (console.anthropic.com → API keys). **Set a monthly spend limit there too** |

### Step 7: schedules in n8n
Both are `POST` with header `x-cron-secret: <CRON_SECRET>`:
- every 10 minutes: `https://nezamy.sa/api/v1/cron/ai-sweep` (fails and refunds runs stuck past their deadline);
- daily at 03:30: `https://nezamy.sa/api/v1/cron/ai-sweep?task=retention` (clears inputs and outputs older than 90 days).

### Step 8: the round-trip test
1. In `/dashboard/admin/ai-usage`, set `echo-fast` and `echo-job` to **مفعّلة** and press **حفظ**.
2. Type a word and press **echo-fast**. The answer should come back in about a second, and a row should appear as «نجح».
3. Press **echo-job**. The status goes «running», then «done» within a few seconds; it arrives through the callback.
4. Tick **عبر النموذج (Claude)** and repeat both. This proves the Anthropic key.
5. **Charge test** (an admin is never charged, so use a test lawyer account):
   1. Grant the test account 10 points from admin → النقاط.
   2. Turn `points_enforcement` on. Nothing else in the platform reads it yet; only AI runs do.
   3. Signed in as the test account, open the browser console on nezamy.sa and run:

      ```js
      fetch('/api/v1/ai/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:'echo-fast',input:{text:'test'},idempotencyKey:crypto.randomUUID()})}).then(r=>r.json()).then(console.log)
      ```

   4. Expect `chargedPoints: 1`, and the balance drops to 9.
6. When done, set both echo tools back to **متوقفة**, and `points_enforcement` back to off. Charging stays off during the free trial (decision D1).

## Also in this deploy (no SQL)
- `/api/v1/cron/deadlines` and `/api/v1/n8n/callback` now compare their secrets in constant time (`cronSecretMatches`).
- `/api/v1/contact` now sends `X-Webhook-Secret` to n8n, with a 5-second timeout.
- `/api/v1/ai/callback` is exempt from the general rate limit, like the payments webhook.
