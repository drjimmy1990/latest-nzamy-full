-- =============================================================================
-- Phase 1 · Migration 004 — Community, Research, Chat, Groups & Settings
-- =============================================================================
-- Creates 14 tables:  community_posts, community_answers, community_votes,
--   groups, group_members, group_invitations, research_sessions, research_items,
--   law_draft_carts, user_settings, chat_rooms, chat_participants,
--   chat_messages, team_invitations
--
-- Depends on:  public.profiles(id), public.subscription_plans(id),
--              public.service_requests(id), public.cases(id)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function — set updated_at = now() on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function public.handle_updated_at()
  is 'Trigger function: auto-sets updated_at to now() on row UPDATE.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. community_posts — Q&A forum questions
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general'
    check (category in (
      'general', 'labor', 'commercial', 'criminal', 'family',
      'real_estate', 'administrative', 'intellectual_property',
      'international', 'other'
    )),
  visibility text not null default 'public'
    check (visibility in ('public', 'lawyers_only', 'private')),
  status text not null default 'active'
    check (status in ('active', 'closed', 'moderated', 'deleted')),
  is_pinned boolean not null default false,
  vote_count int not null default 0,
  answer_count int not null default 0,
  view_count int not null default 0,
  accepted_answer_id uuid,  -- FK added after community_answers exists
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_community_posts_author       on public.community_posts (author_id);
create index if not exists idx_community_posts_category     on public.community_posts (category);
create index if not exists idx_community_posts_visibility   on public.community_posts (visibility);
create index if not exists idx_community_posts_status       on public.community_posts (status);
create index if not exists idx_community_posts_created      on public.community_posts (created_at desc);
create index if not exists idx_community_posts_pinned       on public.community_posts (is_pinned) where is_pinned = true;
create index if not exists idx_community_posts_tags         on public.community_posts using gin (tags);

-- updated_at trigger
create trigger trg_community_posts_updated_at
  before update on public.community_posts
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. community_answers — Answers to community posts
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_lawyer_verified boolean not null default false,
  vote_count int not null default 0,
  status text not null default 'active'
    check (status in ('active', 'moderated', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Now add the deferred FK from community_posts → community_answers
alter table public.community_posts
  add constraint fk_community_posts_accepted_answer
  foreign key (accepted_answer_id)
  references public.community_answers(id)
  on delete set null;

-- Indexes
create index if not exists idx_community_answers_post       on public.community_answers (post_id);
create index if not exists idx_community_answers_author     on public.community_answers (author_id);
create index if not exists idx_community_answers_status     on public.community_answers (status);
create index if not exists idx_community_answers_verified   on public.community_answers (is_lawyer_verified) where is_lawyer_verified = true;

-- updated_at trigger
create trigger trg_community_answers_updated_at
  before update on public.community_answers
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. community_votes — Up/down votes on posts and answers
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_votes (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'answer')),
  target_id uuid not null,
  value int not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique(user_id, target_type, target_id)
);

-- Indexes
create index if not exists idx_community_votes_user         on public.community_votes (user_id);
create index if not exists idx_community_votes_target       on public.community_votes (target_type, target_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. groups — Shared subscription groups
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  plan_id text references public.subscription_plans(id) on delete set null,
  max_members int not null default 5,
  join_code text unique,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_groups_owner                 on public.groups (owner_id);
create index if not exists idx_groups_plan                  on public.groups (plan_id);
create index if not exists idx_groups_status                on public.groups (status);

-- updated_at trigger
create trigger trg_groups_updated_at
  before update on public.groups
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. group_members — Members within a group
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'removed')),
  joined_at timestamptz not null default now(),
  unique(group_id, user_id)
);

-- Indexes
create index if not exists idx_group_members_group          on public.group_members (group_id);
create index if not exists idx_group_members_user           on public.group_members (user_id);
create index if not exists idx_group_members_status         on public.group_members (status);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. group_invitations — Invitations to join a group
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_group_invitations_group      on public.group_invitations (group_id);
create index if not exists idx_group_invitations_inviter    on public.group_invitations (inviter_id);
create index if not exists idx_group_invitations_status     on public.group_invitations (status);
create index if not exists idx_group_invitations_email      on public.group_invitations (invitee_email) where invitee_email is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. research_sessions — AI Research Workspace sessions
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  tool_id text not null default 'general',
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted')),
  progress numeric(5,2) not null default 0,  -- 0.00 – 100.00
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_research_sessions_user       on public.research_sessions (user_id);
create index if not exists idx_research_sessions_status     on public.research_sessions (status);
create index if not exists idx_research_sessions_tool       on public.research_sessions (tool_id);

-- updated_at trigger
create trigger trg_research_sessions_updated_at
  before update on public.research_sessions
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. research_items — Items within a research session
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  content text not null,
  source text not null default '',
  item_type text not null default 'fact'
    check (item_type in ('fact', 'source', 'note', 'highlight', 'bookmark', 'ai_output')),
  position int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_research_items_session       on public.research_items (session_id);
