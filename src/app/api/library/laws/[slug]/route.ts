import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkLibraryAccess } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { lawStatusForDetail } from '@/app/laws/law-status';
import { resolveParentLawLink, type ParentLawCandidate } from './_resolve-parent-law';
import { orderLawChapters } from './_order-chapters';
import { selectAllPages } from '@/lib/supabase/selectAllPages';

/**
 * Rows per articles window. Below the 1000-row max-rows on purpose: every
 * window is one statement under the anon role's ~3s statement_timeout, and an
 * article row drags its amendments and regulations along. Measured on the
 * largest law (1,838 articles): a 1000-row window took ~2.1s end to end, a
 * 500-row window ~1.4s.
 */
const ARTICLES_PAGE_SIZE = 500;

/** PostgREST error fields worth logging; selectAllPages types only `message`. */
type PgErrorParts = { code?: string; details?: string };

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
        { error: 'لم يُعثر على هذا النظام' },
        { status: 404 }
      );
    }

    // parent_law_id is an INSTRUMENTS_REGISTRY instrument id, not a BOE
    // law_guid. Limit to two rows because the resolver needs only to prove
    // uniqueness; on ambiguity it deliberately returns no hyperlink.
    let parentLawLink: { slug: string; title: string } | null = null;
    const parentInstrumentId = String(law.parent_law_id || '').trim();
    if (parentInstrumentId) {
      const { data: parentCandidates, error: parentError } = await supabase
        .schema('library')
        .from('laws')
        .select('slug,title,status,type,instrument_id')
        .eq('instrument_id', parentInstrumentId)
        .limit(2);
      if (parentError) {
        console.warn('[Laws API] Parent-law lookup failed closed:', parentError.message);
      } else {
        parentLawLink = resolveParentLawLink(
          slug,
          parentInstrumentId,
          parentCandidates as ParentLawCandidate[] | null,
        );
      }
    }

    // Fetch chapters.
    //
    // LIB-04 (2026-09-25): PostgREST answers an unranged select with at most
    // max-rows (1000) rows and no error, so both lists below are walked in
    // .range() windows by selectAllPages. The order ends on `id` because the
    // windows are only disjoint and gap-free under a total order, and nothing
    // constrains order_index to be unique within a law.
    const { data: chapters, error: chaptersError } = await selectAllPages<Record<string, unknown>>(
      (from, to) => supabase
        .schema('library')
        .from('chapters')
        .select('*')
        .eq('law_slug', slug)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );

    // A-04 (2026-09-22): exactly the failure class the articles guard below
    // exists to close, three lines earlier. A failed chapters query arrives as
    // `chapters === null`, `(chapters || [])` at the response build then yields
    // ZERO chapters, and the ungrouped-articles fallback does NOT rescue it —
    // that fallback only fires when the articles carry no chapter_id at all. So
    // the route would again answer 200 with a law that has no text in it.
    if (chaptersError || !Array.isArray(chapters)) {
      console.error(
        `[Laws API] Chapters query failed for "${slug}":`,
        (chaptersError as PgErrorParts | null)?.code ?? 'no-error-code',
        chaptersError?.message ?? 'null payload with no error',
        (chaptersError as PgErrorParts | null)?.details ?? '',
      );
      return NextResponse.json(
        { error: 'تعذّر تحميل أبواب هذا النظام' },
        { status: 500 }
      );
    }

    // Fetch articles with amendments — paged for the same reason as chapters:
    // the largest law in the corpus has 1,838 articles, and the unranged select
    // served the first 1,000 as the whole law (paywall.totalArticles = 1000).
    // The embedded arrays are per-row and are not subject to max-rows.
    const { data: articles, error: articlesError } = await selectAllPages<Record<string, unknown>>(
      (from, to) => supabase
        .schema('library')
        .from('articles')
        // LIB-04c: '*' shipped `fts` (a ~2.3KB/row tsvector) on every paged
        // row. Explicit columns are what the formatter/grouping below read.
        .select(`
          id,
          chapter_id,
          order_index,
          number,
          number_text,
          title,
          text,
          original_text,
          status,
          instrument,
          historic_regulation_text,
          executive_reg_text,
          executive_reg_ref,
          article_amendments (*),
          article_regulations (*)
        `)
        .eq('law_slug', slug)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
      { pageSize: ARTICLES_PAGE_SIZE },
    );

    // A-04 (2026-09-22): `error` was never read here, and a failed embed does
    // not fail the request — it arrives as `articles === null`. PostgREST fails
    // the WHOLE embedded query when ANY embedded relation is unreadable, so a
    // single missing grant on article_regulations (42501) served every law in
    // the corpus as a 200 with `chapters: [...], articles: 0` for a full day.
    // The failure mode of a library route is an error, never an empty law:
    // a reader cannot tell "this law has no articles" from "we lost them".
    if (articlesError || !Array.isArray(articles)) {
      console.error(
        `[Laws API] Articles query failed for "${slug}":`,
        (articlesError as PgErrorParts | null)?.code ?? 'no-error-code',
        articlesError?.message ?? 'null payload with no error',
        (articlesError as PgErrorParts | null)?.details ?? '',
      );
      return NextResponse.json(
        { error: 'تعذّر تحميل مواد هذا النظام' },
        { status: 500 }
      );
    }

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

    // Tag each article with its global (document-order) index for the paywall
    // check. Grouping into chapters happens in orderLawChapters below.
    let articleGlobalIndex = 0;

    articles?.forEach((article: Record<string, unknown>) => {
      (article as Record<string, unknown>).__globalIndex = articleGlobalIndex++;
    });

    // Extract combined regulation preamble if present
    let preamble = law.preamble || '';
    let regulationPreamble = '';
    if (preamble.includes('\n***\n')) {
      // ب-88: the standard file template bakes in multiple decorative `***`
      // separators before the first ARTICLE_START/CHAPTER_START anchor (after
      // the AI-summary block, the info card, the H1...), so `split` can return
      // 3-7 parts, not just 2. Rejoining everything past the first split keeps
      // it all in regulationPreamble instead of silently dropping parts[2:].
      const parts = preamble.split('\n***\n');
      preamble = parts[0].trim();
      regulationPreamble = parts.slice(1).join('\n***\n').trim();
    }

    // ── Build the flat "اللائحة وحدها" view — one sorted list per secondary
    // instrument (`ref`), spanning every نظام article, with dual-linked
    // duplicates (is_secondary_display) excluded so each article appears once.
    // See 00_عقل_القوانين/13_دليل_المبرمج/02_عقد_اللوائح_المدمجة_والبذر.md §1-3-د.
    const regulationsByRef = new Map<string, Record<string, unknown>[]>();
    // Number of regulation articles withheld from this view because the نظام
    // article they hang under is behind the paywall. The page needs the count,
    // not the rows: it renders the same lock/upgrade affordance the article
    // view renders, instead of an empty tab that reads as "no regulation".
    let regulationInstrumentsLocked = 0;
    articles?.forEach((article: Record<string, unknown>) => {
      const regRows = (article.article_regulations as Record<string, unknown>[]) || [];
      // F13: this view used to emit the FULL r.text of every regulation row for
      // every article, never consulting hasFullAccess/freeLimit, while
      // formatArticleWithPaywall omits the regulations block entirely for a
      // locked article. Same predicate, same outcome — omitted, not truncated,
      // because a truncated regulation is still paid text in the clear.
      const parentLocked = isArticleLocked(article, hasFullAccess, freeLimit);
      regRows.forEach((r) => {
        if (r.is_secondary_display === true) return;
        const ref = String(r.ref || '');
        if (!ref) return;
        // Counted after the two exclusions above: a dual-linked duplicate and a
        // ref-less row are not "withheld", they are not part of this view at all.
        if (parentLocked) {
          regulationInstrumentsLocked++;
          return;
        }
        if (!regulationsByRef.has(ref)) regulationsByRef.set(ref, []);
        regulationsByRef.get(ref)!.push(r);
      });
    });
    const regulationInstruments = Array.from(regulationsByRef.entries()).map(([ref, rows]) => ({
      ref,
      articles: [...rows]
        .sort((a, b) => String(a.sort_key || '99999').localeCompare(String(b.sort_key || '99999')))
        .map((r) => ({
          regNum: r.reg_num ?? null,
          text: r.text || '',
          status: articleStatusForDetail(r.status),
          systemArticleNumber: r.system_article_number ?? null,
        })),
    }));

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
      // ك-02 (2026-08-23): library.laws.status is fetched (select('*') above)
      // but was never copied into this response object, so the frontend's
      // "cancelled/active" badge always fell back to a hardcoded static map
      // (law-metadata-map.ts) that hand-lists "active" on every entry.
      law_status: lawStatusForDetail(law.status),
      parentLawId: parentInstrumentId,
      parentLaw: law.parent_law || '',
      enablingArticle: law.enabling_article || '',
      parentLawLink: parentLawLink
        ? { slug: parentLawLink.slug, title: parentLawLink.title }
        : null,
      preamble: preamble,
      regulationPreamble: regulationPreamble,
      // Flat per-instrument view for the "اللائحة وحدها" tab — see build above.
      regulationInstruments,
      // > 0 when the paywall removed regulation articles from that flat view.
      // An instrument whose every article is locked never appears in
      // regulationInstruments at all, so this is the only signal the page has.
      regulationInstrumentsLocked,
      // Paywall metadata for frontend
      paywall: {
        isWhitelisted,
        freeLimit,
        hasFullAccess,
        totalArticles: articles?.length ?? 0,
      },
      // LIB-04b (2026-09-25): chapters are ordered by where their articles
      // sit, not by chapters.order_index (a per-level ordinal on self-hosted);
      // the seeder's "__orphan__" chapter is relabelled «مواد خارج الأبواب»
      // and placed by its articles; empty headings are dropped when the law
      // has articles; articles with no matching chapter land in «أحكام عامة».
      // No article is dropped. See _order-chapters.ts for the measured cases.
      chapters: orderLawChapters(chapters, articles).map((chapter) => ({
        title: chapter.title,
        articles: chapter.articles.map((a) => formatArticleWithPaywall(a, hasFullAccess, freeLimit)),
      })),
    };

    return NextResponse.json(lawSystem);
  } catch (error) {
    console.error('[Laws API] Error:', error);
    return NextResponse.json(
      { error: 'تعذّر تحميل هذا النظام' },
      { status: 500 }
    );
  }
}

