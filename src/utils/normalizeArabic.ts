/**
 * normalizeArabic — Shared Arabic text normalization for search
 * 
 * Normalizes Arabic characters for consistent search matching:
 * - أإآا → ا (normalize alef variants)
 * - ةه → ه (normalize taa marbuta to haa)
 * - يى → ي (normalize alef maqsoura to yaa)
 * - Lowercase + trim
 * 
 * Previously duplicated inline in 3 files:
 * - src/app/laws/page.tsx
 * - src/app/laws/[slug]/page.tsx
 * - src/app/precedents/[slug]/page.tsx
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

/**
 * normalizeDigits — Converts Arabic-Indic digits to Western
 * Re-exported from existing utility for composition.
 */
export { normalizeDigits } from './normalizeDigits.ts';

/**
 * normalizeSearch — Full normalization for search queries
 * Composes Arabic character normalization with digit normalization.
 * 
 * Example:
 *   normalizeSearch('الإثبات ١٤٤٤') → 'الاثبات 1444'
 */
export function normalizeSearch(text: string): string {
  // First normalize Arabic characters
  let result = normalizeArabic(text);
  // Then normalize digits (Arabic-Indic → Western)
  result = result
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  return result;
}

/**
 * highlightText — Highlight search matches in text
 * Returns an array of React-compatible segments with match flags.
 * 
 * Use with React: segments.map(s => s.match ? <mark>{s.text}</mark> : s.text)
 */
export interface TextSegment {
  text: string;
  match: boolean;
}

export function highlightText(text: string, query: string): TextSegment[] {
  if (!query || !text) return [{ text: text || '', match: false }];
  
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [{ text, match: false }];
  
  // Escape regex special characters in the query
  const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const normalizedText = normalizeSearch(text);
  const regex = new RegExp(escaped, 'gi');
  
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(normalizedText)) !== null) {
    // Add text before match (using original text positions)
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    // Add matched text (using original text to preserve diacritics)
    segments.push({ text: text.slice(match.index, match.index + match[0].length), match: true });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }
  
  return segments.length > 0 ? segments : [{ text, match: false }];
}

/**
 * debounce — Debounce function calls
 * Useful for search input to avoid firing on every keystroke.
 * 
 * Example:
 *   const debouncedSearch = debounce((q: string) => searchAPI(q), 300);
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * parseSearchQuery — Parse search query with operators
 * Supports the search syntax from the smart search engine spec:
 * - `+` → AND (both terms required)
 * - `/` → OR (either term)  
 * - `-` → NOT (exclude term)
 * - `""` → Exact phrase match
 * - `*` → Prefix/wildcard
 * 
 * Returns a structured query object for PostgreSQL FTS translation.
 */
export interface ParsedSearchQuery {
  /** The raw input query */
  raw: string;
  /** PostgreSQL tsquery-compatible string */
  tsquery: string;
  /** Plain text version for highlighting */
  plainTerms: string[];
}

export class SearchQuerySyntaxError extends SyntaxError {
  readonly code = 'invalid_search_syntax';
  readonly index: number;

  constructor(message: string, index: number) {
    super(`${message} (at index ${index})`);
    this.name = 'SearchQuerySyntaxError';
    this.index = index;
  }
}

type SearchQueryToken =
  | { kind: 'operand'; tsquery: string; plain: string }
  | { kind: 'and' | 'or' };

const SEARCH_DIGIT = /[0-9٠-٩۰-۹]/;

