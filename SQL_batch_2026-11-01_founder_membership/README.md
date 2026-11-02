# Lawyer founder membership (2026-11-01): your steps, in order

One SQL file. It is new, it only adds, and it is safe to run twice. It runs in one transaction: if it says `ERROR`, nothing changed. Send us the error and stop.

**Order matters: the SQL goes BEFORE the deploy.**
- The founder checkout reserves a seat with `founder_reserve_seat`, which this file creates.
- If the code goes live first, nothing breaks, but the sale stays shut:
  - the founder card stays hidden;
  - a founder checkout answers 503 and cancels its order;
  - no seat is taken and no money is charged.

**Prerequisites:** these have all run already: `20261021_50`, `20261022_10`, `20261022_30`, `20261027_10` and `20261030_65`. If one is missing, the file stops with an error that names it.

**Real buyers can pay only after the gateway is switched to LIVE (Step 6).** Today the gateway is in test mode. In test mode only staff and the accounts in `public.test_accounts` can pay. For everyone else, guests included, the gateway reads as disabled. On the founder card a signed-in verified lawyer sees the button «الدفع الإلكتروني غير متاح حاليًا» instead of «اشترك الآن»; a direct checkout answers «الدفع الإلكتروني غير متاح حالياً». Whether to turn live on is your and the owner's decision. Make it after the acceptance test in Step 5.

---

## Step 1: the SQL, BEFORE the deploy (Supabase dashboard → SQL Editor, as postgres)

The file on your PC.

In the worktree, before the merge:

```
D:\nzwt\founder\supabase\migrations\20261101_10_founder_membership.sql
```

In the main folder, after `git pull` on main:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261101_10_founder_membership.sql
```

On the server it is here:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261101_10_founder_membership.sql
```

1. Open the file and copy all of it.
2. Paste it into a new query and press **Run**.
3. The result appears on the screen (it is not a file). Expect **one row**:

```
seats | capacity
0     | 1096
```

On a re-run, `seats` is the number of seats already sold or reserved. `capacity` is whatever the admin set, if it was changed.

## Step 2: the check (SQL Editor, new query)

The SQL editor hides NOTICE messages, so run this SELECT and read the row. The result appears on the screen (it is not a file).

```sql
select
  (to_regclass('public.founder_seats') is not null
   and to_regclass('public.membership_credits') is not null
   and to_regclass('public.membership_credit_uses') is not null)                     as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ai_start_run') = 1                    as one_start_run,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ai_fail_run') = 1                     as one_fail_run,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ai_start_run_with_credit') = 1        as one_credit_run,
  coalesce(position('public.membership_credit_uses' in
    (select prosrc from pg_proc where oid = to_regprocedure('public.ai_fail_run(uuid,text,text)'))) > 0, false)
                                                                                      as fail_restores_credit,
  coalesce((select pg_get_constraintdef(oid) from pg_constraint
             where conname = 'payment_orders_kind_check'
               and conrelid = 'public.payment_orders'::regclass) like '%''membership''%', false)
                                                                                      as kind_membership,
  not (has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid,uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.founder_activate(uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.founder_revoke(uuid,text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.founder_seat_summary()', 'EXECUTE'))
                                                                                      as server_only,
  (select value->>'capacity' from public.platform_settings where key = 'founder_campaign') as capacity,
  (select value->>'starts_on' || ' → ' || (value->>'ends_on') from public.platform_settings where key = 'founder_campaign') as sale_window,
  (select on_sale from public.founder_seat_summary())                                  as on_sale;
```

Expect one row:

```
tables | one_start_run | one_fail_run | one_credit_run | fail_restores_credit | kind_membership | server_only | capacity | sale_window             | on_sale
t      | t             | t            | t              | t                    | t               | t           | 1096     | 2026-11-01 → 2027-01-25 | t
```

- Any `f` in the first seven columns means something is wrong. Send us the row and do not deploy.
- `sale_window`: the file moves the start from the old seed date 2026-10-25 to **2026-11-01**. It changes the date only while it still holds that seed. If you see another date, an admin set it, and it was kept.
- `on_sale = t` means the dates include today, the sale is not paused, and seats are left. Nothing is sold yet, because the old code is still live: it has the sale switch off.

## Step 3: deploy (server terminal)

There are no new npm packages in this batch, so `npm install` is not needed.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261101-founder.log 2>&1 &
```

```bash
tail -f /root/deploy-20261101-founder.log
```

## Step 4: `_verify.sql` by hand (server, after the deploy; deploy.sh does not run it)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261101_|_verify: 20261027_10|ERROR"
```

Expect on the screen (it is not a file), and no `ERROR`:
- `_verify: 20261027_10 OK …`
- `_verify: 20261101_10 OK — … capacity 1096; founder functions service role only`

