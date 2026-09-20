/**
 * Runtime contract for POST /api/library/search filters.
 *
 * Keep this list aligned with the filters actually applied by route.ts.  A
 * filter is not accepted merely because a caller can describe it: accepting
 * then ignoring it would make a narrow search look complete when it is not.
 */
export interface SearchFilters {
  category?: string; // laws.section_code / orders.category
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
      error: 'filters must be an object',
    };
  }

  for (const key of Object.keys(value)) {
    if (includes(declaredButUnimplementedFilterKeys, key)) {
      return {
        ok: false,
        code: 'unimplemented_filter',
        error: `Filter "${key}" is not implemented`,
      };
    }

    if (!includes(supportedFilterKeys, key)) {
      return {
        ok: false,
        code: 'unknown_filter',
        error: `Filter "${key}" is not supported`,
      };
    }

    const expectedType = key === 'year' ? 'number' : 'string';
    const filterValue = value[key];
    const validYear = key !== 'year' || Number.isFinite(filterValue);
    if (typeof filterValue !== expectedType || !validYear) {
      return {
        ok: false,
        code: 'invalid_filter_type',
        error: `Filter "${key}" must be a ${key === 'year' ? 'finite number' : 'string'}`,
      };
    }

    if (key !== 'year' && (filterValue as string).trim().length === 0) {
      return {
        ok: false,
        code: 'invalid_filter_value',
        error: `Filter "${key}" must not be empty`,
      };
    }

    if (key === 'status' && !includes(ARTICLE_SEARCH_STATUSES, filterValue as string)) {
      return {
        ok: false,
        code: 'invalid_filter_value',
        error: `Filter "status" must be a known article status`,
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
        error: `Filter "${key}" is not applied when section is "${section}"`,
      };
    }
  }

  return { ok: true, filters: value as SearchFilters };
}

/**
 * Validate every request-shape value before route.ts creates its search
 * client. `sort` is deliberately relevance-only until ordering semantics are
 * implemented; accepting an ignored sort would be another silent broadening.
 */
export function validateSearchRequest(value: unknown): SearchRequestValidationResult {
  if (!isRecord(value)) {
    return { ok: false, code: 'invalid_request', error: 'request body must be an object' };
  }

  if (typeof value.query !== 'string') {
    return { ok: false, code: 'invalid_query', error: 'query must be a string' };
  }

  const rawSection = value.section === undefined ? 'all' : value.section;
  if (typeof rawSection !== 'string' || !includes(SEARCH_SECTIONS, rawSection)) {
    return { ok: false, code: 'invalid_section', error: 'section is not supported' };
  }
  const section: SearchSection = rawSection;

  const sort = value.sort === undefined ? 'relevance' : value.sort;
  if (sort !== 'relevance') {
    return { ok: false, code: 'invalid_sort', error: 'sort is supported only as "relevance"' };
  }

  const page = value.page === undefined ? 1 : value.page;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) {
    return { ok: false, code: 'invalid_page', error: 'page must be a positive safe integer' };
  }

  const limit = value.limit === undefined ? 10 : value.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    return { ok: false, code: 'invalid_limit', error: `limit must be a positive integer no greater than ${SEARCH_MAX_LIMIT}` };
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + limit - 1)) {
    return { ok: false, code: 'invalid_page', error: 'page and limit must produce a safe range' };
  }

  const filters = validateSearchFilters(value.filters, section);
  if (!filters.ok) return filters;

  return {
    ok: true,
    request: { query: value.query, section, filters: filters.filters, page, limit },
  };
}
