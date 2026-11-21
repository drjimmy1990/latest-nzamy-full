import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { hasFullLibraryAccess } from '@/lib/access-control';
import { decreeRefVariants, parseDecreeRef, pickDecree } from '@/lib/library/decreeRef';
import { lawStatusForDetail } from '@/app/laws/law-status';
import { stripArticleAuditNotes } from '@/lib/library/lawPreambleBlocks';
import { readerLinkTypes } from '@/lib/library/graphLinkTypes';
import { getFeatureFlags } from '@/lib/featureFlags/featureFlagsServer';
import { articleStatusForDetail } from '../_article-status';
import { TIER_SHAPED_CACHE_CONTROL } from '../_official-meta';
import {
  BULK_PER_TYPE,
  centerKeyOf,
  NEIGHBORHOOD_LIMIT,
  READER_SECTION_QUERIES,
  applyLiveRows,
  capTitle,
  docNameCandidates,
  mergeSectionRefs,
  pickFoldedTitle,
  titleLikePatterns,
  parseNumbers,
  refIds,
  shapeArticleRefs,
  shapeLawLinks,
  validArticleId,
  withAutoTags,
  withHrefs,
} from './_shape';
import { maskDecreeTitlesForViewer } from './_decree-titles';

/**
 * GET /api/library/laws/[slug]/citations — the law reader's citation data
 * (batch l6-reader, owner TODO N02-15/16, N06-40..43; batch l8-refbox, owner
 * item 6 + decision ٦٠; batch l9-reader: register 14 items 14 and 17). Loaded
 * on demand only: a chip's popover or the links box of the article in view,
 * never on first paint. The law map («خريطة التشابك التشريعي», ?map=1) is gone
 * (register 14 item 14): no button, no panel, no route branch.
 *
 *   ?bulk=1                batch l12 (owner L1): every article of the law at
 *                          once — per article its link groups with their true
 *                          totals and at most BULK_PER_TYPE items each, every
 *                          node once (graph_rag_law_article_links, 20261202_30).
 *                          The reader fetches it beside the law and draws the
 *                          list under each article and the side box from it.
 *   ?article=<id>          the links box of one article (id '@law': the law's own
 *                          node, LAW_LINKS_ID): its sections
 *                          (legislation / judicial / fiqh / similar), every legal link type
 *   ?name=<title>&n=1,2    a law named in the text, and its articles by number
 *   ?law=<slug>&n=1,2      the same for a known law (a regulation's parent)
 *   ?decree=<words>        a decree named in the text, by number and date
 *                          (batch l11, N02-13): the one exception to the rule
 *                          below — library subscribers only, never cached
 *
 * Every answer but the decree titles (Q101, viewerIsSubscriber below) is the
 * same for every viewer: titles (capped like a locked
 * title), numbers, statuses and links — never article text (20260929_01). So
 * the entitlement question does not arise, and nothing here spends the
 * library document quota. The graph functions are service-role only; their
 * text fields (snippet, evidence) are dropped by the whitelists in _shape.ts.
 */
const CACHE = 'private, max-age=300';
const ARTICLE_COLUMNS = 'id, number, title, status, instrument';
const LAW_COLUMNS = 'slug, title, status';

/** PGRST202 / 42883: the function is not there yet (retrieval.ts graphFunctionMissing). */
function graphFunctionMissing(code: string | null | undefined): boolean {
  return code === 'PGRST202' || code === '42883';
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': status === 200 ? CACHE : 'no-store' } });
}

/**
 * Owner Q101 (batch l12): the links answers name decrees, whose titles carry
 * the number and date a non-subscriber may not read — so those answers are
 * shaped per viewer (maskDecreeTitlesForViewer) and never cached.
 */
async function viewerIsSubscriber(): Promise<boolean> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    return await hasFullLibraryAccess(user?.id ?? null);
  } catch {
    return false;
  }
}

function tierJson(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': TIER_SHAPED_CACHE_CONTROL } });
}

