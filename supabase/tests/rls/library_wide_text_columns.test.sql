-- library_wide_text_columns.test.sql — proves 20261130_10 (batch l10 "caps",
-- gap 1.6) and its _verify block (verify:l10_caps).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain up to the column lock — it includes v_laws_enactment_status (20260911),
-- its security_invoker (20260922_04) and its service-role-only grant
-- (20261004_01), the view that reads laws.issuing_instrument on prod — then
-- the l10 _verify block BEFORE the file (must answer false, not fail),
-- 20261130_10 TWICE (the second run is a no-op), the block again, 20261004_01
-- AGAIN (its own sweep must still pass), then this file. Run it in BOTH
-- starting states of articles.number_text. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l10_caps_block.sql
--   sed -n '/^-- >>> verify:l10_caps/,/^-- <<< verify:l10_caps/p' $M/_verify.sql > "$B"
--   CHAIN="$M/20260626_legal_library_schema.sql $M/20260627_platform_settings.sql \
--     $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql"
--   (a) number_text still varchar(50) (20260824 widen never ran):
--   bash $R/run.sh $CHAIN "$B" $M/20261130_10_library_wide_text_columns.sql \
--     $M/20261130_10_library_wide_text_columns.sql "$B" $M/20261004_01_library_column_lock.sql \
--     $R/library_wide_text_columns.test.sql
--   (b) number_text already text (20260824 widen ran): the same with
--     $M/20260824_articles_number_text_widen.sql right after $CHAIN.
--
-- NEGATIVE CONTROL (must report the matview and change nothing):
--   W=$(mktemp -d)/neg.sql
--   { cat $R/library_wide_text_columns.negative_prelude.sql; cat $M/20261130_10_library_wide_text_columns.sql;
--     cat $R/library_wide_text_columns.negative_check.sql; } > "$W"
--   bash $R/run.sh $CHAIN "$W"
--   → prints «20261130_10: library.mv_l10_ctrl (materialized view) depend(s) on …
--     nothing changed» and then «NEG PASS»; it exits non-zero if anything changed.
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the three columns are text
do $$
declare c record; typ text;
begin
  for c in select * from (values
    ('library.articles', 'number_text'),
    ('library.laws', 'issuing_instrument'),
    ('library.laws', 'official_source_url')) as v(t, col)
  loop
    select format_type(a.atttypid, a.atttypmod) into typ
      from pg_attribute a where a.attrelid = c.t::regclass and a.attname = c.col and not a.attisdropped;
    if typ is distinct from 'text' then raise exception 'T1 FAIL: %.% is %', c.t, c.col, coalesce(typ, 'missing'); end if;
  end loop;
  raise notice 'T1 PASS: number_text, issuing_instrument, official_source_url are text';
end $$;

-- T2 the view that reads issuing_instrument was re-created as it was
do $$
declare opts text[]; typ text;
begin
  if to_regclass('library.v_laws_enactment_status') is null then
    raise exception 'T2 FAIL: library.v_laws_enactment_status is gone';
  end if;
  select c.reloptions into opts from pg_class c where c.oid = 'library.v_laws_enactment_status'::regclass;
  if not coalesce(opts @> array['security_invoker=true'], false) then
    raise exception 'T2 FAIL: the view lost security_invoker (%)', opts;
  end if;
  if has_table_privilege('anon', 'library.v_laws_enactment_status', 'SELECT')
     or has_table_privilege('authenticated', 'library.v_laws_enactment_status', 'SELECT')
     or has_any_column_privilege('anon', 'library.v_laws_enactment_status', 'SELECT') then
    raise exception 'T2 FAIL: anon / authenticated can read the re-created view';
  end if;
  if not has_table_privilege('service_role', 'library.v_laws_enactment_status', 'SELECT') then
    raise exception 'T2 FAIL: service_role lost SELECT on the view';
  end if;
  select format_type(a.atttypid, a.atttypmod) into typ
    from pg_attribute a where a.attrelid = 'library.v_laws_enactment_status'::regclass and a.attname = 'issuing_instrument';
  if typ is distinct from 'text' then raise exception 'T2 FAIL: the view''s issuing_instrument is %', typ; end if;
  if obj_description('library.v_laws_enactment_status'::regclass, 'pg_class') is null then
    raise exception 'T2 FAIL: the view lost its comment';
  end if;
  if (select count(*) from pg_class c where c.relname = 'v_laws_enactment_status') <> 1 then
    raise exception 'T2 FAIL: more than one view';
  end if;
  raise notice 'T2 PASS: v_laws_enactment_status re-created: security_invoker, service_role only, comment kept, issuing_instrument text';
