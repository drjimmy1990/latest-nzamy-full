"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, FolderSimple, X, MagnifyingGlass, Plus, Check,
  FolderSimplePlus, Trash, Gavel, BookOpen, Scroll, WarningCircle, ArrowClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { getPreferences, type RecentSession } from "@/lib/services/preferencesService";
import { SmartFolder, ALL_LIBRARY_DOCS } from "@/app/laws/components/SmartFolders";
import {
  mapApiFolderToSmartFolder,
  type SmartFolderLawItem,
} from "@/app/laws/components/smartFolderApiMapper";

interface FolderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDoc: {
    slug: string;
    title: string;
    titleEn: string;
    catId: string;
    type: "law" | "precedent" | "order" | "book";
  };
}

/** A document-like shape any of the three toggle sources (current doc, a
 *  recent session, an `ALL_LIBRARY_DOCS` search hit) satisfies. */
interface ToggleDoc {
  slug: string;
  title: string;
  titleEn?: string;
  catId?: string;
  type?: string;
}

const FOLDER_COLORS = [
  { id: "emerald", hex: "#10b981" },
  { id: "sky",     hex: "#0ea5e9" },
  { id: "amber",   hex: "#f59e0b" },
  { id: "rose",    hex: "#f43f5e" },
  { id: "violet",  hex: "#8b5cf6" },
  { id: "slate",   hex: "#64748b" },
  { id: "orange",  hex: "#f97316" },
  { id: "teal",    hex: "#14b8a6" },
];

// ─── localStorage helpers ──────────────────────────────────────────────────
// Guests' only store (they have no account) — THE RULE OF THIS PHASE. Every
// call site below is gated on `!isAuthenticated`: signed-in users' data
// lives on the server only, never mirrored here, so it can't survive a
// browser cleanup or leak to the next guest on a shared machine. Same-tab
// agreement between this component and SmartFolders.tsx comes from the
// `nzamy_smart_folders_changed` CustomEvent (dispatchFoldersChanged) alone.

function loadFoldersFromLocalStorage(): SmartFolder[] | null {
  try {
    const saved = localStorage.getItem("nzamy_smart_folders");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore parse errors */ }
  return null;
}

function saveFoldersToLocalStorage(folders: SmartFolder[]) {
  try {
    localStorage.setItem("nzamy_smart_folders", JSON.stringify(folders));
  } catch { /* ignore quota / private-mode errors */ }
}

function dispatchFoldersChanged(folders: SmartFolder[]) {
  window.dispatchEvent(new CustomEvent("nzamy_smart_folders_changed", { detail: folders }));
}

