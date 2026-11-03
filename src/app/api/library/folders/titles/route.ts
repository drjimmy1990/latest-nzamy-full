import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { checkTitleLookup, readJsonObject, type TitleLookupKind } from '../validate';

/**
 * POST /api/library/folders/titles — Arabic titles for library document ids,
 * in ONE call (owner note ٠٣ §٢.٢).
 *
 * «ملاحظاتي وتحديداتي» stores only a page key per note (law_article_notes.page_id
 * — a law slug, `order-<uuid>`, `precedent-principles-<collection>`,
 * `feqh-<book>-<block>`), and older folder items were saved with no title, so
 * both screens showed English or truncated slugs. They now send every id they
 * hold here and render the titles that come back.
 *
 * Body: { laws?: slug[], orders?: uuid[], precedents?: collectionId[],
 *         books?: bookId[] }, ≤ 100 ids per key (../validate checkTitleLookup).
 * Answer: { titles: { laws: {slug: title}, orders: {...}, precedents: {...},
 *           books: {...} }, degraded: kind[] } — an id with no row is absent;
 * a table whose read failed is listed in `degraded` (never reported as
 * "no such document").
 *
 * Reads run on the REQUEST client: every `title` / id column read here is on
 * the anon allow-list (the catalogue cards read them the same way), so no
 * locked column (issue dates, decree text, official links) is touched and no
 * grant is widened. The library gate applies as on every library route.
 */

const TABLES: Record<TitleLookupKind, { table: string; idColumn: string }> = {
  laws: { table: 'laws', idColumn: 'slug' },
  orders: { table: 'decrees_circulars', idColumn: 'id' },
  precedents: { table: 'judicial_collections', idColumn: 'id' },
  books: { table: 'feqh_books', idColumn: 'id' },
};

export async function POST(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const checked = checkTitleLookup(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  try {
    const supabase = await createClient();
    const kinds = Object.keys(TABLES) as TitleLookupKind[];
    const titles: Record<TitleLookupKind, Record<string, string>> = { laws: {}, orders: {}, precedents: {}, books: {} };
    const degraded: TitleLookupKind[] = [];

    await Promise.all(kinds.map(async (kind) => {
      const ids = checked.value[kind];
      if (ids.length === 0) return;
      const { table, idColumn } = TABLES[kind];
      const { data, error } = await supabase
        .schema('library')
        .from(table)
        .select(`${idColumn}, title`)
        .in(idColumn, ids)
        .abortSignal(AbortSignal.timeout(4000));
      if (error) {
        console.error(`[Folder titles] ${table} read failed:`, error);
        degraded.push(kind);
        return;
      }
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = row[idColumn];
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        if (typeof id === 'string' && title) titles[kind][id] = title;
      }
    }));

    return NextResponse.json(
      { titles, degraded },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (error) {
    console.error('[Folder titles] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