/** Preview length granted to a locked article's body text, in characters. */
const LOCKED_PREVIEW_CHARS = 100;

const ARTICLE_DETAIL_STATUSES = new Set([
  'active', 'amended', 'repealed', 'suspended', 'added', 'merged', 'status_undeclared',
]);

/** Detail API boundary: absence is unknown, and a malformed stored token fails closed. */
export function articleStatusForDetail(rawValue: unknown): string {
  const status = rawValue == null ? '' : String(rawValue).trim();
  if (status === '') return 'status_undeclared';
  if (!ARTICLE_DETAIL_STATUSES.has(status)) {
    throw new Error(`unknown article status "${status}" in law detail response`);
  }
  return status;
}

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

/**
 * THE lock predicate for this route — one definition, two call sites.
 *
 * It was inline in formatArticleWithPaywall only, which is why the flat
 * "اللائحة وحدها" view (regulationInstruments, built in GET) shipped the full
 * text of every executive regulation to anonymous readers while the per-article
 * view withheld it (F13). Both views must lock on the same fact, so both call
 * this. `__globalIndex` is stamped on every article before either runs.
 */
function isArticleLocked(
  article: Record<string, unknown>,
  hasFullAccess: boolean,
  freeLimit: number,
): boolean {
  const globalIndex = (article.__globalIndex as number) ?? 0;
  // freeLimit === -1 means unlimited (whitelisted law)
  return !hasFullAccess && freeLimit !== -1 && globalIndex >= freeLimit;
}

