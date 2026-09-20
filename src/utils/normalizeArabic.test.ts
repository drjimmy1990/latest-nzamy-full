import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSearchQuery,
  SearchQuerySyntaxError,
} from './normalizeArabic.ts';

test('parseSearchQuery joins adjacent terms with implicit AND', () => {
  assert.deepEqual(parseSearchQuery('نظام العمل'), {
    raw: 'نظام العمل',
    tsquery: "('نظام' & 'العمل')",
    plainTerms: ['نظام', 'العمل'],
  });
});

test('parseSearchQuery accepts explicit AND with or without surrounding spaces', () => {
  assert.equal(parseSearchQuery('نظام + العمل').tsquery, "('نظام' & 'العمل')");
  assert.equal(parseSearchQuery('نظام+العمل').tsquery, "('نظام' & 'العمل')");
});

test('parseSearchQuery treats slash as OR and preserves AND precedence', () => {
  assert.equal(
    parseSearchQuery('نظام/لائحة تنفيذية').tsquery,
    "('نظام' | ('لائحة' & 'تنفيذية'))",
  );
});

test('parseSearchQuery does not split compact decree references or dates on slash', () => {
  assert.deepEqual(parseSearchQuery('مرسوم م/١٤ ١٤٤٤/٠٢/٠٣'), {
    raw: 'مرسوم م/١٤ ١٤٤٤/٠٢/٠٣',
    tsquery: "(('مرسوم' & 'م/١٤') & '١٤٤٤/٠٢/٠٣')",
    plainTerms: ['مرسوم', 'م/١٤', '١٤٤٤/٠٢/٠٣'],
  });
});

test('parseSearchQuery applies prefix negation to terms and quoted phrases', () => {
  assert.equal(
    parseSearchQuery('نظام -ملغى -"نفاذ مؤجل"').tsquery,
    "(('نظام' & !('ملغى')) & !('نفاذ' <-> 'مؤجل'))",
  );
});

test('parseSearchQuery decodes escaped quote and backslash inside an exact phrase', () => {
  const parsed = parseSearchQuery('"حق \\"خاص\\" \\\\ مقيد"');
  assert.equal(parsed.tsquery, "'حق' <-> '\"خاص\"' <-> '\\\\' <-> 'مقيد'");
  assert.deepEqual(parsed.plainTerms, ['حق "خاص" \\ مقيد']);
});

test('parseSearchQuery allows one terminal wildcard only', () => {
  assert.equal(parseSearchQuery('محكم*').tsquery, "'محكم':*");
  assert.deepEqual(parseSearchQuery('محكم*').plainTerms, ['محكم']);
});

test('parseSearchQuery quotes and escapes tsquery metacharacters inside a term', () => {
  assert.equal(parseSearchQuery("قرار'|!():*").tsquery, "'قرار\\'|!():':*");
});

test('parseSearchQuery preserves the source lexemes used by the simple FTS index', () => {
  assert.equal(
    parseSearchQuery('إجراءات اللائحة ١٤٤٤').tsquery,
    "(('إجراءات' & 'اللائحة') & '١٤٤٤')",
  );
});

test('parseSearchQuery rejects malformed syntax instead of dropping it', () => {
  const malformed = [
    '+نظام',
    'نظام+',
    'نظام//لائحة',
    'نظام + / لائحة',
    '"عبارة غير مغلقة',
    '""',
    '- نظام',
    '-',
    '*نظام',
    'نظ*ام',
    'نظام**',
    '"عبارة"*',
    '"هروب \\q"',
    '"عبارة"كلمة',
    '-ملغى',
    '-"نفاذ مؤجل"',
  ];

  for (const query of malformed) {
    assert.throws(
      () => parseSearchQuery(query),
      (error: unknown) => error instanceof SearchQuerySyntaxError
        && error.code === 'invalid_search_syntax'
        && Number.isInteger(error.index),
      query,
    );
  }
});
