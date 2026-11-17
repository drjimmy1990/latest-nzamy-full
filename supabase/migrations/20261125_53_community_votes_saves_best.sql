-- =============================================================================
-- Migration: 20261125_53_community_votes_saves_best.sql
-- =============================================================================
-- PURPOSE (owner TODO 17 Nov 2026, N05-C4..8 — the community's votes, «حفظ»,
-- «أفضل إجابة» and server search). Names stay anonymous (question ٤٢ is still
-- open) and moderation is untouched.
--
--   1. SEARCH. public.community_fold(text) folds Arabic the way the site's
--      normalizeSearch() + stripTashkeel() do (src/utils/normalizeArabic.ts):
--      tashkeel and tatweel removed, أ إ آ → ا, ة → ه, ى → ي, Arabic-Indic
--      digits → 0-9, lower case. community_posts gets a stored generated column
--      search_fts = to_tsvector('simple', fold(title || ' ' || body)) and a GIN
--      index. 'simple' is the config the library search already uses
--      (LIBRARY_FTS_CONFIG) — NOT library.arabic. The route builds the query
--      from the same fold (communitySearch.ts) and filters with `fts(simple)`.
--      EXECUTE on the fold goes to anon/authenticated too: a generated column
--      runs the function as the role that INSERTs/UPDATEs the post.
--   2. SAVES. public.community_saves (user_id, post_id) — «حفظ» a question for
--      later. RLS: a user reads, adds and removes only his own rows, and adds
--      only a post he may read (community_post_readable, 20261016_06). anon has
--      no privilege at all; authenticated gets SELECT, INSERT, DELETE only.
--   3. BEST ANSWER. public.community_set_best_answer(post uuid, answer uuid)
--      (SECURITY DEFINER): the caller must be the post's author; the answer must
--      be an active answer of that same post (null clears the choice). Answers
--      'ok' | 'not_signed_in' | 'not_found' | 'not_author' | 'bad_answer'.
--      accepted_answer_id stays NOT updatable by authenticated (20261016_06
--      column grants), so this function is the only way to set it.
--   4. VOTES — no change: 20261016_06 already lets a user write only his own
--      community_votes row on a readable target, delete his own row (toggle
--      off), and the trigger trg_community_votes_recount keeps vote_count. The
--      verify block below checks that this is still so.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261125_53_community_votes_saves_best.sql
--   Expect: NOTICE  20261125_53 verify: OK  and a row with `t`.
--
-- RUN ORDER — BEFORE THE DEPLOY
--   The new code filters on search_fts, calls community_set_best_answer and
--   reads/writes community_saves. The old code keeps working with this file
--   applied (it reads `*` and ignores the extra column). Requires
--   20261016_06_community_access_and_counters.sql (community_post_readable).
--
-- ROLLBACK
--   begin;
--     drop function if exists public.community_set_best_answer(uuid, uuid);
--     drop table if exists public.community_saves;
--     drop index if exists public.idx_community_posts_search_fts;
--     alter table public.community_posts drop column if exists search_fts;
--     drop function if exists public.community_fold(text);
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.community_post_readable(uuid)') is null
     or to_regclass('public.community_votes') is null then
    raise exception '20261125_53: run 20261016_06_community_access_and_counters.sql first';
  end if;
end
$pre$;

-- ── 1. Search ────────────────────────────────────────────────────────────────
-- translate(): each character of the first list becomes the character at the
-- same place in the second; the tashkeel/tatweel at the end of the first list
-- have no partner and are removed.
create or replace function public.community_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select pg_catalog.lower(pg_catalog.translate(
    coalesce(p_text, ''),
    U&'\0623\0625\0622\0629\0649'
      || U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669'
      || U&'\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9'
      || U&'\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670\0640',
    U&'\0627\0627\0627\0647\064A'
      || '0123456789'
      || '0123456789'))
$fn$;

comment on function public.community_fold(text) is
  'Arabic fold for the community search (20261125_53): tashkeel/tatweel removed, أإآ→ا, ة→ه, ى→ي, Arabic-Indic digits→0-9, lower case. Mirrors normalizeSearch()+stripTashkeel() in src/utils/normalizeArabic.ts.';

revoke all on function public.community_fold(text) from public;
grant execute on function public.community_fold(text) to anon, authenticated, service_role;

alter table public.community_posts
  add column if not exists search_fts tsvector
  generated always as (
    pg_catalog.to_tsvector('pg_catalog.simple'::regconfig,
      public.community_fold(coalesce(title, '') || ' ' || coalesce(body, '')))
  ) stored;

create index if not exists idx_community_posts_search_fts
  on public.community_posts using gin (search_fts);