/** Quote one lexeme for PostgreSQL's tsquery input grammar. */
function quoteTsqueryLexeme(lexeme: string): string {
  // Backslash is the tsquery escape character. Escape it before apostrophes so
  // user text can never close the quoted lexeme and inject tsquery operators.
  return `'${lexeme.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function isLiteralSlash(input: string, index: number, termStart: number): boolean {
  const previous = input[index - 1] ?? '';
  const next = input[index + 1] ?? '';

  // Dates such as 1444/10/20 are one search term, not three OR branches.
  if (SEARCH_DIGIT.test(previous) && SEARCH_DIGIT.test(next)) return true;

  // A royal-decree reference such as م/14 (including Arabic/Persian digits)
  // is likewise data. Limit the exception to the exact compact prefix so a
  // normal expression such as نظام/لائحة remains an OR expression.
  return input.slice(termStart, index) === 'م' && SEARCH_DIGIT.test(next);
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const raw = query.trim();

  if (!raw) {
    return { raw, tsquery: '', plainTerms: [] };
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) {
    throw new SearchQuerySyntaxError('Control characters are not allowed', 0);
  }

  const tokens: SearchQueryToken[] = [];
  let index = 0;

  const fail = (message: string, at = index): never => {
    throw new SearchQuerySyntaxError(message, at);
  };

  const pushOperand = (operand: Extract<SearchQueryToken, { kind: 'operand' }>) => {
    if (tokens.at(-1)?.kind === 'operand') tokens.push({ kind: 'and' });
    tokens.push(operand);
  };

  const pushBinaryOperator = (kind: 'and' | 'or', at: number) => {
    if (tokens.length === 0 || tokens.at(-1)?.kind !== 'operand') {
      fail(`Operator ${kind === 'and' ? '+' : '/'} is missing a left operand`, at);
    }
    tokens.push({ kind });
  };

  const parsePhrase = (): Extract<SearchQueryToken, { kind: 'operand' }> => {
    const phraseStart = index;
    index += 1; // opening quote
    let phrase = '';
    let closed = false;

    while (index < raw.length) {
      const character = raw[index];
      if (character === '"') {
        index += 1;
        closed = true;
        break;
      }
      if (character === '\\') {
        const escaped = raw[index + 1];
        if (escaped !== '"' && escaped !== '\\') {
          fail('Only quote and backslash may be escaped inside a phrase', index);
        }
        phrase += escaped;
        index += 2;
        continue;
      }
      phrase += character;
      index += 1;
    }

    if (!closed) fail('Unterminated quoted phrase', phraseStart);
    if (index < raw.length && !/\s/.test(raw[index]) && raw[index] !== '+' && raw[index] !== '/') {
      fail('A quoted phrase must be followed by whitespace or an operator', index);
    }

    // The stored FTS vectors use `library.arabic (copy = simple)` on the
    // original source text. Do not apply normalizeSearch here: folding alef,
    // taa marbuta, alif maqsura or digit forms on the query alone would create
    // lexemes that do not exist in that index. A future normalization change
    // must rebuild both the generated vectors and this emitter together.
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) fail('Quoted phrase cannot be empty', phraseStart);

    return {
      kind: 'operand',
      tsquery: words.map(quoteTsqueryLexeme).join(' <-> '),
      plain: phrase,
    };
  };

  const parseTerm = (): Extract<SearchQueryToken, { kind: 'operand' }> => {
    const termStart = index;

    while (index < raw.length) {
      const character = raw[index];
      if (/\s/.test(character) || character === '+') break;
      if (character === '/' && !isLiteralSlash(raw, index, termStart)) break;
      if (character === '"') fail('A quote may only start a quoted phrase', index);
      if (character === '\\') fail('Backslash escapes are only valid inside quoted phrases', index);
      index += 1;
    }

    const sourceTerm = raw.slice(termStart, index);
    if (!sourceTerm) fail('Expected a search term', termStart);

    const starIndex = sourceTerm.indexOf('*');
    const wildcard = sourceTerm.endsWith('*');
    if (starIndex !== -1 && (!wildcard || starIndex !== sourceTerm.length - 1)) {
      fail('Wildcard * is allowed only once at the end of a term', termStart + starIndex);
    }

    const plain = wildcard ? sourceTerm.slice(0, -1) : sourceTerm;
    if (!plain.trim()) fail('Wildcard * must follow a search term', termStart);

    return {
      kind: 'operand',
      tsquery: `${quoteTsqueryLexeme(plain)}${wildcard ? ':*' : ''}`,
      plain,
    };
  };

  let positiveOperands = 0;
  const parseOperand = (negated: boolean) => {
    const operand = raw[index] === '"' ? parsePhrase() : parseTerm();
    if (!negated) positiveOperands += 1;
    pushOperand({
      ...operand,
      tsquery: negated ? `!(${operand.tsquery})` : operand.tsquery,
    });
  };

  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    if (index >= raw.length) break;

    const character = raw[index];
    if (character === '+') {
      pushBinaryOperator('and', index);
      index += 1;
      continue;
    }
    if (character === '/') {
      pushBinaryOperator('or', index);
      index += 1;
      continue;
    }
    if (character === '-') {
      const negationIndex = index;
      index += 1;
      if (index >= raw.length || /\s/.test(raw[index]) || ['+', '/', '-'].includes(raw[index])) {
        fail('Negation - must be attached to a term or quoted phrase', negationIndex);
      }
      parseOperand(true);
      continue;
    }

    parseOperand(false);
  }

  if (tokens.at(-1)?.kind !== 'operand') {
    fail('Search query cannot end with an operator', raw.length - 1);
  }
  if (positiveOperands === 0) {
    fail('Search query must contain at least one positive term', 0);
  }

  // Build an explicit expression tree: AND binds more tightly than OR.
  // Parenthesizing the emitted tsquery keeps that contract independent of
  // PostgreSQL operator-precedence changes or future token transformations.
  let tokenIndex = 0;
  const parseAtom = (): string => {
    const token = tokens[tokenIndex];
    if (!token || token.kind !== 'operand') {
      return fail('Expected a search term', raw.length);
    }
    tokenIndex += 1;
    return token.tsquery;
  };
  const parseAndExpression = (): string => {
    let expression = parseAtom();
    while (tokens[tokenIndex]?.kind === 'and') {
      tokenIndex += 1;
      expression = `(${expression} & ${parseAtom()})`;
    }
    return expression;
  };
  const parseOrExpression = (): string => {
    let expression = parseAndExpression();
    while (tokens[tokenIndex]?.kind === 'or') {
      tokenIndex += 1;
      expression = `(${expression} | ${parseAndExpression()})`;
    }
    return expression;
  };
  const tsquery = parseOrExpression();
  if (tokenIndex !== tokens.length) fail('Invalid search expression', raw.length);

  return {
    raw,
    tsquery,
    plainTerms: tokens
      .filter((token): token is Extract<SearchQueryToken, { kind: 'operand' }> => token.kind === 'operand')
      .map((token) => token.plain),
  };
}

/**
 * Text-search configuration name to pass to PostgREST / supabase-js
 * `.textSearch(..., { config })`.
 *
 * ⚠️ It must NOT be the schema-qualified `library.arabic`, even though that is
 * the config the stored `fts` columns are generated with. PostgREST's filter
 * grammar treats the dot in `plfts(library.arabic).<query>` as the operator
 * separator and rejects the whole request:
 *
 *     PGRST100  failed to parse filter (plfts(library.arabic).العمل)
 *               (line 1, column 14)
 *
 * Both library search routes swallowed that error and reported zero results, so
 * the entire legal-library search returned nothing while looking healthy — the
 * "library search dead" production blocker. Measured against production:
 *
 *     config 'library.arabic'  →  PGRST100, 0 rows
 *     config 'simple'          →  1,448 rows
 *     config 'arabic'          →    892 rows   ← WRONG, see below
 *
 * `simple` is the correct substitute, not `arabic`. The migration creates
 * `library.arabic` as `(copy = simple)`, so `simple` yields byte-identical
 * lexemes to the ones stored in the index. Bare `arabic` resolves instead to
 * Postgres's built-in Arabic snowball config, which stems the query terms while
 * the indexed lexemes are unstemmed — it returns rows, but the wrong ones.
 */
export const LIBRARY_FTS_CONFIG = 'simple';
