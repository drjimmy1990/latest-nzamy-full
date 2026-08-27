import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/articles — List ALL articles (any status) for the admin CMS.
 *
 * Admin-gated. Uses the service-role client.
 *
 * FAILURE IS A NON-2xx, NOT AN EMPTY LIST. Both branches below used to answer a
 * failed read with `{ data: [] }` and HTTP 200, under a docblock that called it
 * "degrades gracefully". It does not: an empty `data` array is the CMS stating
 * that the platform has no articles, and the admin page (
 * src/app/dashboard/admin/content/articles/page.tsx:132) reads exactly that
 * array. A 500 was chosen over keeping the 200 with a `degraded: true` marker
 * (the /api/v1/service-requests compromise) because no caller here depends on
 * the 200 — that page already has an `!res.ok` branch on the very next line,
 * so this lands without a consumer edit — and a real status code is the
 * stronger answer: it also reaches fetch-level tooling, logs and monitors that
 * never look inside the body.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/articles GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر تحميل المقالات." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/articles GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل المقالات." }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/articles — Create a new article.
 *
 * Admin-gated. Body accepts:
 *   { slug, title, title_en?, excerpt?, excerpt_en?, body?, category?,
 *     cover?, status?, featured?, read_time? }
 *
 * `author_id` is set to the acting admin. When `status === 'published'`,
 * `published_at` is stamped to now.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!slug || !title) {
    return NextResponse.json(
      { error: "الحقول مطلوبة: slug, title" },
      { status: 400 },
    );
  }

  const status = typeof body.status === "string" ? body.status : "draft";

  const insert: Record<string, unknown> = {
    slug,
    title,
    title_en: (body.title_en as string) ?? null,
    excerpt: (body.excerpt as string) ?? null,
    excerpt_en: (body.excerpt_en as string) ?? null,
    body: (body.body as string) ?? null,
    category: (body.category as string) ?? null,
    cover: (body.cover as string) ?? null,
    status,
    featured: body.featured === true,
    read_time: (body.read_time as string) ?? null,
    author_id: gate.userId,
    published_at: status === "published" ? new Date().toISOString() : null,
  };

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("articles")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/articles POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/articles POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء المقال" }, { status: 500 });
  }
}
