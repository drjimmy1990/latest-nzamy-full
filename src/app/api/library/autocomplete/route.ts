import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeSearch } from '@/utils/normalizeArabic';

/**
 * GET /api/library/autocomplete?q=بطلان
 * Fast cross-section autocomplete with faceted counts.
 * Returns section counts + top 6 matching items.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({
        counts: { laws: 0, precedents: 0, orders: 0, feqh: 0 },
        topMatches: [],
      });
    }

    const supabase = await createClient();
    // Normalize so `الإثبات` matches stored `الاثبات` and ١٤٤٤ matches 1444.
    const searchTerm = `%${normalizeSearch(query)}%`;

    // Run all count queries in parallel for speed
    const [lawsCount, precedentsCount, ordersCount, feqhCount, topLaws, topPrecedents, topOrders] = await Promise.all([
      // Count: laws articles matching
      supabase
        .schema('library')
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .or(`text.ilike.${searchTerm},title.ilike.${searchTerm}`),
      
      // Count: principles matching
      supabase
        .schema('library')
        .from('principles')
        .select('id', { count: 'exact', head: true })
        .ilike('text', searchTerm),
      
      // Count: decrees matching
      supabase
        .schema('library')
        .from('decrees_circulars')
        .select('id', { count: 'exact', head: true })
        .or(`title.ilike.${searchTerm},summary_brief.ilike.${searchTerm}`),
      
      // Count: feqh blocks matching
      supabase
        .schema('library')
        .from('feqh_blocks')
        .select('id', { count: 'exact', head: true })
        .or(`topic.ilike.${searchTerm},matn.ilike.${searchTerm},sharh.ilike.${searchTerm}`),
      
      // Top 2 law matches
      supabase
        .schema('library')
        .from('laws')
        .select('slug, title, type')
        .ilike('title', searchTerm)
        .limit(2),
      
      // Top 2 principle matches
      supabase
        .schema('library')
        .from('principles')
        .select('id, principle_number, issuing_body, text')
        .ilike('text', searchTerm)
        .limit(2),
      
      // Top 2 decree matches
      supabase
        .schema('library')
        .from('decrees_circulars')
        .select('id, title, type, ref')
        .or(`title.ilike.${searchTerm},summary_brief.ilike.${searchTerm}`)
        .limit(2),
    ]);

    // Build top matches array
    const topMatches: Array<{ title: string; section: string; slug: string; snippet?: string }> = [];

    if (topLaws.data) {
      topLaws.data.forEach((law: Record<string, unknown>) => {
        topMatches.push({
          title: law.title as string,
          section: 'laws',
          slug: law.slug as string,
        });
      });
    }

    if (topPrecedents.data) {
      topPrecedents.data.forEach((p: Record<string, unknown>) => {
        const text = p.text as string;
        topMatches.push({
          title: `مبدأ رقم ${p.principle_number} — ${p.issuing_body}`,
          section: 'precedents',
          slug: p.id as string,
          snippet: text?.slice(0, 120) + (text?.length > 120 ? '...' : ''),
        });
      });
    }

    if (topOrders.data) {
      topOrders.data.forEach((o: Record<string, unknown>) => {
        topMatches.push({
          title: o.title as string,
          section: 'orders',
          slug: o.id as string,
        });
      });
    }

    return NextResponse.json({
      counts: {
        laws: lawsCount.count || 0,
        precedents: precedentsCount.count || 0,
        orders: ordersCount.count || 0,
        feqh: feqhCount.count || 0,
      },
      topMatches: topMatches.slice(0, 6), // Max 6 results for autocomplete
    });
  } catch (error) {
    console.error('[Autocomplete] Error:', error);
    return NextResponse.json(
      { counts: { laws: 0, precedents: 0, orders: 0, feqh: 0 }, topMatches: [] },
      { status: 500 }
    );
  }
}
