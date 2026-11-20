-- =============================================================================
-- Migration: 20261201_50_community_verified_firms.sql   (verify id: l11_community)
-- =============================================================================
-- PURPOSE
--   N05-C2 / owner ٤٢ (18 Nov 2026): «مكتب موثّق» takes part in the lawyers-only
--   community content. Until now only a verified lawyer could read, post to,
--   answer in, vote on or save a `lawyers_only` post (20261016_06).
--
-- WHO IS A VERIFIED FIRM (the strictest signal that already exists)
--   Exactly public.community_verified_office_users() (20261127_60), which is
--   the owner's own words «سجل تجاري موثّق + محامٍ رخصته سارية»:
--     firm_profiles.verification_status = 'verified'   (the CR check)
--     AND at least one lawyer — the firm owner himself or an active member
--     with a practising role — whose lawyer_profiles.verification_status =
--     'verified' and whose licence is valid today in Riyadh (the lawyer
--     registry's expiry when the licence is found there, else
--     lawyer_profiles.license_expiry).
--   Admitted: the firm OWNER's account (firm_profiles.owner_user_id) — the
--   same account that carries the «مكتب موثّق» badge. A firm member who is a
--   verified lawyer was already admitted as a lawyer; other members (staff,
--   unverified) are not admitted.
--
-- WHAT CHANGES
--   public.community_is_verified_office()   new, definer, service_role only
--       — the caller (auth.uid()) owns a verified firm.
--   public.community_lawyers_space_ok()      new, definer, anon/authenticated
--       — verified lawyer OR verified firm owner; the API asks it too
--       (src/app/api/v1/community/posts/_lawyersSpace.ts), so the route and
--       RLS give the same answer.
--   public.community_post_readable(uuid)     redefined (latest: 20261016_06):
--       the lawyers_only arm also admits a verified firm owner. Answers
--       (read + insert), votes, saves and views all follow it.
--   posts SELECT  "anyone reads public community posts"   (latest: 20261127_60)
--   posts INSERT  "users create their own community posts" (latest: 20261016_06)
--   posts UPDATE  "authors update their own community posts" (latest: 20261016_06)
--       each copied from its latest definition; only the lawyers_only arm
--       gains `or community_lawyers_space_ok()`.
--
-- WHAT DOES NOT CHANGE
--   public.community_is_verified_lawyer() keeps its body: the answers INSERT
--   policy uses it to gate `is_lawyer_verified`, so a firm owner still cannot
--   claim the lawyer badge on an answer. The literal call stays in every
--   policy (the 20261016_06 / 20261127_60 verify blocks match on its name).
--   The review arm (pending_review / rejected for the author) is kept as is.
--   No table, column or grant on a table changes.
--
-- ORDER
--   Needs 20261016_06 and 20261127_60 (both already on production). Safe
--   before or after the code deploy: before it, the API keeps the old
--   lawyer-only check (the RPC is missing → fallback). Re-runnable.
--   NOTE: re-running 20261127_60 AFTER this file would put back its own
--   posts SELECT policy (firms out again); re-run this file after it.
--
-- RUN
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261201_50_community_verified_firms.sql
--   Expect: NOTICE  l11_community verify: OK  and a row with `t`.
--
-- ROLLBACK
--   Re-run the policy blocks of 20261127_60 (SELECT) and 20261016_06 (INSERT /
--   UPDATE / community_post_readable), then
--     drop function if exists public.community_lawyers_space_ok();
--     drop function if exists public.community_is_verified_office();
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.community_is_verified_lawyer()') is null
     or to_regprocedure('public.community_post_readable(uuid)') is null then
    raise exception '20261201_50: run 20261016_06_community_access_and_counters.sql first';
  end if;
  if to_regprocedure('public.community_verified_office_users(uuid[])') is null then
    raise exception '20261201_50: run 20261127_60_community_review_devices_freeze.sql first';
  end if;
end $$;

-- ── 1. helpers ───────────────────────────────────────────────────────────────
create or replace function public.community_is_verified_office()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.community_verified_office_users(array[auth.uid()]) u);
$$;

comment on function public.community_is_verified_office() is
  'N05-C2 / owner ٤٢ (20261201_50): the caller owns a «مكتب موثّق» — community_verified_office_users() (verified CR + a verified lawyer with a licence valid today). Called by community_lawyers_space_ok(); service_role only.';

revoke all on function public.community_is_verified_office() from public, anon, authenticated;
grant execute on function public.community_is_verified_office() to service_role;

create or replace function public.community_lawyers_space_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.community_is_verified_lawyer() or public.community_is_verified_office();
$$;

comment on function public.community_lawyers_space_ok() is
  'N05-C2 / owner ٤٢ (20261201_50): the caller may read and post lawyers-only community content — a verified lawyer, or the owner of a verified firm. Used by the community RLS and by the posts API.';

