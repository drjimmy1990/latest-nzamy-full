-- prelude_admin_points_reason.sql — runs AFTER 20261022_33 and BEFORE the
-- first 20261022_34 in admin_points_reason.test.sql's chain. It makes the
-- rows _34 must fix (and one it must leave alone) with _33's old function:
--   * 'old admin debit'  — _33's adjust_admin_points(-30): written as reason
--     'usage', tool 'admin_adjustment' (the bug); _34 relabels it.
--   * 'real usage'       — a genuine debit_points(…, 'ai_chat', …): stays usage.
select public.adjust_admin_points('00000000-0000-0000-0000-00000000e002', 50, now() + interval '12 months', 'admin seed');
select public.adjust_admin_points('00000000-0000-0000-0000-00000000e002', -30, now() + interval '12 months', 'old admin debit');
select public.debit_points('00000000-0000-0000-0000-00000000e002', 5, 'ai_chat', 'real usage');
do $$ begin
  if not exists (select 1 from public.points_ledger where ref = 'old admin debit' and reason = 'usage' and tool = 'admin_adjustment') then
    raise exception 'prelude: _33 did not produce the mislabelled row this test needs';
  end if;
end $$;
