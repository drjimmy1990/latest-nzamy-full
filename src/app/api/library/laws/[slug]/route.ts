import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';

/**
 * GET /api/library/laws/[slug]
 * Fetch a complete law with chapters, articles, regulations, and amendments.
 * Articles beyond the free limit are locked for non-Pro users.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // ── Auth check (optional — guest users get free-tier access) ────────────
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Guest user — continue with null userId
    }

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

    // ── Paywall check ────────────────────────────────────────────────────────
    // Check access once (same result for all articles in a law)
    const firstLockedCheck = await checkLibraryAccess(userId, slug, 0);
    const isWhitelisted = firstLockedCheck.isWhitelisted;
    const freeLimit = firstLockedCheck.freeLimit;
    const hasFullAccess = firstLockedCheck.currentTier === 'pro' ||
                          firstLockedCheck.currentTier === 'max' ||
                          firstLockedCheck.currentTier === 'corp' ||
                          firstLockedCheck.currentTier === 'enterprise' ||
                          isWhitelisted;

    // Group articles by chapter
    const chapterMap = new Map<string, typeof articles>();
    const ungroupedArticles: typeof articles = [];
    let articleGlobalIndex = 0;

    articles?.forEach((article: Record<string, unknown>) => {
      const chapterId = article.chapter_id as string;
      // Tag each article with its global index for paywall check
      (article as Record<string, unknown>).__globalIndex = articleGlobalIndex++;
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
      // Paywall metadata for frontend
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalArticles: articles?.length ?? 0,
      },
      chapters: (chapters || []).map((chapter: Record<string, unknown>) => {
        const chapterArticles = chapterMap.get(chapter.id as string) || [];
        return {
          title: chapter.title,
          articles: chapterArticles.map((a) => formatArticleWithPaywall(a, hasFullAccess, freeLimit)),
        };
      }),
    };

    // If there are ungrouped articles, add them as a default chapter
    if (ungroupedArticles.length > 0 && lawSystem.chapters.length === 0) {
      lawSystem.chapters.push({
        title: 'أحكام عامة',
        articles: ungroupedArticles.map((a) => formatArticleWithPaywall(a, hasFullAccess, freeLimit)),
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

function formatArticleWithPaywall(
  article: Record<string, unknown>,
  hasFullAccess: boolean,
  freeLimit: number,
) {
  const globalIndex = (article.__globalIndex as number) ?? 0;
  // freeLimit === -1 means unlimited (whitelisted law)
  const isLocked = !hasFullAccess && freeLimit !== -1 && globalIndex >= freeLimit;

  const result: Record<string, unknown> = {
    id: article.id,
    num: article.number_text || `المادة ${article.number}`,
    title: article.title || '',
    status: article.status || 'active',
    free: article.free ?? true,
    locked: isLocked,
  };

  if (isLocked) {
    // Return truncated text for locked articles (first 100 chars + hint)
    const fullText = (article.text as string) || '';
    result.text = fullText.substring(0, 100) + (fullText.length > 100 ? '...' : '');
    result.lockedMessage = 'يتطلب اشتراك Pro أو أعلى لعرض النص الكامل';
  } else {
    result.text = article.text || '';
  }

  // Add executive regulation if present (only for unlocked articles)
  if (!isLocked && article.executive_reg_text) {
    result.executiveReg = {
      ref: article.executive_reg_ref || '',
      text: article.executive_reg_text,
    };
  }

  // Add amendments if present (only for unlocked articles)
  if (!isLocked) {
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
  }

  return result;
}
