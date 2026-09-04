"use client";
// ─── Collector Desktop Panel ──────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Plus, Check, X, Trash, ArrowsMerge, CheckCircle, MagnifyingGlass, WarningCircle, ArrowClockwise } from "@phosphor-icons/react";
import {
  getDesktopItems, clearDesktop, removeFromInbox, markUsed, mergeItems,
  addToDesktop, SOURCE_LABELS, SOURCE_COLORS,
  type InboxItem, type InboxSource,
} from "@/lib/services/researchService";
import { listViewState, truncationNoticeAr, type ListRead } from "@/lib/services/listRead";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { useTheme } from "@/components/ThemeProvider";

interface Props { onToast: (msg: string, kind?: "success" | "error") => void; }

/**
 * A date only when there is a date. In supabase mode these rows come back
 * unmapped from `research_items` (id/session_id/content/source/item_type/
 * position/metadata/created_at — there is no `sentAt` column and no mapping
 * layer), so `new Date(item.sentAt)` produced «Invalid Date» printed beside a
 * perfectly real item. An unreadable date is withheld, not invented.
 * The missing mapping is reported as a followUp — it is not this file's to fix.
 */
function formatSentAt(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("ar-SA");
}

export function DesktopPanel({ onToast }: Props) {
  const { isDark } = useTheme();
  /*
    THE READ ITSELF IS THE STATE, NOT AN ARRAY.

    `setItems(await getDesktopItems())` used to turn a failed desktop query into
    `[]`, and `[]` renders «الديسك توب فارغ» — a confident statement that the
    lawyer has collected nothing, produced by a request that never answered.
    The ListRead is held instead and `listViewState` decides which of the three
    screens is true.
  */
  const [read, setRead] = useState<ListRead<InboxItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [search, setSearch] = useState("");
  const [mergeTitle, setMergeTitle] = useState("");
  const [showMerge, setShowMerge] = useState(false);

  const reload = async () => {
    setLoading(true);
    setRead(await getDesktopItems());
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const state = listViewState(loading, read);
  // itemsOf() equivalent, reached only past the loading/unreadable branches
  // below — every render of `items` sits under `state === "ready"`.
  const items = read?.ok ? read.items : [];
  const truncation = truncationNoticeAr(read);

  const filtered = items.filter(i =>
    !search.trim() ||
    (i.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (i.content ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggleSel(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /*
    addToDesktop THROWS in supabase mode now. It used to answer a failed POST by
    writing to localStorage and returning a fully-formed item, so the panel
    reported «أُضيف للديسك توب ✓» over a clipping that never reached the server
    and vanished at the next reload.

    The form is left filled on failure — the user's text is the one thing that
    must not disappear when the save does.
  */
  async function handleAdd() {
    if (!addTitle.trim() || !addContent.trim()) return;
    try {
      await addToDesktop("manual", "text", addTitle.trim(), addContent.trim());
    } catch (error) {
      console.error("[DesktopPanel] addToDesktop failed:", error);
      onToast("تعذّر حفظ العنصر — لم يُضَف للديسك توب. نصّك ما زال في النموذج.", "error");
      return;
    }
    setAddTitle(""); setAddContent(""); setShowAdd(false);
    await reload(); onToast("أُضيف للديسك توب ✓");
  }

  function handleDelete(id: string) { removeFromInbox(id); reload(); onToast("تم الحذف"); }

  function handleDeleteSel() {
    selected.forEach(id => removeFromInbox(id));
    setSelected(new Set()); reload(); onToast(`حُذف ${selected.size} عنصر`);
  }

  // Awaited before the reload — markUsed PATCHes the server in supabase mode
  // (researchService.ts) now; firing it and re-fetching in the same tick raced
  // the write against the reload that follows.
  async function handleMarkUsed() {
    await markUsed(Array.from(selected));
    setSelected(new Set());
    await reload();
    onToast("مُميَّز كـ مستخدم");
  }

  function handleMerge() {
    if (selected.size < 2 || !mergeTitle.trim()) return;
    mergeItems(Array.from(selected), mergeTitle.trim(), "desktop");
    setSelected(new Set()); setMergeTitle(""); setShowMerge(false);
    reload(); onToast("تم الدمج ✓");
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Monitor size={16} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
          <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>الديسك توب</span>
          {/* A count only where one was actually read. «٠ عنصر» over a failed
              query is the defect this sweep exists to remove. */}
          {state === "unreadable" ? (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
              العدد غير معروف
            </span>
          ) : state !== "loading" && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{items.length} عنصر</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(v => !v)}
            className={`flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
              showAdd ? "bg-purple-600 border-purple-600 text-white"
                      : isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
            }`}>
            <Plus size={11} weight="bold" /> إضافة يدوية
          </button>
          {state === "ready" && (
            <button onClick={() => { clearDesktop(); reload(); onToast("تم مسح الديسك توب"); }}
              className={`text-[11px] font-semibold ${isDark ? "text-red-500/50 hover:text-red-400" : "text-red-400 hover:text-red-600"}`}>
              <Trash size={12} className="inline ml-1" />مسح الكل
            </button>
          )}
        </div>
      </div>

      {/* Manual add */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`${card} p-4 space-y-3`}>
              <input value={addTitle} onChange={e => setAddTitle(e.target.value)}
                placeholder="العنوان (مثال: المادة ٧٧ نظام العمل)"
                className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
              <div className="relative">
                <textarea value={addContent} onChange={e => setAddContent(e.target.value)}
                  placeholder="النص الكامل..."
                  rows={3}
                  className={`w-full resize-none rounded-xl border px-4 py-3 pe-12 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
                <div className="absolute bottom-3 start-3">
                  <VoiceInput onTranscript={t => setAddContent(p => p ? `${p}\n${t}` : t)} compact />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowAdd(false); setAddTitle(""); setAddContent(""); }}
                  className={`px-4 py-2 rounded-xl text-[12px] border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>إلغاء</button>
                <button onClick={handleAdd} disabled={!addTitle.trim() || !addContent.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 text-[12px] font-bold text-white disabled:opacity-40">
                  <Check size={12} weight="bold" /> إضافة
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {state === "ready" && items.length > 3 && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.07] bg-zinc-800/50" : "border-slate-200 bg-slate-50"}`}>
          <MagnifyingGlass size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
            className={`flex-1 bg-transparent text-[12px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-slate-400"}`} />
        </div>
      )}

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`${card} p-3 flex flex-wrap items-center gap-2`}>
            <span className={`text-[12px] font-bold ${isDark ? "text-purple-400" : "text-purple-700"}`}>{selected.size} محدد</span>
            <button onClick={() => setSelected(new Set())} className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إلغاء</button>
            <div className="flex-1" />
            <button onClick={handleMarkUsed}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <CheckCircle size={11} weight="fill" /> مستخدم
            </button>
            {selected.size >= 2 && (
              <button onClick={() => setShowMerge(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark ? "border-blue-700/30 bg-blue-900/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                <ArrowsMerge size={11} /> دمج
              </button>
            )}
            <button onClick={handleDeleteSel}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark ? "border-red-700/30 bg-red-900/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>
              <Trash size={11} /> حذف
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merge modal */}
      <AnimatePresence>
        {showMerge && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowMerge(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className={`fixed z-50 inset-x-4 top-1/3 max-w-sm mx-auto ${card} p-5 space-y-3`}>
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

      {/*
        THREE STATES, NEVER TWO.
        loading → a skeleton, which claims nothing
        unreadable → says so, in Arabic, with a button that asks again
        empty → the honest empty state
      */}
      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map(i => (
            <div key={i} className={`${card} p-3.5 animate-pulse`}>
              <div className={`h-3 w-1/3 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-200"}`} />
              <div className={`h-3 w-2/3 rounded-full mt-2 ${isDark ? "bg-zinc-800" : "bg-slate-200"}`} />
            </div>
          ))}
        </div>
      )}

      {state === "unreadable" && (
        <div className={`${card} p-10 flex flex-col items-center gap-3 text-center`}>
          <WarningCircle size={32} weight="duotone" className="text-amber-500" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة الديسك توب</p>
          <p className={`text-[11px] leading-relaxed max-w-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يصل رد من الخادم، فلا نعرف ما إذا كانت هناك عناصر محفوظة. هذه ليست
            رسالة «فارغ» — أعد المحاولة.
          </p>
          <button onClick={() => { reload(); }}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[11px] font-bold transition-colors ${
              isDark ? "border-white/10 text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}>
            <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className={`${card} p-10 flex flex-col items-center gap-2 text-center`}>
          <Monitor size={32} weight="duotone" className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الديسك توب فارغ</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>أرسل عناصر من أي أداة أو أضف يدوياً</p>
        </div>
      )}

      {/* Search found nothing — a statement about the query, not about the desktop. */}
      {state === "ready" && filtered.length === 0 && (
        <div className={`${card} p-10 flex flex-col items-center gap-2 text-center`}>
          <MagnifyingGlass size={32} weight="duotone" className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا نتائج للبحث</p>
        </div>
      )}

      {/* The server said it holds more rows than it sent. */}
      {state === "ready" && truncation && (
        <p className={`text-[11px] px-1 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>{truncation}</p>
      )}

      {/* Items */}
      {state === "ready" && filtered.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <button onClick={() => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(i => i.id)))}
              className={`text-[11px] ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
              {selected.size === filtered.length ? "إلغاء تحديد الكل" : `تحديد الكل (${filtered.length})`}
            </button>
          </div>
          {filtered.map(item => {
            const isSel = selected.has(item.id);
            const col = SOURCE_COLORS[item.source] ?? "zinc";
            return (
              <div key={item.id} className={`${card} p-3.5 flex items-start gap-3 transition-all ${isSel ? isDark ? "border-purple-500/40 bg-purple-900/10" : "border-purple-300/50 bg-purple-50/50" : item.used ? "opacity-50" : ""}`}>
                <button onClick={() => toggleSel(item.id)}
                  className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5 ${isSel ? "bg-purple-500 border-purple-500" : isDark ? "border-zinc-600" : "border-slate-300"}`}>
                  {isSel && <Check size={9} weight="bold" className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border text-${col}-500 border-${col}-500/30 bg-${col}-500/10`}>
                      {SOURCE_LABELS[item.source as InboxSource] ?? "مصدر غير محدد"}
                    </span>
                    {item.used && <span className="text-[9px] text-emerald-500 flex items-center gap-0.5"><CheckCircle size={9} weight="fill" />مستخدم</span>}
                    {/* No date rather than «Invalid Date» — see formatSentAt. */}
                    {formatSentAt(item.sentAt) && (
                      <span className={`text-[9px] ms-auto ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                        {formatSentAt(item.sentAt)}
                      </span>
                    )}
                  </div>
                  {/* An item saved through the API comes back with no title —
                      the column does not exist. Saying so beats a blank line. */}
                  <p className={`text-[12px] font-bold ${item.title ? (isDark ? "text-zinc-200" : "text-zinc-800") : (isDark ? "text-zinc-500 italic" : "text-slate-400 italic")}`}>
                    {item.title || "بلا عنوان"}
                  </p>
                  <p className={`text-[11px] line-clamp-2 mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.content}</p>
                </div>
                <button onClick={() => handleDelete(item.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
