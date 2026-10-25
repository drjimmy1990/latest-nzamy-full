import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arabicSpellingVariants,
  AUTOCOMPLETE_MAX_INPUT,
  AUTOCOMPLETE_MAX_TERMS,
  AUTOCOMPLETE_MIN_PREFIX,
  MAX_QUERY_SPELLING_VARIANTS,
  MAX_SPELLING_VARIANTS,
  parseAutocompleteQuery,
  parseSearchQuery,
  SearchQuerySyntaxError,
  toArabicIndicDigits,
  toWesternDigits,
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

test('parseSearchQuery does not split compact decree references or dates on slash and expands numerals both ways', () => {
  assert.deepEqual(parseSearchQuery('مرسوم م/١٤ ١٤٤٤/٠٢/٠٣'), {
    raw: 'مرسوم م/١٤ ١٤٤٤/٠٢/٠٣',
    tsquery: "(('مرسوم' & ('م/١٤' | 'م/14')) & ('١٤٤٤/٠٢/٠٣' | '1444/02/03'))",
    plainTerms: ['مرسوم', 'م/١٤', '١٤٤٤/٠٢/٠٣'],
  });
  assert.deepEqual(parseSearchQuery('مرسوم م/14 1444/02/03'), {
    raw: 'مرسوم م/14 1444/02/03',
    tsquery: "(('مرسوم' & ('م/14' | 'م/١٤')) & ('1444/02/03' | '١٤٤٤/٠٢/٠٣'))",
    plainTerms: ['مرسوم', 'م/14', '1444/02/03'],
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

test('parseSearchQuery keeps the word as typed first and expands Arabic-Indic ↔ Western digits', () => {
  // The simple FTS index stores source spellings: the typed word always stays
  // in its group, first; the other spellings (and alternate numeral script) are added, never substituted.
  assert.equal(
    parseSearchQuery('إجراءات اللائحة ١٤٤٤').tsquery,
    "((('إجراءات' | 'اجراءات' | 'أجراءات' | 'آجراءات') & ('اللائحة' | 'اللائحه' | 'أللائحة' | 'إللائحة' | 'آللائحة')) & ('١٤٤٤' | '1444'))",
  );
  assert.equal(parseSearchQuery('1445').tsquery, "('1445' | '١٤٤٥')");
  assert.equal(parseSearchQuery('١٤٤٥').tsquery, "('١٤٤٥' | '1445')");
  assert.equal(parseSearchQuery('۱۴۴۵').tsquery, "('۱۴۴۵' | '1445' | '١٤٤٥')");
  assert.equal(toWesternDigits('المادة ١٥ لعام ١٤٤٥'), 'المادة 15 لعام 1445');
  assert.equal(toArabicIndicDigits('المادة 15 لعام 1445'), 'المادة ١٥ لعام ١٤٤٥');
});

test('parseAutocompleteQuery expands Arabic spellings and digits without failing on partial operator syntax', () => {
  assert.equal(parseAutocompleteQuery('١٤٤٥').tsquery, "('١٤٤٥' | '1445')");
  assert.equal(
    parseAutocompleteQuery('"المبادئ والقرارات').tsquery,
    "(('المبادئ' | 'ألمبادئ' | 'إلمبادئ' | 'آلمبادئ') & 'والقرارات')",
  );
  assert.equal(parseAutocompleteQuery('نظام +').tsquery, "'نظام'");
  assert.equal(parseAutocompleteQuery('""').tsquery, '');
});

// Autocomplete reaches service-role queries with no statement_timeout: its
// tsquery holds positive words only, AND-ed, never a user's `!` / `|`, and no
// prefix on a stem under AUTOCOMPLETE_MIN_PREFIX letters (review of ecf0b357).
const BACKSLASH = String.fromCharCode(92);
function assertBoundedPositive(input: string) {
  const { tsquery, plainTerms } = parseAutocompleteQuery(input);
  // Outside the quoted lexemes only ( ) & | and :* may appear.
  const outside = tsquery.replace(/'(?:[^'\\]|\\.)*'/g, 'L');
  assert.match(outside, /^[L()&|:* ]*$/, `${JSON.stringify(input)} → ${tsquery}`);
  assert.ok(!outside.includes('!'), `no negation in ${tsquery}`);
  // Every | sits inside one word's spelling group: (L | L …) with no & inside.
  for (const group of outside.match(/\([^()]*\)/g) ?? []) {
    assert.ok(!(group.includes('|') && group.includes('&')), `mixed group ${group} in ${tsquery}`);
  }
  assert.ok(plainTerms.length <= AUTOCOMPLETE_MAX_TERMS);
  assert.ok(tsquery.length < 4000, `bounded: ${tsquery.length}`);
  return { tsquery, plainTerms };
}

test('parseAutocompleteQuery drops negated words and never flips them positive', () => {
  assert.deepEqual(parseAutocompleteQuery('a / -b'), { raw: 'a / -b', tsquery: "'a'", plainTerms: ['a'] });
  assert.deepEqual(parseAutocompleteQuery('-نظام'), { raw: '-نظام', tsquery: '', plainTerms: [] });
  assert.equal(parseAutocompleteQuery('نظام -العمل').tsquery, "'نظام'");
  assert.deepEqual(parseAutocompleteQuery('نظام -العمل').plainTerms, ['نظام']);
  assert.equal(parseAutocompleteQuery('--نظام عقد').tsquery, "'عقد'");
  assert.equal(parseAutocompleteQuery('-"نظام العمل" عقد').tsquery, "'عقد'");
  // An unclosed negated phrase drops every word after it.
  assert.equal(parseAutocompleteQuery('عقد -"نظام العمل').tsquery, "'عقد'");
  for (const input of ['-x', '-"x y"', '- x', '-x -y']) {
    const { tsquery, plainTerms } = assertBoundedPositive(input);
    if (input === '- x') {
      assert.equal(tsquery, "'x'"); // a lone «-» negates nothing
    } else {
      assert.equal(tsquery, '');
      assert.deepEqual(plainTerms, []);
    }
  }
});

test('parseAutocompleteQuery AND-s the words — `/` and `+` separate, never OR', () => {
  assert.equal(parseAutocompleteQuery('نظام/لائحة').tsquery, "('نظام' & ('لائحة' | 'لائحه'))");
  assert.equal(parseAutocompleteQuery('a + b').tsquery, "('a' & 'b')");
  assert.equal(parseAutocompleteQuery('"نظام العمل').tsquery, `('نظام' & ${AMAL})`);
  // a date and a royal-decree reference stay one word, with their digit forms
  assert.equal(parseAutocompleteQuery('1444/10/20').tsquery, "('1444/10/20' | '١٤٤٤/١٠/٢٠')");
  assert.equal(parseAutocompleteQuery('م/14').tsquery, "('م/14' | 'م/١٤')");
});

test('parseAutocompleteQuery keeps a prefix only on a stem of 3+ letters, «ال» not counted', () => {
  assert.equal(AUTOCOMPLETE_MIN_PREFIX, 3);
  assert.equal(parseAutocompleteQuery('ا*').tsquery, "'ا'");
  assert.equal(parseAutocompleteQuery('ال*').tsquery, "('ال' | 'أل' | 'إل' | 'آل')");
  assert.equal(parseAutocompleteQuery('الع*').tsquery, "('الع' | 'ألع' | 'إلع' | 'آلع')");
  assert.equal(parseAutocompleteQuery('ab*').tsquery, "'ab'");
  assert.equal(parseAutocompleteQuery('عقد*').tsquery, "'عقد':*");
  assert.equal(parseAutocompleteQuery('عقد**').tsquery, "'عقد':*");
  assert.equal(parseAutocompleteQuery('العمل*').tsquery, "('العمل':* | 'ألعمل':* | 'إلعمل':* | 'آلعمل':*)");
  assert.equal(parseAutocompleteQuery('a*b').tsquery, "'ab'");
  for (const input of ['ا*', 'ال*', 'الع*', 'x*', '12*', 'ab* cd*']) {
    assert.ok(!assertBoundedPositive(input).tsquery.includes(':*'), input);
  }
});

test('parseAutocompleteQuery turns tsquery syntax into separators and bounds the input', () => {
  for (const input of ["'", BACKSLASH, ':', '&|!', '()', '"', '""', '+', '/', '-', '*', '!', '<->', ':*', `${BACKSLASH}'`]) {
    assert.deepEqual(assertBoundedPositive(input), { tsquery: '', plainTerms: [] }, JSON.stringify(input));
  }
  assert.equal(parseAutocompleteQuery('a:b').tsquery, "('a' & 'b')");
  assert.equal(parseAutocompleteQuery("o'neil").tsquery, "('o' & 'neil')");
  assert.equal(parseAutocompleteQuery(`a${BACKSLASH}' | !b`).tsquery, "('a' & 'b')");
  assert.equal(parseAutocompleteQuery('(نظام) & (عقد)').tsquery, "('نظام' & 'عقد')");
  assert.equal(parseAutocompleteQuery('"نظام').tsquery, "'نظام'");
  assert.equal(parseAutocompleteQuery('نظام"عقد').tsquery, "('نظام' & 'عقد')");
  assert.equal(parseAutocompleteQuery('نظام\u0000عقد').tsquery, "('نظام' & 'عقد')");

  // 200 characters of one run: no word anyone types — nothing is sent.
  assert.equal(parseAutocompleteQuery('x'.repeat(200)).tsquery, '');
  // Many words: at most AUTOCOMPLETE_MAX_TERMS, from the first AUTOCOMPLETE_MAX_INPUT characters.
  const many = Array.from({ length: 60 }, (_, i) => `الإثبات${i}`).join(' ');
  const parsed = assertBoundedPositive(many);
  assert.equal(parsed.plainTerms.length, AUTOCOMPLETE_MAX_TERMS);
  assert.equal(parsed.tsquery.split(' & ').length, AUTOCOMPLETE_MAX_TERMS);
  assertBoundedPositive(`${'-'.repeat(100)}${'"'.repeat(100)}`);
  assertBoundedPositive(Array.from({ length: 200 }, (_, i) => `'&|!()":*${BACKSLASH}/-+`[i % 13]).join(''));
  assert.equal(AUTOCOMPLETE_MAX_INPUT, 200);
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
