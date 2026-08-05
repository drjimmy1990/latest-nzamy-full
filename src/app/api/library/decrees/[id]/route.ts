import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';

/**
 * GET /api/library/decrees/[id]
 * Fetch a single decree/circular with all pages.
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
    const freeLimit = probe.freeLimit; // -1 = unlimited (whitelisted or Pro+)
    const hasFullAccess = freeLimit === -1 || isWhitelisted;

    // Fetch pages
    const { data: pages } = await supabase
      .schema('library')
      .from('decree_pages')
      .select('*')
      .eq('decree_id', id)
      .order('page_number', { ascending: true });

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
        freeLimit,
        hasFullAccess,
        totalItems: pages?.length ?? 0,
      },
      articles: (pages || []).map((p: Record<string, unknown>, idx: number) => {
        const content = p.content as string;
        const isLocked = !hasFullAccess && freeLimit !== -1 && idx >= freeLimit;
        if (isLocked && typeof content === 'string') {
          return content.substring(0, 200) + (content.length > 200 ? '...' : '');
        }
        return content;
      }),
      // Pages the client may render in full; the rest are truncated previews.
      unlockedCount: hasFullAccess ? (pages?.length ?? 0) : Math.min(freeLimit, pages?.length ?? 0),
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
