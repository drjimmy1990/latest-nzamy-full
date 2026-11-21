"use client";

/**
 * _ref-box.tsx — «الإحالات المرتبطة» of the law reader.
 *
 * History: batch l8-refbox (owner message 18 Nov, item 6) moved the links from
 * a folded bar under each article into a side box. Batch l12 (owner file 03
 * L1, lib02 / lib04, 20 Nov) brings them back UNDER EVERY ARTICLE, and keeps
 * the side box, both drawn from ONE cache:
 *
 *   1. One request for the whole law (GET …/citations?bulk=1, started by the
 *      page beside the law request — prefetchLawLinks), not one per article:
 *      per article its link groups with their true totals and up to three
 *      items each. The list under each article and the side box then draw
 *      with no spinner.
 *      Fallback (the bulk function not installed yet, or it failed): the
 *      article's own list (?article=) once it comes near the screen, three
 *      requests at a time at most.
 *   2. Under each article (ArticleRefsInline): a counter chip that folds and
 *      unfolds small cards grouped by the relation's words (إحالة، لائحة،
 *      مقابل ساري، استثناء…), three per group, then «عرض الكل (n)». Nothing
 *      at all when the article has no link.
 *   3. The side box (RefBox, desktop): the same sections and groups for the
 *      article in view.
 *   4. «عرض الكل» opens a dialog with one tab per section (it asks for the
 *      article's full list when the cache holds three per group only).
 *   5. Any item opens a TEXT PREVIEW first: the text alone, «نسخ», «إضافة
 *      للمسودة», «انتقل إلى», «فتح … كاملاً». Principles, rulings and fiqh: a
 *      non-subscriber sees titles; the text never reaches the browser (the
 *      preview route decides, server-side).
 *   6. Owner Q132 (20 Nov, 22:16 «شغّلهم من غير وسم»): a link whose article
 *      or principle could not be pinned is an ordinary link to its DOCUMENT —
 *      named by the document, no status, no "unconfirmed" tag (the l8 one is
 *      gone); it opens the document directly.
 *   7. Owner Q133: «مواد متقاربة في المعنى (ربط آلي)» is its own section, after
 *      the legal ones (admin switch library_similar_links).
 *   8. Owner library-Q4 / N12: an unreviewed automatic «إحالة» carries a small
 *      «رابط آلي» tag (admin switch library_auto_link_tag; his links and the
 *      308 never do).
 *   9. File 16 §8: an empty section is hidden — never «لا توجد إحالات».
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  BookBookmark,
  BookmarkSimple,
  CaretDown,
  Check,
  Copy,
  Crosshair,
  Gavel,
  LinkSimple,
  Lock,
  Scroll,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { apiSlug } from "@/utils/apiSlug";
import {
  expandLawLinks,
  groupsOfRefs,
  type ArticleRefsOut,
  type LawLinks,
  type RefGroupOut,
  type RefItemOut,
} from "@/app/api/library/laws/[slug]/citations/_shape";
import { buildCitation } from "./_citation";
import { lawStatusPill, statusPill } from "./_cite-status";
import { scrollToReaderAnchor } from "./_reader-anchors";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Section = "legislation" | "judicial" | "fiqh" | "similar";
const SECTIONS: readonly Section[] = ["legislation", "judicial", "fiqh", "similar"];

export type RefItem = RefItemOut;
type Refs = { available: false } | ({ available: true } & ArticleRefsOut);

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

// ── The whole law: one request (batch l12, L1) ──

type BulkState = { status: "loading" } | { status: "done"; data: LawLinks } | { status: "unavailable" | "failed" };

/** Per page view and law: the bulk answer, and whoever waits for it. */
const bulkStore = new Map<string, BulkState>();
const bulkListeners = new Set<() => void>();
function emitBulk() {
  for (const l of bulkListeners) l();
}
function subscribeBulk(l: () => void) {
  bulkListeners.add(l);
  return () => {
    bulkListeners.delete(l);
  };
}

