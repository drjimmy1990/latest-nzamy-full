/**
 * globalSearchContent.test.ts — UAT-GHOST-001.
 *
 * The defect: the dashboard search rendered three invented rows (a case
 * «قضية الشركة المتحدة ضد محمد العمري», a lease contract, a consultation) under
 * the heading «من محتواك الشخصي», identically for every account, each linking
 * to a `/dashboard/client/.../1|2|3` fixture.
 *
 * What is pinned here is not the layout — it is the three substitutions that
 * would quietly put invented content back on that screen:
 *   • a row the account never named being given a name;
 *   • a row linked to a page that does not exist for this account;
 *   • a read that FAILED being reported as «لا توجد نتائج».
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveDocumentsHref,
  mapDocumentsToContent,
  mapServiceOrdersToContent,
  matchPersonalContent,
  summarisePersonalReads,
  PERSONAL_CONTENT_VISIBLE_LIMIT,
  type PersonalContentItem,
} from './globalSearchContent.ts';

const DOCS_HREF = '/dashboard/client/documents';

function item(label: string): PersonalContentItem {
  return { key: `doc:${label}`, type: 'doc', label, sub: 'مستند', href: DOCS_HREF };
}

// ── The documents destination ───────────────────────────────────────────────

test("the documents link is taken from the account's own sidebar", () => {
  const tools = [
    { href: '/dashboard/lawyer' },
    { href: '/dashboard/lawyer/documents' },
    { href: '/dashboard/lawyer/cases' },
  ];
  assert.equal(resolveDocumentsHref(tools), '/dashboard/lawyer/documents');
});

test('a sidebar with no documents page yields no link — not a guessed one', () => {
  // government / ngo / provider / admin have no documents route; inventing
  // "/dashboard/government/documents" would repeat the mock array's defect.
  const tools = [{ href: '/dashboard/government' }, { href: '/dashboard/government/cases' }];
  assert.equal(resolveDocumentsHref(tools), null);
  assert.equal(resolveDocumentsHref([]), null);
});

test('a route that merely contains "documents" is not the documents page', () => {
  assert.equal(resolveDocumentsHref([{ href: '/dashboard/business/documentsX' }]), null);
  assert.equal(resolveDocumentsHref([{ href: undefined }, { href: null }]), null);
});

// ── Documents → rows ────────────────────────────────────────────────────────

test("a document row carries the account's own file name and nothing else", () => {
  const items = mapDocumentsToContent([{ id: 'a1', file_name: 'عقد الإيجار.pdf' }], DOCS_HREF);
  assert.deepEqual(items, [
    { key: 'doc:a1', type: 'doc', label: 'عقد الإيجار.pdf', sub: 'مستند', href: DOCS_HREF },
  ]);
});

test('a nameless document is dropped, never given a name', () => {
  const items = mapDocumentsToContent(
    [
      { id: 'a1', file_name: '' },
      { id: 'a2', file_name: '   ' },
      { id: 'a3', file_name: null },
      { id: 'a4' },
      { id: '', file_name: 'بلا معرّف.pdf' },
      { id: 'a5', file_name: 'حقيقي.pdf' },
    ],
    DOCS_HREF,
  );
  assert.deepEqual(items.map((i) => i.label), ['حقيقي.pdf']);
});

test('the bin is not «محتواك»', () => {
  const items = mapDocumentsToContent(
    [
      { id: 'a1', file_name: 'محذوف.pdf', deleted_at: '2026-09-01T00:00:00Z' },
      { id: 'a2', file_name: 'قائم.pdf', deleted_at: null },
    ],
    DOCS_HREF,
  );
  assert.deepEqual(items.map((i) => i.label), ['قائم.pdf']);
});

test('no documents page ⇒ no document rows, so no dead links', () => {
  assert.deepEqual(mapDocumentsToContent([{ id: 'a1', file_name: 'x.pdf' }], null), []);
});

test('an absent or empty list produces nothing, not a placeholder row', () => {
  assert.deepEqual(mapDocumentsToContent([], DOCS_HREF), []);
  assert.deepEqual(mapDocumentsToContent(null, DOCS_HREF), []);
  assert.deepEqual(mapDocumentsToContent(undefined, DOCS_HREF), []);
  assert.deepEqual(mapServiceOrdersToContent([]), []);
  assert.deepEqual(mapServiceOrdersToContent(null), []);
});

// ── Service requests → rows ─────────────────────────────────────────────────

test('a request row links to its own real, auth-scoped page', () => {
  const items = mapServiceOrdersToContent([
    { id: '7f3c-42', title: 'مراجعة عقد توريد', status: 'assigned' },
  ]);
  assert.deepEqual(items, [
    {
      key: 'request:7f3c-42',
      type: 'request',
      label: 'مراجعة عقد توريد',
      sub: 'طلب • قيد التنفيذ',
      href: '/ai/orders/7f3c-42',
    },
  ]);
});

test('an id is encoded into the href, never interpolated raw', () => {
  const [row] = mapServiceOrdersToContent([{ id: 'a b/c?d', title: 'طلب' }]);
  assert.equal(row.href, '/ai/orders/a%20b%2Fc%3Fd');
});

test('an unknown status degrades to «طلب» — not printed raw, not invented', () => {
  const subs = mapServiceOrdersToContent([
    { id: '1', title: 'أ', status: 'archived_2027' },
    { id: '2', title: 'ب', status: null },
    { id: '3', title: 'ج' },
    { id: '4', title: 'د', status: 'completed' },
  ]).map((i) => i.sub);
  assert.deepEqual(subs, ['طلب', 'طلب', 'طلب', 'طلب • جاهز']);
});

test('a titleless request is dropped', () => {
  const items = mapServiceOrdersToContent([
    { id: '1', title: '' },
    { id: '2', title: '  ' },
    { id: '3', title: null },
    { id: '', title: 'بلا معرّف' },
  ]);
  assert.deepEqual(items, []);
});

test('a document and a request sharing a row id do not share a React key', () => {
  const docs = mapDocumentsToContent([{ id: '1', file_name: 'x.pdf' }], DOCS_HREF);
  const orders = mapServiceOrdersToContent([{ id: '1', title: 'طلب' }]);
  assert.notEqual(docs[0].key, orders[0].key);
});

// ── Query matching ──────────────────────────────────────────────────────────

test('an empty query is the recent list, not "no results"', () => {
  const items = [item('أ'), item('ب')];
  assert.deepEqual(matchPersonalContent(items, '').map((i) => i.label), ['أ', 'ب']);
  assert.deepEqual(matchPersonalContent(items, '   ').map((i) => i.label), ['أ', 'ب']);
});

test('matching is a case-insensitive substring of the label only', () => {
  const items = [item('Lease Agreement.pdf'), item('عقد إيجار')];
  assert.deepEqual(matchPersonalContent(items, 'LEASE').map((i) => i.label), ['Lease Agreement.pdf']);
  assert.deepEqual(matchPersonalContent(items, 'إيجار').map((i) => i.label), ['عقد إيجار']);
  // «مستند» is every document's `sub`; matching it would list everything with
  // nothing highlighted.
  assert.deepEqual(matchPersonalContent(items, 'مستند'), []);
});

test('the list is bounded so the tools section cannot be pushed off screen', () => {
  const many = Array.from({ length: 30 }, (_, i) => item(`ملف ${i}`));
  assert.equal(matchPersonalContent(many, '').length, PERSONAL_CONTENT_VISIBLE_LIMIT);
  assert.equal(matchPersonalContent(many, 'ملف').length, PERSONAL_CONTENT_VISIBLE_LIMIT);
  assert.equal(matchPersonalContent(many, '', 2).length, 2);
});

test('matching never invents a row', () => {
  assert.deepEqual(matchPersonalContent([], 'أي شيء'), []);
  assert.deepEqual(matchPersonalContent([item('أ')], 'ب'), []);
});

// ── Failure is not emptiness ────────────────────────────────────────────────

test('every source failing is «تعذّرت القراءة», never «لا توجد نتائج»', () => {
  const summary = summarisePersonalReads([
    { ok: false, items: [] },
    { ok: false, items: [] },
  ]);
  assert.equal(summary.unreadable, true);
  assert.equal(summary.partial, false);
  assert.deepEqual(summary.items, []);
});

test('one source failing still shows the other, and says so', () => {
  const summary = summarisePersonalReads([
    { ok: true, items: [item('قائم.pdf')] },
    { ok: false, items: [] },
  ]);
  assert.equal(summary.unreadable, false);
  assert.equal(summary.partial, true);
  assert.deepEqual(summary.items.map((i) => i.label), ['قائم.pdf']);
});

test('a genuinely empty account is empty, not unreadable', () => {
  const summary = summarisePersonalReads([
    { ok: true, items: [] },
    { ok: true, items: [] },
  ]);
  assert.equal(summary.unreadable, false);
  assert.equal(summary.partial, false);
  assert.deepEqual(summary.items, []);
});

test('items from a failed read are discarded, not merged', () => {
  // Defensive: a caller that hands back partial rows alongside ok:false must
  // not get them rendered as if the read had succeeded.
  const summary = summarisePersonalReads([
    { ok: false, items: [item('نصف مقروء')] },
    { ok: true, items: [item('مقروء')] },
  ]);
  assert.deepEqual(summary.items.map((i) => i.label), ['مقروء']);
});

test('no sources attempted is not a failure', () => {
  const summary = summarisePersonalReads([]);
  assert.equal(summary.unreadable, false);
  assert.equal(summary.partial, false);
});
