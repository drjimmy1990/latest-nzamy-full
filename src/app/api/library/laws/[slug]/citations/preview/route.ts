import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkLibraryAccess, getLibraryAccessForUser, hasFullLibraryAccess, libraryAccessMemo } from '@/lib/access-control';
import { enforceLibraryDevice } from '@/lib/library/deviceLimitServer';
import { effectiveFreeLimit } from '@/lib/library/previewLimit';
import { libraryGate } from '@/lib/library-gate';
import { lawStatusForDetail } from '@/app/laws/law-status';
import { stripArticleAuditNotes } from '@/lib/library/lawPreambleBlocks';
import { withCleanCardRows } from '@/lib/library/lawSummaryVisibility';
import { articleStatusForDetail } from '../../_article-status';
import { articleDisplayLabel, articleLocatorText } from '../../_article-label';
import { liftRegulationHeading } from '../../_regulation-heading';
import { capTitle, parseRefKey, refHrefs, type RefDocKind, type RefKind } from '../_shape';
import { articleTextOpen, principleTextOpen, subscriberOnlyKind, type PreviewLock } from './_access';
import { isFreeLibraryItem } from '@/lib/library-item-access';
import { collectionFreeCount } from '@/lib/library/publicGuard';
import { loadLibraryGuardSettings } from '@/lib/library/publicGuardServer';

/**
 * GET /api/library/laws/[slug]/citations/preview?key=<graph node key>
 *
 * The TEXT PREVIEW of one item of the reader's links box (owner message 18 Nov,
 * item 6 §4): the article's or the ruling's text alone, with what the box needs
 * for «نسخ», «إضافة للمسودة», «انتقل إلى» and «فتح … كاملاً». Opened on a click
 * only, never on paint.
 *
 * The only part of the box that serves text, so the paywall is HERE
 * (./_access.ts): an article opens by the law reader's own rule (full access, a
 * whitelisted law, or inside the law's free preview window); a principle by
 * full library access, or — O16 (b), batch l11-misc — when it is one of the
 * free items its collection page already shows a non-subscriber in full
 * (principleFreeForVisitor: explicitly free, or among the collection's first
 * public_full_rulings_per_collection items); any other principle and every
 * fiqh text by full library access only (item 6 §5 — a non-subscriber gets the
 * title and `locked: "subscribe"`, never the text); a decree or a whole law is
 * named and linked, never quoted. Text is read with the service role from
 * library.* (server-only since 20260929_01 / 20261016_01), never from the
 * graph's own copy, and cleaned of the corpus's audit notes.
 *
 * A subscriber's text passes the device check (owner ٤٢٧) like a full read. A
 * preview spends no document (owner ٤٤٧ / batch-8: the daily cap counts
 * full-text opens only). The answer depends on the viewer: never cached.
 *
 * An item whose row is gone (the owner's «308» case) answers `found: false`
 * with the link to its document — never a 404 page.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function safeArticleStatus(raw: unknown): string {
  try {
    return articleStatusForDetail(raw);
  } catch {
    return 'status_undeclared';
  }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/** 0-based position of an article in its law (order_index, then id) — the law route's global index. */
async function articlePosition(db: ServiceClient, lawSlug: string, orderIndex: unknown, id: string): Promise<number | null> {
  if (typeof orderIndex !== 'number') return null;
  const lib = db.schema('library');
  const [before, tied] = await Promise.all([
    lib.from('articles').select('id', { count: 'exact', head: true }).eq('law_slug', lawSlug).lt('order_index', orderIndex),
    lib.from('articles').select('id', { count: 'exact', head: true }).eq('law_slug', lawSlug).eq('order_index', orderIndex).lt('id', id),
  ]);
  if (before.error || tied.error || typeof before.count !== 'number' || typeof tied.count !== 'number') return null;
  return before.count + tied.count;
}

/** 0-based position of a principle in its collection, in the page's order (order_index, then id). */
async function principlePosition(db: ServiceClient, collectionId: string, orderIndex: unknown, id: string): Promise<number | null> {
  if (typeof orderIndex !== 'number') return null;
  const lib = db.schema('library');
  const [before, tied] = await Promise.all([
    lib.from('principles').select('id', { count: 'exact', head: true }).eq('collection_id', collectionId).lt('order_index', orderIndex),
    lib.from('principles').select('id', { count: 'exact', head: true }).eq('collection_id', collectionId).eq('order_index', orderIndex).lt('id', id),
  ]);
  if (before.error || tied.error || typeof before.count !== 'number' || typeof tied.count !== 'number') return null;
  return before.count + tied.count;
}

