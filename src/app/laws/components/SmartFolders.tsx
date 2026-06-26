"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderSimple, FolderSimplePlus, PencilSimple, Trash,
  Check, X, BookOpen, Plus, CaretDown, PushPin,
  Palette, Star, ArrowRight, DotsSixVertical,
  Scroll, Gavel, MagnifyingGlass
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Modular Imports & Re-exports ──────────────────────────────────────────────────
import type { LawRef, SmartFolder, LibraryDoc } from "./SmartFolderTypes";
import { FOLDER_COLORS, DEFAULT_LAWS, DEMO_FOLDERS, ALL_LIBRARY_DOCS } from "./SmartFolderTypes";
import FolderCard, { FolderIcon, ColorPicker } from "./FolderCard";
import CreateFolderInline from "./CreateFolderInline";

// Re-export for project compatibility
export type { LawRef, SmartFolder, LibraryDoc };
export { FOLDER_COLORS, DEFAULT_LAWS, DEMO_FOLDERS, ALL_LIBRARY_DOCS };
export { FolderIcon, ColorPicker, FolderCard, CreateFolderInline };

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function SmartFolders({
  isDark, isRTL,
}: {
  isDark: boolean;
  isRTL: boolean;
}) {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isExpandedView, setIsExpandedView] = useState(false);

  // Folder content management state
  const [managingFolder, setManagingFolder] = useState<SmartFolder | null>(null);
  const [modalQuery, setModalQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "law" | "book" | "order" | "precedent">("all");

  useEffect(() => {
    const saved = localStorage.getItem("nzamy_smart_folders");
    if (saved) {
      try {
        setFolders(JSON.parse(saved));
      } catch {
        setFolders(DEMO_FOLDERS);
      }
    } else {
      setFolders(DEMO_FOLDERS);
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(DEMO_FOLDERS));
    }
    setExpandedId("default-daily");
    setIsMounted(true);
  }, []);

  // Listen to external folder state changes to sync dynamically
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setFolders(e.detail);
      }
    };
    window.addEventListener("nzamy_smart_folders_changed", handleUpdate);
    return () => window.removeEventListener("nzamy_smart_folders_changed", handleUpdate);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setFolders(prev => {
      const next = prev.filter(f => f.id !== id);
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
    setExpandedId(prev => prev === id ? null : prev);
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    setFolders(prev => {
      const next = prev.map(f => f.id === id ? { ...f, name, nameEn: name, lastModified: Date.now() } : f);
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
  }, []);

  const handleColorChange = useCallback((id: string, color: string) => {
    setFolders(prev => {
      const next = prev.map(f => f.id === id ? { ...f, color, lastModified: Date.now() } : f);
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
  }, []);

  const handleTogglePin = useCallback((id: string) => {
    setFolders(prev => {
      const next = prev.map(f => f.id === id ? { ...f, isPinned: !f.isPinned, lastModified: Date.now() } : f);
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
  }, []);

  const handleCreate = useCallback((name: string, color: string) => {
    const newFolderId = `folder-${Date.now()}`;
    setFolders(prev => {
      const newFolder: SmartFolder = {
        id: newFolderId,
        name,
        nameEn: name,
        color,
        icon: "default",
        isDefault: false,
        laws: [],
        lastModified: Date.now(),
      };
      const next = [...prev, newFolder];
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
    setIsCreating(false);
    setExpandedId(newFolderId);
  }, []);

  // Remove individual item from a folder
  const handleRemoveItem = useCallback((folderId: string, itemSlug: string, itemType: string) => {
    setFolders(prev => {
      const next = prev.map(f => {
        if (f.id === folderId) {
          return {
            ...f,
            laws: f.laws.filter(item => !(item.slug === itemSlug && (item.type || "law") === itemType)),
            lastModified: Date.now()
          };
        }
        return f;
      });
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
  }, []);

  // Toggle item in a folder from the modal
  const handleToggleItemInModal = (doc: LibraryDoc) => {
    if (!managingFolder) return;
    setFolders(prev => {
      const next = prev.map(f => {
        if (f.id === managingFolder.id) {
          const exists = f.laws.some(item => item.slug === doc.slug && (item.type || "law") === doc.type);
          const newLaws = exists
            ? f.laws.filter(item => !(item.slug === doc.slug && (item.type || "law") === doc.type))
            : [...f.laws, { slug: doc.slug, title: doc.title, titleEn: doc.titleEn, catId: doc.catId, type: doc.type }];
          
          const updatedFolder = { ...f, laws: newLaws, lastModified: Date.now() };
          setManagingFolder(updatedFolder); // update active modal state
          return updatedFolder;
        }
        return f;
      });
      localStorage.setItem("nzamy_smart_folders", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: next }));
      return next;
    });
  };

  // Load recently viewed sessions
  const recentSessions = useMemo(() => {
    if (!isMounted) return [];
    try {
      const raw = localStorage.getItem("nzamy_recent_sessions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [managingFolder, isMounted]);

  // Filter searchable documents
  const filteredDocs = useMemo(() => {
    let list = ALL_LIBRARY_DOCS;
    if (activeTab !== "all") {
      list = list.filter(d => d.type === activeTab);
    }
    if (modalQuery.trim()) {
      const q = modalQuery.toLowerCase().trim();
      const normalize = (s: string) =>
        s.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي").toLowerCase();
      const nq = normalize(q);
      list = list.filter(d =>
        normalize(d.title).includes(nq) || d.titleEn.toLowerCase().includes(nq) || d.catId.toLowerCase().includes(nq)
      );
    }
    return list;
  }, [modalQuery, activeTab]);

  // Sort folders: pinned first, then lastModified descending
  const sortedFolders = [...folders].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.lastModified || 0) - (a.lastModified || 0);
  });

  if (!isMounted) return null;

  return (
    <>
      <motion.div
        layout
        className={`mb-8 rounded-[1.75rem] border overflow-hidden ${
          isDark
            ? "bg-[#161b22]/60 border-[#2d3748]"
            : "bg-white/70 border-gray-200/70 backdrop-blur-sm"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"
            }`}>
              <FolderSimple
                size={18}
                weight="duotone"
                className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}
              />
            </div>
            <div className={isRTL ? "text-right" : "text-left"}>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {isRTL ? "مجلداتي" : "My Folders"}
              </h3>
              <p className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {isRTL
                  ? `${folders.length} مجلد · ${folders.reduce((acc, f) => acc + f.laws.length, 0)} مادة`
                  : `${folders.length} folders · ${folders.reduce((acc, f) => acc + f.laws.length, 0)} items`}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCreating(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
              isDark
                ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20"
                : "bg-[#0B3D2E]/5 text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
            }`}
          >
            <Plus size={14} weight="bold" />
            {isRTL ? "مجلد جديد" : "New Folder"}
          </button>
        </div>

        {/* Folder List */}
        <div className={`px-5 pb-5 space-y-2 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
          <div className={`pt-4 space-y-2 transition-all duration-300 ${isExpandedView ? "" : "max-h-[225px] overflow-y-auto pr-1 custom-scrollbar"}`}>
            <AnimatePresence mode="popLayout">
              {sortedFolders.map(folder => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  isDark={isDark}
                  isRTL={isRTL}
                  isExpanded={expandedId === folder.id}
                  onToggle={() => handleToggle(folder.id)}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onColorChange={handleColorChange}
                  onTogglePin={handleTogglePin}
                  onManageContent={() => setManagingFolder(folder)}
                  onRemoveItem={(itemSlug, itemType) => handleRemoveItem(folder.id, itemSlug, itemType)}
                />
              ))}
            </AnimatePresence>

            {/* Create folder inline */}
            <AnimatePresence>
              {isCreating && (
                <CreateFolderInline
                  isDark={isDark}
                  isRTL={isRTL}
                  onCreate={handleCreate}
                  onCancel={() => setIsCreating(false)}
                />
              )}
            </AnimatePresence>

            {/* Empty state */}
            {folders.length === 0 && !isCreating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`py-10 text-center rounded-2xl border border-dashed ${
                  isDark ? "border-[#2d3748] bg-white/[0.02]" : "border-gray-200 bg-gray-50/50"
                }`}
              >
                <FolderSimplePlus size={32} className={`mx-auto mb-3 ${isDark ? "text-gray-600" : "text-gray-300"}`} weight="duotone" />
                <p className={`text-sm font-bold mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {isRTL ? "لا توجد مجلدات بعد" : "No folders yet"}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  {isRTL ? "أنشئ مجلداً لتنظيم أنظمتك المفضلة" : "Create a folder to organize your favorite laws"}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {folders.length > 2 && (
          <div className="border-t border-slate-100 dark:border-white/[0.04] px-5 py-2.5 flex justify-center bg-slate-50/20 dark:bg-white/[0.01]">
            <button
              onClick={() => setIsExpandedView(!isExpandedView)}
              className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors ${
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span>
                {isExpandedView
                  ? (isRTL ? "عرض أقل" : "Show Less")
                  : (isRTL ? `عرض كافة المجلدات (${folders.length})` : `Show all folders (${folders.length})`)}
              </span>
              <motion.div animate={{ rotate: isExpandedView ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <CaretDown size={11} weight="bold" />
              </motion.div>
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Manage Folder Content Modal ── */}
      <AnimatePresence>
        {managingFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-lg p-6 rounded-[2rem] border shadow-2xl flex flex-col max-h-[85vh] ${
                isDark ? "bg-[#161b22] border-white/10 text-white" : "bg-white border-slate-200 text-gray-900"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FolderSimple size={18} weight="fill" style={{ color: managingFolder.color }} />
                    {isRTL ? `إدارة محتوى مجلد: ${managingFolder.name}` : `Manage folder content: ${managingFolder.nameEn}`}
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {isRTL ? `المحتويات الحالية: ${managingFolder.laws.length} مادة` : `Current items: ${managingFolder.laws.length} items`}
                  </p>
                </div>
                <button
                  onClick={() => { setManagingFolder(null); setModalQuery(""); }}
                  className={`p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400`}
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              {/* Search input */}
              <div className="relative mb-3 flex-shrink-0">
                <input
                  type="text"
                  value={modalQuery}
                  onChange={e => setModalQuery(e.target.value)}
                  placeholder={isRTL ? "البحث عن نظام، مبدأ، حكم، تعميم أو كتاب فقهي..." : "Search for law, precedent, circular or book..."}
                  className={`w-full text-xs pl-3 pr-8 py-2 rounded-xl border outline-none ${
                    isDark
                      ? "bg-[#0c0f12] border-white/5 text-white placeholder-gray-600 focus:border-[#C8A762]/40"
                      : "bg-slate-50 border-slate-200 text-gray-900 placeholder-gray-400 focus:border-[#0B3D2E]"
                  }`}
                />
                <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-3" : "right-3"} text-gray-400`} />
              </div>

              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-100 dark:border-white/[0.04] flex-shrink-0">
                {[
                  { id: "all", label: "الكل" },
                  { id: "law", label: "الأنظمة" },
                  { id: "precedent", label: "المبادئ والأحكام" },
                  { id: "order", label: "الأوامر والتعاميم" },
                  { id: "book", label: "الكتب الفقهية" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border whitespace-nowrap ${
                      activeTab === tab.id
                        ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5"
                        : isDark ? "border-white/[0.04] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Recent viewed items (only show when no query and "all" tab is selected) */}
                {!modalQuery && activeTab === "all" && recentSessions.length > 0 && (
                  <div className="space-y-2">
                    <span className={`block text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {isRTL ? "آخر جلساتي وقراءاتي" : "Recent Sessions"}
                    </span>
                    <div className="space-y-2">
                      {recentSessions.map((doc: any) => {
                        const inFolder = managingFolder.laws.some(item => item.slug === doc.slug && (item.type || "law") === doc.type);
                        return (
                          <div
                            key={`recent-${doc.type}-${doc.slug}`}
                            onClick={() => handleToggleItemInModal(doc)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                              inFolder
                                ? isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex-shrink-0">
                                {doc.type === "order" ? <Scroll size={13} className="text-emerald-500" /> :
                                 doc.type === "precedent" ? <Gavel size={13} className="text-purple-500" /> :
                                 doc.type === "book" ? <BookOpen size={13} className="text-amber-500" /> :
                                 <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: managingFolder.color }} />}
                              </div>
                              <span className="text-xs font-semibold truncate">{isRTL ? doc.title : doc.titleEn}</span>
                            </div>
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                              inFolder 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : isDark ? "border-white/20" : "border-gray-300"
                            }`}>
                              {inFolder && <Check size={12} weight="bold" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Main list */}
                <div className="space-y-2">
                  <span className={`block text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {modalQuery ? (isRTL ? "نتائج البحث" : "Search Results") : (isRTL ? "محتويات المكتبة" : "Library Contents")}
                  </span>
                  <div className="space-y-2 pb-4">
                    {filteredDocs.map(doc => {
                      const inFolder = managingFolder.laws.some(item => item.slug === doc.slug && (item.type || "law") === doc.type);
                      return (
                        <div
                          key={`all-${doc.type}-${doc.slug}`}
                          onClick={() => handleToggleItemInModal(doc)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            inFolder
                              ? isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex-shrink-0">
                              {doc.type === "order" ? <Scroll size={13} className="text-emerald-500" /> :
                               doc.type === "precedent" ? <Gavel size={13} className="text-purple-500" /> :
                               doc.type === "book" ? <BookOpen size={13} className="text-amber-500" /> :
                               <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: managingFolder.color }} />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold block truncate">{isRTL ? doc.title : doc.titleEn}</span>
                              <span className={`text-[8px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{doc.catId}</span>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            inFolder 
                              ? "bg-emerald-500 border-emerald-500 text-white" 
                              : isDark ? "border-white/20" : "border-gray-300"
                          }`}>
                            {inFolder && <Check size={12} weight="bold" />}
                          </div>
                        </div>
                      );
                    })}

                    {filteredDocs.length === 0 && (
                      <p className={`text-xs text-center py-8 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        {isRTL ? "لا توجد نتائج مطابقة لبحثك." : "No matching items found."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-white/[0.04] flex justify-end flex-shrink-0">
                <button
                  onClick={() => { setManagingFolder(null); setModalQuery(""); }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  {isRTL ? "تم" : "Done"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
