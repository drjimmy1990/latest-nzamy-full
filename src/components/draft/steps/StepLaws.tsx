"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Check, MagnifyingGlass, Sparkle, ArrowClockwise,
  Plus, CheckCircle, PencilSimple, Tray, PaperPlaneTilt,
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { MOCK_LAWS } from "@/components/draft/draftConstants";
import {
  getDesktopItems, getActiveSessions, getSessionItems,
  markUsed,
  SOURCE_LABELS, SOURCE_COLORS,
  type InboxItem, type CollectorSession,
} from "@/lib/draftInboxStore";
import BetaReviewGate from "@/components/BetaReviewGate";

interface StepLawsProps {
  isDark: boolean;
  customLegalTexts: string;
  setCustomLegalTexts: (v: string) => void;
}

const MOCK_EXTRA_LAWS = [
  { article: "المادة ٨٥", system: "نظام العمل", text: "تحتسب مكافأة نهاية الخدمة على أساس الأجر الأخير ما لم يتفق الطرفان على خلاف ذلك..." },
  { article: "المبدأ ١٢٤٧", system: "مجلس القضاء الأعلى", text: "خلو المحضر من توقيع المتهم لا يُبطله ما لم يثبت ضرر أو تزوير..." },
];

type PanelMode = "closed" | "search" | "manual" | "inbox";
type SearchMode = "idle" | "searching" | "done";

