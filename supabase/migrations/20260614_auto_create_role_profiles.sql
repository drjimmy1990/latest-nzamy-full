-- =============================================================================
-- Migration: Auto-create role-specific profile rows on user registration
-- =============================================================================
-- Depends on: 20260603_phase1_001_profiles.sql
-- Purpose:    When a new user registers as lawyer/provider, automatically create
--             the corresponding lawyer_profiles or provider_profiles row.
--             Also adds missing INSERT/UPDATE RLS policies for admin operations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update handle_new_user() to also create role-specific profiles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
  _sub_role text;
  _exp_str text;
  _years_exp int;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  -- Create the base profiles row
  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  );

  -- Auto-create lawyer_profiles row for lawyers
  if _user_type = 'lawyer' then
    -- Safely extract and parse years of experience from string options
    _exp_str := new.raw_user_meta_data ->> 'experience_years';
    _years_exp := 0;
    if _exp_str is not null and _exp_str <> '' then
      begin
        _years_exp := _exp_str::int;
      exception when others then
        if _exp_str like '%15%' or _exp_str like '%١٥%' then
          _years_exp := 15;
        elsif _exp_str like '%7-15%' or _exp_str like '%٧-١٥%' then
          _years_exp := 10;
        elsif _exp_str like '%3-7%' or _exp_str like '%٣-٧%' then
          _years_exp := 5;
        elsif _exp_str like '%1-3%' or _exp_str like '%١-٣%' then
          _years_exp := 2;
        elsif _exp_str like '%Less%' or _exp_str like '%أقل%' then
          _years_exp := 1;
        else
          begin
            _years_exp := coalesce((substring(_exp_str from '\d+'))::int, 0);
          exception when others then
            _years_exp := 0;
          end;
        end if;
      end;
    end if;

    insert into public.lawyer_profiles (
      user_id,
      license_number,
      specialties,
      years_experience,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      coalesce(
        (select array_agg(x)::text[]
         from jsonb_array_elements_text(
           case when jsonb_typeof(new.raw_user_meta_data -> 'provider_specialties') = 'array'
                then new.raw_user_meta_data -> 'provider_specialties'
                else '[]'::jsonb
           end
         ) as x),
        '{}'::text[]
      ),
      _years_exp,
      'pending',
      false,
      jsonb_build_object(
        'provider_type', coalesce(new.raw_user_meta_data ->> 'provider_type', 'lawyer'),
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  -- Auto-create provider_profiles row for providers (notary, arbitrator, bailiff)
  if _user_type = 'provider' then
    _sub_role := coalesce(new.raw_user_meta_data ->> 'sub_role', 'notary');
    if _sub_role not in ('notary', 'arbitrator', 'bailiff') then
      _sub_role := 'notary';
    end if;

    insert into public.provider_profiles (
      user_id,
      sub_role,
      license_number,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      _sub_role,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      'pending',
      false,
      jsonb_build_object(
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user()
  is 'Creates profiles + role-specific profile rows (lawyer_profiles, provider_profiles) on auth.users insert.';

-- ---------------------------------------------------------------------------
-- 2. Add missing RLS policies for admin operations on lawyer_profiles
-- ---------------------------------------------------------------------------

-- Admin can update any lawyer profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'admins update all lawyer profiles'
  ) then
    create policy "admins update all lawyer profiles"
      on public.lawyer_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Admin can update any provider profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'admins update all provider profiles'
  ) then
    create policy "admins update all provider profiles"
      on public.provider_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Self-insert for lawyer_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'users insert own lawyer profile'
  ) then
    create policy "users insert own lawyer profile"
      on public.lawyer_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- Self-insert for provider_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'users insert own provider profile'
  ) then
    create policy "users insert own provider profile"
      on public.provider_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- =============================================================================
-- End of migration
-- =============================================================================