end $$;

-- T3 the loader (service role) can write the long values the old caps cut
set role service_role;
insert into library.laws (slug, title, issuing_instrument, official_source_url)
values ('l10-caps-1', 'نظام تجريبي', repeat('م', 1500), 'https://example.org/' || repeat('a', 1900));
insert into library.articles (id, law_slug, number, number_text)
values ('l10-caps-1__art-1', 'l10-caps-1', '1', repeat('المادة الأولى بعد المائة ', 40));
do $$
begin
  if (select length(issuing_instrument) from library.laws where slug = 'l10-caps-1') <> 1500
     or (select length(number_text) from library.articles where id = 'l10-caps-1__art-1') <> length(repeat('المادة الأولى بعد المائة ', 40)) then
    raise exception 'T3 FAIL: a long value was not stored whole';
  end if;
  if (select v.issuing_instrument from library.v_laws_enactment_status v where v.slug = 'l10-caps-1') <> repeat('م', 1500) then
    raise exception 'T3 FAIL: the re-created view does not read the row';
  end if;
  raise notice 'T3 PASS: service_role stores a 1,500-char issuing_instrument and a %-char number_text; the view reads them',
    length(repeat('المادة الأولى بعد المائة ', 40));
end $$;

-- T4 the width RPC: the service role reads it, a narrow column shows its limit
do $$
declare n int; lim int;
begin
  select count(*) into n from library.library_column_widths() w
   where (w.table_name, w.column_name) in (('articles', 'number_text'), ('laws', 'issuing_instrument'), ('laws', 'official_source_url'))
     and w.data_type = 'text' and w.max_chars is null;
  if n <> 3 then raise exception 'T4 FAIL: % of the three wide columns reported as text', n; end if;
  select w.max_chars into lim from library.library_column_widths() w where w.table_name = 'articles' and w.column_name = 'id';
  if lim is distinct from 150 then raise exception 'T4 FAIL: articles.id reported with limit % (want 150)', lim; end if;
  raise notice 'T4 PASS: library_column_widths() as service_role — the three columns text, articles.id varchar(150)';
end $$;
reset role;

do $$
begin
  set local role anon;
  begin
    perform 1 from library.library_column_widths();
    raise exception 'T5 FAIL: anon ran library_column_widths()';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role authenticated;
  begin
    perform 1 from library.library_column_widths();
    raise exception 'T5 FAIL: authenticated ran library_column_widths()';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'T5 PASS: anon / authenticated cannot run library_column_widths()';
end $$;

-- T6 the column lock on library.laws is untouched by the ALTER (20261004_01)
do $$
begin
  if has_column_privilege('anon', 'library.laws', 'preamble', 'SELECT') then
    raise exception 'T6 FAIL: anon can read laws.preamble';
  end if;
  if not has_column_privilege('anon', 'library.laws', 'slug', 'SELECT') then
    raise exception 'T6 FAIL: anon lost its allow-listed laws.slug';
  end if;
  raise notice 'T6 PASS: the laws column lock still holds (slug readable, preamble not)';
end $$;

delete from library.laws where slug = 'l10-caps-1';
