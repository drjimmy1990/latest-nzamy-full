-- Negative control for 20261130_10 (see library_wide_text_columns.test.sql):
-- a materialized view on articles.number_text must stop the file with its
-- name, and nothing may change. psql continues past the error so the check
-- file can look at the result.
create materialized view library.mv_l10_ctrl as select id, number_text from library.articles with no data;
\set ON_ERROR_STOP off
