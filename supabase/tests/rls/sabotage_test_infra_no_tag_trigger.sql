-- NEGATIVE CONTROL for test_infra.test.sql (NOT a migration): the tag trigger
-- still exists but no longer computes anything (it keeps what the client
-- sent) — the test must then FAIL at T32 ("a client-sent tag was kept on a
-- real row").
create or replace function public.test_tag_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end $$;
