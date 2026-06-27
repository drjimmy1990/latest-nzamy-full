import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";

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

  const adminClient = await createServiceClient();

  // Determine which tables to fetch from based on category filter
  const fetchLaws = !category || (category !== "تعاميم ومراسم" && category !== "مبادئ قضائية" && category !== "فقه وشريعة");
  const fetchDecrees = !category || category === "تعاميم ومراسم";
  const fetchPrinciples = !category || category === "مبادئ قضائية";
  const fetchFeqh = !category || category === "فقه وشريعة";

  try {
    const queries: PromiseLike<any>[] = [];

    // Setup query slots corresponding to tables
    if (fetchLaws) {
      let q = adminClient
        .schema("library")
        .from("laws")
        .select("slug, title, type, section_name, issuing_body, status, total_articles, issue_date_hijri");
      if (search) {
        q = q.ilike("title", `%${search}%`);
      }
      if (category) {
        q = q.or(`section_name.eq.${category},type.eq.${category}`);
      }
      queries.push(q.then(res => ({ type: "law", data: res.data || [], error: res.error })));
    } else {
      queries.push(Promise.resolve({ type: "law", data: [], error: null }));
    }

    if (fetchDecrees) {
      let q = adminClient
        .schema("library")
        .from("decrees_circulars")
        .select("id, title, issuer, date");
      if (search) {
        q = q.ilike("title", `%${search}%`);
      }
      queries.push(q.then(res => ({ type: "decree", data: res.data || [], error: res.error })));
    } else {
      queries.push(Promise.resolve({ type: "decree", data: [], error: null }));
    }

    if (fetchPrinciples) {
      let q = adminClient
        .schema("library")
        .from("principles")
        .select("id, text, issuing_body, session_date");
      if (search) {
        q = q.ilike("text", `%${search}%`);
      }
      queries.push(q.then(res => ({ type: "principle", data: res.data || [], error: res.error })));
    } else {
      queries.push(Promise.resolve({ type: "principle", data: [], error: null }));
    }

    if (fetchFeqh) {
      let q = adminClient
        .schema("library")
        .from("feqh_books")
        .select("id, title, author");
      if (search) {
        q = q.ilike("title", `%${search}%`);
      }
      queries.push(q.then(res => ({ type: "feqh", data: res.data || [], error: res.error })));
    } else {
      queries.push(Promise.resolve({ type: "feqh", data: [], error: null }));
    }

    const results = await Promise.all(queries);

    // Check for errors
    for (const res of results) {
      if (res.error) {
        return NextResponse.json({ error: res.error.message }, { status: 500 });
      }
    }

    // Map and transform results
    const entries: any[] = [];

    const lawsRes = results.find(r => r.type === "law")?.data || [];
    const decreesRes = results.find(r => r.type === "decree")?.data || [];
    const principlesRes = results.find(r => r.type === "principle")?.data || [];
    const feqhRes = results.find(r => r.type === "feqh")?.data || [];

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

    return NextResponse.json({
      entries,
      total: entries.length
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
