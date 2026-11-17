-- prelude_founder_l2_before.sql — runs BEFORE 20261124_10 in the chain of
-- founder_l2_2026_11_17.test.sql: one founder seat activated by the OLD
-- founder_activate (two credit rows, no library_question), so the test can
-- prove the migration's backfill gives an already-active seat its 20 library
-- questions with the same end as its other credits.
\set ON_ERROR_STOP on

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000b1001');
insert into public.profiles (id, user_type, display_name)
  values ('00000000-0000-0000-0000-0000000b1001', 'lawyer', 'مؤسس سابق');
insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
  values ('00000000-0000-0000-0000-0000000b1001', 'verified', 'advocate');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status, paid_at)
values ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000b1001', 'membership',
        'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'paid', now());

do $$
declare r text;
begin
  r := public.founder_activate('00000000-0000-0000-0000-0000000b2001');
  if r is distinct from 'activated' then
    raise exception 'PRELUDE FAIL: founder_activate returned %', r;
  end if;
  if exists (select 1 from public.membership_credits where kind not in ('drafting_work', 'independent_output')) then
    raise exception 'PRELUDE FAIL: the old founder_activate already wrote a third kind (is 20261124_10 applied already?)';
  end if;
end $$;
