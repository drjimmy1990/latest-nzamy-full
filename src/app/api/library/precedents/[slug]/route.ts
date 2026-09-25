import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess, getLibraryAccessForUser } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { isFreeLibraryItem } from '@/lib/library-item-access';
import { isPrincipleLocked, planPrincipleWindow } from './_window';

/**
 * GET /api/library/precedents/[slug]?offset=0&limit=100
 * A judicial principles collection plus ONE window of its principles.
 *
 * The principles used to come back from one unranged select, which PostgREST
 * silently caps at max-rows (1000): «mabadi-qararat-qanuniya» holds 2,323
 * principles and its page showed 1,000, with no error anywhere. A full
 * collection with text is also ~1.5 MB, so the list is windowed instead:
 *   - `offset` + `limit` pick the window (limit 1..500, default 100);
 *     `page` is still accepted and means offset = (page - 1) * limit.
 *   - `total` / `pagination.total` is the exact count, so the page knows when
 *     it has everything (it loads more on scroll, and all of it on search).
 * The paywall is enforced per principle by its GLOBAL index (offset + i), so a
 * later window never re-unlocks the free first N.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const { offset, limit } = planPrincipleWindow(searchParams);
    const supabase = await createClient();

    // Fetch collection metadata
    const { data: collection, error: collError } = await supabase
      .schema('library')
      .from('judicial_collections')
      .select('*')
      .eq('id', slug)
      .maybeSingle();

    if (collError) {
      console.error('[Precedents API] collection lookup failed:', collError);
      return NextResponse.json({ error: 'تعذّر تحميل مجموعة المبادئ' }, { status: 500 });
    }
    if (!collection) {
      return NextResponse.json({ error: 'لم يُعثر على مجموعة المبادئ هذه' }, { status: 404 });
    }

    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Check library access — probe once for freeLimit/tier, then gate EACH
    // principle by its own enumeration index below. (Probing at index 0 and
    // treating access.allowed as a document-level gate unlocked the whole
    // collection for guests — the bug.)
    // The collection is only a container. Its ID must not stand in for a
    // principle ID in library_free_items.principles, so retain first-N policy
    // while evaluating explicit free access for every principle below.
    const probe = await checkLibraryAccess(userId, slug, 0, "principles", { includeExplicitFreeItem: false });
    const { hasFullAccess, freeItemsByType, whitelistedSlugs } = await getLibraryAccessForUser(userId);
    const isWhitelisted = false;
    const freeLimit = probe.freeLimit; // -1 = unlimited (whitelisted or Pro+)

    // Fetch one window of principles with paragraphs. Explicit columns: `*`
    // dragged the fts tsvector along for every row.
    const principlesQuery = await supabase
      .schema('library')
      .from('principles')
      .select(`
        id, principle_number, issuing_body, session_date, decision_number,
        reference, text, ruling_basis, facts, reasons, ruling,
        classification_keywords, order_index,
        principle_paragraphs ( letter, text, keywords, order_index )
      `, { count: 'exact' })
      .eq('collection_id', slug)
      .order('order_index', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    let principles = principlesQuery.data as Record<string, unknown>[] | null;
    let total = principlesQuery.count;
    if (principlesQuery.error) {
      // PGRST103 = offset past the end: an empty window, not a failure.
      if (principlesQuery.error.code === 'PGRST103') {
        const head = await supabase
          .schema('library')
          .from('principles')
          .select('id', { count: 'exact', head: true })
          .eq('collection_id', slug);
        if (head.error) {
          console.error('[Precedents API] principle count failed:', head.error);
          return NextResponse.json({ error: 'تعذّر تحميل مبادئ هذه المجموعة' }, { status: 500 });
        }
        principles = [];
        total = head.count;
      } else {
        console.error('[Precedents API] principles query failed:', principlesQuery.error);
        return NextResponse.json({ error: 'تعذّر تحميل مبادئ هذه المجموعة' }, { status: 500 });
      }
    }
    const totalCount = total ?? offset + (principles?.length ?? 0);

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
        totalItems: totalCount,
      },
      total: totalCount,
      pagination: {
        offset,
        limit,
        total: totalCount,
        hasMore: offset + (principles?.length ?? 0) < totalCount,
      },
      principles: (principles || []).map((p: Record<string, unknown>, idx: number) => {
        const isFree = isFreeLibraryItem({
          contentType: 'principles',
          itemId: p.id as string,
          hasFullAccess,
          freeItemsByType,
          whitelistedLawSlugs: whitelistedSlugs,
        });
        // The GLOBAL position in the collection, not the index in this window.
        const isLocked = isPrincipleLocked(isFree, freeLimit, offset + idx);
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
          // The page indexes and searches on this; it was never sent, so the
          // page threw on `.slice` of undefined.
          classification_keywords: Array.isArray(p.classification_keywords)
            ? (p.classification_keywords as unknown[]).filter((k): k is string => typeof k === 'string')
            : [],
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
    return NextResponse.json({ error: 'تعذّر تحميل مجموعة المبادئ' }, { status: 500 });
  }
}
