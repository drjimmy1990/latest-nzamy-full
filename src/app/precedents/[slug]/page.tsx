"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scales, Check, Copy, FileText, Lock, Stack, ArrowRight,
  Plus, Minus, BookOpen, Bookmark
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import PrincipleBlock from "./_principle-block";
import IdentityPanel from "./_identity-panel";
import VolumeSelector from "./_volume-selector";
import ScopedSearchPanel from "@/components/library/ScopedSearchPanel";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import { cleanPrincipleText, cleanTextOfRef, isReferenceText, principleHighlightTexts } from "./_principle-text";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import { HighlightProvider, SearchLegendBar } from "@/components/search/MultiColorHighlight";
import { stepPrincipleIndex } from "@/components/search/highlightScope";
import { countTermMatches, parseHighlightQuery, withSearchQuery } from "@/lib/search/multiColorSearch";
import { readerArrival, withoutSearchQuery } from "@/lib/search/readerArrival";
import { legacyTarget } from "@/lib/library/legacyLibrarySlugs";
import { collectionNotice, type ReaderNotice } from "@/lib/library/readerNotice";
import type { ScopedHit } from "@/app/api/library/scoped-search/scopedSearch";

// ─── Global Features ─────────────────────────────────────────────────────────
import { useDraftCart } from "@/hooks/useDraftCart";
import { DraftDrawer } from "@/components/laws/DraftDrawer";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import { getLawMeta } from "@/app/laws/law-metadata-map";


function getSelectedTextWithin(containerId: string): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const selectedText = selection.toString().trim();
  if (!selectedText) return "";
  const container = document.getElementById(containerId);
  if (!container) return "";
  const range = selection.getRangeAt(0);
  if (container.contains(range.commonAncestorContainer)) {
    return selectedText;
  }
  return "";
}

// ─── Interfaces ─────────────────────────────────────────────────────────────
import { JudicialPrinciplesSystem, JudicialPrincipleItem } from "@/app/laws/data";
import { apiSlug } from '@/utils/apiSlug';
import { principleHref } from "@/app/laws/principleLink";
import {
  appendRun, normalizePrinciple, prependRun, runHasMore, runNextOffset, runPrevWindow,
  type CollectionRun,
} from "./_collection-model";

/**
 * q390: principles per window — the API's cap (PRINCIPLES_MAX_LIMIT). The
 * reader holds a RUN of windows around where it opened; it never walks the
 * whole collection (in-reader search is the server's ScopedSearchPanel).
 */
const WINDOW_LIMIT = 50;
type WindowResult = "more" | "done" | "error";

const EMPTY_RUN: CollectionRun = { start: 0, items: [] };

/** The `?target=` window: the one 50-principle window that holds that principle. */
const targetWindowUrl = (slug: string, target: string) =>
  `/api/library/precedents/${apiSlug(slug)}?limit=${WINDOW_LIMIT}&target=${encodeURIComponent(target)}`;

/** The run a window answer describes: it starts at the offset the server actually served. */
function runFromWindow(body: Record<string, unknown> | null): { run: CollectionRun; total: number | null; lastHasMore: boolean } {
  const pagination = (body?.pagination ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(body?.principles) ? (body.principles as Record<string, unknown>[]) : [])
    .map((p) => normalizePrinciple(p));
  const offset = pagination?.offset;
  const start = typeof offset === "number" && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const total = typeof body?.total === "number" ? body.total : null;
  return { run: { start, items }, total, lastHasMore: Boolean(pagination?.hasMore) };
}

