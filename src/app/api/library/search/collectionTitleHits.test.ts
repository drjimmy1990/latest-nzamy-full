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

// ── Hardening (review of the owner's fix, 2026-10-26) ───────────────────────
import { fetchCollectionTitleHits } from './collectionTitleHits.ts';

/** A supabase-js stand-in that records every builder call. */
function recordingClient(rows: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'order', 'limit', 'abortSignal', 'or', 'ilike', 'like', 'eq', 'textSearch', 'filter', 'match', 'in', 'not']) {
    builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  const client = { schema: (name: string) => { calls.push({ method: 'schema', args: [name] }); return builder; } };
  return { client: client as never, calls };
}

const INJECTION_QUERIES = [
  'المبادئ,id.eq.x',
  'المبادئ),or(id.eq.x',
  'title.ilike.*',
  'المبادئ %_\\ *.',
  'المبادئ*',
  'المبادئ% والقرارات_',
  'a.b.c المبادئ',
];

test('user text never reaches a PostgREST filter: one fixed select, matching happens in JS', async () => {
  for (const q of INJECTION_QUERIES) {
    const { client, calls } = recordingClient(SAMPLE_COLLECTIONS);
    await fetchCollectionTitleHits(client, q, { max: 5, track: 'ordinary', source: 'sjc', year: 1438, court: 'x' });
    const methods = calls.map((c) => c.method);
    assert.deepEqual(methods, ['schema', 'from', 'select', 'order', 'limit'], q);
    for (const c of calls) {
      for (const a of c.args) assert.ok(typeof a !== 'string' || !a.includes(q), `${q} leaked into ${c.method}`);
    }
  }
});

test('collection lookup reads only the public catalogue columns (never metadata or *)', async () => {
  const { client, calls } = recordingClient([]);
  await fetchCollectionTitleHits(client, 'المبادئ والقرارات');
  const select = calls.find((c) => c.method === 'select')?.args[0] as string;
  const cols = select.split(',').map((s) => s.trim());
  assert.deepEqual(cols, ['id', 'title', 'court', 'year_hijri', 'part', 'source_id', 'track', 'description', 'ruling_count', 'free', 'progress']);
  assert.ok(!cols.includes('metadata') && !cols.includes('*'));
  assert.deepEqual(calls.find((c) => c.method === 'from')?.args, ['judicial_collections']);
});

test('filter-syntax characters in the query are just text to the JS matcher', () => {
  assert.doesNotThrow(() => matchCollectionTitles(SAMPLE_COLLECTIONS, '(((( [[[ \\\\ .* %_ ,,', { max: 5 }));
  // Punctuation folds away; the Arabic words still match.
  assert.deepEqual(
    matchCollectionTitles(SAMPLE_COLLECTIONS, 'المبادئ,(والقرارات)*', { max: 5 }).map((h) => h.id),
    ['sjc-principles-decisions-1', 'supreme-rulings-decisions'],
  );
  // A query of only filter syntax matches nothing.
  assert.deepEqual(matchCollectionTitles(SAMPLE_COLLECTIONS, '%_*,.()\\', { max: 5 }), []);
});

test('a query with no word of 3+ letters makes no request at all', async () => {
  const { client, calls } = recordingClient(SAMPLE_COLLECTIONS);
  const r = await fetchCollectionTitleHits(client, '%_', { max: 5 });
  assert.deepEqual(r, { hits: [], error: null });
  assert.equal(calls.length, 0);
});
