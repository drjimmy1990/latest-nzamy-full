-- ════════════════════════════════════════════════════════════════════════════
-- One-time data change (NOT a migration) — owner answer ٢٠٤ (decisions of
-- 2026-10-18): access handed out under the OLD model, before the library / AI
-- split, ends. Written 2026-10-19.
--
-- ⛔ HELD — DO NOT RUN YET. It waits for the owner to confirm the scope of ٢٠٤
--    (question ٢٢٤: are points balances zeroed too?). This file does NOT touch
--    points / credits; if he says they go too, that is a separate step.
--
-- Run by the user in the self-hosted SQL Editor (auth.nezamy.sa, as postgres),
-- block by block, AFTER the batch that splits the library from the AI tools is
-- deployed. The owner never runs it.
-- Tested on a throwaway Postgres: supabase/tests/rls/wipe_subscriptions.test.sql
-- (old live rows cancelled, rows after the cutoff and accounts an admin acted
-- on after it kept, metadata free only for non-admins left with nothing,
-- library grants and credits untouched, a second run changes nothing, every
-- missing or bad setting raises and changes nothing, a cutoff typed in block 1
-- never reaches block 2).
--
-- WHY A CUTOFF: until the deploy, every grant path (src/lib/entitlements.ts
--   grantEntitlement, the admin subscriptions page, invite-code trials)
--   wrote a public.subscriptions row and stamped auth user_metadata.tier — a
--   library approval gave the whole "pro" tier, AI tools included. After the
--   deploy, library access is written to public.library_access_grants, and a
--   subscriptions row is a deliberate tier grant under the new model. So:
--   rows created BEFORE the deploy finished go; rows created after it stay;
--   and an account an admin acted on after the deploy is a post-split
--   decision, so it stays too (see SPARED below).
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
-- SPARED — older than the cutoff, but an admin acted on it after the deploy
--   (block 1 (d) lists both, with the time):
--   * a live row whose updated_at is at or after the cutoff — the admin user
--     page's «تغيير الخطة» (PATCH /api/v1/admin/subscriptions/[id]) edits the
--     row in place, so created_at stays old and only updated_at moves;
--   * every row and the metadata of an account with an entitlement_requests
--     row of kind plan or media, status approved, decided_at at or after the
--     cutoff — approving a request when the account already holds an equal or
--     better live row writes no row; only the request records the decision.
-- WHAT IT KEEPS: public.library_access_grants (new-model library grants,
--   founder grants included) — never touched; points / credits
--   (lawyer_profiles.credit_balance, credit_transactions) — untouched until
--   ٢٢٤ is answered; subscriptions already cancelled / expired; the rows
--   created after the cutoff; the SPARED rows and accounts;
--   entitlement_requests (read, never written); every other table.
--
-- THE TWO SETTINGS (block 2 refuses to run without both):
--   nzamy.confirm_wipe = 'WIPE-2026-10-19'
--   nzamy.wipe_cutoff  = the time deploy.sh FINISHED, ending in an explicit
--                        UTC offset — '2026-10-19 21:30:00+03',
--                        '2026-10-19 21:30+03:00' or '2026-10-19T18:30:00Z'.
--                        Block 2 refuses a time without one: the editor's
--                        session runs in UTC, so '2026-10-19 21:30' would be
--                        read three hours late and cancel grants made after
--                        the deploy.
--   How to set them in the SQL Editor: in block 2, remove the two dashes at
--   the start of BOTH `set local` lines and type the time in place of the
--   <DEPLOY-TIME-WITH-OFFSET> placeholder. (Same effect, same place:
--     select set_config('nzamy.confirm_wipe', 'WIPE-2026-10-19', true);
--     select set_config('nzamy.wipe_cutoff', '2026-10-19 21:30:00+03', true);)
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
--      deploy time typed in place of the placeholder. Read: (0) how the cutoff
--      is read and whether block 2 will accept it; (a) the live rows by tier,
--      status and where they came from; (b) the accounts whose metadata tier
--      is not free and what block 2 will do to each; (d) what block 2 SPARES.
--   2. Set block 2's cutoff to the same time — the end of deploy.sh. Check
--      block 1 (d): every account listed there is one an admin acted on after
--      the deploy, and block 2 leaves its rows and tier as they are.
--   3. Run block 2 alone. It raises and changes nothing if the confirmation is
--      missing, or the cutoff is missing, has no UTC offset, is not a time, or
--      is in the future; it rolls back if any live row it should have
--      cancelled remains, or a non-admin, non-spared account left with no live
--      row still carries a tier other than free.
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

-- Un-comment and type the deploy time WITH its offset in place of the
-- placeholder (as typed, it fails). It fills the cutoff columns and lists
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

