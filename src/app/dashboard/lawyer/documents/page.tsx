"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen, MagnifyingGlass, Plus, UploadSimple,
  ArrowUpRight, DotsThree, Download, Eye, CalendarBlank,
  GridFour, List, Sparkle, CaretLeft, CaretRight,
  BookOpen, FileMagnifyingGlass, FunnelSimple, Archive, X,
  Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  type Doc, type LegalBranch, type Party, type TemplateCategory,
  type Template,
  APPEAL_TYPES, APPEAL_BRANCHES, APPEAL_SPECIALTIES,
  CATEGORY_SUBTYPES, LEGAL_BRANCHES, PARTY_CONFIG,
  DOC_CATS, TMPL_CAT_CONFIG, TEMPLATES,
} from "./_taxonomy";
import { SmartTemplateModal } from "./SmartTemplateModal";
import { TYPE_ICON, TYPE_COLOR, TMPL_CAT_CONFIG_ICONS } from "./_ui-config";
import { getDocuments } from "@/lib/services/documentService";
import type { Document } from "@/lib/services/documentService";

// Page

function apiDocToDoc(d: Document): Doc {
  const typeMap: Record<string, Doc["type"]> = { pdf: "pdf", docx: "docx", doc: "docx", png: "image", jpg: "image", jpeg: "image" };
  const ext = d.file_name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = d.size_bytes ?? 0;
  const sizeStr = bytes
    ? bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : "";
  return {
    id: String(d.id),
    name: d.file_name,
    type: typeMap[ext] ?? "other",
    category: "briefs",
    size: sizeStr,
    date: d.created_at ? new Date(d.created_at).toLocaleDateString("ar-SA") : "",
  };
}

