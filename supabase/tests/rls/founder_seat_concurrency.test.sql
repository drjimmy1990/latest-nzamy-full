-- founder_seat_concurrency.test.sql — S10-a assertions (owner package 17 Nov,
-- required security test): after 1,100 reservation attempts by 1,100
-- different verified advocates, fired CONCURRENTLY by pgbench against a
-- capacity of 1096, exactly 1096 seats are held and nobody oversold.
-- Run by founder_seat_concurrency.sh (it prints how the attempts overlapped).
\set ON_ERROR_STOP on

-- T1 every attempt ran and answered; nothing raised
do $$
declare
  n_all int := (select count(*) from public.s10_results);
  n_err int := (select count(*) from public.s10_results where error is not null);
begin
  if n_all <> 1100 then
    raise exception 'T1 FAIL: % attempts recorded, expected 1100', n_all;
  end if;
  if n_err <> 0 then
    raise exception 'T1 FAIL: % attempts raised, e.g. %', n_err,
      (select error from public.s10_results where error is not null limit 1);
  end if;
  raise notice 'T1 PASS: 1100 attempts, 0 errors';
end $$;

-- T2 exactly 1096 reserved and 4 full — the answers
do $$
declare
  n_res  int := (select count(*) from public.s10_results where answer = 'reserved');
  n_full int := (select count(*) from public.s10_results where answer = 'full');
  other  text := (select string_agg(distinct answer, ',') from public.s10_results
                   where answer not in ('reserved', 'full'));
begin
  if n_res <> 1096 or n_full <> 4 or other is not null then
    raise exception 'T2 FAIL: reserved %, full %, other %', n_res, n_full, other;
  end if;
  raise notice 'T2 PASS: 1096 reserved, 4 full, no other answer';
end $$;

-- T3 the table agrees: 1096 live holds, one per user, one per order, all on
-- an order of the same user; capacity never exceeded
do $$
declare
  live int := (select count(*) from public.founder_seats
                where campaign_id = 'founder-2026' and status = 'reserved' and reserved_until > now());
  taken int := (select count(*) from public.founder_seats
                 where campaign_id = 'founder-2026'
                   and (status = 'active' or (status = 'reserved' and reserved_until > now())));
begin
  if live <> 1096 or taken <> 1096 then
    raise exception 'T3 FAIL: % live holds, % seats taken (capacity 1096)', live, taken;
  end if;
  if exists (select user_id from public.founder_seats where status in ('reserved', 'active')
              group by user_id having count(*) > 1) then
    raise exception 'T3 FAIL: a user holds two seats';
  end if;
  if exists (select order_id from public.founder_seats group by order_id having count(*) > 1) then
    raise exception 'T3 FAIL: an order holds two seats';
  end if;
  if exists (select 1 from public.founder_seats s join public.payment_orders o on o.id = s.order_id
              where o.user_id is distinct from s.user_id) then
    raise exception 'T3 FAIL: a seat sits on another user''s order';
  end if;
  if (select count(*) from public.founder_seats s
        join public.s10_results r on true
        join public.s10_pairs p on p.n = r.n and p.order_id = s.order_id
       where r.answer = 'reserved') <> 1096 then
    raise exception 'T3 FAIL: the seats are not exactly the orders that were answered reserved';
  end if;
  raise notice 'T3 PASS: 1096 live holds = capacity, one per user, one per order, each on its own order';
end $$;

-- T4 the summary the admin page reads says the same: 0 left, nothing on sale
do $$
declare s record;
begin
  select * into s from public.founder_seat_summary();
  if s.capacity <> 1096 or s.reserved <> 1096 or s.seats_left <> 0 or s.on_sale then
    raise exception 'T4 FAIL: founder_seat_summary = %', row_to_json(s);
  end if;
  raise notice 'T4 PASS: founder_seat_summary: capacity 1096, reserved 1096, seats_left 0, on_sale false';
end $$;

-- T5 a second wave by the four refused lawyers is still full; a holder
-- retrying keeps his one seat (the same seat moves to his new order)
do $$
declare
  p record;
  r text;
  n_full int := 0;
  v_order uuid;
begin
  for p in select pr.* from public.s10_pairs pr join public.s10_results rr on rr.n = pr.n
            where rr.answer = 'full' loop
    insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                       total_halalas, vat_mode, status)
    values (gen_random_uuid(), p.user_id, 'membership', 'lawyer-founder-2026', 'once', 299600, 44940,
            344540, 'exclusive', 'initiated')
    returning id into v_order;
    r := public.founder_reserve_seat(p.user_id, v_order);
    if r = 'full' then n_full := n_full + 1; end if;
  end loop;
  if n_full <> 4 then
    raise exception 'T5 FAIL: % of the 4 refused got a seat on retry', 4 - n_full;
  end if;

  select pr.* into p from public.s10_pairs pr join public.s10_results rr on rr.n = pr.n
   where rr.answer = 'reserved' limit 1;
  insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                     total_halalas, vat_mode, status)
  values (gen_random_uuid(), p.user_id, 'membership', 'lawyer-founder-2026', 'once', 299600, 44940,
          344540, 'exclusive', 'initiated')
  returning id into v_order;
  r := public.founder_reserve_seat(p.user_id, v_order);
  if r <> 'reserved' then
    raise exception 'T5 FAIL: a holder retrying got %', r;
  end if;
  if (select count(*) from public.founder_seats
       where status = 'reserved' and reserved_until > now()) <> 1096 then
    raise exception 'T5 FAIL: the retry changed the count of live holds';
  end if;
  raise notice 'T5 PASS: the 4 refused stay refused; a holder''s retry keeps 1096 live holds';
end $$;

select 'S10-a founder seat concurrency' as step, true as ok;
