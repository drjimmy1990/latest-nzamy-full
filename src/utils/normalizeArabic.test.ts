import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arabicSpellingVariants,
  AUTOCOMPLETE_MAX_INPUT,
  AUTOCOMPLETE_MAX_TERMS,
  AUTOCOMPLETE_MIN_PREFIX,
  MAX_QUERY_SPELLING_VARIANTS,
  MAX_SPELLING_VARIANTS,
  MAX_WORD_LEXEMES,
  NEGATION_PARTICLES,
  parseAutocompleteQuery,
  parseSearchQuery,
  prefixForms,
  SearchQuerySyntaxError,
  splitFusedParticle,
  stripTashkeel,
  toArabicIndicDigits,
  toWesternDigits,
} from './normalizeArabic.ts';

// «العمل» is an ال-word: its opening alef may be a hamza («إلغاء» typed
// «الغاء»), so it gains one-letter spellings that simply match nothing when
// the ال is the article.
const AMAL = "('العمل' | 'ألعمل' | 'إلعمل' | 'آلعمل')";
// The full search also sends its article forms (BUG-LIB-03, S1 Task 9): an
// «ال» word never gains its bare base, a bare word gains all four forms.
const AMAL_SEARCH = "('العمل' | 'والعمل' | 'بالعمل' | 'للعمل' | 'ألعمل' | 'إلعمل' | 'آلعمل')";
const NIZAM = "('نظام' | 'النظام' | 'والنظام' | 'بالنظام' | 'للنظام')";

test('parseSearchQuery joins adjacent terms with implicit AND', () => {
  assert.deepEqual(parseSearchQuery('نظام العمل'), {
    raw: 'نظام العمل',
    tsquery: `(${NIZAM} & ${AMAL_SEARCH})`,
    plainTerms: ['نظام', 'العمل'],
  });
});

test('parseSearchQuery accepts explicit AND with or without surrounding spaces', () => {
  assert.equal(parseSearchQuery('نظام + العمل').tsquery, `(${NIZAM} & ${AMAL_SEARCH})`);
  assert.equal(parseSearchQuery('نظام+العمل').tsquery, `(${NIZAM} & ${AMAL_SEARCH})`);
});

test('parseSearchQuery treats slash as OR and preserves AND precedence', () => {
  assert.equal(
    parseSearchQuery('نظام/لائحة تنفيذية').tsquery,
    // «لائحة» opens like «لا» + 3 letters: the false split is one more OR
    // alternative (cut first), never a lost hit.
    `(${NIZAM} | (('لائحة' | 'اللائحة' | 'واللائحة' | 'باللائحة' | 'للائحة' | 'لائحه' | ('لا' <-> 'ئحة'))`
      + " & ('تنفيذية' | 'التنفيذية' | 'والتنفيذية' | 'بالتنفيذية' | 'للتنفيذية' | 'تنفيذيه')))",
  );
});

const MARSOOM = "('مرسوم' | 'المرسوم' | 'والمرسوم' | 'بالمرسوم' | 'للمرسوم')";

test('parseSearchQuery does not split compact decree references or dates on slash and expands numerals both ways', () => {
  assert.deepEqual(parseSearchQuery('مرسوم م/١٤ ١٤٤٤/٠٢/٠٣'), {
    raw: 'مرسوم م/١٤ ١٤٤٤/٠٢/٠٣',
    tsquery: `((${MARSOOM} & ('م/١٤' | 'م/14')) & ('١٤٤٤/٠٢/٠٣' | '1444/02/03'))`,
    plainTerms: ['مرسوم', 'م/١٤', '١٤٤٤/٠٢/٠٣'],
  });
  assert.deepEqual(parseSearchQuery('مرسوم م/14 1444/02/03'), {
    raw: 'مرسوم م/14 1444/02/03',
    tsquery: `((${MARSOOM} & ('م/14' | 'م/١٤')) & ('1444/02/03' | '١٤٤٤/٠٢/٠٣'))`,
    plainTerms: ['مرسوم', 'م/14', '1444/02/03'],
  });
});

test('parseSearchQuery applies prefix negation to terms and quoted phrases', () => {
  // The negation covers the whole spelling group: neither «ملغى» nor «ملغي».
  assert.equal(
    parseSearchQuery('نظام -ملغى -"نفاذ مؤجل"').tsquery,
    `((${NIZAM} & !(('ملغى' | 'الملغى' | 'والملغى' | 'بالملغى' | 'للملغى' | 'ملغي')))`
      + " & !(('نفاذ' | 'النفاذ' | 'والنفاذ' | 'بالنفاذ' | 'للنفاذ') <-> ('مؤجل' | 'المؤجل' | 'والمؤجل' | 'بالمؤجل' | 'للمؤجل')))",
  );
});