export default function FolderSelectionModal({
  isOpen,
  onClose,
  currentDoc
}: FolderSelectionModalProps) {
  const { isDark, isRTL } = useTheme();
  const { isLoggedIn: isAuthenticated } = useUser();

  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [managingFolder, setManagingFolder] = useState<SmartFolder | null>(null);
  const [modalQuery, setModalQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "law" | "precedent" | "order" | "book">("all");
  const [newFolderColor, setNewFolderColor] = useState("#10b981");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  // ─── Load folders — API for signed-in users, localStorage for guests ─────
  const loadFolders = useCallback(async () => {
    if (isAuthenticated) {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const res = await fetch("/api/library/folders");
        if (res.ok) {
          const data = await res.json();
          const mapped: SmartFolder[] = (data.folders || []).map(mapApiFolderToSmartFolder);
          setFolders(mapped);
          // Signed-in: the server is the record of truth — do not mirror it
          // into localStorage (THE RULE OF THIS PHASE; see SmartFolders.tsx's
          // own loadFolders for the same reasoning).
        } else {
          console.error("[FolderSelectionModal] Failed to load folders via API");
          setLoadFailed(true);
        }
      } catch (err) {
        console.error("[FolderSelectionModal] API error loading folders:", err);
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    } else {
      setFolders(loadFoldersFromLocalStorage() ?? []);
    }
  }, [isAuthenticated]);

  // Load on open (and whenever auth status resolves while open) rather than
  // once on mount — this modal stays mounted across opens in some callers.
  useEffect(() => {
    if (isOpen) loadFolders();
  }, [isOpen, loadFolders]);

  // Listen to folder updates dispatched here or by SmartFolders.tsx, so the
  // two never disagree about the list within one tab.
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SmartFolder[]>).detail;
      if (detail) setFolders(detail);
    };
    window.addEventListener("nzamy_smart_folders_changed", handleUpdate);
    return () => window.removeEventListener("nzamy_smart_folders_changed", handleUpdate);
  }, []);

  const updateFoldersState = useCallback((updated: SmartFolder[]) => {
    setFolders(updated);
    // Guests only — signed-in users' data lives on the server (see loadFolders).
    if (!isAuthenticated) saveFoldersToLocalStorage(updated);
    dispatchFoldersChanged(updated);
  }, [isAuthenticated]);

  // Check if item is in folder
  const isItemInFolder = useCallback((folder: SmartFolder, doc: typeof currentDoc) => {
    return folder.laws.some(item => item.slug === doc.slug && (item.type || "law") === doc.type);
  }, []);

  // ─── Recent items — server preferences for signed-in users, this browser's
  // own history for guests (no account to read it from). ────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      if (isAuthenticated) {
        const prefs = await getPreferences();
        if (!cancelled) setRecentSessions(prefs?.recentSessions ?? []);
      } else {
        try {
          const raw = localStorage.getItem("nzamy_recent_sessions");
          if (!cancelled) setRecentSessions(raw ? JSON.parse(raw) : []);
        } catch {
          if (!cancelled) setRecentSessions([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isAuthenticated]);

  // ─── Toggle one document in one folder — shared by the primary "quick add"
  // view (always `currentDoc`) and the "manage content" sub-view (any doc:
  // a folder item, a recent session, or a library search hit). ──────────────
  const toggleItemInFolder = useCallback(async (folder: SmartFolder, doc: ToggleDoc) => {
    const docType = doc.type || "law";
    const existingItem = folder.laws.find(item => item.slug === doc.slug && (item.type || "law") === docType);
    const exists = !!existingItem;
    const dbItemId = (existingItem as SmartFolderLawItem | undefined)?._itemDbId;

    const newLaws = exists
      ? folder.laws.filter(item => !(item.slug === doc.slug && (item.type || "law") === docType))
      : [...folder.laws, {
          slug: doc.slug,
          title: doc.title,
          titleEn: doc.titleEn || doc.title,
          catId: doc.catId || "SA-00",
          type: docType as SmartFolder["laws"][number]["type"],
        }];
    const updatedFolder: SmartFolder = { ...folder, laws: newLaws, lastModified: Date.now() };

    const nextFolders = folders.map(f => f.id === folder.id ? updatedFolder : f);
    updateFoldersState(nextFolders);
    setManagingFolder(prev => prev && prev.id === folder.id ? updatedFolder : prev);

    if (!isAuthenticated) return;

    try {
      if (exists) {
        if (!dbItemId) {
          // A locally-created item with no DB row (e.g. a stale localStorage
          // fallback entry) — nothing to delete server-side; re-sync instead
          // of silently leaving the two out of step.
          await loadFolders();
          return;
        }
        const res = await fetch(`/api/library/folders?itemId=${encodeURIComponent(dbItemId)}`, { method: "DELETE" });
        if (!res.ok) {
          console.error("[FolderSelectionModal] Failed to remove item via API");
          await loadFolders();
        }
      } else {
        const res = await fetch("/api/library/folders/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: folder.id,
            entityType: docType,
            entityId: doc.slug,
            title: doc.title,
            titleEn: doc.titleEn,
            catId: doc.catId,
          }),
        });
        if (!res.ok) {
          console.error("[FolderSelectionModal] Failed to add item via API");
          await loadFolders();
          return;
        }
        const data = await res.json();
        const dbId: string | undefined = data.item?.id;
        if (dbId) {
          // Attach the DB item id so a later removal can target it directly,
          // without a full re-fetch.
          const withId = (f: SmartFolder): SmartFolder => f.id !== folder.id ? f : {
            ...f,
            laws: f.laws.map(l => (l.slug === doc.slug && (l.type || "law") === docType)
              ? ({ ...l, _itemDbId: dbId } as SmartFolderLawItem)
              : l),
          };
          // Signed-in only in this branch (see the `if (!isAuthenticated)
          // return;` above) — server already has it, don't mirror to
          // localStorage (THE RULE OF THIS PHASE).
          setFolders(prev => prev.map(withId));
          setManagingFolder(prev => prev && prev.id === folder.id ? withId(prev) : prev);
        }
      }
    } catch (err) {
      console.error("[FolderSelectionModal] API error toggling item:", err);
      await loadFolders();
    }
  }, [folders, isAuthenticated, updateFoldersState, loadFolders]);

  // Toggle item in folder (main view)
  const handleToggleFolder = (folderId: string) => {
    if (!currentDoc) return;
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    toggleItemInFolder(folder, currentDoc);
  };

  // Toggle item in modal search/recent lists
  const handleToggleItemInModal = (doc: ToggleDoc) => {
    if (!managingFolder) return;
    toggleItemInFolder(managingFolder, doc);
  };

  // Create folder inside modal
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentDoc) return;
    const name = newFolderName.trim();
    const color = newFolderColor;

    if (isAuthenticated) {
      try {
        const res = await fetch("/api/library/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, icon: "📁" }),
        });
        if (!res.ok) {
          console.error("[FolderSelectionModal] Failed to create folder via API");
          return;
        }
        const data = await res.json();
        let newFolder = mapApiFolderToSmartFolder(data.folder); // laws: []

        // Auto-add the current document — mirrors the guest path below, but
        // needs its own request since folder creation has no "with item"
        // endpoint.
        const itemRes = await fetch("/api/library/folders/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: newFolder.id,
            entityType: currentDoc.type || "law",
            entityId: currentDoc.slug,
            title: currentDoc.title,
            titleEn: currentDoc.titleEn,
            catId: currentDoc.catId,
          }),
        });
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          const withDbId: SmartFolderLawItem = { ...currentDoc, _itemDbId: itemData.item?.id };
          newFolder = { ...newFolder, laws: [withDbId] };
        } else {
          console.error("[FolderSelectionModal] Folder created but failed to add the initial item");
        }

        updateFoldersState([...folders, newFolder]);
        setNewFolderName("");
        setShowCreateForm(false);
      } catch (err) {
        console.error("[FolderSelectionModal] API error creating folder:", err);
      }
      return;
    }

    const newFolder: SmartFolder = {
      id: `folder-${Date.now()}`,
      name,
      nameEn: name,
      color,
      icon: "default",
      isDefault: false,
      laws: [currentDoc], // auto-add current document!
      lastModified: Date.now()
    };
    updateFoldersState([...folders, newFolder]);
    setNewFolderName("");
    setShowCreateForm(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-md p-6 rounded-[2rem] border shadow-2xl flex flex-col max-h-[85vh] ${
          isDark ? "bg-[#161b22] border-white/10 text-white" : "bg-white border-slate-200 text-gray-900"
        }`}
      >
        {managingFolder ? (
          // ── Sub-view: Manage Folder Content ──
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setManagingFolder(null); setModalQuery(""); }}
                  className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400"
                >
                  <ArrowRight size={16} className={isRTL ? "rotate-180" : ""} />
                </button>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FolderSimple size={18} weight="fill" style={{ color: managingFolder.color }} />
                    {isRTL ? `إدارة محتوى مجلد: ${managingFolder.name}` : `Manage: ${managingFolder.nameEn}`}
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {isRTL ? `المحتويات الحالية: ${managingFolder.laws.length} مادة` : `Current items: ${managingFolder.laws.length} items`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { onClose(); setManagingFolder(null); setModalQuery(""); }}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400"
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
                placeholder={isRTL ? "البحث عن نظام، مبدأ، حكم، تعميم أو كتاب..." : "Search for law, precedent, circular or book..."}
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
              {/* Folder Items */}
              {!modalQuery && (
                <div className="space-y-2">
                  <span className={`block text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "المواد الحالية في المجلد" : "Current Folder Items"}
                  </span>
                  <div className="space-y-2">
                    {managingFolder.laws
                      .filter(doc => activeTab === "all" || (doc.type || "law") === activeTab)
                      .map((doc: any) => (
                        <div
                          key={`folder-item-${doc.type}-${doc.slug}`}
                          className={`flex items-center justify-between p-2.5 rounded-xl border ${
                            isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
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
                          <button
                            onClick={() => handleToggleItemInModal(doc)}
                            className="p-1 rounded-lg hover:bg-red-500/10 text-red-400"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      ))}
                    {managingFolder.laws.filter(doc => activeTab === "all" || (doc.type || "law") === activeTab).length === 0 && (
                      <p className="text-[11px] text-center text-gray-500 py-3">
                        {isRTL ? "لا توجد عناصر مطابقة في هذا المجلد." : "No matching items in this folder."}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Recent viewed items */}
              {!modalQuery && activeTab === "all" && recentSessions.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                  <span className={`block text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "جلساتك وقراءاتك الأخيرة" : "Recent Sessions"}
                  </span>
                  <div className="space-y-2">
                    {recentSessions
                      .filter((doc) => !managingFolder.laws.some(item => item.slug === doc.slug && (item.type || "law") === (doc.type || "law")))
                      .map((doc) => (
                        <div
                          key={`recent-${doc.type}-${doc.slug}`}
                          onClick={() => handleToggleItemInModal(doc)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex-shrink-0">
                              {doc.type === "order" ? <Scroll size={13} className="text-emerald-500" /> :
                               doc.type === "precedent" ? <Gavel size={13} className="text-purple-500" /> :
                               doc.type === "book" ? <BookOpen size={13} className="text-amber-500" /> :
                               <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: managingFolder.color }} />}
                            </div>
                            <span className="text-xs font-semibold truncate">{isRTL ? doc.title : (doc.titleEn || doc.title)}</span>
                          </div>
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            isDark ? "border-white/20" : "border-gray-300"
                          }`}>
                            <Plus size={10} weight="bold" />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Search results from ALL_LIBRARY_DOCS */}
              {modalQuery && (
                <div className="space-y-2">
                  <span className={`block text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isRTL ? "نتائج البحث في المكتبة" : "Library Search Results"}
                  </span>
                  <div className="space-y-2">
                    {ALL_LIBRARY_DOCS
                      .filter(doc => activeTab === "all" || doc.type === activeTab)
                      .filter(doc => doc.title.includes(modalQuery) || doc.titleEn.toLowerCase().includes(modalQuery.toLowerCase()))
                      .map((doc: any) => {
                        const inFolder = managingFolder.laws.some(item => item.slug === doc.slug && (item.type || "law") === doc.type);
                        return (
                          <div
                            key={`search-${doc.type}-${doc.slug}`}
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
                              {inFolder ? <Check size={12} weight="bold" /> : <Plus size={10} weight="bold" />}
                            </div>
                          </div>
                        );
                      })}
                    {ALL_LIBRARY_DOCS
                      .filter(doc => activeTab === "all" || doc.type === activeTab)
                      .filter(doc => doc.title.includes(modalQuery) || doc.titleEn.toLowerCase().includes(modalQuery.toLowerCase())).length === 0 && (
                      <p className="text-[11px] text-center text-gray-500 py-6">
                        {isRTL ? "لم يتم العثور على نتائج للبحث." : "No results found."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          // ── Primary View: Folders list and creation ──
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FolderSimple size={18} weight="fill" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
                  {isRTL ? "إضافة المستند للمجلدات" : "Save Document to Folders"}
                </h3>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {isRTL ? "اختر المجلدات أو قم بإنشاء وإدارة محتوياتها من هنا" : "Select folders or manage their contents"}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Filter input */}
            <div className="relative mb-3 flex-shrink-0">
              <input
                type="text"
                value={folderQuery}
                onChange={e => setFolderQuery(e.target.value)}
                placeholder={isRTL ? "تصفية المجلدات باسم المجلد..." : "Filter folders by name..."}
                className={`w-full text-xs pl-3 pr-8 py-2 rounded-xl border outline-none ${
                  isDark
                    ? "bg-[#0c0f12] border-white/5 text-white placeholder-gray-600 focus:border-[#C8A762]/40"
                    : "bg-slate-50 border-slate-200 text-gray-900 placeholder-gray-400 focus:border-[#0B3D2E]"
                }`}
              />
              <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-3" : "right-3"} text-gray-400`} />
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 flex-1">
              {/* Loading skeleton — a request in flight, not an empty list. */}
              {isLoading && folders.length === 0 && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-gray-100"}`} />
                  ))}
                </div>
              )}

              {/* The read failed — say so, offer a retry. Not "no folders". */}
              {!isLoading && loadFailed && (
                <div className="py-8 flex flex-col items-center gap-2 text-center">
                  <WarningCircle size={26} weight="duotone" className="text-amber-500" />
                  <p className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة مجلداتك</p>
                  <button
                    onClick={() => loadFolders()}
                    className={`flex items-center gap-1.5 mt-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold ${
                      isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
                  </button>
                </div>
              )}

              {!loadFailed && (!isLoading || folders.length > 0) && folders
                .filter(f => f.name.includes(folderQuery) || f.nameEn.toLowerCase().includes(folderQuery.toLowerCase()))
                .map(folder => {
                  const inFolder = isItemInFolder(folder, currentDoc);
                  return (
                    <div
                      key={folder.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        inFolder
                          ? isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                      }`}
                    >
                      <div
                        onClick={() => handleToggleFolder(folder.id)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: folder.color }} />
                        <span className="text-xs font-bold truncate">{isRTL ? folder.name : folder.nameEn}</span>
                        <span className="text-[9px] px-1 rounded bg-white/5 text-zinc-500 font-mono flex-shrink-0">
                          {folder.laws.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {/* Manage content inside modal button */}
                        <button
                          onClick={() => setManagingFolder(folder)}
                          className={`p-1 rounded-lg transition ${
                            isDark ? "hover:bg-white/5 text-gray-500 hover:text-white" : "hover:bg-slate-200 text-slate-400 hover:text-gray-800"
                          }`}
                          title={isRTL ? "إدارة محتوى المجلد" : "Manage folder content"}
                        >
                          <Plus size={13} weight="bold" />
                        </button>
                        <div
                          onClick={() => handleToggleFolder(folder.id)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer ${
                            inFolder
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : isDark ? "border-white/20" : "border-gray-300"
                          }`}
                        >
                          {inFolder && <Check size={12} weight="bold" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {!isLoading && !loadFailed && folders.filter(f => f.name.includes(folderQuery) || f.nameEn.toLowerCase().includes(folderQuery.toLowerCase())).length === 0 && (
                <p className={`text-xs text-center py-6 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {isRTL ? "لا توجد مجلدات مطابقة." : "No matching folders found."}
                </p>
              )}
            </div>

            {/* Create new folder inside modal */}
            <div className="pt-4 border-t border-slate-100 dark:border-white/[0.04] mt-4 flex flex-col gap-3">
              {showCreateForm ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      placeholder={isRTL ? "اسم مجلد جديد..." : "New folder name..."}
                      className={`flex-1 text-xs px-3 py-2 rounded-xl border outline-none ${
                        isDark ? "bg-[#0c0f12] border-white/5 text-white" : "bg-slate-50 border-slate-200 text-gray-900"
                      }`}
                    />
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        newFolderName.trim()
                          ? "bg-[#0B3D2E] text-white"
                          : isDark ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {isRTL ? "إنشاء" : "Create"}
                    </button>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className={`text-xs ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-gray-400 hover:text-gray-600"}`}
                    >
                      {isRTL ? "إلغاء" : "Cancel"}
                    </button>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {FOLDER_COLORS.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setNewFolderColor(c.hex)}
                        className={`w-5 h-5 rounded-full transition-all duration-200 flex-shrink-0 flex items-center justify-center ${
                          newFolderColor === c.hex ? "ring-2 ring-offset-2 scale-110" : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {newFolderColor === c.hex && <Check size={10} color="#fff" weight="bold" />}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className={`w-full py-2 text-xs font-bold rounded-xl border border-dashed text-center flex items-center justify-center gap-1.5 transition-colors ${
                    isDark ? "border-white/10 text-gray-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <FolderSimplePlus size={14} />
                  {isRTL ? "إنشاء مجلد جديد" : "Create New Folder"}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
