-- =============================================================================
-- Migration: 20261130_10_library_wide_text_columns.sql   (verify id: l10_caps)
-- =============================================================================
-- PURPOSE (owner's library-agent package of 19 Nov, «1,520 قيمة مقصوصة»;
--          gap report l10 item 1.6; batch l10, builder "caps")
--
--   The seeder cuts three fields to fit their columns, and his upload report
--   (seed-value-report.json) counted the cuts: articles.number_text > 50
--   ×1506, laws.official_source_url > 500 ×12, laws.issuing_instrument > 200
--   ×2. This file widens the two columns that are still varchar so the seeder
--   can raise its caps (scripts/seed-library.ts, LIBRARY_RAISED_CAPS in
--   src/lib/library/seedValues.ts: 1000 / 2000 / 2000):
--
--     library.articles.number_text      varchar(50)  → text  ONLY if still varchar
--         (20260824_articles_number_text_widen.sql did the same, but its header
--         says «NOT APPLIED YET» and nobody has confirmed it ran on the
--         self-hosted prod: both starting states are handled — already text
--         = nothing to do)
--     library.laws.issuing_instrument   varchar(200) → text  (20260626:81)
--     library.laws.official_source_url  already text (20260626:86) — untouched
--
--   varchar(n) → text is a catalog-only change in Postgres: no table rewrite,
--   no index rebuild, no data change. Column grants (20261004_01's column
--   lock on library.laws) and comments stay on the column.
--
--   VIEWS. Postgres refuses to change the type of a column a view reads, even
--   varchar → text. library.v_laws_enactment_status (20260911:89, live since
--   2026-09-21) selects laws.issuing_instrument. A plain view that reads one of
--   the two columns is therefore DROPPED AND RE-CREATED here, in the same
--   transaction, from its own live definition (pg_get_viewdef — never a copy
--   kept in this file), with its owner, options (security_invoker,
--   20260922_04), grants (20261004_01: service_role only), column grants and
--   comments exactly as they were; the file checks each of these after the
--   re-create and rolls everything back if one differs. Anything else that
--   depends on either column — a materialized view, a view other objects are
--   built on, a rule, a policy, a trigger, a generated column — STOPS the file
--   with its name, nothing changed (none exists in the migrations today).
--
--   library.library_column_widths() — NEW, read-only: every column of every
--   library table with its type and character limit. The owner loader
--   (scripts/seed-library-from-owner.mjs, preflightColumnWidths in
--   src/lib/library/ownerLoaderTables.ts) calls it before the first write and
--   stops when a column is narrower than the seeder's cap or than the longest
--   value in the rows. SECURITY INVOKER, search_path '', EXECUTE for
--   service_role only (revoked from PUBLIC / anon / authenticated).
--
--   No setting value changes here. No row is touched.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261130_10_library_wide_text_columns.sql
--   Expect: NOTICE  l10_caps verify: OK  and a row with `t`.
--   Also printed: one NOTICE per column («widened to text» or «already text»)
--   and one per view re-created (on prod today: v_laws_enactment_status).
--   `lock_timeout = 5s`: a long read on library.laws / library.articles stops
--   the file with "canceling statement due to lock timeout" (nothing changed —
--   re-run it) instead of freezing the library.
--
-- RUN ORDER: any time — before or after the deploy of the l10 code; re-runs are
--   no-ops (both columns already text, the function replaced as it is).
--   * Code first: the new owner loader stops in its preflight, before the
--     first write, with "library_column_widths(): … run 20261130_10" — no row
--     is written with a raised cap against a narrow column.
--   * SQL first with the old code: the old seeder still cuts at 50 / 500 /
--     200, which a text column accepts. Nothing changes on the site.
--   So: run this file, then load with the new rows.
--
-- ROLLBACK (only if no value longer than the old limit was loaded since —
-- check first: select count(*) from library.articles where length(number_text) > 50;
-- and the same for laws.issuing_instrument > 200; a longer value makes the
-- ALTER fail, which is the safe outcome):
--   begin;
--   drop function if exists library.library_column_widths();
--   -- v_laws_enactment_status reads issuing_instrument: drop / re-create it
--   -- around the ALTER as this file does, or the ALTER is refused.
--   alter table library.laws alter column issuing_instrument type varchar(200);
--   alter table library.articles alter column number_text type varchar(50);
--   commit;
--   notify pgrst, 'reload schema';
--   (then the l10 loader's preflight refuses a load: deploy the previous loader)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('library.laws') is null or to_regclass('library.articles') is null then
    raise exception '20261130_10: library.laws / library.articles missing — apply the library schema first';
  end if;
end $$;

-- 1. widen the columns that are still varchar; re-create the plain views that read them
do $$
declare
  targets constant text[] := array['library.articles.number_text', 'library.laws.issuing_instrument'];
  t        text;
  rel      regclass;
  col      text;
  typ      oid;
  typname  text;
  attno    smallint;
  todo_rel oid[] := '{}';
  todo_att smallint[] := '{}';
  todo_txt text[] := '{}';
  bad      text;
  v        record;
  e        record;
  views    jsonb := '[]'::jsonb;
  vj       jsonb;
  vname    text;
  vowner   name;
  vowner_oid oid;
  vopts    text[];
  vacl     aclitem[];
  vdef     text;
  i        int;
begin
  foreach t in array targets loop
    rel := pg_catalog.to_regclass(pg_catalog.split_part(t, '.', 1) || '.' || pg_catalog.split_part(t, '.', 2));
    col := pg_catalog.split_part(t, '.', 3);
    select a.atttypid, a.attnum, pg_catalog.format_type(a.atttypid, a.atttypmod)
      into typ, attno, typname
      from pg_catalog.pg_attribute a
     where a.attrelid = rel and a.attname = col and not a.attisdropped;
    if attno is null then
      raise exception '20261130_10: % missing — apply the library schema first', t;
    elsif typ = 'pg_catalog.text'::pg_catalog.regtype then
      raise notice '20261130_10: % is already text — nothing to do', t;
    elsif typ = 'pg_catalog.varchar'::pg_catalog.regtype then
      todo_rel := todo_rel || rel::oid;
      todo_att := todo_att || attno;
      todo_txt := todo_txt || (t || ' (' || typname || ')');
    else
      raise exception '20261130_10: % is %, neither varchar nor text — nothing changed; look at it by hand', t, typname;
    end if;
  end loop;

  if cardinality(todo_rel) = 0 then
    return;
  end if;

  -- 1a. dependents this file will not handle: stop with their names, nothing changed
  select pg_catalog.string_agg(distinct x.what, ', ') into bad
    from (
      -- a matview, or a view/rule on a relation that is not a plain view
      select c.oid::regclass::text || ' (' || case c.relkind when 'm' then 'materialized view' when 'v' then 'view' else 'rule on a relation of kind ' || c.relkind::text end || ')' as what
        from pg_catalog.pg_depend dep
        join pg_catalog.pg_rewrite r on r.oid = dep.objid
        join pg_catalog.pg_class c on c.oid = r.ev_class
       where dep.classid = 'pg_catalog.pg_rewrite'::regclass and dep.refclassid = 'pg_catalog.pg_class'::regclass
         and (dep.refobjid, dep.refobjsubid) in (select u.r, u.a from unnest(todo_rel, todo_att) as u(r, a))
         and (c.relkind <> 'v' or r.rulename <> '_RETURN')
      union all
      -- a policy or a trigger that names the column
      select case dep.classid
               when 'pg_catalog.pg_policy'::regclass then 'policy ' || (select p.polname from pg_catalog.pg_policy p where p.oid = dep.objid)
               else 'trigger ' || (select g.tgname from pg_catalog.pg_trigger g where g.oid = dep.objid)
             end || ' on ' || dep.refobjid::regclass::text
        from pg_catalog.pg_depend dep
       where dep.classid in ('pg_catalog.pg_policy'::regclass, 'pg_catalog.pg_trigger'::regclass)
         and dep.refclassid = 'pg_catalog.pg_class'::regclass
         and (dep.refobjid, dep.refobjsubid) in (select u.r, u.a from unnest(todo_rel, todo_att) as u(r, a))
      union all
      -- a generated column computed from it
      select 'generated column ' || dep.objid::regclass::text || '.' ||
             (select a.attname from pg_catalog.pg_attribute a where a.attrelid = dep.objid and a.attnum = dep.objsubid)
        from pg_catalog.pg_depend dep
       where dep.classid = 'pg_catalog.pg_class'::regclass and dep.refclassid = 'pg_catalog.pg_class'::regclass
         and dep.objid = dep.refobjid and dep.objsubid <> 0
         and (dep.refobjid, dep.refobjsubid) in (select u.r, u.a from unnest(todo_rel, todo_att) as u(r, a))
      union all
      -- a plain view that something else is built on (another view, a rule), or that has its own triggers / rules
      select c.oid::regclass::text || ' (a view other objects depend on: ' ||
             (select pg_catalog.string_agg(distinct r2.ev_class::regclass::text, ', ')
                from pg_catalog.pg_depend d2
                join pg_catalog.pg_rewrite r2 on r2.oid = d2.objid
               where d2.classid = 'pg_catalog.pg_rewrite'::regclass and d2.refobjid = c.oid and r2.ev_class <> c.oid) || ')'
        from pg_catalog.pg_depend dep
        join pg_catalog.pg_rewrite r on r.oid = dep.objid
        join pg_catalog.pg_class c on c.oid = r.ev_class
       where dep.classid = 'pg_catalog.pg_rewrite'::regclass and dep.refclassid = 'pg_catalog.pg_class'::regclass
         and (dep.refobjid, dep.refobjsubid) in (select u.r, u.a from unnest(todo_rel, todo_att) as u(r, a))
         and c.relkind = 'v'
         and (exists (select 1 from pg_catalog.pg_depend d2 join pg_catalog.pg_rewrite r2 on r2.oid = d2.objid
                       where d2.classid = 'pg_catalog.pg_rewrite'::regclass and d2.refobjid = c.oid and r2.ev_class <> c.oid)
              or exists (select 1 from pg_catalog.pg_rewrite r3 where r3.ev_class = c.oid and r3.rulename <> '_RETURN')
              or exists (select 1 from pg_catalog.pg_trigger g where g.tgrelid = c.oid))
    ) x;
  if bad is not null then
    raise exception '20261130_10: % depend(s) on % — nothing changed; drop / re-create it around this file',
      bad, pg_catalog.array_to_string(todo_txt, ', ');
  end if;

  -- 1b. the plain views to re-create: keep everything needed to rebuild them as they are
  for v in
    select distinct c.oid, n.nspname, c.relname, c.relowner, c.reloptions, c.relacl
      from pg_catalog.pg_depend dep
      join pg_catalog.pg_rewrite r on r.oid = dep.objid
      join pg_catalog.pg_class c on c.oid = r.ev_class
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where dep.classid = 'pg_catalog.pg_rewrite'::regclass and dep.refclassid = 'pg_catalog.pg_class'::regclass
       and (dep.refobjid, dep.refobjsubid) in (select u.r, u.a from unnest(todo_rel, todo_att) as u(r, a))
       and c.relkind = 'v'
  loop
    views := views || pg_catalog.jsonb_build_object(
      'name',    pg_catalog.quote_ident(v.nspname) || '.' || pg_catalog.quote_ident(v.relname),
      'owner',   pg_catalog.pg_get_userbyid(v.relowner),
      'opts',    pg_catalog.to_jsonb(v.reloptions),
      'acl',     pg_catalog.to_jsonb(v.relacl::text[]),
      'def',     pg_catalog.pg_get_viewdef(v.oid),
      'comment', pg_catalog.obj_description(v.oid, 'pg_class'),
      'cols',    coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                             'col', a.attname, 'comment', pg_catalog.col_description(v.oid, a.attnum), 'acl', pg_catalog.to_jsonb(a.attacl::text[])))
                             from pg_catalog.pg_attribute a
                            where a.attrelid = v.oid and a.attnum > 0 and not a.attisdropped
                              and (a.attacl is not null or pg_catalog.col_description(v.oid, a.attnum) is not null)), '[]'::jsonb));
  end loop;
  for vj in select * from pg_catalog.jsonb_array_elements(views) loop
    execute pg_catalog.format('drop view %s', vj->>'name');
  end loop;

  -- 1c. widen
  for i in 1 .. cardinality(todo_rel) loop
    execute pg_catalog.format('alter table %s alter column %I type text',
      todo_rel[i]::regclass, (select a.attname from pg_catalog.pg_attribute a where a.attrelid = todo_rel[i] and a.attnum = todo_att[i]));
    raise notice '20261130_10: % widened to text', todo_txt[i];
  end loop;

  -- 1d. re-create the views exactly as they were, then prove it
  for vj in select * from pg_catalog.jsonb_array_elements(views) loop
    vname := vj->>'name';
    vdef  := pg_catalog.rtrim(pg_catalog.btrim(vj->>'def'), ';');
    if vj->'opts' is not null and vj->'opts' <> 'null'::jsonb then
      select array_agg(x.val) into vopts from pg_catalog.jsonb_array_elements_text(vj->'opts') x(val);
      execute pg_catalog.format('create view %s with (%s) as %s', vname, pg_catalog.array_to_string(vopts, ', '), vdef);
    else
      vopts := null;
      execute pg_catalog.format('create view %s as %s', vname, vdef);
    end if;
    vowner := vj->>'owner';
    execute pg_catalog.format('alter view %s owner to %I', vname, vowner);
    select r.oid into vowner_oid from pg_catalog.pg_roles r where r.rolname = vowner;

    -- the new view got the schema's default privileges: clear them, then grant what it had
    for e in
      select distinct x.grantee
        from pg_catalog.pg_class c, pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
       where c.oid = vname::regclass and x.grantee <> c.relowner
    loop
      execute pg_catalog.format('revoke all on %s from %s', vname,
        case when e.grantee = 0 then 'public' else pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(e.grantee)) end);
    end loop;
    if vj->'acl' is not null and vj->'acl' <> 'null'::jsonb then
      select array_agg(x.val::aclitem) into vacl from pg_catalog.jsonb_array_elements_text(vj->'acl') x(val);
      for e in select * from pg_catalog.aclexplode(vacl) x where x.grantee <> vowner_oid loop
        execute pg_catalog.format('grant %s on %s to %s%s', e.privilege_type, vname,
          case when e.grantee = 0 then 'public' else pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(e.grantee)) end,
          case when e.is_grantable then ' with grant option' else '' end);
      end loop;
    else
      vacl := null;
    end if;
    -- column grants and comments
    for e in select * from pg_catalog.jsonb_array_elements(vj->'cols') c(j) loop
      if e.j->>'comment' is not null then
        execute pg_catalog.format('comment on column %s.%I is %L', vname, e.j->>'col', e.j->>'comment');
      end if;
      if e.j->'acl' is not null and e.j->'acl' <> 'null'::jsonb then
        declare ce record;
        begin
          for ce in select * from pg_catalog.aclexplode((select array_agg(x.val::aclitem) from pg_catalog.jsonb_array_elements_text(e.j->'acl') x(val))) loop
            execute pg_catalog.format('grant %s (%I) on %s to %s%s', ce.privilege_type, e.j->>'col', vname,
              case when ce.grantee = 0 then 'public' else pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(ce.grantee)) end,
              case when ce.is_grantable then ' with grant option' else '' end);
          end loop;
        end;
      end if;
    end loop;
    if vj->>'comment' is not null then
      execute pg_catalog.format('comment on view %s is %L', vname, vj->>'comment');
    end if;

    -- prove: owner, options, grants (grantee / privilege / grant option) and the definition
    if (select c.relowner from pg_catalog.pg_class c where c.oid = vname::regclass) <> vowner_oid then
      raise exception '20261130_10: % re-created with another owner — rolled back', vname;
    end if;
    if (select coalesce(c.reloptions, '{}') from pg_catalog.pg_class c where c.oid = vname::regclass)
       is distinct from coalesce(vopts, '{}') then
      raise exception '20261130_10: % re-created with other options — rolled back', vname;
    end if;
    if exists (
         (select x.grantee, x.privilege_type, x.is_grantable
            from pg_catalog.pg_class c, pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
           where c.oid = vname::regclass
          except
          select x.grantee, x.privilege_type, x.is_grantable
            from pg_catalog.aclexplode(coalesce(vacl, pg_catalog.acldefault('r', vowner_oid))) x)
         union all
         (select x.grantee, x.privilege_type, x.is_grantable
            from pg_catalog.aclexplode(coalesce(vacl, pg_catalog.acldefault('r', vowner_oid))) x
          except
          select x.grantee, x.privilege_type, x.is_grantable
            from pg_catalog.pg_class c, pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
           where c.oid = vname::regclass)) then
      raise exception '20261130_10: % re-created with other grants — rolled back', vname;
    end if;
    if pg_catalog.rtrim(pg_catalog.btrim(pg_catalog.pg_get_viewdef(vname::regclass)), ';') is distinct from vdef then
      raise exception '20261130_10: % re-created with another definition — rolled back', vname;
    end if;
    raise notice '20261130_10: view % re-created as it was (owner %, options %, grants kept)', vname, vowner, coalesce(pg_catalog.array_to_string(vopts, ','), 'none');
  end loop;
