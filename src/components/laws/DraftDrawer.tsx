import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stack, Trash, X, ArrowCounterClockwise, Copy, Check, BookOpen, CaretDown, CaretUp, FileText, Scales, Gavel, Tray,
  FileDoc, ShareNetwork, WhatsappLogo, XLogo, LinkedinLogo, LinkSimple, PencilSimpleLine,
} from "@phosphor-icons/react";
import { addToDesktop } from "@/lib/services/researchService";
import { useUser } from "@/hooks/useUser";
import { AI_TOOLS } from "@/lib/ai/tools";
import { toolRoleRefusal } from "@/lib/ai/aiToolsConfig";
import { sessionStorageOrNull } from "@/lib/ai/transcriptHandoff";
import { DRAFTER_LIBRARY_URL, writeLibraryHandoff } from "@/lib/ai/libraryDrafterHandoff";
import {
  DRAFT_LIMITS_DEFAULT,
  capForCopy,
  draftEntryPath,
  draftShareLinks,
  draftShareMessage,
  itemsPhraseAr,
  parseDraftLimits,
  type DraftLimits,
} from "@/lib/library/draftExport";

export interface CartEntry {
  articleId: string;
  articleNum: string;
  articleTitle: string;
  articleText: string;
  lawName: string;
  lawSlug: string;           // e.g. "companies-law" — for grouping & linking
  isArticleAdded: boolean;   // main law article text added to draft
  isExecRegAdded: boolean;   // executive regulation added independently
  execReg?: { ref: string; text: string };
  principles: Array<{ id: string; text: string; source: string; ref: string }>;
  precedents: Array<{ id: string; summary: string; court: string; caseNum: string; year: string; relevance?: string }>;
}

/*
 * L2 (owner file 03 ل2, batch l12): the drawer's actions in ordered groups —
 *   نسخ          copy all / copy selected (as before), stopping at the admin cap
 *                («نسخ المسودة كاملة» answer ج, platform_settings.library_draft_limits);
 *   تنزيل Word   POST /api/library/draft-export: the server re-reads the texts
 *                for the viewer, counts the whole draft once in the read limit,
 *                and returns the file (header «استرشادي», source per item, date);
 *   مشاركة       WhatsApp / X / LinkedIn / copy link — the title, a short excerpt
 *                and the page link only, never the full text;
 *   إرسال        to المجمّع البحثي (as before) and to الصائغ القانوني (the same
 *                one-shot handoff as «أرسل إلى الصائغ», lawyer and firm only).
 */

/** The admin's caps, read once per page load (each read is one more /api/library request). */
let limitsOnce: Promise<DraftLimits> | null = null;
function loadDraftLimits(): Promise<DraftLimits> {
  limitsOnce ??= fetch("/api/library/draft-export", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => parseDraftLimits(body && typeof body === "object" ? (body as { limits?: unknown }).limits : null))
    .catch(() => {
      limitsOnce = null; // try again on the next open
      return DRAFT_LIMITS_DEFAULT;
    });
  return limitsOnce;
}

type WordState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; locked: number }
  | { kind: "failed"; message: string };