export default function DocumentsPage() {
  const { isDark } = useTheme();

  const [docs,          setDocs]          = useState<Doc[]>([]);
  const [docsLoading,   setDocsLoading]   = useState(true);
  const [mainTab,       setMainTab]       = useState<"docs" | "templates">("docs");
  const [search,        setSearch]        = useState("");
  const [docCat,        setDocCat]        = useState("all");
  const [docSubtype,    setDocSubtype]    = useState("all");
  const [docBranch,     setDocBranch]     = useState<LegalBranch | "all">("all");
  const [docParty,      setDocParty]      = useState<Party | "all">("all");
  const [tmplCat,       setTmplCat]       = useState<TemplateCategory | "all">("all");
  const [tmplBranch,    setTmplBranch]    = useState<LegalBranch | "all">("all");
  const [viewMode,      setViewMode]      = useState<"list" | "grid">("list");
  const [hoveredTmpl,   setHoveredTmpl]   = useState<string | null>(null);
  const [showArchive,   setShowArchive]   = useState(false);
  const [advancedOpen,  setAdvancedOpen]  = useState(false);
  const [smartTmpl,     setSmartTmpl]     = useState<Template | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const apiDocs = await getDocuments();
        setDocs(apiDocs.map(apiDocToDoc));
      } catch {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    };
    fetchDocs();
  }, []);

  // ─ Appeals 3-level state ─
  const [appealType,    setAppealType]    = useState<string>("all");
  const [appealBranch,  setAppealBranch]  = useState<string>("all");
  const [appealSpec,    setAppealSpec]    = useState<string>("all");

  const handleAppealTypeChange = (t: string) => { setAppealType(t); setAppealBranch("all"); setAppealSpec("all"); };
  const handleAppealBranchChange = (b: string) => { setAppealBranch(b); setAppealSpec("all"); };

  const currentAppealBranches = appealType !== "all" ? (APPEAL_BRANCHES[appealType] ?? []) : [];
  const currentAppealSpecialties = appealBranch !== "all" ? (APPEAL_SPECIALTIES[appealBranch] ?? []) : [];

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Sub-types for selected cat
  const subtypes = useMemo(() =>
    docCat !== "all" ? CATEGORY_SUBTYPES[docCat] || [] : [], [docCat]);

  // Reset subtype when cat changes
  const handleCatChange = (cat: string) => {
    setDocCat(cat);
    setDocSubtype("all");
  };

  // Active filter chips (for display)
  const activeFilters: { label: string; onRemove: () => void }[] = [];
  if (docBranch !== "all") activeFilters.push({ label: LEGAL_BRANCHES.find(b => b.key === docBranch)?.label ?? "", onRemove: () => setDocBranch("all") });
  if (docParty !== "all")  activeFilters.push({ label: PARTY_CONFIG.find(p => p.key === docParty)?.label ?? "",   onRemove: () => setDocParty("all")  });
  if (docSubtype !== "all") activeFilters.push({ label: subtypes.find(s => s.key === docSubtype)?.label ?? "",    onRemove: () => setDocSubtype("all") });

  // Filtered docs
  const filteredDocs = useMemo(() =>
    docs.filter(d => {
      if (d.archived && !showArchive) return false;
      const matchCat     = docCat === "all" || d.category === docCat;
      const matchSub     = docSubtype === "all" || d.subtype === docSubtype;
      const matchBranch  = docBranch === "all" || d.branch === docBranch;
      const matchParty   = docParty === "all" || d.party === docParty;
      const matchSearch  = !search || d.name.includes(search) || d.caseTitle?.includes(search) || d.tags?.some(t => t.includes(search));
      return matchCat && matchSub && matchBranch && matchParty && matchSearch;
    })
  , [search, docCat, docSubtype, docBranch, docParty, showArchive, docs]);

  const filteredTmpl = useMemo(() =>
    TEMPLATES.filter(t =>
      (tmplCat === "all"    || t.category === tmplCat) &&
      (tmplBranch === "all" || t.branch === tmplBranch) &&
      (!search || t.title.includes(search) || t.desc.includes(search))
    )
  , [search, tmplCat, tmplBranch]);

  const openSmartTmpl = (tmpl: Template) => setSmartTmpl(tmpl);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>مخزن المستندات</h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {docs.length} مستند · {TEMPLATES.length} نموذج جاهز
          </p>
        </div>
        <div className="flex gap-2">
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border cursor-pointer transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <UploadSimple size={15} />رفع مستند
            <input type="file" className="hidden" />
          </label>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />جديد
          </button>
        </div>
      </motion.div>

      {/* Main Tab Switch */}
      <div className={`flex rounded-2xl p-1 ${isDark ? "bg-zinc-800/80 border border-white/[0.06]" : "bg-slate-100/80 border border-slate-200"}`}>
        {([
          { key: "docs",      label: "مستنداتي",       count: docs.length },
          { key: "templates", label: "النماذج الجاهزة", count: TEMPLATES.length },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setMainTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              mainTab === tab.key
                ? isDark ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-500" : "text-slate-500"
            }`}>
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mainTab === tab.key ? "bg-royal/10 text-royal" : isDark ? "bg-white/[0.06] text-zinc-600" : "bg-slate-200 text-slate-400"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ──────────────────── DOCUMENTS TAB ──────────────────── */}
      {mainTab === "docs" && (
        <>
          {/* Search + view + archive */}
          <div className="flex gap-2">
            <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
              <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المستندات..."
                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
            </div>
            <div className={`flex rounded-xl overflow-hidden border flex-shrink-0 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
              {(["list", "grid"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-2 transition-all ${viewMode === m ? isDark ? "bg-white/[0.08] text-white" : "bg-royal text-white" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {m === "list" ? <List size={14} /> : <GridFour size={14} />}
                </button>
              ))}
            </div>
            <button onClick={() => setShowArchive(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all flex-shrink-0 ${showArchive ? "bg-purple-500/10 text-purple-500 border-purple-500/20" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              <Archive size={13} />الأرشيف
            </button>
          </div>

          {/* ── Level 1: Main Category ── */}
          <div className="flex gap-1.5 overflow-x-auto">
            {DOC_CATS.map(cat => {
              const isAppeals = cat.key === "appeals";
              const count = cat.key === "all" ? docs.length : isAppeals ? 0 : docs.filter(d => d.category === cat.key).length;
              const isActive = docCat === cat.key;
              return (
                <button key={cat.key}
                  onClick={() => { handleCatChange(cat.key); if(isAppeals){ setAppealType("all"); setAppealBranch("all"); setAppealSpec("all"); }}}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold flex-shrink-0 transition-all ${
                    isActive
                      ? isAppeals ? "bg-amber-500 text-white border-amber-500" : "bg-royal text-white border-royal"
                      : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"
                  }`}>
                  {cat.emoji} {cat.label}
                  {!isAppeals && (
                    <span className={`text-[9px] rounded-full px-1.5 ${isActive ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Appeals Panel: 3-level cascading taxonomy ── */}
          <AnimatePresence>
            {docCat === "appeals" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden">
                <div className={`p-4 space-y-4 rounded-2xl border ${isDark ? "border-amber-500/15 bg-amber-500/[0.04]" : "border-amber-200 bg-amber-50/80"}`}>
                  {/* L1: نوع الطعن */}
                  <div>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-amber-400" : "text-amber-700"}`}>① نوع الطعن</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{key:"all",label:"الكل",emoji:""}, ...APPEAL_TYPES].map(t => (
                        <button key={t.key} onClick={() => handleAppealTypeChange(t.key)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${appealType === t.key ? "bg-amber-500 text-white border-amber-500" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-amber-200 text-amber-700 hover:bg-amber-100"}`}>
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* L2: الفرع القانوني */}
                  <AnimatePresence>
                    {currentAppealBranches.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-blue-400" : "text-blue-700"}`}>② الفرع القانوني</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {[{key:"all",label:"الكل",emoji:""}, ...currentAppealBranches].map(b => (
                            <button key={b.key} onClick={() => handleAppealBranchChange(b.key)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${appealBranch === b.key ? "bg-blue-500 text-white border-blue-500" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                              {b.emoji} {b.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* L3: التخصص الدقيق */}
                  <AnimatePresence>
                    {currentAppealSpecialties.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>③ التخصص الدقيق</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {[{key:"all",label:"الكل"}, ...currentAppealSpecialties].map(s => (
                            <button key={s.key} onClick={() => setAppealSpec(s.key)}
                              className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${appealSpec === s.key ? "bg-emerald-500 text-white border-emerald-500" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                        {/* Breadcrumb */}
                        {(appealType !== "all" || appealBranch !== "all" || appealSpec !== "all") && (
                          <div className={`flex flex-wrap items-center gap-1.5 text-[10px] pt-1 ${isDark ? "text-zinc-600" : "text-slate-500"}`}>
                            <span className="text-royal"><FileMagnifyingGlass size={12} weight="bold" /></span>
                            {appealType !== "all" && <span className="bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-bold">{APPEAL_TYPES.find(t=>t.key===appealType)?.label}</span>}
                            {appealBranch !== "all" && <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full font-bold">{currentAppealBranches.find(b=>b.key===appealBranch)?.label}</span>}
                            {appealSpec !== "all" && <span className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full font-bold">{currentAppealSpecialties.find(s=>s.key===appealSpec)?.label}</span>}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Level 2: Sub-type (cascading, appears only when non-appeals category selected) ── */}
          <AnimatePresence>
            {docCat !== "all" && docCat !== "appeals" && subtypes.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden">
                <div className={`p-3 rounded-2xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    النوع الفرعي
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => setDocSubtype("all")}
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${docSubtype === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                      الكل
                    </button>
                    {subtypes.map(s => (
                      <button key={s.key} onClick={() => setDocSubtype(s.key)}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${docSubtype === s.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-royal/30"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Level 3: Advanced filters toggle ── */}
          <div className="flex items-center gap-2">
            <button onClick={() => setAdvancedOpen(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${advancedOpen ? "bg-royal/10 text-royal border-royal/20" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              <FunnelSimple size={12} />فلاتر متقدمة {advancedOpen ? <CaretLeft size={10} /> : <CaretRight size={10} />}
            </button>
            {/* Active filter chips */}
            {activeFilters.map(f => (
              <span key={f.label} className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold ${isDark ? "border-royal/30 bg-royal/10 text-royal" : "border-royal/20 bg-royal/8 text-royal"}`}>
                {f.label}
                <button onClick={f.onRemove} className="hover:text-red-400"><X size={9} weight="bold" /></button>
              </span>
            ))}
          </div>

          <AnimatePresence>
            {advancedOpen && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden">
                <div className={`p-4 rounded-2xl border space-y-4 ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                  {/* Legal Branch */}
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الفرع القانوني</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setDocBranch("all")}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${docBranch === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                        الكل
                      </button>
                      {LEGAL_BRANCHES.map(b => (
                        <button key={b.key} onClick={() => setDocBranch(b.key)}
                          className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${docBranch === b.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Party */}
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الطرف</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setDocParty("all")}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${docParty === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                        الكل
                      </button>
                      {PARTY_CONFIG.map(p => (
                        <button key={p.key} onClick={() => setDocParty(p.key)}
                          className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${docParty === p.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => { setDocBranch("all"); setDocParty("all"); setDocSubtype("all"); }}
                    className={`text-[11px] font-semibold underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                    إعادة ضبط
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Docs list/grid */}
          {viewMode === "list" ? (
            <div className="space-y-2">
              {filteredDocs.length === 0 ? (
                <div className={`${card} p-12 text-center`}>
                  <FolderOpen size={32} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد مستندات مطابقة</p>
                </div>
              ) : (
                filteredDocs.map((doc, i) => {
                  const Icon   = TYPE_ICON[doc.type];
                  const branch = LEGAL_BRANCHES.find(b => b.key === doc.branch);
                  const party  = PARTY_CONFIG.find(p => p.key === doc.party);
                  const subLbl = docCat !== "all" ? (CATEGORY_SUBTYPES[doc.category] || []).find(s => s.key === doc.subtype)?.label : null;
                  return (
                    <motion.div key={doc.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TYPE_COLOR[doc.type]}`}>
                        <Icon size={20} weight="duotone" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-semibold truncate mb-0.5 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                        <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          {doc.caseTitle && <span className="flex items-center gap-1"><ArrowUpRight size={10} />{doc.caseTitle}</span>}
                          <span className="flex items-center gap-1"><CalendarBlank size={10} />{doc.date}</span>
                          <span>{doc.size}</span>
                          {branch && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{branch.label}</span>}
                          {party  && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${isDark ? "bg-white/[0.04]" : "bg-slate-100"} ${party.color}`}>{party.label.split(" ")[0]}</span>}
                          {subLbl && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold text-royal ${isDark ? "bg-royal/10" : "bg-royal/8"}`}>{subLbl}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
                        <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
                        <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><DotsThree size={16} weight="bold" /></button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredDocs.map((doc, i) => {
                const Icon = TYPE_ICON[doc.type];
                return (
                  <motion.div key={doc.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                    className={`group ${card} p-4 hover:border-royal/20 transition-all cursor-pointer`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${TYPE_COLOR[doc.type]}`}>
                      <Icon size={22} weight="duotone" />
                    </div>
                    <p className={`text-[13px] font-semibold line-clamp-2 mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{doc.size} · {doc.date}</p>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ──────────────────── TEMPLATES TAB ──────────────────── */}
      {mainTab === "templates" && (
        <>
          {/* search */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
            <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في النماذج..."
              className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
          </div>

          {/* Type filters */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTmplCat("all")}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${tmplCat === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
              الكل ({TEMPLATES.length})
            </button>
            {(Object.entries(TMPL_CAT_CONFIG) as [TemplateCategory, typeof TMPL_CAT_CONFIG[TemplateCategory]][]).map(([key, conf]) => {
              const Icon  = TMPL_CAT_CONFIG_ICONS[key] ?? conf.icon;
              const count = TEMPLATES.filter(t => t.category === key).length;
              if (!count) return null;
              return (
                <button key={key} onClick={() => setTmplCat(key === tmplCat ? "all" : key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${tmplCat === key ? conf.bg + " " + conf.color + " border-current/30" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                  <Icon size={11} weight="duotone" />{conf.emoji} {conf.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Branch filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTmplBranch("all")}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${tmplBranch === "all" ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              كل الفروع
            </button>
            {LEGAL_BRANCHES.map(b => (
              <button key={b.key} onClick={() => setTmplBranch(b.key === tmplBranch ? "all" : b.key)}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${tmplBranch === b.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredTmpl.map((tmpl, i) => {
              const conf    = TMPL_CAT_CONFIG[tmpl.category];
              const CatIcon = TMPL_CAT_CONFIG_ICONS[tmpl.category] ?? conf.icon;
              const isHov   = hoveredTmpl === tmpl.id;
              const branchLbl = LEGAL_BRANCHES.find(b => b.key === tmpl.branch)?.label;
              return (
                <motion.div key={tmpl.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onMouseEnter={() => setHoveredTmpl(tmpl.id)}
                  onMouseLeave={() => setHoveredTmpl(null)}
                  className={`group relative overflow-hidden rounded-2xl border transition-all cursor-pointer ${
                    isHov ? "border-royal/30 shadow-lg scale-[1.01]" : isDark ? "border-white/[0.06]" : "border-slate-200"
                  } ${isDark ? "bg-zinc-900/60" : "bg-white shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08)]"}`}>
                  <div className={`h-1 w-full ${conf.bg.replace("/10", "")} opacity-80`} />
                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${conf.bg}`}>
                        <CatIcon size={20} weight="duotone" className={conf.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={`text-[14px] font-bold leading-snug ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{tmpl.title}</p>
                          {tmpl.isPremium && <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">PRO</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>{conf.emoji} {conf.label}</span>
                          {branchLbl && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{branchLbl}</span>}
                          {tmpl.isAi && <span className="flex items-center gap-0.5 text-[10px] font-bold text-royal"><Sparkle size={9} weight="fill" />AI</span>}
                        </div>
                      </div>
                    </div>
                    <p className={`text-[12px] leading-relaxed mb-4 line-clamp-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{tmpl.desc}</p>
                    <div className={`flex items-center gap-4 text-[11px] mb-4 pb-4 border-b ${isDark ? "text-zinc-600 border-white/[0.05]" : "text-slate-400 border-slate-100"}`}>
                      <span>{tmpl.pages}</span>
                      <span>{tmpl.fields} حقل</span>
                      <span className="mr-auto">{tmpl.uses.toLocaleString()} استخدام</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openSmartTmpl(tmpl)}
                        className="flex-1 py-2.5 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                        {tmpl.isAi ? "توليد بالذكاء الاصطناعي" : "استخدام النموذج"}
                      </button>
                      <button className={`px-3 py-2.5 rounded-xl text-[12px] border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}><Eye size={14} /></button>
                      <button className={`px-3 py-2.5 rounded-xl text-[12px] border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}><Download size={14} /></button>
                    </div>
                  </div>
                  <div className={`absolute bottom-0 right-0 px-2 py-1 text-[9px] font-black tracking-widest uppercase rounded-tl-xl ${conf.bg} ${conf.color} opacity-60`}>نموذج</div>
                </motion.div>
              );
            })}
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className={`p-4 rounded-2xl border flex gap-3 items-start ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
            <span className="text-lg flex-shrink-0 text-amber-500"><Sparkle size={18} weight="fill" /></span>
            <div>
              <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الفرق بين النموذج والمستند</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <strong>النموذج</strong>: هيكل جاهز لإنشاء وثيقة جديدة — تُعبئه بالبيانات وتُنتج مستنداً مكتملاً.<br />
                <strong>المستند</strong>: ملف موجود ومحفوظ بالفعل — ناتج عن قضية أو نموذج سابق.
              </p>
            </div>
          </motion.div>
        </>
      )}

      {smartTmpl && (
        <SmartTemplateModal
          template={smartTmpl}
          isDark={isDark}
          onClose={() => setSmartTmpl(null)}
        />
      )}
    </div>
  );
}
