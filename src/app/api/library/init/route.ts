import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryAccessForUser } from "@/lib/access-control";
import { libraryGate } from "@/lib/library-gate";
import { isFreeLibraryItem } from "@/lib/library-item-access";
import { selectAllPages } from "@/lib/supabase/selectAllPages";
import { EXEC_REGULATION_TYPE, toSectionCode } from "@/app/laws/lawsIndexFacets";

/**
 * Card columns only (LIB-16). `select('*')` shipped every list row's `fts`
 * tsvector, `preamble` and — for collections — a `metadata` blob: 612 KB for
 * the first paint at limit=50, 2.8 MB at limit=200. Each list below names
 * what /laws (src/app/laws/page.tsx lawsList/ordersList/booksList/
 * collectionsList) and /laws/feqh-preview actually read.
 */
const LAW_LIST_COLUMNS =
  "slug, title, title_en, description, type, section_code, section_name, issuing_instrument, issue_date_hijri, total_articles, status, has_merged_regulation";
const DECREE_LIST_COLUMNS =
  "id, title, type, issuer, ref, date, summary_brief, category, hashtags, instrument_ar";
const BOOK_LIST_COLUMNS =
  "id, title, author, school, type, category, description, investigator, total_volumes, total_pages";
const COLLECTION_LIST_COLUMNS =
  "id, title, court, year_hijri, part, source_id, track, description, ruling_count, free, progress, series_id";

/** The whole collections list is read at once; this is only a runaway guard. */
const COLLECTIONS_MAX_ROWS = 5_000;
const MAX_TYPE_FILTER_LENGTH = 60;