create index if not exists idx_research_items_type          on public.research_items (item_type);
create index if not exists idx_research_items_position      on public.research_items (session_id, position);


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. law_draft_carts — Legal library draft collection
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.law_draft_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  law_slug text not null,
  article_number text not null,
  article_text text not null default '',
  is_exec_reg_added boolean not null default false,
  exec_reg_text text not null default '',
  position int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, law_slug, article_number)
);

-- Indexes
create index if not exists idx_law_draft_carts_user         on public.law_draft_carts (user_id);
create index if not exists idx_law_draft_carts_slug         on public.law_draft_carts (law_slug);
create index if not exists idx_law_draft_carts_position     on public.law_draft_carts (user_id, position);


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. user_settings — User preferences (1-to-1 with profiles)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notifications_enabled boolean not null default true,
  email_notifications boolean not null default true,
  whatsapp_notifications boolean not null default false,
  push_notifications boolean not null default false,
  newsletter boolean not null default false,
  marketing_emails boolean not null default false,
  two_factor_enabled boolean not null default false,
  session_timeout_minutes int not null default 60,
  data_sharing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. chat_rooms — Real-time chat rooms
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  request_id text references public.service_requests(id) on delete set null,
  case_id text references public.cases(id) on delete set null,
  name text not null default '',
  room_type text not null default 'direct'
    check (room_type in ('direct', 'group', 'service', 'case', 'consultation')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chat_rooms_request           on public.chat_rooms (request_id) where request_id is not null;
create index if not exists idx_chat_rooms_case              on public.chat_rooms (case_id) where case_id is not null;
create index if not exists idx_chat_rooms_type              on public.chat_rooms (room_type);
create index if not exists idx_chat_rooms_status            on public.chat_rooms (status);

-- updated_at trigger
create trigger trg_chat_rooms_updated_at
  before update on public.chat_rooms
  for each row execute function public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. chat_participants — Users in a chat room
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'observer')),
  last_read_at timestamptz,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);

-- Indexes
create index if not exists idx_chat_participants_room       on public.chat_participants (room_id);
create index if not exists idx_chat_participants_user       on public.chat_participants (user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. chat_messages — Real-time chat messages
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_messages (
  id bigserial primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'file', 'image', 'audio', 'system', 'ai_response')),
  file_url text,
  file_name text,
  file_size bigint,
  reply_to bigint references public.chat_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chat_messages_room           on public.chat_messages (room_id);
create index if not exists idx_chat_messages_sender         on public.chat_messages (sender_id);
create index if not exists idx_chat_messages_room_created   on public.chat_messages (room_id, created_at desc);
create index if not exists idx_chat_messages_reply          on public.chat_messages (reply_to) where reply_to is not null;


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. team_invitations — Entity team invitations
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null
    check (entity_type in ('firm', 'business', 'government', 'ngo')),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_phone text,
  role text not null,
  department text,
  seat_type text not null default 'member'
    check (seat_type in ('assistant', 'member', 'professional')),
  scope text not null default 'entity'
    check (scope in ('personal', 'entity', 'department', 'case')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_team_invitations_entity      on public.team_invitations (entity_id, entity_type);
create index if not exists idx_team_invitations_inviter     on public.team_invitations (inviter_id);
create index if not exists idx_team_invitations_email       on public.team_invitations (invitee_email) where invitee_email is not null;
create index if not exists idx_team_invitations_token       on public.team_invitations (token);
create index if not exists idx_team_invitations_status      on public.team_invitations (status);


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Enable on all tables
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.community_posts      enable row level security;
alter table public.community_answers    enable row level security;
alter table public.community_votes      enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.group_invitations    enable row level security;
alter table public.research_sessions    enable row level security;
alter table public.research_items       enable row level security;
alter table public.law_draft_carts      enable row level security;
alter table public.user_settings        enable row level security;
alter table public.chat_rooms           enable row level security;
alter table public.chat_participants    enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.team_invitations     enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- community_posts
-- ---------------------------------------------------------------------------
-- Anyone authenticated can read public posts; lawyers_only filtered by app
create policy "anyone reads public community posts"
  on public.community_posts for select
  using (
    status in ('active', 'closed')
    and (visibility = 'public' or author_id = auth.uid())
  );

create policy "users create their own community posts"
  on public.community_posts for insert
  with check (author_id = auth.uid());

create policy "authors update their own community posts"
  on public.community_posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors delete their own community posts"
  on public.community_posts for delete
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- community_answers
-- ---------------------------------------------------------------------------
create policy "anyone reads active community answers"
  on public.community_answers for select
  using (status = 'active');

create policy "users create community answers"
  on public.community_answers for insert
  with check (author_id = auth.uid());

create policy "authors update their own community answers"
  on public.community_answers for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors delete their own community answers"
  on public.community_answers for delete
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- community_votes
-- ---------------------------------------------------------------------------
create policy "users read their own votes"
  on public.community_votes for select
  using (user_id = auth.uid());

create policy "users create their own votes"
  on public.community_votes for insert
  with check (user_id = auth.uid());

create policy "users update their own votes"
  on public.community_votes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete their own votes"
  on public.community_votes for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create policy "group members read their groups"
  on public.groups for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
    )
  );

