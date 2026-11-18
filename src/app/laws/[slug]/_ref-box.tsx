"use client";

/**
 * _ref-box.tsx — «الإحالات المرتبطة» beside the article (owner message 18 Nov,
 * item 6; batch l8-refbox). Replaces the folded bar under each article and the
 * «وثائق وأنظمة ذات صلة» card.
 *
 *   1. A fixed side box (the reader's left column, sticky) for the article in
 *      view: three sections with a visual divider — التشريعات (green),
 *      المبادئ والأحكام القضائية (blue), الآراء الفقهية (amber) — each with an
 *      icon, a count and a rule, at most two items and «عرض الكل (n)».
 *   2. «عرض الكل» opens a dialog with one tab per section and coloured bars.
 *   3. Any item (box, dialog, sheet) opens a TEXT PREVIEW first: the text
 *      alone, «نسخ», «إضافة للمسودة», «انتقل إلى» (the exact place), «فتح …
 *      كاملاً». The reader's focus stays where it is.
 *   4. Principles, rulings and fiqh: a non-subscriber sees titles and a
 *      subscribe button; the text never reaches the browser (the preview route
 *      decides, server-side).
 *   5. Phone (and reading mode): the same sections in a bottom sheet, opened
 *      from the article's own «الإحالات» button.
 *   6. A link whose anchor is gone goes to its law or collection, never a 404.
 *   7. The fiqh section is hidden while it is empty.
 *
 * Data: GET /api/library/laws/[slug]/citations?article=<id> — only the link
 * types matching the owner's graph file (decision ٦٠). Fetched for the article
 * in view after it settles (no request per scrolled article), cached per page.
 */

import { createContext, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowSquareOut, BookBookmark, Check, Copy, Crosshair, Gavel, LinkSimple, Lock, Plus, Scroll, X } from "@phosphor-icons/react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { apiSlug } from "@/utils/apiSlug";
import { buildCitation } from "./_citation";
import { lawStatusPill, statusPill } from "./_cite-status";
import { scrollToReaderAnchor } from "./_reader-anchors";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Section = "legislation" | "judicial" | "fiqh";
const SECTIONS: readonly Section[] = ["legislation", "judicial", "fiqh"];

export interface RefItem {
  key: string;
  kind: "article" | "law" | "decree" | "principle" | "feqh";
  title: string;
  status: string | null;
  relation: string;
  section: Section;
  docKind: "law" | "collection" | "order" | "book";
  docId: string;
  anchorId: string | null;
  anchorMissing: boolean;
  href: string;
  docHref: string;
}
type Refs =
  | { available: false }
  | { available: true; found: boolean; sections: Record<Section, { total: number; items: RefItem[] }> };

interface Preview {
  found: boolean;
  kind: RefItem["kind"];
  title?: string;
  docTitle?: string;
  docType?: string;
  status?: string | null;
  num?: string;
  numberText?: string | null;
  text?: string;
  locked?: "subscribe" | null;
  href?: string;
  docHref?: string;
  docKind?: RefItem["docKind"];
  docId?: string;
}

/** Per page view: an article seen twice is fetched once. */
const refsCache = new Map<string, Refs>();

type LoadState = { status: "idle" | "loading" | "done" | "failed"; data?: Refs };

/** The links of one article; `delayMs` lets the side box wait for the scroll to settle. */
export function useArticleRefs(lawSlug: string, articleId: string | null, delayMs = 0): LoadState {
  const key = articleId ? `${lawSlug}|${articleId}` : "";
  // Only the outcome of the last request is state; idle, cached and loading are read off the key.
  const [settled, setSettled] = useState<{ key: string; failed: boolean }>({ key: "", failed: false });
  useEffect(() => {
    if (!key || !articleId || refsCache.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/library/laws/${apiSlug(lawSlug)}/citations?article=${encodeURIComponent(articleId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: Refs) => {
          refsCache.set(key, data);
          if (live) setSettled({ key, failed: false });
        })
        .catch(() => live && setSettled({ key, failed: true }));
    }, delayMs);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, lawSlug, articleId, delayMs]);
  if (!key) return { status: "idle" };
  const cached = refsCache.get(key);
  if (cached) return { status: "done", data: cached };
  return { status: settled.key === key && settled.failed ? "failed" : "loading" };
}

