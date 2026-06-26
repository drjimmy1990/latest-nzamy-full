import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/library/laws/[slug]
 * Fetch a complete law with chapters, articles, regulations, and amendments.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Fetch law metadata
    const { data: law, error: lawError } = await supabase
      .schema('library')
      .from('laws')
      .select('*')
      .eq('slug', slug)
      .single();

    if (lawError || !law) {
      return NextResponse.json(
        { error: 'Law not found' },
        { status: 404 }
      );
    }

    // Fetch chapters
    const { data: chapters } = await supabase
      .schema('library')
      .from('chapters')
      .select('*')
      .eq('law_slug', slug)
      .order('order_index', { ascending: true });

    // Fetch articles with amendments
    const { data: articles } = await supabase
      .schema('library')
      .from('articles')
      .select(`
        *,
        article_amendments (*)
      `)
      .eq('law_slug', slug)
      .order('order_index', { ascending: true });

    // Group articles by chapter
    const chapterMap = new Map<string, typeof articles>();
    const ungroupedArticles: typeof articles = [];

    articles?.forEach((article: Record<string, unknown>) => {
      const chapterId = article.chapter_id as string;
      if (chapterId) {
        if (!chapterMap.has(chapterId)) {
          chapterMap.set(chapterId, []);
        }
        chapterMap.get(chapterId)!.push(article);
      } else {
        ungroupedArticles.push(article);
      }
    });

    // Build the response in the LawSystem format the frontend expects
    const lawSystem = {
      id: law.slug,
      slug: law.slug,
      title: law.title,
      titleEn: law.title_en || '',
      issuanceDecree: law.issuing_instrument || '',
      issuanceDate: law.issue_date_hijri || '',
      source: law.boe_source_url || '',
      preamble: law.preamble || '',
      chapters: (chapters || []).map((chapter: Record<string, unknown>) => {
        const chapterArticles = chapterMap.get(chapter.id as string) || [];
        return {
          title: chapter.title,
          articles: chapterArticles.map(formatArticle),
        };
      }),
    };

    // If there are ungrouped articles, add them as a default chapter
    if (ungroupedArticles.length > 0 && lawSystem.chapters.length === 0) {
      lawSystem.chapters.push({
        title: 'أحكام عامة',
        articles: ungroupedArticles.map(formatArticle),
      });
    }

    return NextResponse.json(lawSystem);
  } catch (error) {
    console.error('[Laws API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function formatArticle(article: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    id: article.id,
    num: article.number_text || `المادة ${article.number}`,
    title: article.title || '',
    status: article.status || 'active',
    free: article.free ?? true,
    text: article.text || '',
  };

  // Add executive regulation if present
  if (article.executive_reg_text) {
    result.executiveReg = {
      ref: article.executive_reg_ref || '',
      text: article.executive_reg_text,
    };
  }

  // Add amendments if present
  const amendments = article.article_amendments as Record<string, unknown>[];
  if (amendments && amendments.length > 0) {
    result.amendments = amendments.map((a) => ({
      date: a.date,
      source: a.source,
      type: a.type,
      summary: a.summary,
      fullText: a.full_text,
    }));
  }

  return result;
}
