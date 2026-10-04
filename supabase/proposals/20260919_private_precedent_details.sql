-- PROPOSAL ONLY: not an applied migration and not production approval.
-- Requires an isolated PostgreSQL/Supabase ACL + PostgREST test before moving
-- this file into supabase/migrations. Never add these bodies to library.principles
-- or its public FTS index. See Raw_Vault 14/79, 14/127 and 14/128.

begin;

create schema library_precedent_private;
revoke all on schema library_precedent_private from public, anon, authenticated, service_role;
grant usage on schema library_precedent_private to service_role;

create table library_precedent_private.precedent_unparsed_details (
  principle_id varchar(150) primary key
    references library.principles(id) on delete restrict,
  collection_id varchar(100) not null,
  source_locator text not null,
  body text not null,
  body_sha256 varchar(64) not null,
  review_state varchar(20) not null default 'unverified'
    check (review_state in ('unverified', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint precedent_unparsed_body_nonblank check (btrim(body) <> ''),
  constraint precedent_unparsed_hash_valid check (
    body_sha256 ~ '^[0-9a-f]{64}$'
    and body_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex')
  )
);

alter table library_precedent_private.precedent_unparsed_details enable row level security;
alter table library_precedent_private.precedent_unparsed_details force row level security;
revoke all on library_precedent_private.precedent_unparsed_details
  from public, anon, authenticated, service_role;
grant select, insert, update on library_precedent_private.precedent_unparsed_details
  to service_role;

comment on table library_precedent_private.precedent_unparsed_details is
  'Unverified judicial disclosure text; no direct Data API grant, reader policy, public search index, or public API response.';

-- Deliberately no read RPC. This write RPC exposes only a row count and is
-- callable solely by the server-side service role. SECURITY INVOKER is
-- deliberate: even if EXECUTE is mistakenly re-granted to anon later, that
-- role still has no private-schema/table privileges. The transaction below
-- closes the default PUBLIC EXECUTE window before commit. The fixed search
-- path and qualified relations avoid caller-controlled object resolution.
create function public.store_private_precedent_details(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  item jsonb;
  v_id text;
  v_collection text;
  v_locator text;
  v_body text;
  v_hash text;
  v_affected integer;
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 100 then
    raise exception 'private judicial batch must contain 1..100 rows';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'principle_id') <> 'string'
       or jsonb_typeof(item->'collection_id') <> 'string'
       or jsonb_typeof(item->'source_locator') <> 'string'
       or jsonb_typeof(item->'body') <> 'string'
       or jsonb_typeof(item->'body_sha256') <> 'string'
       or item->>'review_state' <> 'unverified' then
      raise exception 'invalid private judicial row shape';
    end if;

    v_id := item->>'principle_id';
    v_collection := item->>'collection_id';
    v_locator := item->>'source_locator';
    v_body := item->>'body';
    v_hash := item->>'body_sha256';
    if length(v_id) < 1 or length(v_id) > 150
       or length(v_collection) < 1 or length(v_collection) > 100
       or length(v_locator) < 1 or length(v_locator) > 200
       or btrim(v_body) = ''
       or v_hash !~ '^[0-9a-f]{64}$'
       or v_hash <> encode(sha256(convert_to(v_body, 'UTF8')), 'hex') then
      raise exception 'invalid private judicial row identity or digest';
    end if;

    if not exists (
      select 1 from library.principles p
      where p.id = v_id and p.collection_id = v_collection
    ) then
      raise exception 'private judicial row has no matching public principle identity';
    end if;

    insert into library_precedent_private.precedent_unparsed_details
      (principle_id, collection_id, source_locator, body, body_sha256, review_state)
    values (v_id, v_collection, v_locator, v_body, v_hash, 'unverified')
    on conflict (principle_id) do update set
      collection_id = excluded.collection_id,
      source_locator = excluded.source_locator,
      body = excluded.body,
      body_sha256 = excluded.body_sha256,
      updated_at = now()
    where library_precedent_private.precedent_unparsed_details.review_state = 'unverified';

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception 'reviewed private judicial row cannot be overwritten';
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.store_private_precedent_details(jsonb)
  from public, anon, authenticated;
grant execute on function public.store_private_precedent_details(jsonb)
  to service_role;

commit;