export default function JudicialPrinciplesPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { isDark, isRTL } = useTheme();

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [collection, setCollection] = useState<JudicialPrinciplesSystem | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * q390: what the reader says when the server has no text for it — a load
   * error, not found, «قريباً» (a legacy catalogue slug) or text pending.
   * There is no bundled fallback any more.
   */
  const [notice, setNotice] = useState<ReaderNotice | null>(null);

  // Windowed loading. A collection holds up to 2,323 principles, above the
  // database's 1,000-row cap, so the API serves 50-row windows. The page holds
  // a contiguous RUN: it opens at the first window (or at a target's window)
  // and grows forward as the reader scrolls, backward on «عرض ما قبل هذا الموضع».
  const [totalPrinciples, setTotalPrinciples] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [runStart, setRunStart] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [beforeError, setBeforeError] = useState<string | null>(null);
  const runRef = useRef<CollectionRun>(EMPTY_RUN);
  const totalRef = useRef<number | null>(null);
  const pendingRef = useRef<Promise<WindowResult> | null>(null);
  const beforePendingRef = useRef<Promise<void> | null>(null);
  /** Bumped whenever the run is replaced (a new collection, a jump): answers for the old run are dropped. */
  const runGeneration = useRef(0);
  /** A target the server said is not in this collection: never asked for again. */
  const missingTargetRef = useRef<string>("");
  /** «عرض ما قبل»: keep the principle that was first on screen where it was once a window lands above it. */
  const prependAnchor = useRef<{ id: string; top: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reader states
  const [activePrincipleId, setActivePrincipleId] = useState<string>("");
  const [copiedPrincipleId, setCopiedPrincipleId] = useState<string>("");
  // Owner note ٠٦: the search a link brought here (?q=). It only COLOURS the
  // principles — it never filters them, so the target keeps its context
  // (note ١٢: binding ?q= to a filter box hid the target principle).
  const [urlQuery, setUrlQuery] = useState("");
  const [fontSize, setFontSize] = useState<"normal"|"large"|"xlarge">("normal"); // حجم الخط
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);

  const activePrinciple = useMemo(() => {
    return collection?.principles.find(p => p.id === activePrincipleId) || null;
  }, [collection, activePrincipleId]);

  const handleCopyCitation = () => {
    if (!activePrinciple) return;
    const refText = getReferenceForPrinciple(activePrinciple);
    navigator.clipboard.writeText(refText);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  // Helper functions for citation extraction and normalization
  // Court/issuing body for display AND for the generated citation.
  //
  // The PER-RECORD issuing body wins over the collection's. The collection is a
  // grouping, so its court is necessarily the less specific of the two — and
  // until recently every standalone ruling was attached to a single collection
  // hardcoded as "المحكمة التجارية", which meant Supreme Court, labour and
  // committee decisions were all displayed and cited as Commercial Court
  // rulings. Preferring the record's own issuing body makes that class of error
  // impossible regardless of how collections are grouped.
  //
  // The collection TITLE is deliberately no longer used as a court fallback: a
  // title such as "مجموعة الأحكام القضائية لعام 1434هـ" is a publication, not
  // an issuing authority, and citing it as one is a fabricated attribution.
  const getCourtOrIssuer = useCallback((p: JudicialPrincipleItem | null) => {
    if (p?.issuing_body && p.issuing_body !== "جهة غير محددة") return p.issuing_body;
    if (collection?.court && collection.court !== "جهة غير محددة") return collection.court;
    return isRTL ? "جهة غير محددة" : "Unspecified Authority";
  }, [collection, isRTL]);

  /** True when a real issuing body was found, rather than the fallback label. */
  const isCourtKnown = (p: JudicialPrincipleItem | null) =>
    Boolean(
      (p?.issuing_body && p.issuing_body !== "جهة غير محددة") ||
        (collection?.court && collection.court !== "جهة غير محددة"),
    );

  // Stable (useCallback): the legend's per-principle counts read it too (M-4).
  const getReferenceForPrinciple = useCallback((p: JudicialPrincipleItem) => {
    if (!p) return "";
    // Found on the raw text («**المرجع:**»), returned without the marks.
    const refPara = p.paragraphs?.find(para => isReferenceText(para.text));
    if (refPara) return cleanPrincipleText(refPara.text);
    const refLine = p.text?.split("\n").find(line => isReferenceText(line));
    if (refLine) return cleanPrincipleText(refLine);
    if (p.reference) return cleanPrincipleText(p.reference);
    const court = getCourtOrIssuer(p);
    return `${isRTL ? "مبدأ رقم" : "Principle #"} (${p.number})، صادر عن (${court})${p.decision_number ? ` ذي الرقم (${p.decision_number})` : ""}${p.session_date ? ` بتاريخ ${p.session_date}` : ""}${collection?.title ? ` - المنشور في (${collection.title})` : ""}${collection?.part ? `، الجزء (${collection.part})` : ""}`;
  }, [collection, getCourtOrIssuer, isRTL]);

  // Global cart states
  const { cart, setCart } = useDraftCart();
  const [showCart, setShowCart] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const isScrolling = useRef(false);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Intersection Observer: update activePrincipleId on scroll
  useEffect(() => {
    if (!collection) return;
    const ids = collection.principles.map(p => p.id);
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrolling.current) {
            setActivePrincipleId(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, [collection]);

  const cartMap = new Map(cart.map(e => [e.articleId, e]));

  const getOrCreateEntry = (p: JudicialPrincipleItem) => {
    const mainParas = p.paragraphs?.filter(para => !isReferenceText(para.text)) || [];
    const mainText = cleanPrincipleText(mainParas.length > 0 ? mainParas.map(para => para.text).join("\n") : cleanTextOfRef(p.text));
    const refText = getReferenceForPrinciple(p);
    return {
      articleId: p.id,
      articleNum: `${isRTL ? "مبدأ رقم" : "Principle #"} ${p.number}`,
      articleTitle: p.classification_keywords.slice(0, 3).join(" / ") || (mainText.slice(0, 45) + (mainText.length > 45 ? "..." : "")),
      articleText: refText ? `${mainText}\n\nالمرجع: ${refText}` : mainText,
      // The per-record issuing body, not the collection's — a principle carried
      // into the draft cart must cite the court that actually issued it.
      lawName: getCourtOrIssuer(p),
      lawSlug: collection?.id ?? slug,
      isArticleAdded: true,
      isExecRegAdded: false,
      principles: [],
      precedents: [],
    };
  };

  const addPrincipleToCart = (p: JudicialPrincipleItem) => {
    setCart(prev => prev.find(e => e.articleId === p.id) ? prev : [...prev, getOrCreateEntry(p)]);
  };

  const removePrincipleFromCart = (id: string) => setCart(prev => prev.filter(e => e.articleId !== id));

  const clearAll = () => setCart([]);
  // N2.6: a principle found by the in-document search, keyed by its own id
  // (the entry addPrincipleToCart builds for the same principle).
  const addScopedEntry = (entry: CartEntry) =>
    setCart(prev => prev.find(e => e.articleId === entry.articleId) ? prev : [...prev, entry]);
  const removeArticle = (id: string) => setCart(prev => prev.filter(e => e.articleId !== id));


  // Copy DRAFT helper (Word Rich Text)
  const handleCopyDraft = async () => {
    if (cart.length === 0) return;
    const base = (name: string) => name.replace(/\s*ولوائحه التنفيذية.*/, "").trim();
    const plainParts = cart.map(e => {
      const parts: string[] = [];
      if (e.isArticleAdded) {
        const bn = base(e.lawName);
        parts.push(`${e.articleNum} من (${bn}):\n"${e.articleText}"`);
        if (e.execReg) parts.push(`${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):\n"${e.execReg.text}"`);
      }
      return parts.join("\n\n");
    }).filter(Boolean).join("\n\n" + "═".repeat(40) + "\n\n");
    const htmlParts = cart.map(e => {
      const parts: string[] = [];
      if (e.isArticleAdded) {
        const bn = base(e.lawName);
        parts.push(`<b>${e.articleNum} من (${bn}):</b><br>“${e.articleText.replace(/\n/g, "<br>")}”`);
        if (e.execReg) parts.push(`<b>${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):</b><br>“${e.execReg.text.replace(/\n/g, "<br>")}”`);
      }
      return parts.join("<br><br>");
    }).filter(Boolean).join(`<br><br>${"═".repeat(40)}<br><br>`);
    try {
      const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${htmlParts}</p></body></html>`;
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([full], { type: "text/html" }), "text/plain": new Blob([plainParts], { type: "text/plain" }) }),
      ]);
    } catch { navigator.clipboard.writeText(plainParts); }
    setCopiedDraft(true); setTimeout(() => setCopiedDraft(false), 2000);
  };

  /** Hold `next` as the run: the list renders its items. */
  const commitRun = useCallback((next: CollectionRun) => {
    runRef.current = next;
    setRunStart(next.start);
    setCollection((prev) => (prev ? { ...prev, principles: next.items } : prev));
  }, []);

  // q390: the collection comes from the database only — no bundled fallback.
  useEffect(() => {
    let cancelled = false;
    async function loadCollectionData() {
      // A legacy catalogue slug whose collection is loaded under its own id:
      // go there before any fetch, so the reading quota is never spent twice.
      const legacy = legacyTarget("collection", slug);
      if (legacy?.dbId) {
        router.replace(`/precedents/${apiSlug(legacy.dbId)}${window.location.search}${window.location.hash}`);
        return;
      }
      setLoading(true);
      setNotice(null);
      setMoreError(null);
      setBeforeError(null);
      setCollection(null);
      runGeneration.current += 1;
      runRef.current = EMPTY_RUN;
      totalRef.current = null;
      pendingRef.current = null;
      beforePendingRef.current = null;
      missingTargetRef.current = "";
      setRunStart(0);
      setTotalPrinciples(null);
      setHasMore(false);
      // Arriving at a principle (#<id> or ?target=<id>): open at ITS window,
      // one request — never page from the start until it turns up.
      const arrival = readerArrival(window.location.search, window.location.hash);
      // apiSlug() decodes then encodes once, so a pre-encoded slug isn't
      // double-encoded into %25…, which would 404 the lookup.
      const url = arrival.target
        ? targetWindowUrl(slug, arrival.target)
        : `/api/library/precedents/${apiSlug(slug)}?offset=0&limit=${WINDOW_LIMIT}`;
      let status: number | null = null;
      let body: Record<string, unknown> | null = null;
      let failure: string | null = null;
      try {
        const res = await fetch(url);
        status = res.status;
        body = await res.json().catch(() => null);
      } catch {
        failure = "تعذّر تحميل المجموعة، تحقّق من الاتصال";
      }
      if (cancelled) return;
      if (status !== null && status >= 200 && status < 300 && body) {
        const { run, total, lastHasMore } = runFromWindow(body);
        if (arrival.target && body.targetFound !== true) missingTargetRef.current = arrival.target;
        runRef.current = run;
        totalRef.current = total;
        setRunStart(run.start);
        setTotalPrinciples(total);
        setHasMore(run.items.length > 0 && runHasMore(run, total, lastHasMore));
        setCollection({ ...(body as unknown as JudicialPrinciplesSystem), principles: run.items });
        // A collection with no text yet («قيد الإضافة»), shown inside the page.
        setNotice(collectionNotice({ status: 200, slug, total, error: null }));
        if (run.items[0]) setActivePrincipleId(run.items[0].id);
        setLoading(false);
        return;
      }
      const error = typeof body?.error === "string" ? body.error : failure;
      // 404 → «قريباً» (legacy slug) or not found; 5xx → load error. Any other
      // refusal (quota, lock) still says something: never a blank page.
      setNotice(
        collectionNotice({ status, slug, total: null, error }) ?? {
          kind: "load_error",
          titleAr: "تعذّر تحميل المجموعة",
          bodyAr: error ?? "تعذّر تحميل المجموعة، حاول مجدداً",
        },
      );
      setLoading(false);
    }
    loadCollectionData();
    return () => { cancelled = true; };
  }, [slug, router]);

  /**
   * Append the window after the run. Concurrent callers share the in-flight
   * request, so the scroll sentinel and the button never fetch the same offset twice.
   */
  const loadMore = useCallback((): Promise<WindowResult> => {
    if (pendingRef.current) return pendingRef.current;
    const generation = runGeneration.current;
    const request = (async (): Promise<WindowResult> => {
      if (!runHasMore(runRef.current, totalRef.current, true)) return "done";
      setLoadingMore(true);
      setMoreError(null);
      try {
        const res = await fetch(
          `/api/library/precedents/${apiSlug(slug)}?offset=${runNextOffset(runRef.current)}&limit=${WINDOW_LIMIT}`,
        );
        const body = await res.json().catch(() => null);
        if (generation !== runGeneration.current) return "done";
        if (!res.ok || !body) {
          setMoreError(typeof body?.error === "string" ? body.error : "تعذّر تحميل المزيد من المبادئ");
          return "error";
        }
        const { run: win, total, lastHasMore } = runFromWindow(body);
        const before = runRef.current;
        const next = appendRun(before, win.items);
        commitRun(next);
        if (total !== null) totalRef.current = total;
        setTotalPrinciples(totalRef.current);
        // No progress means the server has nothing past what we hold, whatever
        // the count says — stop rather than request the same offset forever.
        const more = next.items.length > before.items.length && runHasMore(next, totalRef.current, lastHasMore);
        setHasMore(more);
        return more ? "more" : "done";
      } catch {
        if (generation === runGeneration.current) setMoreError("تعذّر تحميل المزيد من المبادئ، تحقّق من الاتصال");
        return "error";
      } finally {
        if (generation === runGeneration.current) setLoadingMore(false);
      }
    })();
    pendingRef.current = request;
    request.finally(() => {
      if (pendingRef.current === request) pendingRef.current = null;
    });
    return request;
  }, [slug, commitRun]);

  /** «عرض ما قبل هذا الموضع»: prepend the window just before the run (one request). */
  const loadBefore = useCallback((): Promise<void> => {
    if (beforePendingRef.current) return beforePendingRef.current;
    const prev = runPrevWindow(runRef.current, WINDOW_LIMIT);
    if (!prev) return Promise.resolve();
    const generation = runGeneration.current;
    const request = (async () => {
      setLoadingBefore(true);
      setBeforeError(null);
      try {
        const res = await fetch(
          `/api/library/precedents/${apiSlug(slug)}?offset=${prev.offset}&limit=${prev.limit}`,
        );
        const body = await res.json().catch(() => null);
        if (generation !== runGeneration.current) return;
        if (!res.ok || !body) {
          setBeforeError(typeof body?.error === "string" ? body.error : "تعذّر تحميل المبادئ السابقة");
          return;
        }
        const { run: win, total } = runFromWindow(body);
        const first = runRef.current.items[0];
        const el = first ? document.getElementById(first.id) : null;
        prependAnchor.current = first && el ? { id: first.id, top: el.getBoundingClientRect().top } : null;
        commitRun(prependRun(runRef.current, win.items, prev.offset));
        if (total !== null) {
          totalRef.current = total;
          setTotalPrinciples(total);
        }
      } catch {
        if (generation === runGeneration.current) setBeforeError("تعذّر تحميل المبادئ السابقة، تحقّق من الاتصال");
      } finally {
        if (generation === runGeneration.current) setLoadingBefore(false);
      }
    })();
    beforePendingRef.current = request;
    request.finally(() => {
      if (beforePendingRef.current === request) beforePendingRef.current = null;
    });
    return request;
  }, [slug, commitRun]);

  // A window landed above: keep the principle that was on screen where it was.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    prependAnchor.current = null;
    const el = document.getElementById(anchor.id);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - anchor.top);
  }, [runStart]);

  /**
   * Replace the run with the window that holds `target` (one request). False
   * when the server does not find it in this collection, or the request fails.
   */
  const openTargetWindow = useCallback(async (target: string): Promise<boolean> => {
    if (missingTargetRef.current === target) return false;
    const generation = runGeneration.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch(targetWindowUrl(slug, target));
      const body = await res.json().catch(() => null);
      if (generation !== runGeneration.current) return false;
      if (!res.ok || !body) {
        setMoreError(typeof body?.error === "string" ? body.error : "تعذّر فتح موضع هذا المبدأ");
        return false;
      }
      if (body.targetFound !== true) {
        missingTargetRef.current = target;
        return false;
      }
      const { run, total, lastHasMore } = runFromWindow(body);
      runGeneration.current += 1;
      pendingRef.current = null;
      beforePendingRef.current = null;
      setBeforeError(null);
      commitRun(run);
      totalRef.current = total;
      setTotalPrinciples(total);
      setHasMore(run.items.length > 0 && runHasMore(run, total, lastHasMore));
      return run.items.some((p) => p.id === target);
    } catch {
      if (generation === runGeneration.current) setMoreError("تعذّر فتح موضع هذا المبدأ، تحقّق من الاتصال");
      return false;
    } finally {
      setLoadingMore(false);
    }
  }, [slug, commitRun]);

  // Infinite scroll: fetch the next window as the end of the list nears.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || moreError || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) void loadMore(); },
      { rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, moreError, loadMore, collection]);

  // ── A catalogue link: /precedents/<collection>#<principle id> ─────────────
  // The collection opened at the linked principle's window (?target=), so it
  // is usually held already. When it is not (the in-document search panel,
  // a hash change), ONE ?target= request replaces the run with its window —
  // never a paging loop. Then scroll it below the fixed navbar
  // (scroll-margin-top on the block) and flash it. A hash naming no
  // principle of this collection does nothing.
  const [linkTargetId, setLinkTargetId] = useState("");
  const hasCollection = collection !== null;
  // A jump request: from the URL on arrival (#<id>, else ?target=<id>), or from
  // the in-document search panel for a principle of THIS collection. Tagged
  // with its slug so a request never touches another collection.
  const [jump, setJump] = useState<{ id: string; slug: string; n: number } | null>(null);
  useEffect(() => {
    if (loading || !hasCollection || typeof window === "undefined") return;
    const arrival = readerArrival(window.location.search, window.location.hash);
    setUrlQuery(arrival.query);
    setJump(arrival.target ? { id: arrival.target, slug, n: Date.now() } : null);
  }, [loading, hasCollection, slug]);
  useEffect(() => {
    if (loading || !hasCollection || !jump || jump.slug !== slug || typeof window === "undefined") return;
    const target = jump.id;
    let cancelled = false;
    const timers: number[] = [];
    (async () => {
      const held = () => runRef.current.items.some((p) => p.id === target);
      if (!held()) {
        const opened = await openTargetWindow(target);
        if (cancelled || !opened) return;
      }
      if (cancelled || !held()) return;
      // Keep the scroll observer from re-picking the active principle mid-scroll.
      isScrolling.current = true;
      setActivePrincipleId(target);
      setLinkTargetId(target);
      // A window placed just now renders on the next commit: wait for the node
      // (getElementById, not querySelector — ids may start with a digit).
      let frames = 0;
      const scrollWhenRendered = () => {
        if (cancelled) return;
        const el = document.getElementById(target);
        if (!el) {
          if (frames++ < 60) requestAnimationFrame(scrollWhenRendered);
          return;
        }
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        timers.push(window.setTimeout(() => { isScrolling.current = false; }, 1200));
        timers.push(window.setTimeout(() => setLinkTargetId(""), 2600));
      };
      requestAnimationFrame(scrollWhenRendered);
    })();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [loading, hasCollection, slug, jump, openTargetWindow]);

  // Track recent sessions
  useEffect(() => {
    if (!slug || !collection?.title) return;
    try {
      const raw = localStorage.getItem("nzamy_recent_sessions");
      const sessions = raw ? JSON.parse(raw) : [];
      const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "precedent"));
      filtered.unshift({
        slug,
        title: collection.title,
        titleEn: collection.title,
        catId: "SA-00",
        type: "precedent"
      });
      localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  }, [slug, collection]);

  // Current Document Meta for folder
  const currentDoc = useMemo(() => {
    return {
      slug,
      title: collection?.title ?? "",
      titleEn: collection?.title ?? "",
      catId: "SA-00",
      type: "precedent" as const
    };
  }, [slug, collection]);

  // The run as it is held. q390: there is no local filter box any more — it
  // filtered only the loaded windows and needed the whole collection walked.
  // In-reader search is the server's ScopedSearchPanel above.
  const shownPrinciples = useMemo(() => collection?.principles ?? [], [collection]);

  // The highlight is ?q= (or the panel's «الانتقال للموضع»). Deferred, so
  // colouring never blocks the page.
  const highlightQuery = useDeferredValue(urlQuery);

  // BUG-LIB-01: blocks colour only near the viewport, so the legend counts
  // every loaded principle here (not the rendered marks) and ↑/↓ step from
  // one matching principle to the next; its marks render once it is near.
  const parsedHighlight = useMemo(() => parseHighlightQuery(highlightQuery), [highlightQuery]);
  // M-5: one count per principle object and query. Appending a window counts
  // only the new principles; a new query (or language) starts a fresh cache.
  const countCache = useMemo(
    () => new WeakMap<JudicialPrincipleItem, number[]>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the cache is keyed on these on purpose
    [parsedHighlight, isRTL, getReferenceForPrinciple],
  );
  const matchCounts = useMemo(
    () => (parsedHighlight.terms.length === 0
      ? []
      : shownPrinciples.map((p) => {
        let counts = countCache.get(p);
        if (!counts) {
          counts = countTermMatches(principleHighlightTexts(p, isRTL, getReferenceForPrinciple), parsedHighlight.terms);
          countCache.set(p, counts);
        }
        return counts;
      })),
    [shownPrinciples, parsedHighlight, isRTL, getReferenceForPrinciple, countCache],
  );
  const legendCounts = useMemo(
    () => parsedHighlight.terms.map((_, t) => matchCounts.reduce((sum, c) => sum + (c[t] ?? 0), 0)),
    [parsedHighlight, matchCounts],
  );
  const stepToMatch = useCallback((dir: 1 | -1, term: number | null): boolean => {
    const matching: number[] = [];
    matchCounts.forEach((c, i) => {
      if (term === null ? c.some((n) => n > 0) : (c[term] ?? 0) > 0) matching.push(i);
    });
    const current = shownPrinciples.findIndex((p) => p.id === activePrincipleId);
    const next = stepPrincipleIndex(matching, current, dir);
    if (next === null) return true;
    const id = shownPrinciples[next].id;
    isScrolling.current = true;
    setActivePrincipleId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => { isScrolling.current = false; }, 1000);
    return true;
  }, [matchCounts, shownPrinciples, activePrincipleId]);

  // Arriving with ?q= and no target: scroll to the first matching principle
  // once (its marks render only when it is near, so not to a mark).
  const firstMatchScrolled = useRef(false);
  useEffect(() => { firstMatchScrolled.current = false; }, [slug]);
  useEffect(() => {
    if (firstMatchScrolled.current || !urlQuery || jump || loading) return;
    const i = matchCounts.findIndex((c) => c.some((n) => n > 0));
    if (i < 0) return;
    firstMatchScrolled.current = true;
    document.getElementById(shownPrinciples[i].id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [urlQuery, jump, loading, matchCounts, shownPrinciples]);

  /** ✕ «مسح الألوان»: drop ?q= (the hash stays). */
  const clearHighlight = () => {
    setUrlQuery("");
    if (typeof window !== "undefined") {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, "", withoutSearchQuery(`${pathname}${search}${hash}`));
    }
  };

  /**
   * The in-document search panel's «الانتقال للموضع» on a principle of THIS
   * collection: colour the panel's query in the reader, open the principle's
   * window when it is not held (one ?target= request), scroll to it — no
   * navigation. Another volume's hit follows its link (/precedents/<volume>?q=…#<id>).
   */
  const openScopedHit = (hit: ScopedHit, query: string): boolean => {
    if (!collection || hit.kind !== "principle" || hit.volumeId !== collection.id) return false;
    setUrlQuery(query);
    const href = principleHref(collection.id, hit.id);
    if (href && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", withSearchQuery(href, query));
    }
    setJump({ id: hit.id, slug, n: Date.now() });
    return true;
  };

  const handleCopyPrinciple = (p: JudicialPrincipleItem) => {
    const mainParas = p.paragraphs?.filter(para => !isReferenceText(para.text)) || [];
    const mainText = mainParas.length > 0 
      ? mainParas.map(para => para.text).join("\n")
      : cleanTextOfRef(p.text);
      
    const selectedText = getSelectedTextWithin(`principle-card-${p.id}`);
    let textBlock = "";
    let isSelectionCopy = false;
    
    if (selectedText) {
      textBlock = selectedText;
      isSelectionCopy = true;
    } else {
      textBlock = mainText;
    }

    const court = getCourtOrIssuer(p);
    const decisionSuffix = p.decision_number ? ` (قرار رقم ${p.decision_number})` : "";
    const decisionSuffixEn = p.decision_number ? ` (Decision #${p.decision_number})` : "";

    const prefixPlain = isSelectionCopy
      ? (isRTL 
          ? `مقتبس من مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:` 
          : `Excerpt from Principle #${p.number}${decisionSuffixEn} issued by (${court}):`)
      : (isRTL 
          ? `مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:` 
          : `Principle #${p.number}${decisionSuffixEn} issued by (${court}):`);

    const prefixHtml = isSelectionCopy
      ? (isRTL 
          ? `<b>مقتبس من مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:</b>` 
          : `<b>Excerpt from Principle #${p.number}${decisionSuffixEn} issued by (${court}):</b>`)
      : (isRTL 
          ? `<b>مبدأ رقم (${p.number})${decisionSuffix} صادر عن (${court}) ونصه:</b>` 
          : `<b>Principle #${p.number}${decisionSuffixEn} issued by (${court}):</b>`);

    const refText = getReferenceForPrinciple(p);
    // The same mark-free text the reader shows (_principle-text.ts), in both formats.
    const cleanBlock = cleanPrincipleText(textBlock);
    const plain = `${prefixPlain}\n“${cleanBlock}”\n\nالمرجعية: ${refText}`;
    const html  = `${prefixHtml}<br>“${cleanBlock.replace(/\n/g, "<br>")}”<br><br><i>المرجعية: ${refText}</i>`;

    try {
      const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${html}</p></body></html>`;
      navigator.clipboard.write([
        new ClipboardItem({
          "text/html":  new Blob([full],  { type: "text/html"  }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      navigator.clipboard.writeText(plain);
    }

    setCopiedPrincipleId(p.id);
    setTimeout(() => setCopiedPrincipleId(""), 2000);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C8A762] border-t-transparent animate-spin" />
          <p className="text-xs font-semibold">{isRTL ? "جاري تحميل المجموعة..." : "Loading rulings collection..."}</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    // q390: no bundled fallback — an honest notice with the way back, never a blank page.
    const shown = notice ?? {
      kind: "load_error" as const,
      titleAr: "تعذّر تحميل المجموعة",
      bodyAr: "تعذّر تحميل المجموعة، حاول مجدداً",
    };
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir="rtl">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-8 pt-32 text-center">
          <Scales size={48} className={shown.kind === "load_error" ? "text-red-500 mb-4" : "text-[#C8A762] mb-4"} />
          <h1 className="text-xl font-black mb-2">{shown.titleAr}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4" role={shown.kind === "load_error" ? "alert" : undefined}>
            {shown.bodyAr}
          </p>
          <Link href="/laws" className="px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">
            العودة إلى المكتبة القانونية
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const fontClass = { normal: "text-xs md:text-sm", large: "text-sm md:text-base", xlarge: "text-base md:text-lg" }[fontSize];

  const layoutClass = isRTL ? "flex-row-reverse" : "flex-row";

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-8 pt-32 pb-24">
        <div className="h-6" />

        {/* Breadcrumbs */}
        <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <Link href="/laws" className="hover:underline">
            {isRTL ? "المكتبة القانونية" : "Legal Library"}
          </Link>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{collection.title}</span>
        </div>

        {/* Header Banner */}
        <div className={`${card} p-6 mb-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {isCourtKnown(null) && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] text-xs font-bold mb-2">
                  <Scales size={12} weight="fill" />
                  {getCourtOrIssuer(null)}
                </div>
              )}
              <h1 className="text-2xl font-black">{collection.title}</h1>
              {/* N2.4: in a series the volume label replaces «الجزء: 1» (the
                  loader stores part 1 on every volume of the owner's series). */}
              {(() => {
                const vol = collection.series?.volumes.find((v) => v.id === collection.series?.currentId);
                return vol ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    {collection.yearHijri && collection.yearHijri !== 0 ? <>{isRTL ? "مجموعة مبادئ وقرارات قضائية لعام:" : "Rulings collection for year:"} {collection.yearHijri}هـ | </> : null}
                    {vol.label}
                  </p>
                ) : null;
              })()}
              {!collection.series && ((collection.yearHijri && collection.yearHijri !== 0) || (collection.part && collection.part !== 0)) && (
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {collection.yearHijri && collection.yearHijri !== 0 && (
                    <>{isRTL ? "مجموعة مبادئ وقرارات قضائية لعام:" : "Rulings collection for year:"} {collection.yearHijri}هـ</>
                  )}
                  {collection.yearHijri && collection.yearHijri !== 0 && collection.part && collection.part !== 0 && " | "}
                  {collection.part && collection.part !== 0 && (
                    <>{isRTL ? "الجزء:" : "Part:"} {collection.part}</>
                  )}
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center print:hidden">
              <button
                onClick={handleCopyDraft}
                disabled={cart.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                  cart.length === 0
                    ? isDark ? "border-white/[0.04] text-zinc-700 cursor-not-allowed" : "border-slate-100 text-slate-300 cursor-not-allowed"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}>
                {copiedDraft ? <><Check size={11} className="text-emerald-500" /> {isRTL ? "تم" : "Copied"}</> : <><Copy size={11} /> {isRTL ? "نسخ المسودة" : "Copy Draft"}</>}
                {cart.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>{cart.length}</span>}
              </button>
              <button onClick={() => setShowCart(true)} className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
                <Stack size={11} /> {isRTL ? "المسودة" : "Draft"}
                {cart.length > 0 && (
                  <span className={`absolute -top-1.5 ${isRTL ? "-left-1.5" : "-right-1.5"} w-4 h-4 rounded-full bg-[#C8A762] text-[#0B3D2E] text-[9px] font-black flex items-center justify-center`}>{cart.length}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {collection.series && (
          <VolumeSelector series={collection.series} hasFullAccess={Boolean(collection.paywall?.hasFullAccess)} isDark={isDark} />
        )}

        {/* N2.6: search every volume of the series (or this collection alone)
            with the library's operators; the matches stack here in full. */}
        <ScopedSearchPanel
          key={`collection:${collection.id}`}
          scope={`collection:${collection.id}`}
          documentLabel="هذه المجموعة"
          volumeCount={collection.series?.volumes.length ?? 1}
          isDark={isDark}
          onAddToDraft={addScopedEntry}
          inDraft={(id) => cart.some(e => e.articleId === id)}
          onOpenHit={openScopedHit}
        />

        {/* ــ شريط وضع القراءة وحجم الخط والعودة ــ */}
        <div className={`relative z-45 flex flex-wrap items-center justify-between gap-4 mb-4 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <Link
            href="/laws"
            className={`inline-flex items-center gap-2 text-xs font-bold transition-all ${
              isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-[#0B3D2E]"
            }`}
          >
            <ArrowRight size={14} className={isRTL ? "" : "rotate-180"} />
            {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsReadingMode(!isReadingMode)}
              className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                isReadingMode
                  ? isDark
                    ? "bg-[#C8A762] text-[#0B3D2E] border-[#C8A762]"
                    : "bg-amber-100 text-amber-800 border-amber-300 shadow-sm"
                  : isDark
                  ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <BookOpen size={13} weight={isReadingMode ? "fill" : "regular"} />
              <span>{isRTL ? (isReadingMode ? "الوضع العادي" : "وضع القراءة") : (isReadingMode ? "Standard Mode" : "Reading Mode")}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium">{isRTL ? "حجم الخط:" : "Font:"}</span>
              {(["normal", "large", "xlarge"] as const).map((size) => (
                <button key={size} onClick={() => setFontSize(size)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition font-semibold ${
                    fontSize === size
                      ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-amber-400 text-amber-700 bg-amber-50"
                      : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  {size === "normal" ? (isRTL ? "عادي" : "A") : size === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضخم" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Sidebar + Reading layout */}
        <div className={isReadingMode ? "flex gap-6 items-start justify-center" : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full"}>
          
          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-36 z-40 space-y-3 print:hidden">
              {collection && (
                <IdentityPanel
                  isDark={isDark}
                  isRTL={isRTL}
                  collection={collection}
                  courtLabel={getCourtOrIssuer(null)}
                  courtKnown={isCourtKnown(null)}
                  totalCount={totalPrinciples}
                  setShowFolderModal={setShowFolderModal}
                />
              )}
              
              {/* Index Panel (TOC) */}
              {collection && (
                <div className={`${card} p-3`}>
                  <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5 mb-2.5">
                    <Stack size={14} className="text-[#C8A762]" weight="fill" />
                    <span>{isRTL ? "فهرس المبادئ" : "Principles Index"}</span>
                  </h3>
                  
                  {/* Scrollable list of principles */}
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                    {shownPrinciples.length === 0 ? (
                      <p className={`text-[10px] text-center py-3 ${muted}`}>{isRTL ? "لا توجد نتائج" : "No results"}</p>
                    ) : (
                      shownPrinciples.map((p) => {
                        const label = `${isRTL ? "مبدأ رقم" : "Principle #"} ${p.number}`;
                        const keywords = p.classification_keywords.slice(0, 2).join(" / ");
                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              isScrolling.current = true;
                              setActivePrincipleId(p.id);
                              document.getElementById(p.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                              setTimeout(() => { isScrolling.current = false; }, 1000);
                            }}
                            className={`w-full flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg text-[11px] transition text-right ${
                              activePrincipleId === p.id
                                ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                                : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            <span className="font-bold">{label}</span>
                            {keywords && (
                              <span className={`text-[9px] line-clamp-1 opacity-70`}>{keywords}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                        className={`w-full mt-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition disabled:opacity-60 ${
                          isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد من المبادئ"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}

          {/* CENTER COLUMN: Principle Reader */}
          <div className={`nzamy-reader-container ${isReadingMode ? "max-w-3xl w-full" : "lg:col-span-6"} min-w-0 space-y-6 w-full`}>
            {/* Owner note ٠٦: one provider for the reader column only — the
                in-document search panel above has its own colours and counts. */}
            <HighlightProvider query={highlightQuery}>
            {/* The provider's wrapper is display:contents, which space-y-6
                above no longer reaches: the spacing lives on this div. */}
            <div className="space-y-6">
            <SearchLegendBar
              onClear={clearHighlight}
              partial={hasMore || runStart > 0}
              counts={legendCounts}
              onStep={stepToMatch}
              className="sticky top-32 z-30 shadow-sm print:hidden"
            />

            {/* q390-ب: the reader opened mid-collection (a target's window) —
                the windows before it load on demand, one at a time. */}
            {runStart > 0 && (
              <div className={`${card} p-4 text-center print:hidden`}>
                {beforeError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{beforeError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void loadBefore()}
                  disabled={loadingBefore}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border transition disabled:opacity-60 ${
                    isDark ? "border-white/[0.07] text-zinc-300 hover:text-white" : "border-slate-200 text-slate-600 hover:text-slate-800"
                  }`}
                >
                  {loadingBefore ? "جارٍ التحميل…" : beforeError ? "إعادة المحاولة" : "عرض ما قبل هذا الموضع"}
                </button>
              </div>
            )}

            {shownPrinciples.map((p) => (
              <PrincipleBlock
                key={p.id}
                p={p}
                isDark={isDark}
                isRTL={isRTL}
                activePrincipleId={activePrincipleId}
                copiedPrincipleId={copiedPrincipleId}
                fontSize={fontSize}
                isReadingMode={isReadingMode}
                handleCopyPrinciple={handleCopyPrinciple}
                cartMap={cartMap}
                addPrincipleToCart={addPrincipleToCart}
                removePrincipleFromCart={removePrincipleFromCart}
                getReferenceForPrinciple={getReferenceForPrinciple}
                isReferenceText={isReferenceText}
                cleanTextOfRef={cleanTextOfRef}
                card={card}
                fontClass={fontClass}
                isLinkTarget={linkTargetId === p.id}
              />
            ))}
            {shownPrinciples.length === 0 && (
              <div className={`${card} p-8 text-center`}>
                {/* A collection with no text yet: «نص هذه المجموعة قيد الإضافة — قريباً.» */}
                <p className="text-xs text-slate-500">{notice?.bodyAr ?? "لا توجد مبادئ في هذه المجموعة بعد."}</p>
              </div>
            )}

            {/* Windowed loading: status, infinite-scroll sentinel and a manual fallback. */}
            {(hasMore || moreError) && (
              <div ref={sentinelRef} className={`${card} p-4 text-center print:hidden`}>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">
                  {runStart > 0
                    ? `عُرض من ${runStart + 1} إلى ${runStart + collection.principles.length} من ${totalPrinciples ?? runStart + collection.principles.length} مبدأ`
                    : `عُرض ${collection.principles.length} من ${totalPrinciples ?? collection.principles.length} مبدأ`}
                </p>
                {moreError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{moreError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="px-4 py-2 text-xs font-bold bg-[#0B3D2E] text-white rounded-xl hover:opacity-90 transition disabled:opacity-60"
                >
                  {loadingMore ? "جارٍ التحميل…" : moreError ? "إعادة المحاولة" : "تحميل المزيد"}
                </button>
              </div>
            )}
            </div>
            </HighlightProvider>
          </div>

          {/* LEFT COLUMN: AI Assistant & Tools */}
          {!isReadingMode && (() => {
            const meta = getLawMeta(slug);
            return (
              <aside className="hidden lg:block lg:col-span-3 sticky top-36 z-40 space-y-3 print:hidden">
                <button
                  onClick={() => setShowCommunity(true)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold transition ${
                    isDark ? "border-indigo-500/30 text-indigo-300 bg-indigo-900/10 hover:bg-indigo-900/20" : "border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {isRTL ? "اسأل في المجتمع القانوني" : "Ask Legal Community"}
                </button>
    
                <LibraryAI isDark={isDark} isRTL={isRTL} />

                {/* Research Workspace */}
                <ResearchWorkspace isDark={isDark} pageId={`precedent-principles-${slug}`} isRTL={isRTL} />

                {/* Related Documents Card */}
                {meta && ((meta.related_systems && meta.related_systems.length > 0) || 
                  (meta.related_principles && meta.related_principles.length > 0)) && (
                  <div className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} space-y-3.5`}>
                    <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5">
                      <Stack size={14} className="text-[#C8A762]" weight="fill" />
                      <span>{isRTL ? "وثائق وأنظمة ذات صلة" : "Related Documents"}</span>
                    </h3>
                    
                    {/* Related Systems */}
                    {meta.related_systems && meta.related_systems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                          {isRTL ? "الأنظمة واللوائح المرتبطة:" : "Related Laws & Regs:"}
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {meta.related_systems.map((doc: any, idx: number) => (
                            <Link
                              key={idx}
                              href={`/laws/${doc.slug}`}
                              className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                                isDark 
                                  ? "border-white/5 hover:border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white" 
                                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#0B3D2E]"
                              }`}
                            >
                              <BookOpen size={13} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                              <span className="leading-tight">{doc.title}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Related Principles */}
                    {meta.related_principles && meta.related_principles.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                          {isRTL ? "المبادئ القضائية المتصلة:" : "Related Principles:"}
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {meta.related_principles.map((doc: any, idx: number) => (
                            <Link
                              key={idx}
                              href={`/precedents/${doc.slug}`}
                              className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                                isDark 
                                  ? "border-white/5 hover:border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white" 
                                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#0B3D2E]"
                              }`}
                            >
                              <Scales size={13} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                              <span className="leading-tight">{doc.title}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            );
          })()}
        </div>
      </div>

      <Footer />
      
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCart(false)} className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px]" />
            <DraftDrawer cart={cart} onRemoveArticle={removeArticle} onClearAll={clearAll} onClose={() => setShowCart(false)} isDark={isDark} isRTL={isRTL} />
          </>
        )}
      </AnimatePresence>

      {/* Item 94: a failed cart save is shown once, by the global
          FloatingButtons (the cart is one shared store, useDraftCart). */}

      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={collection?.title}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>

      <FolderSelectionModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        currentDoc={currentDoc}
      />
      <PrintWatermark isRTL={isRTL} />
    </div>
  );
}