-- ── 2. Saves («حفظ») ─────────────────────────────────────────────────────────
create table if not exists public.community_saves (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_community_saves_user_created
  on public.community_saves (user_id, created_at desc);
create index if not exists idx_community_saves_post
  on public.community_saves (post_id);

alter table public.community_saves enable row level security;

drop policy if exists "users read their own community saves" on public.community_saves;
create policy "users read their own community saves" on public.community_saves
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users save readable community posts" on public.community_saves;
create policy "users save readable community posts" on public.community_saves
  for insert to authenticated
  with check (user_id = auth.uid() and public.community_post_readable(post_id));

drop policy if exists "users remove their own community saves" on public.community_saves;
create policy "users remove their own community saves" on public.community_saves
  for delete to authenticated
  using (user_id = auth.uid());

-- Supabase's default privileges grant ALL on a new public table to anon and
-- authenticated. A save is never updated and never read by a guest.
revoke all on public.community_saves from public, anon, authenticated;
grant select, insert, delete on public.community_saves to authenticated;
grant all on public.community_saves to service_role;

-- ── 3. Best answer («أفضل إجابة») ────────────────────────────────────────────
create or replace function public.community_set_best_answer(p_post_id uuid, p_answer_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_post record;
begin
  if v_uid is null then
    return 'not_signed_in';
  end if;

  select p.id, p.author_id, p.status into v_post
    from public.community_posts p
   where p.id = p_post_id
   for update;

  if v_post.id is null or v_post.status not in ('active', 'closed') then
    return 'not_found';
  end if;
  if v_post.author_id is distinct from v_uid then
    return 'not_author';
  end if;

  if p_answer_id is not null and not exists (
       select 1 from public.community_answers a
        where a.id = p_answer_id
          and a.post_id = p_post_id
          and a.status = 'active') then
    return 'bad_answer';
  end if;

  update public.community_posts
     set accepted_answer_id = p_answer_id
   where id = p_post_id
     and accepted_answer_id is distinct from p_answer_id;

  return 'ok';
end
$fn$;

comment on function public.community_set_best_answer(uuid, uuid) is
  'The question''s author marks one active answer of that question as the best (null clears it) — 20261125_53. ok | not_signed_in | not_found | not_author | bad_answer.';

revoke all on function public.community_set_best_answer(uuid, uuid) from public, anon;
grant execute on function public.community_set_best_answer(uuid, uuid) to authenticated, service_role;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
begin
  if public.community_fold(U&'\0627\0644\062D\064E\0636\064E\0627\0646\064E\0629\0640 \0623\0625\0622\0649 \0661\0664\0664\0664 ABC')
     <> U&'\0627\0644\062D\0636\0627\0646\0647 \0627\0627\0627\064A 1444 abc' then
    missing := missing || ' community_fold does not fold like normalizeSearch;';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.community_posts'::regclass and attname = 'search_fts'
                    and attgenerated = 's' and not attisdropped) then
    missing := missing || ' community_posts.search_fts is not a stored generated column;';
  end if;
  if to_regclass('public.idx_community_posts_search_fts') is null then
    missing := missing || ' the search index is missing;';
  end if;
  if not has_function_privilege('authenticated', 'public.community_fold(text)', 'EXECUTE') then
    missing := missing || ' authenticated cannot run community_fold (every new post would fail);';
  end if;
  if to_regclass('public.community_saves') is null
     or not coalesce((select c.relrowsecurity from pg_catalog.pg_class c
                       where c.oid = to_regclass('public.community_saves')), false) then
    missing := missing || ' community_saves is missing or has no RLS;';
  end if;
  if has_table_privilege('anon', 'public.community_saves', 'SELECT')
     or has_table_privilege('anon', 'public.community_saves', 'INSERT')
     or has_table_privilege('authenticated', 'public.community_saves', 'UPDATE') then
    missing := missing || ' community_saves is readable by a guest or updatable;';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_saves'
                  and policyname = 'users save readable community posts'
                  and with_check ilike '%community_post_readable%') then
    missing := missing || ' a save does not require a readable post;';
  end if;
  if to_regprocedure('public.community_set_best_answer(uuid, uuid)') is null
     or has_function_privilege('anon', 'public.community_set_best_answer(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.community_set_best_answer(uuid, uuid)', 'EXECUTE') then
    missing := missing || ' community_set_best_answer is missing or open to guests;';
  end if;
  if has_column_privilege('authenticated', 'public.community_posts', 'accepted_answer_id', 'UPDATE') then
    missing := missing || ' an author can set accepted_answer_id directly (any answer of any post);';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'trg_community_votes_recount')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_votes'
                     and cmd = 'DELETE' and qual ilike '%uid()%')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'community_votes'
                     and cmd = 'INSERT' and with_check ilike '%community_post_readable%') then
    missing := missing || ' community_votes lost its own-row policies or the recount trigger (run 20261016_06);';
  end if;
  if missing <> '' then
    raise exception '20261125_53 verify:%', missing;
  end if;
  raise notice '20261125_53 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261125_53 community search + saves + best answer' as step,
       to_regclass('public.community_saves') is not null
       and to_regprocedure('public.community_set_best_answer(uuid, uuid)') is not null
       and exists (select 1 from pg_catalog.pg_attribute
                    where attrelid = 'public.community_posts'::regclass and attname = 'search_fts'
                      and not attisdropped) as ok;
