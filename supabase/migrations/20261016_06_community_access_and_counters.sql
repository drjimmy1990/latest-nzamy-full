-- =============================================================================
-- Migration: 20261016_06_community_access_and_counters.sql
-- =============================================================================
-- PURPOSE
--   The community (/community, /api/v1/community/**) on production (schema dump
--   2026-10-10) has these defects at the database layer; the code half was
--   fixed on branch fix/a2-community-blog (2026-10-16):
--
--   C1  LAWYERS-ONLY IS UNREADABLE. "anyone reads public community posts"
--       admits visibility = 'public' or the author only, so a verified lawyer
--       cannot read another lawyer's 'lawyers_only' post: the lawyers tab
--       shows only the reader's own posts, and answering one answers 404.
--   C2  ANSWERS LEAK. "anyone reads active community answers" checks only
--       status = 'active' — the answers of a lawyers-only (or private) post
--       are readable by any guest with the public key.
--   C3  ANSWERING THE UNREADABLE. "users create community answers" checks only
--       author_id, so a user can answer a post they are not allowed to see,
--       and can set is_lawyer_verified = true on their own answer — a fake
--       «محامٍ موثّق» badge.
--   C4  LAWYERS-ONLY BY ANYONE. The posts INSERT / UPDATE policies let any user
--       publish (or move a post) into 'lawyers_only'.
--   C5  SELF-SET COUNTERS. The author UPDATE policies cover every column: an
--       author can set vote_count, answer_count, view_count, is_pinned,
--       accepted_answer_id, status — and nobody else's view or vote is ever
--       counted (only the author passes the UPDATE policy).
--   C6  VOTES ON THE UNREADABLE. community_votes INSERT checks only user_id.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. SECURITY DEFINER helpers (search_path '', caller-only via auth.uid()):
--        community_is_verified_lawyer()         the caller is a verified lawyer
--        community_post_readable(post uuid)     the caller may read that post
--        community_answer_readable(answer uuid) … that answer (via its post)
--      EXECUTE for anon, authenticated, service_role (they appear in policies a
--      guest's read evaluates); revoked from PUBLIC.
--   2. Policies (each recreated under its production name):
--        posts SELECT   active/closed AND (public OR own OR lawyers_only for a
--                       verified lawyer)                              — C1
--        posts INSERT   own AND (not lawyers_only OR verified lawyer) — C4
--        posts UPDATE   own; WITH CHECK also the lawyers_only rule    — C4
--        answers SELECT active AND its post readable                  — C2
--        answers INSERT own AND post readable AND (badge false OR the
--                       caller is a verified lawyer)                  — C3
--        votes INSERT / UPDATE  own AND the target readable            — C6
--   3. Column-level UPDATE for authenticated (C5):
--        community_posts    title, body, category, visibility, tags
--        community_answers  body
--      (PATCH /api/v1/community/posts/[id] sends title/body/visibility/tags;
--      moderation and pinning go through the service role.)
--   4. Counters the database keeps (C5):
--        vote_count   — trigger on community_votes recomputes the target's sum
--        answer_count — trigger on community_answers counts active answers
--        view_count   — public.community_record_view(post uuid): +1 when the
--                       caller may read the post (EXECUTE: anon, authenticated)
--      and a one-time recount of vote_count / answer_count from the rows.
--   5. Verify block — RAISES on any of the above missing.
--   6. notify pgrst.
--
-- DEPLOY ORDER — INDEPENDENT
--   The current code keeps working: its manual vote_count / view_count updates
--   now fail silently (their errors were already ignored) and the triggers /
--   community_record_view keep the numbers. The follow-up code (same batch)
--   calls community_record_view and drops the manual updates.
--
-- NOT CHANGED
--   status / visibility CHECK values («مدني» has no category value — stored
--   as 'other'; adding one is an owner decision), community_reports, groups.
-- =============================================================================

begin;

-- ── 1. Helpers ───────────────────────────────────────────────────────────────
create or replace function public.community_is_verified_lawyer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lawyer_profiles lp
     where lp.user_id = auth.uid()
       and lp.verification_status = 'verified'
  );
$$;

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
            or (p.visibility = 'lawyers_only' and public.community_is_verified_lawyer()))
  );
$$;

create or replace function public.community_answer_readable(p_answer_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.community_answers a
     where a.id = p_answer_id
       and a.status = 'active'
       and public.community_post_readable(a.post_id)
  );
$$;

revoke all on function public.community_is_verified_lawyer() from public;
revoke all on function public.community_post_readable(uuid) from public;
revoke all on function public.community_answer_readable(uuid) from public;
grant execute on function public.community_is_verified_lawyer() to anon, authenticated, service_role;
grant execute on function public.community_post_readable(uuid) to anon, authenticated, service_role;
grant execute on function public.community_answer_readable(uuid) to anon, authenticated, service_role;

-- ── 2. Policies ──────────────────────────────────────────────────────────────
drop policy if exists "anyone reads public community posts" on public.community_posts;
create policy "anyone reads public community posts" on public.community_posts
  for select
  using (
    status in ('active', 'closed')
    and (visibility = 'public'
         or author_id = auth.uid()
         or (visibility = 'lawyers_only' and public.community_is_verified_lawyer()))
  );

drop policy if exists "users create their own community posts" on public.community_posts;
create policy "users create their own community posts" on public.community_posts
  for insert
  with check (
    author_id = auth.uid()
    and (visibility <> 'lawyers_only' or public.community_is_verified_lawyer())
  );

drop policy if exists "authors update their own community posts" on public.community_posts;
create policy "authors update their own community posts" on public.community_posts
  for update
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (visibility <> 'lawyers_only' or public.community_is_verified_lawyer())
  );

drop policy if exists "anyone reads active community answers" on public.community_answers;
create policy "anyone reads active community answers" on public.community_answers
  for select
  using (status = 'active' and public.community_post_readable(post_id));

drop policy if exists "users create community answers" on public.community_answers;
create policy "users create community answers" on public.community_answers
  for insert
  with check (
    author_id = auth.uid()
    and public.community_post_readable(post_id)
    and (is_lawyer_verified = false or public.community_is_verified_lawyer())
  );

drop policy if exists "users create their own votes" on public.community_votes;
create policy "users create their own votes" on public.community_votes
  for insert
  with check (
    user_id = auth.uid()
    and case target_type
          when 'post' then public.community_post_readable(target_id)
          when 'answer' then public.community_answer_readable(target_id)
          else false
        end
  );

drop policy if exists "users update their own votes" on public.community_votes;
create policy "users update their own votes" on public.community_votes
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and case target_type
          when 'post' then public.community_post_readable(target_id)
          when 'answer' then public.community_answer_readable(target_id)
          else false
        end
  );

-- ── 3. Column-level UPDATE ───────────────────────────────────────────────────
revoke update on public.community_posts, public.community_answers from anon, authenticated, public;
grant update (title, body, category, visibility, tags) on public.community_posts to authenticated;
grant update (body) on public.community_answers to authenticated;
grant all on public.community_posts, public.community_answers, public.community_votes to service_role;

-- ── 4. Counters ──────────────────────────────────────────────────────────────
create or replace function public.community_votes_recount()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select distinct x.target_type, x.target_id
      from (select new.target_type, new.target_id where tg_op in ('INSERT', 'UPDATE')
            union all
            select old.target_type, old.target_id where tg_op in ('UPDATE', 'DELETE')) as x(target_type, target_id)
  loop
    if t.target_type = 'post' then
      update public.community_posts p
         set vote_count = coalesce((select sum(v.value) from public.community_votes v
                                     where v.target_type = 'post' and v.target_id = t.target_id), 0)
       where p.id = t.target_id;
    elsif t.target_type = 'answer' then
      update public.community_answers a
         set vote_count = coalesce((select sum(v.value) from public.community_votes v
                                     where v.target_type = 'answer' and v.target_id = t.target_id), 0)
       where a.id = t.target_id;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_community_votes_recount on public.community_votes;
create trigger trg_community_votes_recount
  after insert or update or delete on public.community_votes
  for each row execute function public.community_votes_recount();

create or replace function public.community_answers_recount()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid;
begin
  foreach pid in array array_remove(array[
      case when tg_op in ('INSERT', 'UPDATE') then new.post_id end,
      case when tg_op in ('UPDATE', 'DELETE') then old.post_id end], null)
  loop
    update public.community_posts p
       set answer_count = (select count(*) from public.community_answers a
                            where a.post_id = pid and a.status = 'active')
     where p.id = pid;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_community_answers_recount on public.community_answers;
create trigger trg_community_answers_recount
  after insert or delete or update of status, post_id on public.community_answers
  for each row execute function public.community_answers_recount();

create or replace function public.community_record_view(p_post_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if public.community_post_readable(p_post_id) then
    update public.community_posts set view_count = view_count + 1 where id = p_post_id;
  end if;
end;
$$;

revoke all on function public.community_votes_recount() from public, anon, authenticated;
revoke all on function public.community_answers_recount() from public, anon, authenticated;
revoke all on function public.community_record_view(uuid) from public;
grant execute on function public.community_record_view(uuid) to anon, authenticated, service_role;

-- One-time recount from the rows (no trigger fired for the past).
update public.community_posts p
   set vote_count = coalesce((select sum(v.value) from public.community_votes v
                               where v.target_type = 'post' and v.target_id = p.id), 0),
       answer_count = (select count(*) from public.community_answers a
                        where a.post_id = p.id and a.status = 'active');
update public.community_answers a
   set vote_count = coalesce((select sum(v.value) from public.community_votes v
                               where v.target_type = 'answer' and v.target_id = a.id), 0);

-- ── 5. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  missing text := '';
begin
  if has_column_privilege('authenticated', 'public.community_posts', 'vote_count', 'UPDATE')
     or has_column_privilege('authenticated', 'public.community_posts', 'is_pinned', 'UPDATE')
     or has_column_privilege('authenticated', 'public.community_posts', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.community_answers', 'is_lawyer_verified', 'UPDATE')
     or has_column_privilege('authenticated', 'public.community_answers', 'vote_count', 'UPDATE') then
    missing := missing || ' an author can still set a counter / pin / status / the lawyer badge;';
  end if;
  if not has_column_privilege('authenticated', 'public.community_posts', 'body', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.community_answers', 'body', 'UPDATE') then
    missing := missing || ' authors cannot edit their own text;';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_answers'
                  and policyname = 'anyone reads active community answers'
                  and qual ilike '%community_post_readable%') then
    missing := missing || ' the answers read policy does not follow the post;';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_posts'
                  and policyname = 'anyone reads public community posts'
                  and qual ilike '%community_is_verified_lawyer%') then
    missing := missing || ' verified lawyers still cannot read lawyers_only posts;';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_community_votes_recount')
     or not exists (select 1 from pg_trigger where tgname = 'trg_community_answers_recount') then
    missing := missing || ' a counter trigger is missing;';
  end if;
  if not has_function_privilege('anon', 'public.community_post_readable(uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.community_record_view(uuid)', 'EXECUTE') then
    missing := missing || ' a guest cannot evaluate the read policy / record a view;';
  end if;
  if missing <> '' then
    raise exception '20261016_06 verify:%', missing;
  end if;
  raise notice '20261016_06 verify: OK — lawyers-only readable by verified lawyers; answers follow their post; no fake badge; counters kept by the database';
end $$;

commit;

notify pgrst, 'reload schema';
