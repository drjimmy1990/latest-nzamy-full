import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';

/**
 * GET /api/library/books/[slug]
 * Fetch a feqh book with complete TOC (chapters/sections) and paginated blocks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sectionId = searchParams.get('section_id'); // Optional: load blocks for specific section

    const supabase = await createClient();

    // Fetch book metadata
    const { data: book, error: bookError } = await supabase
      .schema('library')
      .from('feqh_books')
      .select('*')
      .eq('id', slug)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Check library access — probe once for freeLimit/tier, then gate EACH block
    // by its own order_index below. (Treating access.allowed as a document-level
    // gate unlocked the whole book for guests — the bug. order_index is
    // pagination- and section-filter-independent, unlike a per-page loop index.)
    const probe = await checkLibraryAccess(userId, slug, 0, "feqh");
    const isWhitelisted = probe.isWhitelisted;
    const freeLimit = probe.freeLimit; // -1 = unlimited (whitelisted or Pro+)
    const hasFullAccess = freeLimit === -1 || isWhitelisted;

    // Fetch full TOC (chapters with sections, no blocks for performance)
    const { data: chapters } = await supabase
      .schema('library')
      .from('feqh_chapters')
      .select(`
        id, title, volume_number, order_index,
        feqh_sections ( id, title, order_index )
      `)
      .eq('book_id', slug)
      .order('order_index', { ascending: true });

    // Fetch blocks (paginated, optionally filtered by section)
    let blocksQuery = supabase
      .schema('library')
      .from('feqh_blocks')
      .select(`
        id, topic, volume_number, page_number, matn, sharh, hashiyah, order_index,
        section_id
      `, { count: 'exact' });

    if (sectionId) {
      blocksQuery = blocksQuery.eq('section_id', sectionId);
    } else {
      // Get all blocks for this book via section → chapter → book join
      const sectionIds = (chapters || []).flatMap(
        (ch: Record<string, unknown>) => {
          const sections = ch.feqh_sections as Record<string, unknown>[];
          return (sections || []).map((s) => s.id as string);
        }
      );
      if (sectionIds.length > 0) {
        blocksQuery = blocksQuery.in('section_id', sectionIds);
      }
    }

    const offset = (page - 1) * limit;
    blocksQuery = blocksQuery
      .order('order_index', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: blocks, count: totalBlocks } = await blocksQuery;

    // Format response matching frontend interface
    const response = {
      id: book.id,
      title: book.title,
      author: book.author,
      school: book.school,
      type: book.type,
      category: book.category,
      description: book.description,
      investigator: book.investigator,
      totalVolumes: book.total_volumes,
      totalPages: book.total_pages,
      chapters: (chapters || [])
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => 
          (a.order_index as number) - (b.order_index as number))
        .map((ch: Record<string, unknown>) => {
          const sections = ch.feqh_sections as Record<string, unknown>[];
          return {
            id: ch.id,
            title: ch.title,
            volumeNumber: ch.volume_number,
            sections: (sections || [])
              .sort((a, b) => (a.order_index as number) - (b.order_index as number))
              .map((s) => ({
                id: s.id,
                title: s.title,
              })),
          };
        }),
      blocks: (blocks || []).map((b: Record<string, unknown>) => {
        // Gate on the block's own book-global order_index so locking is correct
        // across pagination pages and section-filtered loads.
        const isLocked =
          !hasFullAccess && freeLimit !== -1 && (b.order_index as number) >= freeLimit;
        return {
          id: b.id,
          topic: b.topic,
          vol: b.volume_number,
          page: b.page_number,
          matn: isLocked ? (typeof b.matn === 'string' ? b.matn.substring(0, 100) + (b.matn.length > 100 ? '...' : '') : b.matn) : b.matn,
          sharh: isLocked ? (typeof b.sharh === 'string' ? b.sharh.substring(0, 100) + (b.sharh.length > 100 ? '...' : '') : b.sharh) : b.sharh,
          hashiyah: isLocked ? null : b.hashiyah,
          sectionId: b.section_id,
          locked: isLocked,
        };
      }),
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalItems: totalBlocks || 0,
      },
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
      pagination: {
        page,
        limit,
        total: totalBlocks || 0,
        totalPages: Math.ceil((totalBlocks || 0) / limit),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Books API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
