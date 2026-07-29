import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';

/**
 * GET /api/library/laws/[slug]
 * Fetch a complete law with chapters, articles, regulations, and amendments.
 * Articles beyond the free limit are locked for non-Pro users.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const gate = await libraryGate();
  if (gate) return gate;

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

    // Extract combined regulation preamble if present
    let preamble = law.preamble || '';
    let regulationPreamble = '';
    if (preamble.includes('\n***\n')) {
      const parts = preamble.split('\n***\n');
      preamble = parts[0].trim();
      regulationPreamble = parts[1].trim();
    }

    // Build the response in the LawSystem format the frontend expects
    const lawSystem = {
      id: law.slug,
      slug: law.slug,
      title: law.title,
      titleEn: law.title_en || '',
      // The document's own kind ("نظام" / "لائحة تنفيذية" / "دليل إرشادي" …).
      // Only 526 of 1,532 documents in the corpus are a نظام, so the citation
      // builder needs the real value instead of assuming one.
      documentType: law.type || '',
      issuanceDecree: law.issuing_instrument || '',
      issuanceDate: law.issue_date_hijri || '',
      source: law.boe_source_url || '',
      preamble: preamble,
      regulationPreamble: regulationPreamble,
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

/** Preview length granted to a locked article's body text, in characters. */
const LOCKED_PREVIEW_CHARS = 100;

/**
 * Separate, looser cap for a locked article's TITLE.
 *
 * `library.articles.title` is unbounded `text`, and part of the corpus writes
 * statutory text into it rather than a heading — measured across 9,213 titled
 * articles: 56 exceed 120 characters, 6 exceed 300, and the longest is 531
 * characters of substantive text. Emitting it uncapped hands that text to a
 * locked reader regardless of the body preview. 120 leaves every genuine
 * heading intact (9,157 of 9,213 are shorter) while bounding the leak.
 */
const LOCKED_TITLE_CHARS = 120;

/**
 * The single truncation rule for every piece of statutory text a locked article
 * may return. It exists so `text` and `originalText` cannot drift apart: for a
 * repealed article `text` is empty and `originalText` carries the entire
 * substance, so truncating one but not the other would hand the full text of
 * 1,613 repealed articles to anonymous users.
 */
function preview(value: unknown, limit: number = LOCKED_PREVIEW_CHARS): string {
  const s = (value as string) || '';
  return s.substring(0, limit) + (s.length > limit ? '...' : '');
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
    // Raw locator parts, so a citation can be built from what the source
    // actually says instead of by regex-stripping the display label.
    number: article.number ?? null,
    numberText: article.number_text || '',
    // Capped when locked: part of the corpus writes statutory text into `title`
    // (longest measured: 531 chars), which would otherwise walk straight past
    // the body preview below.
    title: isLocked ? preview(article.title, LOCKED_TITLE_CHARS) : (article.title || ''),
    status: article.status || 'active',
    free: !isLocked,
    locked: isLocked,
    instrument: article.instrument || '',
  };

  // `original_text` is the article's superseded wording. For a REPEALED article
  // it is not supplementary — `text` is legitimately empty and this is the
  // article. It therefore goes through exactly the same paywall as `text`.
  const originalText = (article.original_text as string) || '';

  if (isLocked) {
    result.text = preview(article.text);
    if (originalText) result.originalText = preview(originalText);
    result.lockedMessage = 'يتطلب اشتراك Pro أو أعلى لعرض النص الكامل';
  } else {
    result.text = article.text || '';
    if (originalText) result.originalText = originalText;
  }

  // NOTE: `unparsed_details` is deliberately never emitted. It is quarantined
  // source content of unknown kind (see the column comment in
  // 20260729_article_history_columns.sql) and must not reach a reader.

  // Historic executive-regulation text — supplementary, so unlocked only.
  if (!isLocked && article.historic_regulation_text) {
    result.historicRegulationText = article.historic_regulation_text;
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