export function StepLaws({ isDark, customLegalTexts, setCustomLegalTexts }: StepLawsProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  // unified panel state
  const [panelMode, setPanelMode] = useState<PanelMode>("closed");

  // re-search sub-state
  const [searchMode, setSearchMode] = useState<SearchMode>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [extraLaws, setExtraLaws] = useState<typeof MOCK_EXTRA_LAWS>([]);
  const [selectedExtra, setSelectedExtra] = useState<Set<number>>(new Set());

  // inbox state
  const [inboxSubTab, setInboxSubTab] = useState<"desktop" | "session">("desktop");
  const [inboxDesktop, setInboxDesktop] = useState<InboxItem[]>([]);
  const [inboxSessions, setInboxSessions] = useState<CollectorSession[]>([]);
  const [activeInboxSession, setActiveInboxSession] = useState<string | null>(null);
  const [inboxSessionItems, setInboxSessionItems] = useState<InboxItem[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<Set<string>>(new Set());
  const [addedInbox, setAddedInbox] = useState<Set<string>>(new Set());

  useEffect(() => {
    setInboxDesktop(getDesktopItems());
    setInboxSessions(getActiveSessions());
    if (activeInboxSession) setInboxSessionItems(getSessionItems(activeInboxSession));
  }, [panelMode, activeInboxSession]);

  const currentInboxItems = inboxSubTab === "desktop" ? inboxDesktop : inboxSessionItems;
  const inboxCount = inboxDesktop.filter(i => !addedInbox.has(i.id)).length +
    inboxSessions.reduce((acc, s) => acc + getSessionItems(s.id).filter(i => !addedInbox.has(i.id)).length, 0);

  /* helpers */
  function openPanel(mode: "search" | "manual" | "inbox") {
    setPanelMode(prev => prev === mode ? "closed" : mode);
  }

  async function handleReSearch() {
    if (!searchQuery.trim()) return;
    setSearchMode("searching");
    await new Promise(r => setTimeout(r, 1800));
    setExtraLaws(MOCK_EXTRA_LAWS);
    setSearchMode("done");
  }

  function toggleExtra(i: number) {
    setSelectedExtra(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  function resetSearch() {
    setSearchMode("idle");
    setSearchQuery("");
    setExtraLaws([]);
    setSelectedExtra(new Set());
  }

  /* derived badges */
  const hasExtra = searchMode === "done" && extraLaws.length > 0;
  const hasManual = customLegalTexts.trim().length > 0;

  function toggleInbox(id: string) {
    setSelectedInbox(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function addSelectedFromInbox() {
    const toAdd = currentInboxItems.filter(i => selectedInbox.has(i.id));
    if (!toAdd.length) return;
    const appended = toAdd.map(i => `• ${i.title}\n${i.content}`).join("\n\n");
    setCustomLegalTexts(customLegalTexts ? `${customLegalTexts}\n\n${appended}` : appended);
    markUsed(Array.from(selectedInbox));
    setAddedInbox(prev => new Set([...prev, ...selectedInbox]));
    setSelectedInbox(new Set());
    setInboxDesktop(getDesktopItems());
    setInboxSessions(getActiveSessions());
    if (activeInboxSession) setInboxSessionItems(getSessionItems(activeInboxSession));
  }

  return (
    <BetaReviewGate toolId="draft.laws" toolName="اقتراح النصوص النظامية والمبادئ" reviewScope="legal-data">
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
        النصوص النظامية والمبادئ المقترحة
      </p>

      {/* ── AI-suggested laws ── */}
      {MOCK_LAWS.map((law, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }} className={`${card} p-4 shadow-sm`}>
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
              <BookOpen size={16} className="text-[#C8A762]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{law.article}</span>
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>{law.system}</span>
              </div>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{law.text}</p>
            </div>
            <button className={`flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${isDark ? "bg-emerald-500/15 text-emerald-500" : "bg-emerald-50 text-emerald-600"}`}>
              <Check size={12} weight="bold" />
            </button>
          </div>
        </motion.div>
      ))}

      {/* ══════════════════════════════════════════════════════
          UNIFIED PANEL — header with two toggle tabs inside
      ══════════════════════════════════════════════════════ */}
      <div className={`${card} overflow-hidden border-2 mt-2 ${
        panelMode === "closed"
          ? isDark ? "border-white/[0.06]" : "border-zinc-200/70"
          : panelMode === "search"
            ? isDark ? "border-blue-500/20" : "border-blue-200/80"
            : panelMode === "inbox"
              ? isDark ? "border-purple-500/20" : "border-purple-200/80"
              : isDark ? "border-[#C8A762]/25" : "border-amber-200"
      }`}>

        {/* ── Panel Header: three tab buttons ── */}
        <div className={`flex items-stretch border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>

          {/* Tab 1 — Inbox from tools */}
          <button
            onClick={() => { openPanel("inbox"); setInboxDesktop(getDesktopItems()); setInboxSessions(getActiveSessions()); }}
            className={`flex-1 relative flex items-center gap-2 px-3 py-3.5 text-right transition-colors border-l ${isDark ? "border-white/[0.06]" : "border-zinc-100"} ${
              panelMode === "inbox"
                ? isDark ? "bg-purple-900/10" : "bg-purple-50/60"
                : isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/60"
            }`}
          >
            <div className={`relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              panelMode === "inbox" ? "bg-purple-600 text-white" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
            }`}>
              <Tray size={13} />
              {inboxCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-purple-500 text-white text-[8px] font-black flex items-center justify-center">
                  {inboxCount}
                </span>
              )}
            </div>
            <div className="flex-1 text-right">
              <p className={`text-[11px] font-bold leading-tight ${
                panelMode === "inbox" ? "text-purple-400" : isDark ? "text-zinc-300" : "text-zinc-700"
              }`}>المجمع القانوني</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {inboxCount > 0 ? `${inboxCount} عنصر وارد` : "لا يوجد وارد"}
              </p>
            </div>
          </button>

          {/* Tab 2 — Re-search */}
          <button
            onClick={() => { openPanel("search"); if (panelMode === "search") resetSearch(); }}
            className={`flex-1 flex items-center gap-2 px-3 py-3.5 text-right transition-colors border-l ${isDark ? "border-white/[0.06]" : "border-zinc-100"} ${
              panelMode === "search"
                ? isDark ? "bg-blue-900/10" : "bg-blue-50/60"
                : isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/60"
            }`}
          >
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              panelMode === "search" ? "bg-blue-600 text-white" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
            }`}>
              <MagnifyingGlass size={13} />
            </div>
            <div className="flex-1 text-right">
              <p className={`text-[11px] font-bold leading-tight ${
                panelMode === "search" ? "text-blue-500" : isDark ? "text-zinc-300" : "text-zinc-700"
              }`}>بحث مستهدف</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {hasExtra ? `${extraLaws.length} نتيجة` : "ابحث عن مواد إضافية"}
              </p>
            </div>
          </button>

          {/* Tab 3 — Manual */}
          <button
            onClick={() => openPanel("manual")}
            className={`flex-1 flex items-center gap-2 px-3 py-3.5 text-right transition-colors ${
              panelMode === "manual"
                ? isDark ? "bg-[#C8A762]/5" : "bg-amber-50/60"
                : isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/60"
            }`}
          >
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              panelMode === "manual" ? "bg-[#C8A762] text-white" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
            }`}>
              <PencilSimple size={13} />
            </div>
            <div className="flex-1 text-right">
              <p className={`text-[11px] font-bold leading-tight ${
                panelMode === "manual" ? "text-[#C8A762]" : isDark ? "text-zinc-300" : "text-zinc-700"
              }`}>إضافة يدوية</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {hasManual ? "تم الإضافة ✓" : "أضف مواد أو مبادئ"}
              </p>
            </div>
            {hasManual && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500" />}
          </button>
        </div>

        {/* ── Panel Body (animated) ── */}
        <AnimatePresence>
          {panelMode !== "closed" && (
            <motion.div
              key={panelMode}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-3 space-y-3">

                {/* ── TAB: INBOX ── */}
                {panelMode === "inbox" && (
                  <div className="space-y-2">

                    {/* Sub-tabs: Desktop / Sessions */}
                    <div className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
                      <button onClick={() => { setInboxSubTab("desktop"); setSelectedInbox(new Set()); }}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${inboxSubTab === "desktop" ? isDark ? "bg-white/[0.08] text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        الديسك توب
                        {inboxDesktop.filter(i => !addedInbox.has(i.id)).length > 0 && (
                          <span className="ms-1 text-[9px] font-black text-purple-500">{inboxDesktop.filter(i => !addedInbox.has(i.id)).length}</span>
                        )}
                      </button>
                      <button onClick={() => { setInboxSubTab("session"); setSelectedInbox(new Set()); }}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${inboxSubTab === "session" ? isDark ? "bg-white/[0.08] text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        الجلسات ({inboxSessions.length})
                      </button>
                    </div>

                    {/* Session picker */}
                    {inboxSubTab === "session" && inboxSessions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {inboxSessions.map(s => (
                          <button key={s.id}
                            onClick={() => { setActiveInboxSession(s.id); setSelectedInbox(new Set()); }}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                              activeInboxSession === s.id
                                ? "bg-purple-600 border-purple-600 text-white"
                                : isDark ? "border-white/[0.07] text-zinc-500 hover:border-purple-500/30" : "border-slate-200 text-slate-500 hover:border-purple-200"
                            }`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {currentInboxItems.length === 0 ? (
                      <div className={`flex flex-col items-center gap-2 py-6 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        <Tray size={28} weight="duotone" className="opacity-30" />
                        <p className="text-[11px] font-semibold">
                          {inboxSubTab === "session" && !activeInboxSession
                            ? "اختر جلسة لعرض عناصرها"
                            : "لا توجد عناصر هنا"}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className={`text-[11px] font-bold ${isDark ? "text-purple-400" : "text-purple-700"}`}>
                            {currentInboxItems.length} عنصر
                          </p>
                          <button onClick={() => setSelectedInbox(new Set(currentInboxItems.map(i => i.id)))}
                            className={`text-[10px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                            تحديد الكل
                          </button>
                        </div>

                        {currentInboxItems.map((item) => {
                          const isSelected = selectedInbox.has(item.id);
                          const isAdded   = addedInbox.has(item.id);
                          const color     = SOURCE_COLORS[item.source];
                          return (
                            <motion.button key={item.id}
                              onClick={() => !isAdded && toggleInbox(item.id)}
                              disabled={isAdded}
                              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              className={`w-full text-right rounded-xl border p-3 transition-all ${
                                isAdded
                                  ? isDark ? "border-emerald-700/20 bg-emerald-900/10 opacity-50" : "border-emerald-200 bg-emerald-50 opacity-50"
                                  : isSelected
                                    ? isDark ? "border-purple-500/40 bg-purple-900/15" : "border-purple-400/50 bg-purple-50"
                                    : isDark ? "border-white/[0.07] hover:border-white/[0.14]" : "border-slate-200 hover:border-slate-300"
                              }`}>
                              <div className="flex items-start gap-2.5">
                                <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 transition-all ${
                                  isAdded ? "bg-emerald-500 border-emerald-500"
                                  : isSelected ? "bg-purple-500 border-purple-500"
                                  : isDark ? "border-zinc-600" : "border-slate-300"
                                }`}>
                                  {(isSelected || isAdded) && <Check size={9} weight="bold" className="text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border text-${color}-500 border-${color}-500/30 bg-${color}-500/10`}>
                                      {SOURCE_LABELS[item.source]}
                                    </span>
                                    {isAdded && <span className="text-[9px] font-bold text-emerald-500">✓ أُضيف</span>}
                                  </div>
                                  <p className={`text-[11px] font-bold leading-tight truncate ${
                                    isDark ? "text-zinc-300" : "text-zinc-700"
                                  }`}>{item.title}</p>
                                  <p className={`text-[10px] leading-snug mt-0.5 line-clamp-2 ${
                                    isDark ? "text-zinc-600" : "text-slate-400"
                                  }`}>{item.content.slice(0, 120)}{item.content.length > 120 ? "..." : ""}</p>
                                  <p className={`text-[9px] mt-1 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                                    {new Date(item.sentAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                                  </p>
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}

                        {selectedInbox.size > 0 && (
                          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            onClick={addSelectedFromInbox}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-[12px] font-bold text-white hover:bg-purple-700 transition">
                            <PaperPlaneTilt size={13} weight="duotone" />
                            أضف {selectedInbox.size} عنصر للمذكرة
                          </motion.button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── TAB: SEARCH ── */}
                {panelMode === "search" && (
                  <>
                    {(searchMode === "idle" || searchMode === "searching") && (
                      <div className="space-y-2">
                        <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                          ما الذي غفل عنه AI؟ اذكر المادة أو الموضوع أو نوع المصدر:
                        </p>
                        <div className="relative">
                          <textarea
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            rows={3}
                            placeholder={`مثال:\n• ابحث عن مواد الإجازة المرضية في نظام العمل\n• المبادئ القضائية بشأن التعويض عن الفصل التعسفي\n• آراء فقهية في مسألة الوكالة`}
                            className={`w-full resize-none rounded-xl border p-3 pe-12 text-[12px] outline-none leading-relaxed ${
                              isDark
                                ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600"
                                : "border-blue-200 bg-blue-50/40 text-zinc-800 placeholder:text-slate-400"
                            }`}
                          />
                          <div className="absolute bottom-2.5 start-2.5">
                            <VoiceInput onTranscript={t => setSearchQuery(prev => prev ? `${prev}\n${t}` : t)} compact />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={handleReSearch}
                            disabled={!searchQuery.trim() || searchMode === "searching"}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                          >
                            {searchMode === "searching" ? (
                              <>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white" />
                                جارٍ البحث...
                              </>
                            ) : (
                              <><MagnifyingGlass size={13} /> ابحث الآن</>
                            )}
                          </motion.button>
                        </div>

                        {searchMode === "searching" && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-blue-500/20 bg-blue-900/10" : "border-blue-200 bg-blue-50"}`}>
                            <Sparkle size={12} className="text-blue-500" />
                            <p className={`text-[11px] ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                              AI يبحث في قاعدة نظامي ومصادر قانونية موثوقة...
                            </p>
                          </motion.div>
                        )}
                      </div>
                    )}

                    {searchMode === "done" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                            <p className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                              وجد AI {extraLaws.length} نصوص إضافية — اختر ما تريد إضافته
                            </p>
                          </div>
                          <button onClick={resetSearch}
                            className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-500 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                            <ArrowClockwise size={11} /> بحث جديد
                          </button>
                        </div>

                        {extraLaws.map((law, i) => (
                          <motion.button key={i} onClick={() => toggleExtra(i)}
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                            className={`w-full text-right rounded-xl border p-3.5 transition-all ${
                              selectedExtra.has(i)
                                ? isDark ? "border-emerald-500/40 bg-emerald-900/15" : "border-emerald-400/50 bg-emerald-50"
                                : isDark ? "border-white/[0.07] hover:border-white/[0.14]" : "border-slate-200 hover:border-slate-300"
                            }`}>
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 transition-all ${
                                selectedExtra.has(i) ? "bg-emerald-500 border-emerald-500" : isDark ? "border-zinc-600" : "border-slate-300"
                              }`}>
                                {selectedExtra.has(i) && <Check size={10} weight="bold" className="text-white" />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{law.article}</span>
                                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500"}`}>{law.system}</span>
                                  <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 font-bold">جديد</span>
                                </div>
                                <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{law.text}</p>
                              </div>
                            </div>
                          </motion.button>
                        ))}

                        {selectedExtra.size > 0 && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                            <Check size={12} weight="bold" className="text-emerald-500" />
                            <p className={`text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                              تم تحديد {selectedExtra.size} نصوص — ستُضاف تلقائياً للمذكرة عند الصياغة
                            </p>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: MANUAL ── */}
                {panelMode === "manual" && (
                  <div className="space-y-2">
                    <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      أضف نصوصك النظامية / المبادئ القضائية / الآراء الفقهية مباشرة:
                    </p>
                    <div className="relative">
                      <textarea value={customLegalTexts} onChange={e => setCustomLegalTexts(e.target.value)}
                        placeholder={`مثال:\n• المادة (٧٩) من نظام العمل — لا يجوز فصل العامل أثناء الإجازة المرضية...\n• المبدأ رقم (٢٢٧٩) — مجرد الاعتراف الذي لا يصحبه من الأدلة ما يرجح صدقه يهتز...`}
                        rows={5}
                        className={`w-full resize-none rounded-xl border p-4 pe-14 text-[12px] font-mono outline-none leading-relaxed ${
                          isDark
                            ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600"
                            : "border-amber-200/60 bg-amber-50/30 text-zinc-800 placeholder:text-zinc-400"
                        }`} />
                      <div className="absolute bottom-3 start-3">
                        <VoiceInput onTranscript={(t) => setCustomLegalTexts(customLegalTexts ? `${customLegalTexts}\n${t}` : t)} compact />
                      </div>
                    </div>
                    {customLegalTexts && (
                      <p className={`text-[10px] ${isDark ? "text-emerald-500" : "text-emerald-600"}`}>
                        ✓ سيُدمج AI هذه النصوص في المذكرة بشكل احترافي
                      </p>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </BetaReviewGate>
  );
}