test('parseSearchQuery decodes escaped quote and backslash inside an exact phrase', () => {
  const parsed = parseSearchQuery('"حق \\"خاص\\" \\\\ مقيد"');
  // «"خاص"» and «\» are not Arabic words: they get no article forms.
  assert.equal(parsed.tsquery, "'حق' <-> '\"خاص\"' <-> '\\\\' <-> ('مقيد' | 'المقيد' | 'والمقيد' | 'بالمقيد' | 'للمقيد')");
  assert.deepEqual(parsed.plainTerms, ['حق "خاص" \\ مقيد']);
});

test('parseSearchQuery allows one terminal wildcard only', () => {
  assert.equal(parseSearchQuery('محكم*').tsquery, "('محكم':* | 'المحكم':* | 'والمحكم':* | 'بالمحكم':* | 'للمحكم':*)");
  assert.deepEqual(parseSearchQuery('محكم*').plainTerms, ['محكم']);
});

test('parseSearchQuery quotes and escapes tsquery metacharacters inside a term', () => {
  // Parentheses are grouping marks now (read as spaces, S1 Task 9), so the
  // metacharacter probe carries the others: ' | ! : stay inside one lexeme.
  assert.equal(parseSearchQuery("قرار'|!:*").tsquery, "'قرار\\'|!:':*");
  assert.equal(parseSearchQuery("قرار'|!():*").tsquery, "('قرار\\'|!' & ':':*)");
  // Inside quotes they are literal and stay inside the lexeme.
  assert.equal(parseSearchQuery('"قرار()"').tsquery, "'قرار()'");
});

