import assert from 'node:assert/strict';
import test from 'node:test';
import { matchCollectionTitles, type JudicialCollectionRow } from './collectionTitleHits.ts';

const SAMPLE_COLLECTIONS: JudicialCollectionRow[] = [
  {
    id: 'sjc-principles-decisions-1',
    title: 'مجموعة المبادئ والقرارات الصادرة من الهيئة القضائية العليا والهيئة الدائمة والعامة بمجلس القضاء الأعلى',
    court: 'مجلس القضاء الأعلى',
    year_hijri: 1438,
    part: 1,
    source_id: 'sjc',
    track: 'ordinary',
    description: 'المبادئ القضائية الصادرة من مجلس القضاء الأعلى من عام ١٣٩١هـ إلى ١٤٢٨هـ',
    ruling_count: 1320,
    free: true,
    progress: 100,
  },
  {
    id: 'bog-admin-1443',
    title: 'مجموعة المبادئ والأحكام الإدارية لعام ١٤٤٣هـ',
    court: 'ديوان المظالم',
    year_hijri: 1443,
    part: 2,
    source_id: 'admin-supreme',
    track: 'admin',
    description: 'أحكام المحكمة الإدارية العليا ومحاكم الاستئناف الإدارية',
    ruling_count: 240,
    free: false,
    progress: 100,
  },
  {
    id: 'supreme-rulings-decisions',
    title: 'مدونة قرارات ومبادئ المحكمة العليا',
    court: 'المحكمة العليا',
    year_hijri: 1445,
    part: null,
    source_id: 'supreme',
    track: 'ordinary',
    description: 'قرارات الهيئة العامة للمحكمة العليا',
    ruling_count: 95,
    free: true,
    progress: 100,
  },
];

test('searching «المبادئ والقرارات» finds judicial collections by exact phrase and clitic-folded words', () => {
  const hits = matchCollectionTitles(SAMPLE_COLLECTIONS, 'المبادئ والقرارات', { max: 5 });
  assert.deepEqual(
    hits.map((h) => h.id),
    ['sjc-principles-decisions-1', 'supreme-rulings-decisions'],
  );
  // Phrase match in title ranks ahead of inverted/clitic-only word match
  assert.equal(hits[0].id, 'sjc-principles-decisions-1');
});

test('bidirectional numerals: Arabic-Indic «١٤٤٣» matches Western year_hijri 1443 and vice versa', () => {
  const byIndic = matchCollectionTitles(SAMPLE_COLLECTIONS, 'الأحكام الإدارية 1443');
  assert.deepEqual(byIndic.map((h) => h.id), ['bog-admin-1443']);

  const byWestern = matchCollectionTitles(SAMPLE_COLLECTIONS, 'الاحكام الاداريه ١٤٤٣');
  assert.deepEqual(byWestern.map((h) => h.id), ['bog-admin-1443']);

  const descRange = matchCollectionTitles(SAMPLE_COLLECTIONS, '1391');
  assert.deepEqual(descRange.map((h) => h.id), ['sjc-principles-decisions-1']);
});

test('active track, source, year and court filters narrow collection title hits', () => {
  assert.deepEqual(
    matchCollectionTitles(SAMPLE_COLLECTIONS, 'المبادئ', { track: 'admin' }).map((h) => h.id),
    ['bog-admin-1443'],
  );
  assert.deepEqual(
    matchCollectionTitles(SAMPLE_COLLECTIONS, 'المبادئ', { source: 'supreme' }).map((h) => h.id),
    ['supreme-rulings-decisions'],
  );
  assert.deepEqual(
    matchCollectionTitles(SAMPLE_COLLECTIONS, 'المبادئ', { year: '١٤٤٣' }).map((h) => h.id),
    ['bog-admin-1443'],
  );
});
