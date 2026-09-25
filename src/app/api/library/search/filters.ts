/**
 * Runtime contract for POST /api/library/search filters.
 *
 * Keep this list aligned with the filters actually applied by route.ts.  A
 * filter is not accepted merely because a caller can describe it: accepting
 * then ignoring it would make a narrow search look complete when it is not.
 */
export interface SearchFilters {
  /**
   * laws.section_code / orders.category. The DB stores the bare two-digit
   * code ('00'..'30'); the /laws UI taxonomy sends 'SA-NN'. Both are accepted
   * and the validated filter always carries the bare code (see
   * normalizeCategoryFilter).
   */
  category?: string;
  track?: string; // judicial_collections.track
  source?: string; // judicial_collections.source_id
  issuer?: string; // orders.issuer
  year?: number; // principles.year_hijri
  status?: string; // articles.status in the current search route, not laws.status
  type?: string; // orders.type
  lawType?: string; // laws.type
  court?: string; // judicial_collections.court
}

export type SearchSection = 'all' | 'laws' | 'precedents' | 'orders' | 'feqh';
export const SEARCH_SECTIONS = ['all', 'laws', 'precedents', 'orders', 'feqh'] as const;
export const SEARCH_MAX_LIMIT = 100;
/**
 * Deepest result a caller may page to (offset + limit). A deep OFFSET over a
 * 10^5-row full-text match set (feqh «في» page 1000) ran past the anon role's
 * ~3s statement_timeout and failed the request; nobody reads result #10,000,
 * so the depth is capped and the caller is told to narrow the query instead.
 */
export const SEARCH_MAX_DEPTH = 1000;

/**
 * The UI taxonomy ids are 'SA-00'..'SA-29' (+ 'SA-99'); library.laws.section_code
 * and library.decrees_circulars.category hold the bare code '00'..'30'. Sending
 * 'SA-06' straight to `eq` matched nothing, so every category-scoped search
 * returned 0 (LIB-02). Accept either spelling, and a single digit ('SA-8', '8'),
 * and return the stored two-digit form; anything else is not a category the
 * data can hold.
 */
export function normalizeCategoryFilter(value: string): string | null {
  const match = /^(?:SA-)?(\d{1,2})$/i.exec(value.trim());
  return match ? match[1].padStart(2, '0') : null;
}

/**
 * Every spelling a normalised category code is stored under. Some
 * decrees_circulars rows carry the unpadded code ('8', '9') where the rest
 * use '08'/'09', so an `eq('category', '08')` missed them; the orders query
 * matches both with `.in('category', …)`. laws.section_code is always padded.
 */
export function categoryStoredSpellings(code: string): string[] {
  const unpadded = /^\d+$/.test(code) ? String(Number(code)) : code;
  return unpadded === code ? [code] : [code, unpadded];
}

export const ARTICLE_SEARCH_STATUSES = [
  'active', 'amended', 'repealed', 'suspended', 'added', 'merged', 'status_undeclared',
] as const;

const supportedFilterKeys = [
  'category',
  'track',
  'source',
  'issuer',
  'year',
  'status',
  'type',
  'lawType',
  'court',
] as const satisfies readonly (keyof SearchFilters)[];

const filterSections: Record<keyof SearchFilters, readonly Exclude<SearchSection, 'all'>[]> = {
  category: ['laws', 'orders'],
  track: ['precedents'],
  source: ['precedents'],
  issuer: ['orders'],
  year: ['precedents'],
  status: ['laws'],
  type: ['orders'],
  lawType: ['laws'],
  court: ['precedents'],
};

// These names appeared in the public request shape but route.ts never applied
// them.  Retain them here only to return an explicit client error; do not add
// them to SearchFilters until their query semantics and access review exist.
const declaredButUnimplementedFilterKeys = [
  'dateFrom',
  'dateTo',
  'legalBranch',
] as const;

export type FilterValidationResult =
  | { ok: true; filters: SearchFilters }
  | {
      ok: false;
      code:
        | 'invalid_filters'
        | 'unknown_filter'
        | 'unimplemented_filter'
        | 'invalid_filter_type'
        | 'invalid_filter_value'
        | 'invalid_filter_scope';
      error: string;
    };

