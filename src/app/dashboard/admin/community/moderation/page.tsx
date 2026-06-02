"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  Flag,
  MagnifyingGlass,
  ShieldWarning,
  UserCircle,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import type { CommunityModerationItem, CommunityModerationStatus } from "@/types/adminBackendReady";

const STATUS_LABEL: Record<CommunityModerationStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  escalated: "مصعد قانونياً",
};

const INITIAL_REPORTS: CommunityModerationItem[] = [
  {
    id: "MOD-101",
    postId: "community-1",
    postTitle: "استفسار عن فسخ عقد عمل قبل انتهاء المدة",
    reportReason: "إجابة قد تبدو فتوى قانونية قطعية",
    reporter: "عميل فرد",
    assignedModerator: "نورة القحطاني",
    status: "pending",
    createdAt: "2026-05-20 09:20",
  },
  {
    id: "MOD-102",
    postId: "community-2",
    postTitle: "مناقشة حول شرط عدم المنافسة",
    reportReason: "بلاغ محتوى دعائي",
    reporter: "محامي",
    assignedModerator: "فهد العتيبي",
    status: "escalated",
    createdAt: "2026-05-20 10:05",
  },
  {
    id: "MOD-103",
    postId: "community-3",
    postTitle: "سؤال عن إجراءات مطالبة مالية",
    reportReason: "تكرار سؤال منشور",
    reporter: "مشرف مجتمع",
    status: "pending",
    createdAt: "2026-05-20 11:12",
  },
];

export default function AdminCommunityModerationPage() {
  const { isDark } = useTheme();
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("CommunityModerationItem جاهز كواجهة. قرارات moderation لا تحفظ في باك إند الآن.");

  const filteredReports = reports.filter((item) =>
    [item.postTitle, item.reportReason, item.reporter, item.assignedModerator ?? ""].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  const stats = useMemo(() => ({
    total: reports.length,
    pending: reports.filter((item) => item.status === "pending").length,
    escalated: reports.filter((item) => item.status === "escalated").length,
    resolved: reports.filter((item) => item.status === "approved" || item.status === "rejected").length,
  }), [reports]);

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  function setStatus(id: string, status: CommunityModerationStatus) {
    setReports((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
    setToast(`تم وضع القرار "${STATUS_LABEL[status]}" محلياً. التنفيذ الحقيقي يحتاج moderation API وسجل تدقيق.`);
  }

  function assignModerator(id: string) {
    setReports((current) =>
      current.map((item) => (item.id === id ? { ...item, assignedModerator: item.assignedModerator ? undefined : "مشرف مناوب" } : item)),
    );
    setToast("تم تعديل المشرف المسؤول محلياً فقط. التعيين الحقيقي ينتظر RBAC/Workflow backend.");
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1400px] mx-auto pb-32" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${isDark ? "bg-rose-500/10 text-rose-300" : "bg-rose-50 text-rose-700"}`}>
              <ShieldWarning size={24} weight="duotone" />
            </div>
            <h1 className={`text-3xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>إشراف المجتمع</h1>
          </div>
          <p className={`text-sm ${muted}`}>طابور بلاغات ومراجعة محتوى جاهز للربط، بدون حفظ خادمي.</p>
        </div>
        <span className="text-[11px] px-3 py-2 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 font-bold w-fit">Backend-ready moderation</span>
      </div>

      <div className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي البلاغات", value: stats.total, icon: Flag },
          { label: "بانتظار المراجعة", value: stats.pending, icon: WarningCircle },
          { label: "مصعدة قانونياً", value: stats.escalated, icon: ShieldWarning },
          { label: "قرارات محلية", value: stats.resolved, icon: CheckCircle },
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

      <div className={`${card} p-2 flex items-center gap-2`}>
        <MagnifyingGlass size={16} className={muted} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في البلاغات أو المشرف..." className={`w-full bg-transparent outline-none py-2 text-sm ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredReports.map((item, index) => (
          <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`${card} p-5 space-y-4`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-mono mb-1 ${muted}`}>{item.id} · {item.createdAt}</p>
                <h2 className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>{item.postTitle}</h2>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-gray-50"}`}>
              <p className={`text-xs font-bold mb-1 ${muted}`}>سبب البلاغ</p>
              <p className={`text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{item.reportReason}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}><Flag size={12} /> {item.reporter}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}><UserCircle size={12} /> {item.assignedModerator ?? "غير معين"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStatus(item.id, "approved")} className={actionClass(isDark)}><CheckCircle size={14} /> اعتماد</button>
              <button onClick={() => setStatus(item.id, "rejected")} className={actionClass(isDark)}><XCircle size={14} /> رفض</button>
              <button onClick={() => setStatus(item.id, "escalated")} className={actionClass(isDark)}><ShieldWarning size={14} /> تصعيد</button>
              <button onClick={() => assignModerator(item.id)} className={actionClass(isDark)}><UserCircle size={14} /> تعيين</button>
            </div>
          </motion.div>
        ))}
      </div>
      {filteredReports.length === 0 && <div className={`p-12 text-center ${muted}`}>لا توجد بلاغات مطابقة</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: CommunityModerationStatus }) {
  const className =
    status === "approved" ? "bg-emerald-500/10 text-emerald-500" :
    status === "rejected" ? "bg-rose-500/10 text-rose-500" :
    status === "escalated" ? "bg-amber-500/10 text-amber-500" :
    "bg-blue-500/10 text-blue-500";
  return <span className={`text-[11px] px-2 py-1 rounded-full font-bold whitespace-nowrap ${className}`}>{STATUS_LABEL[status]}</span>;
}

function actionClass(isDark: boolean) {
  return `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${
    isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"
  }`;
}
