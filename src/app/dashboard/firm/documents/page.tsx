"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Plus, UploadSimple, FileText, Download, Eye, TrashSimple, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { DocumentsTrashPanel } from "@/components/documents/DocumentsTrashPanel";

const MOCK_DOCS = [
  { id: "1", name: "صك ملكية شركة الأفق",          type: "pdf",  size: "٢.١ MB", date: "١٢ أبريل ٢٠٢٤", case: "نزاع تجاري — الأفق" },
  { id: "2", name: "عقد التأسيس — مجموعة الذهبي", type: "pdf",  size: "٩٠٠ KB", date: "٨ أبريل ٢٠٢٤",  case: "عقد بناء — الذهبي" },
  { id: "3", name: "براءة اختراع — الإبداع التقني", type: "docx", size: "١.٣ MB", date: "٥ أبريل ٢٠٢٤",  case: "ملكية فكرية" },
  { id: "4", name: "حكم محكمة الاستئناف ٢١٣",     type: "pdf",  size: "٧٢٠ KB", date: "١ أبريل ٢٠٢٤",  case: "استئناف العقار ٢١٣" },
  { id: "5", name: "محضر جلسة صلح — القحطاني",    type: "pdf",  size: "٤٥٠ KB", date: "٢٨ مارس ٢٠٢٤", case: "قضية عمالية ٤٥٦٧" },
];

export default function FirmDocumentsPage() {
  const { isDark } = useTheme();
  const [trashOpen, setTrashOpen] = useState(false);
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            المستندات
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            أرشيف المكتب — {MOCK_DOCS.length} مستند
          </p>
        </div>
        <div className="flex gap-2">
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border cursor-pointer transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <UploadSimple size={15} />
            رفع مستند
            <input type="file" className="hidden" />
          </label>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            مجلد جديد
          </button>
        </div>
      </motion.div>

      <div className="space-y-2">
        {MOCK_DOCS.map((d, i) => (
          <motion.div key={d.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${d.type === "pdf" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
              <FileText size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate mb-0.5 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{d.name}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {d.case} · {d.size} · {d.date}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
              <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* سلة المحذوفات — a real bin over the account's real documents, kept
          separate from the list above: that list is still MOCK_DOCS (owner
          item pending), so it carries no delete control and no legal-hold
          toggle to give it copy or state that would not be real. This panel
          itself is real (documentService.getTrash/restoreDocument/
          purgeDocument), independent of what the list above shows. */}
      <div className={`${card} overflow-hidden`}>
        <button
          type="button"
          onClick={() => setTrashOpen((v) => !v)}
          className={`flex w-full items-center justify-between gap-2 p-4 text-[13px] font-bold ${
            isDark ? "text-zinc-300" : "text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <TrashSimple size={15} weight="bold" /> سلة المحذوفات
          </span>
          {trashOpen ? <CaretUp size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
        </button>
        {trashOpen && (
          <div className="px-4 pb-4">
            <DocumentsTrashPanel isDark={isDark} showHeader={false} />
          </div>
        )}
      </div>
    </div>
  );
}
