"use client";
// ─── Collector Sessions Panel ─────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen, Plus, Check, X, Trash, ArrowsMerge, CheckCircle,
  Archive, Link as LinkIcon, PencilSimple, ArrowCounterClockwise,
  UsersThree, Clock, MagnifyingGlass, FloppyDisk,
} from "@phosphor-icons/react";
import {
  getActiveSessions, getArchivedSessions, getSessionItems,
  createSession, deleteSession, archiveSession, restoreSession,
  renameSession, removeFromInbox, markUsed, mergeItems, addToSession, updateItem,
  SOURCE_LABELS, SOURCE_COLORS,
  type InboxItem, type CollectorSession, type InboxSource,
} from "@/lib/services/researchService";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  onToast: (msg: string) => void;
}

// Days until auto-archive
const ARCHIVE_DAYS = 7;

function daysLeft(createdAt: string): number {
  const ms = ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.ceil((ms - elapsed) / (24 * 60 * 60 * 1000)));
}

export function SessionsPanel({ onToast }: Props) {
  const { isDark } = useTheme();
  const [sessions, setSessions] = useState<CollectorSession[]>([]);
  const [archived, setArchived] = useState<CollectorSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [mergeTitle, setMergeTitle] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemContent, setEditItemContent] = useState("");
  const [editItemTitle, setEditItemTitle] = useState("");
  const [sessionItemCounts, setSessionItemCounts] = useState<Record<string, number>>({});
  const [archivedItemsMap, setArchivedItemsMap] = useState<Record<string, InboxItem[]>>({});

  async function reload() {
    const active = await getActiveSessions();
    const arch = await getArchivedSessions();
    setSessions(active);
    setArchived(arch);
    if (activeSession) setSessionItems(await getSessionItems(activeSession));
    // Pre-compute item counts for all sessions
    const counts: Record<string, number> = {};
    for (const s of [...active, ...arch]) {
      counts[s.id] = (await getSessionItems(s.id)).length;
    }
    setSessionItemCounts(counts);
    // Pre-fetch archived items for search
    const archMap: Record<string, InboxItem[]> = {};
    for (const s of arch) {
      archMap[s.id] = await getSessionItems(s.id);
    }
    setArchivedItemsMap(archMap);
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (activeSession) { getSessionItems(activeSession).then(setSessionItems); }
  }, [activeSession]);

  async function handleCreateSession() {
    const s = await createSession(newSessionName.trim() || undefined);
    setNewSessionName(""); setShowNewSession(false);
    await reload(); setActiveSession(s.id);
    onToast(`جلسة "${s.name}" جديدة ✓`);
  }

  function handleDelete(id: string) { removeFromInbox(id); reload(); onToast("حُذف"); }
  function handleDeleteSel() { selected.forEach(id => removeFromInbox(id)); setSelected(new Set()); reload(); onToast(`حُذف ${selected.size}`); }
  function handleMarkUsed() { markUsed(Array.from(selected)); setSelected(new Set()); reload(); onToast("مُميَّز كمستخدم"); }
  function handleMerge() {
    if (selected.size < 2 || !mergeTitle.trim() || !activeSession) return;
    mergeItems(Array.from(selected), mergeTitle.trim(), "session", activeSession);
    setSelected(new Set()); setMergeTitle(""); setShowMerge(false);
    reload(); onToast("تم الدمج ✓");
  }

  async function handleAddItem() {
    if (!addTitle.trim() || !addContent.trim() || !activeSession) return;
    await addToSession(activeSession, "manual", "text", addTitle.trim(), addContent.trim());
    setAddTitle(""); setAddContent(""); setShowAddItem(false);
    await reload(); onToast("أُضيف للجلسة ✓");
  }

  function handleShare(sessionId: string) {
    const url = `${window.location.origin}/ai/collector?session=${sessionId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    onToast("رابط الجلسة نُسخ ✓");
  }

  function handleRename(id: string) {
    if (!editName.trim()) { setEditingId(null); return; }
    renameSession(id, editName.trim()); reload(); setEditingId(null);
    onToast("تم التغيير ✓");
  }

  function toggleSel(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleEditItem(item: InboxItem) {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemContent(item.content);
  }

  function handleSaveItemEdit(id: string) {
    if (!editItemTitle.trim() || !editItemContent.trim()) return;
    updateItem(id, editItemTitle.trim(), editItemContent.trim());
    setEditingItemId(null);
    reload();
    onToast("تم الحفظ ✓");
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";
  const activeS = sessions.find(s => s.id === activeSession);

  return (
    <div className="space-y-4">

      {/* Sessions list */}
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          الجلسات النشطة ({sessions.length})
        </span>
        <button onClick={() => setShowNewSession(v => !v)}
          className={`flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
            showNewSession ? "bg-purple-600 border-purple-600 text-white"
                           : isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500"
          }`}>
          <Plus size={11} weight="bold" /> جلسة جديدة
        </button>
      </div>

      {/* New session form */}
      <AnimatePresence>
        {showNewSession && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`${card} p-4 flex gap-2`}>
              <input value={newSessionName} onChange={e => setNewSessionName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateSession()}
                placeholder="اسم الجلسة (اختياري)"
                autoFocus
                className={`flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
              <button onClick={handleCreateSession}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-[12px] font-bold text-white">
                <Check size={12} weight="bold" /> إنشاء
              </button>
              <button onClick={() => setShowNewSession(false)}
                className={`px-3 py-2 rounded-xl border text-[12px] ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session cards */}
      {sessions.length === 0 && (
        <div className={`${card} p-10 flex flex-col items-center gap-2 text-center`}>
          <FolderOpen size={32} weight="duotone" className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد جلسات</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>أنشئ جلسة لتنظيم عملك البحثي</p>
        </div>
      )}

      <div className="space-y-2">
        {sessions.map(s => {
          const isOpen = activeSession === s.id;
          const days = daysLeft(s.createdAt);
          const sItems = isOpen ? sessionItems : [];
          const itemCount = sessionItemCounts[s.id] ?? 0;
          return (
            <div key={s.id} className={`${card} overflow-hidden transition-all`}>
              {/* Session header */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => { setActiveSession(isOpen ? null : s.id); setSelected(new Set()); }}>
                <FolderOpen size={15} weight={isOpen ? "duotone" : "regular"} className={isOpen ? "text-purple-500" : isDark ? "text-zinc-500" : "text-slate-400"} />

                {editingId === s.id ? (
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(s.id); if (e.key === "Escape") setEditingId(null); }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                    className={`flex-1 rounded-lg border px-2 py-1 text-[12px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-white text-zinc-800"}`} />
                ) : (
                  <span className={`flex-1 text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{s.name}</span>
                )}

                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{itemCount} عنصر</span>

                {days <= 2 && (
                  <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                    <Clock size={10} /> {days}ي
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                    title="إعادة تسمية"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-300 hover:text-slate-600"}`}>
                    <PencilSimple size={12} />
                  </button>
                  <button onClick={() => handleShare(s.id)}
                    title="مشاركة الجلسة"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-purple-400" : "text-slate-300 hover:text-purple-600"}`}>
                    <LinkIcon size={12} />
                  </button>
                  <button onClick={() => { archiveSession(s.id); reload(); setActiveSession(null); onToast("أُرشفت الجلسة"); }}
                    title="أرشفة"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-amber-400" : "text-slate-300 hover:text-amber-600"}`}>
                    <Archive size={12} />
                  </button>
                  <button onClick={() => { deleteSession(s.id); reload(); if (activeSession === s.id) setActiveSession(null); onToast("حُذفت الجلسة"); }}
                    title="حذف"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                    <Trash size={12} />
                  </button>
                </div>
              </div>

              {/* Session items */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className={`border-t px-4 pb-4 pt-3 space-y-3 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>

                      {/* Session toolbar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setShowAddItem(v => !v)}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${isDark ? "border-purple-500/30 text-purple-400 hover:bg-purple-900/20" : "border-purple-200 text-purple-700 hover:bg-purple-50"}`}>
                          <Plus size={10} weight="bold" /> إضافة يدوية
                        </button>
                        <button onClick={() => handleShare(s.id)}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500"}`}>
                          <UsersThree size={10} /> دعوة فريق / مشاركة
                        </button>
                        <span className={`text-[9px] ms-auto ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                          تُؤرشف بعد {days} يوم
                        </span>
                      </div>

                      {/* Add item form */}
                      <AnimatePresence>
                        {showAddItem && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-white/[0.07] bg-zinc-800/40" : "border-slate-200 bg-slate-50"}`}>
                              <input value={addTitle} onChange={e => setAddTitle(e.target.value)}
                                placeholder="العنوان"
                                className={`w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
                              <textarea value={addContent} onChange={e => setAddContent(e.target.value)} rows={2}
                                placeholder="النص..."
                                className={`w-full resize-none rounded-lg border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { setShowAddItem(false); setAddTitle(""); setAddContent(""); }}
                                  className={`px-3 py-1.5 rounded-lg text-[11px] border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>إلغاء</button>
                                <button onClick={handleAddItem} disabled={!addTitle.trim() || !addContent.trim()}
                                  className="px-4 py-1.5 rounded-lg bg-purple-600 text-[11px] font-bold text-white disabled:opacity-40">إضافة</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Bulk bar */}
                      <AnimatePresence>
                        {selected.size > 0 && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-2 ${isDark ? "border-purple-500/20 bg-purple-900/10" : "border-purple-200 bg-purple-50"}`}>
                            <span className={`text-[11px] font-bold ${isDark ? "text-purple-400" : "text-purple-700"}`}>{selected.size} محدد</span>
                            <button onClick={() => setSelected(new Set())} className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إلغاء</button>
                            <div className="flex-1" />
                            <button onClick={handleMarkUsed}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${isDark ? "border-emerald-700/30 text-emerald-400" : "border-emerald-200 text-emerald-700"}`}>
                              <CheckCircle size={10} weight="fill" />مستخدم
                            </button>
                            {selected.size >= 2 && (
                              <button onClick={() => setShowMerge(true)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${isDark ? "border-blue-700/30 text-blue-400" : "border-blue-200 text-blue-700"}`}>
                                <ArrowsMerge size={10} />دمج
                              </button>
                            )}
                            <button onClick={handleDeleteSel}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${isDark ? "border-red-700/30 text-red-400" : "border-red-200 text-red-700"}`}>
                              <Trash size={10} />حذف
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Items */}
                      {sItems.length === 0 ? (
                        <p className={`text-[12px] text-center py-6 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>لا توجد عناصر في هذه الجلسة</p>
                      ) : (
                        <div className="space-y-1.5">
                          {sItems.map(item => {
                            const isSel = selected.has(item.id);
                            const col = SOURCE_COLORS[item.source] ?? "zinc";
                            const isEditingThis = editingItemId === item.id;
                            return (
                              <div key={item.id} className={`rounded-xl border p-3 flex items-start gap-2.5 transition-all ${
                                isSel ? isDark ? "border-purple-500/30 bg-purple-900/10" : "border-purple-200 bg-purple-50" : isDark ? "border-white/[0.05] bg-zinc-800/30" : "border-slate-100 bg-slate-50"
                              } ${item.used ? "opacity-50" : ""}`}>
                                <button onClick={() => toggleSel(item.id)}
                                  className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5 ${isSel ? "bg-purple-500 border-purple-500" : isDark ? "border-zinc-600" : "border-slate-300"}`}>
                                  {isSel && <Check size={8} weight="bold" className="text-white" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border text-${col}-500 border-${col}-500/30 bg-${col}-500/10`}>
                                      {SOURCE_LABELS[item.source as InboxSource]}
                                    </span>
                                    {item.used && <span className="text-[9px] text-emerald-500"><CheckCircle size={9} weight="fill" className="inline" />مستخدم</span>}
                                  </div>
                                  {isEditingThis ? (
                                    <div className="space-y-1.5 mt-1">
                                      <input
                                        value={editItemTitle}
                                        onChange={e => setEditItemTitle(e.target.value)}
                                        className={`w-full rounded-lg border px-2.5 py-1.5 text-[12px] font-bold outline-none
                                          ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100" : "border-slate-200 bg-white text-zinc-800"}`} />
                                      <textarea
                                        value={editItemContent}
                                        onChange={e => setEditItemContent(e.target.value)}
                                        rows={3}
                                        className={`w-full resize-none rounded-lg border px-2.5 py-1.5 text-[11px] outline-none leading-relaxed
                                          ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-300" : "border-slate-200 bg-white text-zinc-700"}`} />
                                      <div className="flex gap-1.5 justify-end">
                                        <button onClick={() => setEditingItemId(null)}
                                          className={`px-2.5 py-1 rounded-lg text-[10px] border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                                          إلغاء
                                        </button>
                                        <button onClick={() => handleSaveItemEdit(item.id)}
                                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-[10px] font-bold text-white">
                                          <FloppyDisk size={10} weight="fill" /> حفظ
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{item.title}</p>
                                      <p className={`text-[11px] line-clamp-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.content}</p>
                                    </>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  {!isEditingThis && (
                                    <button onClick={() => handleEditItem(item)}
                                      title="تعديل"
                                      className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-blue-400" : "text-slate-300 hover:text-blue-500"}`}>
                                      <PencilSimple size={10} />
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(item.id)}
                                    className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                                    <X size={10} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Merge modal */}
      <AnimatePresence>
        {showMerge && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowMerge(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className={`fixed z-50 inset-x-4 top-1/3 max-w-sm mx-auto rounded-2xl border p-5 space-y-3 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-slate-200 shadow-lg"}`}>
              <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>دمج {selected.size} عناصر</p>
              <input value={mergeTitle} onChange={e => setMergeTitle(e.target.value)} placeholder="اسم العنصر المدموج..." autoFocus
                className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowMerge(false)} className={`px-4 py-2 rounded-xl text-[12px] border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>إلغاء</button>
                <button onClick={handleMerge} disabled={!mergeTitle.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-[12px] font-bold text-white disabled:opacity-40">دمج</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Archive toggle */}
      {archived.length > 0 && (
        <div>
          <button onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-2 text-[11px] font-semibold ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
            <Archive size={12} /> الأرشيف ({archived.length})
          </button>
          <AnimatePresence>
            {showArchived && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3 space-y-3">
                {/* Archive search */}
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.07] bg-zinc-800/50" : "border-slate-200 bg-slate-50"}`}>
                  <MagnifyingGlass size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                  <input
                    value={archiveSearch}
                    onChange={e => setArchiveSearch(e.target.value)}
                    placeholder="ابحث في الأرشيف (اسم جلسة، موضوع، موكل، رقم قضية...)"
                    className={`flex-1 bg-transparent text-[12px] outline-none ${
                      isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-slate-400"
                    }`}
                  />
                  {archiveSearch && (
                    <button onClick={() => setArchiveSearch("")} className={isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-300 hover:text-slate-500"}>
                      <X size={11} />
                    </button>
                  )}
                </div>
                {/* Filtered archive list */}
                <div className="space-y-2">
                  {archived
                    .filter(s => {
                      if (!archiveSearch.trim()) return true;
                      const q = archiveSearch.toLowerCase();
                      // search in session name + all item titles/content
                      if (s.name.toLowerCase().includes(q)) return true;
                      const items = archivedItemsMap[s.id] ?? [];
                      return items.some(it =>
                        it.title.toLowerCase().includes(q) ||
                        it.content.toLowerCase().includes(q)
                      );
                    })
                    .map(s => (
                    <div key={s.id} className={`rounded-xl border p-3 flex items-center gap-3 opacity-60 ${
                      isDark ? "border-white/[0.05] bg-zinc-900" : "border-slate-200 bg-white"
                    }`}>
                      <Archive size={14} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-[12px] font-semibold truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{s.name}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                          {s.archivedAt ? new Date(s.archivedAt).toLocaleDateString("ar-SA") : ""}
                          {" · "}{sessionItemCounts[s.id] ?? 0} عنصر
                        </span>
                      </div>
                      <button onClick={() => { restoreSession(s.id); reload(); onToast("تم استعادة الجلسة"); }}
                        title="استعادة"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-emerald-400" : "text-slate-300 hover:text-emerald-600"}`}>
                        <ArrowCounterClockwise size={12} />
                      </button>
                      <button onClick={() => { deleteSession(s.id); reload(); onToast("حُذفت الجلسة نهائياً"); }}
                        title="حذف نهائي"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                  {archived.filter(s => {
                    if (!archiveSearch.trim()) return false;
                    const q = archiveSearch.toLowerCase();
                    if (s.name.toLowerCase().includes(q)) return true;
                    const items = archivedItemsMap[s.id] ?? [];
                    return items.some(it =>
                      it.title.toLowerCase().includes(q) || it.content.toLowerCase().includes(q)
                    );
                  }).length === 0 && archiveSearch.trim() && (
                    <p className={`text-[12px] text-center py-4 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                      لم يُعثر على نتائج في الأرشيف
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
