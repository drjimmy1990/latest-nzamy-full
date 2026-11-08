import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkLibraryAccess, hasFullLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { freeDecreePages } from '@/lib/library/freePages';
import { withCleanCardRows } from '@/lib/library/lawSummaryVisibility';
import { summaryForViewer } from '@/lib/library/legislativeEvent';
import { maskDecreeOfficialFields, TIER_SHAPED_CACHE_CONTROL } from '../../laws/[slug]/_official-meta';

/**
 * The decree's header columns. Read with the SERVICE ROLE since migration
 * 20261108_10: ref, date, official_url, summary and summary_brief are
 * server-only (owner ٤٢٤ / ٣٨٠ / ٣١٩) and masked per tier below. The preamble
 * is read separately (20261019_40); `*` is never selected.
 */
const DECREE_COLUMNS = 'id, title, type, issuer, ref, date, summary, summary_brief, category, hashtags, official_url';

/**
 * GET /api/library/decrees/[id]
 * Fetch a single decree/circular with all pages.
 *
 * The page text (decree_pages.content) is server-only since migration
 * 20261018_02 (owner answer ١٨٣): it is read with the service role, and a
 * guest or free reader gets the first two pages in full (src/lib/library/
 * freePages.ts); every later page is sent as an empty string — no opening.
 * `unlockedCount` says how many leading pages carry their text.
 *
 * The preamble (decrees_circulars.preamble) is server-only since migration
 * 20261019_40 (owner answer ٢٢١): it is read with the service role and sent
 * only to full library access (hasFullLibraryAccess: Pro+, an active library
 * grant, or an admin — never the free-item whitelist, the rule for a law's
 * official metadata). Everyone else gets `preamble: ''`, and
 * `preambleLocked: true` when the decree has one (the reader's lock card).
 *
 * Owner ٢٥٩ (أ): the reader prints the preamble as it is, its identity card
 * included, so a subscriber's preamble goes out with the card rows the law
 * card shows (withCleanCardRows): no «المصدر الرسمي => غير متوفر …», no
 * placeholder or file row. The lock is decided on the stored preamble.
 *
 * Owner ٤٢٤ (2026-11-07, confirming ٣٨٠): the decree's number (`ref`), its
 * date and its official link are a subscriber's, like a law's (T28-22 /
 * ٣١٨) — the same isSubscriber test as the preamble. Everyone else gets ''
 * for the three and `officialMetaLocked: true` (maskDecreeOfficialFields).
 * The two free scanned pages stay as they are (owner ٤٤٩ pending).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const { id } = await params;
    const supabase = await createClient();
    // Service role: the header's number, date, link and summaries are
    // server-only (20261108_10), the pages and the preamble too (20261018_02,
    // 20261019_40). Every value is masked per tier below.
    const serverOnly = await createServiceClient();

    // Fetch decree metadata (named columns: `*` needs the locked preamble)
    const { data: decree, error: decreeError } = await serverOnly
      .schema('library')
      .from('decrees_circulars')
      .select(DECREE_COLUMNS)
      .eq('id', id)
      .single();

    if (decreeError || !decree) {
      return NextResponse.json({ error: 'Decree not found' }, { status: 404 });
    }

    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Check library access — probe once for freeLimit/tier, then gate EACH page
    // by its own index below. (Probing at index 0 and treating access.allowed as
    // a document-level gate unlocked the whole decree for guests — the bug.)
    // The subscriber flag (the preamble, owner ٢٢١) is read alongside it.
    const [probe, isSubscriber] = await Promise.all([
      checkLibraryAccess(userId, id, 0, "decrees"),
      hasFullLibraryAccess(userId),
    ]);
    const isWhitelisted = probe.isWhitelisted;
    const hasFullAccess = probe.freeLimit === -1 || isWhitelisted;

    // Fetch pages and the preamble — service role: both are server-only
    // (20261018_02, 20261019_40). An error is a 500, never a decree that
    // silently has no pages or no preamble.
    const [{ data: pages, error: pagesError }, { data: preambleRow, error: preambleError }] = await Promise.all([
      serverOnly
        .schema('library')
        .from('decree_pages')
        .select('page_number, order_index, content')
        .eq('decree_id', id)
        .order('page_number', { ascending: true })
        .order('order_index', { ascending: true }),
      serverOnly
        .schema('library')
        .from('decrees_circulars')
        .select('preamble')
        .eq('id', id)
        .maybeSingle(),
    ]);
    if (pagesError || !Array.isArray(pages)) {
      console.error(`[Decrees API] pages query failed for "${id}":`, pagesError?.code ?? 'no-error-code', pagesError?.message ?? 'null payload');
      return NextResponse.json({ error: 'تعذّر تحميل صفحات هذا القرار' }, { status: 500 });
    }
    if (preambleError) {
      console.error(`[Decrees API] preamble query failed for "${id}":`, preambleError.code ?? 'no-error-code', preambleError.message);
      return NextResponse.json({ error: 'تعذّر تحميل هذا القرار' }, { status: 500 });
    }
    const preamble = typeof preambleRow?.preamble === 'string' ? preambleRow.preamble : '';
    // How many leading pages carry their text: all (Pro+, whitelisted), an
    // admin override, or the owner's first two pages.
    const free = freeDecreePages(probe, pages.length);
    const unlockedCount = free === -1 ? pages.length : Math.min(free, pages.length);

    // Format response matching frontend DemoOrder interface. Owner ٤٢٤: the
    // number, date and official link are masked for a non-subscriber.
    const official = maskDecreeOfficialFields(
      { ref: decree.ref || '', date: decree.date || '', official_url: decree.official_url || '' },
      isSubscriber,
    );
    const response = {
      id: decree.id,
      title: decree.title,
      type: decree.type,
      issuer: decree.issuer,
      ref: official.ref,
      date: official.date,
      // Owner ٤٢٤ / ٣٨٠ (the laws' ٣١٩ rule): a non-subscriber's موجز and
      // summary lose their decree numbers and dates. The title is unchanged.
      summary: typeof decree.summary === 'string' ? summaryForViewer(decree.summary, isSubscriber) : decree.summary,
      summary_brief: typeof decree.summary_brief === 'string' ? summaryForViewer(decree.summary_brief, isSubscriber) : decree.summary_brief,
      cat: decree.category,
      // Owner answer ٢٢١: the text for subscribers; for everyone else nothing,
      // and a lock card when there is a preamble to lock.
      preamble: isSubscriber ? withCleanCardRows(preamble) : '',
      preambleLocked: !isSubscriber && preamble.trim() !== '',
      paywall: {
        isWhitelisted,
        freeLimit: free,
        hasFullAccess,
        totalItems: pages.length,
      },
      // A locked page is an empty string: the reader shows a lock card for
      // every page at or past unlockedCount. A page that opens with the card
      // (a file with no ARTICLE_START: its whole body is page 1) has its rows
      // cleaned like the preamble's (owner ٢٥٩) — after the lock decision.
      articles: pages.map((p: Record<string, unknown>, idx: number) =>
        idx < unlockedCount && typeof p.content === 'string' ? withCleanCardRows(p.content) : ''),
      unlockedCount,
      hashtags: decree.hashtags || [],
      official_url: official.official_url,
      // The page shows a «للمشتركين» row in place of the number and date —
      // only when the decree has one of them to lock (like preambleLocked).
      officialMetaLocked: !isSubscriber && Boolean(decree.ref || decree.date || decree.official_url),
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
    };

    // Tier-shaped (the preamble and the pages): never cached for anyone else.
    return NextResponse.json(response, { headers: { 'Cache-Control': TIER_SHAPED_CACHE_CONTROL } });
  } catch (error) {
    console.error('[Decrees API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
