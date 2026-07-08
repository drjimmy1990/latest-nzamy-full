"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Article,
  Archive,
  CheckCircle,
  Clock,
  Eye,
  MagnifyingGlass,
  MagicWand,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { PLATFORM_BLOG_ARTICLES } from "@/constants/platformContent";
import type { PlatformContentItem, PlatformContentStatus } from "@/types/adminBackendReady";

const STATUS_LABEL: Record<PlatformContentStatus, string> = {
  published: "منشور",
  draft: "مسودة",
  review: "للمراجعة",
  archived: "مؤرشف",
};

const INITIAL_ARTICLES: PlatformContentItem[] = PLATFORM_BLOG_ARTICLES.map((article, index) => ({
  id: article.id,
  type: "article",
  title: article.title,
  status: article.status,
  seoScore: article.seoScore,
  author: article.author.name,
  revision: index + 1,
  publishedAt: article.publishedDate,
}));

const EMPTY_ARTICLE: PlatformContentItem = {
  id: "draft-article",
  type: "article",
  title: "",
  status: "draft",
  seoScore: 70,
  author: "فريق المحتوى",
  revision: 1,
};

// Rich content fields the CMS editor manages alongside the PlatformContentItem
// (cover image, excerpt, category, slug, markdown body).
interface ArticleContent {
  slug: string;
  cover: string;
  excerpt: string;
  category: string;
  body: string;
}
const EMPTY_CONTENT: ArticleContent = { slug: "", cover: "", excerpt: "", category: "", body: "" };

// ─── DB row → PlatformContentItem mapping ────────────────────────────────────
interface ArticleRow {
  id: string;
  slug?: string;
  title: string;
  status?: string | null;
  author_name?: string | null;
  views?: number | null;
  published_at?: string | null;
  cover?: string | null;
  excerpt?: string | null;
  category?: string | null;
  body?: string | null;
}

const DB_STATUS_MAP: Record<string, PlatformContentStatus> = {
  draft: "draft",
  published: "published",
  archived: "archived",
  review: "review",
};

function rowToItem(row: ArticleRow, index: number): PlatformContentItem {
  return {
    id: row.id,
    slug: row.slug || row.id,
    type: "article",
    title: row.title,
    status: DB_STATUS_MAP[row.status ?? "draft"] ?? "draft",
    seoScore: 80,
    author: row.author_name || "فريق المحتوى",
    revision: index + 1,
    publishedAt: row.published_at ?? undefined,
  };
}

// Map the admin UI status onto the DB's allowed statuses (no 'review' column).
function toDbStatus(status: PlatformContentStatus): string {
  return status === "review" ? "draft" : status;
}