create policy "users create groups"
  on public.groups for insert
  with check (owner_id = auth.uid());

create policy "owners update their groups"
  on public.groups for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners delete their groups"
  on public.groups for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
create policy "group members read membership"
  on public.group_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
  );

create policy "group owners manage members"
  on public.group_members for insert
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
  );

create policy "group owners update members"
  on public.group_members for update
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
  );

create policy "group owners remove members"
  on public.group_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- group_invitations
-- ---------------------------------------------------------------------------
create policy "inviters and invitees read group invitations"
  on public.group_invitations for select
  using (inviter_id = auth.uid());

create policy "group owners create invitations"
  on public.group_invitations for insert
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_invitations.group_id
        and g.owner_id = auth.uid()
    )
  );

create policy "inviters update invitations"
  on public.group_invitations for update
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- research_sessions
-- ---------------------------------------------------------------------------
create policy "users read their own research sessions"
  on public.research_sessions for select
  using (user_id = auth.uid());

create policy "users create their own research sessions"
  on public.research_sessions for insert
  with check (user_id = auth.uid());

create policy "users update their own research sessions"
  on public.research_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete their own research sessions"
  on public.research_sessions for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- research_items
-- ---------------------------------------------------------------------------
create policy "users read items in their sessions"
  on public.research_items for select
  using (
    exists (
      select 1 from public.research_sessions rs
      where rs.id = research_items.session_id
        and rs.user_id = auth.uid()
    )
  );

create policy "users create items in their sessions"
  on public.research_items for insert
  with check (
    exists (
      select 1 from public.research_sessions rs
      where rs.id = research_items.session_id
        and rs.user_id = auth.uid()
    )
  );

create policy "users update items in their sessions"
  on public.research_items for update
  using (
    exists (
      select 1 from public.research_sessions rs
      where rs.id = research_items.session_id
        and rs.user_id = auth.uid()
    )
  );

create policy "users delete items in their sessions"
  on public.research_items for delete
  using (
    exists (
      select 1 from public.research_sessions rs
      where rs.id = research_items.session_id
        and rs.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- law_draft_carts
-- ---------------------------------------------------------------------------
create policy "users read their own draft carts"
  on public.law_draft_carts for select
  using (user_id = auth.uid());

create policy "users create their own draft carts"
  on public.law_draft_carts for insert
  with check (user_id = auth.uid());

create policy "users update their own draft carts"
  on public.law_draft_carts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete their own draft carts"
  on public.law_draft_carts for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create policy "users read their own settings"
  on public.user_settings for select
  using (user_id = auth.uid());

create policy "users create their own settings"
  on public.user_settings for insert
  with check (user_id = auth.uid());

create policy "users update their own settings"
  on public.user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- chat_rooms — participants only
-- ---------------------------------------------------------------------------
create policy "chat participants read their rooms"
  on public.chat_rooms for select
  using (
    exists (
      select 1 from public.chat_participants cp
      where cp.room_id = chat_rooms.id
        and cp.user_id = auth.uid()
    )
  );

create policy "authenticated users create chat rooms"
  on public.chat_rooms for insert
  with check (auth.uid() is not null);

create policy "chat participants update their rooms"
  on public.chat_rooms for update
  using (
    exists (
      select 1 from public.chat_participants cp
      where cp.room_id = chat_rooms.id
        and cp.user_id = auth.uid()
        and cp.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- chat_participants
-- ---------------------------------------------------------------------------
create policy "participants read room membership"
  on public.chat_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_participants cp2
      where cp2.room_id = chat_participants.room_id
        and cp2.user_id = auth.uid()
    )
  );

create policy "room owners add participants"
  on public.chat_participants for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_participants cp
      where cp.room_id = chat_participants.room_id
        and cp.user_id = auth.uid()
        and cp.role in ('owner', 'admin')
    )
  );

create policy "participants update their own record"
  on public.chat_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "participants remove themselves"
  on public.chat_participants for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create policy "room participants read messages"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_participants cp
      where cp.room_id = chat_messages.room_id
        and cp.user_id = auth.uid()
    )
  );

create policy "room participants send messages"
  on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_participants cp
      where cp.room_id = chat_messages.room_id
        and cp.user_id = auth.uid()
    )
  );

create policy "senders update their own messages"
  on public.chat_messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- team_invitations
-- ---------------------------------------------------------------------------
create policy "inviters read their team invitations"
  on public.team_invitations for select
  using (inviter_id = auth.uid());

create policy "inviters create team invitations"
  on public.team_invitations for insert
  with check (inviter_id = auth.uid());

create policy "inviters update team invitations"
  on public.team_invitations for update
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

create policy "inviters cancel team invitations"
  on public.team_invitations for delete
  using (inviter_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE REALTIME — Publish chat_messages & notifications
-- ═══════════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.notifications;
