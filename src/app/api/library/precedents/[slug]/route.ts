import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';

/**
 * GET /api/library/precedents/[slug]
 * Fetch a judicial principles collection with all principles and paragraphs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const gate = await libraryGate();
  if (gate) return gate;

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

    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Check library access — probe once for freeLimit/tier, then gate EACH
    // principle by its own enumeration index below. (Probing at index 0 and
    // treating access.allowed as a document-level gate unlocked the whole
    // collection for guests — the bug.)
    const probe = await checkLibraryAccess(userId, slug, 0, "principles");
    const isWhitelisted = probe.isWhitelisted;
    const freeLimit = probe.freeLimit; // -1 = unlimited (whitelisted or Pro+)
    const hasFullAccess = freeLimit === -1 || isWhitelisted;

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
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalItems: principles?.length ?? 0,
      },
      principles: (principles || []).map((p: Record<string, unknown>, idx: number) => {
        const isLocked = !hasFullAccess && freeLimit !== -1 && idx >= freeLimit;
        const paragraphs = p.principle_paragraphs as Record<string, unknown>[];
        const truncate = (val: unknown, len: number) =>
          typeof val === 'string'
            ? val.substring(0, len) + (val.length > len ? '...' : '')
            : val;
        return {
          id: p.id,
          number: p.principle_number,
          issuing_body: p.issuing_body,
          session_date: p.session_date,
          decision_number: p.decision_number,
          reference: p.reference,
          text: isLocked ? truncate(p.text, 150) : p.text,
          locked: isLocked,
          lockedMessage: isLocked ? 'يتطلب اشتراك Pro أو أعلى لعرض المبدأ كاملاً' : undefined,
          // Locked principles: paragraphs & details are withheld from the payload.
          paragraphs: isLocked
            ? []
            : (paragraphs || [])
                .sort((a, b) => (a.order_index as number) - (b.order_index as number))
                .map((pg) => ({
                  letter: pg.letter,
                  text: pg.text,
                  keywords: pg.keywords || [],
                })),
          details: isLocked ? null : {
            ruling_basis: p.ruling_basis,
            facts: p.facts,
            reasons: p.reasons,
            ruling: p.ruling,
          },
        };
      }),
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Precedents API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
