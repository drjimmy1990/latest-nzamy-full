-- prelude_law_sort_key_fixture.sql — law dates shaped like the owner corpus
-- (last_owner «أنظمة ولوائح», 2026-10-25: every distinct shape of
-- latest_update.date_hijri and issue_date_hijri found in the 1,727 law files),
-- listed BEFORE 20261025_40_law_sort_key.sql in the chain of
-- law_sort_key.test.sql, so the migration fills existing rows.
--
-- public._sk_fixture holds each row's dates, its merged flag, the key it must
-- get — the LATER of the amendment and the issue date — and its expected
-- place in the catalogue order (pos), worked out by hand from the rule:
-- merged first, then the key newest first (NULL last), then title, slug.
-- issue_date_hijri is varchar(20): the long «… الموافق …» shapes are stored as
-- the seeder cuts them (first 20 characters).

create table public._sk_fixture (
  slug text primary key,
  merged boolean not null,
  issue text,
  amend text,
  want_key integer,
  pos integer not null
);

insert into public._sk_fixture (slug, merged, issue, amend, want_key, pos) values
-- merged laws first, newest date (amendment or issue) first
('sk-m-amend-1447',       true,  '1430/01/01',     '1447/02/18',  14470218, 1),
('sk-m-amend-1446-11-18', true,  '1428/02/20هـ',   '1446/11/18',  14461118, 2),
('sk-m-amend-1446-11-7',  true,  '1440/09/21',     '1446/11/7',   14461107, 3),
-- the issue day (1446/02/01) is later than the month-only amendment (1446/02)
('sk-m-amend-1446-02',    true,  '1446/02/01',     '1446/02',     14460201, 4),
('sk-m-no-amend-1445',    true,  '1445-01-14',     null,          14450114, 5),
('sk-m-nothing',          true,  null,             null,          null,     6),
-- then the rest, same rule
('sk-amend-1447-07-30',   false, '1424/3/11هـ',    '1447/07/30هـ', 14470730, 7),
-- never amended, issued 1447: above every law whose newest date is older
('sk-issue-1447-04-16',   false, '1447-04-16',     '',            14470416, 8),
-- amended 1441, but issued (day first) 17/3/1447: the issue date counts
('sk-amend-1441-3-1',     false, '17/3/1447هـ',    '1441/3/1',    14470317, 9),
('sk-issue-1446',         false, '1446 ه',         null,          14460000, 10),
('sk-amend-1444-06-25',   false, '1443/10/16 ه  الموا', '1444/06/25ه', 14440625, 11),
('sk-issue-1444',         false, '1444',           null,          14440000, 12),
('sk-issue-1443-04',      false, '1443/04',        null,          14430400, 13),
('sk-issue-1437-colon',   false, '1437/07/04:11/04/20', null,     14370704, 14),
-- never amended, issued 1436: still above a law last amended in 1426 / 1420
('sk-issue-arabic-digits', false, '١٤٣٦/٠٧/٠٨',   null,          14360708, 15),
('sk-amend-1426-08-02',   false, '1416-07-21',     '1426-08-02',  14260802, 16),
('sk-amend-1420',         false, '1390/01/01',     '1420/05/05',  14200505, 17),
('sk-issue-bad-month',    false, '1473-13-36',     '2016-04-11',  null,     18),
('sk-issue-text',         false, 'غير محدد',       null,          null,     19);

-- Titles follow pos, so the rows with no key at all (6, 18, 19) keep their
-- place through the title tiebreak.
insert into library.laws (slug, title, type, section_code, has_merged_regulation, issue_date_hijri, latest_update)
  select slug, 'نظام ' || lpad(pos::text, 3, '0'), 'نظام', '00', merged, issue,
         case when amend is null then null else jsonb_build_object('date_hijri', amend, 'type', 'تعديل') end
    from public._sk_fixture;
