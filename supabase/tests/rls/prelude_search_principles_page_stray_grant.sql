-- prelude_search_principles_page_stray_grant.sql — negative control (b) for
-- library_search_principles_page.test.sql: run it AFTER 20261017_20. It puts
-- back what the self-host's default privileges would give a new function
-- (EXECUTE to anon and authenticated). T2 must then FAIL.
grant execute on function library.search_principles_page(text, integer, integer, text, text, integer, text)
  to anon, authenticated;