end $$;

comment on column library.articles.number_text is
  'The article''s written-out ordinal/title as it appears in the source (e.g. "الرابعة والأربعون" or an annex title). Not a key, not indexed. text since 20260824 / 20261130_10 (l10: the owner''s upload counted 1,506 cuts at varchar(50)); the seeder caps it at 1000 and reports every cut.';
comment on column library.laws.issuing_instrument is
  'The issuing instrument as the source writes it (frontmatter issuance_decree). text since 20261130_10 (was varchar(200); the owner''s upload counted 2 cuts); the seeder caps it at 2000 and reports every cut.';

-- 2. the loader's read-only width check
create or replace function library.library_column_widths()
returns table (table_name text, column_name text, data_type text, max_chars integer)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select c.relname::text,
         a.attname::text,
         pg_catalog.format_type(a.atttypid, a.atttypmod),
         case when a.atttypid in ('pg_catalog.varchar'::pg_catalog.regtype, 'pg_catalog.bpchar'::pg_catalog.regtype)
                   and a.atttypmod > 4
              then a.atttypmod - 4 end
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
   where n.nspname = 'library' and c.relkind in ('r', 'p')
     and a.attnum > 0 and not a.attisdropped
   order by 1, 2
$fn$;

comment on function library.library_column_widths() is
  'l10 (20261130_10): every library table column with its type and character limit (NULL = none). Read by the owner loader''s preflight before the first write (src/lib/library/ownerLoaderTables.ts). Service role only.';