function formatArticleWithPaywall(
  article: Record<string, unknown>,
  hasFullAccess: boolean,
  freeLimit: number,
) {
  const isLocked = isArticleLocked(article, hasFullAccess, freeLimit);

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
    status: articleStatusForDetail(article.status),
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

  // Add executive regulation if present (only for unlocked articles).
  //
  // `regulations` is the NEW array form (one entry per regulation article,
  // individually sortable by regNum, carrying isSecondaryDisplay for dedup) —
  // the frontend should migrate to this. Until it does, `executiveReg` is
  // ALWAYS also populated (merged ref/text, mirroring the old
  // join(", ")/join("\n\n") shape from executive_reg_text/executive_reg_ref)
  // so every existing render path keeps working unchanged. Do not remove
  // `executiveReg` until the frontend reads `regulations` everywhere it
  // currently reads `executiveReg` (see §1-3 of
  // 00_عقل_القوانين/13_دليل_المبرمج/02_عقد_اللوائح_المدمجة_والبذر.md).
  if (!isLocked) {
    const regRows = (article.article_regulations as Record<string, unknown>[]) || [];
    if (regRows.length > 0) {
      const sorted = [...regRows].sort((a, b) =>
        String(a.sort_key || '99999').localeCompare(String(b.sort_key || '99999'))
      );
      result.regulations = sorted.map((r) => ({
        ref: r.ref || '',
        regNum: r.reg_num ?? null,
        text: r.text || '',
        status: articleStatusForDetail(r.status),
        isSecondaryDisplay: r.is_secondary_display === true,
      }));
      const distinctRefs = Array.from(new Set(sorted.map((r) => String(r.ref || '')).filter(Boolean)));
      result.executiveReg = {
        ref: distinctRefs.join(', '),
        text: sorted.map((r) => String(r.text || '')).join('\n\n'),
      };
    } else if (article.executive_reg_text) {
      result.executiveReg = {
        ref: article.executive_reg_ref || '',
        text: article.executive_reg_text,
      };
    }
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
