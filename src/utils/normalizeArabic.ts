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
export { normalizeDigits } from './normalizeDigits';

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

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const raw = query.trim();
  const plainTerms: string[] = [];
  
  if (!raw) {
    return { raw, tsquery: '', plainTerms: [] };
  }
  
  // Extract exact phrases first
  const phrases: string[] = [];
  let processed = raw.replace(/"([^"]+)"/g, (_match, phrase) => {
    phrases.push(phrase);
    plainTerms.push(phrase);
    return `__PHRASE_${phrases.length - 1}__`;
  });
  
  // Split by operators
  const parts = processed.split(/\s+/);
  const tsqueryParts: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Check if it's a phrase placeholder
    const phraseMatch = part.match(/^__PHRASE_(\d+)__$/);
    if (phraseMatch) {
      const phrase = phrases[parseInt(phraseMatch[1])];
      // PostgreSQL phraseto_tsquery equivalent
      const phraseWords = normalizeSearch(phrase).split(/\s+/).filter(Boolean);
      tsqueryParts.push(phraseWords.map(w => `'${w}'`).join(' <-> '));
      continue;
    }
    
    // Handle operators
    if (part === '+' || part === '/') continue; // Operators handled by context
    
    // NOT operator (- prefix)
    if (part.startsWith('-') && part.length > 1) {
      const term = normalizeSearch(part.slice(1));
      if (term) {
        tsqueryParts.push(`!('${term}')`);
        plainTerms.push(part.slice(1));
      }
      continue;
    }
    
    // Wildcard (* suffix)
    const isWildcard = part.endsWith('*');
    const cleanPart = isWildcard ? part.slice(0, -1) : part;
    const normalized = normalizeSearch(cleanPart);
    
    if (!normalized) continue;
    
    plainTerms.push(cleanPart);
    
    // Check what operator connects this to the next term
    const nextPart = parts[i + 1];
    const operator = nextPart === '/' ? ' | ' : ' & '; // Default is AND
    
    if (isWildcard) {
      tsqueryParts.push(`'${normalized}':*`);
    } else {
      tsqueryParts.push(`'${normalized}'`);
    }
    
    // Add operator if not last term and next is not an operator
    if (i < parts.length - 1 && nextPart !== '+' && nextPart !== '/') {
      tsqueryParts.push(operator);
    }
  }
  
  return {
    raw,
    tsquery: tsqueryParts.join(' '),
    plainTerms,
  };
}
