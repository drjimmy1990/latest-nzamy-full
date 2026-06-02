"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  BookOpen,
  CheckCircle,
  Clock,
  Eye,
  FilePdf,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { COMPANIES_LAW } from "@/app/laws/data";
import type { LegalLibrarySystem } from "@/types/adminBackendReady";

type LawStatus = LegalLibrarySystem["status"];

const STATUS_LABEL: Record<LawStatus, string> = {
  published: "منشور",
  draft: "مسودة",
  archived: "مؤرشف",
};

const articlesCount = COMPANIES_LAW.chapters.reduce((sum, chapter) => sum + chapter.articles.length, 0);

const INITIAL_LAWS: LegalLibrarySystem[] = [
  {
    id: COMPANIES_LAW.id,
    title: COMPANIES_LAW.title,
    category: "أنظمة تجارية",
    sourceUrl: "/laws/companies-law",
    articlesCount,
    amendmentsCount: 0,
    status: "published",
    lastUpdated: COMPANIES_LAW.issuanceDate,
  },
];

const EMPTY_LAW: LegalLibrarySystem = {
  id: "new-law",
  title: "",
  category: "نظام جديد",
  sourceUrl: "",
  articlesCount: 0,
  amendmentsCount: 0,
  status: "draft",
  lastUpdated: "2026-05-20",
};

export default function AdminLawsPage() {
  const { isDark } = useTheme();
  const [laws, setLaws] = useState(INITIAL_LAWS);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<LawStatus | "all">("all");
  const [draft, setDraft] = useState<LegalLibrarySystem | null>(null);
  const [toast, setToast] = useState("المكتبة القانونية Backend-ready: لا توجد إدارة مصادر أو نشر خادمي حتى الآن.");

  const filteredLaws = laws.filter((law) => {
    const matchesSearch = law.title.includes(search) || law.category.includes(search);
    const matchesStatus = selectedStatus === "all" || law.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = useMemo(() => ({
    total: laws.length,
    articles: laws.reduce((sum, law) => sum + law.articlesCount, 0),
    published: laws.filter((law) => law.status === "published").length,
    drafts: laws.filter((law) => law.status === "draft").length,
  }), [laws]);

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function openNewLaw() {
    setDraft({ ...EMPTY_LAW, id: `law-${laws.length + 1}` });
  }

  function saveDraft() {
    if (!draft?.title.trim()) {
      setToast("النظام يحتاج عنوان قبل تجهيزه للربط.");
      return;
    }
    setLaws((current) => {
      const exists = current.some((law) => law.id === draft.id);
      return exists ? current.map((law) => (law.id === draft.id ? draft : law)) : [draft, ...current];
    });
    setDraft(null);
    setToast("تم تجهيز النظام محلياً. النشر الحقيقي يحتاج LegalLibrarySystem API ومراجعة مصادر.");
  }

  function changeStatus(id: string, status: LawStatus) {
    setLaws((current) => current.map((law) => (law.id === id ? { ...law, status } : law)));
    setToast(`تم تغيير حالة النظام محلياً إلى "${STATUS_LABEL[status]}".`);
  }

  function removeLaw(id: string) {
    setLaws((current) => current.filter((law) => law.id !== id));
    setToast("تم حذف النظام من الواجهة فقط. الحذف الحقيقي يحتاج صلاحيات وسجل تدقيق.");
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1600px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>
              <BookOpen size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>المكتبة القانونية</h1>
          </div>
          <p className={`text-sm ${muted}`}>إدارة الأنظمة والمواد كمصدر واجهة جاهز لعقد LegalLibrarySystem.</p>
        </div>
        <button onClick={openNewLaw} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
          <Plus size={16} weight="bold" />
          إضافة نظام جديد
        </button>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الأنظمة", value: stats.total, icon: BookOpen },
          { label: "إجمالي المواد", value: stats.articles, icon: FilePdf },
          { label: "مصادر منشورة", value: stats.published, icon: CheckCircle },
          { label: "مسودات", value: stats.drafts, icon: Clock },
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
            <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>تجهيز نظام قانوني</h2>
            <span className="text-[11px] px-2 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold">Backend-ready</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="العنوان"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="التصنيف"><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="رابط المصدر"><input value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} className={inputClass(isDark)} /></Field>
            <Field label="الحالة">
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LawStatus })} className={inputClass(isDark)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="عدد المواد"><input type="number" value={draft.articlesCount} onChange={(event) => setDraft({ ...draft, articlesCount: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="عدد التعديلات"><input type="number" value={draft.amendmentsCount} onChange={(event) => setDraft({ ...draft, amendmentsCount: Number(event.target.value) })} className={inputClass(isDark)} /></Field>
            <Field label="آخر تحديث"><input type="date" value={draft.lastUpdated} onChange={(event) => setDraft({ ...draft, lastUpdated: event.target.value })} className={inputClass(isDark)} /></Field>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن نظام أو لائحة..." className={`w-full bg-transparent outline-none pr-11 pl-4 py-2.5 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`} />
        </div>
        <div className="flex gap-1 overflow-x-auto w-full md:w-auto">
          {(["all", "published", "draft", "archived"] as const).map((status) => (
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
                <th className="px-6 py-4">النظام</th>
                <th className="px-6 py-4">التصنيف</th>
                <th className="px-6 py-4">المواد</th>
                <th className="px-6 py-4">التعديلات</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">آخر تحديث</th>
                <th className="px-6 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredLaws.map((law) => (
                <tr key={law.id} className={`border-b last:border-0 ${isDark ? "border-white/5 hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"}`}>
                  <td className="px-6 py-5">
                    <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-900"}`}>{law.title}</p>
                    <p className={`text-xs font-mono ${muted}`}>{law.id}</p>
                  </td>
                  <td className={`px-6 py-5 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{law.category}</td>
                  <td className={`px-6 py-5 text-sm font-mono ${isDark ? "text-gray-300" : "text-gray-700"}`}>{law.articlesCount}</td>
                  <td className={`px-6 py-5 text-sm font-mono ${isDark ? "text-gray-300" : "text-gray-700"}`}>{law.amendmentsCount}</td>
                  <td className="px-6 py-5"><StatusBadge status={law.status} /></td>
                  <td className={`px-6 py-5 text-xs font-mono ${muted}`}>{law.lastUpdated}</td>
                  <td className="px-6 py-5">
                    <div className="flex gap-1">
                      <Link href={law.sourceUrl || "/laws"} title="معاينة" className={actionClass(isDark)}><Eye size={14} /></Link>
                      <button title="تعديل" onClick={() => setDraft(law)} className={actionClass(isDark)}><PencilSimple size={14} /></button>
                      <button title="أرشفة" onClick={() => changeStatus(law.id, "archived")} className={actionClass(isDark)}><Archive size={14} /></button>
                      <button title="حذف محلي" onClick={() => removeLaw(law.id)} className={actionClass(isDark)}><Trash size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLaws.length === 0 && <div className={`p-12 text-center ${muted}`}>لا توجد نتائج مطابقة للبحث</div>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LawStatus }) {
  const className =
    status === "published" ? "bg-emerald-500/10 text-emerald-500" :
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