/**
 * O16 (b): is this principle one a non-subscriber already reads in full on its
 * collection page? The page's own rule (precedents/[slug]/route.ts): an
 * explicitly free item, or one of the collection's first
 * collectionFreeCount(...) items. Any failed read answers false (locked).
 */
async function principleFreeForVisitor(db: ServiceClient, userId: string | null, collectionId: string, principleId: string, orderIndex: unknown): Promise<boolean> {
  try {
    const [probe, userAccess, guard, position, total] = await Promise.all([
      checkLibraryAccess(userId, collectionId, 0, 'principles', { includeExplicitFreeItem: false }),
      getLibraryAccessForUser(userId),
      loadLibraryGuardSettings(),
      principlePosition(db, collectionId, orderIndex, principleId),
      db.schema('library').from('principles').select('id', { count: 'exact', head: true }).eq('collection_id', collectionId),
    ]);
    if (total.error || typeof total.count !== 'number') return false;
    const explicitFree = isFreeLibraryItem({
      contentType: 'principles',
      itemId: principleId,
      hasFullAccess: false,
      freeItemsByType: userAccess.freeItemsByType,
      whitelistedLawSlugs: userAccess.whitelistedSlugs,
    });
    const freeLimit = collectionFreeCount(probe, total.count, guard.rulings);
    return principleTextOpen({ isSubscriber: false, explicitFree, freeLimit, position });
  } catch {
    return false;
  }
}

interface PreviewBody {
  found: boolean;
  kind: RefKind;
  title: string;
  docTitle: string;
  docType?: string;
  status: string | null;
  /** «المادة (٥)» as the reader labels it; numberText = the source's own locator (citation). */
  num?: string;
  numberText?: string | null;
  text?: string;
  locked: PreviewLock;
  href: string;
  docHref: string;
  anchorMissing: boolean;
  docKind: RefDocKind;
  docId: string;
}

