import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';

/**
 * GET /api/library/books/[slug]
 * Fetch a feqh book with complete TOC (chapters/sections) and paginated blocks.
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
    //
    // page_label / volume_label arrive with migration
    // 20260729_feqh_locator_labels.sql. PostgREST rejects the WHOLE query when a
    // selected column is missing, and this call site did not even destructure
    // `error` — so against a database without the migration every book would
    // have rendered as EMPTY, silently. Every variant below is therefore retried
    // rather than made a hard deploy-ordering dependency.
    //
    // ── How a book's blocks are selected ────────────────────────────────────
    // This used to collect EVERY section id for the book and pass them to
    // .in('section_id', [...]). Books hold hundreds to thousands of sections and
    // each id is a 36-char UUID, so the request URL blew past the length limit
    // and PostgREST answered 400. Nothing checked `error`, so the book simply
    // rendered as empty. Measured against production: 138 of 144 fiqh books were
    // affected — only 6 were small enough to work. Worst case is 2,069 sections
    // (الوسيط_ج2_الإثبات_آثار_الالتزام) → a ~36 KB URL.
    //
    // Three ways to scope to a book, tried in order:
    //   byBook   — feqh_blocks.book_id + idx_feqh_blocks_book_order. One indexed
    //              scan, no join. Needs migration 20260729_feqh_locator_labels.
    //   join     — filter through section → chapter → book. Needs no migration
    //              and keeps the URL at ~450 bytes, but it sorts with no usable
    //              index: measured 3.2s for a 954-block book against the 3s
    //              statement timeout the anon role runs under, so it succeeds
    //              for some books and returns 57014 for others.
    //   legacyIn — the original `section_id=in.(…)`, kept ONLY as a last resort
    //              and only while the id list still fits in a URL. It is what
    //              works today for the 6 small books, so keeping it guarantees
    //              this change cannot regress any book that currently renders.
    const offset = (page - 1) * limit;

    type BlocksResult = {
      data: Record<string, unknown>[] | null;
      count: number | null;
      error: { code?: string; message?: string } | null;
    };

    /** Section ids for this book — already in hand from the TOC query above. */
    const sectionIds = (chapters || []).flatMap((ch: Record<string, unknown>) => {
      const sections = ch.feqh_sections as Record<string, unknown>[];
      return (sections || []).map((s) => s.id as string);
    });
    // Binary-searched against production: 396 ids (~15 KB URL) is the largest
    // `section_id=in.(…)` that still succeeds; 397 is rejected. 350 leaves margin
    // for the rest of the query string and any proxy with a tighter limit.
    // This ceiling is the whole reason legacyIn is a last resort: books run to
    // 2,054 sections (المغني - الجزء 13), which no URL can carry.
    const LEGACY_IN_MAX_IDS = 350;

    type Scope = 'byBook' | 'join' | 'legacyIn';

    const runBlocksQuery = async (withLabels: boolean, scope: Scope): Promise<BlocksResult> => {
      const needsJoin = !sectionId && scope === 'join';

      let q = supabase
        .schema('library')
        .from('feqh_blocks')
        .select(`
          id, topic, volume_number, page_number,${withLabels ? ' page_label, volume_label,' : ''}
          matn, sharh, hashiyah, order_index, section_id
          ${needsJoin ? ', feqh_sections!inner ( feqh_chapters!inner ( book_id ) )' : ''}
        `, { count: 'exact' });

      if (sectionId) q = q.eq('section_id', sectionId);
      else if (scope === 'byBook') q = q.eq('book_id', slug);
      else if (scope === 'join') q = q.eq('feqh_sections.feqh_chapters.book_id', slug);
      else q = q.in('section_id', sectionIds);

      const res = await q
        .order('order_index', { ascending: true })
        .range(offset, offset + limit - 1);
      return res as unknown as BlocksResult;
    };

    // Each step retries on ANY error, not just code 42703: the same
    // missing-column rejection sometimes arrives as `{ message: 'Bad Request' }`
    // with no `code` at all, so matching on the code silently skipped the retry
    // and returned an empty book. Every fallback selects the same rows by a
    // different route, so retrying is always safe.
    const STRATEGIES: Array<{ labels: boolean; scope: Scope; note: string }> = sectionId
      ? [
          { labels: true,  scope: 'join', note: 'section' },
          { labels: false, scope: 'join', note: 'section, no labels' },
        ]
      : [
          { labels: true,  scope: 'byBook',   note: 'book_id + labels' },
          { labels: false, scope: 'byBook',   note: 'book_id, no labels' },
          { labels: true,  scope: 'join',     note: 'section join + labels' },
          { labels: false, scope: 'join',     note: 'section join, no labels' },
          ...(sectionIds.length > 0 && sectionIds.length <= LEGACY_IN_MAX_IDS
            ? [{ labels: false, scope: 'legacyIn' as Scope, note: 'legacy section_id IN list' }]
            : []),
        ];

    let blocks: Record<string, unknown>[] | null = null;
    let totalBlocks: number | null = null;
    let blocksError: { code?: string; message?: string } | null = null;

    for (const s of STRATEGIES) {
      const res = await runBlocksQuery(s.labels, s.scope);
      blocksError = res.error;
      if (!res.error) {
        blocks = res.data;
        totalBlocks = res.count;
        break;
      }
      console.warn(`[Books] blocks strategy "${s.note}" failed — falling back. Apply migration 20260729_feqh_locator_labels.sql for the single-scan fast path. Cause:`, res.error);
    }
    if (blocksError) {
      console.error(
        `[Books] every blocks strategy failed for "${slug}" (${sectionIds.length} sections). ` +
        `Apply migration 20260729_feqh_locator_labels.sql — without book_id the ordered read has no usable index. Last error:`,
        blocksError,
      );
    }

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
          // vol/page are now nullable: NULL means the source states no volume,
          // rather than the fabricated 1 the old parser wrote for every book.
          // The *Label fields carry the source's verbatim token, which is not
          // always a number — 887 volume tokens and 18 page tokens in the
          // corpus are things like "مقدمة" or "7-1".
          vol: b.volume_number ?? null,
          page: b.page_number ?? null,
          volLabel: b.volume_label ?? null,
          pageLabel: b.page_label ?? null,
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
