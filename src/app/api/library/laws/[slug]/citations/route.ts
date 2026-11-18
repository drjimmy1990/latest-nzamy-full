import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { lawStatusForDetail } from '@/app/laws/law-status';
import { stripArticleAuditNotes } from '@/lib/library/lawPreambleBlocks';
import { articleStatusForDetail } from '../_article-status';
import {
  NEIGHBORHOOD_LIMIT,
  READER_LINK_TYPES,
  READER_SECTION_QUERIES,
  applyLiveRows,
  capTitle,
  docNameCandidates,
  mergeSectionRefs,
  parseNumbers,
  refIds,
  shapeArticleRefs,
  shapeLawLinks,
  validArticleId,
  withHrefs,
} from './_shape';

/**
 * GET /api/library/laws/[slug]/citations — the law reader's citation data
 * (batch l6-reader, owner TODO N02-15/16, N06-40..43; batch l8-refbox, owner
 * item 6 + decision ٦٠). Loaded on demand only: a chip's popover, the links
 * box of the article in view, or the map, never on first paint.
 *
 *   ?article=<id>          the links box of one article: three sections
 *                          (legislation / judicial / fiqh), shown types only
 *   ?map=1                 the laws this law is linked with (graph, 20261128_60)
 *   ?name=<title>&n=1,2    a law named in the text, and its articles by number
 *   ?law=<slug>&n=1,2      the same for a known law (a regulation's parent)
 *
 * Every answer is the same for every viewer: titles (capped like a locked
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
    // ── One article's links: the links box (owner item 6, decision ٦٠) ──────
    if (url.searchParams.has('article')) {
      const id = validArticleId(url.searchParams.get('article'));
      if (!id) return json({ error: 'bad article' }, 400);
      // One call per section, each with that section's types only (all of them
      // the owner-matched READER_LINK_TYPES, graphLinkTypes.ts): hundreds of
      // principles citing an article never crowd out its legislation links.
      const answers = await Promise.all(
        READER_SECTION_QUERIES.map((q) =>
          serverOnly.rpc('graph_rag_explore_neighborhood', {
            p_node_key: `article:${id}`,
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
        READER_SECTION_QUERIES.map((q, i) => ({ section: q.section, refs: shapeArticleRefs(answers[i].data, id, slug) })),
      );
      // Statuses from library.* now, not the graph's copy. A vanished anchor
      // links to its document; a vanished document is dropped (applyLiveRows).
      const ids = refIds(shaped);
      const none = Promise.resolve({ data: [], error: null });
      const lib = serverOnly.schema('library');
      const [arts, laws, principles, collections, decrees] = await Promise.all([
        ids.articles.length ? lib.from('articles').select('id, status').in('id', ids.articles) : none,
        ids.laws.length ? lib.from('laws').select('slug, status').in('slug', ids.laws) : none,
        ids.principles.length ? lib.from('principles').select('id').in('id', ids.principles) : none,
        ids.collections.length ? lib.from('judicial_collections').select('id').in('id', ids.collections) : none,
        ids.decrees.length ? lib.from('decrees_circulars').select('id').in('id', ids.decrees) : none,
      ]);
      for (const r of [arts, laws, principles, collections, decrees]) if (r.error) throw r.error;
      const live = applyLiveRows(
        shaped,
        {
          articles: (arts.data ?? []) as Array<{ id: unknown; status: unknown }>,
          laws: (laws.data ?? []) as Array<{ slug: unknown; status: unknown }>,
          principles: (principles.data ?? []) as Array<{ id: unknown }>,
          collections: (collections.data ?? []) as Array<{ id: unknown }>,
          decrees: (decrees.data ?? []) as Array<{ id: unknown }>,
        },
        safeArticleStatus,
        lawStatusForDetail,
      );
      return json({ available: true, ...withHrefs(live) });
    }

    // ── The law's linked laws (the map): shown types only (20261128_60) ─────
    if (url.searchParams.get('map') === '1') {
      const { data, error } = await serverOnly.rpc('library_reader_law_links_typed', {
        p_law_slug: slug,
        p_types: [...READER_LINK_TYPES],
        p_limit: 24,
      });
      if (error) {
        // Before 20261128_60 runs, the map says «غير متاحة بعد»: the older
        // function counts the link types decision ٦٠ hides.
        if (graphFunctionMissing(error.code)) return json({ available: false });
        console.error('[citations] law links failed:', error.code ?? 'no-code', error.message);
        return json({ error: 'تعذّر تحميل خريطة التشابك' }, 500);
      }
      return json({ available: true, ...shapeLawLinks(data) });
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