export async function GET(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  const key = parseRefKey(new URL(request.url).searchParams.get('key'));
  if (!key) return NextResponse.json({ error: 'bad key' }, { status: 400, headers: NO_STORE });

  const supabase = await createClient();
  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // guest
  }
  const db = await createServiceClient();
  const lib = db.schema('library');

  try {
    // O26 (batch l11): the per-law probe below reuses these reads.
    const accessMemo = libraryAccessMemo(userId);
    const isSubscriber = await hasFullLibraryAccess(userId, accessMemo);

    // ── An article of a law ──────────────────────────────────────────────────
    if (key.kind === 'article') {
      const { data: row, error } = await lib
        .from('articles')
        .select('id, law_slug, number, number_text, title, text, original_text, status, order_index')
        .eq('id', key.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return json({ found: false, kind: 'article' });
      const lawSlug = String(row.law_slug ?? '');
      const { data: law, error: lawError } = await lib.from('laws').select('slug, title, type, status').eq('slug', lawSlug).maybeSingle();
      if (lawError) throw lawError;
      if (!law) return json({ found: false, kind: 'article' });

      let open = isSubscriber;
      if (!open) {
        const probe = await checkLibraryAccess(userId, lawSlug, 0, 'laws', { memo: accessMemo });
        const lawOpen = probe.isWhitelisted === true || probe.freeLimit === -1;
        if (lawOpen) open = true;
        else {
          const [position, total] = await Promise.all([
            articlePosition(db, lawSlug, row.order_index, String(row.id)),
            lib.from('articles').select('id', { count: 'exact', head: true }).eq('law_slug', lawSlug),
          ]);
          const freeLimit = typeof total.count === 'number' ? effectiveFreeLimit(probe, total.count) : 0;
          open = articleTextOpen({ isSubscriber: false, lawOpen: false, freeLimit, position });
        }
      }
      if (open && isSubscriber) {
        const refusal = await enforceLibraryDevice(userId, true);
        if (refusal) return refusal;
      }
      const raw = stripArticleAuditNotes(row.text) || stripArticleAuditNotes(row.original_text);
      const links = refHrefs({ docKind: 'law', docId: lawSlug, anchorId: String(row.id), anchorMissing: false });
      const body: PreviewBody = {
        found: true,
        kind: 'article',
        title: capTitle(stripArticleAuditNotes(row.title)),
        docTitle: capTitle(law.title),
        docType: typeof law.type === 'string' ? law.type : '',
        status: safeArticleStatus(row.status),
        num: articleDisplayLabel(row.number_text as string | null, row.number as number | null),
        numberText: articleLocatorText(row.number_text as string | null, row.number as number | null),
        // The line that introduces a regulation leaves the text (its instrument
        // number and date are official metadata — T28-22).
        ...(open ? { text: liftRegulationHeading(raw, !isSubscriber).text } : {}),
        locked: open ? null : 'subscribe',
        ...links,
        anchorMissing: false,
        docKind: 'law',
        docId: lawSlug,
      };
      return json(body);
    }

    // ── A judicial principle / ruling ────────────────────────────────────────
    if (key.kind === 'principle') {
      const { data: row, error } = await lib
        .from('principles')
        .select('id, collection_id, principle_number, issuing_body, text, order_index')
        .eq('id', key.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return json({ found: false, kind: 'principle' });
      const collId = String(row.collection_id ?? '');
      const { data: coll, error: collError } = await lib.from('judicial_collections').select('id, title, court').eq('id', collId).maybeSingle();
      if (collError) throw collError;
      if (!coll) return json({ found: false, kind: 'principle' });
      const subscriberOpen = isSubscriber && subscriberOnlyKind('principle');
      if (subscriberOpen) {
        const refusal = await enforceLibraryDevice(userId, true);
        if (refusal) return refusal;
      }
      // O16 (b): a non-subscriber sees the text of the collection's free items
      // (the ones its page shows in full), and nothing else.
      const open = subscriberOpen || (await principleFreeForVisitor(db, userId, collId, String(row.id), row.order_index));
      const number = row.principle_number;
      const num = number != null && String(number).trim() !== '' ? `المبدأ رقم ${String(number).trim()}` : 'مبدأ قضائي';
      const text = open && typeof row.text === 'string' ? withCleanCardRows(stripArticleAuditNotes(row.text)) : '';
      const body: PreviewBody = {
        found: true,
        kind: 'principle',
        title: capTitle(`${coll.title ?? ''} — ${num}`.replace(/^ — /, '')),
        docTitle: capTitle(String(row.issuing_body || coll.court || coll.title || '')),
        status: null,
        num,
        ...(open ? { text } : {}),
        locked: open ? null : 'subscribe',
        ...refHrefs({ docKind: 'collection', docId: collId, anchorId: String(row.id), anchorMissing: false }),
        anchorMissing: false,
        docKind: 'collection',
        docId: collId,
      };
      return json(body);
    }

    // ── A whole law, a decree, a fiqh text: named and linked, never quoted ──
    if (key.kind === 'law') {
      const { data: law, error } = await lib.from('laws').select('slug, title, status').eq('slug', key.id).maybeSingle();
      if (error) throw error;
      if (!law) return json({ found: false, kind: 'law' });
      return json({
        found: true,
        kind: 'law',
        title: capTitle(law.title),
        docTitle: capTitle(law.title),
        status: lawStatusForDetail(law.status),
        locked: null,
        ...refHrefs({ docKind: 'law', docId: String(law.slug), anchorId: null, anchorMissing: false }),
        anchorMissing: false,
        docKind: 'law',
        docId: String(law.slug),
      } satisfies PreviewBody);
    }
    if (key.kind === 'decree') {
      const { data: decree, error } = await lib.from('decrees_circulars').select('id, title').eq('id', key.id).maybeSingle();
      if (error) throw error;
      if (!decree) return json({ found: false, kind: 'decree' });
      return json({
        found: true,
        kind: 'decree',
        title: capTitle(decree.title),
        docTitle: capTitle(decree.title),
        status: null,
        locked: null,
        ...refHrefs({ docKind: 'order', docId: String(decree.id), anchorId: null, anchorMissing: false }),
        anchorMissing: false,
        docKind: 'order',
        docId: String(decree.id),
      } satisfies PreviewBody);
    }
    // feqh: no fiqh link is shown today (the owner's file has none, and
    // graphLinkTypes.ts maps no type to the fiqh section). Until one is, the
    // preview serves no fiqh text: the box links to the book instead.
    return json({ found: false, kind: key.kind });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('[citations/preview] failed:', e?.code ?? 'no-code', e?.message ?? String(err));
    return NextResponse.json({ error: 'تعذّر تحميل المعاينة' }, { status: 500, headers: NO_STORE });
  }
}
