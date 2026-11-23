-- prelude_l13_assistant_rerun.sql — loaded BETWEEN the two runs of
-- 20261203_50 in the l13_assistant.test.sql chain: after the first run an
-- admin moves the individual's questions back to the quick answer and
-- switches the floating tool off. The second run must keep both choices.
do $$
begin
  if (select value ->> 'individual' from public.platform_settings where key = 'free_question_tool_by_account_type') is distinct from 'floating' then
    raise exception 'BETWEEN FAIL: the first run did not move the individual to floating';
  end if;
  if (select value -> 'floating' ->> 'mode' from public.platform_settings where key = 'ai_tools') is distinct from 'live' then
    raise exception 'BETWEEN FAIL: the first run did not copy quick-answer''s mode (live) into ai_tools.floating';
  end if;
end $$;

update public.platform_settings set value = '{"individual": "quick-answer"}'::jsonb where key = 'free_question_tool_by_account_type';
update public.platform_settings set value = jsonb_set(value, '{floating,mode}', '"off"') where key = 'ai_tools';
update public.platform_settings set value = '{"voice": "Microsoft Hamed"}'::jsonb where key = 'listen_voice';
