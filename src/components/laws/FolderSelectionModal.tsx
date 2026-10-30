"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, FolderSimple, X, MagnifyingGlass, Check,
  FolderSimplePlus, Trash, WarningCircle, ArrowClockwise, CheckCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useNoSessionCookie } from "@/app/laws/components/useNoSessionCookie";
import { normalizeSearch } from "@/utils/normalizeArabic";
import { getPreferences, type RecentSession } from "@/lib/services/preferencesService";
import type { SmartFolder } from "@/app/laws/components/SmartFolderTypes";
import {
  mapApiFolderToSmartFolder,
  type SmartFolderLawItem,
} from "@/app/laws/components/smartFolderApiMapper";
// «إدارة محتوى المجلد» searches the real library (owner note ٠٥ §٢.٢): the
// static 14-row ALL_LIBRARY_DOCS sample is deleted. See folderLibrarySearch.ts.
import FolderContentPicker, { DocTypeIcon } from "@/app/laws/components/FolderContentPicker";
import { docKey } from "@/app/laws/components/folderLibrarySearch";
import { folderDialogPrimaryLabel, folderSavedToast } from "@/components/laws/folderDialogLabels";

/**
 * FolderSelectionModal — «إضافة المستند للمجلدات» on the four reader pages
 * (laws, precedents, orders, books).
 *
 * Owner note ٠٥ + live-test backlog LIVE-F23 (2026-10-30): pressing a folder
 * already saved the document (POST /api/library/folders/items) and ticked
 * it, but the dialog had no way to finish — only a small grey «×» that reads
 * as «cancel». Now:
 *   - a footer with one wide green button: «تم ✓» once the document is in at
 *     least one folder, «إغلاق» when it is in none, and a disabled
 *     «جارٍ الحفظ...» while any save/remove request is in flight;
 *   - Escape and a press on the dim backdrop close it too — never mid-save;
 *   - each folder row says «محفوظ هنا» when the document is in it, and every
 *     successful save shows a toast «تم حفظ المستند في مجلد «…»» that stays
 *     after the dialog closes;
 *   - focus moves into the dialog on open, Tab stays inside it, and focus
 *     returns to the button that opened it;
 *   - the silent «+» beside the tick is gone: a small text link «إدارة
 *     المجلد» sits at the far end of the row, away from the tick.
 * The props are unchanged (another stream opens this dialog from result cards).
 */

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
 *  recent session, a library search hit) satisfies. */
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

const TOAST_MS = 3200;

