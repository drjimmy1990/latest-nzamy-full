import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseSearchQuery, normalizeSearch } from '@/utils/normalizeArabic';

/**
 * POST /api/library/search
 * Central search endpoint for the Legal Library.
 * Searches across all 4 sections with operator support.
 */

interface SearchRequest {
  query: string;
  section: 'all' | 'laws' | 'precedents' | 'orders' | 'feqh';
  filters?: {
    category?: string;    // SA-XX category code
    track?: string;       // ordinary / admin / semi
    source?: string;      // sourceId for principles
    issuer?: string;      // decree issuer
    year?: number;        // Hijri year
    status?: string;      // active / amended / repealed
    type?: string;        // royal / cabinet / circular
    dateFrom?: string;    // Hijri date from
    dateTo?: string;      // Hijri date to
    lawType?: string;     // نظام / لائحة / etc
    court?: string;       // court name
    legalBranch?: string; // legal branch code
  };
  sort?: 'relevance' | 'date-desc' | 'date-asc' | 'alpha';
  page?: number;
  limit?: number;
}

export async function POST(request: Request) {
  try {
    const body: SearchRequest = await request.json();
    const { query, section = 'all', filters = {}, sort = 'relevance', page = 1, limit = 10 } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const parsed = parseSearchQuery(query);
    const offset = (page - 1) * limit;

    // Normalize search terms (أ→ا, ة→ه, ى→ي, Arabic-Indic digits→Western) so
    // `الإثبات` matches stored `الاثبات` and ١٤٤٤ matches 1444. The DB columns
    // are ilike-compared against this normalized pattern.
    const normTerms = parsed.plainTerms.map(normalizeSearch).filter(Boolean);
    const ilikePattern = `%${normTerms.join('%')}%`;

    // Collect results from each section
    const results: Record<string, unknown[]> = { laws: [], precedents: [], orders: [], feqh: [] };
    const counts: Record<string, number> = { laws: 0, precedents: 0, orders: 0, feqh: 0 };

    // --- LAWS SEARCH ---
    if (section === 'all' || section === 'laws') {
      try {
        // Search in articles (the most granular level)
        let lawQuery = supabase
          .schema('library')
          .from('articles')
          .select(`
            id, number, number_text, title, status, text, 
            executive_reg_text, executive_reg_ref, law_slug,
            laws!inner ( slug, title, type, section_code, section_name )
          `, { count: 'exact' })
          .or(`text.ilike.${ilikePattern},executive_reg_text.ilike.${ilikePattern},title.ilike.${ilikePattern}`);

        // Apply filters
        if (filters.category) {
          lawQuery = lawQuery.eq('laws.section_code', filters.category);
        }
        if (filters.status) {
          lawQuery = lawQuery.eq('status', filters.status);
        }
        if (filters.lawType) {
          lawQuery = lawQuery.eq('laws.type', filters.lawType);
        }

        if (section === 'laws') {
          lawQuery = lawQuery.range(offset, offset + limit - 1);
        } else {
          lawQuery = lawQuery.limit(6);
        }

        const { data: lawResults, count: lawCount, error: lawError } = await lawQuery;
        if (!lawError && lawResults) {
          results.laws = lawResults.map((r: Record<string, unknown>) => ({
            id: r.id,
            section: 'laws',
            title: `${(r.laws as Record<string, unknown>)?.title} — ${r.number_text || `المادة ${r.number}`}`,
            snippet: truncateWithHighlight(r.text as string, parsed.plainTerms, 200),
            meta: {
              lawTitle: (r.laws as Record<string, unknown>)?.title,
              articleNumber: r.number,
              status: r.status,
              lawSlug: r.law_slug,
            },
          }));
          counts.laws = lawCount || 0;
        }
      } catch (e) {
        console.error('[Search] Laws error:', e);
      }
    }

    // --- PRECEDENTS/PRINCIPLES SEARCH ---
    if (section === 'all' || section === 'precedents') {
      try {
        let precQuery = supabase
          .schema('library')
          .from('principles')
          .select(`
            id, principle_number, issuing_body, text, session_date, 
            decision_number, year_hijri,
            judicial_collections!inner ( id, title, court, track, source_id )
          `, { count: 'exact' })
          .or(`text.ilike.${ilikePattern},ruling_basis.ilike.${ilikePattern},issuing_body.ilike.${ilikePattern}`);

        if (filters.track) {
          precQuery = precQuery.eq('judicial_collections.track', filters.track);
        }
        if (filters.source) {
          precQuery = precQuery.eq('judicial_collections.source_id', filters.source);
        }
        if (filters.year) {
          precQuery = precQuery.eq('year_hijri', filters.year);
        }
        if (filters.court) {
          precQuery = precQuery.eq('judicial_collections.court', filters.court);
        }

        if (section === 'precedents') {
          precQuery = precQuery.range(offset, offset + limit - 1);
        } else {
          precQuery = precQuery.limit(6);
        }

        const { data: precResults, count: precCount, error: precError } = await precQuery;
        if (!precError && precResults) {
          results.precedents = precResults.map((r: Record<string, unknown>) => ({
            id: r.id,
            section: 'precedents',
            title: `مبدأ رقم ${r.principle_number} — ${r.issuing_body}`,
            snippet: truncateWithHighlight(r.text as string, parsed.plainTerms, 200),
            meta: {
              court: (r.judicial_collections as Record<string, unknown>)?.court,
              sessionDate: r.session_date,
              decisionNumber: r.decision_number,
              collectionSlug: (r.judicial_collections as Record<string, unknown>)?.id,
              year: r.year_hijri,
            },
          }));
          counts.precedents = precCount || 0;
        }
      } catch (e) {
        console.error('[Search] Precedents error:', e);
      }
    }

    // --- ORDERS/DECREES SEARCH ---
    if (section === 'all' || section === 'orders') {
      try {
        let orderQuery = supabase
          .schema('library')
          .from('decrees_circulars')
          .select('id, title, type, issuer, ref, date, summary_brief, category, hashtags', { count: 'exact' })
          .or(`title.ilike.${ilikePattern},summary_brief.ilike.${ilikePattern},ref.ilike.${ilikePattern}`);

        if (filters.issuer) {
          orderQuery = orderQuery.eq('issuer', filters.issuer);
        }
        if (filters.type) {
          orderQuery = orderQuery.eq('type', filters.type);
        }
        if (filters.category) {
          orderQuery = orderQuery.eq('category', filters.category);
        }

        if (section === 'orders') {
          orderQuery = orderQuery.range(offset, offset + limit - 1);
        } else {
          orderQuery = orderQuery.limit(6);
        }

        const { data: orderResults, count: orderCount, error: orderError } = await orderQuery;
        if (!orderError && orderResults) {
          results.orders = orderResults.map((r: Record<string, unknown>) => ({
            id: r.id,
            section: 'orders',
            title: r.title,
            snippet: r.summary_brief || '',
            meta: {
              type: r.type,
              issuer: r.issuer,
              ref: r.ref,
              date: r.date,
              hashtags: r.hashtags,
            },
          }));
          counts.orders = orderCount || 0;
        }
      } catch (e) {
        console.error('[Search] Orders error:', e);
      }
    }

    // --- FEQH SEARCH ---
    if (section === 'all' || section === 'feqh') {
      try {
        let feqhQuery = supabase
          .schema('library')
          .from('feqh_blocks')
          .select(`
            id, topic, matn, sharh, volume_number, page_number,
            feqh_sections!inner ( 
              id, title,
              feqh_chapters!inner (
                id, title,
                feqh_books!inner ( id, title, author, school, type )
              )
            )
          `, { count: 'exact' })
          .or(`topic.ilike.${ilikePattern},matn.ilike.${ilikePattern},sharh.ilike.${ilikePattern}`);

        if (section === 'feqh') {
          feqhQuery = feqhQuery.range(offset, offset + limit - 1);
        } else {
          feqhQuery = feqhQuery.limit(6);
        }

        const { data: feqhResults, count: feqhCount, error: feqhError } = await feqhQuery;
        if (!feqhError && feqhResults) {
          results.feqh = feqhResults.map((r: Record<string, unknown>) => {
            const section = r.feqh_sections as Record<string, unknown>;
            const chapter = section?.feqh_chapters as Record<string, unknown>;
            const book = chapter?.feqh_books as Record<string, unknown>;
            return {
              id: r.id,
              section: 'feqh',
              title: `${book?.title} — ${r.topic}`,
              snippet: truncateWithHighlight((r.sharh || r.matn) as string, parsed.plainTerms, 200),
              meta: {
                bookTitle: book?.title,
                bookSlug: book?.id,
                chapter: chapter?.title,
                page: r.page_number,
                volume: r.volume_number,
              },
            };
          });
          counts.feqh = feqhCount || 0;
        }
      } catch (e) {
        console.error('[Search] Feqh error:', e);
      }
    }

    // Sort results
    const allResults = section === 'all'
      ? [...results.laws, ...results.precedents, ...results.orders, ...results.feqh]
      : results[section] || [];

    return NextResponse.json({
      results: allResults,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      page,
      query: parsed.raw,
    });
  } catch (error) {
    console.error('[Search] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Truncate text around the first match, preserving word boundaries.
 *  Matching is done on normalized text (أ→ا, ة→ه, ى→ي, digits) so that a query
 *  for `الإثبات` centers the snippet on stored `الاثبات`. Slice indices map
 *  back to the original text because normalization is 1:1 per character. */
function truncateWithHighlight(text: string | null, terms: string[], maxLength: number): string {
  if (!text) return '';
  if (!terms.length) return text.slice(0, maxLength);

  const normText = normalizeSearch(text);
  const firstTerm = normalizeSearch(terms[0]);
  const matchIndex = normText.indexOf(firstTerm);

  if (matchIndex === -1) return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');

  // Center the snippet around the match.
  // Normalization is character-by-character 1:1, so normText indices map
  // directly back to original-text indices.
  const contextBefore = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const contextAfter = Math.min(text.length, matchIndex + firstTerm.length + Math.floor(maxLength * 2 / 3));

  let snippet = text.slice(contextBefore, contextAfter);
  if (contextBefore > 0) snippet = '...' + snippet;
  if (contextAfter < text.length) snippet = snippet + '...';

  return snippet;
}
