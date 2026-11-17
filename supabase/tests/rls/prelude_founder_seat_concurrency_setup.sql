-- prelude_founder_seat_concurrency_setup.sql — S10-a setup (owner package
-- 17 Nov, required security test), run by founder_seat_concurrency.sh AFTER
-- the founder chain. 1,100 verified advocates, one open membership order
-- each, the sale window around now, capacity 1096, no seat taken — plus the
-- pairs table and sequence the pgbench clients draw from, so every attempt
-- is a DIFFERENT user and order.
\set ON_ERROR_STOP on

delete from public.membership_credits;
delete from public.founder_seats;

update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'capacity', 1096,
         'sale_paused', false)
 where key = 'founder_campaign';

create table public.s10_pairs (
  n        int primary key,
  user_id  uuid not null,
  order_id uuid not null
);
create table public.s10_results (
  n        int primary key,
  answer   text,
  error    text,
  pid      int not null default pg_backend_pid(),
  at       timestamptz not null default clock_timestamp()
);
create sequence public.s10_next;

insert into public.s10_pairs (n, user_id, order_id)
select g, gen_random_uuid(), gen_random_uuid() from generate_series(1, 1100) g;

insert into auth.users (id) select user_id from public.s10_pairs;
insert into public.profiles (id, user_type, display_name)
  select user_id, 'lawyer', 'S10 ' || n from public.s10_pairs;
insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
  select user_id, 'verified', 'advocate' from public.s10_pairs;
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
  select order_id, user_id, 'membership', 'lawyer-founder-2026', 'once', 299600, 44940, 344540,
         'exclusive', 'initiated'
    from public.s10_pairs;

-- One attempt: the next pair, founder_reserve_seat in this transaction, the
-- answer (or the error) recorded. Never raises, so pgbench counts no failure
-- and the assertions see every attempt.
create function public.s10_attempt() returns text
language plpgsql as $$
declare
  k int := nextval('public.s10_next');
  p record;
  r text;
begin
  select * into p from public.s10_pairs where n = k;
  if p.n is null then
    return 'no_pair';
  end if;
  begin
    r := public.founder_reserve_seat(p.user_id, p.order_id);
    insert into public.s10_results (n, answer) values (k, r);
  exception when others then
    insert into public.s10_results (n, error) values (k, sqlstate || ' ' || sqlerrm);
  end;
  return coalesce(r, 'error');
end $$;

do $$
begin
  if (select capacity from public.founder_campaign_limits()) <> 1096 then
    raise exception 'SETUP FAIL: capacity is not 1096';
  end if;
  if not public.founder_campaign_active(now()) then
    raise exception 'SETUP FAIL: the sale window is not open';
  end if;
  if (select count(*) from public.s10_pairs) <> 1100 or exists (select 1 from public.founder_seats) then
    raise exception 'SETUP FAIL: pairs / seats';
  end if;
  raise notice 'S10 setup: 1100 verified advocates with one open order each, capacity 1096, window open, 0 seats';
end $$;
