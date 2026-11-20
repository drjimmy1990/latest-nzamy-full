-- l11_remind_foreign_kind.fixture.sql — test fixture for
-- l11_remind_reminder_kinds.test.sql: stands in for ANOTHER migration that
-- rebuilt email_reminder_log's kind CHECK with a FIXED list after 20261201_45
-- ran — the five original kinds plus its own 'test_foreign_kind', i.e. it
-- dropped the l11-remind kinds. Re-running 20261201_45 afterwards must add
-- them back AND keep 'test_foreign_kind' (the union rebuild).
-- Never run it on a real database.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_catalog.pg_constraint con
     where con.conrelid = 'public.email_reminder_log'::regclass and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M'
  loop
    execute format('alter table public.email_reminder_log drop constraint %I', c.conname);
  end loop;
  alter table public.email_reminder_log add constraint other_builder_kind_check
    check (kind in ('hearing_1d', 'poa_30d', 'poa_7d', 'library_7d', 'library_3d', 'test_foreign_kind'));
end $$;
