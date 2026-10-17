import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { freeDecreePages } from '@/lib/library/freePages';

/**
 * GET /api/library/decrees/[id]
 * Fetch a single decree/circular with all pages.
 *
 * The page text (decree_pages.content) is server-only since migration
 * 20261018_02 (owner answer ١٨٣): it is read with the service role, and a
 * guest or free reader gets the first two pages in full (src/lib/library/
 * freePages.ts); every later page is sent as an empty string — no opening.
 * `unlockedCount` says how many leading pages carry their text.
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

    // Fetch decree metadata
    const { data: decree, error: decreeError } = await supabase
      .schema('library')
      .from('decrees_circulars')
      .select('*')
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
    const probe = await checkLibraryAccess(userId, id, 0, "decrees");
    const isWhitelisted = probe.isWhitelisted;
    const hasFullAccess = probe.freeLimit === -1 || isWhitelisted;

    // Fetch pages — service role: content is server-only (20261018_02). An
    // error is a 500, never a decree that silently has no pages.
    const serverOnly = await createServiceClient();
    const { data: pages, error: pagesError } = await serverOnly
      .schema('library')
      .from('decree_pages')
      .select('page_number, order_index, content')
      .eq('decree_id', id)
      .order('page_number', { ascending: true })
      .order('order_index', { ascending: true });
    if (pagesError || !Array.isArray(pages)) {
      console.error(`[Decrees API] pages query failed for "${id}":`, pagesError?.code ?? 'no-error-code', pagesError?.message ?? 'null payload');
      return NextResponse.json({ error: 'تعذّر تحميل صفحات هذا القرار' }, { status: 500 });
    }
    // How many leading pages carry their text: all (Pro+, whitelisted), an
    // admin override, or the owner's first two pages.
    const free = freeDecreePages(probe, pages.length);
    const unlockedCount = free === -1 ? pages.length : Math.min(free, pages.length);

    // Format response matching frontend DemoOrder interface
    const response = {
      id: decree.id,
      title: decree.title,
      type: decree.type,
      issuer: decree.issuer,
      ref: decree.ref,
      date: decree.date,
      summary: decree.summary,
      summary_brief: decree.summary_brief,
      cat: decree.category,
      preamble: decree.preamble || '',
      paywall: {
        isWhitelisted,
        freeLimit: free,
        hasFullAccess,
        totalItems: pages.length,
      },
      // A locked page is an empty string: the reader shows a lock card for
      // every page at or past unlockedCount.
      articles: pages.map((p: Record<string, unknown>, idx: number) =>
        idx < unlockedCount && typeof p.content === 'string' ? p.content : ''),
      unlockedCount,
      hashtags: decree.hashtags || [],
      official_url: decree.official_url || '',
      hasAccess: hasFullAccess, // legacy field kept for existing client checks
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Decrees API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
