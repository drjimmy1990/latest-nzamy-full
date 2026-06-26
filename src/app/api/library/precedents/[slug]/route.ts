import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/library/precedents/[slug]
 * Fetch a judicial principles collection with all principles and paragraphs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Fetch collection metadata
    const { data: collection, error: collError } = await supabase
      .schema('library')
      .from('judicial_collections')
      .select('*')
      .eq('id', slug)
      .single();

    if (collError || !collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Fetch principles with paragraphs
    const { data: principles } = await supabase
      .schema('library')
      .from('principles')
      .select(`
        *,
        principle_paragraphs (*)
      `)
      .eq('collection_id', slug)
      .order('order_index', { ascending: true });

    // Format response matching frontend interface
    const response = {
      id: collection.id,
      slug: collection.id,
      title: collection.title,
      court: collection.court,
      yearHijri: collection.year_hijri,
      part: collection.part,
      sourceId: collection.source_id,
      track: collection.track,
      description: collection.description,
      rulingCount: collection.ruling_count,
      free: collection.free,
      principles: (principles || []).map((p: Record<string, unknown>) => {
        const paragraphs = p.principle_paragraphs as Record<string, unknown>[];
        return {
          id: p.id,
          number: p.principle_number,
          issuing_body: p.issuing_body,
          session_date: p.session_date,
          decision_number: p.decision_number,
          reference: p.reference,
          text: p.text,
          paragraphs: (paragraphs || [])
            .sort((a, b) => (a.order_index as number) - (b.order_index as number))
            .map((pg) => ({
              letter: pg.letter,
              text: pg.text,
              keywords: pg.keywords || [],
            })),
          details: {
            ruling_basis: p.ruling_basis,
            facts: p.facts,
            reasons: p.reasons,
            ruling: p.ruling,
          },
        };
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Precedents API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
