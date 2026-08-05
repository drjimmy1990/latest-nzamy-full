import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryAccessForUser } from "@/lib/access-control";
import { libraryGate } from "@/lib/library-gate";

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
  const freeItems = (type: string): string[] => (freeItemsByType[type] as string[]) ?? [];

  // Strip large body fields from a locked row so the list never leaks paid text.
  const stripFields = (row: Record<string, unknown>, fields: string[]) => {
    for (const f of fields) if (f in row) row[f] = null;
    return row;
  };

  try {
    // Helper: fetch a section with count
    const fetchSection = async (
      table: string,
      selectClause: string,
      sectionName: string
    ) => {
      const { data, count, error } = await supabase
        .schema("library")
        .from(table)
        .select(selectClause, { count: "exact" })
        .range(from, to);

      if (error) {
        console.error(`[Library Init API] ${sectionName} error:`, error);
      }

      const total = count ?? 0;
      const items = data || [];
      return {
        data: items,
        total,
        hasMore: from + items.length < total,
        page,
        limit,
      };
    };

    // Only fetch requested section(s)
    const shouldFetch = (s: string) => !section || section === s;

    const emptySection = { data: [], total: 0, hasMore: false, page: 1, limit };

    const [laws, decrees, principles, books, collections] = await Promise.all([
      shouldFetch("laws")
        ? fetchSection("laws", "*", "laws")
        : Promise.resolve(emptySection),
      shouldFetch("decrees")
        ? fetchSection("decrees_circulars", "*", "decrees")
        : Promise.resolve(emptySection),
      shouldFetch("principles")
        ? fetchSection(
            "principles",
            `id, principle_number, issuing_body, text, session_date, decision_number, year_hijri,
             judicial_collections ( id, title, court, track, source_id )`,
            "principles"
          )
        : Promise.resolve(emptySection),
      shouldFetch("books")
        ? fetchSection("feqh_books", "*", "books")
        : Promise.resolve(emptySection),
      shouldFetch("collections")
        ? fetchSection("judicial_collections", "*", "collections")
        : Promise.resolve(emptySection),
    ]);

    // ── Apply paywall per row (add free/locked; strip body fields for locked) ──
    const lawsRows = laws.data as unknown as Record<string, unknown>[];
    laws.data = lawsRows.map((row) => {
      const slug = row.slug as string;
      const isFree = hasFullAccess || whitelistedSlugs.includes(slug) || freeItems("laws").includes(slug);
      return { ...(isFree ? row : stripFields({ ...row }, ["preamble", "description", "article_status_summary"])), free: isFree, locked: !isFree };
    }) as any;

    const decreesRows = decrees.data as unknown as Record<string, unknown>[];
    decrees.data = decreesRows.map((row) => {
      const isFree = hasFullAccess || freeItems("decrees").includes(row.id as string);
      return { ...(isFree ? row : stripFields({ ...row }, ["summary_brief", "content", "text"])), free: isFree, locked: !isFree };
    }) as any;

    const principlesRows = principles.data as unknown as Record<string, unknown>[];
    principles.data = principlesRows.map((row) => {
      const isFree = hasFullAccess || freeItems("precedents").includes(row.id as string);
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
  } catch (error: any) {
    console.error("[Library Init API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
