import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arabicSpellingVariants,
  MAX_QUERY_SPELLING_VARIANTS,
  MAX_SPELLING_VARIANTS,
  parseSearchQuery,
  SearchQuerySyntaxError,
} from './normalizeArabic.ts';

// «العمل» is an ال-word: its opening alef may be a hamza («إلغاء» typed
// «الغاء»), so it gains one-letter spellings that simply match nothing when
// the ال is the article.
const AMAL = "('العمل' | 'ألعمل' | 'إلعمل' | 'آلعمل')";

test('parseSearchQuery joins adjacent terms with implicit AND', () => {
  assert.deepEqual(parseSearchQuery('نظام العمل'), {
    raw: 'نظام العمل',
    tsquery: `('نظام' & ${AMAL})`,
    plainTerms: ['نظام', 'العمل'],
  });
});

test('parseSearchQuery accepts explicit AND with or without surrounding spaces', () => {
  assert.equal(parseSearchQuery('نظام + العمل').tsquery, `('نظام' & ${AMAL})`);
  assert.equal(parseSearchQuery('نظام+العمل').tsquery, `('نظام' & ${AMAL})`);
});

test('parseSearchQuery treats slash as OR and preserves AND precedence', () => {
  assert.equal(
    parseSearchQuery('نظام/لائحة تنفيذية').tsquery,
    "('نظام' | (('لائحة' | 'لائحه') & ('تنفيذية' | 'تنفيذيه')))",
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
  // The negation covers the whole spelling group: neither «ملغى» nor «ملغي».
  assert.equal(
    parseSearchQuery('نظام -ملغى -"نفاذ مؤجل"').tsquery,
    "(('نظام' & !(('ملغى' | 'ملغي'))) & !('نفاذ' <-> 'مؤجل'))",
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

test('parseSearchQuery keeps the word as typed first and never folds it away (digits untouched)', () => {
  // The simple FTS index stores source spellings: the typed word always stays
  // in its group, first; the other spellings are added, never substituted.
  assert.equal(
    parseSearchQuery('إجراءات اللائحة ١٤٤٤').tsquery,
    "((('إجراءات' | 'اجراءات' | 'أجراءات' | 'آجراءات') & ('اللائحة' | 'اللائحه' | 'أللائحة' | 'إللائحة' | 'آللائحة')) & '١٤٤٤')",
  );
});

test('T28-11: «نظام الاثبات» finds the stored «الإثبات» (alef after ال)', () => {
  assert.equal(
    parseSearchQuery('نظام الاثبات').tsquery,
    "('نظام' & ('الاثبات' | 'الأثبات' | 'الإثبات' | 'الآثبات'))",
  );
  assert.match(parseSearchQuery('نظام الاثبات').tsquery, /'الإثبات'/);
  // plainTerms stay as typed: snippet highlighting and title scoring fold on their own.
  assert.deepEqual(parseSearchQuery('نظام الاثبات').plainTerms, ['نظام', 'الاثبات']);
});

test('spelling variants: opening alef, final ة/ه and ى/ي, both at once', () => {
  // Two slots (alef after ال × final letter) → the full product, canonical included.
  const ijaza = arabicSpellingVariants('الاجازه');
  assert.equal(ijaza.length, 8);
  assert.equal(ijaza[0], 'الاجازه');
  assert.ok(ijaza.includes('الإجازة'));
  assert.equal(new Set(ijaza).size, ijaza.length);
  // Hamza on the opening alef of an ال-initial word (إلغاء, إلزام, إلكتروني, إلا).
  assert.ok(arabicSpellingVariants('الغاء').includes('إلغاء'));
  assert.ok(arabicSpellingVariants('الكتروني').includes('إلكتروني'));
  assert.ok(arabicSpellingVariants('الا').includes('إلا'));
  assert.ok(arabicSpellingVariants('الآن').includes('الان'));
  assert.ok(arabicSpellingVariants('اثبات').includes('إثبات'));
  assert.ok(arabicSpellingVariants('ملغي').includes('ملغى'));
  // ...but such a word changes one letter at most (no «آللائحه»).
  assert.deepEqual(arabicSpellingVariants('اللائحة'), ['اللائحة', 'اللائحه', 'أللائحة', 'إللائحة', 'آللائحة']);
  // No variant letters → the word alone, and the old output is unchanged.
  assert.deepEqual(arabicSpellingVariants('نظام'), ['نظام']);
  assert.equal(parseSearchQuery('نظام').tsquery, "'نظام'");
  // Short words: no final swap under three letters.
  assert.deepEqual(arabicSpellingVariants('له'), ['له']);
  for (const w of ['الاجازه', 'الغاء', 'مسؤولية', 'اثبات', 'الآن', 'اللائحة']) {
    assert.ok(arabicSpellingVariants(w).length <= MAX_SPELLING_VARIANTS, w);
  }
});

test('«مسؤولية»: hamza on waw is never changed — only the final ة/ه pair is added', () => {
  assert.deepEqual(arabicSpellingVariants('مسؤولية'), ['مسؤولية', 'مسؤوليه']);
  assert.doesNotMatch(parseSearchQuery('مسؤولية').tsquery, /مسئول|مسوول/);
});

test('prefix search keeps :* on every spelling; phrases expand word by word', () => {
  assert.equal(parseSearchQuery('اثبات*').tsquery, "('اثبات':* | 'أثبات':* | 'إثبات':* | 'آثبات':*)");
  assert.deepEqual(parseSearchQuery('اثبات*').plainTerms, ['اثبات']);
  assert.equal(
    parseSearchQuery('"نظام الاثبات"').tsquery,
    "'نظام' <-> ('الاثبات' | 'الأثبات' | 'الإثبات' | 'الآثبات')",
  );
});

test('a long query stops expanding once the variant budget is spent (bounded URL)', () => {
  const words = Array.from({ length: 20 }, () => 'الاجازه');
  const tsquery = parseSearchQuery(words.join(' ')).tsquery;
  const lexemes = tsquery.match(/'[^']*'/g) ?? [];
  assert.ok(lexemes.length - words.length <= MAX_QUERY_SPELLING_VARIANTS, String(lexemes.length));
  // The first words are fully expanded; the rest stay as typed.
  assert.ok(tsquery.startsWith("((((((((((((((((((("));
  assert.match(tsquery, /'الإجازة'/);
  assert.match(tsquery, / & 'الاجازه'\)$/);
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