If you see `ai_fail_run lost the founder credit restore`, someone re-ran `20261027_10` after this file. Re-run `20261101_10_founder_membership.sql` (Step 1) and run this step again.

## Step 5: the acceptance test, in TEST mode, with a test account

Do this before anyone outside the team pays. The full steps, in Arabic for the owner, are in:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\docs\audits\2026-11-01-owner-note-founder-membership.ar.md
```

Before you start:
1. **The gateway is in test mode.** Check it in /dashboard/admin/settings → payment gateway: «تجريبي».
2. **Point charging is on.** Run `select value from public.platform_settings where key = 'points_enforcement';` and expect `true`. While it is `false`, every AI tool is free for everyone and no founder credit is spent, so step 4 below cannot show a deduction. If it reads `false`, do **not** turn it on just for this test: it starts charging points on every AI tool for the whole site, which is a pricing decision. Run the test anyway; seeing no deduction is then expected.
3. **The test account.** Use a lawyer test account, never an admin or staff account: an admin account (`user_type = 'admin'`) never spends founder credits. Its licence must be verified (/dashboard/admin/provider-verification → «اعتماد»). It must also be listed in `public.test_accounts`. Check it with this SELECT (the result appears on the screen):

```sql
select ta.user_id, u.email, lp.verification_status, lp.practice_kind
  from public.test_accounts ta
  join auth.users u on u.id = ta.user_id
  left join public.lawyer_profiles lp on lp.user_id = ta.user_id
 where lower(u.email) = lower('<the test account email>');
```

   Expect one row with `verified` and `advocate`.

The test, in short (the owner note has every expected text):
1. **The card.** Open `/pricing?audience=lawyers&campaign=founder-2026#founder-plan` as the test account. The founder card shows:
   - «٢٬٩٩٦ ر.س قبل الضريبة — الإجمالي ٣٬٤٤٥٫٤٠ ر.س»;
   - the seats left.
2. **Declined card, then a retry.**
   - Buy, and pay with one of Moyasar's **declined** test cards (from Moyasar's test-card documentation).
   - Within 2 hours, buy again. It must go to payment again, NOT «أنت عضو مؤسس بالفعل».
   - In «حملة المؤسس», `reserved` stays **1**: it is the same seat.
3. **Pay.** Use the success test card `4111 1111 1111 1111`. The result page says «تم تفعيل عضويتك المؤسِّسة», and the dashboard shows «عضويتي المؤسسة» with ٦ من ٦ and ١ من ١.
4. **One drafter work.** Use one in «الصائغ القانوني». The balance goes to ٥ and no points are deducted. A second turn in the same conversation spends nothing.
5. **Pause, then unpause.** In /dashboard/admin/founder («حملة المؤسس»), press «إيقاف البيع مؤقتًا»: the card disappears from /pricing. Press «استئناف البيع».
6. **Refund.** Refund the order from /dashboard/admin/subscriptions/orders. Then check all of these:
   - the seat is revoked;
   - the credits are 0;
   - the badge is gone;
   - the library access from this order has ended;
   - «المقاعد المتبقية» is back to the capacity.

   A test payment takes a REAL seat on the live database, so this refund is required. Do it **before** Step 6: a test-mode order can be refunded only while the gateway is still in test mode. The refund from the panel is always the full amount; there is no partial refund.

Then check a normal verified lawyer account (not in `test_accounts`): on the founder card the button reads «الدفع الإلكتروني غير متاح حاليًا», not «اشترك الآن».

## Step 6: live payments (a decision, not a step of this batch)

Real buyers can pay only after the gateway is switched to **live** in /dashboard/admin/settings. Live mode needs three things, or the gateway reads as disabled:
- the `sk_live_` / `pk_live_` Moyasar keys in the server `.env` (never in chat);
- the webhook secret;
- a complete `billing_company` (name, CR number, VAT number and address).

Between the deploy and the live switch, the founder card is visible to everyone. For a normal verified lawyer the button reads «الدفع الإلكتروني غير متاح حاليًا», and no seat is taken. **Send no WhatsApp message and no campaign link until the gateway is live.**

## To close the sale in an emergency

- **No deploy:** /dashboard/admin/founder → «إيقاف البيع مؤقتًا». The card disappears and every new founder checkout is refused. Members keep everything. «استئناف البيع» reopens it.
- **With a deploy:** set `FOUNDER_MEMBERSHIP_ON_SALE = false` in `src/lib/pricing/campaigns.ts`.

## Rollback (only before any seat is sold)

Follow the order in the header of `20261101_10_founder_membership.sql` exactly, under "ROLLBACK":
1. re-run `20261027_10_ai_runs.sql`, which puts back `ai_fail_run` without the credit restore;
2. drop `ai_start_run_with_credit`;
3. drop the 7 founder functions;
4. drop the three tables last.

Dropping the tables first would make every AI failure, and every points refund, fail.
