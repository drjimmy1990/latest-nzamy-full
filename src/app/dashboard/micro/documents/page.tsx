"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen, MagnifyingGlass, DownloadSimple, Eye,
  FilePdf, FileDoc, FileImage, FunnelSimple, Clock,
  Folder, X, Upload, CheckCircle, Trash,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type FileType = "pdf" | "docx" | "image" | "other";
type DocCategory = "all" | "contracts" | "cases" | "notices" | "personal" | "other";

interface Document {
  id: string;
  name: string;
  category: DocCategory;
  fileType: FileType;
  size: string;
  uploadedDate: string;
  uploadedBy: string;
  caseRef?: string;
}

const DOCUMENTS: Document[] = [
  { id: "D-001", name: "عقد إيجار المحل التجاري.pdf",         category: "contracts", fileType: "pdf",   size: "١.٢ م.ب",  uploadedDate: "١٥ مارس ٢٠٢٦",  uploadedBy: "نورة الزهراني", caseRef: "CTR-001" },
  { id: "D-002", name: "مذكرة دفاع — قضية عمالية.pdf",       category: "cases",     fileType: "pdf",   size: "٨٠٠ ك.ب",  uploadedDate: "٢٠ أبريل ٢٠٢٦", uploadedBy: "خالد الحربي",   caseRef: "C-2025-001" },
  { id: "D-003", name: "وكالة قانونية — موثقة.pdf",           category: "personal",  fileType: "pdf",   size: "٣٠٠ ك.ب",  uploadedDate: "١ مارس ٢٠٢٦",   uploadedBy: "أنت" },
  { id: "D-004", name: "إشعار قانوني — صادر.docx",           category: "notices",   fileType: "docx",  size: "٢٠٠ ك.ب",  uploadedDate: "٥ أبريل ٢٠٢٦",  uploadedBy: "أنت" },
  { id: "D-005", name: "لقطة شاشة — إيصال دفع.jpg",          category: "cases",     fileType: "image", size: "٤٥٠ ك.ب",  uploadedDate: "١٢ أبريل ٢٠٢٦", uploadedBy: "أنت",           caseRef: "C-2025-002" },
  { id: "D-006", name: "عقد توريد الخدمات — مسودة.docx",     category: "contracts", fileType: "docx",  size: "١.٥ م.ب",  uploadedDate: "٢٤ أبريل ٢٠٢٦", uploadedBy: "أنت",           caseRef: "CTR-002" },
  { id: "D-007", name: "تقرير تقييم المخاطر.pdf",             category: "other",     fileType: "pdf",   size: "٢.١ م.ب",  uploadedDate: "١٠ مارس ٢٠٢٦",  uploadedBy: "علي السعدي" },
];

const CATEGORIES: { key: DocCategory; label: string; icon: React.ElementType }[] = [
  { key: "all",       label: "الكل",        icon: FolderOpen },
  { key: "contracts", label: "العقود",      icon: Folder },
  { key: "cases",     label: "القضايا",     icon: Folder },
  { key: "notices",   label: "الإشعارات",   icon: Folder },
  { key: "personal",  label: "شخصية",       icon: Folder },
  { key: "other",     label: "أخرى",        icon: Folder },
];

const FILE_ICON: Record<FileType, { Icon: React.ElementType; bg: string; color: string }> = {
  pdf:   { Icon: FilePdf,   bg: "bg-red-50 dark:bg-red-900/20",   color: "text-red-500" },
  docx:  { Icon: FileDoc,   bg: "bg-blue-50 dark:bg-blue-900/20", color: "text-blue-500" },
  image: { Icon: FileImage, bg: "bg-emerald-50 dark:bg-emerald-900/20", color: "text-emerald-500" },
  other: { Icon: FolderOpen, bg: "bg-zinc-100 dark:bg-zinc-800", color: "text-zinc-400" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }),
};

