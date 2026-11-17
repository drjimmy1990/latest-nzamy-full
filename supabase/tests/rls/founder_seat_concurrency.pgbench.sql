-- One founder seat reservation attempt per pgbench transaction (S10-a):
-- s10_attempt() takes the next distinct user/order pair and calls
-- founder_reserve_seat. See founder_seat_concurrency.sh.
SELECT public.s10_attempt();
