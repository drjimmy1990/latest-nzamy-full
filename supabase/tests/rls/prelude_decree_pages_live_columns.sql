-- prelude_decree_pages_live_columns.sql — the two decree_pages columns production
-- has and no migration adds (20261018_02 adds them). Only for the negative
-- control of library_feqh_decree_text_lock.test.sql, which runs the chain
-- WITHOUT 20261018_02 and still needs the fixture rows to insert.
alter table library.decree_pages add column if not exists number_text text;
alter table library.decree_pages add column if not exists order_index integer;
