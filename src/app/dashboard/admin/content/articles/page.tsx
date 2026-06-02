"use client";

import { useMemo, useState } from "react";
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

export default function AdminArticlesPage() {
  const { isDark } = useTheme();
  const [articles, setArticles] = useState(INITIAL_ARTICLES);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<PlatformContentStatus | "all">("all");
  const [draft, setDraft] = useState<PlatformContentItem | null>(null);
  const [toast, setToast] = useState("إدارة المقالات Backend-ready: التغييرات محلية حتى ربط CMS/DB.");

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
    setDraft({ ...EMPTY_ARTICLE, id: `draft-${articles.length + 1}` });
  }

  function saveDraft() {
    if (!draft?.title.trim()) {
      setToast("المقال يحتاج عنوان قبل تجهيزه للنشر.");
      return;
    }
    const normalized = { ...draft, revision: draft.revision + 1 };
    setArticles((current) => {
      const exists = current.some((article) => article.id === normalized.id);
      return exists ? current.map((article) => (article.id === normalized.id ? normalized : article)) : [normalized, ...current];
    });
    setDraft(null);
    setToast(`تم تجهيز "${normalized.title}" محلياً. النشر الحقيقي ينتظر CMS API.`);
  }

  function setArticleStatus(id: string, status: PlatformContentStatus) {
    setArticles((current) => current.map((article) => (article.id === id ? { ...article, status, revision: article.revision + 1 } : article)));
    setToast(`تم تغيير حالة المقال محلياً إلى "${STATUS_LABEL[status]}".`);
  }

  function removeArticle(id: string) {
    setArticles((current) => current.filter((article) => article.id !== id));
    setToast("تم حذف المقال من الواجهة فقط. الحذف الحقيقي يحتاج CMS وAudit trail.");
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>إلغاء</button>
            <button onClick={saveDraft} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white">حفظ محلي</button>
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
                    <p className={`text-xs font-mono ${muted}`}>{article.id}</p>
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
                      <Link href={`/blog/${article.id}`} title="معاينة" className={actionClass(isDark)}><Eye size={14} /></Link>
                      <button title="تعديل" onClick={() => setDraft(article)} className={actionClass(isDark)}><PencilSimple size={14} /></button>
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