// ─── Context (the page provides it) ──────────────────────────────────────────

export interface RefBoxPageContext {
  lawSlug: string;
  viewerHasFullAccess: boolean;
  isDark: boolean;
  isRTL: boolean;
  /** Reading mode hides the side column: the per-article button then shows on every width. */
  inlineTrigger: boolean;
  showPaywall: () => void;
  /** «إضافة للمسودة» for an article of THIS law: the page's own add (same cart entry as its + button). */
  addSameLawArticle: (articleId: string) => boolean;
  addEntry: (entry: CartEntry) => void;
  isInCart: (id: string) => boolean;
  /** Short label of an article on this page («المادة الخامسة»), for the box header. */
  articleLabel: (articleId: string) => string;
}

interface RefBoxContextValue extends RefBoxPageContext {
  openSheet: (articleId: string) => void;
  openAll: (articleId: string, tab: Section) => void;
  openPreview: (item: RefItem) => void;
}

const RefBoxContext = createContext<RefBoxContextValue | null>(null);

export function useRefBox(): RefBoxContextValue | null {
  return useContext(RefBoxContext);
}

export function RefBoxProvider({ value, children }: { value: RefBoxPageContext | null; children: ReactNode }) {
  const [sheet, setSheet] = useState<string | null>(null);
  const [all, setAll] = useState<{ articleId: string; tab: Section } | null>(null);
  const [preview, setPreview] = useState<RefItem | null>(null);
  const ctx = useMemo<RefBoxContextValue | null>(
    () =>
      value
        ? {
            ...value,
            openSheet: (id) => setSheet(id),
            openAll: (articleId, tab) => setAll({ articleId, tab }),
            openPreview: (item) => setPreview(item),
          }
        : null,
    [value],
  );
  return (
    <RefBoxContext.Provider value={ctx}>
      {children}
      {ctx && sheet && <RefSheet ctx={ctx} articleId={sheet} onClose={() => setSheet(null)} />}
      {ctx && all && <RefAllDialog ctx={ctx} articleId={all.articleId} initialTab={all.tab} onClose={() => setAll(null)} />}
      {ctx && preview && <RefPreview ctx={ctx} item={preview} onClose={() => setPreview(null)} />}
    </RefBoxContext.Provider>
  );
}

// ─── Look ─────────────────────────────────────────────────────────────────────