// ─── localStorage helpers ──────────────────────────────────────────────────
// Guests' only store (they have no account) — signed-in users' data lives on
// the server only, never mirrored here.

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

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function FolderSelectionModal({
  isOpen,
  onClose,
  currentDoc
}: FolderSelectionModalProps) {
  const { isDark, isRTL } = useTheme();
  const user = useUser();
  const isAuthenticated = user.isLoggedIn;
  const noSessionCookie = useNoSessionCookie();
  const authPending = user.loading && !noSessionCookie;

  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [managingFolder, setManagingFolder] = useState<SmartFolder | null>(null);
  const [newFolderColor, setNewFolderColor] = useState("#10b981");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  // `${folderId}\0${type}\0${slug}` for every save/remove still in flight.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const saving = pending.size > 0 || creatingFolder;

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const pendingKey = (folderId: string, doc: { slug: string; type?: string | null }) => `${folderId}\u0000${docKey(doc)}`;

  // ─── Load folders — API for signed-in users, localStorage for guests ─────
  const loadFolders = useCallback(async () => {
    if (authPending) return;
    setActionError(null);
    if (isAuthenticated) {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const res = await fetch("/api/library/folders");
        if (res.ok) {
          const data = await res.json();
          const mapped: SmartFolder[] = (data.folders || []).map(mapApiFolderToSmartFolder);
          setFolders(mapped);
          if (mapped.length === 0) setShowCreateForm(true);
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
      const local = loadFoldersFromLocalStorage() ?? [];
      setFolders(local);
      if (local.length === 0) setShowCreateForm(true);
    }
  }, [isAuthenticated, authPending]);

  useEffect(() => {
    if (isOpen && !authPending) loadFolders();
  }, [isOpen, authPending, loadFolders]);

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
    if (!isAuthenticated) saveFoldersToLocalStorage(updated);
    dispatchFoldersChanged(updated);
  }, [isAuthenticated]);

  const isItemInFolder = useCallback((folder: SmartFolder, doc: { slug: string; type?: string | null }) => {
    return folder.laws.some(item => item.slug === doc.slug && (item.type || "law") === (doc.type || "law"));
  }, []);

  useEffect(() => {
    if (!isOpen || authPending) return;
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
  }, [isOpen, isAuthenticated, authPending]);

  // ─── Close: Escape, backdrop, «×», the footer button — never mid-save ────
  const finish = useCallback(() => {
    if (saving) return;
    setManagingFolder(null);
    setFolderQuery("");
    onClose();
  }, [saving, onClose]);

  // Remember the opener, move focus in; give it back on close.
  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(raf);
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) window.setTimeout(() => opener.focus(), 0);
    };
  }, [isOpen]);

  // Escape closes (or leaves «إدارة المجلد»); Tab stays inside the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (managingFolder) setManagingFolder(null);
        else finish();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) { e.preventDefault(); root.focus(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, managingFolder, finish]);

  const toggleItemInFolder = useCallback(async (folder: SmartFolder, doc: ToggleDoc) => {
    if (!doc.slug) return;
    const docType = doc.type || "law";
    const key = pendingKey(folder.id, { slug: doc.slug, type: docType });
    if (pending.has(key)) return;
    setActionError(null);
    const existingItem = folder.laws.find(item => item.slug === doc.slug && (item.type || "law") === docType);
    const exists = !!existingItem;
    const dbItemId = (existingItem as SmartFolderLawItem | undefined)?._itemDbId;
    const folderLabel = isRTL ? folder.name : folder.nameEn;

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

    if (!isAuthenticated) {
      // A guest's folders live in this browser: the write above is the save.
      showToast(folderSavedToast(exists ? "removed" : "saved", folderLabel, isRTL));
      return;
    }

    setPending(prev => new Set(prev).add(key));
    try {
      if (exists) {
        if (!dbItemId) {
          await loadFolders();
          return;
        }
        const res = await fetch(`/api/library/folders?itemId=${encodeURIComponent(dbItemId)}`, { method: "DELETE" });
        if (!res.ok) {
          console.error("[FolderSelectionModal] Failed to remove item via API");
          setActionError(isRTL ? "تعذّرت إزالة المستند من المجلد. أعد المحاولة." : "Failed to remove document from folder.");
          await loadFolders();
          return;
        }
        showToast(folderSavedToast("removed", folderLabel, isRTL));
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
          setActionError(isRTL ? "تعذّر حفظ المستند في المجلد. أعد المحاولة." : "Failed to save document to folder.");
          await loadFolders();
          return;
        }
        const data = await res.json();
        const dbId: string | undefined = data.item?.id;
        if (dbId) {
          const withId = (f: SmartFolder): SmartFolder => f.id !== folder.id ? f : {
            ...f,
            laws: f.laws.map(l => (l.slug === doc.slug && (l.type || "law") === docType)
              ? ({ ...l, _itemDbId: dbId } as SmartFolderLawItem)
              : l),
          };
          setFolders(prev => {
            const synced = prev.map(withId);
            dispatchFoldersChanged(synced);
            return synced;
          });
          setManagingFolder(prev => prev && prev.id === folder.id ? withId(prev) : prev);
        }
        showToast(folderSavedToast("saved", folderLabel, isRTL));
      }
    } catch (err) {
      console.error("[FolderSelectionModal] API error toggling item:", err);
      setActionError(isRTL ? "تعذّر الاتصال بالخادم لحفظ التغييرات." : "Connection error while saving changes.");
      await loadFolders();
    } finally {
      setPending(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [folders, pending, isAuthenticated, isRTL, updateFoldersState, loadFolders, showToast]);

  const handleToggleFolder = (folderId: string) => {
    if (!currentDoc?.slug) return;
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    void toggleItemInFolder(folder, currentDoc);
  };

  const handleToggleItemInModal = (doc: ToggleDoc) => {
    if (!managingFolder) return;
    void toggleItemInFolder(managingFolder, doc);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentDoc || creatingFolder) return;
    const name = newFolderName.trim();
    const color = newFolderColor;
    setActionError(null);

    if (isAuthenticated) {
      setCreatingFolder(true);
      try {
        const res = await fetch("/api/library/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, icon: "📁" }),
        });
        if (!res.ok) {
          console.error("[FolderSelectionModal] Failed to create folder via API");
          setActionError(isRTL ? "تعذّر إنشاء المجلد. يرجى المحاولة مرة أخرى." : "Failed to create folder. Please try again.");
          return;
        }
        const data = await res.json();
        let newFolder = mapApiFolderToSmartFolder(data.folder);

        if (currentDoc.slug) {
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
            showToast(folderSavedToast("saved", isRTL ? newFolder.name : newFolder.nameEn, isRTL));
          } else {
            console.error("[FolderSelectionModal] Folder created but failed to add the initial item");
            setActionError(isRTL ? "تم إنشاء المجلد ولكن تعذّرت إضافة المستند تلقائياً. اضغط على المجلد لإضافته." : "Folder created, but adding the document failed. Click the folder to retry.");
          }
        }

        updateFoldersState([newFolder, ...folders]);
        setNewFolderName("");
        setShowCreateForm(false);
      } catch (err) {
        console.error("[FolderSelectionModal] API error creating folder:", err);
        setActionError(isRTL ? "تعذّر الاتصال بالخادم لإنشاء المجلد." : "Connection error while creating folder.");
      } finally {
        setCreatingFolder(false);
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
      laws: currentDoc.slug ? [currentDoc] : [],
      lastModified: Date.now()
    };
    updateFoldersState([newFolder, ...folders]);
    setNewFolderName("");
    setShowCreateForm(false);
    if (currentDoc.slug) showToast(folderSavedToast("saved", name, isRTL));
  };

  // The toast outlives the dialog: it is portalled to <body> and rendered
  // whether or not the dialog is open.
  const toastNode = toast && typeof document !== "undefined" ? createPortal(
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      dir={isRTL ? "rtl" : "ltr"}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] max-w-[calc(100vw-2rem)] print:hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl bg-[#0B3D2E] text-white text-xs font-bold border border-emerald-400/30">
        <CheckCircle size={16} weight="fill" className="text-emerald-300 flex-shrink-0" />
        <span>{toast.text}</span>
      </div>
    </div>,
    document.body,
  ) : null;

  if (!isOpen) return toastNode;

  const normalizedFolderQuery = normalizeSearch(folderQuery);
  const matchingFolders = folders.filter(
    f => !normalizedFolderQuery
      || normalizeSearch(f.name).includes(normalizedFolderQuery)
      || normalizeSearch(f.nameEn).includes(normalizedFolderQuery),
  );
  const selectedCount = currentDoc?.slug ? folders.filter(f => isItemInFolder(f, currentDoc)).length : 0;
  const primaryLabel = folderDialogPrimaryLabel({ saving, selectedCount, isRTL });

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden"
      onMouseDown={e => { if (e.target === e.currentTarget) finish(); }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
        aria-busy={saving}
        tabIndex={-1}
        dir={isRTL ? "rtl" : "ltr"}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-md p-6 rounded-[2rem] border shadow-2xl flex flex-col max-h-[85vh] outline-none ${
          isDark ? "bg-[#161b22] border-white/10 text-white" : "bg-white border-slate-200 text-gray-900"
        }`}
      >
        {actionError && (
          <div
            role="alert"
            className={`mb-3 px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              isDark
                ? "bg-red-950/40 border-red-500/30 text-red-300"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <WarningCircle size={15} weight="fill" className="flex-shrink-0" />
              {actionError}
            </span>
            <button type="button" onClick={() => setActionError(null)} aria-label={isRTL ? "إخفاء" : "Dismiss"} className="opacity-70 hover:opacity-100">
              <X size={13} weight="bold" />
            </button>
          </div>
        )}

        {managingFolder ? (
          // ── Sub-view: Manage Folder Content ──
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagingFolder(null)}
                  aria-label={isRTL ? "رجوع إلى المجلدات" : "Back to folders"}
                  className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400"
                >
                  <ArrowRight size={16} className={isRTL ? "rotate-180" : ""} />
                </button>
                <div>
                  <h3 id="folder-dialog-title" className="text-sm font-bold flex items-center gap-2">
                    <FolderSimple size={18} weight="fill" style={{ color: managingFolder.color }} />
                    {isRTL ? `إدارة محتوى مجلد: ${managingFolder.name}` : `Manage: ${managingFolder.nameEn}`}
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {isRTL ? `المحتويات الحالية: ${managingFolder.laws.length} مادة` : `Current items: ${managingFolder.laws.length} items`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                aria-label={isRTL ? "إغلاق" : "Close"}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400 disabled:opacity-40"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <FolderContentPicker
              isDark={isDark}
              isRTL={isRTL}
              folderColor={managingFolder.color}
              isInFolder={doc => isItemInFolder(managingFolder, doc)}
              onToggle={doc => handleToggleItemInModal(doc)}
              pendingKeys={new Set(Array.from(pending)
                .filter(k => k.startsWith(`${managingFolder.id}\u0000`))
                .map(k => k.slice(managingFolder.id.length + 1)))}
            >
              {tab => (
                <>
                  <div className="space-y-2">
                    <span className={`block text-[10px] font-bold tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {isRTL ? "المواد الحالية في المجلد" : "Current Folder Items"}
                    </span>
                    <ul className="space-y-2">
                      {managingFolder.laws
                        .filter(doc => tab === "all" || (doc.type || "law") === tab)
                        .map(doc => (
                          <li
                            key={`folder-item-${doc.type}-${doc.slug}`}
                            className={`flex items-center justify-between p-2.5 rounded-xl border ${
                              isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className="flex-shrink-0"><DocTypeIcon type={doc.type} color={managingFolder.color} /></span>
                              <span className="text-xs font-semibold truncate">{isRTL ? doc.title : doc.titleEn}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleItemInModal(doc)}
                              aria-label={isRTL ? `إزالة ${doc.title} من المجلد` : `Remove ${doc.titleEn} from folder`}
                              className="p-1 rounded-lg hover:bg-red-500/10 text-red-400"
                            >
                              <Trash size={12} />
                            </button>
                          </li>
                        ))}
                      {managingFolder.laws.filter(doc => tab === "all" || (doc.type || "law") === tab).length === 0 && (
                        <li className="text-[11px] text-center text-gray-500 py-3">
                          {isRTL ? "لا توجد عناصر في هذا المجلد بعد — اختر من المكتبة أدناه." : "No items here yet — pick from the library below."}
                        </li>
                      )}
                    </ul>
                  </div>

                  {tab === "all" && recentSessions.some(doc => !isItemInFolder(managingFolder, doc)) && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                      <span className={`block text-[10px] font-bold tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                        {isRTL ? "جلساتك وقراءاتك الأخيرة" : "Recent Sessions"}
                      </span>
                      <ul className="space-y-2">
                        {recentSessions
                          .filter(doc => !isItemInFolder(managingFolder, doc))
                          .map(doc => (
                            <li key={`recent-${doc.type}-${doc.slug}`}>
                              <button
                                type="button"
                                onClick={() => handleToggleItemInModal(doc)}
                                className={`w-full text-start flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                  isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                                }`}
                              >
                                <span className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex-shrink-0"><DocTypeIcon type={doc.type} color={managingFolder.color} /></span>
                                  <span className="text-xs font-semibold truncate">{isRTL ? doc.title : (doc.titleEn || doc.title)}</span>
                                </span>
                                <span className={`text-[10px] font-bold flex-shrink-0 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                                  {isRTL ? "إضافة" : "Add"}
                                </span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </FolderContentPicker>

            {/* Footer — back to the folder list */}
            <div className="pt-4 border-t border-slate-100 dark:border-white/[0.04] mt-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setManagingFolder(null)}
                disabled={saving}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-wait"
              >
                {saving ? (isRTL ? "جارٍ الحفظ..." : "Saving...") : (isRTL ? "تم — العودة إلى المجلدات" : "Done — back to folders")}
              </button>
            </div>
          </>
        ) : (
          // ── Primary View: Folders list and creation ──
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.04] mb-4 flex-shrink-0">
              <div>
                <h3 id="folder-dialog-title" className="text-sm font-bold flex items-center gap-2">
                  <FolderSimple size={18} weight="fill" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
                  {isRTL ? "إضافة المستند للمجلدات" : "Save Document to Folders"}
                </h3>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {isRTL ? "اضغط على المجلد ليُحفظ المستند فيه فوراً، ثم اضغط «تم»" : "Tap a folder to save the document in it, then press Done"}
                </p>
              </div>
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                aria-label={isRTL ? "إغلاق" : "Close"}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 transition text-gray-400 disabled:opacity-40"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {folders.length > 0 && (
              <div className="relative mb-3 flex-shrink-0">
                <input
                  type="text"
                  value={folderQuery}
                  onChange={e => setFolderQuery(e.target.value)}
                  aria-label={isRTL ? "تصفية المجلدات" : "Filter folders"}
                  placeholder={isRTL ? "تصفية المجلدات باسم المجلد..." : "Filter folders by name..."}
                  className={`w-full text-xs pl-3 pr-8 py-2 rounded-xl border outline-none ${
                    isDark
                      ? "bg-[#0c0f12] border-white/5 text-white placeholder-gray-600 focus:border-[#C8A762]/40"
                      : "bg-slate-50 border-slate-200 text-gray-900 placeholder-gray-400 focus:border-[#0B3D2E]"
                  }`}
                />
                <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-3" : "right-3"} text-gray-400`} />
              </div>
            )}

            {/* List */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 flex-1">
              {(isLoading || authPending) && folders.length === 0 && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-gray-100"}`} />
                  ))}
                </div>
              )}

              {!isLoading && !authPending && loadFailed && (
                <div className="py-8 flex flex-col items-center gap-2 text-center">
                  <WarningCircle size={26} weight="duotone" className="text-amber-500" />
                  <p className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة مجلداتك</p>
                  <button
                    type="button"
                    onClick={() => loadFolders()}
                    className={`flex items-center gap-1.5 mt-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold ${
                      isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
                  </button>
                </div>
              )}

              {!loadFailed && ((!isLoading && !authPending) || folders.length > 0) && matchingFolders.map(folder => {
                const inFolder = isItemInFolder(folder, currentDoc);
                const rowPending = pending.has(pendingKey(folder.id, currentDoc));
                const label = isRTL ? folder.name : folder.nameEn;
                return (
                  <div
                    key={folder.id}
                    className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all ${
                      inFolder
                        ? isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                    }`}
                  >
                    {/* The whole start of the row is the tick: one press saves or removes. */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={inFolder}
                      aria-busy={rowPending}
                      disabled={rowPending}
                      onClick={() => handleToggleFolder(folder.id)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 p-1.5 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]/60 disabled:cursor-wait"
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                        inFolder
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isDark ? "border-white/20" : "border-gray-300"
                      }`}>
                        {inFolder && <Check size={12} weight="bold" />}
                      </span>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: folder.color }} />
                      <span className="text-xs font-bold truncate">{label}</span>
                      <span className={`text-[9px] px-1 rounded font-mono flex-shrink-0 ${isDark ? "bg-white/5 text-zinc-400" : "bg-slate-200/60 text-slate-500"}`}>
                        {folder.laws.length}
                      </span>
                      <span className={`ms-auto text-[10px] font-bold flex-shrink-0 ${inFolder ? "" : "sr-only"}`}>
                        {rowPending
                          ? (isRTL ? "جارٍ الحفظ..." : "Saving...")
                          : inFolder ? (isRTL ? "محفوظ هنا ✓" : "Saved here ✓") : (isRTL ? "غير محفوظ" : "Not saved")}
                      </span>
                    </button>
                    {/* «إدارة المجلد»: a small named text link at the far end, away from the tick (owner note ٠٥ §٢.٢). */}
                    <button
                      type="button"
                      onClick={() => setManagingFolder(folder)}
                      className={`text-[10px] font-bold underline underline-offset-2 px-2 py-1 rounded-md flex-shrink-0 ${
                        isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {isRTL ? "إدارة المجلد" : "Manage folder"}
                    </button>
                  </div>
                );
              })}

              {!isLoading && !authPending && !loadFailed && matchingFolders.length === 0 && (
                <p className={`text-xs text-center py-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {folders.length === 0
                    ? (isRTL ? "لا توجد لديك مجلدات بعد — أنشئ أول مجلد لحفظ هذا المستند فيه مباشرة:" : "No folders yet — create your first folder below to save this document:")
                    : (isRTL ? "لا توجد مجلدات مطابقة." : "No matching folders found.")}
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
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateFolder();
                        } else if (e.key === "Escape" && folders.length > 0) {
                          // Close the form only — not the dialog.
                          e.preventDefault();
                          e.nativeEvent.stopImmediatePropagation();
                          setShowCreateForm(false);
                        }
                      }}
                      aria-label={isRTL ? "اسم مجلد جديد" : "New folder name"}
                      placeholder={isRTL ? "اسم مجلد جديد..." : "New folder name..."}
                      className={`flex-1 text-xs px-3 py-2 rounded-xl border outline-none ${
                        isDark ? "bg-[#0c0f12] border-white/5 text-white focus:border-[#C8A762]/40" : "bg-slate-50 border-slate-200 text-gray-900 focus:border-[#0B3D2E]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim() || creatingFolder}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        newFolderName.trim() && !creatingFolder
                          ? "bg-[#0B3D2E] text-white"
                          : isDark ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {creatingFolder
                        ? (isRTL ? "جارٍ الحفظ..." : "Saving...")
                        : (isRTL ? "إنشاء وحفظ" : "Create & Save")}
                    </button>
                    {folders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className={`text-xs ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-gray-400 hover:text-gray-600"}`}
                      >
                        {isRTL ? "إلغاء" : "Cancel"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label={isRTL ? "لون المجلد" : "Folder colour"}>
                    {FOLDER_COLORS.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={newFolderColor === c.hex}
                        aria-label={c.id}
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
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className={`w-full py-2 text-xs font-bold rounded-xl border border-dashed text-center flex items-center justify-center gap-1.5 transition-colors ${
                    isDark ? "border-white/10 text-gray-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <FolderSimplePlus size={14} />
                  {isRTL ? "إنشاء مجلد جديد" : "Create New Folder"}
                </button>
              )}

              {/* Footer — the explicit finish (owner note ٠٥ §٢.١, LIVE-F23). */}
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                data-testid="folder-dialog-finish"
                className="w-full py-3 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] active:scale-[0.99] transition-all shadow-md disabled:opacity-60 disabled:cursor-wait outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]/70"
              >
                {primaryLabel}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
    {toastNode}
    </>
  );
}
