-- ════════════════════════════════════════════════════════════════════════════
-- One-time data change (NOT a migration) — owner answer ٢٠٤ (decisions of
-- 2026-10-18): access handed out under the OLD model, before the library / AI
-- split, ends. Written 2026-10-19.
--
-- SCOPE — the owner's answer to question ٢٢٤ (2026-10-20):
--   «(أ) — نلغي الاشتراكات والتجارب السابقة وتبقى أرصدة النقاط (مع الإبقاء
--   الإلزامي على الحسابات التجريبية Test Accounts الخاصة باختباراتنا)»
--   So: previous subscriptions and trials are cancelled; points / credits stay
--   exactly as they are (this file never touches them); and every test account
--   (public.test_accounts, migration 20261017_44) is spared — its rows and its
--   tier stay as they are (see SPARED below).
--
-- Run by the user in the self-hosted SQL Editor (auth.nezamy.sa, as postgres),
-- block by block, AFTER the batch that splits the library from the AI tools is
-- deployed. The owner never runs it.
-- Tested on a throwaway Postgres: supabase/tests/rls/wipe_subscriptions.test.sql
-- (old live rows cancelled, rows after the cutoff and accounts an admin acted
-- on after it kept, test accounts' rows and tier kept, metadata free only for
-- non-admin, non-test accounts left with nothing, library grants and credits
-- untouched, a second run changes nothing, every missing or bad setting
-- raises and changes nothing, a missing public.test_accounts raises and
-- changes nothing, a cutoff typed in block 1 never reaches block 2).
--
-- WHY A CUTOFF: until the deploy that split the library from the AI tools —
--   the deploy of the 18-Oct owner-decisions batch (main 9215ce6c, deployed
--   by the user on 2026-10-19); "the deploy" below always means THAT one —
--   every grant path (src/lib/entitlements.ts
--   grantEntitlement, the admin subscriptions page, invite-code trials)
--   wrote a public.subscriptions row and stamped auth user_metadata.tier — a
--   library approval gave the whole "pro" tier, AI tools included. After the
--   deploy, library access is written to public.library_access_grants, and a
--   subscriptions row is a deliberate tier grant under the new model. So:
--   rows created BEFORE the deploy finished go; rows created after it stay;
--   an account an admin acted on after the deploy is a post-split decision,
--   so it stays too; and test accounts stay whatever their dates (see SPARED
--   below).
--
-- WHAT CHANGES (block 2, one transaction, all-or-nothing):
--   * public.subscriptions — every row with status active / trialing /
--     past_due, created_at before the cutoff, and not SPARED: status
--     'cancelled', cancelled_at now, auto_renew false, current_period_end
--     moved back to now if it was later (or empty), and metadata gains
--     {"wiped_at": <now>, "wipe": "owner-204"} (its other keys stay; this is
--     how the cancelled rows can be found later). tier is not changed.
--   * auth.users.raw_user_meta_data.tier → "free" (the other keys stay), only
--     for accounts that are NOT admins (public.profiles.user_type = 'admin'),
--     not SPARED, and left with NO active / trialing / past_due subscription
--     after the update above. An account holding a row created after the
--     cutoff keeps its tier; admins' metadata is not touched.
-- SPARED — three classes (block 1 (d) lists all three, with the time):
--   * every TEST ACCOUNT (owner ٢٢٤: «مع الإبقاء الإلزامي على الحسابات
--     التجريبية») — ALL its subscription rows stay as they are and its tier
--     is not reset, whatever their dates. A test account is one that is
--     EITHER in public.test_accounts OR has an auth.users e-mail matching the
--     test-account patterns of migration 20261017_44's backfill (…@nzamy.test,
--     lawyer1…lawyer10@nezamy.sa, and the 12 role accounts …@nezamy.sa), so
--     an account created after that one-time backfill and never registered
--     (the UAT kit does not register its accounts) is spared too. The file
--     never writes public.test_accounts. The list lives in ONE query, written
--     out twice because block 1 and block 2 are separate transactions that
--     cannot share it (the «TEST ACCOUNTS — begin … end» lines in block 1's
--     first statement and at the top of block 2): the two copies must stay
--     identical, and identical to 20261017_44's e-mail list — the Docker test
--     checks both. Block 2 raises and changes nothing when
--     public.test_accounts does not exist (an old restore without migration
--     20261017_44).
--   Older than the cutoff, but an admin acted on it after the deploy:
--   * a live row whose updated_at is at or after the cutoff — the admin user
--     page's «تغيير الخطة» (PATCH /api/v1/admin/subscriptions/[id]) edits the
--     row in place, so created_at stays old and only updated_at moves;
--   * every row and the metadata of an account with an entitlement_requests
--     row of kind plan or media, status approved, decided_at at or after the
--     cutoff — approving a request when the account already holds an equal or
--     better live row writes no row; only the request records the decision.
-- WHAT IT KEEPS: public.library_access_grants (new-model library grants,
--   founder grants included) — never touched; points / credits
--   (lawyer_profiles.credit_balance, credit_transactions) — never touched
--   (owner ٢٢٤: «وتبقى أرصدة النقاط»); subscriptions already cancelled /
--   expired; the rows created after the cutoff; the SPARED rows and accounts,
--   test accounts included (registered or matched by e-mail);
--   entitlement_requests and public.test_accounts (read, never written);
--   every other table.
--
-- THE TWO SETTINGS (block 2 refuses to run without both):
--   nzamy.confirm_wipe = 'WIPE-2026-10-19'
--   nzamy.wipe_cutoff  = the time the deploy that SPLIT the library from the
--                        AI tools finished: the deploy of the 18-Oct
--                        owner-decisions batch (main 9215ce6c, deployed by
--                        the user on 2026-10-19) —
--                        «وقت انتهاء نشر دفعة ١٨ أكتوبر (فصل المكتبة عن
--                        أدوات الذكاء، commit 9215ce6c) — وليس وقت نشر أي
--                        دفعة بعدها». NOT the time of any later deploy (in
--                        particular NOT the founder-campaign batch's): a
--                        later time would cancel the deliberate new-model
--                        subscriptions approved in between.
--                        It ends in an explicit UTC offset —
--                        '2026-10-19 21:30:00+03',
--                        '2026-10-19 21:30+03:00' or '2026-10-19T18:30:00Z'.
--                        Block 2 refuses a time without one: the editor's
--                        session runs in UTC, so '2026-10-19 21:30' would be
--                        read three hours late and cancel grants made after
--                        the deploy.
--   HOW TO FIND THAT TIME (not from the build now live: a later deploy
--   replaced it, so `bash deploy.sh --status` no longer shows that build):
--     * the deploy log of that run. The run order starts deploy.sh as
--         nohup bash deploy.sh > /root/deploy-$(date +%F).log 2>&1 &
--       so on the app server:
--         grep -n 'Deploying\|Deployed' /root/deploy-2026-10-19.log
--         ls -l --time-style=full-iso /root/deploy-2026-10-19.log
--       The «Deploying …» line must name 9215ce6… (if it names a later commit,
--       a later deploy that day overwrote the file and its time is too late);
--       the file's last-modified time is when its last line «✔ Deployed …»
--       was written — the end of the deploy. Type it with the offset `ls`
--       prints.
--     * NOT `git log -1 --format=%cI 9215ce6c` (2026-10-18T22:58:50+03:00):
--       that is when the commit was made, not when it went live.
--     * a cross-check from the data: only the new code writes
--       public.library_access_grants (20261019_10 creates it empty), so the
--       cutoff must not be LATER than
--         select min(created_at) from public.library_access_grants;
--       (no rows → no bound).
--   How to set them in the SQL Editor: in block 2, remove the two dashes at
--   the start of BOTH `set local` lines and type that time (the end of the
--   18-Oct batch's deploy) in place of the <DEPLOY-TIME-WITH-OFFSET>
--   placeholder. (Same effect, same place:
--     select set_config('nzamy.confirm_wipe', 'WIPE-2026-10-19', true);
--     select set_config('nzamy.wipe_cutoff', '<DEPLOY-TIME-WITH-OFFSET>', true);)
--   Every setting in this file lasts only for the transaction it is set in
--   (`set local`, or set_config with true as its third argument). Block 1 runs
--   in its own read-only transaction that ends with rollback, so a cutoff
--   typed in block 1 never reaches block 2 — block 2 needs its own line.
--   As written — all three lines commented out — pasting the whole file and
--   pressing Run changes NOTHING: block 1 shows its lists, then block 2
--   raises "NOT confirmed" and the editor stops there (block 3 does not run;
--   see the `rollback;` note at the end of this header).
--
-- ORDER:
--   1. Run block 1 alone, with its set_config line un-commented and the
--      cutoff (the end of the 18-Oct batch's deploy, 9215ce6c — see THE TWO
--      SETTINGS) typed in place of the placeholder. Read: (0) how the cutoff
--      is read and whether block 2 will accept it; (a) the live rows by tier,
--      status and where they came from; (b) the accounts whose metadata tier
--      is not free and what block 2 will do to each; (d) what block 2 SPARES.
--      Block 1 stops at its first statement if public.test_accounts does not
--      exist — apply migration 20261017_44 first.
--   2. Set block 2's cutoff to the same time — the end of the 18-Oct batch's
--      deploy (9215ce6c), not of any deploy after it. Check
--      block 1 (d): every account listed there is a test account or one an
--      admin acted on after the deploy, and block 2 leaves its rows and tier
--      as they are.
--   3. Run block 2 alone. It raises and changes nothing if the confirmation is
--      missing, or the cutoff is missing, has no UTC offset, is not a time, or
--      is in the future, or public.test_accounts does not exist; it rolls back
--      if any live row it should have cancelled remains, a non-admin,
--      non-spared account left with no live row still carries a tier other
--      than free, or a test account lost a live row or its tier.
--      Safe to run twice: the second run changes nothing.
--   4. Run block 3 and compare with block 1.
--
-- A WAY BACK: the data keeps no copy of each row's previous status / period
--   end. If one is wanted, take a dump on the server BEFORE block 2:
--     docker exec <db container> pg_dump -U postgres -t public.subscriptions \
--       --data-only -Fc > ~/subscriptions-before-204-$(date +%F).dump
--   The metadata tier is a copy shown in the browser; subscriptions are what
--   the server checks.
--
-- IF STUDIO THEN SAYS "current transaction is aborted": run   rollback;
-- (an error inside block 1 or block 2 leaves its transaction open on that
-- connection).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — read-only, in its own transaction; run alone.
begin transaction read only;

-- The test accounts (owner ٢٢٤): the registry must exist (block 2 refuses to
-- run without it), and the accounts it lists or whose e-mail matches
-- 20261017_44's patterns are kept for (b) and (d) in nzamy.wipe_test_ids,
-- which lasts only until this block's rollback. Run (b) and (d) after it.
do $$
begin
  if to_regclass('public.test_accounts') is null then
    raise exception 'preview (owner ٢٢٤): public.test_accounts does not exist — apply migration 20261017_44 first; block 2 refuses to run without it (the test accounts could not be spared).';
  end if;
  perform set_config('nzamy.wipe_test_ids', coalesce((select string_agg(x.id::text, ',') from (
    -- ── TEST ACCOUNTS (owner ٢٢٤) — begin. Mirrors the backfill of migration
    --    20261017_44; the two copies (block 1, block 2) must stay identical. ──
    select t.user_id as id from public.test_accounts t
    union
    select u.id from auth.users u
     where lower(u.email) like '%@nzamy.test'
        or lower(u.email) ~ '^lawyer([1-9]|10)@nezamy\.sa$'
        or lower(u.email) in (
             'admin@nezamy.sa', 'client-free@nezamy.sa', 'client-pro@nezamy.sa',
             'lawyer-solo@nezamy.sa', 'firm-owner@nezamy.sa', 'firm-lawyer@nezamy.sa',
             'corp-owner@nezamy.sa', 'corp-legal@nezamy.sa', 'micro-owner@nezamy.sa',
             'provider-notary@nezamy.sa', 'gov-counsel@nezamy.sa', 'ngo-director@nezamy.sa')
    -- ── TEST ACCOUNTS — end ──
  ) x), ''), true);
end $$;

-- Un-comment and type the time the 18-Oct batch's deploy (9215ce6c, the
-- library / AI split) finished — not a later deploy's — WITH its offset, in
-- place of the placeholder (as typed, it fails; see the header). It fills the cutoff columns and lists
-- (b) and (d). It lasts only until this block's rollback — block 2 never sees it.
-- select set_config('nzamy.wipe_cutoff', '<DEPLOY-TIME-WITH-OFFSET>', true);

-- (0) the cutoff as block 1 reads it, and whether block 2 will accept it
select nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '') as cutoff_typed,
       nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '')::timestamptz
         at time zone 'Asia/Riyadh' as cutoff_in_riyadh_time,
       coalesce(btrim(current_setting('nzamy.wipe_cutoff', true))
                  ~ '[0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?\s*([+-][0-9]{2}(:?[0-9]{2})?|[Zz])$',
                false) as block_2_accepts_it;

