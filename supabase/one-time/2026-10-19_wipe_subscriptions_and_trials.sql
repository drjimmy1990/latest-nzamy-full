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
-- (old live rows cancelled, rows after the cutoff kept, metadata free only for
-- non-admins left with nothing, library grants and credits untouched, a second
-- run changes nothing, every missing or bad setting raises and changes nothing).
--
-- WHY A CUTOFF: until the deploy, every grant path (src/lib/entitlements.ts
--   grantEntitlement, the admin subscriptions page, invite-code trials)
--   wrote a public.subscriptions row and stamped auth user_metadata.tier — a
--   library approval gave the whole "pro" tier, AI tools included. After the
--   deploy, library access is written to public.library_access_grants, and a
--   subscriptions row is a deliberate tier grant under the new model. So:
--   rows created BEFORE the deploy finished go; rows created after it stay.
--
-- WHAT CHANGES (block 2, one transaction, all-or-nothing):
--   * public.subscriptions — every row with status active / trialing /
--     past_due and created_at before the cutoff: status 'cancelled',
--     cancelled_at now, auto_renew false, current_period_end moved back to now
--     if it was later (or empty), and metadata gains
--     {"wiped_at": <now>, "wipe": "owner-204"} (its other keys stay; this is
--     how the cancelled rows can be found later). tier is not changed.
--   * auth.users.raw_user_meta_data.tier → "free" (the other keys stay), only
--     for accounts that are NOT admins (public.profiles.user_type = 'admin')
--     and are left with NO active / trialing / past_due subscription after the
--     update above. An account holding a row created after the cutoff keeps
--     its tier; admins' metadata is not touched.
-- WHAT IT KEEPS: public.library_access_grants (new-model library grants,
--   founder grants included) — never touched; points / credits
--   (lawyer_profiles.credit_balance, credit_transactions) — untouched until
--   ٢٢٤ is answered; subscriptions already cancelled / expired; the rows
--   created after the cutoff; entitlement_requests (requests only); every
--   other table.
--
-- THE TWO SETTINGS (block 2 refuses to run without both):
--   nzamy.confirm_wipe = 'WIPE-2026-10-19'
--   nzamy.wipe_cutoff  = the time deploy.sh FINISHED, with its offset. The
--                        editor's session runs in UTC, so type the offset:
--                        '2026-10-19 21:30:00+03', not '2026-10-19 21:30'.
--   How to set them in the SQL Editor: in block 2, remove the two dashes at
--   the start of BOTH `set local` lines and type the time in place of the
--   placeholder. `set local` lasts until block 2's commit, so it cannot leak
--   into a later run. (Same effect, same place:
--     select set_config('nzamy.confirm_wipe', 'WIPE-2026-10-19', true);
--     select set_config('nzamy.wipe_cutoff', '2026-10-19 21:30:00+03', true);
--   — the third argument true makes it last only until the commit.)
--   As written — both lines commented out — pasting the whole file and
--   pressing Run changes NOTHING: block 1 shows its counts, then block 2
--   raises "NOT confirmed" and the editor stops there (block 3 does not run;
--   see the `rollback;` note at the end of this header).
--
-- ORDER:
--   1. Run block 1 alone. Read the counts: the live rows by tier, status and
--      where they came from, and the accounts whose metadata tier is not free.
--      (Optional: un-comment its set_config line with the deploy time to also
--      see, per account, what block 2 will do.)
--   2. Set the cutoff to the time the deploy finished (the end of deploy.sh).
--      CHECK FIRST — a grant after the deploy may have written NO row: when an
--      admin grants a tier to an account that already holds an equal or
--      higher live subscription, grantEntitlement keeps the old row and only
--      stamps the metadata ("already entitled"). Block 2 then cancels that
--      old row and resets the account to free, and the newer grant is lost.
--      With the cutoff set, look in block 1 (b) for accounts marked "reset to
--      free" that were granted something after the deploy (the admin
--      entitlements page / audit), and grant them again after block 2.
--   3. Run block 2 alone. It raises and changes nothing if the confirmation is
--      missing, or the cutoff is missing, not a time, or in the future; it
--      rolls back if any live row created before the cutoff remains, or a
--      non-admin left with no live row still carries a tier other than free.
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
-- (an error inside block 2 leaves its transaction open on that connection).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — read-only; run alone, before choosing the cutoff.
-- Optional: un-comment, type the deploy time, and run it together with block 1
-- to fill the "before the cutoff" columns (it lasts for this session only;
-- block 2 still needs its own two `set local` lines):
-- select set_config('nzamy.wipe_cutoff', '2026-10-19 21:30:00+03', false);

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
            else count(*) filter (where s.created_at < c.at) end as before_cutoff,
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
       count(s.id) filter (where s.status in ('active', 'trialing', 'past_due')) as live_rows,
       case when c.at is null then null
            else count(s.id) filter (where s.status in ('active', 'trialing', 'past_due')
                                       and s.created_at >= c.at) end as live_rows_after_cutoff,
       case when p.user_type = 'admin' then 'kept (admin)'
            when c.at is null then '(set the cutoff to see)'
            when count(s.id) filter (where s.status in ('active', 'trialing', 'past_due')
                                       and s.created_at >= c.at) > 0
              then 'kept (a subscription after the cutoff)'
            else 'reset to free' end as block_2_will
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscriptions s on s.user_id = u.id
 cross join cutoff c
 where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
 group by u.id, u.email, p.user_type, u.raw_user_meta_data->>'tier', c.at
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