-- (d) what block 2 SPARES although it is older than the cutoff: live rows an
--     admin changed after the cutoff, and accounts with a plan / media request
--     approved after it. tier = the row's tier, or the account's metadata tier.
with cutoff as (
  select nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '')::timestamptz as at
)
select s.user_id, u.email::text as email,
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
--    dashes at the start of BOTH `set local` lines below and type the time
--    deploy.sh finished in place of the placeholder, WITH its offset (e.g.
--    '2026-10-19 21:30:00+03').
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
  v_left         bigint;
begin
  if coalesce(current_setting('nzamy.confirm_wipe', true), '') <> 'WIPE-2026-10-19' then
    raise exception 'wipe subscriptions (owner ٢٠٤): NOT confirmed — nothing changed. Remove the two dashes before both "set local" lines in block 2, type the deploy time, then run block 2 alone.';
  end if;
  if v_cutoff_text is null then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff is not set — nothing changed. Type the time deploy.sh finished in block 2''s "set local nzamy.wipe_cutoff" line, e.g. ''2026-10-19 21:30:00+03'' (a cutoff typed in block 1 does not reach block 2).';
  end if;
  -- An explicit UTC offset, checked on the raw text before the cast: the
  -- session runs in UTC, so a time without one would be read three hours late.
  if v_cutoff_text !~ '[0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?\s*([+-][0-9]{2}(:?[0-9]{2})?|[Zz])$' then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff "%" does not end in a UTC offset — nothing changed. Type the time deploy.sh finished WITH its offset, e.g. ''2026-10-19 21:30:00+03'' or ''2026-10-19T18:30:00Z''.', v_cutoff_text;
  end if;
  begin
    v_cutoff := v_cutoff_text::timestamptz;
  exception when others then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff "%" is not a time — nothing changed. Type it like ''2026-10-19 21:30:00+03''.', v_cutoff_text;
  end;
  if v_cutoff > now() then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff % is in the future — nothing changed. It is the time deploy.sh FINISHED; a later time would cancel subscriptions granted after the deploy.', v_cutoff;
  end if;

  -- SPARED (counted for the notice): rows an admin changed after the cutoff,
  -- and accounts with a plan / media request approved after it.
  select count(*) into v_spared_rows from public.subscriptions
   where status in ('active', 'trialing', 'past_due')
     and created_at < v_cutoff and updated_at >= v_cutoff;
  select count(distinct user_id) into v_spared_users from public.entitlement_requests
   where kind in ('plan', 'media') and status = 'approved' and decided_at >= v_cutoff;

  update public.subscriptions s
     set status = 'cancelled',
         cancelled_at = now(),
         auto_renew = false,
         current_period_end = least(coalesce(s.current_period_end, now()), now()),
         metadata = s.metadata || jsonb_build_object('wiped_at', now(), 'wipe', 'owner-204')
   where s.status in ('active', 'trialing', 'past_due')
     and s.created_at < v_cutoff
     and s.updated_at < v_cutoff
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = s.user_id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff);
  get diagnostics v_cancelled = row_count;

  update auth.users u
     set raw_user_meta_data = u.raw_user_meta_data || jsonb_build_object('tier', 'free')
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p
                      where p.id = u.id and p.user_type = 'admin')
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = u.id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff)
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  get diagnostics v_reset = row_count;

  -- Verify: no live row the wipe targets remains, and no non-admin, non-spared
  -- account left without a live row still carries a tier other than free.
  select count(*) into v_left from public.subscriptions s
   where s.status in ('active', 'trialing', 'past_due')
     and s.created_at < v_cutoff and s.updated_at < v_cutoff
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = s.user_id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff);
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % live subscription(s) created before % remain — rolling back', v_left, v_cutoff;
  end if;
  select count(*) into v_left from auth.users u
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p where p.id = u.id and p.user_type = 'admin')
     and not exists (select 1 from public.entitlement_requests er
                      where er.user_id = u.id and er.kind in ('plan', 'media')
                        and er.status = 'approved' and er.decided_at >= v_cutoff)
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % non-admin account(s) with no live subscription still carry a paid tier — rolling back', v_left;
  end if;

  select count(*) into v_kept from public.subscriptions
   where status in ('active', 'trialing', 'past_due') and created_at >= v_cutoff;
  raise notice 'wipe subscriptions (owner ٢٠٤): OK — % subscription(s) created before % cancelled; % account(s) reset to free; spared: % row(s) changed after the cutoff, % account(s) with a request approved after it; % live subscription(s) created after the cutoff kept. library_access_grants and credits untouched.',
    v_cancelled, v_cutoff, v_reset, v_spared_rows, v_spared_users, v_kept;
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

-- (b) the live rows left — created after the deploy, or spared (block 1 (d))
select tier, status, count(*) as live_rows,
       min(created_at) as oldest_created, max(updated_at) as last_changed
  from public.subscriptions
 where status in ('active', 'trialing', 'past_due')
 group by tier, status
 order by tier, status;

-- (c) the accounts still carrying a tier other than free, and why — expect no
--     «NEITHER» row except an account block 1 (d) listed
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
