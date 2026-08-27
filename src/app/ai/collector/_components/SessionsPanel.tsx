"use client";
// ─── Collector Sessions Panel ─────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen, Plus, Check, X, Trash, ArrowsMerge, CheckCircle,
  Archive, Link as LinkIcon, PencilSimple, ArrowCounterClockwise,
  UsersThree, Clock, MagnifyingGlass, FloppyDisk, WarningCircle, ArrowClockwise,
} from "@phosphor-icons/react";
import {
  getActiveSessions, getArchivedSessions, getSessionItems,
  createSession, deleteSession, archiveSession, restoreSession,
  renameSession, removeFromInbox, markUsed, mergeItems, addToSession, updateItem,
  SOURCE_LABELS, SOURCE_COLORS,
  type InboxItem, type CollectorSession, type InboxSource,
} from "@/lib/services/researchService";
import { listViewState, type ListRead } from "@/lib/services/listRead";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  onToast: (msg: string, kind?: "success" | "error") => void;
}

// Days until auto-archive
const ARCHIVE_DAYS = 7;

/**
 * Days until auto-archive, or `null` when the session carries no readable
 * creation date. In supabase mode `research_sessions` rows arrive unmapped
 * (`created_at`, not `createdAt`), which made this NaN — and «تُؤرشف بعد NaN
 * يوم» was printed to lawyers. A deadline nobody can compute is withheld.
 */
function daysLeft(createdAt: string | undefined): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const ms = ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - created;
  return Math.max(0, Math.ceil((ms - elapsed) / (24 * 60 * 60 * 1000)));
}

