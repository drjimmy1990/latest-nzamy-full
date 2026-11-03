import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { isMissingFunctionError } from '../searchPlan';
import { suggestionsFromRows, SUGGEST_LIMIT, SUGGEST_MAX_QUERY } from './suggestions';

/**
 * GET /api/library/search/suggest?q=نضام العمل — owner note ١٢-٣: «هل تقصد …؟»
 * for a search that found nothing: the closest catalogue TITLES (laws,
 * judicial collections, fiqh books), from library.search_title_suggestions
 * (20261030_62, pg_trgm on titles only, service_role only, 3s limit).
 *
 * Titles, slugs and the public law status only — the same for every viewer,
 * nothing column-locked. While the function is missing (PGRST202 / 42883) or
 * on any error the answer is an empty list: the page then shows its plain
 * «لا نتائج», never an error.
 */
export async function GET(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  const q = (new URL(request.url).searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > SUGGEST_MAX_QUERY) {
    return NextResponse.json({ suggestions: [], available: true });
  }

  try {
    const serverOnly = await createServiceClient();
    const rpc = await serverOnly
      .schema('library')
      .rpc('search_title_suggestions', { p_query: q, p_limit: SUGGEST_LIMIT })
      .abortSignal(AbortSignal.timeout(4000));
    if (rpc.error) {
      // Missing function (20261030_62 not run yet) → quietly no suggestions.
      const missing = isMissingFunctionError(rpc.error);
      if (!missing) console.error('[Search suggest] rpc failed:', rpc.error);
      return NextResponse.json({ suggestions: [], available: !missing });
    }
    return NextResponse.json(
      { suggestions: suggestionsFromRows(rpc.data), available: true },
      // Public titles only, identical for every viewer.
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (error) {
    console.error('[Search suggest] error:', error);
    return NextResponse.json({ suggestions: [], available: false });
  }
}
