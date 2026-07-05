"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  NotePencil, Highlighter, CaretDown, CaretUp, ArrowSquareOut, Trash,
  Microphone, List, SquaresFour
} from "@phosphor-icons/react";

interface NoteEntry {
  pageId: string;
  lawName: string;
  text: string;
  hasAudio: boolean;
  hasStrokes: boolean;
  updatedAt: number;
}

type Tab = "all" | "highlights" | "notes";
type ViewMode = "flat" | "grouped";

function getCleanDocumentName(pageId: string): string {
  const map: Record<string, string> = {
    "companies-law": "نظام الشركات",
    "labor-law": "نظام العمل",
    "civil-procedure": "نظام المرافعات الشرعية",
    "criminal-procedure": "نظام الإجراءات الجزائية",
    "commercial-court": "نظام المحاكم التجارية",
    "civil-transactions": "نظام المعاملات المدنية",
    "evidence-law": "نظام الإثبات",
    "prec-moj-01": "مبدأ المحكمة العليا: أثر التماس إعادة النظر على التنفيذ",
    "prec-01": "حكم استئناف تجاري: فسخ عقد توريد لقوة قاهرة",
    "prec-02": "حكم محكمة تجارية: صورية عقد بيع حصص وبطلانه",
    "prec-03": "حكم استئناف عمالي: تعويض الفصل التعسفي وتصفية الحقوق",
    "prec-04": "حكم جزائي: إدانة بجريمة الابتزاز الإلكتروني",
    "prec-05": "حكم إداري: إلغاء قرار رفض ترقية موظف",
    "prec-06": "حكم عقاري: الحيازة العرفية والسجل الرسمي الثابت",
    "prec-moj-02": "مبدأ المحكمة العليا: سقوط الطعن بالاستئناف لفوات الميعاد",
    "order-1": "أمر ملكي رقم أ/1 بإنشاء المحكمة الدستورية",
    "order-2": "قرار مجلس الوزراء رقم 12 بتعديل اللائحة التنفيذية لنظام العمل",
    "order-3": "تعميم وزارة العدل رقم 3 بخصوص آلية توثيق العقود الإلكترونية",
    "order-4": "أمر ملكي رقم أ/4 بشأن لائحة اختصاصات كتابات العدل الجديدة",
    "ord-1": "أمر ملكي رقم أ/1 بإنشاء المحكمة الدستورية",
    "ord-2": "قرار مجلس الوزراء رقم 12 بتعديل اللائحة التنفيذية لنظام العمل",
    "ord-3": "تعميم وزارة العدل رقم 3 بخصوص آلية توثيق العقود الإلكترونية",
    "ord-4": "أمر ملكي رقم أ/4 بشأن لائحة اختصاصات كتابات العدل الجديدة",
  };
  
  let cleanId = pageId;
  if (pageId.startsWith("order-")) {
    cleanId = pageId.replace("order-", "");
  } else if (pageId.startsWith("judgment-")) {
    cleanId = pageId.replace("judgment-", "");
  } else if (pageId.startsWith("precedent-judgment-")) {
    cleanId = pageId.replace("precedent-judgment-", "");
  }
  
  if (map[cleanId]) return map[cleanId];
  if (map[pageId]) return map[pageId];

  let cleaned = pageId;
  cleaned = cleaned.replace(/^(precedents-|feqh-|orders-|order-|judgment-|precedent-judgment-)/g, "");
  cleaned = cleaned.replace(/(_وزارة_العدل|-وزارة_العدل)$/g, "");
  cleaned = cleaned.replace(/(-منقحة)$/g, " (منقحة)");
  cleaned = cleaned.replace(/---/g, " - ");
  cleaned = cleaned.replace(/-/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

interface DocCategory {
  name: string;
  color: string;
}

function getCategoryInfo(pageId: string, isDark: boolean): DocCategory {
  if (pageId.startsWith("precedents-") || pageId.startsWith("judgment-") || pageId.startsWith("precedent-judgment-")) {
    return {
      name: "المبادئ القضائية",
      color: isDark ? "bg-purple-900/30 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-700 border-purple-200"
    };
  }
  if (pageId.startsWith("feqh-") || pageId.startsWith("book-")) {
    return {
      name: "الكتب الفقهية",
      color: isDark ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  }
  if (pageId.startsWith("orders-") || pageId.startsWith("order-")) {
    return {
      name: "التعاميم والقرارات",
      color: isDark ? "bg-amber-900/30 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"
    };
  }
  return {
    name: "الأنظمة واللوائح",
    color: isDark ? "bg-blue-900/30 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
  };
}

export function MyNotesSection({ isDark, isRTL = true }: { isDark: boolean; isRTL?: boolean }) {
  const [tab, setTab] = useState<Tab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [layoutType, setLayoutType] = useState<"list" | "grid">("list");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const pageIds = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("sticky_note_text_")) {
        pageIds.add(key.replace("sticky_note_text_", ""));
      } else if (key.startsWith("highlighter_strokes_")) {
        pageIds.add(key.replace("highlighter_strokes_", ""));
      } else if (key.startsWith("sticky_note_audio_")) {
        pageIds.add(key.replace("sticky_note_audio_", ""));
      }
    }

    const found: NoteEntry[] = [];
    pageIds.forEach(pageId => {
      const text   = localStorage.getItem(`sticky_note_text_${pageId}`) ?? "";
      const audio  = !!localStorage.getItem(`sticky_note_audio_${pageId}`);
      const strk   = !!localStorage.getItem(`highlighter_strokes_${pageId}`);
      if (text || audio || strk) {
        found.push({
          pageId,
          lawName: getCleanDocumentName(pageId),
          text,
          hasAudio: audio,
          hasStrokes: strk,
          updatedAt: Date.now(),
        });
      }
    });

    setEntries(found);
  }, []);

  const deleteEntry = (pageId: string) => {
    localStorage.removeItem(`sticky_note_text_${pageId}`);
    localStorage.removeItem(`sticky_note_audio_${pageId}`);
    localStorage.removeItem(`sticky_note_pos_${pageId}`);
    localStorage.removeItem(`sticky_note_show_${pageId}`);
    localStorage.removeItem(`highlighter_strokes_${pageId}`);
    setEntries(prev => prev.filter(e => e.pageId !== pageId));
    if (selectedDoc === pageId) {
      setSelectedDoc(null);
    }
  };

  // Get unique documents list for filter chips
  const uniqueDocs = Array.from(new Set(entries.map(e => e.pageId))).map(pageId => ({
    pageId,
    name: getCleanDocumentName(pageId)
  }));

  // Filtering
  let filtered = entries.filter(e => {
    if (tab === "highlights") return e.hasStrokes;
    if (tab === "notes")      return !!e.text || e.hasAudio;
    return true;
  });

  if (selectedDoc) {
    filtered = filtered.filter(e => e.pageId === selectedDoc);
  }

  const card  = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "all",        label: "الكل",         icon: <NotePencil size={12} weight="duotone" /> },
    { id: "highlights", label: "تحديداتي",     icon: <Highlighter size={12} weight="duotone" /> },
    { id: "notes",      label: "ملاحظاتي",     icon: <NotePencil size={12} weight="duotone" /> },
  ];

  const renderEntryRow = (e: NoteEntry) => {
    const isHighlightOnly = e.hasStrokes && !e.text && !e.hasAudio;
    const isNoteOnly = (e.text || e.hasAudio) && !e.hasStrokes;
    
    let rowStyle = "";
    let iconBg = "";
    let iconClass = "";
    
    if (isHighlightOnly) {
      rowStyle = isDark 
        ? "bg-amber-500/[0.02] hover:bg-amber-500/[0.06] border border-amber-500/10 border-r-4 border-r-amber-500/70" 
        : "bg-amber-50/30 hover:bg-amber-50/60 border border-amber-200/30 border-r-4 border-r-amber-400";
      iconBg = isDark ? "bg-amber-900/20" : "bg-amber-50";
      iconClass = "text-amber-500 dark:text-amber-400";
    } else if (isNoteOnly) {
      rowStyle = isDark 
        ? "bg-indigo-500/[0.02] hover:bg-indigo-500/[0.06] border border-indigo-500/10 border-r-4 border-r-indigo-500/70" 
        : "bg-indigo-50/30 hover:bg-indigo-50/60 border border-indigo-200/30 border-r-4 border-r-indigo-400";
      iconBg = isDark ? "bg-indigo-900/20" : "bg-indigo-50";
      iconClass = "text-indigo-500 dark:text-indigo-400";
    } else {
      rowStyle = isDark 
        ? "bg-purple-500/[0.02] hover:bg-purple-500/[0.06] border border-purple-500/10 border-r-4 border-r-purple-500/70" 
        : "bg-purple-50/30 hover:bg-purple-50/60 border border-purple-200/30 border-r-4 border-r-purple-400";
      iconBg = isDark ? "bg-purple-900/20" : "bg-purple-50";
      iconClass = "text-purple-500 dark:text-purple-400";
    }

    const catInfo = getCategoryInfo(e.pageId, isDark);
    const linkPrefix = e.pageId.startsWith("order-") ? "/laws/orders/" :
                       (e.pageId.startsWith("judgment-") || e.pageId.startsWith("precedent-judgment-")) ? "/precedents/judgment/" :
                       e.pageId.startsWith("book-") ? "/book/" : "/laws/";
    const cleanPageId = e.pageId.replace(/^(precedents-|feqh-|orders-|order-|judgment-|precedent-judgment-)/g, "");

    if (layoutType === "grid") {
      return (
        <div
          key={e.pageId}
          className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-40 relative group ${rowStyle}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${catInfo.color}`}>
                {catInfo.name}
              </span>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`${linkPrefix}${cleanPageId}`}
                  className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/10 text-zinc-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"}`}
                >
                  <ArrowSquareOut size={12} />
                </a>
                <button
                  onClick={ev => { ev.stopPropagation(); deleteEntry(e.pageId); }}
                  className={`p-1 rounded-lg transition ${isDark ? "hover:bg-red-900/20 text-zinc-600 hover:text-red-400" : "hover:bg-red-50 text-slate-300 hover:text-red-500"}`}
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>
            <p className={`text-[12px] font-black truncate leading-tight ${isDark ? "text-zinc-200" : "text-slate-900"}`}>
              {e.lawName}
            </p>
            {e.text ? (
              <p className={`text-[10px] line-clamp-3 leading-relaxed mt-1.5 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                {e.text}
              </p>
            ) : (
              <div className={`flex items-center gap-1.5 mt-2 ${muted}`}>
                {e.hasStrokes && <span className="flex items-center gap-0.5 text-[9px]"><Highlighter size={9}/> تحديد</span>}
                {e.hasAudio && <span className="flex items-center gap-0.5 text-[9px]"><Microphone size={9}/> صوتي</span>}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={e.pageId} className="mb-2 last:mb-0">
        <button
          onClick={() => setExpanded(ex => ex === e.pageId ? null : e.pageId)}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl transition ${rowStyle}`}
        >
          <div className={`p-1.5 rounded-lg ${iconBg} ${iconClass} shrink-0`}>
            {isHighlightOnly ? <Highlighter size={13} weight="duotone" /> : 
             isNoteOnly && e.hasAudio ? <Microphone size={13} weight="duotone" /> : 
             <NotePencil size={13} weight="duotone" />}
          </div>
          <div className="flex-1 text-start min-w-0">
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${catInfo.color} block w-fit mb-0.5`}>
              {catInfo.name}
            </span>
            <p className={`text-[12px] font-black truncate leading-tight ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
              {e.lawName}
            </p>
            <div className={`flex items-center gap-1.5 mt-0.5 ${muted}`}>
              {e.hasStrokes && <span className="flex items-center gap-0.5 text-[9px]"><Highlighter size={9}/> تحديد</span>}
              {e.text && <span className="flex items-center gap-0.5 text-[9px]"><NotePencil size={9}/> ملاحظة</span>}
              {e.hasAudio && <span className="flex items-center gap-0.5 text-[9px]"><Microphone size={9}/> صوتي</span>}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <a href={`${linkPrefix}${cleanPageId}`} onClick={ev => ev.stopPropagation()}
              className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/10 text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
              <ArrowSquareOut size={12} />
            </a>
            <button onClick={ev => { ev.stopPropagation(); deleteEntry(e.pageId); }}
              className={`p-1 rounded-lg transition ${isDark ? "hover:bg-red-900/20 text-zinc-600 hover:text-red-400" : "hover:bg-red-50 text-slate-300 hover:text-red-500"}`}>
              <Trash size={12} />
            </button>
            {expanded === e.pageId ? <CaretUp size={11} className={muted}/> : <CaretDown size={11} className={muted}/>}
          </div>
        </button>

        <AnimatePresence>
          {expanded === e.pageId && e.text && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className={`mx-3 mb-2 px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-wrap ${isDark ? "bg-white/[0.03] text-zinc-400 border border-white/[0.05]" : "bg-slate-50 text-slate-600 border border-slate-100"}`}>
                {e.text.slice(0, 300)}{e.text.length > 300 ? "..." : ""}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };



  return (
    <div className={`${card} overflow-hidden`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-5 py-3.5 transition ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/70"}`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDark ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}>
            <NotePencil size={16} weight="duotone" />
          </div>
          <div className="text-start">
            <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "ملاحظاتي وتحديداتي" : "My Notes & Annotations"}
            </p>
            <p className={`text-[11px] ${muted}`}>
              {entries.length > 0
                ? (isRTL ? `${entries.length} نظام به ملاحظات` : `${entries.length} laws with notes`)
                : (isRTL ? "لا توجد ملاحظات بعد" : "No notes yet")}
            </p>
          </div>
        </div>
        {isCollapsed ? <CaretDown size={14} className={muted} /> : <CaretUp size={14} className={muted} />}
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Filter controls row */}
            <div className={`flex flex-col gap-2.5 px-5 pb-3.5 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              {/* Type Filters & Layout Toggle */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1">
                  {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-black transition ${
                        tab === t.id
                          ? isDark ? "bg-indigo-900/40 text-indigo-300" : "bg-indigo-50 text-indigo-700"
                          : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                      }`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>

                <div className={`flex p-0.5 rounded-lg ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                  <button
                    onClick={() => setLayoutType("list")}
                    title={isRTL ? "عرض قائمة" : "List View"}
                    className={`p-1 rounded transition-all ${layoutType === "list" ? (isDark ? "bg-zinc-800 text-white" : "bg-white text-slate-800 shadow-sm") : "text-slate-400 hover:text-slate-600"}`}
                  >
                    <List size={13} />
                  </button>
                  <button
                    onClick={() => setLayoutType("grid")}
                    title={isRTL ? "عرض مربعات" : "Grid View"}
                    className={`p-1 rounded transition-all ${layoutType === "grid" ? (isDark ? "bg-zinc-800 text-white" : "bg-white text-slate-800 shadow-sm") : "text-slate-400 hover:text-slate-600"}`}
                  >
                    <SquaresFour size={13} />
                  </button>
                </div>
              </div>

              {/* Dynamic Document Pill Filter Scrollbar */}
              {uniqueDocs.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
                      selectedDoc === null
                        ? isDark ? "bg-[#C8A762] text-[#0B3D2E]" : "bg-amber-100 text-amber-800 border border-amber-200"
                        : isDark ? "bg-white/5 text-zinc-400 border border-white/[0.03]" : "bg-slate-50 text-slate-500 border border-slate-100"
                    }`}
                  >
                    {isRTL ? "الكل" : "All"}
                  </button>
                  {uniqueDocs.map(doc => (
                    <button
                      key={doc.pageId}
                      onClick={() => setSelectedDoc(doc.pageId)}
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all border truncate max-w-[120px] ${
                        selectedDoc === doc.pageId
                          ? isDark ? "bg-[#C8A762] text-[#0B3D2E] border-[#C8A762]" : "bg-amber-100 text-amber-800 border-amber-300"
                          : isDark ? "bg-white/5 text-zinc-400 border-white/[0.04] hover:bg-white/10" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {doc.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Content list */}
            <div className={`px-5 py-3 max-h-72 overflow-y-auto ${layoutType === "grid" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-2"}`}>
              {filtered.length === 0 ? (
                <div className={`text-center py-6 text-[12px] ${muted} col-span-full`}>
                  {isRTL ? "لا يوجد شيء هنا بعد" : "Nothing here yet"}
                </div>
              ) : (
                filtered.map(e => renderEntryRow(e))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}