export function SessionsPanel({ onToast }: Props) {
  const { isDark } = useTheme();
  /*
    EVERY LIST HERE IS A ListRead, NOT AN ARRAY.

    `setSessions(await getActiveSessions())` turned a failed query into `[]`,
    and `[]` renders «لا توجد جلسات» — a lawyer whose session list did not load
    was told they had never opened one, next to a button offering to create the
    first. The read is held and `listViewState` picks the screen.
  */
  const [sessionsRead, setSessionsRead] = useState<ListRead<CollectorSession> | null>(null);
  const [archivedRead, setArchivedRead] = useState<ListRead<CollectorSession> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [itemsRead, setItemsRead] = useState<ListRead<InboxItem> | null>(null);
  /** Which session `itemsRead` describes — never render it for another one. */
  const [itemsFor, setItemsFor] = useState<string | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
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
  /** `null` for a session whose items could not be counted — NOT `0`. */
  const [sessionItemCounts, setSessionItemCounts] = useState<Record<string, number | null>>({});
  const [archivedItemsMap, setArchivedItemsMap] = useState<Record<string, InboxItem[]>>({});
  /**
   * True when at least one archived session's items could not be read, so the
   * archive search index below is incomplete. Without it «لم يُعثر على نتائج»
   * would be asserted over sessions nobody managed to look inside.
   */
  const [archiveIndexPartial, setArchiveIndexPartial] = useState(false);

  async function loadSessionItems(sessionId: string) {
    setItemsFor(sessionId);
    setItemsLoading(true);
    const read = await getSessionItems(sessionId);
    setItemsRead(read);
    setItemsLoading(false);
  }

  async function reload() {
    setLoading(true);
    const [active, arch] = await Promise.all([getActiveSessions(), getArchivedSessions()]);
    setSessionsRead(active);
    setArchivedRead(arch);
    setLoading(false);

    // Only re-read the open session's items if that session is still in the
    // list we just got back. After a delete it is not, and asking for a deleted
    // session's items would record a failed read for a card nobody can see.
    const listed = [
      ...(active.ok ? active.items : []),
      ...(arch.ok ? arch.items : []),
    ].some(s => s.id === activeSession);
    if (activeSession && listed) await loadSessionItems(activeSession);

    // Item counts, and the archived search index, from ONE pass over each
    // session — the two loops here used to fetch every archived session twice.
    // A session whose items fail to load gets `null`, which renders as "could
    // not count" rather than as «٠ عنصر».
    const counts: Record<string, number | null> = {};
    const archMap: Record<string, InboxItem[]> = {};
    let partial = false;
    const archivedIds = new Set(arch.ok ? arch.items.map(s => s.id) : []);
    for (const s of [...(active.ok ? active.items : []), ...(arch.ok ? arch.items : [])]) {
      const read = await getSessionItems(s.id);
      counts[s.id] = read.ok ? read.items.length : null;
      if (archivedIds.has(s.id)) {
        if (read.ok) archMap[s.id] = read.items;
        else partial = true;
      }
    }
    setSessionItemCounts(counts);
    setArchivedItemsMap(archMap);
    setArchiveIndexPartial(partial);
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    // Nothing is cleared when a session closes: the card is collapsing and
    // AnimatePresence still renders its last content on the way out. Blanking
    // `itemsRead` here would flash «تعذّرت قراءة عناصر هذه الجلسة» through the
    // exit animation. Staleness is handled by `itemsFor` instead.
    if (activeSession) { loadSessionItems(activeSession); }
  }, [activeSession]);

  /*
    createSession THROWS in supabase mode and now returns the ACTUAL row — it
    previously returned the `{ data }` envelope, so `s.id` here was `undefined`
    and the panel opened a session that did not exist while the toast announced
    it by an undefined name.
  */
  async function handleCreateSession() {
    let s: CollectorSession;
    try {
      s = await createSession(newSessionName.trim() || undefined);
    } catch (error) {
      console.error("[SessionsPanel] createSession failed:", error);
      onToast("تعذّر إنشاء الجلسة — لم تُحفظ على الخادم. أعد المحاولة.", "error");
      return;
    }
    setNewSessionName(""); setShowNewSession(false);
    await reload(); setActiveSession(s.id);
    onToast(s.name ? `جلسة "${s.name}" جديدة ✓` : "أُنشئت الجلسة ✓");
  }

  /*
    THE FOUR SESSION MUTATIONS BELOW NOW REJECT IN SUPABASE MODE.

    They used to mutate localStorage and resolve, so the screen showed the
    rename/archive/delete and the server never saw it — a "deleted" session came
    back at the next reload. Each one reports its own failure now instead of
    raising an unhandled rejection behind a green checkmark.
  */
  async function handleArchiveSession(id: string) {
    try {
      await archiveSession(id);
    } catch (error) {
      console.error("[SessionsPanel] archiveSession failed:", error);
      onToast("تعذّرت أرشفة الجلسة — لم يُحفظ التغيير.", "error");
      return;
    }
    await reload();
    setActiveSession(null);
    onToast("أُرشفت الجلسة");
  }

  async function handleDeleteSession(id: string, finalNotice = false) {
    try {
      await deleteSession(id);
    } catch (error) {
      console.error("[SessionsPanel] deleteSession failed:", error);
      onToast("تعذّر حذف الجلسة — ما زالت موجودة على الخادم.", "error");
      return;
    }
    if (activeSession === id) setActiveSession(null);
    await reload();
    onToast(finalNotice ? "حُذفت الجلسة نهائياً" : "حُذفت الجلسة");
  }

  async function handleRestoreSession(id: string) {
    try {
      await restoreSession(id);
    } catch (error) {
      console.error("[SessionsPanel] restoreSession failed:", error);
      onToast("تعذّرت استعادة الجلسة — لم يُحفظ التغيير.", "error");
      return;
    }
    await reload();
    onToast("تم استعادة الجلسة");
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

  // addToSession THROWS in supabase mode. The form keeps the user's text when
  // the save fails — losing what they typed on top of not saving it is two
  // failures, not one.
  async function handleAddItem() {
    if (!addTitle.trim() || !addContent.trim() || !activeSession) return;
    try {
      await addToSession(activeSession, "manual", "text", addTitle.trim(), addContent.trim());
    } catch (error) {
      console.error("[SessionsPanel] addToSession failed:", error);
      onToast("تعذّر حفظ العنصر — لم يُضَف للجلسة. نصّك ما زال في النموذج.", "error");
      return;
    }
    setAddTitle(""); setAddContent(""); setShowAddItem(false);
    await reload(); onToast("أُضيف للجلسة ✓");
  }

  function handleShare(sessionId: string) {
    const url = `${window.location.origin}/ai/collector?session=${sessionId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    onToast("رابط الجلسة نُسخ ✓");
  }

  async function handleRename(id: string) {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await renameSession(id, editName.trim());
    } catch (error) {
      console.error("[SessionsPanel] renameSession failed:", error);
      // The edit box stays open with the typed name still in it.
      onToast("تعذّرت إعادة التسمية — لم يُحفظ الاسم الجديد.", "error");
      return;
    }
    setEditingId(null);
    await reload();
    onToast("تم التغيير ✓");
  }

  function toggleSel(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleEditItem(item: InboxItem) {
    setEditingItemId(item.id);
    // `?? ""` keeps the inputs controlled: a server row has no `title` column,
    // so `item.title` is undefined and React would switch the input to
    // uncontrolled mid-edit.
    setEditItemTitle(item.title ?? "");
    setEditItemContent(item.content ?? "");
  }

  function handleSaveItemEdit(id: string) {
    if (!editItemTitle.trim() || !editItemContent.trim()) return;
    updateItem(id, editItemTitle.trim(), editItemContent.trim());
    setEditingItemId(null);
    reload();
    onToast("تم الحفظ ✓");
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  // Reached only under the `ready` branch of each state below — the arrays are
  // empty in every other case and nothing renders them there.
  const sessionsState = listViewState(loading, sessionsRead);
  const archivedState = listViewState(loading, archivedRead);
  const sessions = sessionsRead?.ok ? sessionsRead.items : [];
  const archived = archivedRead?.ok ? archivedRead.items : [];
  /*
    A read belongs to ONE session. Between opening session B and its items
    arriving, `itemsRead` still describes session A — rendering it under B's
    header would attribute one matter's clippings to another. A mismatch counts
    as 'loading', which is exactly what it is: B's items have not arrived.
  */
  const itemsMatch = itemsFor === activeSession;
  const itemsState = listViewState(itemsLoading || !itemsMatch, itemsMatch ? itemsRead : null);
  const sessionItems = itemsMatch && itemsRead?.ok ? itemsRead.items : [];

  return (
    <div className="space-y-4">

      {/* Sessions list */}
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          {/* «الجلسات النشطة (٠)» over a failed read is a claim about the
              lawyer's work, not a placeholder. The number is withheld. */}
          الجلسات النشطة{sessionsState === "ready" || sessionsState === "empty" ? ` (${sessions.length})` : ""}
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

      {/* Session cards — loading, unreadable and empty are three screens. */}
      {sessionsState === "loading" && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map(i => (
            <div key={i} className={`${card} px-4 py-3 animate-pulse`}>
              <div className={`h-3 w-2/5 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-200"}`} />
            </div>
          ))}
        </div>
      )}

      {sessionsState === "unreadable" && (
        <div className={`${card} p-10 flex flex-col items-center gap-3 text-center`}>
          <WarningCircle size={32} weight="duotone" className="text-amber-500" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة الجلسات</p>
          <p className={`text-[11px] leading-relaxed max-w-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يصل رد من الخادم. جلساتك قد تكون موجودة — لا نعرف. أعد المحاولة
            قبل إنشاء جلسة جديدة حتى لا تتكرّر.
          </p>
          <button onClick={() => { reload(); }}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold transition-colors ${
              isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}>
            <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
          </button>
        </div>
      )}

      {sessionsState === "empty" && (
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
          // undefined = not counted yet, null = the count query failed.
          // Neither is `0`, and neither may be rendered as one.
          const itemCount = sessionItemCounts[s.id];
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
                  <span className={`flex-1 text-[13px] font-bold ${s.name ? (isDark ? "text-zinc-200" : "text-zinc-700") : (isDark ? "text-zinc-500 italic" : "text-slate-400 italic")}`}>
                    {s.name || "بلا اسم"}
                  </span>
                )}

                {itemCount === null ? (
                  <span title="تعذّرت قراءة عناصر هذه الجلسة"
                    className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                    تعذّر العدّ
                  </span>
                ) : itemCount !== undefined && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{itemCount} عنصر</span>
                )}

                {/* No creation date ⇒ no countdown. NaN was being printed here. */}
                {days !== null && days <= 2 && (
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
                  <button onClick={() => { handleArchiveSession(s.id); }}
                    title="أرشفة"
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-amber-400" : "text-slate-300 hover:text-amber-600"}`}>
                    <Archive size={12} />
                  </button>
                  <button onClick={() => { handleDeleteSession(s.id); }}
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
                        {days !== null && (
                          <span className={`text-[9px] ms-auto ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                            تُؤرشف بعد {days} يوم
                          </span>
                        )}
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

                      {/* Items — the same three states, one level down. */}
                      {itemsState === "loading" && (
                        <div className="space-y-1.5" aria-busy="true">
                          {[0, 1].map(i => (
                            <div key={i} className={`rounded-xl border p-3 animate-pulse ${isDark ? "border-white/[0.05] bg-zinc-800/30" : "border-slate-100 bg-slate-50"}`}>
                              <div className={`h-3 w-1/3 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-200"}`} />
                            </div>
                          ))}
                        </div>
                      )}

                      {itemsState === "unreadable" && (
                        <div className={`rounded-xl border p-4 flex flex-col items-center gap-2 text-center ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
                          <WarningCircle size={20} weight="duotone" className="text-amber-500" />
                          <p className={`text-[12px] font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>تعذّرت قراءة عناصر هذه الجلسة</p>
                          <p className={`text-[11px] ${isDark ? "text-amber-400/70" : "text-amber-700/80"}`}>
                            الجلسة قد تحتوي على عناصر — لم يصل رد من الخادم.
                          </p>
                          <button onClick={() => { loadSessionItems(s.id); }}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold ${isDark ? "border-amber-500/30 text-amber-300" : "border-amber-300 text-amber-800"}`}>
                            <ArrowClockwise size={11} weight="bold" /> إعادة المحاولة
                          </button>
                        </div>
                      )}

                      {itemsState === "empty" && (
                        <p className={`text-[12px] text-center py-6 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>لا توجد عناصر في هذه الجلسة</p>
                      )}

                      {itemsState === "ready" && (
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
                                      {SOURCE_LABELS[item.source as InboxSource] ?? "مصدر غير محدد"}
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
                                      {/* Items saved through the API come back
                                          titleless — no such column exists. */}
                                      <p className={`text-[12px] font-semibold ${item.title ? (isDark ? "text-zinc-200" : "text-zinc-800") : (isDark ? "text-zinc-500 italic" : "text-slate-400 italic")}`}>
                                        {item.title || "بلا عنوان"}
                                      </p>
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

      {/* The archive read failed — say so rather than hide the section, which
          would assert there is nothing archived. */}
      {archivedState === "unreadable" && (
        <div className={`flex items-center gap-2 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
          <WarningCircle size={13} weight="duotone" />
          تعذّرت قراءة الأرشيف
          <button onClick={() => { reload(); }} className="underline underline-offset-2">إعادة المحاولة</button>
        </div>
      )}

      {/* Archive toggle */}
      {archivedState === "ready" && archived.length > 0 && (
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
                {/* The search reads a pre-fetched index of every archived
                    session's items. When part of that index is missing, "no
                    results" is not a fact about the archive. */}
                {archiveIndexPartial && (
                  <p className={`text-[10px] flex items-center gap-1 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
                    <WarningCircle size={11} weight="duotone" />
                    تعذّرت قراءة عناصر بعض الجلسات المؤرشفة — البحث داخلها ناقص.
                  </p>
                )}
                {/* Filtered archive list */}
                <div className="space-y-2">
                  {archived
                    .filter(s => {
                      if (!archiveSearch.trim()) return true;
                      const q = archiveSearch.toLowerCase();
                      // search in session name + all item titles/content.
                      // `?? ""` throughout: server rows carry no `title` and an
                      // unmapped session carries no `name`, and a crash inside a
                      // filter would blank the whole archive.
                      if ((s.name ?? "").toLowerCase().includes(q)) return true;
                      const items = archivedItemsMap[s.id] ?? [];
                      return items.some(it =>
                        (it.title ?? "").toLowerCase().includes(q) ||
                        (it.content ?? "").toLowerCase().includes(q)
                      );
                    })
                    .map(s => (
                    <div key={s.id} className={`rounded-xl border p-3 flex items-center gap-3 opacity-60 ${
                      isDark ? "border-white/[0.05] bg-zinc-900" : "border-slate-200 bg-white"
                    }`}>
                      <Archive size={14} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-[12px] font-semibold truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{s.name || "بلا اسم"}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                          {s.archivedAt ? new Date(s.archivedAt).toLocaleDateString("ar-SA") : ""}
                          {/* «٠ عنصر» would be a claim about an archived session
                              whose items nobody could read. */}
                          {sessionItemCounts[s.id] === null
                            ? " · تعذّر عدّ العناصر"
                            : sessionItemCounts[s.id] !== undefined
                              ? ` · ${sessionItemCounts[s.id]} عنصر`
                              : ""}
                        </span>
                      </div>
                      <button onClick={() => { handleRestoreSession(s.id); }}
                        title="استعادة"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-emerald-400" : "text-slate-300 hover:text-emerald-600"}`}>
                        <ArrowCounterClockwise size={12} />
                      </button>
                      <button onClick={() => { handleDeleteSession(s.id, true); }}
                        title="حذف نهائي"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-600 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                  {archived.filter(s => {
                    if (!archiveSearch.trim()) return false;
                    const q = archiveSearch.toLowerCase();
                    if ((s.name ?? "").toLowerCase().includes(q)) return true;
                    const items = archivedItemsMap[s.id] ?? [];
                    return items.some(it =>
                      (it.title ?? "").toLowerCase().includes(q) || (it.content ?? "").toLowerCase().includes(q)
                    );
                  }).length === 0 && archiveSearch.trim() && (
                    <p className={`text-[12px] text-center py-4 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                      {archiveIndexPartial
                        ? "لم يُعثر على نتائج فيما أمكن قراءته من الأرشيف"
                        : "لم يُعثر على نتائج في الأرشيف"}
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