/**
 * Starts the law's links request once per page view. The page calls it beside
 * its own law request (it never waits for the law), the provider again with the
 * law's canonical slug.
 */
export function prefetchLawLinks(lawSlug: string): void {
  if (!lawSlug || bulkStore.has(lawSlug)) return;
  bulkStore.set(lawSlug, { status: "loading" });
  emitBulk();
  fetch(`/api/library/laws/${apiSlug(lawSlug)}/citations?bulk=1`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { available?: boolean } & Partial<LawLinks>) => {
      bulkStore.set(
        lawSlug,
        d?.available === true && d.items && d.articles
          ? { status: "done", data: { found: d.found === true, perType: d.perType ?? 3, items: d.items, articles: d.articles } }
          : { status: "unavailable" },
      );
      emitBulk();
    })
    .catch(() => {
      bulkStore.set(lawSlug, { status: "failed" });
      emitBulk();
    });
}

function useBulk(lawSlug: string): BulkState | undefined {
  return useSyncExternalStore(
    subscribeBulk,
    () => bulkStore.get(lawSlug),
    () => undefined,
  );
}

// ── One article's full list (?article=): the fallback, and «عرض الكل» ──

/** Per page view: an article seen twice is fetched once. */
const refsCache = new Map<string, Refs>();
/** The fallback asks at most three articles at a time. */
const MAX_PARALLEL = 3;
let running = 0;
const queue: Array<() => void> = [];
function pump() {
  while (running < MAX_PARALLEL && queue.length > 0) {
    running++;
    queue.shift()!();
  }
}
function fetchArticleRefs(lawSlug: string, articleId: string): Promise<Refs> {
  return new Promise<Refs>((resolve, reject) => {
    queue.push(() => {
      fetch(`/api/library/laws/${apiSlug(lawSlug)}/citations?article=${encodeURIComponent(articleId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Refs) => resolve(d))
        .catch(reject)
        .finally(() => {
          running--;
          pump();
        });
    });
    pump();
  });
}

type LoadState = { status: "idle" | "loading" | "done" | "failed"; data?: Refs };

/**
 * The links of one article. From the law's bulk answer when it is there (no
 * request of its own); else, or when `full` asks for more than three per
 * group, from ?article= — once `enabled` (the inline list waits until the
 * article comes near the screen) and after `delayMs` (the side box waits for
 * the scroll to settle).
 */
export function useArticleRefs(
  lawSlug: string,
  articleId: string | null,
  { delayMs = 0, full = false, enabled = true }: { delayMs?: number; full?: boolean; enabled?: boolean } = {},
): LoadState {
  const bulk = useBulk(lawSlug);
  const fromBulk = useMemo<Refs | null>(() => {
    if (!articleId || bulk?.status !== "done") return null;
    return { available: true, ...expandLawLinks(bulk.data, articleId) };
  }, [bulk, articleId]);
  // The bulk answer is enough, unless «عرض الكل» needs more than it holds.
  const bulkEnough = !!fromBulk && (!full || (fromBulk.available && fromBulk.groups?.every((g) => g.keys.length >= g.total)));
  const bulkPending = !bulk || bulk.status === "loading";
  const key = articleId ? `${lawSlug}|${articleId}` : "";
  const wantFetch = !!key && enabled && !bulkEnough && (full || !bulkPending);
  const [settled, setSettled] = useState<{ key: string; failed: boolean }>({ key: "", failed: false });
  useEffect(() => {
    if (!wantFetch || !articleId || refsCache.has(key)) return;
    let live = true;
    const t = setTimeout(() => {
      fetchArticleRefs(lawSlug, articleId)
        .then((data) => {
          refsCache.set(key, data);
          if (live) setSettled({ key, failed: false });
        })
        .catch(() => live && setSettled({ key, failed: true }));
    }, delayMs);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [wantFetch, key, lawSlug, articleId, delayMs]);
  if (!key) return { status: "idle" };
  if (bulkEnough && fromBulk) return { status: "done", data: fromBulk };
  const cached = refsCache.get(key);
  if (cached) return { status: "done", data: cached };
  // «عرض الكل» shows the three per group at once while the rest comes.
  if (fromBulk) return { status: "done", data: fromBulk };
  if (!wantFetch) return { status: bulkPending ? "loading" : "idle" };
  return { status: settled.key === key && settled.failed ? "failed" : "loading" };
}

// ─── Context (the page provides it) ──────────────────────────────────────────

export interface RefBoxPageContext {
  lawSlug: string;
  /**
   * O15 (batch l11): the law API's `paywall.hasFullAccess`; null while it is
   * not known. The subscriber sections draw their lock on `false` only, so no
   * lock flashes before the answer (the preview route still decides on its own).
   */
  viewerHasFullAccess: boolean | null;
  isDark: boolean;
  isRTL: boolean;
  /** Reading mode hides the side column; the list under each article stays. */
  inlineTrigger: boolean;
  showPaywall: () => void;
  /** «إضافة للمسودة» for an article of THIS law: the page's own add (same cart entry as its button). */
  addSameLawArticle: (articleId: string) => boolean;
  addEntry: (entry: CartEntry) => void;
  isInCart: (id: string) => boolean;
  /** Short label of an article on this page («المادة الخامسة»), for the box header. */
  articleLabel: (articleId: string) => string;
}

interface RefBoxContextValue extends RefBoxPageContext {
  openAll: (articleId: string, tab: Section) => void;
  openPreview: (item: RefItem) => void;
}

const RefBoxContext = createContext<RefBoxContextValue | null>(null);

export function useRefBox(): RefBoxContextValue | null {
  return useContext(RefBoxContext);
}

export function RefBoxProvider({ value, children }: { value: RefBoxPageContext | null; children: ReactNode }) {
  const [all, setAll] = useState<{ articleId: string; tab: Section } | null>(null);
  const [preview, setPreview] = useState<RefItem | null>(null);
  const lawSlug = value?.lawSlug ?? "";
  // The page already asked with the URL's slug; the law's own slug may differ.
  useEffect(() => {
    if (lawSlug) prefetchLawLinks(lawSlug);
  }, [lawSlug]);
  const ctx = useMemo<RefBoxContextValue | null>(
    () =>
      value
        ? {
            ...value,
            openAll: (articleId, tab) => setAll({ articleId, tab }),
            openPreview: (item) => setPreview(item),
          }
        : null,
    [value],
  );
  return (
    <RefBoxContext.Provider value={ctx}>
      {children}
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
  // Owner Q133: its own heading, after the legal sections, named as automatic.
  similar: {
    title: "مواد متقاربة في المعنى (ربط آلي)",
    icon: Sparkle,
    bar: "bg-violet-500",
    text: (d) => (d ? "text-violet-300" : "text-violet-700"),
    chip: (d) => (d ? "bg-violet-500/15 text-violet-300" : "bg-violet-500/10 text-violet-700"),
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

// ─── Sections and groups (under the article, side box) ───────────────────────

function visibleSections(data: Extract<Refs, { available: true }>): Section[] {
  // File 16 §8 (register 14 item 17): every empty section is hidden, never «لا توجد إحالات».
  return SECTIONS.filter((s) => data.sections[s] && data.sections[s].total > 0 && data.sections[s].items.length > 0);
}

/** The sections an article shows; [] when it has none (not in the graph, the graph not ready, or no link). */
function shownSections(state: LoadState): Section[] {
  const data = state.data;
  if (state.status !== "done" || !data || !data.available || !data.found) return [];
  return visibleSections(data);
}

/** The groups of an article's answer: the bulk answer carries them, a full list is grouped here. */
function groupsOf(data: Extract<Refs, { available: true }>): RefGroupOut[] {
  return data.groups ?? groupsOfRefs(data);
}

function linkCount(state: LoadState): number {
  const data = state.data;
  if (state.status !== "done" || !data || !data.available) return 0;
  return shownSections(state).reduce((n, s) => n + data.sections[s].total, 0);
}

/**
 * The sections of one article, each with its relation groups and at most
 * `max` small cards per group, then «عرض الكل (n)». The same component under
 * the article and in the side box.
 */
function RefGroups({ ctx, articleId, data, max }: { ctx: RefBoxContextValue; articleId: string; data: Extract<Refs, { available: true }>; max: number }) {
  const { isDark } = ctx;
  const byKey = new Map<string, RefItem>();
  for (const s of SECTIONS) for (const it of data.sections[s]?.items ?? []) byKey.set(`${s}|${it.linkType}|${it.direction}|${it.key}`, it);
  const groups = groupsOf(data);
  return (
    <div className="space-y-3">
      {visibleSections(data).map((s, i) => {
        const meta = SECTION_META[s];
        const Icon = meta.icon;
        const sec = data.sections[s];
        const locked = SUBSCRIBER_SECTIONS.has(s) && ctx.viewerHasFullAccess === false;
        const sectionGroups = groups.filter((g) => g.section === s);
        const shown = sectionGroups.reduce((n, g) => n + Math.min(max, g.keys.length), 0);
        return (
          <section key={s} aria-label={meta.title} className={i > 0 ? `pt-3 border-t ${isDark ? "border-white/[0.08]" : "border-slate-200"}` : ""}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`h-4 w-1 rounded-full ${meta.bar}`} aria-hidden />
              <Icon size={13} weight="fill" className={meta.text(isDark)} />
              <h4 className={`flex-1 text-[11px] font-black ${meta.text(isDark)}`}>{meta.title}</h4>
              <span className={`rounded-md px-1.5 text-[10px] font-bold ${meta.chip(isDark)}`}>{arDigits(sec.total)}</span>
            </div>
            <div className="space-y-2">
              {sectionGroups.map((g) => (
                <div key={`${g.linkType}|${g.direction}`}>
                  {s !== "similar" && (
                    <p className={`mb-1 text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      {g.relation} <span className="font-normal">({arDigits(g.total)})</span>
                    </p>
                  )}
                  <ul className="space-y-1">
                    {g.keys.slice(0, max).map((k) => {
                      const it = byKey.get(`${s}|${g.linkType}|${g.direction}|${k}`) ?? data.sections[s].items.find((x) => x.key === k);
                      return it ? (
                        <li key={k}>
                          <ItemButton ctx={ctx} item={{ ...it, relation: g.relation, linkType: g.linkType, direction: g.direction }} locked={locked} />
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {sec.total > shown && (
                <button
                  type="button"
                  onClick={() => ctx.openAll(articleId, s)}
                  className={`min-h-[44px] sm:min-h-0 text-[10.5px] font-bold underline-offset-2 hover:underline ${meta.text(isDark)}`}
                >
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
  // A link whose article could not be pinned carries no status: it names and opens its document (Q132).
  const pill = item.anchorMissing ? null : pillOf(item);
  const cls = `block w-full text-start rounded-lg border px-2 py-1.5 text-[11px] leading-snug transition ${isDark ? "border-white/[0.07] bg-zinc-900 text-zinc-200 hover:border-white/20" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`;
  const body = (
    <>
      <span className="flex items-start gap-1">
        {pill && <span role="img" aria-label={pill.labelAr} title={pill.labelAr} className="flex-shrink-0">{pill.emoji}</span>}
        {locked && <Lock size={11} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`} aria-label="للمشتركين" />}
        <span className="line-clamp-2 flex-1 font-semibold">{item.title}</span>
        {item.auto && (
          <span
            title="رابط استخرجه النظام آلياً من النص ولم يراجعه فريق المكتبة بعد"
            className={`flex-shrink-0 rounded px-1 text-[9px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}
          >
            رابط آلي
          </span>
        )}
      </span>
      {item.relation && <span className={`mt-0.5 block text-[9.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{item.relation}</span>}
    </>
  );
  if (item.anchorMissing) {
    return (
      <Link href={item.docHref} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => ctx.openPreview(item)} className={cls}>
      {body}
    </button>
  );
}

function RefsSkeleton({ isDark }: { isDark: boolean }) {
  const bar = isDark ? "bg-white/[0.06]" : "bg-slate-100";
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="جارٍ تحميل الإحالات">
      <div className={`h-3 w-1/2 rounded ${bar} animate-pulse`} />
      <div className={`h-8 rounded-lg ${bar} animate-pulse`} />
      <div className={`h-8 rounded-lg ${bar} animate-pulse`} />
    </div>
  );
}

// ─── Under each article ──────────────────────────────────────────────────────

/**
 * Owner L1 (lib02): the links under every article — a counter chip that folds
 * the cards, open by default. Nothing at all while loading or when the article
 * has no link (no spinner under hundreds of articles).
 */
export function ArticleRefsInline({ articleId }: { articleId: string }) {
  const ctx = useRefBox();
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [open, setOpen] = useState(true);
  const bulk = useBulk(ctx?.lawSlug ?? "");
  const needsNear = !!ctx && (bulk?.status === "unavailable" || bulk?.status === "failed");
  // Fallback only: ask for this article's list once it comes near the screen.
  useEffect(() => {
    if (!needsNear || near || !box.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: "600px 0px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [needsNear, near]);
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx ? articleId : null, { enabled: near });
  const total = linkCount(state);
  if (!ctx) return null;
  const { isDark } = ctx;
  const data = state.data;
  return (
    <div ref={box} className="mt-3 print:hidden">
      {total > 0 && data && data.available && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}
          >
            <LinkSimple size={12} className="text-[#C8A762]" /> الإحالات المرتبطة
            <span className={`rounded-md px-1.5 text-[10px] ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>{arDigits(total)}</span>
            <CaretDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open && (
            <div className={`mt-2 rounded-xl border p-3 ${isDark ? "border-white/[0.07] bg-zinc-900/40" : "border-slate-200 bg-slate-50/60"}`}>
              <RefGroups ctx={ctx} articleId={articleId} data={data} max={3} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── The side box (desktop) ───────────────────────────────────────────────────

/**
 * The box beside the article in view, from the same cache as the list under
 * it. In the fallback it waits 350 ms after the article changes, so scrolling
 * past fetches nothing. Hidden once the answer says the article has no link
 * (file 16 §8); while loading it keeps a skeleton frame, so the cards under it
 * in the sticky column do not jump.
 */
export function RefBox({ articleId }: { articleId: string | null }) {
  const ctx = useRefBox();
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx ? articleId : null, { delayMs: 350 });
  if (!ctx || !articleId) return null;
  if ((state.status === "done" || state.status === "idle") && shownSections(state).length === 0) return null;
  const { isDark } = ctx;
  const data = state.data;
  return (
    <div className={`p-3.5 rounded-2xl border print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
      <h3 className={`mb-2.5 flex items-center gap-1.5 text-xs font-black ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
        <LinkSimple size={14} className="text-[#C8A762]" />
        <span className="flex-1">الإحالات المرتبطة</span>
        <span className={`truncate max-w-[45%] text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ctx.articleLabel(articleId)}</span>
      </h3>
      {state.status === "loading" && <RefsSkeleton isDark={isDark} />}
      {state.status === "failed" && <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>تعذّر تحميل الإحالات الآن.</p>}
      {state.status === "done" && data && data.available && <RefGroups ctx={ctx} articleId={articleId} data={data} max={2} />}
    </div>
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
  const state = useArticleRefs(ctx.lawSlug, articleId, { full: true });
  const [picked, setTab] = useState<Section>(initialTab);
  const { isDark } = ctx;
  const data = state.data && state.data.available ? state.data : null;
  const tabs = data ? visibleSections(data) : [initialTab];
  // An empty section has no tab (file 16 §8): fall back to the first one shown.
  const tab = tabs.includes(picked) ? picked : (tabs[0] ?? picked);
  const sec = data && tabs.includes(tab) ? data.sections[tab] : undefined;
  const locked = SUBSCRIBER_SECTIONS.has(tab) && ctx.viewerHasFullAccess === false;
  return (
    <Modal isDark={isDark} label="كل الإحالات المرتبطة" onClose={onClose} wide>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
          الإحالات المرتبطة <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ctx.articleLabel(articleId)}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
          <X size={18} weight="bold" />
        </button>
      </div>
      <div role="tablist" className={`flex gap-1 overflow-x-auto px-3 pt-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
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
              className={`relative flex-shrink-0 px-3 pb-2 pt-1 text-[11.5px] font-bold ${active ? meta.text(isDark) : isDark ? "text-zinc-500" : "text-slate-500"}`}
            >
              {meta.title} ({arDigits(data?.sections[s].total ?? 0)})
              <span className={`absolute inset-x-1 -bottom-px h-[3px] rounded-full ${active ? meta.bar : "bg-transparent"}`} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {state.status === "loading" && !data && <RefsSkeleton isDark={isDark} />}
        {state.status === "failed" && !data && <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>تعذّر تحميل الإحالات الآن.</p>}
        {data && sec && (
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
                <li key={`${it.linkType}|${it.key}`} className="flex items-stretch gap-2">
                  <span className={`w-1 flex-shrink-0 rounded-full ${SECTION_META[tab].bar}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <ItemButton ctx={ctx} item={it} locked={locked} />
                  </div>
                </li>
              ))}
            </ul>
            {sec.total > sec.items.length && (
              <p className={`mt-3 text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                {state.status === "loading" ? "جارٍ تحميل البقية…" : `يُعرض أول ${arDigits(sec.items.length)} من ${arDigits(sec.total)}.`}
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
  const [state, setState] = useState<{ status: "loading" | "done" | "failed"; data?: Preview; error?: string }>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
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
  }, [ctx.lawSlug, item.key, item.kind]);

  const p = state.data;
  const text = p?.text ? plain(p.text) : "";
  const meta = SECTION_META[item.section] ?? SECTION_META.legislation;
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
  const btn = `inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11.5px] font-bold transition ${isDark ? "border-white/10 text-zinc-200 hover:bg-white/[0.06]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`;

  return (
    <Modal isDark={isDark} label="معاينة النص" onClose={onClose}>
      <div className={`flex items-start gap-2 px-4 py-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <span className={`mt-1 h-5 w-1 flex-shrink-0 rounded-full ${meta.bar}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className={`text-[10.5px] font-bold ${meta.text(isDark)}`}>{meta.title}{item.relation && item.section !== "similar" ? ` · ${item.relation}` : ""}</p>
          <h3 className={`text-[13px] font-black leading-snug ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>{reference}</h3>
          {p?.found && p.kind === "article" && p.title && p.title !== p.num && (
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{p.title}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.status === "loading" && <RefsSkeleton isDark={isDark} />}
        {state.status === "failed" && (
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{state.error || "تعذّر تحميل النص الآن."}</p>
        )}
        {state.status === "done" && p && !p.found && (
          <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>يفتح الرابط المستند كاملاً.</p>
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
            {added || inCart ? <Check size={13} /> : p.locked ? <Lock size={13} /> : <BookmarkSimple size={13} />}
            {added || inCart ? "في المسودة" : "إضافة للمسودة"}
          </button>
        )}
        {p?.found !== false && (
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
