-- prelude_community_live_schema.sql — community_posts / community_answers /
-- community_votes and their policies as production has them (schema dump
-- 2026-10-10 :6508-6591, policies :16717-19168, GRANT ALL :21504-21542), plus
-- actors: L1 and L2 verified lawyers, P a pending lawyer, C a client.
-- stubs.sql provides auth.uid() (test.uid), profiles, lawyer_profiles and
-- public.handle_updated_at().

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general'
    check (category in ('general', 'labor', 'commercial', 'criminal', 'family', 'real_estate',
                        'administrative', 'intellectual_property', 'international', 'other')),
  visibility text not null default 'public' check (visibility in ('public', 'lawyers_only', 'private')),
  status text not null default 'active' check (status in ('active', 'closed', 'moderated', 'deleted')),
  is_pinned boolean not null default false,
  vote_count integer not null default 0,
  answer_count integer not null default 0,
  view_count integer not null default 0,
  accepted_answer_id uuid,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.community_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null constraint community_answers_post_id_fkey references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_lawyer_verified boolean not null default false,
  vote_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'moderated', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_posts
  add constraint fk_community_posts_accepted_answer
  foreign key (accepted_answer_id) references public.community_answers(id) on delete set null;
create table public.community_votes (
  id bigserial primary key,
  user_id uuid not null,
  target_type text not null check (target_type in ('post', 'answer')),
  target_id uuid not null,
  value integer not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create trigger trg_community_posts_updated_at before update on public.community_posts
  for each row execute function public.handle_updated_at();
create trigger trg_community_answers_updated_at before update on public.community_answers
  for each row execute function public.handle_updated_at();
alter table public.community_posts enable row level security;
alter table public.community_answers enable row level security;
alter table public.community_votes enable row level security;
grant all on public.community_posts, public.community_answers, public.community_votes to anon, authenticated, service_role;
grant all on sequence public.community_votes_id_seq to anon, authenticated, service_role;

-- 20261016_06 requires 20260922_03 in force (lawyer_profiles.verification_status
-- not self-writable). stubs.sql grants ALL on every public table; this is the
-- part of 20260922_03 that matters here.
revoke insert, update on public.lawyer_profiles from anon, authenticated;
grant update (bio_ar) on public.lawyer_profiles to authenticated;

-- Production's policies, verbatim.
CREATE POLICY "anyone reads active community answers" ON public.community_answers FOR SELECT USING ((status = 'active'::text));
CREATE POLICY "anyone reads public community posts" ON public.community_posts FOR SELECT USING (((status = ANY (ARRAY['active'::text, 'closed'::text])) AND ((visibility = 'public'::text) OR (author_id = auth.uid()))));
CREATE POLICY "authors delete their own community answers" ON public.community_answers FOR DELETE USING ((author_id = auth.uid()));
CREATE POLICY "authors delete their own community posts" ON public.community_posts FOR DELETE USING ((author_id = auth.uid()));
CREATE POLICY "authors update their own community answers" ON public.community_answers FOR UPDATE USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "authors update their own community posts" ON public.community_posts FOR UPDATE USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "users create community answers" ON public.community_answers FOR INSERT WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "users create their own community posts" ON public.community_posts FOR INSERT WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "users create their own votes" ON public.community_votes FOR INSERT WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "users delete their own votes" ON public.community_votes FOR DELETE USING ((user_id = auth.uid()));
CREATE POLICY "users read their own votes" ON public.community_votes FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY "users update their own votes" ON public.community_votes FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, user_type, display_name) values
  ('a1000000-0000-0000-0000-000000000001', 'lawyer', 'L1'),
  ('a2000000-0000-0000-0000-000000000002', 'lawyer', 'L2'),
  ('b0000000-0000-0000-0000-00000000000b', 'lawyer', 'P'),
  ('c0000000-0000-0000-0000-00000000000c', 'individual', 'C');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('a1000000-0000-0000-0000-000000000001', 'verified'),
  ('a2000000-0000-0000-0000-000000000002', 'verified'),
  ('b0000000-0000-0000-0000-00000000000b', 'pending');

-- L1's lawyers-only post with an answer by L2; C's public post.
insert into public.community_posts (id, author_id, title, body, visibility) values
  ('11111111-aaaa-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'سؤال مهني', 'نص', 'lawyers_only'),
  ('22222222-aaaa-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'سؤال عام', 'نص', 'public');
insert into public.community_answers (id, post_id, author_id, body, is_lawyer_verified) values
  ('33333333-aaaa-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'جواب مهني', true);
