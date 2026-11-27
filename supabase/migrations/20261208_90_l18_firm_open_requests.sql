-- =============================================================================
-- Migration: 20261208_90_l18_firm_open_requests.sql   (verify id: l18_review)
-- =============================================================================
-- PURPOSE (batch l18 review, owner answer ٢٣٨ «يُفتح السوق ويظهر في القوائم
-- لجميع الأدوار»)
--
--   The firm account's market page (/dashboard/firm/marketplace) lists the open
--   requests through public.marketplace_open_requests, which answered only a
--   caller with a VERIFIED lawyer_profiles row. A firm account has none, so its
--   list could never fill. Re-created here with ONE change: the caller is a
--   verified lawyer (as before) OR owns a VERIFIED firm (firm_profiles).
--   Everything else is 20261206_40's body, word for word: the same columns
--   (never title, description, requester or metadata), the same filters (the
--   staff-published rows, the open market since opened_at once the Nezamy
--   priority window has passed, never test_accounts / is_demo rows, hidden rows
--   out), the same order and page size, SECURITY DEFINER with an empty
--   search_path, EXECUTE for authenticated and service_role only.
--
--   Taking a request stays a verified LAWYER's act (marketplace_request_accept,
--   unchanged): the firm's page shows the list without «اطلب القبول» and says
--   that a verified lawyer of the firm asks from his own account.
--
-- PRIVILEGES: unchanged (create or replace keeps them; re-stated below).
-- PREREQUISITES: 20261206_40 (marketplace_release_at, the current body).
-- ORDER: any time; BEFORE the deploy is best (until it runs, a verified firm
--   reads «لا توجد طلبات مفتوحة» on its page — never an error).
-- BACKFILL: none.
-- SAFE TO RE-RUN: yes (create or replace).
-- ROLLBACK (only with the owner's yes): re-run the marketplace_open_requests
--   section of 20261206_40_nzamy_priority_minutes.sql.
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_release_at' and not attisdropped) then
    raise exception '20261208_90: run 20261206_40_nzamy_priority_minutes.sql first (service_requests.marketplace_release_at is missing)';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = to_regclass('public.firm_profiles') and attname = 'verification_status' and not attisdropped) then
    raise exception '20261208_90: public.firm_profiles.verification_status is missing';
  end if;
end
$pre$;

create or replace function public.marketplace_open_requests(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id             text,
  type           text,
  receiver       text,
  city           text,
  public_summary text,
  status         text,
  created_at     timestamptz,
  category       text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.receiver, sr.city, sr.public_summary, sr.status, sr.created_at,
         coalesce(sr.marketplace_category,
                  case
                    when sr.type = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' in ('contracts', 'legal-filing') then 'drafting'
                    when sr.metadata ->> 'categoryId' in ('case-study', 'arbitration') then 'case'
                    else null
                  end) as category
    from public.service_requests sr
   where (exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
         -- l18 review (20261208_90): the owner of a verified firm reads the list too
         or exists (
           select 1 from public.firm_profiles fp
            where fp.owner_user_id = auth.uid()
              and fp.verification_status = 'verified'
         ))
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and sr.marketplace_hidden_at is null
     and not exists (select 1 from public.profiles p
                      where p.id = sr.requester_user_id and p.is_demo)
     and not exists (select 1 from public.test_accounts t
                      where t.user_id = sr.requester_user_id)
     and (
           (sr.marketplace_published_at is not null
            and sr.marketplace_category in ('consultation', 'case', 'drafting'))
        or exists (
             select 1 from public.platform_settings ps
              where ps.key = 'marketplace_market'
                and ps.value ->> 'open' = 'true'
                and sr.receiver = 'ai_workspace'
                and coalesce(sr.payment ->> 'status', 'not_required') = 'not_required'
                and sr.created_at >= coalesce(nullif(ps.value ->> 'opened_at', '')::timestamptz, 'infinity'::timestamptz)
                and coalesce(sr.marketplace_release_at, '-infinity'::timestamptz) <= pg_catalog.now()
                and exists (select 1 from public.profiles cp
                             where cp.id = sr.requester_user_id
                               and cp.user_type in ('individual', 'corporate', 'micro', 'ngo', 'government'))
           )
         )
   order by coalesce(sr.marketplace_published_at, sr.marketplace_release_at, sr.created_at) desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests(integer, integer) is
  '20261127_70 + 20261202_70 + 20261206_40 + 20261208_90 (owner ٢٣, l12 Q130a, l16 س٢٣, l18 ٢٣٨): staff-published requests, and while the market is open every client''s free request since opened_at once its Nezamy priority window has passed — id, type, receiver, city, public_summary, status, created_at, category. Never title, description, requester or metadata; never test_accounts / is_demo rows. Verified lawyers and the owners of verified firms only.';

do $gr$
declare r text;
begin
  revoke all on function public.marketplace_open_requests(integer, integer) from public;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.marketplace_open_requests(integer, integer) from %I', r);
    end if;
  end loop;
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('grant execute on function public.marketplace_open_requests(integer, integer) to %I', r);
    end if;
  end loop;
end
$gr$;

do $verify$
declare
  def text := pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure);
  missing text := '';
begin
  if pg_catalog.strpos(def, 'fp.verification_status = ''verified''') = 0 then
    missing := missing || ' the verified-firm reader is missing;';
  end if;
  if pg_catalog.strpos(def, 'lp.verification_status = ''verified''') = 0 then
    missing := missing || ' the verified-lawyer reader is missing;';
  end if;
  if pg_catalog.strpos(def, 'marketplace_release_at') = 0 or pg_catalog.strpos(def, 'marketplace_hidden_at is null') = 0
     or pg_catalog.strpos(def, 'marketplace_published_at is not null') = 0 or pg_catalog.strpos(def, 'test_accounts') = 0 then
    missing := missing || ' a 20261206_40 filter was lost;';
  end if;
  if coalesce(pg_catalog.pg_get_function_result('public.marketplace_open_requests(integer, integer)'::regprocedure), '') like '%title%' then
    missing := missing || ' the list returns a title;';
  end if;
  if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
                    where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure), false) then
    missing := missing || ' not SECURITY DEFINER with an empty search_path;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    missing := missing || ' anon can execute it;';
  end if;
  if missing <> '' then
    raise exception 'l18_review verify:%', missing;
  end if;
  raise notice 'l18_review verify: OK — marketplace_open_requests answers verified lawyers and the owners of verified firms; the 20261206_40 filters, columns and grants kept';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261208_90 l18 review: a verified firm reads the open requests' as migration,
       pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure),
                         'fp.verification_status = ''verified''') > 0 as ok;
