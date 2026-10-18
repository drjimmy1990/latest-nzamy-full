-- =============================================================================
-- Migration: 20261019_10_library_access_grants.sql
-- =============================================================================
-- PURPOSE (owner answers ١٩٩ / ٢٠١–٢٠٣, decisions of 2026-10-18)
--   The library subscription is its own product, separate from the AI tools
--   and from the subscription tiers. Today every library approval grants the
--   whole "pro" tier (src/lib/entitlements.ts grantEntitlement writes a
--   subscriptions row and stamps user_metadata.tier), so a library-only
--   subscriber also gets the AI tools. This file creates the table that holds
--   a library-only grant: who, which library plan, where it came from, and the
--   window it covers. Later tasks of the batch write it (the admin approval,
--   invite codes, the founder campaign trigger) and read it (the library
--   access check); this file only creates it.
--
-- WHAT IT CREATES (idempotent — safe to run any number of times)
--   public.library_access_grants
--     id          uuid PK, gen_random_uuid()
--     user_id     uuid NOT NULL → auth.users(id) ON DELETE CASCADE
--     plan_ref    text NOT NULL, one of
--                   lib-q1, lib-q2, lib-annual, lib-invite, lib-trial,
--                   lib-founder, lib-admin
--     source      text NOT NULL, one of
--                   request, invite_code, colleague_invite, founder_campaign, admin
--     starts_at   timestamptz NOT NULL default now()
--     ends_at     timestamptz NOT NULL, CHECK ends_at > starts_at
--     granted_by  uuid NULL (the admin who granted it; no FK — the grant
--                 outlives the admin's account)
--     created_at  timestamptz NOT NULL default now()
--   index (user_id, ends_at) — "does this user hold a grant that ends after now".
--
-- WHO CAN DO WHAT
--   * RLS on; one policy, "own library grants": a signed-in user SELECTs only
--     their own rows (user_id = auth.uid()).
--   * revoke ALL from anon, authenticated, PUBLIC (the self-host restore's
--     default privileges give every new public table GRANT ALL to the API
--     roles), then grant SELECT to authenticated and ALL to service_role.
--     So a session can read its grants and can never give, stretch or remove
--     one; only the server (service role) and SECURITY DEFINER functions owned
--     by postgres write the table. A guest holds nothing.
--   Raising verify: the table and its columns exist, RLS is on, the CHECK lists
--   are the ones above, one policy, anon / PUBLIC hold no table or column
--   privilege, authenticated holds SELECT and no write, service_role holds ALL.
--
-- DEPLOY ORDER — EITHER ORDER
--   Nothing reads the table yet. The code of the later tasks that reads it
--   tolerates its absence (42P01) and falls back to today's behaviour.
--
-- ROLLBACK
--   drop table if exists public.library_access_grants;
--   (this deletes every library grant written after the file was applied)
-- =============================================================================

begin;

create table if not exists public.library_access_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_ref    text not null
              constraint library_access_grants_plan_ref_check
              check (plan_ref in ('lib-q1','lib-q2','lib-annual','lib-invite','lib-trial','lib-founder','lib-admin')),
  source      text not null
              constraint library_access_grants_source_check
              check (source in ('request','invite_code','colleague_invite','founder_campaign','admin')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  granted_by  uuid null,
  created_at  timestamptz not null default now(),
  constraint library_access_grants_window_check check (ends_at > starts_at)
);

create index if not exists library_access_grants_user_ends_idx
  on public.library_access_grants (user_id, ends_at);

comment on table public.library_access_grants is
  'Library-only access grants (20261019_10; owner answers ١٩٩ / ٢٠١–٢٠٣): the library subscription is separate from the subscription tiers. A user reads own rows; only the server writes.';

alter table public.library_access_grants enable row level security;

drop policy if exists "own library grants" on public.library_access_grants;
create policy "own library grants" on public.library_access_grants
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.library_access_grants from anon, authenticated, public;
grant select on public.library_access_grants to authenticated;
grant all on public.library_access_grants to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  tbl     constant text := 'public.library_access_grants';
  r       text;
  p       text;
  col     text;
  v       text;
  def     text;
  missing text := '';
begin
  if to_regclass(tbl) is null then
    raise exception '20261019_10 verify: public.library_access_grants does not exist';
  end if;

  foreach col in array array['id', 'user_id', 'plan_ref', 'source', 'starts_at', 'ends_at', 'granted_by', 'created_at'] loop
    if not exists (select 1 from pg_attribute
                    where attrelid = tbl::regclass and attname = col and not attisdropped) then
      missing := missing || format(' column %s is missing (an older table of the same name?);', col);
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid = tbl::regclass) then
    missing := missing || ' RLS is off;';
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = tbl::regclass and conname = 'library_access_grants_plan_ref_check';
  foreach v in array array['lib-q1', 'lib-q2', 'lib-annual', 'lib-invite', 'lib-trial', 'lib-founder', 'lib-admin'] loop
    if def is null or position(quote_literal(v) in def) = 0 then
      missing := missing || format(' plan_ref CHECK does not allow %s;', v);
    end if;
  end loop;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = tbl::regclass and conname = 'library_access_grants_source_check';
  foreach v in array array['request', 'invite_code', 'colleague_invite', 'founder_campaign', 'admin'] loop
    if def is null or position(quote_literal(v) in def) = 0 then
      missing := missing || format(' source CHECK does not allow %s;', v);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid = tbl::regclass and conname = 'library_access_grants_window_check') then
    missing := missing || ' the ends_at > starts_at CHECK is missing;';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'library_access_grants') <> 1 then
    missing := missing || ' expected exactly one policy;';
  end if;

  -- effective privileges: table level, then every column (pg_attribute sweep)
  foreach r in array array['anon', 'authenticated', 'public'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, tbl, p) <> (r = 'authenticated' and p = 'SELECT') then
        missing := missing || format(' %s %s %s;', r,
                     case when has_table_privilege(r, tbl, p) then 'holds' else 'lacks' end, p);
      end if;
    end loop;
    for col in select attname::text from pg_attribute
                where attrelid = tbl::regclass and attnum > 0 and not attisdropped loop
      if has_column_privilege(r, tbl, col, 'INSERT, UPDATE, REFERENCES')
         or (r <> 'authenticated' and has_column_privilege(r, tbl, col, 'SELECT')) then
        missing := missing || format(' %s holds a column privilege on %s;', r, col);
      end if;
    end loop;
  end loop;
  foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if not has_table_privilege('service_role', tbl, p) then
      missing := missing || format(' service_role lacks %s;', p);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261019_10 verify:%', missing;
  end if;
  raise notice '20261019_10 verify: OK — library_access_grants: RLS on, own-row SELECT for authenticated, no guest privilege, service_role ALL';
end $$;

commit;

notify pgrst, 'reload schema';