revoke all on function public.community_lawyers_space_ok() from public;
grant execute on function public.community_lawyers_space_ok() to anon, authenticated, service_role;

-- ── 2. community_post_readable (latest: 20261016_06; no review statuses) ────
create or replace function public.community_post_readable(p_post_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.community_posts p
     where p.id = p_post_id
       and p.status in ('active', 'closed')
       and (p.visibility = 'public'
            or p.author_id = auth.uid()
            or (p.visibility = 'lawyers_only'
                and (public.community_is_verified_lawyer() or public.community_lawyers_space_ok())))
  );
$$;

revoke all on function public.community_post_readable(uuid) from public;
grant execute on function public.community_post_readable(uuid) to anon, authenticated, service_role;

-- ── 3. posts policies (each copied from its latest definition) ──────────────
-- SELECT — latest 20261127_60 (with the author's review arm).
drop policy if exists "anyone reads public community posts" on public.community_posts;
create policy "anyone reads public community posts" on public.community_posts
  for select
  using (
    (status in ('active', 'closed')
     and (visibility = 'public'
          or author_id = auth.uid()
          or (visibility = 'lawyers_only'
              and (public.community_is_verified_lawyer() or (select public.community_lawyers_space_ok())))))
    or (author_id = auth.uid() and status in ('pending_review', 'rejected'))
  );

-- INSERT — latest 20261016_06.
drop policy if exists "users create their own community posts" on public.community_posts;
create policy "users create their own community posts" on public.community_posts
  for insert
  with check (
    author_id = auth.uid()
    and (visibility <> 'lawyers_only'
         or public.community_is_verified_lawyer()
         or (select public.community_lawyers_space_ok()))
  );

-- UPDATE — latest 20261016_06.
drop policy if exists "authors update their own community posts" on public.community_posts;
create policy "authors update their own community posts" on public.community_posts
  for update
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (visibility <> 'lawyers_only'
         or public.community_is_verified_lawyer()
         or (select public.community_lawyers_space_ok()))
  );

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  f text;
begin
  foreach f in array array['public.community_is_verified_office()', 'public.community_lawyers_space_ok()'] loop
    if to_regprocedure(f) is null then
      raise exception 'l11_community verify: % missing', f;
    end if;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""']
              from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      raise exception 'l11_community verify: % is not security definer with an empty search_path', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.community_is_verified_office()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.community_is_verified_office()', 'EXECUTE') then
    raise exception 'l11_community verify: community_is_verified_office() is callable by anon/authenticated';
  end if;
  if not has_function_privilege('anon', 'public.community_lawyers_space_ok()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.community_lawyers_space_ok()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.community_post_readable(uuid)', 'EXECUTE') then
    raise exception 'l11_community verify: a guest or member cannot evaluate the lawyers-only checks';
  end if;
  if has_function_privilege('authenticated', 'public.community_verified_office_users(uuid[])', 'EXECUTE') then
    raise exception 'l11_community verify: community_verified_office_users() is callable by authenticated';
  end if;
  if pg_catalog.pg_get_functiondef('public.community_post_readable(uuid)'::regprocedure) not ilike '%community_lawyers_space_ok%'
     or pg_catalog.pg_get_functiondef('public.community_post_readable(uuid)'::regprocedure) ilike '%pending_review%' then
    raise exception 'l11_community verify: community_post_readable() does not admit verified firms (or reads rows under review)';
  end if;
  if pg_catalog.pg_get_functiondef('public.community_is_verified_lawyer()'::regprocedure) ilike '%firm%' then
    raise exception 'l11_community verify: community_is_verified_lawyer() was widened (it gates the lawyer badge)';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_posts'
                  and policyname = 'anyone reads public community posts'
                  and qual ilike '%community_lawyers_space_ok%' and qual ilike '%community_is_verified_lawyer%'
                  and qual ilike '%pending_review%')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_posts'
                  and policyname = 'users create their own community posts' and with_check ilike '%community_lawyers_space_ok%')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_posts'
                  and policyname = 'authors update their own community posts' and with_check ilike '%community_lawyers_space_ok%') then
    raise exception 'l11_community verify: a community_posts policy does not admit verified firms';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_answers'
                  and policyname = 'users create community answers'
                  and with_check ilike '%is_lawyer_verified%' and with_check ilike '%community_is_verified_lawyer%'
                  and with_check not ilike '%community_lawyers_space_ok%') then
    raise exception 'l11_community verify: the answers insert policy no longer limits the lawyer badge to verified lawyers';
  end if;
  raise notice 'l11_community verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261201_50 community verified firms (N05-C2: lawyers-only read/post/answer for the owner of a verified firm; lawyer badge unchanged)' as migration,
       to_regprocedure('public.community_lawyers_space_ok()') is not null
       and has_function_privilege('authenticated', 'public.community_lawyers_space_ok()', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.community_is_verified_office()', 'EXECUTE')
       as ok;
