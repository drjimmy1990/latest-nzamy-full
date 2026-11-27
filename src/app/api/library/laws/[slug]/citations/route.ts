import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { checkLibraryAccess, hasFullLibraryAccess, libraryAccessMemo } from '@/lib/access-control';
import { effectiveFreeLimit } from '@/lib/library/previewLimit';
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
  cleanArticleRefs,
  cleanLawLinks,
  docNameCandidates,
  mergeSectionRefs,
  orderRefs,
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
import { articleBoxLockedByOwnLaw, lockedArticleRefs, withoutLockedArticles } from './_locked-articles';
import {
  ARTICLE_CACHE_ENTRIES,
  BULK_CACHE_ENTRIES,
  LINKS_CACHE_TTL_MS,
  createTtlCache,
  linksCacheKey,
  serverTiming,
} from './_cache';
import {
  FLAGS_BUDGET_MS,
  GATE_BUDGET_MS,
  GRAPH_BUDGET_MS,
  VIEWER_BUDGET_MS,
  closedViewer,
  createSingleFlight,
  orFallback,
  withinBudget,
} from './_bounded';

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
 * Every answer but the decree titles (Q101, viewerLinksAccess below) is the
 * same for every viewer: titles (capped like a locked
 * title), numbers, statuses and links — never article text (20260929_01). So
 * the entitlement question does not arise, and nothing here spends the
 * library document quota. The graph functions are service-role only; their
 * text fields (snippet, evidence) are dropped by the whitelists in _shape.ts.
 *
 * Batch l14 (owner file 07 §3, §4, §12, §14): the article itself — or, in the
 * similar-meaning section, another copy of the same law — never appears
 * (cleanArticleRefs / cleanLawLinks); the items come in the box's order; the
 * links answers (?bulk=1 and ?article=) are kept LINKS_CACHE_TTL_MS in this
 * process (_cache.ts) — after the public guard, before the per-viewer decree
 * mask — and carry a `Server-Timing` header.
 *
 * POST-L18-01 (owner package 27 Nov, batch l19): no step waits without end
 * (_bounded.ts). The public guard, the admin switch, the graph read and the
 * per-viewer lock read each have a budget; the viewer read runs BESIDE the
 * graph read; concurrent cache misses of one law share one graph read. Past a
 * budget: the guard or the graph → 503 `links_busy` (no-store; the reader
 * shows the article without its links), the viewer read → every article's
 * links hidden (fails closed, owner ٢٣٦), the switch → the similar section
 * off. `Server-Timing` names each step (gate, flags, graph, viewer) and a
 * `*_timeout` step when a budget ran out.
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
 * Owner ٢٣٦ (batch l18): who is reading the links, once per request — the
 * decree mask (Q101) and the locked-article strip both need it.
 *   isSubscriber  full library access — owner Q101 (batch l12): the links
 *                 answers name decrees, whose titles carry the number and date
 *                 a non-subscriber may not read, so they are masked per viewer
 *                 (maskDecreeTitlesForViewer) after the cache;
 *   openIds       null = every article of this law is open to the viewer
 *                 (a subscriber, a whitelisted / unlimited law); otherwise the
 *                 ids inside the free preview window — the law route's own
 *                 rule (order_index, id; effectiveFreeLimit). Any failed read
 *                 → an empty set: every article's links stay hidden (fails
 *                 closed, like the text itself).
 */
