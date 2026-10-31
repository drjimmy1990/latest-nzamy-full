import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getLibraryAccessForUser } from '@/lib/access-control';
import { libraryGate } from '@/lib/library-gate';
import { isFreeLibraryItem } from '@/lib/library-item-access';
import { quotaRefusal, scopedSearchDocKey } from '@/lib/library/readQuota';
import { libraryReadQuotaHit } from '@/lib/library/readQuotaServer';
import { recordLibraryActivity } from '@/lib/library/activityMeterServer';
import { parseSearchQuery, SearchQuerySyntaxError, LIBRARY_FTS_CONFIG } from '@/utils/normalizeArabic';
import { selectAllPages } from '@/lib/supabase/selectAllPages';
import { BOOK_SERIES_FEATURE, bookVolumeColumns, buildBookSeries, type VolumeRow } from '@/lib/library/bookVolumes';
import { readWithOptionalFeatures } from '@/lib/library/optionalColumn';
import { buildCollectionSeries, type CollectionVolumeRow } from '@/lib/library/precedentVolumes';
import { TIER_SHAPED_CACHE_CONTROL } from '../laws/[slug]/_official-meta';
import { isMissingFunctionError } from '../search/searchPlan';
import {
  SCOPED_MAX_DEPTH,
  shapeHit,
  validateScopedRequest,
  type ScopedKind,
  type ScopeVolume,
  type ViewerAccess,
} from './scopedSearch';

/**
 * POST /api/library/scoped-search — search inside the open law, judicial
 * collection or fiqh book, across every volume of its series (owner-free P5,
 * N2.6; owner README «٤٧» part ٦).
 *
 * Body: { scope: "law:<slug>" | "collection:<id>" | "book:<id>", query,
 *         page?: 1.., limit?: 1..50 }  (scopedSearch.ts validates it).
 * The query is the library's search syntax (+ / - "…" *), parsed by
 * parseSearchQuery into an operator-safe tsquery and matched against the same
 * `fts` columns as the global search (LIBRARY_FTS_CONFIG). User text never
 * reaches a PostgREST filter string.
 *
 * The scope names the volume the reader has open; the series is resolved
 * here from the catalogue (catalogue columns on the request client), never
 * taken from the client. The window comes from library.search_scoped_page
 * (migration 20261025_41: service role, 4s statement_timeout, reading order);
 * while that function is missing, the same window is read inline as the
 * service role. Every row then goes through shapeHit(): the global search's
 * paywall, item for item, before anything is sent.
 */

const SCOPED_RPC = 'search_scoped_page';
const SCOPED_RPC_RETRY_MS = 10 * 60 * 1000;
let scopedRpcMissingUntil = 0;
/** The route's own wait; the function's 4s ends the query in the database. */
const SCOPED_BUDGET_MS = 4500;
/** A runaway guard on one series' volumes. */
const SERIES_MAX_VOLUMES = 200;

interface ResolvedScope {
  kind: ScopedKind;
  /** The open volume's id (law slug / collection id / book id). */
  id: string;
  /** The document's title — a series' base title for a multi-volume work. */
  title: string;
  /** Law type, collection court, book author: what a citation needs. */
  detail: string | null;
  volumes: ScopeVolume[];
}