function safeArticleStatus(raw: unknown): string {
  try {
    return articleStatusForDetail(raw);
  } catch {
    return 'status_undeclared';
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const gate = await libraryGate();
  if (gate) return gate;

  const { slug } = await params;
  const url = new URL(request.url);
  const serverOnly = await createServiceClient();

  try {
    // Batch l12: the two admin switches (featureFlags.ts) — the similar-meaning
    // section (Q133) and the «رابط آلي» tag (library-Q4). Same for every viewer.
    const wantsLinks = url.searchParams.has('article') || url.searchParams.get('bulk') === '1';
    const flags = wantsLinks ? await getFeatureFlags() : null;
    const types = readerLinkTypes(flags?.library_similar_links ?? false);
    const autoTagOn = flags?.library_auto_link_tag ?? false;

    // ── Every article of the law at once (batch l12, owner L1) ───────────────
    if (url.searchParams.get('bulk') === '1') {
      const { data, error } = await serverOnly.rpc('graph_rag_law_article_links', {
        p_law_slug: slug,
        p_per_type: BULK_PER_TYPE,
        p_types: types,
      });
      if (error) {
        if (graphFunctionMissing(error.code)) return json({ available: false });
        console.error('[citations] law links failed:', error.code ?? 'no-code', error.message);
        return json({ error: 'تعذّر تحميل الإحالات' }, 500);
      }
      const shapedLaw = shapeLawLinks(data, slug, types, safeArticleStatus, lawStatusForDetail, autoTagOn);
      return tierJson({ available: true, ...maskDecreeTitlesForViewer(shapedLaw, await viewerIsSubscriber()) });
    }

    // ── One article's links: the links box (owner item 6, decision ٦٠) ──────
    if (url.searchParams.has('article')) {
      const id = validArticleId(url.searchParams.get('article'));
      if (!id) return json({ error: 'bad article' }, 400);
      // One call per query group (READER_SECTION_QUERIES, graphLinkTypes.ts):
      // hundreds of principles citing an article, or its many «إحالة» links,
      // never crowd out its amendment and regulation links. A group whose
      // types are switched off (SIMILAR_TO, Q133) is not asked.
      const queries = READER_SECTION_QUERIES
        .map((q) => ({ section: q.section, types: q.types.filter((t) => types.includes(t)) }))
        .filter((q) => q.types.length > 0);
      const answers = await Promise.all(
        queries.map((q) =>
          serverOnly.rpc('graph_rag_explore_neighborhood', {
            p_node_key: centerKeyOf(id, slug),
            p_depth: 1,
            p_edge_types: q.types,
            p_limit: NEIGHBORHOOD_LIMIT,
          }),
        ),
      );
      const failed = answers.find((a) => a.error)?.error;
      if (failed) {
        if (graphFunctionMissing(failed.code)) return json({ available: false });
        console.error('[citations] article links failed:', failed.code ?? 'no-code', failed.message);
        return json({ error: 'تعذّر تحميل الإحالات' }, 500);
      }
      const shaped = mergeSectionRefs(
        queries.map((q, i) => ({ section: q.section, refs: shapeArticleRefs(answers[i].data, id, slug, q.types) })),
      );
      // Statuses from library.* now, not the graph's copy. A vanished anchor
      // links to its document and is named by it (never a confirmed article);
      // a vanished document is dropped (applyLiveRows).
      const ids = refIds(shaped);
      const none = Promise.resolve({ data: [], error: null });
      const lib = serverOnly.schema('library');
      const [arts, laws, principles, collections, decrees] = await Promise.all([
        ids.articles.length ? lib.from('articles').select('id, status').in('id', ids.articles) : none,
        ids.laws.length ? lib.from('laws').select('slug, status, title').in('slug', ids.laws) : none,
        ids.principles.length ? lib.from('principles').select('id').in('id', ids.principles) : none,
        ids.collections.length ? lib.from('judicial_collections').select('id, title').in('id', ids.collections) : none,
        ids.decrees.length ? lib.from('decrees_circulars').select('id').in('id', ids.decrees) : none,
      ]);
      for (const r of [arts, laws, principles, collections, decrees]) if (r.error) throw r.error;
      const live = applyLiveRows(
        shaped,
        {
          articles: (arts.data ?? []) as Array<{ id: unknown; status: unknown }>,
          laws: (laws.data ?? []) as Array<{ slug: unknown; status: unknown; title: unknown }>,
          principles: (principles.data ?? []) as Array<{ id: unknown }>,
          collections: (collections.data ?? []) as Array<{ id: unknown; title: unknown }>,
          decrees: (decrees.data ?? []) as Array<{ id: unknown }>,
        },
        safeArticleStatus,
        lawStatusForDetail,
      );
      const out = withHrefs(withAutoTags(live, autoTagOn));
      return tierJson({ available: true, ...maskDecreeTitlesForViewer(out, await viewerIsSubscriber()) });
    }

    // ── A decree named in the text (N02-13, batch l11) ───────────────────────
    // «المرسوم الملكي رقم (م/٥١) وتاريخ …» → its library record, by number AND
    // date, only when exactly one row fits (decreeRef.ts). A decree's number
    // and date columns are subscriber metadata (20261108_10), so the lookup by
    // them answers a library subscriber only; anyone else gets no record and
    // the popover keeps its plain note. Never cached: it depends on the viewer.
    if (url.searchParams.has('decree')) {
      const noStore = (body: unknown) => NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
      const ref = parseDecreeRef((url.searchParams.get('decree') ?? '').slice(0, 200));
      if (!ref || !ref.date) return noStore({ decree: null });
      const viewer = await createClient();
      let userId: string | null = null;
      try {
        const { data: { user } } = await viewer.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }
      if (!(await hasFullLibraryAccess(userId))) return noStore({ decree: null });
      const { data, error } = await serverOnly
        .schema('library')
        .from('decrees_circulars')
        .select('id, title, ref, date')
        .in('ref', decreeRefVariants(ref))
        .limit(100);
      if (error) throw error;
      const row = pickDecree((data ?? []) as Array<{ id: unknown; title: unknown; ref: unknown; date: unknown }>, ref);
      return noStore({
        decree: row
          ? { id: String(row.id), title: capTitle(String(row.title ?? '')), href: `/laws/orders/${encodeURIComponent(String(row.id))}` }
          : null,
      });
    }

    // ── A named law (or a known one) and its articles ────────────────────────
    const numbers = parseNumbers(url.searchParams.get('n'));
    const supabase = await createClient();
    type LawRow = { slug: string; title: string; status: unknown };
    let law: LawRow | null = null;
    const lawParam = url.searchParams.get('law');
    if (lawParam) {
      const { data, error } = await supabase.schema('library').from('laws').select(LAW_COLUMNS).eq('slug', lawParam).limit(1);
      if (error) throw error;
      law = (data?.[0] as LawRow | undefined) ?? null;
    } else {
      const candidates = docNameCandidates(url.searchParams.get('name'));
      if (candidates.length === 0) return json({ law: null, articles: [] });
      const { data, error } = await supabase.schema('library').from('laws').select(LAW_COLUMNS).in('title', candidates).limit(10);
      if (error) throw error;
      // The longest exact title wins: «نظام العمل» from «نظام العمل الصادر …».
      law = ((data ?? []) as LawRow[])
        .sort((a, b) => b.title.length - a.title.length)[0] ?? null;
      // N02-13 (batch l11): the text spells the name with other hamza / ة / ى
      // forms than the library title. One read with a LIKE pattern per
      // candidate (exact length; the letters that vary are one-character
      // wildcards), narrowed by folded equality, the longest title winning.
      if (!law) {
        const patterns = titleLikePatterns(candidates);
        if (patterns.length > 0) {
          const folded = await supabase.schema('library').from('laws').select(LAW_COLUMNS).likeAnyOf('title', patterns).limit(50);
          if (folded.error) throw folded.error;
          law = pickFoldedTitle((folded.data ?? []) as LawRow[], candidates);
        }
      }
    }
    if (!law) return json({ law: null, articles: [] });

    let articles: Array<{ id: string; number: number; title: string; status: string }> = [];
    if (numbers.length > 0) {
      const { data, error } = await serverOnly
        .schema('library')
        .from('articles')
        .select(ARTICLE_COLUMNS)
        .eq('law_slug', law.slug)
        .in('number', numbers.map(String))
        .limit(40);
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[])
        // «المادة (٥) من نظام …» is the law's article, never a regulation's or an annex's.
        .filter((a) => a.instrument !== 'لائحة' && a.instrument !== 'ملحق');
      for (const n of numbers) {
        const row = rows.find((a) => Number(a.number) === n);
        if (!row) continue;
        articles.push({
          id: String(row.id),
          number: n,
          title: capTitle(stripArticleAuditNotes(row.title)),
          status: safeArticleStatus(row.status),
        });
      }
    }
    articles = articles.slice(0, 8);
    return json({
      law: { slug: law.slug, title: capTitle(law.title), status: lawStatusForDetail(law.status) },
      articles,
    });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('[citations] lookup failed:', e?.code ?? 'no-code', e?.message ?? String(err));
    return json({ error: 'تعذّر تحميل المرجع' }, 500);
  }
}