const SECTION_META: Record<Section, { title: string; icon: typeof Scroll; bar: string; text: (d: boolean) => string; chip: (d: boolean) => string }> = {
  legislation: {
    title: "التشريعات",
    icon: Scroll,
    bar: "bg-emerald-500",
    text: (d) => (d ? "text-emerald-300" : "text-emerald-700"),
    chip: (d) => (d ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-500/10 text-emerald-700"),
  },
  judicial: {
    title: "المبادئ والأحكام القضائية",
    icon: Gavel,
    bar: "bg-sky-500",
    text: (d) => (d ? "text-sky-300" : "text-sky-700"),
    chip: (d) => (d ? "bg-sky-500/15 text-sky-300" : "bg-sky-500/10 text-sky-700"),
  },
  fiqh: {
    title: "الآراء الفقهية",
    icon: BookBookmark,
    bar: "bg-amber-500",
    text: (d) => (d ? "text-amber-300" : "text-amber-700"),
    chip: (d) => (d ? "bg-amber-500/15 text-amber-300" : "bg-amber-500/10 text-amber-700"),
  },
};

/** Principles, rulings and fiqh: titles only for a non-subscriber (item 6 §5). */
const SUBSCRIBER_SECTIONS: ReadonlySet<Section> = new Set(["judicial", "fiqh"]);

function pillOf(item: Pick<RefItem, "kind" | "status">) {
  if (item.kind === "article") return statusPill(item.status);
  if (item.kind === "law") return lawStatusPill(item.status);
  return null;
}

function arDigits(n: number): string {
  return n.toLocaleString("ar-SA");
}

// ─── Sections (box, sheet) ───────────────────────────────────────────────────

function visibleSections(data: Extract<Refs, { available: true }>): Section[] {
  // Owner item 6: the fiqh section is hidden while it is empty.
  return SECTIONS.filter((s) => s !== "fiqh" || data.sections.fiqh.total > 0);
}

function RefSections({ ctx, articleId, state, max }: { ctx: RefBoxContextValue; articleId: string; state: LoadState; max: number }) {
  const { isDark } = ctx;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const data = state.data;
  if (state.status === "loading" || state.status === "idle") return <p className={`text-[11px] ${muted}`}>جارٍ تحميل الإحالات…</p>;
  if (state.status === "failed") return <p className={`text-[11px] ${muted}`}>تعذّر تحميل الإحالات الآن.</p>;
  if (!data || !data.available) return <p className={`text-[11px] ${muted}`}>شبكة الإحالات غير متاحة بعد.</p>;
  if (!data.found) return <p className={`text-[11px] ${muted}`}>هذه المادة لم تُفهرس في شبكة الإحالات بعد.</p>;
  return (
    <div className="space-y-3">
      {visibleSections(data).map((s, i) => {
        const meta = SECTION_META[s];
        const Icon = meta.icon;
        const sec = data.sections[s];
        const locked = SUBSCRIBER_SECTIONS.has(s) && !ctx.viewerHasFullAccess;
        return (
          <section key={s} aria-label={meta.title} className={i > 0 ? `pt-3 border-t ${isDark ? "border-white/[0.08]" : "border-slate-200"}` : ""}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`h-4 w-1 rounded-full ${meta.bar}`} aria-hidden />
              <Icon size={13} weight="fill" className={meta.text(isDark)} />
              <h4 className={`flex-1 text-[11px] font-black ${meta.text(isDark)}`}>{meta.title}</h4>
              <span className={`rounded-md px-1.5 text-[10px] font-bold ${meta.chip(isDark)}`}>{arDigits(sec.total)}</span>
            </div>
            {sec.items.length === 0 ? (
              <p className={`text-[10.5px] ${muted}`}>لا توجد إحالات مسجّلة في هذا القسم.</p>
            ) : (
              <ul className="space-y-1">
                {sec.items.slice(0, max).map((it) => (
                  <li key={it.key}>
                    <ItemButton ctx={ctx} item={it} locked={locked} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {sec.total > max && (
                <button type="button" onClick={() => ctx.openAll(articleId, s)} className={`text-[10.5px] font-bold underline-offset-2 hover:underline ${meta.text(isDark)}`}>
                  عرض الكل ({arDigits(sec.total)})
                </button>
              )}
              {locked && sec.total > 0 && (
                <button type="button" onClick={ctx.showPaywall} className="inline-flex items-center gap-1 rounded-lg bg-[#0B3D2E] px-2 py-0.5 text-[10px] font-bold text-white">
                  <Lock size={10} /> اشترك في المكتبة لقراءة النصوص
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ItemButton({ ctx, item, locked }: { ctx: RefBoxContextValue; item: RefItem; locked: boolean }) {
  const { isDark } = ctx;
  const pill = pillOf(item);
  return (
    <button
      type="button"
      onClick={() => ctx.openPreview(item)}
      className={`w-full text-start rounded-lg border px-2 py-1.5 text-[11px] leading-snug transition ${isDark ? "border-white/[0.07] bg-zinc-900 text-zinc-200 hover:border-white/20" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
    >
      <span className="flex items-start gap-1">
        {pill && <span role="img" aria-label={pill.labelAr} title={pill.labelAr} className="flex-shrink-0">{pill.emoji}</span>}
        {locked && <Lock size={11} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`} aria-label="للمشتركين" />}
        <span className="line-clamp-2 font-semibold">{item.title}</span>
      </span>
      {(item.relation || item.anchorMissing) && (
        <span className={`mt-0.5 block text-[9.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          {item.relation}
          {item.anchorMissing && " · الموضع الدقيق غير متاح، يفتح المستند كاملاً"}
        </span>
      )}
    </button>
  );
}

// ─── The side box (desktop) ───────────────────────────────────────────────────

/** The box beside the article in view. Waits 350 ms after the article changes, so scrolling past fetches nothing. */
export function RefBox({ articleId }: { articleId: string | null }) {
  const ctx = useRefBox();
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx ? articleId : null, 350);
  if (!ctx) return null;
  const { isDark } = ctx;
  return (
    <div className={`p-3.5 rounded-2xl border print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
      <h3 className={`mb-2.5 flex items-center gap-1.5 text-xs font-black ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
        <LinkSimple size={14} className="text-[#C8A762]" />
        <span className="flex-1">الإحالات المرتبطة</span>
        {articleId && <span className={`truncate max-w-[45%] text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ctx.articleLabel(articleId)}</span>}
      </h3>
      {articleId ? (
        <RefSections ctx={ctx} articleId={articleId} state={state} max={2} />
      ) : (
        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>انتقل إلى مادة لتظهر إحالاتها هنا.</p>
      )}
    </div>
  );
}

/** The article's own «الإحالات» button: the phone (and reading mode) opens the bottom sheet. */
export function RefSheetButton({ articleId }: { articleId: string }) {
  const ctx = useRefBox();
  if (!ctx) return null;
  const { isDark } = ctx;
  return (
    <button
      type="button"
      onClick={() => ctx.openSheet(articleId)}
      className={`${ctx.inlineTrigger ? "" : "lg:hidden "}inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold print:hidden ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
    >
      <LinkSimple size={12} className="text-[#C8A762]" /> الإحالات المرتبطة
    </button>
  );
}

function RefSheet({ ctx, articleId, onClose }: { ctx: RefBoxContextValue; articleId: string; onClose: () => void }) {
  const state = useArticleRefs(ctx.lawSlug, articleId);
  const { isDark } = ctx;
  return (
    <AnimatePresence>
      <motion.div key="refsheet-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-[2px] print:hidden" />
      <motion.div
        key="refsheet"
        role="dialog"
        aria-modal="true"
        aria-label="الإحالات المرتبطة"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className={`fixed inset-x-0 bottom-0 z-[10001] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl safe-bottom print:hidden lg:mx-auto lg:max-w-xl ${isDark ? "bg-zinc-950" : "bg-white"}`}
        dir="rtl"
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b ${isDark ? "bg-zinc-950 border-white/10" : "bg-white border-slate-200"}`}>
          <span className={`text-sm font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
            الإحالات المرتبطة <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ctx.articleLabel(articleId)}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="p-4">
          <RefSections ctx={ctx} articleId={articleId} state={state} max={2} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── «عرض الكل»: tabs per section ────────────────────────────────────────────

function Modal({ isDark, label, onClose, children, wide }: { isDark: boolean; label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center print:hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-xl"} max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border shadow-2xl ${isDark ? "bg-zinc-950 border-white/10" : "bg-white border-slate-200"}`}
      >
        {children}
      </div>
    </div>
  );
}

function RefAllDialog({ ctx, articleId, initialTab, onClose }: { ctx: RefBoxContextValue; articleId: string; initialTab: Section; onClose: () => void }) {
  const state = useArticleRefs(ctx.lawSlug, articleId);
  const [tab, setTab] = useState<Section>(initialTab);
  const { isDark } = ctx;
  const data = state.data && state.data.available ? state.data : null;
  const tabs = data ? visibleSections(data) : [initialTab];
  const sec = data?.sections[tab];
  const locked = SUBSCRIBER_SECTIONS.has(tab) && !ctx.viewerHasFullAccess;
  return (
    <Modal isDark={isDark} label="كل الإحالات المرتبطة" onClose={onClose} wide>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
          الإحالات المرتبطة <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ctx.articleLabel(articleId)}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
          <X size={18} weight="bold" />
        </button>
      </div>
      <div role="tablist" className={`flex gap-1 px-3 pt-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        {tabs.map((s) => {
          const meta = SECTION_META[s];
          const active = s === tab;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(s)}
              className={`relative px-3 pb-2 pt-1 text-[11.5px] font-bold ${active ? meta.text(isDark) : isDark ? "text-zinc-500" : "text-slate-500"}`}
            >
              {meta.title} ({arDigits(data?.sections[s].total ?? 0)})
              <span className={`absolute inset-x-1 -bottom-px h-[3px] rounded-full ${active ? meta.bar : "bg-transparent"}`} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!data || !sec ? (
          <RefSections ctx={ctx} articleId={articleId} state={state} max={0} />
        ) : sec.items.length === 0 ? (
          <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>لا توجد إحالات مسجّلة في هذا القسم.</p>
        ) : (
          <>
            {locked && (
              <div className={`mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600"}`}>
                <span>تظهر العناوين فقط؛ نصوص المبادئ والأحكام للمشتركين في المكتبة القانونية.</span>
                <button type="button" onClick={ctx.showPaywall} className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#0B3D2E] px-2.5 py-1 text-[10.5px] font-bold text-white">
                  <Lock size={11} /> اشترك في المكتبة
                </button>
              </div>
            )}
            <ul className="space-y-1.5">
              {sec.items.map((it) => (
                <li key={it.key} className="flex items-stretch gap-2">
                  <span className={`w-1 flex-shrink-0 rounded-full ${SECTION_META[tab].bar}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <ItemButton ctx={ctx} item={it} locked={locked} />
                  </div>
                </li>
              ))}
            </ul>
            {sec.total > sec.items.length && (
              <p className={`mt-3 text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                يُعرض أول {arDigits(sec.items.length)} من {arDigits(sec.total)}.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── The text preview ─────────────────────────────────────────────────────────

function plain(md: string): string {
  return md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/^#+\s*/gm, "").trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function RefPreview({ ctx, item, onClose }: { ctx: RefBoxContextValue; item: RefItem; onClose: () => void }) {
  const { isDark } = ctx;
  const [fetched, setState] = useState<{ status: "loading" | "done" | "failed"; data?: Preview; error?: string }>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  // The anchor is gone: nothing to quote — the preview names the item and links to its document.
  const state: typeof fetched = item.anchorMissing ? { status: "done", data: { found: false, kind: item.kind } } : fetched;

  useEffect(() => {
    if (item.anchorMissing) return;
    let live = true;
    fetch(`/api/library/laws/${apiSlug(ctx.lawSlug)}/citations/preview?key=${encodeURIComponent(item.key)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "");
        return body as Preview;
      })
      .then((data) => live && setState({ status: "done", data }))
      .catch((e: Error) => live && setState({ status: "failed", error: e.message }));
    return () => {
      live = false;
    };
  }, [ctx.lawSlug, item.key, item.kind, item.anchorMissing]);

  const p = state.data;
  const text = p?.text ? plain(p.text) : "";
  const meta = SECTION_META[item.section];
  const sameLaw = item.kind === "article" && item.docKind === "law" && item.docId === ctx.lawSlug && !!item.anchorId && !item.anchorMissing;
  const href = p?.found && p.href ? p.href : item.href;
  const docHref = p?.found && p.docHref ? p.docHref : item.docHref;
  const reference = (() => {
    if (p?.found && item.kind === "article") {
      return buildCitation({ docTitle: p.docTitle ?? "", docType: p.docType, numberText: p.numberText, displayNum: p.num, status: p.status }, true)
        .plain.replace(/[\s,،]*ونصه(?: قبل الإلغاء)?:$/u, "")
        .trim();
    }
    return p?.found && p.title ? p.title : item.title;
  })();
  const canAdd = !!text && (item.kind === "article" || item.kind === "principle");
  const inCart = ctx.isInCart(item.anchorId ?? item.key);

  const onCopy = async () => {
    const body = text ? `${reference}:\n${text}` : reference;
    if (await copyText(body)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const onAdd = () => {
    if (!p?.found) return;
    if (p.locked) return ctx.showPaywall();
    if (!canAdd) return;
    if (sameLaw && ctx.addSameLawArticle(item.anchorId!)) {
      setAdded(true);
      return;
    }
    ctx.addEntry({
      articleId: item.anchorId ?? item.key,
      articleNum: (p.num ?? "").slice(0, 60),
      articleTitle: p.kind === "article" ? p.title ?? "" : text.slice(0, 45) + (text.length > 45 ? "..." : ""),
      articleText: text,
      lawName: p.docTitle ?? "",
      lawSlug: p.docId ?? item.docId,
      isArticleAdded: true,
      isExecRegAdded: false,
      principles: [],
      precedents: [],
    });
    setAdded(true);
  };
  const onGoTo = (e: MouseEvent) => {
    if (sameLaw && scrollToReaderAnchor(item.anchorId)) {
      e.preventDefault();
      window.history.replaceState(null, "", `#${encodeURIComponent(item.anchorId!)}`);
      onClose();
    }
  };
  const openWholeLabel = item.docKind === "law" ? "فتح النظام كاملاً" : item.docKind === "collection" ? "فتح الحكم كاملاً" : item.docKind === "order" ? "فتح الأمر كاملاً" : "فتح الكتاب كاملاً";
  const btn = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11.5px] font-bold transition ${isDark ? "border-white/10 text-zinc-200 hover:bg-white/[0.06]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`;

  return (
    <Modal isDark={isDark} label="معاينة النص" onClose={onClose}>
      <div className={`flex items-start gap-2 px-4 py-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <span className={`mt-1 h-5 w-1 flex-shrink-0 rounded-full ${meta.bar}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className={`text-[10.5px] font-bold ${meta.text(isDark)}`}>{meta.title}{item.relation ? ` · ${item.relation}` : ""}</p>
          <h3 className={`text-[13px] font-black leading-snug ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>{reference}</h3>
          {p?.found && p.kind === "article" && p.title && p.title !== p.num && (
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{p.title}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.status === "loading" && <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>جارٍ تحميل النص…</p>}
        {state.status === "failed" && (
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{state.error || "تعذّر تحميل النص الآن."}</p>
        )}
        {state.status === "done" && p && !p.found && (
          <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            تعذّر تحديد الموضع الدقيق لهذه الإحالة في المكتبة؛ يفتح الرابط المستند كاملاً.
          </p>
        )}
        {state.status === "done" && p?.found && p.locked === "subscribe" && (
          <div className={`rounded-xl border p-3 text-[12px] ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600"}`}>
            <p className="mb-2 flex items-center gap-1.5 font-bold">
              <Lock size={13} />
              {item.kind === "article" ? "نص هذه المادة خارج المعاينة المجانية." : "نص المبادئ والأحكام للمشتركين في المكتبة القانونية."}
            </p>
            <button type="button" onClick={ctx.showPaywall} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-1.5 text-[11.5px] font-bold text-white">
              اشترك في المكتبة
            </button>
          </div>
        )}
        {state.status === "done" && p?.found && !p.locked && text && (
          <p className={`whitespace-pre-line text-[13px] leading-7 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{text}</p>
        )}
        {state.status === "done" && p?.found && !p.locked && !text && (
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>لا يُعرض نص هنا؛ افتح المستند لقراءته.</p>
        )}
      </div>

      <div className={`flex flex-wrap gap-2 px-4 py-3 border-t ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <button type="button" onClick={onCopy} className={btn}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "نُسخ" : "نسخ"}
        </button>
        {(item.kind === "article" || item.kind === "principle") && p?.found && (
          <button type="button" onClick={onAdd} disabled={added || inCart} className={`${btn} disabled:opacity-60`}>
            {added || inCart ? <Check size={13} /> : p.locked ? <Lock size={13} /> : <Plus size={13} />}
            {added || inCart ? "في المسودة" : "إضافة للمسودة"}
          </button>
        )}
        {!item.anchorMissing && p?.found !== false && (
          <Link href={href} onClick={onGoTo} className={btn}>
            <Crosshair size={13} /> انتقل إلى
          </Link>
        )}
        <Link href={docHref} className={btn}>
          <ArrowSquareOut size={13} /> {openWholeLabel}
        </Link>
      </div>
    </Modal>
  );
}