type ScopeLookup = { scope: ResolvedScope | null; error: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

async function resolveScope(supabase: Client, kind: ScopedKind, id: string): Promise<ScopeLookup> {
  const lib = () => supabase.schema('library');
  if (kind === 'law') {
    const { data, error } = await lib().from('laws').select('slug, title, type').eq('slug', id).maybeSingle();
    if (error || !data) return { scope: null, error };
    return {
      scope: { kind, id: data.slug, title: data.title ?? '', detail: data.type ?? null, volumes: [{ id: data.slug, label: null }] },
      error: null,
    };
  }

  if (kind === 'collection') {
    const { data, error } = await lib()
      .from('judicial_collections')
      .select('id, title, court, part, series_id, free, ruling_count')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return { scope: null, error };
    let volumes: ScopeVolume[] = [{ id: data.id, label: null }];
    let title: string = data.title ?? '';
    const seriesId = typeof data.series_id === 'string' ? data.series_id.trim() : '';
    if (seriesId) {
      const siblings = await lib()
        .from('judicial_collections')
        .select('id, title, part, series_id, free, ruling_count')
        .eq('series_id', seriesId)
        .order('part', { ascending: true })
        .order('id', { ascending: true })
        .limit(SERIES_MAX_VOLUMES);
      if (siblings.error) return { scope: null, error: siblings.error };
      const series = buildCollectionSeries((siblings.data ?? []) as CollectionVolumeRow[], data.id);
      if (series) {
        volumes = series.volumes.map((v) => ({ id: v.id, label: v.label }));
        title = String(title).replace(/\s*[-—–]\s*المجلد\s+.*$/, '').trim() || title;
      }
    }
    return { scope: { kind, id: data.id, title, detail: data.court ?? null, volumes }, error: null };
  }

  // book: the series is the source's series_id when the database has it
  // (owner ٢٦٢, 20261026_51), else recovered from the catalogue titles
  // (bookVolumes.ts) — as the books route does for its volume switcher.
  const { data: book, error } = await lib().from('feqh_books').select('id, title, author').eq('id', id).maybeSingle();
  if (error || !book) return { scope: null, error };
  const all = await readWithOptionalFeatures((on) =>
    selectAllPages<VolumeRow>((from, to) =>
      lib().from('feqh_books').select(bookVolumeColumns(on)).order('id', { ascending: true }).range(from, to),
    ), [BOOK_SERIES_FEATURE]);
  if (all.error) return { scope: null, error: all.error };
  const series = buildBookSeries(all.data, String(book.id));
  return {
    scope: {
      kind,
      id: book.id,
      title: series?.title ?? book.title ?? '',
      detail: book.author ?? null,
      volumes: series ? series.volumes.map((v) => ({ id: v.id, label: v.label })) : [{ id: book.id, label: null }],
    },
    error: null,
  };
}

type Window = { rows: Record<string, unknown>[]; count: number } | null;

/**
 * The same window as library.search_scoped_page, inline, for while the
 * function is not in the database yet. Stable order for paging: the volume
 * id (not the series' volume order — that needs the function), then
 * order_index, then id.
 */
async function inlineWindow(
  serverOnly: Client,
  kind: ScopedKind,
  ids: string[],
  tsquery: string,
  from: number,
  size: number,
  signal: AbortSignal,
): Promise<Window> {
  const lib = serverOnly.schema('library');
  let q;
  if (kind === 'law') {
    q = lib
      .from('articles')
      .select('id, volume_id:law_slug, number, number_text, title, status, text, original_text, executive_reg_text, order_index', { count: 'exact' })
      .in('law_slug', ids)
      .order('law_slug');
  } else if (kind === 'collection') {
    q = lib
      .from('principles')
      .select('id, volume_id:collection_id, principle_number, issuing_body, session_date, decision_number, year_hijri, reference, text, ruling_basis, facts, reasons, ruling, order_index', { count: 'exact' })
      .in('collection_id', ids)
      .order('collection_id');
  } else {
    q = lib
      .from('feqh_blocks')
      .select('id, volume_id:book_id, topic, volume_number, page_number, volume_label, page_label, matn, sharh, hashiyah, order_index, feqh_sections ( title, feqh_chapters ( title ) )', { count: 'exact' })
      .in('book_id', ids)
      .order('book_id');
  }
  const res = await q
    .textSearch('fts', tsquery, { config: LIBRARY_FTS_CONFIG })
    .order('order_index')
    .order('id')
    .range(from, from + size - 1)
    .abortSignal(signal);
  if (res.error) {
    // PGRST103: a page past the end — an empty page, not a failure.
    if (res.error.code === 'PGRST103') return { rows: [], count: from };
    console.error('[Scoped search] inline window failed:', res.error);
    return null;
  }
  const rows = ((res.data ?? []) as Record<string, unknown>[]).map((r) => {
    if (kind !== 'book') return r;
    const sec = r.feqh_sections as Record<string, unknown> | null;
    const ch = sec?.feqh_chapters as Record<string, unknown> | null;
    return { ...r, section_title: sec?.title ?? null, chapter_title: ch?.title ?? null };
  });
  return { rows, count: typeof res.count === 'number' ? res.count : from + rows.length };
}

export async function POST(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'جسم الطلب ليس JSON صالحاً.', code: 'invalid_request' }, { status: 400 });
    }
    const v = validateScopedRequest(body);
    if (!v.ok) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 });
    const req = v.request;

    let parsed;
    try {
      parsed = parseSearchQuery(req.query);
    } catch (error) {
      if (error instanceof SearchQuerySyntaxError) {
        return NextResponse.json(
          { error: 'صيغة البحث غير صحيحة. راجع علامات التنصيص والأقواس والعوامل.', code: error.code, index: error.index },
          { status: 400 },
        );
      }
      throw error;
    }
    const tsquery = parsed.tsquery;
    if (!tsquery) {
      return NextResponse.json({ error: 'اكتب كلمة يُبحث عنها، لا علامات فقط.', code: 'query_empty' }, { status: 400 });
    }

    const supabase = await createClient();
    const resolved = await resolveScope(supabase, req.kind, req.id);
    if (!resolved.scope) {
      if (resolved.error) {
        console.error('[Scoped search] scope lookup failed:', resolved.error);
        return NextResponse.json({ error: 'تعذّر البحث في هذا المستند. حاول مجدداً.', code: 'search_unavailable' }, { status: 503 });
      }
      return NextResponse.json({ error: 'لم يُعثر على هذا المستند.', code: 'scope_not_found' }, { status: 404 });
    }
    const scope = resolved.scope;
    const ids = scope.volumes.map((vol) => vol.id);

    // ── Paywall: the global search's rules (guests → free tier).
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    // Owner note ١٣ C07 / C09: an in-document search returns article text,
    // so a signed-in reader spends the scope's document exactly as opening
    // it would (free when already opened today), and a library lock stops it.
    // Fails open: no answer (migration not applied, timeout) → go on.
    if (userId) {
      recordLibraryActivity(userId, 'search');
      const docKey = scopedSearchDocKey(scope.kind, scope.id);
      const refusal = docKey ? quotaRefusal(await libraryReadQuotaHit(userId, docKey), Date.now()) : null;
      if (refusal) {
        const headers: Record<string, string> = { 'Cache-Control': 'private, no-store' };
        if (refusal.retryAfterSeconds !== null) headers['Retry-After'] = String(refusal.retryAfterSeconds);
        return NextResponse.json(refusal.body, { status: refusal.status, headers });
      }
    }

    const { hasFullAccess, whitelistedSlugs, freeItemsByType } = await getLibraryAccessForUser(userId);
    const access: ViewerAccess = {
      hasFullAccess,
      whitelistedSlugs,
      freeItemsByType,
      isFree: (contentType, itemId) =>
        isFreeLibraryItem({ contentType, itemId, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs }),
    };

    // ── The window: the text is server-only (articles 20260929_01, principles
    // 20261016_01, fiqh 20261018_02), so it is read with the service role.
    const serverOnly = await createServiceClient();
    const from = (req.page - 1) * req.limit;
    const signal = AbortSignal.timeout(SCOPED_BUDGET_MS);
    let window: Window = null;
    let viaRpc = false;
    if (Date.now() >= scopedRpcMissingUntil) {
      const rpcRes = await serverOnly
        .schema('library')
        .rpc(SCOPED_RPC, { p_kind: req.kind, p_ids: ids, p_tsquery: tsquery, p_offset: from, p_fetch: req.limit })
        .abortSignal(signal);
      if (isMissingFunctionError(rpcRes.error)) {
        scopedRpcMissingUntil = Date.now() + SCOPED_RPC_RETRY_MS;
        console.warn('[Scoped search] library.search_scoped_page is missing — inline window (apply 20261025_41)');
      } else if (rpcRes.error) {
        console.error('[Scoped search] search_scoped_page failed:', rpcRes.error);
        return NextResponse.json({ error: 'تعذّر البحث في هذا المستند. حاول مجدداً.', code: 'search_unavailable' }, { status: 503 });
      } else {
        const data = (rpcRes.data ?? {}) as { rows?: unknown; count?: unknown };
        window = {
          rows: Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : [],
          count: typeof data.count === 'number' ? data.count : 0,
        };
        viaRpc = true;
      }
    }
    if (!viaRpc) {
      window = await inlineWindow(serverOnly, req.kind, ids, tsquery, from, req.limit, signal);
      if (!window) {
        return NextResponse.json({ error: 'تعذّر البحث في هذا المستند. حاول مجدداً.', code: 'search_unavailable' }, { status: 503 });
      }
    }
    const { rows, count } = window!;
    const results = rows.map((row) => shapeHit(scope.kind, row, scope.volumes, parsed.plainTerms, access));

    return NextResponse.json(
      {
        scope: { kind: scope.kind, id: scope.id, title: scope.title, detail: scope.detail, volumes: scope.volumes },
        query: parsed.raw,
        terms: parsed.plainTerms,
        results,
        count,
        page: req.page,
        limit: req.limit,
        // No «more» past the depth validateScopedRequest refuses (page_too_deep).
        hasMore: from + rows.length < count && (req.page + 1) * req.limit <= SCOPED_MAX_DEPTH,
        viewer: { hasFullAccess },
      },
      { headers: { 'Cache-Control': TIER_SHAPED_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error('[Scoped search] Unexpected error:', error);
    return NextResponse.json({ error: 'تعذّر البحث في هذا المستند. حاول مجدداً.', code: 'search_unavailable' }, { status: 500 });
  }
}