async function viewerLinksAccess(db: ServiceClient, slug: string): Promise<{ isSubscriber: boolean; openIds: Set<string> | null }> {
  let userId: string | null = null;
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  const memo = libraryAccessMemo(userId);
  let isSubscriber = false;
  try {
    isSubscriber = await hasFullLibraryAccess(userId, memo);
  } catch {
    isSubscriber = false;
  }
  if (isSubscriber) return { isSubscriber, openIds: null };
  try {
    const probe = await checkLibraryAccess(userId, slug, 0, 'laws', { memo });
    if (probe.isWhitelisted === true || probe.freeLimit === -1) return { isSubscriber, openIds: null };
    const lib = db.schema('library');
    const total = await lib.from('articles').select('id', { count: 'exact', head: true }).eq('law_slug', slug);
    if (total.error || typeof total.count !== 'number') return { isSubscriber, openIds: new Set() };
    const freeLimit = effectiveFreeLimit(probe, total.count);
    if (freeLimit === -1) return { isSubscriber, openIds: null };
    if (freeLimit <= 0) return { isSubscriber, openIds: new Set() };
    const { data, error } = await lib
      .from('articles')
      .select('id')
      .eq('law_slug', slug)
      .order('order_index', { ascending: true })
      .order('id', { ascending: true })
      .limit(freeLimit);
    if (error) return { isSubscriber, openIds: new Set() };
    return { isSubscriber, openIds: new Set(((data ?? []) as Array<{ id: unknown }>).map((r) => String(r.id))) };
  } catch {
    return { isSubscriber, openIds: new Set() };
  }
}

/** library.articles.law_slug of one id; null when not found or unreadable. */
async function articleLawSlugOf(db: ServiceClient, articleId: string): Promise<string | null> {
  const { data, error } = await db.schema('library').from('articles').select('law_slug').eq('id', articleId).limit(1);
  if (error) return null;
  const own = (data?.[0] as { law_slug?: unknown } | undefined)?.law_slug;
  return typeof own === 'string' && own ? own : null;
}

function tierJson(body: unknown, timing?: string) {
  return NextResponse.json(body, {
    headers: { 'Cache-Control': TIER_SHAPED_CACHE_CONTROL, ...(timing ? { 'Server-Timing': timing } : {}) },
  });
}

/**
 * POST-L18-01: a step ran out of its budget. Never cached; the reader keeps
 * the law's text and shows the article without its links.
 */
function linksBusy(timing: string) {
  return NextResponse.json(
    { error: 'تعذّر تحميل الإحالات الآن', code: 'links_busy' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30', 'Server-Timing': timing } },
  );
}

/** viewerLinksAccess within VIEWER_BUDGET_MS; a throw or a timeout fails closed. */
async function boundedViewer(db: ServiceClient, slug: string) {
  const started = performance.now();
  const [viewer, timedOut] = await orFallback(
    viewerLinksAccess(db, slug).catch(() => closedViewer()),
    VIEWER_BUDGET_MS,
    closedViewer(),
  );
  if (timedOut) console.warn('[citations] viewer read over budget; links hidden for this answer');
  return { viewer, timedOut, ms: performance.now() - started };
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
/** The link types the reader asks for (readerLinkTypes, the similar switch). */
type ReaderLinkTypes = ReturnType<typeof readerLinkTypes>;

/** The links answers before the per-viewer mask (batch l14, owner file 07 §14). */
const bulkCache = createTtlCache<ReturnType<typeof cleanLawLinks>>(BULK_CACHE_ENTRIES, LINKS_CACHE_TTL_MS);
const articleCache = createTtlCache<ReturnType<typeof withHrefs>>(ARTICLE_CACHE_ENTRIES, LINKS_CACHE_TTL_MS);

/** A graph read's outcome; only `ok` is ever kept in the caches above. */
type GraphLoad<V> = { kind: 'ok'; value: V } | { kind: 'missing' } | { kind: 'timeout' } | { kind: 'error' };

/** POST-L18-01: concurrent misses of one key share one graph read (_bounded.ts). */
const bulkFlight = createSingleFlight<GraphLoad<ReturnType<typeof cleanLawLinks>>>();
const articleFlight = createSingleFlight<GraphLoad<ReturnType<typeof withHrefs>>>();

/**
 * The law's own title, to tell another copy of it apart (file 07 §3); '' when
 * it cannot be read — then only the exact self link is dropped, and the answer
 * is not kept.
 */
async function lawTitleOf(serverOnly: ServiceClient, slug: string, signal?: AbortSignal): Promise<string> {
  try {
    const read = serverOnly.schema('library').from('laws').select('title').eq('slug', slug).limit(1);
    const { data, error } = await (signal ? read.abortSignal(signal) : read);
    if (error) return '';
    const title = (data?.[0] as { title?: unknown } | undefined)?.title;
    return typeof title === 'string' ? title : '';
  } catch {
    return '';
  }
}

function safeArticleStatus(raw: unknown): string {
  try {
    return articleStatusForDetail(raw);
  } catch {
    return 'status_undeclared';
  }
}

/**
 * A graph stage within GRAPH_BUDGET_MS: its reads carry one abort signal (the
 * connection is let go when the time is up), and the wait itself is bounded
 * too, should a read not honour the signal.
 */
async function boundedGraph<V>(run: (signal: AbortSignal) => Promise<GraphLoad<V>>): Promise<GraphLoad<V>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_BUDGET_MS);
  try {
    const r = await withinBudget(
      run(controller.signal).catch((err): GraphLoad<V> => {
        if (controller.signal.aborted) return { kind: 'timeout' };
        const e = err as { code?: string; message?: string };
        console.error('[citations] graph stage failed:', e?.code ?? 'no-code', e?.message ?? String(err));
        return { kind: 'error' };
      }),
      GRAPH_BUDGET_MS + 250,
    );
    if (r.timedOut) {
      controller.abort();
      return { kind: 'timeout' };
    }
    return r.value.kind === 'error' && controller.signal.aborted ? { kind: 'timeout' } : r.value;
  } finally {
    clearTimeout(timer);
  }
}