function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${base || "article"}-${Date.now().toString(36)}`;
}

export default function AdminArticlesPage() {
  const { isDark } = useTheme();
  const [articles, setArticles] = useState<PlatformContentItem[]>(INITIAL_ARTICLES);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<PlatformContentStatus | "all">("all");
  const [draft, setDraft] = useState<PlatformContentItem | null>(null);
  const [content, setContent] = useState<ArticleContent>(EMPTY_CONTENT);
  const [toast, setToast] = useState("إدارة المقالات: مرتبطة بقاعدة البيانات عبر CMS API.");

  // ── Load articles from the CMS API (falls back to the static catalog) ──
  const fetchArticles = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/articles", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: ArticleRow[] };
      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.length > 0) setArticles(rows.map(rowToItem));
    } catch {
      // keep the fallback catalog on failure
    }
  }, []);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  const filteredArticles = articles.filter((article) => {
    const matchesSearch = article.title.includes(search) || article.author.includes(search);
    const matchesStatus = selectedStatus === "all" || article.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = useMemo(() => {
    return {
      total: articles.length,
      published: articles.filter((article) => article.status === "published").length,
      review: articles.filter((article) => article.status === "review").length,
      seoReady: articles.filter((article) => (article.seoScore ?? 0) >= 85).length,
    };
  }, [articles]);

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function openNewArticle() {
    setContent(EMPTY_CONTENT);
    setDraft({ ...EMPTY_ARTICLE, id: `draft-${articles.length + 1}` });
  }

  // A draft coming from "new" has a synthetic id (draft-*); existing DB rows
  // have a uuid id and go through PATCH.
  const isNewDraft = (id: string) => id.startsWith("draft");

  // Open the editor for an existing article — fetch its full row (cover/excerpt/
  // category/body) so those fields pre-fill (the list GET omits heavy body text).
  async function openEdit(article: PlatformContentItem) {
    setDraft(article);
    setContent(EMPTY_CONTENT);
    if (isNewDraft(article.id)) return;
    try {
      const res = await fetch(`/api/v1/admin/articles/${article.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: ArticleRow };
      const row = json.data;
      if (row) {
        setContent({
          slug: row.slug ?? "",
          cover: row.cover ?? "",
          excerpt: row.excerpt ?? "",
          category: row.category ?? "",
          body: row.body ?? "",
        });
      }
    } catch {
      /* keep empty content on failure */
    }
  }

  async function saveDraft() {
    if (!draft?.title.trim()) {
      setToast("المقال يحتاج عنوان قبل تجهيزه للنشر.");
      return;
    }
    const current = draft;
    const currentContent = content;
    // Optimistic local update so the UI stays responsive.
    const normalized = { ...current, revision: current.revision + 1 };
    setArticles((list) => {
      const exists = list.some((article) => article.id === normalized.id);
      return exists ? list.map((article) => (article.id === normalized.id ? normalized : article)) : [normalized, ...list];
    });
    setDraft(null);
    setContent(EMPTY_CONTENT);
    try {
      if (isNewDraft(current.id)) {
        const res = await fetch("/api/v1/admin/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: current.title.trim(),
            slug: currentContent.slug.trim() || slugify(current.title),
            status: toDbStatus(current.status),
            author_name: current.author,
            cover: currentContent.cover || null,
            excerpt: currentContent.excerpt || null,
            category: currentContent.category || null,
            body: currentContent.body || null,
          }),
        });
        if (!res.ok) throw new Error("create failed");
        setToast(`تم إنشاء "${current.title}" في قاعدة البيانات.`);
      } else {
        const res = await fetch(`/api/v1/admin/articles/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: current.title.trim(),
            status: toDbStatus(current.status),
            author_name: current.author,
            cover: currentContent.cover || null,
            excerpt: currentContent.excerpt || null,
            category: currentContent.category || null,
            body: currentContent.body || null,
          }),
        });
        if (!res.ok) throw new Error("update failed");
        setToast(`تم حفظ التعديلات على "${current.title}".`);
      }
      await fetchArticles();
    } catch {
      setToast("تعذّر الحفظ في قاعدة البيانات — التغيير محلي فقط.");
    }
  }

  async function setArticleStatus(id: string, status: PlatformContentStatus) {
    setArticles((list) => list.map((article) => (article.id === id ? { ...article, status, revision: article.revision + 1 } : article)));
    setToast(`تم تغيير حالة المقال إلى "${STATUS_LABEL[status]}".`);
    if (isNewDraft(id)) return;
    try {
      const res = await fetch(`/api/v1/admin/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toDbStatus(status) }),
      });
      if (!res.ok) throw new Error("status update failed");
      await fetchArticles();
    } catch {
      setToast("تعذّر تحديث الحالة في قاعدة البيانات — التغيير محلي فقط.");
    }
  }

  async function removeArticle(id: string) {
    setArticles((list) => list.filter((article) => article.id !== id));
    setToast("تم حذف المقال.");
    if (isNewDraft(id)) return;
    try {
      const res = await fetch(`/api/v1/admin/articles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await fetchArticles();
    } catch {
      setToast("تعذّر الحذف من قاعدة البيانات — أُزيل من الواجهة فقط.");
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>
              <Article size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>إدارة المقالات</h1>
          </div>
          <p className={`text-sm ${muted}`}>واجهة تحرير ونشر محلية جاهزة لعقد PlatformContentItem.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setToast("توليد AI جاهز كمدخل واجهة فقط. التنفيذ ينتظر خدمة المحتوى والذكاء الاصطناعي.")} className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border ${isDark ? "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            <MagicWand size={16} />
            توليد بالذكاء الاصطناعي
          </button>
          <button onClick={openNewArticle} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
            <Plus size={16} weight="bold" />
            كتابة مقال
          </button>
        </div>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المقالات", value: stats.total, icon: Article },
          { label: "منشورة", value: stats.published, icon: CheckCircle },
          { label: "قيد المراجعة", value: stats.review, icon: Clock },
          { label: "SEO جاهز", value: stats.seoReady, icon: MagicWand },
        ].map((stat) => (
          <div key={stat.label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/5 text-[#C8A762]" : "bg-gray-100 text-[#0B3D2E]"}`}>
              <stat.icon size={22} weight="duotone" />
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>تجهيز مقال</h2>
            <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="العنوان"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="الكاتب"><input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="SEO Score"><input type="number" min={0} max={100} value={draft.seoScore ?? 0} onChange={(event) => setDraft({ ...draft, seoScore: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="الحالة">
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlatformContentStatus })} className={inputClass(isDark)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="التصنيف"><input value={content.category} onChange={(event) => setContent({ ...content, category: event.target.value })} className={inputClass(isDark)} placeholder="مثال: قانون العمل" /></Field>
            <Field label="الرابط (slug)"><input value={content.slug} onChange={(event) => setContent({ ...content, slug: event.target.value })} className={inputClass(isDark)} placeholder="يُولّد تلقائياً إن تُرك فارغاً" dir="ltr" /></Field>
            <Field label="رابط صورة الغلاف"><input value={content.cover} onChange={(event) => setContent({ ...content, cover: event.target.value })} className={inputClass(isDark)} placeholder="/blog/images/name.webp أو https://..." dir="ltr" /></Field>
          </div>
          {content.cover && (
            <div className="h-36 w-full max-w-md rounded-xl border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${content.cover})` }} aria-label="معاينة صورة الغلاف" />
          )}
          <Field label="المقتطف (excerpt)">
            <textarea value={content.excerpt} onChange={(event) => setContent({ ...content, excerpt: event.target.value })} rows={2} className={inputClass(isDark)} />
          </Field>
          <Field label="المحتوى (Markdown)">
            <textarea value={content.body} onChange={(event) => setContent({ ...content, body: event.target.value })} rows={12} className={`${inputClass(isDark)} font-mono leading-6`} dir="auto" />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setDraft(null); setContent(EMPTY_CONTENT); }} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>إلغاء</button>
            <button onClick={saveDraft} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white">حفظ</button>
          </div>
        </motion.div>
      )}

      <div className={`${card} p-2 flex flex-col md:flex-row items-center gap-2`}>
        <div className="relative flex-1 w-full">
          <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${muted}`} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن مقال أو كاتب..." className={`w-full bg-transparent outline-none pr-11 pl-4 py-2.5 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`} />
        </div>
        <div className="flex gap-1 overflow-x-auto w-full md:w-auto">
          {(["all", "published", "review", "draft", "archived"] as const).map((status) => (
            <button key={status} onClick={() => setSelectedStatus(status)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${selectedStatus === status ? (isDark ? "bg-white/10 text-white" : "bg-gray-100 text-gray-900") : muted}`}>
              {status === "all" ? "الكل" : STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className={`text-xs font-bold ${isDark ? "bg-[#161b22] text-gray-400 border-b border-white/10" : "bg-gray-50 text-gray-500 border-b border-gray-200"}`}>
                <th className="px-6 py-4">عنوان المقال</th>
                <th className="px-6 py-4">الكاتب</th>
                <th className="px-6 py-4">SEO</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">Revision</th>
                <th className="px-6 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article) => (
                <tr key={article.id} className={`border-b last:border-0 ${isDark ? "border-white/5 hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"}`}>
                  <td className="px-6 py-5">
                    <p className={`text-sm font-bold max-w-[360px] ${isDark ? "text-gray-200" : "text-gray-900"}`}>{article.title}</p>
                    <p className={`text-xs font-mono ${muted}`}>{article.slug || article.id}</p>
                  </td>
                  <td className={`px-6 py-5 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{article.author}</td>
                  <td className="px-6 py-5">
                    <div className={`w-16 h-1.5 rounded-full ${isDark ? "bg-white/10" : "bg-gray-200"}`}>
                      <div className={`h-full rounded-full ${(article.seoScore ?? 0) >= 85 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${article.seoScore ?? 0}%` }} />
                    </div>
                  </td>
                  <td className="px-6 py-5"><StatusBadge status={article.status} /></td>
                  <td className={`px-6 py-5 text-xs font-mono ${muted}`}>v{article.revision}</td>
                  <td className="px-6 py-5">
                    <div className="flex gap-1">
                      <Link href={`/blog/${article.slug || article.id}`} title="معاينة" className={actionClass(isDark)}><Eye size={14} /></Link>
                      <button title="تعديل" onClick={() => openEdit(article)} className={actionClass(isDark)}><PencilSimple size={14} /></button>
                      <button title="أرشفة" onClick={() => setArticleStatus(article.id, "archived")} className={actionClass(isDark)}><Archive size={14} /></button>
                      <button title="حذف محلي" onClick={() => removeArticle(article.id)} className={actionClass(isDark)}><Trash size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredArticles.length === 0 && <div className={`p-12 text-center ${muted}`}>لا توجد نتائج مطابقة للبحث</div>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PlatformContentStatus }) {
  const className =
    status === "published" ? "bg-emerald-500/10 text-emerald-500" :
    status === "review" ? "bg-blue-500/10 text-blue-500" :
    status === "draft" ? "bg-amber-500/10 text-amber-500" :
    "bg-rose-500/10 text-rose-500";
  return <span className={`inline-flex text-[11px] px-2 py-1 rounded-full font-bold ${className}`}>{STATUS_LABEL[status]}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}

function inputClass(isDark: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0d1117] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`;
}

function actionClass(isDark: boolean) {
  return `p-2 rounded-lg border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`;
}