-- 2) WIPE — one transaction. It changes NOTHING until you remove the two
--    dashes at the start of BOTH `set local` lines below and type the time
--    deploy.sh finished in place of the placeholder (with its offset, e.g.
--    '2026-10-19 21:30:00+03').
begin;

-- set local nzamy.confirm_wipe = 'WIPE-2026-10-19';
-- set local nzamy.wipe_cutoff = '<the time deploy.sh finished>';

do $$
declare
  v_cutoff_text text := nullif(btrim(coalesce(current_setting('nzamy.wipe_cutoff', true), '')), '');
  v_cutoff      timestamptz;
  v_cancelled   bigint;
  v_reset       bigint;
  v_kept        bigint;
  v_left        bigint;
begin
  if coalesce(current_setting('nzamy.confirm_wipe', true), '') <> 'WIPE-2026-10-19' then
    raise exception 'wipe subscriptions (owner ٢٠٤): NOT confirmed — nothing changed. Remove the two dashes before both "set local" lines in block 2, type the deploy time, then run block 2 alone.';
  end if;
  if v_cutoff_text is null then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff is not set — nothing changed. Type the time deploy.sh finished in the "set local nzamy.wipe_cutoff" line, e.g. ''2026-10-19 21:30:00+03''.';
  end if;
  begin
    v_cutoff := v_cutoff_text::timestamptz;
  exception when others then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff "%" is not a time — nothing changed. Type it like ''2026-10-19 21:30:00+03''.', v_cutoff_text;
  end;
  if v_cutoff > now() then
    raise exception 'wipe subscriptions (owner ٢٠٤): the cutoff % is in the future — nothing changed. It is the time deploy.sh FINISHED; a later time would cancel subscriptions granted after the deploy.', v_cutoff;
  end if;

  update public.subscriptions
     set status = 'cancelled',
         cancelled_at = now(),
         auto_renew = false,
         current_period_end = least(coalesce(current_period_end, now()), now()),
         metadata = metadata || jsonb_build_object('wiped_at', now(), 'wipe', 'owner-204')
   where status in ('active', 'trialing', 'past_due')
     and created_at < v_cutoff;
  get diagnostics v_cancelled = row_count;

  update auth.users u
     set raw_user_meta_data = u.raw_user_meta_data || jsonb_build_object('tier', 'free')
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p
                      where p.id = u.id and p.user_type = 'admin')
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  get diagnostics v_reset = row_count;

  -- Verify: no live row created before the cutoff remains, and no non-admin
  -- left without a live row still carries a tier other than free.
  select count(*) into v_left from public.subscriptions
   where status in ('active', 'trialing', 'past_due') and created_at < v_cutoff;
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % live subscription(s) created before % remain — rolling back', v_left, v_cutoff;
  end if;
  select count(*) into v_left from auth.users u
   where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
     and not exists (select 1 from public.profiles p where p.id = u.id and p.user_type = 'admin')
     and not exists (select 1 from public.subscriptions s
                      where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'));
  if v_left <> 0 then
    raise exception 'wipe subscriptions (owner ٢٠٤): % non-admin account(s) with no live subscription still carry a paid tier — rolling back', v_left;
  end if;

  select count(*) into v_kept from public.subscriptions
   where status in ('active', 'trialing', 'past_due');
  raise notice 'wipe subscriptions (owner ٢٠٤): OK — % subscription(s) created before % cancelled; % account(s) reset to free; % live subscription(s) created after the cutoff kept. library_access_grants and credits untouched.',
    v_cancelled, v_cutoff, v_reset, v_kept;
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

-- (b) the live rows left — every one should be created after the deploy
select tier, status, count(*) as live_rows, min(created_at) as oldest_left
  from public.subscriptions
 where status in ('active', 'trialing', 'past_due')
 group by tier, status
 order by tier, status;

-- (c) the accounts still carrying a tier other than free, and why — expect no
--     «NEITHER» row
select u.id, u.email, p.user_type,
       u.raw_user_meta_data->>'tier' as metadata_tier,
       case when p.user_type = 'admin' then 'admin'
            when exists (select 1 from public.subscriptions s
                          where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due'))
              then 'a live subscription'
            else 'NEITHER — should not happen' end as why_kept
  from auth.users u
  left join public.profiles p on p.id = u.id
 where coalesce(u.raw_user_meta_data->>'tier', 'free') <> 'free'
 order by why_kept, u.email;
