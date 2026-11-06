-- للقراءة فقط — لا يغيّر شيئاً. شغّله متى شئت، قبل النشر أو بعده.
--
-- S5-B13 (owner-free wave, 2026-11-03). Not a migration: one SELECT in a
-- read-only transaction that ends in a rollback. It lists every <summary> title
-- inside the laws' preambles, so the rule for the preamble's own toggles
-- (PREAMBLE_SUMMARY_RE, src/app/laws/[slug]/_details-block.ts) can grow from
-- real data, in a later task.
--
-- ما تُرسله بعد التشغيل: الصفوف التي عمود already_known فيها = f (false) فقط،
-- كما تظهر: summary و laws و example_slug. الصفوف t معروفة ولا حاجة لإرسالها.
--
-- طريقة التشغيل على الخادم (السطر كله، والنتيجة تظهر على الشاشة):
--   cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < SQL_batch_2026-11-03_owner_free/READ_ONLY_library_preamble_details_summaries.sql
-- SQL Editor shows only the last statement's result, which here is the rollback:
-- there, select the lines from `with s as` to the `order by` line and run those.
--
-- already_known uses the same pattern as PREAMBLE_SUMMARY_RE. It avoids `.*?`,
-- because PostgreSQL gives the whole expression the greediness of its first
-- quantifier.

begin transaction read only;

with s as (
  select l.slug,
         regexp_replace(btrim(m[1]), '\s+', ' ', 'g') as summary
    from library.laws l
   cross join lateral regexp_matches(coalesce(l.preamble, ''),
         '<summary[^>]*>((?:[^<]|<(?!/summary))*)</summary', 'gi') as m
)
select summary,
       count(distinct slug) as laws,
       min(slug)            as example_slug,
       coalesce(summary ~ '📝.*موجز|بطاقة\s+تعريف|البطاقة\s+التعريفية|➕', false) as already_known
  from s
 group by summary
 order by already_known, laws desc, summary;

rollback;
