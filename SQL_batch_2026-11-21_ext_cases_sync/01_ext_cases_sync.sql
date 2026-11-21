-- POST /api/v1/ext/cases/sync — جداول + دالة المعاملة الواحدة.
-- مسودة غير مُشغَّلة: لا تُشغَّل إلا بموافقة المالك. تتطلب جدول cases الموجود (id text, assigned_user_id, title, metadata).
-- مطابقة القضية: (assigned_user_id, metadata.ext.platform, metadata.ext.number) — لا أعمدة جديدة على cases.

create table if not exists public.ext_case_syncs (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) <= 128),
  case_id text not null references public.cases(id) on delete cascade,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create table if not exists public.ext_case_items (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('party','session','attachment','record')),
  sha256 text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
-- إزالة التكرار بالبصمة للمرفقات والسجلات
create unique index if not exists ext_case_items_sha_uq on public.ext_case_items (case_id, kind, sha256) where sha256 is not null;
create index if not exists ext_case_items_case_idx on public.ext_case_items (case_id, kind);

-- الوصول عبر مفتاح الخدمة فقط (باب /ext لا يستعمل RLS)
alter table public.ext_case_syncs enable row level security;
alter table public.ext_case_items enable row level security;

create or replace function public.ext_cases_sync(p_user uuid, p_req jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_req->>'idempotency_key';
  v_plat text := p_req#>>'{source,platform}';
  v_num text := p_req#>>'{case,number}';
  v_prev jsonb;
  v_case text;
  v_created boolean := false;
  v_ext jsonb;
  v_counts jsonb;
  v_resp jsonb;
  v_p int := 0; v_s int := 0; v_a int := 0; v_r int := 0; n int;
  it jsonb;
begin
  -- تفريغ المتزامنين على المفتاح نفسه
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || v_key, 0));

  select response into v_prev from ext_case_syncs where user_id = p_user and idempotency_key = v_key;
  if found then
    return v_prev || jsonb_build_object('created', false, 'replayed', true);
  end if;

  select id into v_case from cases
   where assigned_user_id = p_user and metadata#>>'{ext,platform}' = v_plat and metadata#>>'{ext,number}' = v_num
   limit 1;

  v_ext := jsonb_strip_nulls(jsonb_build_object(
    'platform', v_plat, 'number', v_num,
    'year_hijri', p_req#>'{case,year_hijri}', 'court', p_req#>'{case,court}',
    'type', p_req#>'{case,type}', 'status', p_req#>'{case,status}',
    'last_captured_at', p_req#>'{source,captured_at}'));

  if v_case is null then
    v_case := 'case_' || replace(gen_random_uuid()::text, '-', '');
    insert into cases (id, assigned_user_id, title, metadata)
    values (v_case, p_user, 'قضية ' || v_num || ' (' || v_plat || ')', jsonb_build_object('ext', v_ext));
    v_created := true;
  else
    -- تُملأ الحقول الفارغة فقط؛ ما عدّله المحامي لا يُستبدل. last_captured_at يتحدّث دائمًا.
    update cases set metadata = jsonb_set(metadata, '{ext}', v_ext || coalesce(metadata->'ext','{}'::jsonb) || jsonb_build_object('last_captured_at', v_ext->'last_captured_at')),
                     updated_at = now()
     where id = v_case and assigned_user_id = p_user;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_req->'parties','[]')) loop
    insert into ext_case_items(user_id, case_id, kind, sha256, payload) values (p_user, v_case, 'party', null, it);
    v_p := v_p + 1;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(p_req->'sessions','[]')) loop
    insert into ext_case_items(user_id, case_id, kind, sha256, payload) values (p_user, v_case, 'session', null, it);
    v_s := v_s + 1;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(p_req->'attachments','[]')) loop
    insert into ext_case_items(user_id, case_id, kind, sha256, payload) values (p_user, v_case, 'attachment', it->>'sha256', it)
      on conflict (case_id, kind, sha256) where sha256 is not null do nothing;
    get diagnostics n = row_count; v_a := v_a + n;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(p_req->'records','[]')) loop
    insert into ext_case_items(user_id, case_id, kind, sha256, payload) values (p_user, v_case, 'record', it->>'sha256', it)
      on conflict (case_id, kind, sha256) where sha256 is not null do nothing;
    get diagnostics n = row_count; v_r := v_r + n;
  end loop;

  v_counts := jsonb_build_object('parties', v_p, 'sessions', v_s, 'attachments', v_a, 'records', v_r);
  v_resp := jsonb_build_object('case_id', v_case, 'created', v_created, 'replayed', false, 'counts', v_counts);
  insert into ext_case_syncs(user_id, idempotency_key, case_id, response) values (p_user, v_key, v_case, v_resp);
  return v_resp;
end $$;

revoke all on function public.ext_cases_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ext_cases_sync(uuid, jsonb) to service_role;
