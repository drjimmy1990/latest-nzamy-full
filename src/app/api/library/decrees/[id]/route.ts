import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';

/**
 * GET /api/library/decrees/[id]
 * Fetch a single decree/circular with all pages.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Check library access
    const access = await checkLibraryAccess(userId, id, 0, "decrees");
    const hasAccess = access.allowed || access.isWhitelisted;

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
      articles: (pages || []).map((p: Record<string, unknown>) => {
        const content = p.content as string;
        if (!hasAccess && typeof content === 'string' && content.length > 200) {
          return content.substring(0, 200) + '...';
        }
        return content;
      }),
      hashtags: decree.hashtags || [],
      official_url: decree.official_url || '',
      hasAccess,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Decrees API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
