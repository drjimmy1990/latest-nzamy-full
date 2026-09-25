import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import {
  parseLibraryListParams,
  computeTotalPages,
  planLibraryWindows,
  isRangeNotSatisfiable,
  toIlikeSubstring,
  LIBRARY_TABLE_KEYS,
  type LibraryTableKey,
} from "./query-params";

/**
 * Per-table read spec for the admin list. `key` is the primary key: the
 * deterministic, unique order for .range() paging and the narrow column the
 * head count selects. `searchColumn` is where the search box's substring
 * match applies.
 */
const TABLES: Record<LibraryTableKey, { from: string; key: string; columns: string; searchColumn: string }> = {
  laws: {
    from: "laws",
    key: "slug",
    columns: "slug, title, type, section_name, issuing_body, status, total_articles, issue_date_hijri",
    searchColumn: "title",
  },
  decrees: { from: "decrees_circulars", key: "id", columns: "id, title, issuer, date", searchColumn: "title" },
  principles: { from: "principles", key: "id", columns: "id, text, issuing_body, session_date", searchColumn: "text" },
  feqh: { from: "feqh_books", key: "id", columns: "id, title, author", searchColumn: "title" },
};

export async function GET(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";

  // LIB-15: page/limit bound every select with .range() so it can never hit
  // PostgREST's silent 1000-row cap (laws alone is 5,901 rows; decrees 3,318;
  // principles 18,983 — all three used to be truncated with no error).
  // Parsing/clamping lives in ./query-params.ts so it has a node:test
  // regression test without a network call.
  const { page, limit, offset } = parseLibraryListParams(
    searchParams.get("page"),
    searchParams.get("limit"),
  );

  const adminClient = await createServiceClient();

  // Unified category vocabulary shared with the admin LibraryTab UI.
  // Each law category maps to a keyword matched against section_name/title;
  // the other categories map directly to their content table.
  const CATEGORY_MAP: Record<string, { table: "laws" | "decrees" | "principles" | "feqh"; lawKeyword?: string }> = {
    "أنظمة العمل":       { table: "laws", lawKeyword: "عمل" },
    "أنظمة تجارية":      { table: "laws", lawKeyword: "تجار" },
    "أنظمة جنائية":       { table: "laws", lawKeyword: "جنائ" },
    "الأنظمة المدنية":   { table: "laws", lawKeyword: "مدني" },
    "الأنظمة الإجرائية": { table: "laws", lawKeyword: "إجرائ" },
    "مبادئ قضائية":      { table: "principles" },
    "تعاميم ومراسم":     { table: "decrees" },
    "فقه وشريعة":        { table: "feqh" },
  };
  const cat = category ? CATEGORY_MAP[category] : null;

  // Which tables this request covers: all four in «الكل», one with a category.
  const activeTables = LIBRARY_TABLE_KEYS.filter((t) => !cat || cat.table === t);

  // ONE search rule for every table: a case-insensitive substring match on the
  // table's title/text column. Round 1 switched principles to full-text search
  // on the `simple` config, which cannot see a word behind an attached prefix
  // (ال/بال/وال): «تعويض» found 1,693 principles instead of 3,159.
  const pattern = search ? toIlikeSubstring(search) : null;

  // Every filtered query for a table is built here, so the head count and the
  // ranged read below can never disagree about which rows match.
  const buildQuery = (table: LibraryTableKey, columns: string, options?: { count: "exact"; head: true }): any => {
    const spec = TABLES[table];
    let q: any = adminClient.schema("library").from(spec.from).select(columns, options);
    if (pattern) q = q.ilike(spec.searchColumn, pattern);
    // Map the UI category label to a section_name/title keyword so law
    // categories actually return rows (section_name is e.g. "القسم العمالي",
    // not the UI label "أنظمة العمل").
    if (table === "laws" && cat?.lawKeyword) {
      q = q.or(`section_name.ilike.%${cat.lawKeyword}%,title.ilike.%${cat.lawKeyword}%`);
    }
    return q;
  };

  try {
    // 1. Head counts first (no rows), one per active table, with the same
    //    filters as the read. These are the true per-table totals.
    const countResults = await Promise.all(
      activeTables.map(async (table) => {
        const res = await buildQuery(table, TABLES[table].key, { count: "exact", head: true });
        return { table, count: res.count, error: res.error };
      }),
    );
    for (const res of countResults) {
      if (res.error || typeof res.count !== "number") {
        console.error("[admin/library] GET count error:", res.table, res.error?.message ?? "count missing");
        return NextResponse.json(
          { error: "حدث خطأ أثناء جلب سجلات المكتبة" },
          { status: 500 },
        );
      }
    }
    const activeCounts: Partial<Record<LibraryTableKey, number>> = {};
    for (const res of countResults) activeCounts[res.table] = res.count as number;

    // 2. Range only the tables that still have rows at this offset (see
    //    planLibraryWindows). In «الكل» mode the same page/limit window is
    //    applied to each table independently — there is no single key to page
    //    a combined heterogeneous view by — so page 5 shows rows 201–250 of
    //    laws, decrees and principles and nothing from feqh_books (185 rows).
    const windows = planLibraryWindows(activeCounts, offset, limit);
    const readResults = await Promise.all(
      windows.map(async (w) => {
        const res = await buildQuery(w.table, TABLES[w.table].columns)
          .order(TABLES[w.table].key)
          .range(w.from, w.to);
        return { table: w.table, data: (res.data ?? []) as any[], error: res.error };
      }),
    );

    // A query error must not become an empty 200 — the admin would read that
    // as "no records" instead of "the read failed". The one exception is
    // PGRST103: rows deleted between the count and the read leave the window
    // past the end, which is an empty window, not a failure.
    const rowsByTable: Partial<Record<LibraryTableKey, any[]>> = {};
    for (const res of readResults) {
      if (res.error && !isRangeNotSatisfiable(res.error)) {
        console.error("[admin/library] GET query error:", res.table, res.error.message);
        return NextResponse.json(
          { error: "حدث خطأ أثناء جلب سجلات المكتبة" },
          { status: 500 },
        );
      }
      rowsByTable[res.table] = res.error ? [] : res.data;
    }

    const counts = {
      laws: activeCounts.laws ?? 0,
      decrees: activeCounts.decrees ?? 0,
      principles: activeCounts.principles ?? 0,
      feqh: activeCounts.feqh ?? 0,
    };
    const total = counts.laws + counts.decrees + counts.principles + counts.feqh;
    // See computeTotalPages' doc comment: in "الكل" mode the same window is
    // requested from all four tables independently, so the number of pages
    // reachable is bounded by the LARGEST table being fetched, not by
    // ceil(total / limit).
    const pages = computeTotalPages(Object.values(counts), limit);

    // Map and transform results
    const entries: any[] = [];

    const lawsRes = rowsByTable.laws ?? [];
    const decreesRes = rowsByTable.decrees ?? [];
    const principlesRes = rowsByTable.principles ?? [];
    const feqhRes = rowsByTable.feqh ?? [];

    lawsRes.forEach((item: any) => {
      entries.push({
        id: item.slug,
        title: item.title,
        category: item.section_name || item.type || "أنظمة ولوائح",
        source: item.issuing_body || "—",
        status: item.status || "active",
        views: item.total_articles || 0,
        date: item.issue_date_hijri || "—"
      });
    });

    decreesRes.forEach((item: any) => {
      entries.push({
        id: item.id,
        title: item.title,
        category: "تعاميم ومراسم",
        source: item.issuer || "—",
        status: "active",
        views: 0,
        date: item.date || "—"
      });
    });

    principlesRes.forEach((item: any) => {
      const truncatedTitle = item.text
        ? item.text.length > 100
          ? item.text.substring(0, 100) + "..."
          : item.text
        : "—";
      entries.push({
        id: item.id,
        title: truncatedTitle,
        category: "مبادئ قضائية",
        source: item.issuing_body || "—",
        status: "active",
        views: 0,
        date: item.session_date || "—"
      });
    });

    feqhRes.forEach((item: any) => {
      entries.push({
        id: item.id,
        title: item.title,
        category: "فقه وشريعة",
        source: item.author || "—",
        status: "active",
        views: 0,
        date: "—"
      });
    });

    // Fetch free items setting.
    //
    // `.maybeSingle()`, not `.single()`, and the error is now read. `.single()`
    // raises PGRST116 when the settings row does not exist yet, so the two
    // cases — "nobody has marked anything free" and "the settings read failed"
    // — arrived identically as an error that was discarded, and BOTH defaulted
    // to the all-empty object below. On a failed read that object is a lie
    // rendered on every row of the tab: LibraryTab derives each item's
    // free/paid badge from it (src/app/dashboard/admin/tabs/LibraryTab.tsx:57),
    // so an admin would see paid content marked paid, free content marked paid
    // too, and no way to tell. A 500 lets that tab show its own error state,
    // which it already has (line 73).
    //
    // With maybeSingle, a genuinely absent row is `data: null, error: null` and
    // still takes the empty default — that one IS true.
    const { data: freeItemsRow, error: freeItemsError } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", "library_free_items")
      .maybeSingle();

    if (freeItemsError) {
      console.error(
        "[admin/library] GET free items read error:",
        freeItemsError.message,
        freeItemsError.code,
      );
      return NextResponse.json(
        { error: "تعذّرت قراءة إعدادات الوصول المجاني للمكتبة." },
        { status: 500 },
      );
    }

    const freeItems = (freeItemsRow?.value as Record<string, string[]>) || {
      laws: [],
      decrees: [],
      principles: [],
      feqh: [],
    };

    // {data, total} — the list envelope convention every other admin/list
    // route uses. `total` is the true combined row count from count:"exact"
    // (not entries.length, which is just this page's size). `pages` is what
    // the client should paginate against (see computeTotalPages); `counts`
    // is the per-table breakdown `total` was summed from, for debugging.
    return NextResponse.json({
      data: entries,
      total,
      pages,
      counts,
      page,
      limit,
      freeItems,
    });

  } catch (err: any) {
    console.error("[admin/library] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب سجلات المكتبة" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  try {
    const { id, type } = await request.json();

    if (!id || !type) {
      return NextResponse.json(
        { error: "المعرف والنوع مطلوبان لحذف السجل" },
        { status: 400 }
      );
    }

    const adminClient = await createServiceClient();

    let table = "";
    let column = "id";

    switch (type) {
      case "law":
        table = "laws";
        column = "slug";
        break;
      case "decree":
        table = "decrees_circulars";
        column = "id";
        break;
      case "principle":
        table = "principles";
        column = "id";
        break;
      case "feqh":
        table = "feqh_books";
        column = "id";
        break;
      default:
        return NextResponse.json(
          { error: "نوع السجل غير صالح" },
          { status: 400 }
        );
    }

    const { error } = await adminClient
      .schema("library")
      .from(table)
      .delete()
      .eq(column, id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "تم حذف السجل بنجاح"
    });

  } catch (err: any) {
    console.error("[admin/library] DELETE error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف السجل" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  // 1. Auth check
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "غير مصرح" },
      { status: adminCheck.status || 403 }
    );
  }

  try {
    const { id, type, free } = await request.json();

    if (!id || !type || typeof free !== "boolean") {
      return NextResponse.json(
        { error: "الحقول مطلوبة: id, type, free" },
        { status: 400 }
      );
    }

    const validTypes = ["law", "decree", "principle", "feqh"] as const;
    type ItemType = (typeof validTypes)[number];
    if (!validTypes.includes(type as ItemType)) {
      return NextResponse.json(
        { error: "نوع السجل غير صالح" },
        { status: 400 }
      );
    }

    // Map API type to freeItems key
    const typeToKey: Record<string, string> = {
      law: "laws",
      decree: "decrees",
      principle: "principles",
      feqh: "feqh",
    };
    const key = typeToKey[type];

    const adminClient = await createServiceClient();

    // Read current free items.
    //
    // THIS ONE DESTROYS DATA, not just a badge. The write at the bottom of this
    // handler is a read-modify-write UPSERT of the whole `value` object, and
    // the read used `.single()` with the error thrown away: any failure to read
    // the existing list defaulted it to empty here, appended the one id being
    // toggled, and upserted that over the real setting — every previously-free
    // law, decree, principle and book silently reverted to paid, from one click
    // that appeared to succeed.
    //
    // So a read error stops the write. An absent row (`data: null, error: null`
    // under maybeSingle) is still the legitimate first-ever toggle and proceeds.
    const { data: row, error: readError } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", "library_free_items")
      .maybeSingle();

    if (readError) {
      console.error(
        "[admin/library] PATCH free items read error:",
        readError.message,
        readError.code,
      );
      return NextResponse.json(
        { error: "تعذّرت قراءة إعدادات الوصول الحالية، ولم يتم حفظ التغيير." },
        { status: 500 },
      );
    }

    const freeItems: Record<string, string[]> = (row?.value as Record<string, string[]>) || {
      laws: [],
      decrees: [],
      principles: [],
      feqh: [],
    };

    // Ensure array exists for the key
    if (!Array.isArray(freeItems[key])) {
      freeItems[key] = [];
    }

    if (free) {
      // Add if not already present
      if (!freeItems[key].includes(String(id))) {
        freeItems[key].push(String(id));
      }
    } else {
      // Remove
      freeItems[key] = freeItems[key].filter((item: string) => item !== String(id));
    }

    // Upsert back
    const { error } = await adminClient
      .from("platform_settings")
      .upsert(
        {
          key: "library_free_items",
          value: freeItems,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      freeItems,
    });
  } catch (err: any) {
    console.error("[admin/library] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث حالة الوصول" },
      { status: 500 }
    );
  }
}