-- (a) live subscriptions (active / trialing / past_due) by tier, status and
--     where they came from. The grant code writes metadata.method
--     (admin_grant, admin_assignment); metadata.source is shown as well.
with cutoff as (
  select nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '')::timestamptz as at
)
select s.tier, s.status,
       s.metadata->>'source' as source,
       s.metadata->>'method' as method,
       count(*) as live_rows,
       case when c.at is null then null
            else count(*) filter (where s.created_at < c.at) end as created_before_cutoff,
       min(s.created_at) as oldest,
       max(s.created_at) as newest
  from public.subscriptions s
 cross join cutoff c
 where s.status in ('active', 'trialing', 'past_due')
 group by s.tier, s.status, s.metadata->>'source', s.metadata->>'method', c.at
 order by s.tier, s.status, source nulls last, method nulls last;

-- (b) accounts whose metadata tier is not free, and what block 2 will do.
with cutoff as (
  select nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '')::timestamptz as at
)
select u.id, u.email, p.user_type,
       u.raw_user_meta_data->>'tier' as metadata_tier,
       (select count(*) from public.subscriptions s
         where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due')) as live_rows,
       case when p.user_type = 'admin' then 'kept (admin)'
            when u.id = any (string_to_array(current_setting('nzamy.wipe_test_ids'), ',')::uuid[])
              then 'kept (a test account, owner ٢٢٤ — see (d))'
            when c.at is null then '(set the cutoff to see)'
            when exists (select 1 from public.entitlement_requests er
                          where er.user_id = u.id and er.kind in ('plan', 'media')
                            and er.status = 'approved' and er.decided_at >= c.at)
              then 'kept (a request approved after the cutoff — see (d))'
            when exists (select 1 from public.subscriptions s
                          where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due')
                            and s.created_at >= c.at)
              then 'kept (a subscription created after the cutoff)'
            when exists (select 1 from public.subscriptions s
                          where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due')
                            and s.updated_at >= c.at)
              then 'kept (a subscription changed after the cutoff — see (d))'
            else 'reset to free' end as block_2_will
  from auth.users u
  left join public.profiles p on p.id = u.id
 cross join cutoff c
 where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
 order by p.user_type nulls last, u.email;

-- (c) for the record: the library grants this file leaves alone, and whether
--     this role may write the metadata (if not, block 2 fails as a whole).
do $$
declare
  n bigint;
begin
  if to_regclass('public.library_access_grants') is not null then
    execute 'select count(*) from public.library_access_grants' into n;
    raise notice 'library_access_grants: % rows — not touched by this file', n;
  end if;
  if not has_column_privilege('auth.users', 'raw_user_meta_data', 'UPDATE') then
    raise notice 'WARNING: % may not UPDATE auth.users.raw_user_meta_data — block 2 would fail and change nothing', current_user;
  end if;
end $$;

-- (d) what block 2 SPARES: the test accounts that hold a live row or a tier
--     other than free (owner ٢٢٤ — listed with or without a cutoff; at = when
--     the account was registered; «a test account by e-mail» = NOT in
--     public.test_accounts, spared because its e-mail matches 20261017_44's
--     patterns — check each one is really a test account), and, older than
--     the cutoff, live rows an admin changed after it and accounts with a
--     plan / media request approved after it. tier = the row's tier, or the
--     account's metadata tier.
with cutoff as (
  select nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '')::timestamptz as at
)
select u.id as user_id, u.email::text as email,
       case when t.user_id is not null then 'a test account (owner ٢٢٤)'
            else 'a test account by e-mail (owner ٢٢٤)' end::text as spared_because,
       u.raw_user_meta_data->>'tier' as tier, t.created_at as at,
       (coalesce('registered by ' || t.source, 'not in public.test_accounts — its e-mail matches') || '; '
        || (select count(*) from public.subscriptions s
             where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'))::text
        || ' live row(s) kept') as detail
  from auth.users u
  left join public.test_accounts t on t.user_id = u.id
 where u.id = any (string_to_array(current_setting('nzamy.wipe_test_ids'), ',')::uuid[])
   and (coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
        or exists (select 1 from public.subscriptions s
                    where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due')))
union all
select s.user_id, u.email::text,
       'a subscription changed after the cutoff'::text as spared_because,
       s.tier, s.updated_at as at, ('subscription ' || s.id::text) as detail
  from public.subscriptions s
  join cutoff c on c.at is not null
  left join auth.users u on u.id = s.user_id
 where s.status in ('active', 'trialing', 'past_due')
   and s.created_at < c.at and s.updated_at >= c.at
union all
select er.user_id, u.email::text,
       ('a ' || er.kind || ' request approved after the cutoff'),
       u.raw_user_meta_data->>'tier', er.decided_at,
       ('request ' || er.id::text || coalesce(' — ' || er.requested_ref, ''))
  from public.entitlement_requests er
  join cutoff c on c.at is not null
  left join auth.users u on u.id = er.user_id
 where er.kind in ('plan', 'media') and er.status = 'approved' and er.decided_at >= c.at
union all
select null::uuid, null::text,
       '(un-comment the set_config line at the top of block 1 to see this list)',
       null::text, null::timestamptz, null::text
  from cutoff c
 where c.at is null
 order by 5 nulls first, 1;

rollback;

-- 2) WIPE — one transaction. It changes NOTHING until you remove the two
--    dashes at the start of BOTH `set local` lines below and type, in place
--    of the placeholder and WITH its offset (e.g. '2026-10-19 21:30:00+03'),
--    the time the 18-Oct batch's deploy finished — the library / AI split,
--    9215ce6c, deployed 2026-10-19 — NOT the time of any later deploy (the
--    founder-campaign batch's included). See the header for how to find it.
begin;

-- set local nzamy.confirm_wipe = 'WIPE-2026-10-19';
-- set local nzamy.wipe_cutoff = '<DEPLOY-TIME-WITH-OFFSET>';

do $$
declare
  v_cutoff_text  text := nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '');
  v_cutoff       timestamptz;
  v_cancelled    bigint;
  v_reset        bigint;
  v_kept         bigint;
  v_spared_rows  bigint;
  v_spared_users bigint;
  v_test_ids     uuid[];
  v_spared_tests bigint;
  v_tests_email  bigint;
  v_tests_after  bigint;
  v_left         bigint;
begin
  if coalesce(current_setting('nzamy.confirm_wipe', true), '') <> 'WIPE-2026-10-19' then
    raise exception 'wipe subscriptions (owner ٢٠٤): NOT confirmed — nothing changed. Remove the two dashes before both "set local" lines in block 2, type the time the 18-Oct batch''s deploy finished (the library / AI split, 9215ce6c — not any later deploy), then run block 2 alone.';
  end if;
  if v_cutoff_text is null then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff is not set — nothing changed. Type the time the 18-Oct batch''s deploy finished (the library / AI split, 9215ce6c, deployed 2026-10-19 — NOT the time of any later deploy) in block 2''s "set local nzamy.wipe_cutoff" line, e.g. ''2026-10-19 21:30:00+03'' (a cutoff typed in block 1 does not reach block 2).';
  end if;
  -- An explicit UTC offset, checked on the raw text before the cast: the
  -- session runs in UTC, so a time without one would be read three hours late.
  if v_cutoff_text !~ '[0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?\s*([+-][0-9]{2}(:?[0-9]{2})?|[Zz])$' then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff "%" does not end in a UTC offset — nothing changed. Type the time the 18-Oct batch''s deploy finished (9215ce6c — not any later deploy) WITH its offset, e.g. ''2026-10-19 21:30:00+03'' or ''2026-10-19T18:30:00Z''.', v_cutoff_text;
  end if;
  begin
    v_cutoff := v_cutoff_text::timestamptz;
  exception when others then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff "%" is not a time — nothing changed. Type it like ''2026-10-19 21:30:00+03''.', v_cutoff_text;
  end;
  if v_cutoff > now() then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff % is in the future — nothing changed. It is the time the 18-Oct batch''s deploy FINISHED (the library / AI split, 9215ce6c, deployed 2026-10-19), not the time of any later deploy: a later time would cancel subscriptions granted after that deploy.', v_cutoff;
  end if;
  -- Owner ٢٢٤: test accounts are spared, so the registry must exist BEFORE any
  -- change (an old restore without migration 20261017_44 would wipe them).
  if to_regclass('public.test_accounts') is null then
    raise exception 'wipe subscriptions (owner ٢٢٤): public.test_accounts does not exist — nothing changed. Apply migration 20261017_44 first: without it the test accounts could not be spared.';
  end if;
  -- The test accounts: registered, or matched by e-mail (see SPARED).
  select coalesce(array_agg(x.id), '{}') into v_test_ids from (
    -- ── TEST ACCOUNTS (owner ٢٢٤) — begin. Mirrors the backfill of migration
    --    20261017_44; the two copies (block 1, block 2) must stay identical. ──
    select t.user_id as id from public.test_accounts t
    union
    select u.id from auth.users u
     where lower(u.email) like '%@nzamy.test'
        or lower(u.email) ~ '^lawyer([1-9]|10)@nezamy\.sa$'
        or lower(u.email) in (
             'admin@nezamy.sa', 'client-free@nezamy.sa', 'client-pro@nezamy.sa',
             'lawyer-solo@nezamy.sa', 'firm-owner@nezamy.sa', 'firm-lawyer@nezamy.sa',
             'corp-owner@nezamy.sa', 'corp-legal@nezamy.sa', 'micro-owner@nezamy.sa',
             'provider-notary@nezamy.sa', 'gov-counsel@nezamy.sa', 'ngo-director@nezamy.sa')
    -- ── TEST ACCOUNTS — end ──
  ) x;

  -- SPARED (counted for the notice): rows an admin changed after the cutoff,
  -- and accounts with a plan / media request approved after it.
  select count(*) into v_spared_rows from public.subscriptions
   where status in ('active', 'trialing', 'past_due')
     and created_at < v_cutoff and updated_at >= v_cutoff;
  select count(distinct user_id) into v_spared_users from public.entitlement_requests
   where kind in ('plan', 'media') and status = 'approved' and decided_at >= v_cutoff;
  -- Test accounts (owner ٢٢٤) the wipe would otherwise touch: a live row
  -- created before the cutoff, or a tier other than free (and how many of them
  -- are spared by e-mail only). Counted again after the change: the two
  -- counts must match.
  select count(*),
         count(*) filter (where not exists (select 1 from public.test_accounts r where r.user_id = t.user_id))
    into v_spared_tests, v_tests_email
    from unnest(v_test_ids) as t(user_id)
   where exists (select 1 from public.subscriptions s
                  where s.user_id = t.user_id and s.status in ('active', 'trialing', 'past_due')
                    and s.created_at < v_cutoff)
      or exists (select 1 from auth.users u
                  where u.id = t.user_id and coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free');

  update public.subscriptions s
     set status = 'cancelled',
         cancelled_at = now(),
         auto_renew = false,
         current_period_end = least(coalesce(s.current_period_end, now()), now()),
         metadata = s.metadata || jsonb_build_object('wiped_at', now(), 'wipe', 'owner-204')
   where s.status in ('active', 'trialing', 'past_due')
     and s.created_at < v_cutoff
     and s.updated_at < v_cutoff
     and s.user_id <> all (v_test_ids)
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = s.user_id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff);
  get diagnostics v_cancelled = row_count;

  update auth.users u
     set raw_user_meta_data = u.raw_user_meta_data || jsonb_build_object('tier', 'free')
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p
                      where p.id = u.id and p.user_type = 'admin')
     and u.id <> all (v_test_ids)
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = u.id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff)
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  get diagnostics v_reset = row_count;

  -- Verify: no live row the wipe targets remains, no non-admin, non-spared
  -- account left without a live row still carries a tier other than free, and
  -- every test account is as it was.
  select count(*) into v_left from public.subscriptions s
   where s.status in ('active', 'trialing', 'past_due')
     and s.created_at < v_cutoff and s.updated_at < v_cutoff
     and s.user_id <> all (v_test_ids)
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = s.user_id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff);
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % live subscription(s) created before % remain — rolling back', v_left, v_cutoff;
  end if;
  select count(*) into v_left from auth.users u
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p where p.id = u.id and p.user_type = 'admin')
     and u.id <> all (v_test_ids)
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = u.id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff)
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % non-admin account(s) with no live subscription still carry a paid tier — rolling back', v_left;
  end if;
  select count(*) into v_left from public.subscriptions s
   where s.metadata->>'wipe' = 'owner-204' and s.cancelled_at = now()
     and s.user_id = any (v_test_ids);
  select count(*) into v_tests_after from unnest(v_test_ids) as t(user_id)
   where exists (select 1 from public.subscriptions s
                  where s.user_id = t.user_id and s.status in ('active', 'trialing', 'past_due')
                    and s.created_at < v_cutoff)
      or exists (select 1 from auth.users u
                  where u.id = t.user_id and coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free');
  if v_left <> 0 or v_tests_after <> v_spared_tests then
    raise exception 'wipe subscriptions (owner ٢٢٤): a test account was touched (% row(s) cancelled by this run; % spared before, % after) — rolling back', v_left, v_spared_tests, v_tests_after;
  end if;

  select count(*) into v_kept from public.subscriptions
   where status in ('active', 'trialing', 'past_due') and created_at >= v_cutoff;
  raise notice 'wipe subscriptions (owner ٢٠٤ / ٢٢٤): OK — % subscription(s) created before % cancelled; % account(s) reset to free; spared: % test account(s) holding an old live row or a paid tier (% of them by e-mail, not in public.test_accounts), % row(s) changed after the cutoff, % account(s) with a request approved after it; % live subscription(s) created after the cutoff kept. library_access_grants and credits untouched.',
    v_cancelled, v_cutoff, v_reset, v_spared_tests, v_tests_email, v_spared_rows, v_spared_users, v_kept;
end $$;

commit;

-- 3) AFTER — read-only; compare with block 1.
-- (a) the rows this file cancelled (found by the stamp in their metadata)
select tier, count(*) as cancelled_by_this_file,
       min(created_at) as oldest, max(created_at) as newest
  from public.subscriptions
 where metadata->>'wipe' = 'owner-204'
 group by tier
 order by tier;

-- (b) the live rows left — created after the deploy, or spared (block 1 (d),
--     test accounts included)
select tier, status, count(*) as live_rows,
       min(created_at) as oldest_created, max(updated_at) as last_changed
  from public.subscriptions
 where status in ('active', 'trialing', 'past_due')
 group by tier, status
 order by tier, status;

-- (c) the accounts still carrying a tier other than free, and why — expect no
--     «NEITHER» row except an account block 1 (d) listed (a test account
--     with no live row shows here as NEITHER). This block does not read
--     public.test_accounts, so it runs on a database without it.
select u.id, u.email, p.user_type,
       u.raw_user_meta_data->>'tier' as metadata_tier,
       case when p.user_type = 'admin' then 'admin'
            when exists (select 1 from public.subscriptions s
                          where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'))
              then 'a live subscription'
            else 'NEITHER — expected only for an account block 1 (d) listed' end as why_kept
  from auth.users u
  left join public.profiles p on p.id = u.id
 where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
 order by why_kept, u.email;