export default function MicroDocumentsPage() {
  const { isDark } = useTheme();
  const [category, setCategory] = useState<DocCategory>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Document | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = DOCUMENTS.filter(d =>
    (category === "all" || d.category === category) &&
    (d.name.toLowerCase().includes(search.toLowerCase()) || (d.caseRef ?? "").includes(search))
  );

  const handleUpload = () => {
    setUploadDone(true);
    setTimeout(() => setUploadDone(false), 2200);
  };

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>مستنداتي</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            ملفاتك ووثائقك القانونية في مكان واحد
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          onClick={handleUpload}
          className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl text-sm shadow-md cursor-pointer transition-all ${
            uploadDone
              ? "bg-emerald-500 text-white"
              : "bg-[#0B3D2E] text-white hover:bg-[#0d5238]"
          }`}
        >
          {uploadDone ? <CheckCircle size={16} weight="fill" /> : <Upload size={16} />}
          {uploadDone ? "تم الرفع" : "رفع مستند"}
        </motion.button>
      </motion.div>

      {/* Storage Summary */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>مساحة التخزين</p>
            <p className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>٦.٥ م.ب / ١٠٠ م.ب</p>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            <motion.div
              className="h-full rounded-full bg-gradient-to-l from-[#0B3D2E] to-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: "6.5%" }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
            />
          </div>
          <div className="flex gap-4 mt-3">
            {[
              { label: "إجمالي الملفات", val: DOCUMENTS.length },
              { label: "PDF",   val: DOCUMENTS.filter(d => d.fileType === "pdf").length },
              { label: "Word",  val: DOCUMENTS.filter(d => d.fileType === "docx").length },
              { label: "صور",   val: DOCUMENTS.filter(d => d.fileType === "image").length },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{s.val}</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم الملف أو رقم القضية..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                category === cat.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {cat.label}
              <span className={`text-[10px] px-1.5 rounded-full ${
                category === cat.key ? "bg-white/20" : isDark ? "bg-zinc-700 text-zinc-500" : "bg-white text-zinc-400"
              }`}>
                {cat.key === "all" ? DOCUMENTS.length : DOCUMENTS.filter(d => d.category === cat.key).length}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Documents List */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-12 text-center`}>
            <FolderOpen size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
            <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد مستندات</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ارفع مستندك الأول أو عدّل الفلتر</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {filtered.map((doc, i) => {
              const fi = FILE_ICON[doc.fileType];
              const FileIcon = fi.Icon;
              return (
                <motion.div
                  key={doc.id}
                  variants={fadeUp} initial="hidden" animate="show" custom={i}
                  onClick={() => setSelected(doc)}
                  className={`${card} px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-royal/30 transition-all`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${fi.bg}`}>
                    <FileIcon size={17} weight="duotone" className={fi.color} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{doc.name}</p>
                    <div className={`flex items-center gap-2 text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <span>{doc.size}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} /> {doc.uploadedDate}
                      </span>
                      {doc.caseRef && (
                        <>
                          <span>·</span>
                          <span className="text-royal font-mono">{doc.caseRef}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <motion.button whileHover={{ scale: 1.15 }} onClick={e => e.stopPropagation()}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-zinc-300 hover:text-royal"}`}
                      title="عرض">
                      <Eye size={13} />
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.15 }} onClick={e => e.stopPropagation()}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${isDark ? "text-zinc-600 hover:text-emerald-400" : "text-zinc-300 hover:text-emerald-500"}`}
                      title="تحميل">
                      <DownloadSimple size={13} />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تفاصيل الملف</h2>
                <button onClick={() => setSelected(null)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                  <X size={15} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {(() => {
                  const fi = FILE_ICON[selected.fileType];
                  const FileIcon = fi.Icon;
                  return (
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${fi.bg}`}>
                        <FileIcon size={28} weight="duotone" className={fi.color} />
                      </div>
                      <div>
                        <p className={`text-[14px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>{selected.name}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{selected.size} · {selected.fileType.toUpperCase()}</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "رُفع بواسطة",  val: selected.uploadedBy },
                    { label: "التاريخ",       val: selected.uploadedDate },
                    { label: "الفئة",          val: CATEGORIES.find(c => c.key === selected.category)?.label ?? "—" },
                    { label: "مرجع",           val: selected.caseRef ?? "—" },
                  ].map(item => (
                    <div key={item.label} className={`p-2.5 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                      <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.label}</p>
                      <p className={`text-[12px] font-bold mt-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.val}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] cursor-pointer hover:bg-[#0d5238] transition-colors"
                  >
                    <DownloadSimple size={15} /> تحميل الملف
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }}
                    className={`px-4 py-3 rounded-xl font-bold text-[13px] cursor-pointer transition-colors text-red-400 ${isDark ? "bg-red-900/20 hover:bg-red-900/30" : "bg-red-50 hover:bg-red-100"}`}
                  >
                    <Trash size={14} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