/** The whole law's links (batch l12, L1) before the per-viewer step; kept in bulkCache when complete. */
function loadLawLinks(serverOnly: ServiceClient, slug: string, types: ReaderLinkTypes, autoTagOn: boolean, key: string) {
  return boundedGraph<ReturnType<typeof cleanLawLinks>>(async (signal) => {
    const [{ data, error }, lawTitle] = await Promise.all([
      serverOnly
        .rpc('graph_rag_law_article_links', {
          p_law_slug: slug,
          p_per_type: BULK_PER_TYPE,
          p_types: types,
        })
        .abortSignal(signal),
      lawTitleOf(serverOnly, slug, signal),
    ]);
    if (error) {
      if (signal.aborted) return { kind: 'timeout' };
      if (graphFunctionMissing(error.code)) return { kind: 'missing' };
      console.error('[citations] law links failed:', error.code ?? 'no-code', error.message);
      return { kind: 'error' };
    }
    const shaped = cleanLawLinks(shapeLawLinks(data, slug, types, safeArticleStatus, lawStatusForDetail, autoTagOn), slug, lawTitle);
    if (shaped.found && lawTitle) bulkCache.set(key, shaped);
    return { kind: 'ok', value: shaped };
  });
}

/** One article's links box (owner item 6, decision ٦٠) before the per-viewer mask; kept in articleCache when complete. */
function loadArticleLinks(serverOnly: ServiceClient, id: string, slug: string, types: ReaderLinkTypes, autoTagOn: boolean, key: string) {
  return boundedGraph<ReturnType<typeof withHrefs>>(async (signal) => {
    const lawTitleRead = lawTitleOf(serverOnly, slug, signal);
    // One call per query group (READER_SECTION_QUERIES, graphLinkTypes.ts):
    // hundreds of principles citing an article, or its many «إحالة» links,
    // never crowd out its amendment and regulation links. A group whose
    // types are switched off (SIMILAR_TO, Q133) is not asked.
    const queries = READER_SECTION_QUERIES
      .map((q) => ({ section: q.section, types: q.types.filter((t) => types.includes(t)) }))
      .filter((q) => q.types.length > 0);
    const answers = await Promise.all(
      queries.map((q) =>
        serverOnly
          .rpc('graph_rag_explore_neighborhood', {
            p_node_key: centerKeyOf(id, slug),
            p_depth: 1,
            p_edge_types: q.types,
            p_limit: NEIGHBORHOOD_LIMIT,
          })
          .abortSignal(signal),
      ),
    );
    const failed = answers.find((a) => a.error)?.error;
    if (failed) {
      if (signal.aborted) return { kind: 'timeout' };
      if (graphFunctionMissing(failed.code)) return { kind: 'missing' };
      console.error('[citations] article links failed:', failed.code ?? 'no-code', failed.message);
      return { kind: 'error' };
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
      ids.articles.length ? lib.from('articles').select('id, status').in('id', ids.articles).abortSignal(signal) : none,
      ids.laws.length ? lib.from('laws').select('slug, status, title').in('slug', ids.laws).abortSignal(signal) : none,
      ids.principles.length ? lib.from('principles').select('id').in('id', ids.principles).abortSignal(signal) : none,
      ids.collections.length ? lib.from('judicial_collections').select('id, title').in('id', ids.collections).abortSignal(signal) : none,
      ids.decrees.length ? lib.from('decrees_circulars').select('id').in('id', ids.decrees).abortSignal(signal) : none,
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
    const lawTitle = await lawTitleRead;
    const out = withHrefs(withAutoTags(orderRefs(cleanArticleRefs(live, id, slug, lawTitle), slug), autoTagOn));
    if (lawTitle) articleCache.set(key, out);
    return { kind: 'ok', value: out };
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const started = performance.now();
  // POST-L18-01: the public guard within its budget — past it, a 503 (never
  // an open answer: the guard decides who may read at all).
  const gateRun = await withinBudget(libraryGate(), GATE_BUDGET_MS);
  const gateMs = performance.now() - started;
  if (gateRun.timedOut) {
    console.warn('[citations] library guard over budget');
    return linksBusy(serverTiming([['gate', gateMs], ['gate_timeout', GATE_BUDGET_MS]], 'miss'));
  }
  if (gateRun.value) return gateRun.value;

  const { slug } = await params;
  const url = new URL(request.url);
  const serverOnly = await createServiceClient();

  try {
    // Batch l12: the admin switch for the similar-meaning section (Q133,
    // featureFlags.ts). Same for every viewer. Owner Q171 (22 Nov, batch l13):
    // no «رابط آلي» label — the unreviewed-automatic mark is always cleared.
    const wantsLinks = url.searchParams.has('article') || url.searchParams.get('bulk') === '1';
    const flagsStart = performance.now();
    // POST-L18-01: the switch within its budget; past it, the similar section is off.
    const [flags, flagsLate] = wantsLinks
      ? await orFallback(getFeatureFlags().catch(() => null), FLAGS_BUDGET_MS, null)
      : [null, false];
    const flagsMs = performance.now() - flagsStart;
    const types = readerLinkTypes(flags?.library_similar_links ?? false);
    const autoTagOn = false;
    /** The Server-Timing steps every links answer carries. */
    const baseSteps = (): Array<[string, number]> => [
      ['gate', gateMs],
      ['flags', flagsMs],
      ...(flagsLate ? ([['flags_timeout', FLAGS_BUDGET_MS]] as Array<[string, number]>) : []),
    ];

    // ── Every article of the law at once (batch l12, owner L1) ───────────────
    if (url.searchParams.get('bulk') === '1') {
      const key = linksCacheKey('bulk', slug, null, types);
      // Owner ٢٣٦: who is reading — started BESIDE the graph read (it does
      // not depend on it), within its own budget (POST-L18-01).
      const viewerRead = boundedViewer(serverOnly, slug);
      let shapedLaw = bulkCache.get(key);
      const hit = !!shapedLaw;
      const graphStart = performance.now();
      if (!shapedLaw) {
        const load = await bulkFlight.run(key, () => loadLawLinks(serverOnly, slug, types, autoTagOn, key));
        const graphMs = performance.now() - graphStart;
        if (load.kind === 'missing') return json({ available: false });
        if (load.kind === 'timeout') {
          return linksBusy(serverTiming([...baseSteps(), ['graph', graphMs], ['graph_timeout', GRAPH_BUDGET_MS]], 'miss'));
        }
        if (load.kind === 'error') return json({ error: 'تعذّر تحميل الإحالات' }, 500);
        shapedLaw = load.value;
      }
      const graphMs = performance.now() - graphStart;
      // Owner ٢٣٦: per viewer, after the shared cache — a locked article's
      // links (groups, counts, titles) leave the answer.
      const { viewer, timedOut: viewerLate, ms: viewerMs } = await viewerRead;
      // l19 review S2: a viewer read over budget is a 503 links_busy (the
      // reader says «تعذّر تحميل الإحالات الآن»), not a 200 with every
      // article's links stripped that the reader would keep as «no links».
      if (viewerLate) {
        return linksBusy(serverTiming([...baseSteps(), ['graph', graphMs], ['viewer', viewerMs], ['viewer_timeout', VIEWER_BUDGET_MS]], hit ? 'hit' : 'miss'));
      }
      const body = { available: true, ...maskDecreeTitlesForViewer(withoutLockedArticles(shapedLaw, viewer.openIds), viewer.isSubscriber) };
      return tierJson(
        body,
        serverTiming(
          [
            ...baseSteps(),
            ['graph', graphMs],
            ['viewer', viewerMs],
            ...(viewerLate ? ([['viewer_timeout', VIEWER_BUDGET_MS]] as Array<[string, number]>) : []),
            ['total', performance.now() - started],
          ],
          hit ? 'hit' : 'miss',
        ),
      );
    }

    // ── One article's links: the links box (owner item 6, decision ٦٠) ──────
    if (url.searchParams.has('article')) {
      const id = validArticleId(url.searchParams.get('article'));
      if (!id) return json({ error: 'bad article' }, 400);
      // Owner ٢٣٦: a locked article's box answers nothing — no item, no total.
      // The lock is read from the article's own law, never only from the URL's
      // slug (articleBoxLockedByOwnLaw). POST-L18-01: both reads within the
      // viewer budget; a timeout keeps the box locked (fails closed).
      const { viewer, timedOut: viewerLate, ms: viewerMs } = await boundedViewer(serverOnly, slug);
      // l19 review S2: over budget → 503 links_busy (fails closed: nothing shown), never a 200 «no links».
      if (viewerLate) {
        return linksBusy(serverTiming([...baseSteps(), ['viewer', viewerMs], ['viewer_timeout', VIEWER_BUDGET_MS]], 'miss'));
      }
      const lockRun = await withinBudget(
        articleBoxLockedByOwnLaw(id, slug, {
          isSubscriber: viewer.isSubscriber,
          urlOpenIds: viewer.openIds,
          ownLawSlug: (articleId) => articleLawSlugOf(serverOnly, articleId),
          openIdsFor: async (lawSlug) => (await viewerLinksAccess(serverOnly, lawSlug)).openIds,
        }).catch(() => true),
        VIEWER_BUDGET_MS,
      );
      const viewerSteps: Array<[string, number]> = [
        ['viewer', viewerMs],
        ...(lockRun.timedOut ? ([['viewer_timeout', VIEWER_BUDGET_MS]] as Array<[string, number]>) : []),
      ];
      // l19 review S2: the lock read over budget is busy too (nothing shown, the reader says so).
      if (lockRun.timedOut) {
        return linksBusy(serverTiming([...baseSteps(), ...viewerSteps], 'miss'));
      }
      if (lockRun.value) {
        return tierJson({ available: true, ...lockedArticleRefs() }, serverTiming([...baseSteps(), ...viewerSteps], 'miss'));
      }
      const key = linksCacheKey('article', slug, id, types);
      const kept = articleCache.get(key);
      if (kept) {
        return tierJson(
          { available: true, ...maskDecreeTitlesForViewer(kept, viewer.isSubscriber) },
          serverTiming([...baseSteps(), ...viewerSteps, ['total', performance.now() - started]], 'hit'),
        );
      }
      const graphStart = performance.now();
      const load = await articleFlight.run(key, () => loadArticleLinks(serverOnly, id, slug, types, autoTagOn, key));
      const graphMs = performance.now() - graphStart;
      if (load.kind === 'missing') return json({ available: false });
      if (load.kind === 'timeout') {
        return linksBusy(serverTiming([...baseSteps(), ...viewerSteps, ['graph', graphMs], ['graph_timeout', GRAPH_BUDGET_MS]], 'miss'));
      }
      if (load.kind === 'error') return json({ error: 'تعذّر تحميل الإحالات' }, 500);
      return tierJson(
        { available: true, ...maskDecreeTitlesForViewer(load.value, viewer.isSubscriber) },
        serverTiming([...baseSteps(), ...viewerSteps, ['graph', graphMs], ['total', performance.now() - started]], 'miss'),
      );
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