export type SearchRequestValidationResult =
  | {
      ok: true;
      request: {
        query: string;
        section: SearchSection;
        filters: SearchFilters;
        page: number;
        limit: number;
      };
    }
  | {
      ok: false;
      code:
        | 'invalid_request'
        | 'invalid_query'
        | 'invalid_section'
        | 'invalid_sort'
        | 'invalid_page'
        | 'page_too_deep'
        | 'invalid_limit'
        | Extract<FilterValidationResult, { ok: false }>['code'];
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includes<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

/**
 * Validate before the route creates its search database client. Failures
 * intentionally carry no result data, so an ignored filter cannot yield a
 * broader response.
 */
export function validateSearchFilters(value: unknown, section: SearchSection = 'all'): FilterValidationResult {
  if (value === undefined) return { ok: true, filters: {} };

  if (!isRecord(value)) {
    return {
      ok: false,
      code: 'invalid_filters',
      error: 'المرشحات (filters) يجب أن تكون كائناً.',
    };
  }

  for (const key of Object.keys(value)) {
    if (includes(declaredButUnimplementedFilterKeys, key)) {
      return {
        ok: false,
        code: 'unimplemented_filter',
        error: `المرشح "${key}" غير مطبّق بعد.`,
      };
    }

    if (!includes(supportedFilterKeys, key)) {
      return {
        ok: false,
        code: 'unknown_filter',
        error: `المرشح "${key}" غير مدعوم.`,
      };
    }

    const expectedType = key === 'year' ? 'number' : 'string';
    const filterValue = value[key];
    const validYear = key !== 'year' || Number.isFinite(filterValue);
    if (typeof filterValue !== expectedType || !validYear) {
      return {
        ok: false,
        code: 'invalid_filter_type',
        error: `المرشح "${key}" يجب أن يكون ${key === 'year' ? 'رقماً' : 'نصاً'}.`,
      };
    }

    if (key !== 'year' && (filterValue as string).trim().length === 0) {
      return {
        ok: false,
        code: 'invalid_filter_value',
        error: `المرشح "${key}" يجب ألا يكون فارغاً.`,
      };
    }

    if (key === 'status' && !includes(ARTICLE_SEARCH_STATUSES, filterValue as string)) {
      return {
        ok: false,
        code: 'invalid_filter_value',
        error: 'المرشح "status" يجب أن يكون حالة مادة معروفة.',
      };
    }

    if (key === 'category' && normalizeCategoryFilter(filterValue as string) === null) {
      return {
        ok: false,
        code: 'invalid_filter_value',
        error: 'مرشح التصنيف يجب أن يكون رمز قسم مثل "SA-06" أو "06" أو "6".',
      };
    }

    const allowedSections = filterSections[key];
    // An all-sections request may not selectively filter one table while
    // presenting unrelated sections as matches. The API has no intersection
    // contract for multi-section filters, so reject every one explicitly.
    if (section === 'all' || !allowedSections.includes(section as Exclude<SearchSection, 'all'>)) {
      return {
        ok: false,
        code: 'invalid_filter_scope',
        error: `المرشح "${key}" لا يُطبَّق عندما يكون القسم "${section}".`,
      };
    }
  }

  // Return a normalised copy, never the caller's object: the category must
  // reach the query in the stored spelling.
  const filters = { ...value } as SearchFilters;
  if (filters.category !== undefined) {
    filters.category = normalizeCategoryFilter(filters.category) as string;
  }
  return { ok: true, filters };
}

/**
 * Validate every request-shape value before route.ts creates its search
 * client. `sort` is deliberately relevance-only until ordering semantics are
 * implemented; accepting an ignored sort would be another silent broadening.
 */
export function validateSearchRequest(value: unknown): SearchRequestValidationResult {
  if (!isRecord(value)) {
    return { ok: false, code: 'invalid_request', error: 'جسم الطلب يجب أن يكون كائناً.' };
  }

  if (typeof value.query !== 'string') {
    return { ok: false, code: 'invalid_query', error: 'نص البحث (query) يجب أن يكون نصاً.' };
  }

  const rawSection = value.section === undefined ? 'all' : value.section;
  if (typeof rawSection !== 'string' || !includes(SEARCH_SECTIONS, rawSection)) {
    return { ok: false, code: 'invalid_section', error: 'القسم المطلوب (section) غير مدعوم.' };
  }
  const section: SearchSection = rawSection;

  const sort = value.sort === undefined ? 'relevance' : value.sort;
  if (sort !== 'relevance') {
    return { ok: false, code: 'invalid_sort', error: 'الترتيب (sort) المدعوم هو "relevance" (حسب الصلة) فقط.' };
  }

  const page = value.page === undefined ? 1 : value.page;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) {
    return { ok: false, code: 'invalid_page', error: 'رقم الصفحة (page) يجب أن يكون عدداً صحيحاً موجباً.' };
  }

  const limit = value.limit === undefined ? 10 : value.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    return { ok: false, code: 'invalid_limit', error: `عدد النتائج (limit) يجب أن يكون عدداً صحيحاً موجباً لا يتجاوز ${SEARCH_MAX_LIMIT}.` };
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + limit - 1)) {
    return { ok: false, code: 'invalid_page', error: 'قيمتا الصفحة وعدد النتائج (page, limit) تتجاوزان النطاق المسموح.' };
  }

  // section=all ignores `page` (it returns a fixed preview per section from
  // offset 0), so the depth cap only applies to a single-section request.
  if (section !== 'all' && offset + limit > SEARCH_MAX_DEPTH) {
    return {
      ok: false,
      code: 'page_too_deep',
      error: `لا يمكن عرض ما بعد أول ${SEARCH_MAX_DEPTH} نتيجة. أضف كلمات أدق أو استخدم المرشحات لتضييق البحث.`,
    };
  }

  const filters = validateSearchFilters(value.filters, section);
  if (!filters.ok) return filters;

  return {
    ok: true,
    request: { query: value.query, section, filters: filters.filters, page, limit },
  };
}
