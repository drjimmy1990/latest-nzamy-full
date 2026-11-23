-- ONE-TIME READ-ONLY CHECK — run once BEFORE deploying the "consultant = library only" change.
-- Counts independent consultants (lawyer_profiles.practice_kind = 'consultant') who hold a PAID
-- subscription. The owner's decision (22-23 Nov 2026) moves every consultant at once whatever his
-- plan, so this does not delay anything; it tells the owner who, if anyone, to write to about a refund.
-- Changes nothing. (tier: free | ai | pro | corp | max; status: active, past_due, trialing ... )

-- 1) The headline number.
select count(distinct lp.user_id) as consultants_with_paid_subscription
from public.lawyer_profiles lp
join public.subscriptions s on s.user_id = lp.user_id
where lp.practice_kind = 'consultant'
  and s.tier <> 'free'
  and s.status in ('active', 'trialing', 'past_due');

-- 2) Who they are (ids and plan only; no personal data), for the owner's follow-up.
select lp.user_id, s.tier, s.status, s.current_period_start, s.current_period_end
from public.lawyer_profiles lp
join public.subscriptions s on s.user_id = lp.user_id
where lp.practice_kind = 'consultant'
  and s.tier <> 'free'
  and s.status in ('active', 'trialing', 'past_due')
order by s.current_period_end nulls last;

-- 3) For context: how many consultants exist, and how many of them belong to a firm
--    (an active firm member keeps the firm role's tools and is NOT affected).
select
  count(*) as consultants,
  count(*) filter (where exists (
    select 1 from public.firm_members m where m.user_id = lp.user_id and m.status = 'active'
  )) as consultants_who_are_firm_members
from public.lawyer_profiles lp
where lp.practice_kind = 'consultant';
