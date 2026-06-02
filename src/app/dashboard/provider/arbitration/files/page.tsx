"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen, FileText, FilePdf, FileDoc, ArrowSquareOut,
  DownloadSimple, MagnifyingGlass, CalendarBlank, SealCheck,
  FunnelSimple, Upload,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type FileType = "pdf" | "docx" | "xlsx" | "img";
type Category = "memo" | "contract" | "evidence" | "award" | "correspondence";

interface CaseFile {
  id: number;
  caseNumber: string;
  name: string;
  type: FileType;
  category: Category;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
  isVerified: boolean;
}

const FILES: CaseFile[] = [
  {
    id: 1, caseNumber: "ARB-2026-001",
    name: "مذكرة المدّعي الابتدائية.pdf", type: "pdf", category: "memo",
    uploadedBy: "أ. فهد الشهري", uploadedAt: "١ مارس ٢٠٢٦", size: "٢.٤ MB", isVerified: true,
  },
  {
    id: 2, caseNumber: "ARB-2026-001",
    name: "عقد المقاولة الأصلي — مشروع الأبراج.pdf", type: "pdf", category: "contract",
    uploadedBy: "أ. فهد الشهري", uploadedAt: "١ مارس ٢٠٢٦", size: "٥.١ MB", isVerified: true,
  },
  {
    id: 3, caseNumber: "ARB-2026-001",
    name: "مذكرة دفاع المدّعى عليه.docx", type: "docx", category: "memo",
    uploadedBy: "أ. سلطان المطيري", uploadedAt: "١٥ مارس ٢٠٢٦", size: "١.٨ MB", isVerified: true,
  },
  {
    id: 4, caseNumber: "ARB-2026-001",
    name: "تقرير الخبير الهندسي.pdf", type: "pdf", category: "evidence",
    uploadedBy: "م. ناصر القحطاني (خبير)", uploadedAt: "٢٠ مارس ٢٠٢٦", size: "٨.٣ MB", isVerified: true,
  },
  {
    id: 5, caseNumber: "ARB-2026-002",
    name: "عقد توريد البرمجيات.pdf", type: "pdf", category: "contract",
    uploadedBy: "أ. ريم الدوسري", uploadedAt: "١٢ يناير ٢٠٢٦", size: "٣.٢ MB", isVerified: false,
  },
  {
    id: 6, caseNumber: "ARB-2026-002",
    name: "مراسلات الإلغاء وسجل الطلبات.xlsx", type: "xlsx", category: "correspondence",
    uploadedBy: "أ. محمد السالم", uploadedAt: "٢٠ يناير ٢٠٢٦", size: "١.١ MB", isVerified: false,
  },
];

const CATEGORY_CONFIG: Record<Category, { label: string; bg: string; color: string }> = {
  memo:           { label: "مذكرة",       bg: "bg-blue-500/10",    color: "text-blue-500"    },
  contract:       { label: "عقد",          bg: "bg-amber-500/10",   color: "text-amber-500"   },
  evidence:       { label: "دليل",         bg: "bg-purple-500/10",  color: "text-purple-500"  },
  award:          { label: "حكم",          bg: "bg-emerald-500/10", color: "text-emerald-500" },
  correspondence: { label: "مراسلة",       bg: "bg-gray-400/10",    color: "text-gray-400"    },
};

const FILE_ICON: Record<FileType, React.ElementType> = {
  pdf:  FilePdf,
  docx: FileDoc,
  xlsx: FileText,
  img:  FileText,
};

export default function ArbitrationFilesPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Category>("all");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const filtered = FILES.filter(f =>
    (filter === "all" || f.category === filter) &&
    (f.name.includes(search) || f.caseNumber.includes(search))
  );

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.32 } }),
  };

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              مذكرات وملفات القضايا
            </h1>
            <p className={`text-sm mt-0.5 ${muted}`}>{filtered.length} ملف</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
              <MagnifyingGlass size={14} className={muted} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث..." className={`bg-transparent outline-none text-sm w-40 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`}
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition">
              <Upload size={15} /> رفع ملف
            </button>
          </div>
        </motion.div>

        {/* Category filters */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "memo", "contract", "evidence", "award", "correspondence"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold transition-all ${
                filter === f
                  ? isDark ? "bg-[#C8A762] text-[#1a1035]" : "bg-indigo-600 text-white"
                  : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {f === "all" ? "الكل" : CATEGORY_CONFIG[f].label}
            </button>
          ))}
        </div>

        {/* Files list */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-5">اسم الملف</span>
            <span className="col-span-2">القضية</span>
            <span className="col-span-2">التصنيف</span>
            <span className="col-span-2">رافع الملف</span>
            <span className="col-span-1 text-center">إجراء</span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-[#2d3748]">
            {filtered.map((file, i) => {
              const catConf = CATEGORY_CONFIG[file.category];
              const FileIcon = FILE_ICON[file.type];
              return (
                <motion.div key={file.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className={`grid grid-cols-12 items-center px-5 py-3.5 hover:${isDark ? "bg-white/2" : "bg-gray-50"} transition-colors`}>
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                    <FileIcon size={20} weight="duotone" className={isDark ? "text-indigo-400 shrink-0" : "text-indigo-600 shrink-0"} />
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? "text-gray-100" : "text-gray-800"}`}>{file.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <CalendarBlank size={10} className={muted} />
                        <span className={`text-[10px] ${muted}`}>{file.uploadedAt}</span>
                        <span className={`text-[10px] ${muted}`}>· {file.size}</span>
                        {file.isVerified && <SealCheck size={10} weight="fill" className="text-emerald-500" />}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"}`}>{file.caseNumber}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catConf.bg} ${catConf.color}`}>{catConf.label}</span>
                  </div>
                  <div className="col-span-2">
                    <p className={`text-[10px] ${muted} truncate`}>{file.uploadedBy}</p>
                  </div>
                  <div className="col-span-1 flex justify-center gap-1.5">
                    <button title="تحميل" className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                      <DownloadSimple size={14} />
                    </button>
                    <button title="فتح" className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                      <ArrowSquareOut size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center shadow-sm`}>
            <FolderOpen size={40} className="mx-auto mb-3 opacity-20" />
            <p className={`text-sm ${muted}`}>لا توجد ملفات</p>
          </div>
        )}

      </div>
    </div>
  );
}
