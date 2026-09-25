import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { selectAllPages } from '@/lib/supabase/selectAllPages';
import { firstBlockOrderBySection, normalizeHashiyah, planBlocksPage, planBlocksRequest, shapeToc } from './_shape';

/**
 * GET /api/library/books/[slug]
 * Fetch a feqh book with complete TOC (chapters/sections) and paginated blocks.
 *
 * Query:
 *   page, limit   — the blocks window (limit 1..500, default 50).
 *   section_id    — only that section's blocks (it must belong to this book;
 *                   a non-uuid is a 400).
 *   from_order=N  — reading-order cursor: `limit` blocks with order_index >= N.
 *   before_order=N— reading-order cursor: `limit` blocks with order_index <= N,
 *                   returned in book order. Cursor responses carry
 *                   pagination.hasMore and no totals.
 *   toc=0         — skip the TOC; the reader sends it when it opens a section,
 *                   since it already holds the TOC from the first request.
 *
 * The TOC used to be one unranged select, which PostgREST caps at max-rows
 * (1000) without an error: «مطالب أولي النهى … الجزء 01» has 4,860 chapters and
 * its TOC stopped at 1,000; 26 of 185 books were cut. It is now walked in
 * windows with selectAllPages (5 windows / ~1.3s for that book).
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
    const { page, limit, offset } = planBlocksPage(searchParams);
    // section_id is a uuid column: a malformed one used to run all four query
    // strategies, fail each with 22P02 and come back as a 500 blaming a
    // missing migration. It is a client error — say so before any query.
    const plan = planBlocksRequest(searchParams);
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: 400 });
    }
    const { sectionId, selection } = plan; // sectionId: optional, one section's blocks
    const isCursor = selection.mode !== 'page';
    const includeToc = searchParams.get('toc') !== '0';

    const supabase = await createClient();

    // Fetch book metadata
    const { data: book, error: bookError } = await supabase
      .schema('library')
      .from('feqh_books')
      .select('*')
      .eq('id', slug)
      .maybeSingle();

    if (bookError) {
      console.error('[Books API] book lookup failed:', bookError);
      return NextResponse.json({ error: 'تعذّر تحميل الكتاب' }, { status: 500 });
    }
    if (!book) {
      return NextResponse.json({ error: 'لم يُعثر على هذا الكتاب' }, { status: 404 });
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

    // Full TOC (chapters with sections, no blocks for performance), walked in
    // windows so a book past 1,000 chapters is not silently cut. The order's
    // last key (id) is unique, which selectAllPages needs to page without
    // overlap. The embedded sections are not capped: max-rows applies to the
    // top-level rows only.
    let chapters: Record<string, unknown>[] = [];
    if (includeToc) {
      const toc = await selectAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .schema('library')
          .from('feqh_chapters')
          .select(`
            id, title, volume_number, order_index,
            feqh_sections ( id, title, order_index )
          `)
          .eq('book_id', slug)
          .order('order_index', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (toc.error) {
        console.error(`[Books API] TOC query failed for "${slug}":`, toc.error);
        return NextResponse.json({ error: 'تعذّر تحميل فهرس هذا الكتاب' }, { status: 500 });
      }
      chapters = toc.data;
    }

    // Sections within a chapter are ordered by their OWN FIRST BLOCK's
    // order_index (real book/reading order) — not by feqh_sections.order_index,
    // which the TOC query above still returns but which 78,303 of 139,404
    // sections carry only as the sentinel 999 for. «السابق/التالي» already
    // walks the book by block order_index (see the cursor logic below), so
    // sorting the sidebar by the sentinel put a section out of step with it:
    // opening a section highlighted one block while stepping "next" from it
    // landed somewhere else, and the sidebar's own highlight visibly jumped
    // once paging forward revealed the section's true position.
    //
    // This is one extra per-book lookup of {id, section_id, order_index} —
    // two real columns, walked in windows like the TOC — over the same
    // book_id index the blocks query below uses (byBook), with the same
    // join fallback for a database missing that column. It is best-effort:
    // on any failure the TOC just falls back to feqh_sections.order_index
    // (shapeToc's previous behaviour) instead of failing the whole request —
    // sidebar order is a display nicety, not worth a 500 over.
    let firstBlockOrder: Record<string, number> | undefined;
    if (includeToc && chapters.length > 0) {
      const runSectionOrderQuery = (scope: 'byBook' | 'join') =>
        selectAllPages<Record<string, unknown>>((from, to) => {
          let q = supabase
            .schema('library')
            .from('feqh_blocks')
            .select(
              scope === 'join'
                ? 'id, section_id, order_index, feqh_sections!inner ( feqh_chapters!inner ( book_id ) )'
                : 'id, section_id, order_index',
            );
          q = scope === 'byBook'
            ? q.eq('book_id', slug)
            : q.eq('feqh_sections.feqh_chapters.book_id', slug);
          // The join variant's select string is built from a ternary, so the
          // client's static select-string parser cannot type it — same as
          // runBlocksQuery below, cast to what selectAllPages needs.
          return q.order('order_index', { ascending: true }).order('id', { ascending: true }).range(from, to) as unknown as
            Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
        });
      for (const scope of ['byBook', 'join'] as const) {
        const res = await runSectionOrderQuery(scope);
        if (!res.error) {
          firstBlockOrder = firstBlockOrderBySection(res.data);
          break;
        }
        console.warn(`[Books] section-order lookup ("${scope}") failed for "${slug}" — TOC falls back to feqh_sections.order_index:`, res.error);
      }
    }

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
    //
    // A section_id request is ALSO scoped to this book (byBook, or the join as a
    // fallback). It used to filter on section_id alone, so a section of another
    // book, requested under this book's slug, was served under THIS book's
    // paywall — a free or whitelisted book opened any other book's text.
    type BlocksResult = {
      data: Record<string, unknown>[] | null;
      count: number | null;
      error: { code?: string; message?: string } | null;
    };

    /** Section ids for this book — already in hand from the TOC query above. */
    const sectionIds = chapters.flatMap((ch: Record<string, unknown>) => {
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
      const needsJoin = scope === 'join';

      let q = supabase
        .schema('library')
        .from('feqh_blocks')
        .select(`
          id, topic, volume_number, page_number,${withLabels ? ' page_label, volume_label,' : ''}
          matn, sharh, hashiyah, order_index, section_id
          ${needsJoin ? ', feqh_sections!inner ( feqh_chapters!inner ( book_id ) )' : ''}
        `, isCursor ? undefined : { count: 'exact' });

      if (sectionId) q = q.eq('section_id', sectionId);
      if (scope === 'byBook') q = q.eq('book_id', slug);
      else if (scope === 'join') q = q.eq('feqh_sections.feqh_chapters.book_id', slug);
      else q = q.in('section_id', sectionIds);

      if (selection.mode === 'page') {
        const res = await q
          .order('order_index', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1);
        return res as unknown as BlocksResult;
      }
      // Cursor: one row past `limit` tells whether more follow in that direction.
      const ascending = selection.mode === 'after';
      q = ascending ? q.gte('order_index', selection.order) : q.lte('order_index', selection.order);
      const res = await q
        .order('order_index', { ascending })
        .order('id', { ascending })
        .range(0, limit);
      return res as unknown as BlocksResult;
    };

    /**
     * The exact block count for the same scope — used when the page is past
     * the end (PGRST103), which otherwise reported a 4,031-block book as 0.
     */
    const countBlocks = async (scope: Scope): Promise<{ count: number | null; error: unknown }> => {
      let q = supabase
        .schema('library')
        .from('feqh_blocks')
        .select(
          scope === 'join' ? 'id, feqh_sections!inner ( feqh_chapters!inner ( book_id ) )' : 'id',
          { count: 'exact', head: true },
        );
      if (sectionId) q = q.eq('section_id', sectionId);
      if (scope === 'byBook') q = q.eq('book_id', slug);
      else if (scope === 'join') q = q.eq('feqh_sections.feqh_chapters.book_id', slug);
      else q = q.in('section_id', sectionIds);
      const res = await q;
      return { count: res.count ?? null, error: res.error };
    };

    // Each step retries on ANY error, not just code 42703: the same
    // missing-column rejection sometimes arrives as `{ message: 'Bad Request' }`
    // with no `code` at all, so matching on the code silently skipped the retry
    // and returned an empty book. Every fallback selects the same rows by a
    // different route, so retrying is always safe.
    const STRATEGIES: Array<{ labels: boolean; scope: Scope; note: string }> = sectionId
      ? [
          { labels: true,  scope: 'byBook', note: 'section + book_id + labels' },
          { labels: false, scope: 'byBook', note: 'section + book_id, no labels' },
          { labels: true,  scope: 'join',   note: 'section + join + labels' },
          { labels: false, scope: 'join',   note: 'section + join, no labels' },
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
    /** A column/relation missing on this database (the migration case) — vs any other failure. */
    const looksLikeSchemaGap = (e: { code?: string; message?: string }) =>
      e.code === '42703' || e.code === 'PGRST200' || e.code === 'PGRST204' ||
      /column|does not exist|relationship|Bad Request/i.test(e.message ?? '');
    let sawSchemaGap = false;

    for (const s of STRATEGIES) {
      const res = await runBlocksQuery(s.labels, s.scope);
      blocksError = res.error;
      if (!res.error) {
        blocks = res.data;
        totalBlocks = res.count;
        break;
      }
      // PGRST103: the page is past the end — an empty window, not a failure.
      // The query itself was valid under this scope, so count the same scope
      // for the real totals instead of reporting 0.
      if (res.error.code === 'PGRST103') {
        const head = await countBlocks(s.scope);
        if (head.error) {
          console.error(`[Books] block count failed for "${slug}":`, head.error);
          return NextResponse.json({ error: 'تعذّر تحميل نصوص هذا الكتاب' }, { status: 500 });
        }
        blocksError = null;
        blocks = [];
        totalBlocks = head.count;
        break;
      }
      // Invalid input (22P02) cannot succeed under another scope either.
      if (res.error.code === '22P02') break;
      if (looksLikeSchemaGap(res.error)) sawSchemaGap = true;
      console.warn(`[Books] blocks strategy "${s.note}" failed — falling back. Cause:`, res.error);
    }
    if (blocksError) {
      console.error(
        `[Books] every blocks strategy failed for "${slug}" (${sectionIds.length} sections).` +
        (sawSchemaGap
          ? ' A column is missing: apply migration 20260729_feqh_locator_labels.sql — without book_id the ordered read has no usable index.'
          : '') +
        ' Last error:',
        blocksError,
      );
      // Never an empty 200: the reader would show a blank book as if it had no text.
      return NextResponse.json({ error: 'تعذّر تحميل نصوص هذا الكتاب' }, { status: 500 });
    }

    // Cursor windows: the extra row only signals that more follow; the
    // descending (before) window is turned back into book order.
    let hasMore: boolean | null = null;
    if (isCursor && blocks) {
      hasMore = blocks.length > limit;
      blocks = blocks.slice(0, limit);
      if (selection.mode === 'before') blocks.reverse();
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
      chapters: shapeToc(chapters, firstBlockOrder),
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
          // Always a list: the column is `{}` for every current row.
          hashiyah: isLocked ? [] : normalizeHashiyah(b.hashiyah),
          sectionId: b.section_id,
          orderIndex: b.order_index,
          locked: isLocked,
        };
      }),
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        // A cursor window is not counted (the count would be of the window's
        // filter, not the book): null rather than a wrong number.
        totalItems: isCursor ? null : totalBlocks || 0,
      },
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
      pagination: selection.mode !== 'page'
        ? { mode: selection.mode, order: selection.order, limit, hasMore }
        : {
            page,
            limit,
            total: totalBlocks || 0,
            totalPages: Math.ceil((totalBlocks || 0) / limit),
          },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Books API] Error:', error);
    return NextResponse.json({ error: 'تعذّر تحميل الكتاب' }, { status: 500 });
  }
}
