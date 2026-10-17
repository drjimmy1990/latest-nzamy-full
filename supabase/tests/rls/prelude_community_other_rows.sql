-- prelude_community_other_rows.sql — two questions asked under «مدني» before
-- 20261018_03, stored as 'other' the way the API stored them, plus a labour
-- one. The author is any actor prelude_community_live_schema.sql created.
insert into public.community_posts (author_id, title, body, category)
  select p.id, v.title, 'نص', v.category
    from (select id from public.profiles order by id limit 1) p,
         (values ('سابق ١', 'other'), ('سابق ٢', 'other'), ('سابق عمالي', 'labor')) v(title, category);