test('parseSearchQuery keeps the word as typed first and expands Arabic-Indic ↔ Western digits', () => {
  // The simple FTS index stores source spellings: the typed word always stays
  // in its group, first; the other spellings (and alternate numeral script) are added, never substituted.
  assert.equal(
    parseSearchQuery('إجراءات اللائحة ١٤٤٤').tsquery,
    "((('إجراءات' | 'الإجراءات' | 'والإجراءات' | 'بالإجراءات' | 'للإجراءات' | 'اجراءات' | 'أجراءات' | 'آجراءات')"
      + " & ('اللائحة' | 'واللائحة' | 'باللائحة' | 'للائحة' | 'اللائحه' | 'أللائحة' | 'إللائحة' | 'آللائحة')) & ('١٤٤٤' | '1444'))",
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
    `(${NIZAM} & ('الاثبات' | 'والاثبات' | 'بالاثبات' | 'للاثبات' | 'الأثبات' | 'الإثبات' | 'الآثبات'))`,
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
  assert.equal(parseSearchQuery('نظام').tsquery, NIZAM);
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
  assert.equal(
    parseSearchQuery('اثبات*').tsquery,
    "('اثبات':* | 'الاثبات':* | 'والاثبات':* | 'بالاثبات':* | 'للاثبات':* | 'أثبات':* | 'إثبات':* | 'آثبات':*)",
  );
  assert.deepEqual(parseSearchQuery('اثبات*').plainTerms, ['اثبات']);
  assert.equal(
    parseSearchQuery('"نظام الاثبات"').tsquery,
    `${NIZAM} <-> ('الاثبات' | 'والاثبات' | 'بالاثبات' | 'للاثبات' | 'الأثبات' | 'الإثبات' | 'الآثبات')`,
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

// ── S1 Task 9 (BUG-LIB-02/03): particles, article prefixes, parentheses, tashkeel ──
const LEXEME = /'(?:[^'\\]|\\.)*'/g;

test('a fused particle «لايكون» also searches «لا» <-> «يكون»', () => {
  const { tsquery } = parseSearchQuery('لايكون');
  assert.ok(tsquery.includes("'لايكون'"), tsquery);
  assert.ok(tsquery.includes("'لا' <-> 'يكون'"), tsquery);
});

test('«لا يكون» typed apart is one operand that also matches «لايكون», never لا & يكون', () => {
  const parsed = parseSearchQuery('لا يكون');
  assert.ok(parsed.tsquery.includes("'لايكون'"), parsed.tsquery);
  assert.ok(parsed.tsquery.includes("'لا' <-> 'يكون'"), parsed.tsquery);
  assert.doesNotMatch(parsed.tsquery, /& 'لا'\)/);
  assert.equal(parsed.tsquery, "(('لا' <-> 'يكون') | 'لايكون')");
  assert.deepEqual(parsed.plainTerms, ['لا يكون']);
  const fima = parseSearchQuery('فيما يخص').tsquery;
  assert.ok(fima.includes("'فيما' <-> 'يخص'"), fima);
  assert.ok(fima.includes("'فيمايخص'"), fima);
  // A quoted phrase gains the fused form too.
  assert.ok(parseSearchQuery('"لا يكون"').tsquery.includes("| 'لايكون'"));
  // An operator, a negation or a wildcard between them keeps today's meaning.
  assert.doesNotMatch(parseSearchQuery('لا + يكون').tsquery, /<->/);
  assert.doesNotMatch(parseSearchQuery('-لا يكون').tsquery, /<->/);
  assert.doesNotMatch(parseSearchQuery('لا* يكون').tsquery, /<->/);
  // A wildcard on the word after it reaches both forms.
  assert.equal(parseSearchQuery('لا يكون*').tsquery, "(('لا' <-> 'يكون':*) | 'لايكون':*)");
  // Tashkeel on a particle does not hide it.
  const voweled = parseSearchQuery('لَا يَكون').tsquery;
  assert.ok(voweled.includes("'لايكون'") && voweled.includes("'لا'") && voweled.includes("'يكون'"), voweled);
});

test('a bare word searches its article forms; an «ال» word never its bare base', () => {
  const bare = parseSearchQuery('قرار').tsquery;
  for (const form of ["'قرار'", "'القرار'", "'والقرار'", "'بالقرار'", "'للقرار'"]) {
    assert.ok(bare.includes(form), `${form} in ${bare}`);
  }
  const withArticle = parseSearchQuery('القرار').tsquery;
  for (const form of ["'القرار'", "'بالقرار'", "'للقرار'"]) {
    assert.ok(withArticle.includes(form), `${form} in ${withArticle}`);
  }
  assert.ok(!withArticle.includes("'قرار'"), withArticle);
  assert.deepEqual(prefixForms('اللائحة'), ['اللائحة', 'واللائحة', 'باللائحة', 'للائحة']);
  assert.deepEqual(prefixForms('والقرار'), ['والقرار', 'القرار', 'بالقرار', 'للقرار']);
  // No forms for short words, digits, particles, non-Arabic text, or a base under 2 letters.
  for (const word of ['له', 'م/14', '12', 'لا', 'ما', 'abc', 'الا', 'والي', 'بالغ']) {
    assert.deepEqual(prefixForms(word), [word], word);
  }
});

test('parentheses outside quotes read as spaces; inside quotes they stay', () => {
  for (const query of ['عدم نفاذ (+) قرار', '(عدم نفاذ) + قرار']) {
    const { tsquery } = parseSearchQuery(query);
    assert.ok(tsquery.includes("'القرار'"), tsquery);
    assert.ok(tsquery.includes(' & '), tsquery);
  }
  assert.equal(parseSearchQuery('"(تحكيم)"').plainTerms[0], '(تحكيم)');
  assert.equal(parseSearchQuery('("عزل الوكيل")').plainTerms[0], 'عزل الوكيل');
  // The returned raw is the query as typed.
  assert.equal(parseSearchQuery(' (عدم) ').raw, '(عدم)');
});

test('tashkeel: the stripped form is sent with the typed one (the index may hold either)', () => {
  assert.equal(stripTashkeel('القَرَارُ ـ'), 'القرار ');
  assert.equal(stripTashkeel('الرَّحْمٰن'), 'الرحمن');
  const { tsquery } = parseSearchQuery('القَرَار');
  assert.ok(tsquery.includes("'القرار'"), tsquery);
  assert.ok(tsquery.startsWith("('القَرَار' | 'القرار'"), tsquery);
  // Pinned: supabase/tests/rls/library_fts_tashkeel_fold.test.sql sends this
  // exact string against the index both before and after 20261103_14.
  assert.equal(
    tsquery,
    "('القَرَار' | 'القرار' | 'والقرار' | 'بالقرار' | 'للقرار' | 'ألقرار' | 'إلقرار' | 'آلقرار')",
  );
});

test('the variant budget: at most 48 extras per query, 12 lexemes per word, fused splits cut first', () => {
  const words = 'الاثبات الالكتروني القرار الاداري النظام العقوبة';
  const { tsquery } = parseSearchQuery(words);
  const lexemes = tsquery.match(LEXEME) ?? [];
  assert.ok(lexemes.length <= 6 + MAX_QUERY_SPELLING_VARIANTS, String(lexemes.length));
  assert.ok(tsquery.length <= 4000, String(tsquery.length));
  assert.ok(tsquery.includes("'بالاثبات'"), tsquery);
  assert.ok(tsquery.includes("'للاداري'"), tsquery);
  // A word's own cap.
  assert.equal(MAX_WORD_LEXEMES, 12);
  const voweled = parseSearchQuery('الإِلْكْتْرُونِيّة').tsquery;
  assert.ok((voweled.match(LEXEME) ?? []).length <= MAX_WORD_LEXEMES, voweled);
  // Once the budget is spent, the fused split (last in a word's order) is the
  // first form dropped, never the typed word: 7 full words, then «لائحة».
  const spent = parseSearchQuery(`${words} الالتزام لائحة`).tsquery;
  assert.ok((spent.match(LEXEME) ?? []).length <= 8 + MAX_QUERY_SPELLING_VARIANTS);
  assert.ok(spent.includes("'لائحة'"), spent);
  assert.doesNotMatch(spent, /'ئحة'/);
});

test('ال + alef words and «مادة» are never split as particles', () => {
  for (const word of ['الاداري', 'الاثبات', 'الالكتروني', 'مادة', 'لازم', 'الا']) {
    assert.doesNotMatch(parseSearchQuery(word).tsquery, /<->/, word);
  }
  assert.equal(splitFusedParticle('الاداري'), null);
  assert.equal(splitFusedParticle('مادة'), null);
  assert.equal(splitFusedParticle('لازم'), null);
  assert.deepEqual(splitFusedParticle('لايكون'), { particle: 'لا', rest: 'يكون' });
  assert.deepEqual(splitFusedParticle('ألايكون'), { particle: 'ألا', rest: 'يكون' });
  assert.deepEqual(splitFusedParticle('مماثلة'), { particle: 'مما', rest: 'ثلة' });
  assert.deepEqual([...NEGATION_PARTICLES], ['فيما', 'مما', 'ألا', 'لا', 'ما']);
});

test('numbers still expand both ways next to an «ال» word', () => {
  const { tsquery } = parseSearchQuery('المادة 12');
  assert.ok(tsquery.includes("'12'"), tsquery);
  assert.ok(tsquery.includes("'١٢'"), tsquery);
});

test('review I-1: the word after a particle keeps its spellings, unquoted and in a phrase', () => {
  for (const q of ['لا اثر', '"لا اثر"']) {
    const { tsquery } = parseSearchQuery(q);
    assert.ok(tsquery.includes("'أثر'"), `${q}: ${tsquery}`);
    assert.ok(tsquery.includes("'لااثر'"), `${q}: ${tsquery}`);
    assert.match(tsquery, /'لا' <-> \('اثر' \| 'أثر'/, `${q}: adjacent pair`);
  }
  for (const q of ['ما اذا', '"ما اذا"']) {
    assert.ok(parseSearchQuery(q).tsquery.includes("'إذا'"), q);
  }
  // A typed «ال…» word keeps its alef spellings too (no bare or re-prefixed form).
  const ithbat = parseSearchQuery('ما الاثبات').tsquery;
  assert.ok(ithbat.includes("'الإثبات'"), ithbat);
  assert.doesNotMatch(ithbat, /'اثبات'|'بالاثبات'/);
  // Words with no spellings stay byte-exact.
  assert.equal(parseSearchQuery('لا يكون').tsquery, "(('لا' <-> 'يكون') | 'لايكون')");
  // The budget still bounds the pair: one MAX_WORD_LEXEMES group at most.
  const lexemes = (parseSearchQuery('لا اثر').tsquery.match(/'[^']+'/g) ?? []).length;
  assert.ok(lexemes <= MAX_WORD_LEXEMES + 1, String(lexemes));
});

test('review M-2: autocomplete counts a voweled word through its stripped form too', () => {
  const { tsquery } = parseAutocompleteQuery('القَرَارُ');
  assert.ok(tsquery.includes("'القَرَارُ'"), tsquery);
  assert.ok(tsquery.includes("'القرار'"), tsquery);
  assert.equal(parseAutocompleteQuery('قرار').tsquery, "'قرار'");
});