revoke all on function library.library_column_widths() from public, anon, authenticated;
grant execute on function library.library_column_widths() to service_role;

-- 3. verify
do $verify$
declare
  r   text;
  typ text;
  c   text;
begin
  foreach c in array array['library.articles.number_text', 'library.laws.issuing_instrument', 'library.laws.official_source_url'] loop
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into typ
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.to_regclass(pg_catalog.split_part(c, '.', 1) || '.' || pg_catalog.split_part(c, '.', 2))
       and a.attname = pg_catalog.split_part(c, '.', 3) and not a.attisdropped;
    if typ is distinct from 'text' then
      raise exception 'l10_caps verify: % is % (want text)', c, coalesce(typ, 'missing');
    end if;
  end loop;
  if to_regprocedure('library.library_column_widths()') is null then
    raise exception 'l10_caps verify: library.library_column_widths() missing';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'library.library_column_widths()', 'EXECUTE') then
      raise exception 'l10_caps verify: % can EXECUTE library_column_widths()', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'library.library_column_widths()', 'EXECUTE') then
    raise exception 'l10_caps verify: service_role cannot run library_column_widths() — the loader preflight would refuse every load';
  end if;
  if (select pg_catalog.count(*) from library.library_column_widths() w
       where (w.table_name, w.column_name) in (('articles', 'number_text'), ('laws', 'issuing_instrument'), ('laws', 'official_source_url'))
         and w.max_chars is null and w.data_type = 'text') <> 3 then
    raise exception 'l10_caps verify: library_column_widths() does not report the three columns as text';
  end if;
  if not exists (select 1 from library.library_column_widths() w where w.table_name = 'laws' and w.column_name = 'slug' and w.max_chars is not null) then
    raise exception 'l10_caps verify: library_column_widths() reports no limit on laws.slug (varchar(200))';
  end if;
  raise notice 'l10_caps verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261130_10 wide library text columns (articles.number_text, laws.issuing_instrument → text) + library_column_widths() for the loader preflight' as migration,
       (select pg_catalog.count(*) from pg_catalog.pg_attribute a
         where not a.attisdropped and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
           and ((a.attrelid = 'library.articles'::regclass and a.attname = 'number_text')
             or (a.attrelid = 'library.laws'::regclass and a.attname = 'issuing_instrument'))) = 2
       and to_regprocedure('library.library_column_widths()') is not null
       as ok;
