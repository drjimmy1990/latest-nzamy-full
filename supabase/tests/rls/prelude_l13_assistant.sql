-- prelude_l13_assistant.sql — loaded right BEFORE the first 20261203_50 in
-- the l13_assistant.test.sql chain: the live state that file meets — an
-- ai_tools row where the general assistant (quick-answer) is open, and the
-- individual's free-question setting still on l12's seeded "quick-answer".
insert into public.platform_settings (key, value, description) values
  ('ai_tools', '{"quick-answer": {"mode": "live"}, "library-assistant": {"mode": "live"}}'::jsonb, 'ai tools (test)')
on conflict (key) do update set value = excluded.value;

do $$
begin
  if (select value ->> 'individual' from public.platform_settings where key = 'free_question_tool_by_account_type') is distinct from 'quick-answer' then
    raise exception 'PRELUDE FAIL: 20261202_50 did not seed the individual on quick-answer';
  end if;
end $$;