export function DraftDrawer({ cart, onRemoveArticle, onClearAll, onClose, isDark, isRTL = true }: {
  cart: CartEntry[];
  onRemoveArticle: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  isDark: boolean;
  isRTL?: boolean;
}) {
  const router = useRouter();
  const user = useUser();
  const [copied, setCopied]         = useState(false);
  const [copyNote, setCopyNote]     = useState<string | null>(null);
  const [history, setHistory]       = useState<CartEntry[][]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [collapsedLaws, setCollapsedLaws] = useState<Set<string>>(new Set());
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [limits, setLimits] = useState<DraftLimits>(DRAFT_LIMITS_DEFAULT);
  const [word, setWord] = useState<WordState>({ kind: "idle" });
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [drafterError, setDrafterError] = useState<string | null>(null);

  // The admin's caps (GET answers the defaults when the setting is missing).
  useEffect(() => {
    let cancelled = false;
    void loadDraftLimits().then((l) => {
      if (!cancelled) setLimits(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Group by lawName ──────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, CartEntry[]>();
    cart.forEach(e => {
      if (!map.has(e.lawName)) map.set(e.lawName, []);
      map.get(e.lawName)!.push(e);
    });
    return map;
  }, [cart]);

  const lawCount = grouped.size;
  const totalArticles = cart.reduce((acc, e) => acc + (e.isArticleAdded ? 1 : 0) + (e.isExecRegAdded ? 1 : 0), 0);
  /** What every action works on: the selection, or the whole draft. */
  const scope = selectedIds.length ? cart.filter(c => selectedIds.includes(c.articleId)) : cart;

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const toggleItem = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const getLawSelectionState = (lawName: string): "none" | "partial" | "all" => {
    const ids = (grouped.get(lawName) ?? []).map(e => e.articleId);
    const sel = ids.filter(id => selectedIds.includes(id));
    if (sel.length === 0) return "none";
    if (sel.length === ids.length) return "all";
    return "partial";
  };

  const toggleSelectLaw = (lawName: string) => {
    const ids = (grouped.get(lawName) ?? []).map(e => e.articleId);
    const state = getLawSelectionState(lawName);
    if (state === "all") setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === cart.length) setSelectedIds([]);
    else setSelectedIds(cart.map(c => c.articleId));
  };

  const toggleLawCollapse = (name: string) =>
    setCollapsedLaws(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  // ── Copy helpers ──────────────────────────────────────────────────────────────
  const buildEntryText = (e: CartEntry, rtl: boolean) => {
    let out = "";
    if (e.isArticleAdded) out += `**${e.articleNum} من ${e.lawName}**\n\n${e.articleText}`;
    if (e.isExecRegAdded && e.execReg) out += `${out ? "\n\n" : ""}**${e.execReg.ref}**\n${e.execReg.text}`;
    if (!e.isArticleAdded && !e.isExecRegAdded) out += `(${rtl ? "مبادئ/سوابق تابعة لـ" : "Linked to"} ${e.articleNum})`;
    if (e.principles.length) out += `\n\n[${rtl ? "المبادئ القضائية" : "Judicial Principles"}]\n` + e.principles.map(p => `- ${p.text} (${p.source})`).join("\n");
    if (e.precedents.length) out += `\n\n[${rtl ? "السوابق القضائية" : "Judicial Precedents"}]\n` + e.precedents.map(pr => `- ${pr.court} — ${pr.caseNum}\n  ${pr.summary}`).join("\n");
    return out;
  };

  /** Copies the entries up to the admin cap, and says so when it stopped short (answer ج). */
  const copyEntries = (entries: CartEntry[]) => {
    const { kept, left } = capForCopy(entries, limits);
    const text = kept.map(e => buildEntryText(e, isRTL)).join("\n\n" + "─".repeat(40) + "\n\n");
    navigator.clipboard.writeText(text);
    setCopyNote(left > 0
      ? (isRTL ? `نُسخ أول ${itemsPhraseAr(limits.maxItems)}، وهو حد النسخ؛ حدّد الباقي وانسخه على دفعة ثانية.` : `Copied the first ${limits.maxItems} items (the copy limit).`)
      : null);
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };

  const handleCopyAll = () => copyEntries(cart);
  const handleCopySelected = () => copyEntries(cart.filter(c => selectedIds.includes(c.articleId)));

  const handleCopyLaw = (lawName: string) => {
    const { kept } = capForCopy(grouped.get(lawName) ?? [], limits);
    const text = kept.map(e => buildEntryText(e, isRTL)).join("\n\n" + "─".repeat(30) + "\n\n");
    navigator.clipboard.writeText(text);
  };

  // ── Word (server-built, server-counted) ──────────────────────────────────────
  const handleWord = async () => {
    if (!scope.length || word.kind === "busy") return;
    if (scope.length > limits.maxItems) {
      setWord({ kind: "failed", message: isRTL ? `يتسع ملف Word لـ${itemsPhraseAr(limits.maxItems)} على الأكثر؛ حدّد بعض العناصر ثم نزّلها.` : `A Word file holds at most ${limits.maxItems} items.` });
      return;
    }
    setWord({ kind: "busy" });
    try {
      const res = await fetch("/api/library/draft-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: scope.map(e => ({
            articleId: e.articleId,
            lawSlug: e.lawSlug,
            lawName: e.lawName,
            label: e.articleNum,
            title: e.articleTitle,
            withArticle: e.isArticleAdded,
            withExecReg: e.isExecRegAdded,
            text: buildEntryText(e, true),
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof body?.error === "string" && body.error ? body.error : (isRTL ? "تعذّر تجهيز الملف — حاول مرة أخرى." : "Could not build the file.");
        setWord({ kind: "failed", message });
        return;
      }
      const locked = Number(res.headers.get("X-Draft-Locked") ?? "0") || 0;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `مسودة-نظامي-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setWord({ kind: "done", locked });
    } catch {
      setWord({ kind: "failed", message: isRTL ? "تعذّر تجهيز الملف — تحقّق من الاتصال وحاول مرة أخرى." : "Could not build the file." });
    }
  };

  // ── Share: title + short excerpt + link (answer ج) ───────────────────────────
  const shareEntry = scope[0] ?? null;
  const shareUrl = shareEntry && typeof window !== "undefined" ? `${window.location.origin}${draftEntryPath(shareEntry.lawSlug)}` : "";
  const shareMessage = shareEntry
    ? draftShareMessage({ title: `${shareEntry.articleNum} — ${shareEntry.lawName}`, text: shareEntry.isArticleAdded ? shareEntry.articleText : "", url: shareUrl }, limits)
    : "";
  const shareLinks = shareEntry ? draftShareLinks(shareMessage, shareUrl) : null;
  const copyShareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  };

  // ── Send to the collector (owner answer ١٩٤) ───────────────────────────────
  // The cart's destination is «المجمّع البحثي والقضائي» (/ai/collector): the
  // chosen articles, principles and precedents land on its desktop, one item
  // per law, ready for reports and research. A guest (or a role the research
  // API refuses) gets a failure that says to sign in — never a silent success.
  const handleSendToCollector = async () => {
    const entries = scope;
    if (!entries.length || sendState === "sending") return;
    const byLaw = new Map<string, CartEntry[]>();
    entries.forEach(e => { if (!byLaw.has(e.lawName)) byLaw.set(e.lawName, []); byLaw.get(e.lawName)!.push(e); });
    setSendState("sending");
    try {
      for (const [lawName, items] of byLaw) {
        const title = isRTL ? `${lawName} — ${items.length} ${items.length === 1 ? "مادة" : "مواد"}` : `${lawName} — ${items.length}`;
        await addToDesktop("legal-library", "text", title, items.map(e => buildEntryText(e, isRTL)).join("\n\n" + "─".repeat(30) + "\n\n"));
      }
      setSendState("sent");
    } catch (error) {
      console.error("[DraftDrawer] send to collector failed:", error);
      setSendState("failed");
    }
  };

  // ── Send to the drafter (L2 هـ / L6): lawyer and firm, as «أرسل إلى الصائغ» ──
  const drafterOpen =
    !user.loading && user.isLoggedIn &&
    toolRoleRefusal(AI_TOOLS["legal-drafter"], { userType: user.userType ?? "", practiceKind: null }) === null;
  const handleSendToDrafter = () => {
    const text = scope.map(e => buildEntryText(e, true)).join("\n\n");
    const label = scope.length === 1 ? `${scope[0].lawName} — ${scope[0].articleNum}` : `مسودة المكتبة — ${scope.length} عناصر`;
    const result = writeLibraryHandoff(sessionStorageOrNull(), text, label);
    if (!result.ok) {
      setDrafterError(isRTL ? "تعذّر حفظ النص في هذا المتصفح — انسخ المسودة والصقها في «ملاحظات ومرئيات» لدى الصائغ القانوني." : "Could not hand the text over — copy it instead.");
      return;
    }
    router.push(DRAFTER_LIBRARY_URL);
  };

  // ── Actions ───────────────────────────────────────────────────────────────────
  const doRemove = (id: string) => { setHistory(h => [...h, cart]); onRemoveArticle(id); };
  const doClear  = () => { setHistory(h => [...h, cart]); onClearAll(); };
  const doDeleteSelected = () => {
    if (!selectedIds.length) return;
    setHistory(h => [...h, cart]);
    selectedIds.forEach(id => onRemoveArticle(id));
    setSelectedIds([]);
  };

  const groupTitle = `text-[10px] font-bold tracking-wide ${isDark ? "text-zinc-500" : "text-slate-400"}`;
  const outlineBtn = `flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-bold transition disabled:opacity-60 ${isDark ? "border-white/10 text-zinc-200 hover:bg-white/[0.05]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`;
  const shareBtn = `flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-[11px] font-semibold transition ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  const scopeSuffix = selectedIds.length ? ` (${selectedIds.length})` : "";

  return (
    <motion.div
      initial={{ x: isRTL ? "-100%" : "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: isRTL ? "-100%" : "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className={`fixed top-0 ${isRTL ? "left-0 border-r" : "right-0 border-l"} h-full w-full sm:w-[460px] z-[10001] flex flex-col shadow-2xl ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200"} print:hidden`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* ── Header ── */}
      <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${isDark ? "border-white/[0.07]" : "border-slate-200"}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
          <Stack size={16} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className="flex-1 cursor-pointer" onClick={toggleSelectAll}>
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            {isRTL ? "مسودة التجميع" : "Collection Draft"}
          </p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {selectedIds.length > 0
              ? (isRTL ? `${selectedIds.length} محدد` : `${selectedIds.length} selected`)
              : isRTL
                ? `${totalArticles} عنصر · ${lawCount > 1 ? `${lawCount} أنظمة` : "نظام واحد"}`
                : `${totalArticles} items · ${lawCount} law${lawCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-1">
          {history.length > 0 && (
            <button onClick={() => setHistory(h => h.slice(0, -1))} aria-label={isRTL ? "تراجع" : "Undo"} className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
              <ArrowCounterClockwise size={14} />
            </button>
          )}
          <button onClick={handleCopyAll} aria-label={isRTL ? "نسخ المسودة كاملة" : "Copy the whole draft"} className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
          <button onClick={doClear} aria-label={isRTL ? "تفريغ المسودة" : "Clear the draft"} className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-red-900/20 text-red-400" : "hover:bg-red-50 text-red-500"}`}>
            <Trash size={14} />
          </button>
          <button onClick={onClose} aria-label={isRTL ? "إغلاق" : "Close"} className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Content: grouped accordion ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <BookOpen size={32} className={isDark ? "text-zinc-700" : "text-slate-300"} />
            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-400"}`}>
              {isRTL ? "لم تُضف أي مواد بعد — تنتقل بين الأنظمة وتجمع ما تحتاجه" : "No articles yet — browse laws and collect what you need"}
            </p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([lawName, items]) => {
            const isCollapsed = collapsedLaws.has(lawName);
            const selState    = getLawSelectionState(lawName);
            return (
              <div key={lawName} className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.08] bg-zinc-800/30" : "border-slate-200 bg-slate-50"}`}>

                {/* ─ Law group header ─ */}
                <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${isDark ? "border-white/[0.06] bg-zinc-800/60" : "border-slate-200 bg-white"}`}>
                  {/* select-all for this law */}
                  <button
                    onClick={() => toggleSelectLaw(lawName)}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition ${
                      selState === "all"
                        ? "bg-[#0B3D2E] border-[#0B3D2E]"
                        : selState === "partial"
                        ? isDark ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60" : "bg-[#0B3D2E]/20 border-[#0B3D2E]/40"
                        : isDark ? "border-zinc-600" : "border-slate-300"
                    }`}
                  >
                    {selState === "all" && <Check size={10} className="text-white" />}
                    {selState === "partial" && <div className="w-2 h-0.5 rounded bg-[#0B3D2E]" />}
                  </button>

                  {/* Law name + toggle */}
                  <button className="flex-1 flex items-center gap-1.5 min-w-0" onClick={() => toggleLawCollapse(lawName)}>
                    <p className={`text-[11px] font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{lawName}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
                      {items.length}
                    </span>
                  </button>

                  {/* copy law + collapse toggle */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleCopyLaw(lawName)} title={isRTL ? "نسخ هذا النظام" : "Copy this law"} className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-200 text-slate-400"}`}>
                      <Copy size={11} />
                    </button>
                    <button onClick={() => toggleLawCollapse(lawName)} className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-200 text-slate-400"}`}>
                      {isCollapsed ? <CaretDown size={11} /> : <CaretUp size={11} />}
                    </button>
                  </div>
                </div>

                {/* ─ Law group items ─ */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      key={`group-${lawName}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-2 space-y-1.5">
                        {items.map(e => (
                          <DraftItem
                            key={e.articleId}
                            e={e}
                            isSelected={selectedIds.includes(e.articleId)}
                            onToggle={() => toggleItem(e.articleId)}
                            onRemove={() => doRemove(e.articleId)}
                            isDark={isDark}
                            isRTL={isRTL}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer: the actions in ordered groups (L2) ── */}
      {cart.length > 0 && (
        <div className={`p-3 border-t flex flex-col gap-2.5 max-h-[55vh] overflow-y-auto ${isDark ? "border-white/[0.07]" : "border-slate-200"}`}>
          {/* ١ نسخ وتنزيل */}
          <p className={groupTitle}>{isRTL ? "نسخ وتنزيل" : "Copy & download"}</p>
          {selectedIds.length > 0 ? (
            <div className="flex gap-2">
              <button onClick={doDeleteSelected} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition">
                <Trash size={13} /> {isRTL ? `حذف المحدد (${selectedIds.length})` : `Delete (${selectedIds.length})`}
              </button>
              <button onClick={handleCopySelected} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-bold hover:opacity-90 transition">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {isRTL ? "نسخ المحدد" : "Copy selected"}
              </button>
            </div>
          ) : (
            <button onClick={handleCopyAll} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold hover:opacity-90 transition">
              {copied ? <><Check size={13} /> {isRTL ? "تم النسخ" : "Copied"}</> : <><Copy size={13} /> {isRTL ? "نسخ كل المسودة" : "Copy entire draft"}</>}
            </button>
          )}
          {copyNote && <p role="status" className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-800"}`}>{copyNote}</p>}
          <button onClick={handleWord} disabled={word.kind === "busy"} className={outlineBtn}>
            <FileDoc size={14} />
            {word.kind === "busy"
              ? (isRTL ? "جارٍ تجهيز الملف…" : "Preparing…")
              : (isRTL ? `تنزيل ملف Word${scopeSuffix}` : `Download Word${scopeSuffix}`)}
          </button>
          {word.kind === "done" && (
            <p role="status" className={`text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              {isRTL
                ? (word.locked > 0
                    ? `نُزّل الملف. ${word.locked === 1 ? "عنصر واحد نُزّل بعنوانه فقط" : `${word.locked} عناصر نُزّلت بعناوينها فقط`} لأن نصه متاح لمشتركي باقة المكتبة.`
                    : "نُزّل الملف، ويُحتسب تنزيله قراءةً واحدة من حد القراءة اليومي.")
                : "Downloaded."}
            </p>
          )}
          {word.kind === "failed" && <p role="alert" className="text-[11px] text-red-600">{word.message}</p>}

          {/* ٢ مشاركة */}
          <p className={groupTitle}>{isRTL ? "مشاركة" : "Share"}</p>
          <button onClick={() => setShareOpen(o => !o)} className={outlineBtn} aria-expanded={shareOpen}>
            <ShareNetwork size={14} />
            {isRTL ? (selectedIds.length > 1 ? "مشاركة أول عنصر محدد" : "مشاركة") : "Share"}
          </button>
          {shareOpen && shareLinks && (
            <div className="flex flex-col gap-1.5">
              <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                {isRTL ? "تُشارَك العنوان ومقتطف قصير ورابط الصفحة فقط، لا النص الكامل." : "Only the title, a short excerpt and the page link are shared."}
              </p>
              <div className="flex gap-1.5">
                <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className={shareBtn}><WhatsappLogo size={13} /> {isRTL ? "واتساب" : "WhatsApp"}</a>
                <a href={shareLinks.x} target="_blank" rel="noopener noreferrer" className={shareBtn}><XLogo size={13} /> X</a>
                <a href={shareLinks.linkedin} target="_blank" rel="noopener noreferrer" className={shareBtn}><LinkedinLogo size={13} /> {isRTL ? "لينكدإن" : "LinkedIn"}</a>
                <button onClick={copyShareLink} className={shareBtn}>
                  {linkCopied ? <Check size={13} /> : <LinkSimple size={13} />} {isRTL ? (linkCopied ? "نُسخ" : "نسخ الرابط") : "Copy link"}
                </button>
              </div>
            </div>
          )}

          {/* ٣ إرسال */}
          <p className={groupTitle}>{isRTL ? "إرسال" : "Send"}</p>
          <button
            onClick={handleSendToCollector}
            disabled={sendState === "sending"}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-bold transition disabled:opacity-60 ${isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-800 hover:bg-amber-50"}`}
          >
            <Tray size={13} />
            {sendState === "sending"
              ? (isRTL ? "جارٍ الإرسال…" : "Sending…")
              : selectedIds.length
                ? (isRTL ? `إرسال المحدد إلى المجمّع البحثي (${selectedIds.length})` : `Send selected to the collector (${selectedIds.length})`)
                : (isRTL ? "إرسال المسودة إلى المجمّع البحثي" : "Send the draft to the collector")}
          </button>
          {sendState === "sent" && (
            <p role="status" className={`text-[11px] text-center ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              {isRTL ? "وصلت إلى سطح المكتب في المجمّع البحثي — " : "Added to the collector desktop — "}
              <Link href="/ai/collector" className="font-bold underline">{isRTL ? "فتح المجمّع" : "Open the collector"}</Link>
            </p>
          )}
          {sendState === "failed" && (
            <p role="alert" className="text-[11px] text-center text-red-600">
              {isRTL ? "تعذّر الإرسال — سجّل الدخول بحساب يملك المجمّع البحثي ثم أعد المحاولة." : "Could not send — sign in with an account that has the collector, then try again."}
            </p>
          )}
          {drafterOpen && (
            <button
              onClick={handleSendToDrafter}
              title={isRTL ? "يفتح الصائغ القانوني والنص في خانة «ملاحظات ومرئيات» — لا يُرسل شيئاً ولا يخصم نقاطاً" : undefined}
              className={outlineBtn}
            >
              <PencilSimpleLine size={13} />
              {isRTL ? `إرسال إلى الصائغ القانوني${scopeSuffix}` : `Send to the drafter${scopeSuffix}`}
            </button>
          )}
          {drafterError && <p role="alert" className="text-[11px] text-red-600">{drafterError}</p>}
        </div>
      )}
    </motion.div>
  );
}

function DraftItem({ e, isSelected, onToggle, onRemove, isDark, isRTL }: { e: CartEntry; isSelected: boolean; onToggle: () => void; onRemove: () => void; isDark: boolean; isRTL: boolean }) {
  const [copiedArticle, setCopiedArticle] = useState(false);
  const [copiedReg, setCopiedReg]         = useState(false);

  const copyArticle = () => {
    if (!e.isArticleAdded) return;
    navigator.clipboard.writeText(`**${e.articleNum} من ${e.lawName}**\n\n${e.articleText}`);
    setCopiedArticle(true); setTimeout(() => setCopiedArticle(false), 2000);
  };

  const copyReg = () => {
    if (!e.execReg) return;
    navigator.clipboard.writeText(`**${e.execReg.ref}**\n\n${e.execReg.text}`);
    setCopiedReg(true); setTimeout(() => setCopiedReg(false), 2000);
  };

  const hasExecReg = !!e.execReg && e.isExecRegAdded;
  const hasPrincipalsOrPrecedents = e.principles.length > 0 || e.precedents.length > 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? "border-white/[0.06] bg-zinc-800/50" : "border-slate-100 bg-slate-50"}`}>

      {/* ─ checkbox + article row ─ */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="mt-0.5 flex-shrink-0 rounded border-gray-300 text-[#0B3D2E] focus:ring-[#0B3D2E] cursor-pointer"
        />
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          {e.isArticleAdded ? (
            <>
              {/* green article badge */}
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md flex-shrink-0 ${isDark ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/30" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                {e.articleNum} · {isRTL ? "نظام" : "Law"}
              </span>
              <p className={`text-[11px] font-semibold truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{e.articleTitle}</p>
            </>
          ) : (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md flex-shrink-0 ${isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white"}`}>{e.articleNum}</span>
          )}
        </div>
        {e.isArticleAdded && (
          <button onClick={copyArticle} className={`p-1 rounded-lg flex-shrink-0 transition ${isDark ? "hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300" : "hover:bg-slate-200 text-slate-400 hover:text-slate-600"}`}>
            {copiedArticle ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
        )}
        <button onClick={onRemove} className={`p-1 rounded-lg flex-shrink-0 transition ${isDark ? "hover:bg-red-900/20 text-zinc-600 hover:text-red-400" : "hover:bg-red-50 text-slate-400 hover:text-red-500"}`}>
          <X size={11} />
        </button>
      </div>

      {/* ─ article text preview ─ */}
      {e.isArticleAdded && (
        <p className={`px-3 pb-2 text-[10px] line-clamp-1 ${isDark ? "text-zinc-400" : "text-slate-400"}`}>{e.articleText.split("\n")[0]}</p>
      )}

      {/* ─ exec reg row ─ */}
      {hasExecReg && e.execReg && (
        <div className={`mx-3 mb-2 px-2.5 py-2 rounded-lg flex items-center gap-2 ${isDark ? "bg-[#C8A762]/8 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-200"}`}>
          <FileText size={10} className={`flex-shrink-0 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`} weight="duotone" />
          {/* amber regulation badge */}
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 ${isDark ? "bg-[#C8A762]/20 text-[#C8A762] border border-[#C8A762]/30" : "bg-amber-100 text-amber-700 border border-amber-300"}`}>
            {isRTL ? "لائحة" : "Reg"}
          </span>
          <p className={`text-[10px] font-semibold flex-1 truncate ${isDark ? "text-[#C8A762]/80" : "text-amber-700"}`}>{e.execReg.ref}</p>
          <button onClick={copyReg} className={`p-1 rounded-lg flex-shrink-0 transition ${isDark ? "hover:bg-[#C8A762]/10 text-zinc-500 hover:text-[#C8A762]" : "hover:bg-amber-100 text-amber-500"}`}>
            {copiedReg ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
          </button>
        </div>
      )}

      {/* ─ principles ─ */}
      {e.principles.length > 0 && (
        <div className={`px-3 pb-2 space-y-1 ${(e.isArticleAdded || hasExecReg) ? `border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}` : ""}`}>
          {e.principles.map(p => (
            <div key={p.id} className="flex items-start gap-1.5 pt-1.5">
              <Scales size={9} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`} />
              <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{p.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─ precedents ─ */}
      {e.precedents.length > 0 && (
        <div className={`px-3 pb-2 space-y-1 ${hasPrincipalsOrPrecedents ? `border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}` : ""}`}>
          {e.precedents.map(pr => (
            <div key={pr.id} className="flex items-start gap-1.5 pt-1.5">
              <Gavel size={9} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
              <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{pr.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