export async function GET(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  const supabase = await createClient();

  // Bounded reads: the front-end mounts this once on load, so cap each table
  // to a sane page size instead of `select('*')` (unbounded table scan).
  // Optional ?limit (1-200, default 50) and ?page (1-based) query params.
  // Optional ?section param to load only one section (laws|decrees|principles|books|collections).
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const section = searchParams.get("section"); // optional: load only one section
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // ── Laws filters (LIB-03): the /laws chips and doc-type row filter here, on
  // the whole table, instead of over the pages already in the browser.
  // ?section_code accepts the stored code ('06', '6') or the UI id ('SA-06').
  const rawSectionCode = searchParams.get("section_code");
  const lawSectionCode = rawSectionCode ? toSectionCode(rawSectionCode) : null;
  if (rawSectionCode && !lawSectionCode) {
    return NextResponse.json({ error: "رمز القسم غير صالح" }, { status: 400 });
  }
  const lawType = (searchParams.get("type") || "").trim();
  if (lawType.length > MAX_TYPE_FILTER_LENGTH) {
    return NextResponse.json({ error: "نوع الوثيقة غير صالح" }, { status: 400 });
  }

  // ── Paywall: read optional session + library access (guests → free tier).
  // Free users get metadata + a `locked` flag (body fields stripped); pro+ and
  // whitelisted/free items get the full row. The list page reads `free`/`locked`
  // per card to show lock icons.
  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  const { hasFullAccess, whitelistedSlugs, freeItemsByType } = await getLibraryAccessForUser(userId);

  // Strip large body fields from a locked row so the list never leaks paid text.
  const stripFields = (row: Record<string, unknown>, fields: string[]) => {
    for (const f of fields) if (f in row) row[f] = null;
    return row;
  };

  try {
    /**
     * Fetch one section, with a count and an explicit failure marker.
     *
     * THE MARKER, AND WHY THIS ROUTE KEEPS ITS 200. A failed section used to
     * fall through to `data: [], total: 0, hasMore: false` — logged, then
     * handed to the page as a section that genuinely holds nothing. /laws reads
     * `data.laws.data` / `.total` / `.hasMore` per section
     * (src/app/laws/page.tsx:302-312), so an unreadable «الأنظمة» rendered as a
     * library with no laws in it, next to four sections that loaded fine.
     *
     * That last part is the reason a real HTTP error is the WRONG answer here,
     * unlike the sixteen other routes in this pass: the five sections are five
     * independent reads behind one request, and a 500 would throw away four
     * good ones to report the fifth. So this follows the /api/v1/service-requests
     * compromise instead — keep the 200, mark the failure inside the envelope
     * with `degraded: true`, which listFromApi() in
     * src/lib/services/listRead.ts already maps to a failed read.
     *
     * `total` is `null`, not `0`, on failure for the same reason the empty array
     * needed a marker: an unread section has no known size, and «٠ نظام» is a
     * claim about the library rather than about the read.
     */
    // `shape` adds the section's filters and a deterministic order whose last
    // key is unique (LIB-16): offset pages over an unordered select may repeat
    // or skip rows between «تحميل المزيد» clicks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Shape = (q: any) => any;
    const fetchSection = async (
      table: string,
      selectClause: string,
      sectionName: string,
      shape: Shape
    ) => {
      const { data, count, error } = await shape(
        supabase
          .schema("library")
          .from(table)
          .select(selectClause, { count: "exact" })
      ).range(from, to);

      if (error) {
        console.error(`[Library Init API] ${sectionName} error:`, error);
        return {
          data: [] as unknown[],
          total: null,
          hasMore: false,
          page,
          limit,
          degraded: true,
        };
      }

      const total = count ?? 0;
      const items = data || [];
      return {
        data: items,
        total,
        hasMore: from + items.length < total,
        page,
        limit,
        degraded: false,
      };
    };

    // Only fetch requested section(s)
    const shouldFetch = (s: string) => !section || section === s;

    /**
     * The stand-in for a section `?section=` did not ask for. It is neither a
     * failure nor a real read, and `notRequested` says which — without it this
     * envelope is byte-identical to "this section is empty", and the only thing
     * keeping that from being read as one is that /laws happens to only look at
     * the single section it asked for. A caller that iterated all five would be
     * told the library is empty by a route that never queried it.
     *
     * A FACTORY, not a shared constant. It used to be one object handed to up
     * to four sections at once, and the paywall block below assigns straight
     * into `<section>.data` — so those four aliased the same object and wrote
     * over each other. Harmless while every write was `[]`, but the moment a
     * per-section field exists (this `notRequested`, `degraded`, a future
     * count) one section's value silently becomes all of theirs.
     */
    const emptySection = () => ({
      data: [] as unknown[],
      total: null,
      hasMore: false,
      page: 1,
      limit,
      degraded: false,
      notRequested: true,
    });

    /**
     * Collections are read WHOLE (LIB-08): the index had no «تحميل المزيد» for
     * them, so 159 of 209 were unreachable. The list is small (card columns
     * only, no `metadata`), and a second load-more button beside the
     * principles one would be ambiguous. selectAllPages walks past PostgREST's
     * 1,000-row cap should the table ever grow that far. Page 2+ returns an
     * empty page so an old client's load-more cannot duplicate rows.
     */
    const fetchAllCollections = async () => {
      if (page > 1) {
        return { data: [] as unknown[], total: null, hasMore: false, page, limit, degraded: false };
      }
      const { data, error } = await selectAllPages<Record<string, unknown>>(
        (f, t) =>
          supabase
            .schema("library")
            .from("judicial_collections")
            .select(COLLECTION_LIST_COLUMNS)
            .order("title")
            .order("id")
            .range(f, t) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
        { pageSize: 1000, maxRows: COLLECTIONS_MAX_ROWS }
      );
      if (error) {
        console.error("[Library Init API] collections error:", error);
        return { data: [] as unknown[], total: null, hasMore: false, page, limit, degraded: true };
      }
      return { data: data as unknown[], total: data.length, hasMore: false, page, limit: data.length, degraded: false };
    };

    const [laws, decrees, principles, books, collections] = await Promise.all([
      shouldFetch("laws")
        ? fetchSection("laws", LAW_LIST_COLUMNS, "laws", (q) => {
            let out = q;
            if (lawSectionCode) out = out.eq("section_code", lawSectionCode);
            if (lawType) {
              // The executive-regulation filter also lists laws that carry a
              // merged regulation (the page's sub_types rule). The `.or()`
              // string is a fixed literal — user input only ever reaches `.eq`.
              out = lawType === EXEC_REGULATION_TYPE
                ? out.or(`type.eq."${EXEC_REGULATION_TYPE}",has_merged_regulation.is.true`)
                : out.eq("type", lawType);
            }
            // Browse order mirrors the chip order: section, then title.
            return out.order("section_code").order("title").order("slug");
          })
        : Promise.resolve(emptySection()),
      shouldFetch("decrees")
        ? fetchSection("decrees_circulars", DECREE_LIST_COLUMNS, "decrees", (q) => q.order("id"))
        : Promise.resolve(emptySection()),
      shouldFetch("principles")
        ? fetchSection(
            "principles",
            `id, principle_number, issuing_body, text, session_date, decision_number, year_hijri,
             judicial_collections ( id, title, court, track, source_id )`,
            "principles",
            (q) => q.order("id")
          )
        : Promise.resolve(emptySection()),
      shouldFetch("books")
        ? fetchSection("feqh_books", BOOK_LIST_COLUMNS, "books", (q) => q.order("title").order("id"))
        : Promise.resolve(emptySection()),
      shouldFetch("collections")
        ? fetchAllCollections()
        : Promise.resolve(emptySection()),
    ]);

    // ── Apply paywall per row (add free/locked; strip body fields for locked) ──
    const lawsRows = laws.data as unknown as Record<string, unknown>[];
    laws.data = lawsRows.map((row) => {
      const slug = row.slug as string;
      const isFree = isFreeLibraryItem({ contentType: "laws", itemId: slug, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
      return { ...(isFree ? row : stripFields({ ...row }, ["preamble", "description", "article_status_summary"])), free: isFree, locked: !isFree };
    }) as any;

    const decreesRows = decrees.data as unknown as Record<string, unknown>[];
    decrees.data = decreesRows.map((row) => {
      const isFree = hasFullAccess || ((freeItemsByType.decrees as string[]) ?? []).includes(row.id as string);
      return { ...(isFree ? row : stripFields({ ...row }, ["summary_brief", "content", "text"])), free: isFree, locked: !isFree };
    }) as any;

    const principlesRows = principles.data as unknown as Record<string, unknown>[];
    principles.data = principlesRows.map((row) => {
      const isFree = isFreeLibraryItem({ contentType: "principles", itemId: row.id as string, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
      const out = isFree ? { ...row } : stripFields({ ...row }, ["text"]);
      return { ...out, free: isFree, locked: !isFree };
    }) as any;

    // Books + collections are metadata (table-of-contents level); the gated
    // content is in feqh_blocks / principles, so the list is free to browse.
    books.data = (books.data as unknown as Record<string, unknown>[]).map((row) => ({ ...row, free: true, locked: false })) as any;
    collections.data = (collections.data as unknown as Record<string, unknown>[]).map((row) => ({ ...row, free: true, locked: false })) as any;

    return NextResponse.json({
      laws,
      decrees,
      principles,
      books,
      collections,
    });
  } catch (error) {
    console.error("[Library Init API] Error:", error);
    return NextResponse.json({ error: "تعذّر تحميل المكتبة القانونية" }, { status: 500 });
  }
}
