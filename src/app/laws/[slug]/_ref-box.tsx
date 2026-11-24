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
 *      article's own list (?article=) once it has stayed on screen for 600 ms
 *      (scrolling past asks nothing — these requests count toward the
 *      library's public guard), three at a time at most, never twice.
 *   2. Under each article (ArticleRefsInline): a counter chip that folds and
 *      unfolds small cards grouped by the relation's words (إحالة، لائحة،
 *      مقابل ساري، استثناء…), three per group, then «عرض الكل (n)». Nothing
 *      at all when the article has no link.
 *   3. The side box (RefBox, desktop): the same sections and groups for the
 *      article in view; under it LawRefsBox, the links on the whole law (an
 *      owner link whose article could not be pinned — Q132 — and law-to-law
 *      amendment / replacement), from the same answer.
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
 *   7. Owner Q133: «مواد متقاربة في المعنى» is its own section, after the
 *      legal ones (admin switch library_similar_links).
 *   8. Owner Q171 (22 Nov, batch l13): no «رابط آلي» label anywhere — not on
 *      an unreviewed automatic «إحالة» (l12's tag is gone) and not in the
 *      similar-meaning heading (it was «… (ربط آلي)»).
 *   9. File 16 §8: an empty section is hidden — never «لا توجد إحالات».
 *
 * Batch l14 (owner file 07, approved 23 Nov §15) — what changed:
 *   * under the article only the counter: folded, never opened inside the text;
 *     a press opens THE PANEL — the side box showing that article in full on a
 *     wide screen, a bottom sheet on a phone or in reading mode — so the reading
 *     never moves (items 2 and 4 above: the inline cards and «عرض الكل» dialog
 *     are gone; «عرض الكل» opens the panel);
 *   * «الإحالات (N)» in the article's header (ArticleRefsButton), where «أرسل
 *     إلى الصائغ» was — that stays in the draft drawer;
 *   * order: other documents first, «في هذا النظام» last with no extra fold;
 *     the meaning-changing links, then the regulation, then reference,
 *     exception, «مع مراعاة», penalty; the repealed at the end (arrangeSection);
 *   * status: dot + border + worded badge — «معدّلة» amber, «ملغاة» faded with a
 *     faint red, «لائحة» teal (statusLook);
 *   * the panel's quick filters «الكل · لوائح · أحكام · معدِّلة · ملغاة»;
 *   * the server drops the article itself and, among similar items, another
 *     copy of the same law; three similar items at most (_shape.ts).
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  BookBookmark,
  BookmarkSimple,
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
import { cleanPrincipleText } from "@/app/precedents/[slug]/_principle-text";
import {
  LAW_LINKS_ID,
  REF_FILTERS,
  arrangeSection,
  expandLawLinks,
  groupsOfRefs,
  isRegulationRef,
  refMatchesFilter,
  type ArrangedGroup,
  type ArticleRefsOut,
  type LawLinks,
  type RefFilter,
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

// ── One article's full list (?article=): the fallback, and the panel ──

/** Per page view: an article seen twice is fetched once. */
const refsCache = new Map<string, Refs>();
/** Batch l14: the header button and the chip of one article read the same answer — told when it lands. */
let refsVersion = 0;
const refsListeners = new Set<() => void>();
function storeRefs(key: string, data: Refs) {
  refsCache.set(key, data);
  refsVersion++;
  for (const l of refsListeners) l();
}
function subscribeRefs(l: () => void) {
  refsListeners.add(l);
  return () => {
    refsListeners.delete(l);
  };
}
/** The fallback asks at most three articles at a time, and one article once. */
const MAX_PARALLEL = 3;
let running = 0;
const queue: Array<() => void> = [];
const inflight = new Map<string, Promise<Refs>>();
function pump() {
  while (running < MAX_PARALLEL && queue.length > 0) {
    running++;
    queue.shift()!();
  }
}
function fetchArticleRefs(lawSlug: string, articleId: string): Promise<Refs> {
  const id = `${lawSlug}|${articleId}`;
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = new Promise<Refs>((resolve, reject) => {
    queue.push(() => {
      fetch(`/api/library/laws/${apiSlug(lawSlug)}/citations?article=${encodeURIComponent(articleId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Refs) => resolve(d))
        .catch(reject)
        .finally(() => {
          running--;
          inflight.delete(id);
          pump();
        });
    });
    pump();
  });
  inflight.set(id, p);
  return p;
}

/** `more`: the three per group of the law's answer are shown while the article's full list comes. */
type LoadState = { status: "idle" | "loading" | "done" | "failed"; data?: Refs; more?: boolean };

/**
 * The links of one article. From the law's bulk answer when it is there (no
 * request of its own); else, or when `full` asks for more than three per
 * group, from ?article= — once `enabled` (the inline list waits until the
 * article comes near the screen; the header button never asks) and after
 * `delayMs` (the side box waits for the scroll to settle).
 */
export function useArticleRefs(
  lawSlug: string,
  articleId: string | null,
  { delayMs = 0, full = false, enabled = true }: { delayMs?: number; full?: boolean; enabled?: boolean } = {},
): LoadState {
  const bulk = useBulk(lawSlug);
  useSyncExternalStore(subscribeRefs, () => refsVersion, () => 0);
  const fromBulk = useMemo<Refs | null>(() => {
    if (!articleId || bulk?.status !== "done") return null;
    return { available: true, ...expandLawLinks(bulk.data, articleId) };
  }, [bulk, articleId]);
  // The bulk answer is enough, unless the panel needs more than it holds.
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
          storeRefs(key, data);
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
  // The panel shows the three per group at once while the rest comes.
  if (fromBulk) return { status: "done", data: fromBulk, more: wantFetch && !(settled.key === key && settled.failed) };
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
  /** Reading mode hides the side column: the panel opens as a sheet. */
  inlineTrigger: boolean;
  showPaywall: () => void;
  /** «إضافة للمسودة» for an article of THIS law: the page's own add (same cart entry as its button). */
  addSameLawArticle: (articleId: string) => boolean;
  addEntry: (entry: CartEntry) => void;
  isInCart: (id: string) => boolean;
  /** Short label of an article on this page («المادة الخامسة»), for the box header. */
  articleLabel: (articleId: string) => string;
}

/**
 * Batch l14 (owner file 07 §6): the article whose links are open — in the side
 * column on a wide screen («side»: the side box shows it in full), else in a
 * bottom sheet («sheet»: a phone, a tablet, reading mode).
 */
export type RefPanel = { articleId: string; mode: "side" | "sheet" };

interface RefBoxContextValue extends RefBoxPageContext {
  panel: RefPanel | null;
  openPanel: (articleId: string) => void;
  closePanel: () => void;
  openPreview: (item: RefItem) => void;
}

const RefBoxContext = createContext<RefBoxContextValue | null>(null);

export function useRefBox(): RefBoxContextValue | null {
  return useContext(RefBoxContext);
}

/** The side column is drawn (page.tsx: `hidden lg:block`, not in reading mode). */
function sideColumnShown(inlineTrigger: boolean): boolean {
  if (inlineTrigger || typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function RefBoxProvider({ value, children }: { value: RefBoxPageContext | null; children: ReactNode }) {
  const [panel, setPanel] = useState<RefPanel | null>(null);
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
            panel,
            openPanel: (articleId) => setPanel({ articleId, mode: sideColumnShown(value.inlineTrigger) ? "side" : "sheet" }),
            closePanel: () => setPanel(null),
            openPreview: (item) => setPreview(item),
          }
        : null,
    [value, panel],
  );
  return (
    <RefBoxContext.Provider value={ctx}>
      {children}
      {ctx && panel?.mode === "sheet" && <RefPanelSheet ctx={ctx} articleId={panel.articleId} onClose={() => setPanel(null)} />}
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
  // Owner Q133: its own heading, after the legal sections (Q171: no «(ربط آلي)» label).
  similar: {
    title: "مواد متقاربة في المعنى",
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

// ─── Sections and groups (side box, panel) ───────────────────────────────────

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

/** The panel's quick filters (file 07 §6.4). */
const FILTER_LABELS: Record<RefFilter, string> = {
  all: "الكل",
  regulation: "لوائح",
  judicial: "أحكام",
  amending: "معدِّلة",
  repealed: "ملغاة",
};

/**
 * The sections of one article (batch l14, owner file 07 §4–§6, approved 23 Nov
 * §15): in each, the items of OTHER documents first, by relation, the repealed
 * at the end; then «في هذا النظام» — this law's own — with no extra fold. At
 * most `max` cards per relation (the side box while reading), then «عرض الكل
 * (n)», which opens the panel. `filter` (the panel) keeps matching items only.
 */
function RefGroups({
  ctx,
  articleId,
  data,
  max,
  filter = "all",
}: {
  ctx: RefBoxContextValue;
  articleId: string;
  data: Extract<Refs, { available: true }>;
  max: number;
  filter?: RefFilter;
}) {
  const { isDark } = ctx;
  const byKey = new Map<string, RefItem>();
  for (const s of SECTIONS) for (const it of data.sections[s]?.items ?? []) byKey.set(`${s}|${it.linkType}|${it.direction}|${it.key}`, it);
  const itemOf = (g: RefGroupOut, k: string): RefItem | undefined => {
    const it = byKey.get(`${g.section}|${g.linkType}|${g.direction}|${k}`) ?? data.sections[g.section]?.items.find((x) => x.key === k);
    if (!it) return undefined;
    const full = { ...it, relation: g.relation, linkType: g.linkType, direction: g.direction };
    return refMatchesFilter(full, filter) ? full : undefined;
  };
  const groups = groupsOf(data);
  const rendered = visibleSections(data)
    .map((s) => ({ s, parts: arrangeSection(groups.filter((g) => g.section === s), itemOf, ctx.lawSlug) }))
    .filter(({ parts }) => parts.outside.length + parts.inside.length > 0);
  if (rendered.length === 0) {
    return <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>لا شيء في هذا التصنيف.</p>;
  }
  const runs = (s: Section, list: ArrangedGroup[], locked: boolean) =>
    list.map(({ group: g, keys }, i) => {
      const prev = list[i - 1]?.group;
      const heading = s !== "similar" && !(prev && prev.linkType === g.linkType && prev.direction === g.direction);
      return (
        <div key={`${g.linkType}|${g.direction}|${i}`}>
          {heading && (
            <p className={`mb-1 text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {g.relation} <span className="font-normal">({arDigits(g.total)})</span>
            </p>
          )}
          <ul className="space-y-1">
            {keys.slice(0, max).map((k) => {
              const it = itemOf(g, k);
              return it ? (
                <li key={k}>
                  <ItemButton ctx={ctx} item={it} locked={locked} />
                </li>
              ) : null;
            })}
          </ul>
        </div>
      );
    });
  return (
    <div className="space-y-3">
      {rendered.map(({ s, parts }, i) => {
        const meta = SECTION_META[s];
        const Icon = meta.icon;
        const sec = data.sections[s];
        const locked = SUBSCRIBER_SECTIONS.has(s) && ctx.viewerHasFullAccess === false;
        const shown = [...parts.outside, ...parts.inside].reduce((n, r) => n + Math.min(max, r.keys.length), 0);
        return (
          <section key={s} aria-label={meta.title} className={i > 0 ? `pt-3 border-t ${isDark ? "border-white/[0.08]" : "border-slate-200"}` : ""}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`h-4 w-1 rounded-full ${meta.bar}`} aria-hidden />
              <Icon size={13} weight="fill" className={meta.text(isDark)} />
              <h4 className={`flex-1 text-[11px] font-black ${meta.text(isDark)}`}>{meta.title}</h4>
              <span className={`rounded-md px-1.5 text-[10px] font-bold ${meta.chip(isDark)}`}>{arDigits(sec.total)}</span>
            </div>
            <div className="space-y-2">
              {runs(s, parts.outside, locked)}
              {parts.inside.length > 0 && (
                <div className={parts.outside.length > 0 ? `pt-2 border-t border-dashed ${isDark ? "border-white/[0.08]" : "border-slate-200"}` : ""}>
                  <p className={`mb-1 text-[10px] font-black ${isDark ? "text-zinc-300" : "text-slate-600"}`}>في هذا النظام</p>
                  <div className="space-y-2">{runs(s, parts.inside, locked)}</div>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {filter === "all" && Number.isFinite(max) && sec.total > shown && (
                <button
                  type="button"
                  onClick={() => ctx.openPanel(articleId)}
                  className={`min-h-[44px] sm:min-h-0 text-[10.5px] font-bold underline-offset-2 hover:underline ${meta.text(isDark)}`}
                >
                  عرض الكل ({arDigits(sec.total)})
                </button>
              )}
              {!Number.isFinite(max) && filter === "all" && sec.total > shown && (
                <span className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>يُعرض أول {arDigits(shown)} من {arDigits(sec.total)}.</span>
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

/**
 * Owner file 07 §5 (approved 23 Nov): the status is a dot, a border and a
 * WORDED badge — never colour alone. In force: a small green dot. Amended:
 * amber, «معدّلة». Repealed: faded with a faint red, «ملغاة» (listed last).
 * A regulation: its own teal and «لائحة».
 */
function statusLook(item: RefItem, isDark: boolean) {
  // A link whose article could not be pinned carries no status: it names and opens its document (Q132).
  const pill = item.anchorMissing ? null : pillOf(item);
  const tone = pill?.tone ?? null;
  const regulation = isRegulationRef(item);
  const card =
    tone === "repealed"
      ? isDark
        ? "border-red-500/20 bg-red-950/20 text-zinc-400 opacity-80"
        : "border-red-200/70 bg-red-50/50 text-slate-500 opacity-80"
      : tone === "amended"
        ? isDark
          ? "border-amber-500/30 bg-zinc-900 text-zinc-200"
          : "border-amber-300 bg-white text-slate-700"
        : regulation
          ? isDark
            ? "border-teal-500/30 bg-zinc-900 text-zinc-200"
            : "border-teal-300 bg-white text-slate-700"
          : isDark
            ? "border-white/[0.07] bg-zinc-900 text-zinc-200"
            : "border-slate-200 bg-white text-slate-700";
  const dot = tone === "active" ? "bg-emerald-500" : tone === "amended" ? "bg-amber-500" : tone === "repealed" ? "bg-red-400" : tone === "unknown" ? "bg-slate-400" : null;
  const badges: Array<{ label: string; cls: string }> = [];
  if (pill && tone !== "active") {
    badges.push({
      label: pill.labelAr,
      cls:
        tone === "repealed"
          ? isDark ? "bg-red-500/15 text-red-300" : "bg-red-100 text-red-700"
          : tone === "amended"
            ? isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-800"
            : isDark ? "bg-zinc-700/50 text-zinc-300" : "bg-slate-100 text-slate-600",
    });
  }
  if (regulation) badges.push({ label: "لائحة", cls: isDark ? "bg-teal-500/15 text-teal-300" : "bg-teal-50 text-teal-700" });
  return { pill, card, dot, badges };
}

function ItemButton({ ctx, item, locked }: { ctx: RefBoxContextValue; item: RefItem; locked: boolean }) {
  const { isDark } = ctx;
  const { pill, card, dot, badges } = statusLook(item, isDark);
  const cls = `block w-full text-start rounded-lg border px-2 py-1.5 text-[11px] leading-snug transition hover:border-slate-400/60 ${card}`;
  const body = (
    <>
      <span className="flex items-start gap-1.5">
        {pill && dot && <span role="img" aria-label={pill.labelAr} title={pill.labelAr} className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />}
        {locked && <Lock size={11} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`} aria-label="للمشتركين" />}
        <span className="line-clamp-2 flex-1 font-semibold">{item.title}</span>
      </span>
      {(item.relation || badges.length > 0) && (
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {badges.map((b) => (
            <span key={b.label} className={`rounded px-1 text-[9.5px] font-bold ${b.cls}`}>{b.label}</span>
          ))}
          {item.relation && <span className={`text-[9.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{item.relation}</span>}
        </span>
      )}
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

// ─── Under each article, and in its header ───────────────────────────────────

/**
 * Owner file 07 §6.1–2 (batch l14, approved 23 Nov): under the article only the
 * counter — folded, nothing opens inside the text. A press opens the article's
 * links in the side column (wide screen) or a bottom sheet (phone, reading
 * mode), so the reading never moves. Nothing at all while loading or when the
 * article has no link (no spinner under hundreds of articles).
 */
export function ArticleRefsInline({ articleId }: { articleId: string }) {
  const ctx = useRefBox();
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const bulk = useBulk(ctx?.lawSlug ?? "");
  const needsNear = !!ctx && (bulk?.status === "unavailable" || bulk?.status === "failed");
  // Fallback only: ask for this article's list while it is on screen (and
  // after 600 ms there), so scrolling through a long law asks nothing.
  useEffect(() => {
    if (!needsNear || !box.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)));
    io.observe(box.current);
    return () => io.disconnect();
  }, [needsNear]);
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx ? articleId : null, { enabled: near, delayMs: 600 });
  const total = linkCount(state);
  if (!ctx) return null;
  const { isDark } = ctx;
  const data = state.data;
  const open = ctx.panel?.articleId === articleId;
  return (
    <div ref={box} className="mt-3 print:hidden">
      {total > 0 && data && data.available && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => ctx.openPanel(articleId)}
          className={`inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${open ? "border-[#C8A762]/60" : isDark ? "border-white/[0.08]" : "border-slate-200"} ${isDark ? "text-zinc-300" : "text-slate-600"}`}
        >
          <LinkSimple size={12} className="text-[#C8A762]" /> الإحالات المرتبطة
          <span className={`rounded-md px-1.5 text-[10px] ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>{arDigits(total)}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Owner file 07 §6.3 / §7 (batch l14): «الإحالات (N)» in the article's header,
 * where «أرسل إلى الصائغ» was (sending to the drafter stays in the draft
 * drawer). For everyone; hidden when the article has no link. It never asks
 * the server itself: the count comes from the law's one answer (or an answer
 * already fetched) — a header per article must not send a request per article.
 */
export function ArticleRefsButton({ articleId }: { articleId: string }) {
  const ctx = useRefBox();
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx ? articleId : null, { enabled: false });
  const total = linkCount(state);
  if (!ctx || total === 0) return null;
  const { isDark } = ctx;
  const open = ctx.panel?.articleId === articleId;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => ctx.openPanel(articleId)}
      className={`inline-flex min-h-11 sm:min-h-0 items-center gap-1 px-1 text-[11.5px] font-semibold flex-shrink-0 ${isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-[#0B3D2E]"}`}
    >
      <LinkSimple size={12} className="text-[#C8A762]" /> الإحالات ({arDigits(total)})
    </button>
  );
}

// ─── The panel: the side column (wide screen) or a bottom sheet ──────────────

/**
 * One article's links in full (batch l14, owner file 07 §6.4): the quick
 * filters «الكل · لوائح · أحكام · معدِّلة · ملغاة» (each only when it has
 * something), then every section with no cap per relation. Asks for the
 * article's full list once — the panel was opened by a press.
 */
function RefPanelBody({ ctx, articleId }: { ctx: RefBoxContextValue; articleId: string }) {
  const state = useArticleRefs(ctx.lawSlug, articleId, { full: true });
  const [filter, setFilter] = useState<RefFilter>("all");
  const { isDark } = ctx;
  const data = state.status === "done" && state.data && state.data.available ? state.data : null;
  const all = data ? visibleSections(data).flatMap((s) => data.sections[s].items) : [];
  const filters = REF_FILTERS.filter((f) => f === "all" || all.some((it) => refMatchesFilter(it, f)));
  const picked = filters.includes(filter) ? filter : "all";
  if (state.status === "loading" || state.status === "idle") return <RefsSkeleton isDark={isDark} />;
  if (state.status === "failed" || !data) return <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>تعذّر تحميل الإحالات الآن.</p>;
  if (!data.found || all.length === 0) return <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>لا إحالات مسجّلة لهذه المادة بعد.</p>;
  return (
    <div className="space-y-3">
      {filters.length > 1 && (
        <div role="tablist" aria-label="تصنيف الإحالات" className="flex flex-wrap gap-1">
          {filters.map((f) => {
            const active = f === picked;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold transition ${
                  active
                    ? "border-[#0B3D2E] bg-[#0B3D2E] text-white"
                    : isDark
                      ? "border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            );
          })}
        </div>
      )}
      <RefGroups ctx={ctx} articleId={articleId} data={data} max={Number.POSITIVE_INFINITY} filter={picked} />
      {state.more && <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>جارٍ تحميل البقية…</p>}
    </div>
  );
}

function panelTitle(ctx: RefBoxContextValue, articleId: string): { title: string; label: string } {
  return articleId === LAW_LINKS_ID ? { title: "روابط النظام كله", label: "" } : { title: "الإحالات المرتبطة", label: ctx.articleLabel(articleId) };
}

/**
 * The box beside the article in view, from the same cache as the counter under
 * it (compact: two cards per relation). When an article's links are opened on
 * a wide screen it shows THAT article in full (the panel) until it is closed
 * or the reading moves to another article. In the fallback it waits 350 ms
 * after the article changes, so scrolling past fetches nothing. Hidden once the
 * answer says the article has no link (file 16 §8); while loading it keeps a
 * skeleton frame, so the cards under it in the sticky column do not jump.
 */
export function RefBox({ articleId }: { articleId: string | null }) {
  const ctx = useRefBox();
  const pinned = ctx?.panel?.mode === "side" ? ctx.panel.articleId : null;
  const state = useArticleRefs(ctx?.lawSlug ?? "", ctx && !pinned ? articleId : null, { delayMs: 350 });
  const frame = useRef<HTMLDivElement>(null);
  const pinAt = useRef<{ pin: string; active: string | null } | null>(null);
  const closePanel = ctx?.closePanel;
  // The panel follows the reading again once the reader moves to another article.
  useEffect(() => {
    if (!pinned) {
      pinAt.current = null;
      return;
    }
    const at = pinAt.current;
    if (!at || at.pin !== pinned) {
      pinAt.current = { pin: pinned, active: articleId };
      frame.current?.closest("aside")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (articleId === pinned) at.active = pinned;
    else if (articleId !== at.active) closePanel?.();
  }, [pinned, articleId, closePanel]);
  if (!ctx) return null;
  const { isDark } = ctx;
  const shell = `p-3.5 rounded-2xl border print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  if (pinned) {
    const { title, label } = panelTitle(ctx, pinned);
    return (
      <div ref={frame} role="region" aria-label={title} className={`${shell} ring-2 ring-[#C8A762]/40`}>
        <h3 className={`mb-2.5 flex items-center gap-1.5 text-xs font-black ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          <LinkSimple size={14} className="text-[#C8A762]" />
          <span className="flex-1">{title}</span>
          {label && <span className={`truncate max-w-[40%] text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{label}</span>}
          <button type="button" onClick={ctx.closePanel} aria-label="إغلاق" className={`flex h-7 w-7 items-center justify-center rounded-lg ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
            <X size={13} weight="bold" />
          </button>
        </h3>
        <RefPanelBody ctx={ctx} articleId={pinned} />
      </div>
    );
  }
  if (!articleId) return null;
  if ((state.status === "done" || state.status === "idle") && shownSections(state).length === 0) return null;
  const data = state.data;
  return (
    <div ref={frame} className={shell}>
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

/**
 * Q132 (batch l12): the links on the whole law — an owner link whose article
 * could not be pinned opens the law, so it is listed here, with the law's own
 * amendment / replacement links. From the bulk answer only; nothing when the
 * law has none (or before 20261202_30).
 */
export function LawRefsBox() {
  const ctx = useRefBox();
  const bulk = useBulk(ctx?.lawSlug ?? "");
  const data = useMemo<Refs | null>(
    () => (bulk?.status === "done" ? { available: true, ...expandLawLinks(bulk.data, LAW_LINKS_ID) } : null),
    [bulk],
  );
  if (!ctx || !data || !data.available || !data.found) return null;
  if (ctx.panel?.mode === "side" && ctx.panel.articleId === LAW_LINKS_ID) return null;
  const { isDark } = ctx;
  return (
    <div className={`p-3.5 rounded-2xl border print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
      <h3 className={`mb-2.5 flex items-center gap-1.5 text-xs font-black ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
        <LinkSimple size={14} className="text-[#C8A762]" />
        <span className="flex-1">روابط النظام كله</span>
      </h3>
      <RefGroups ctx={ctx} articleId={LAW_LINKS_ID} data={data} max={2} />
    </div>
  );
}

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

/** The panel as a bottom sheet (phone, tablet, reading mode — owner file 07 §6.2). */
function RefPanelSheet({ ctx, articleId, onClose }: { ctx: RefBoxContextValue; articleId: string; onClose: () => void }) {
  const { isDark } = ctx;
  const { title, label } = panelTitle(ctx, articleId);
  return (
    <Modal isDark={isDark} label={title} onClose={onClose} wide>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
          {title} <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{label}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
          <X size={18} weight="bold" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <RefPanelBody ctx={ctx} articleId={articleId} />
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
  // lib05 / L9-d (lib-a): a principle drops the first line that only repeats its
  // number and keeps its heading on a line of its own (cleanPrincipleText).
  const text = p?.text ? (item.kind === "principle" ? cleanPrincipleText(p.text, p.num) : plain(p.text)) : "";
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
