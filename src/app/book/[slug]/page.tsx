"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  BookOpen, Sparkle, ArrowRight, CaretLeft, CaretRight, CaretUp, Stack, Printer,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import SidebarPanel from "./_sidebar";
import IdentityPanel from "./_identity-panel";
import StreamBlock from "./_stream-block";
import { formatLocator, matchesLocator } from "./_locator";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import { LibraryAI, CommunityQuestionModal } from "@/app/laws/[slug]/_ai-components";
import { getLawMeta } from "@/app/laws/law-metadata-map";
// N2.6: the book reader gets the draft cart the law and collection readers have.
import { useDraftCart } from "@/hooks/useDraftCart";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import ScopedSearchPanel from "@/components/library/ScopedSearchPanel";
import { blockCartEntry } from "@/lib/library/scopedHitActions";
// Owner note ٠٦: the shared multi-colour highlight (?q= and the index's box).
import { HighlightProvider, SearchLegendBar, useScrollToFirstMark } from "@/components/search/MultiColorHighlight";

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

function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g,   "$1");
}

/** The text pasted into the HTML clipboard flavour: no markup of the source survives. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Interfaces ─────────────────────────────────────────────────────────────
import type { FeqhBookSystem } from "@/app/laws/data";
import { apiSlug } from '@/utils/apiSlug';
import { volumeSubtitle, volumesCountLabel } from "@/lib/library/bookVolumes";
import {
  emptyLinks, emptyStream, extendStream, filterToc, firstStreamBlockOfSection, fromApiBook,
  fromNestedBook, linkRun, mergeSectionBlocks, normalizeBlock, parseJumpQuery, planBlockJump,
  runFromCursorResponse, streamCursor, streamFromFirstPage, streamFromRun, topmostVisible,
  type BlocksBySection, type BookLinks, type CompleteSections, type OrderedRun, type ReaderBlock,
  type ReaderBook, type ReaderState, type ReaderStream,
  READER_LAYERS, type ReaderLayer,
} from "./_reader-model";
import { isDemoMode } from "@/lib/runtimeMode";

/**
 * Owner note ٠٢ — the continuous stream. Blocks per request: the opening
 * request and every batch appended as the reader nears the end.
 */
const STREAM_BATCH = 80;
/**
 * Rendered-DOM cap. A 1,000-page book is not mounted whole: past this many
 * blocks the stream stops appending and offers «متابعة القراءة من هنا», which
 * starts a fresh stream at the last block (the same move as a jump).
 */
const STREAM_MAX_BLOCKS = 800;
/** How long the view must rest on a block before the notes panel follows it. */
const WORKSPACE_SETTLE_MS = 1500;

// Demo Data: الروض المربع
const DEMO_RAWD: FeqhBookSystem = {
  id: "rawd-al-murbi",
  title: "الروض المربع بشرح زاد المستقنع",
  author: "الشيخ منصور بن يونس البهوتي (ت 1051هـ)",
  school: "المذهب الحنبلي",
  investigator: "الشيخ عبد الرحمن بن محمد بن قاسم (حاشية ابن قاسم)",
  publisher: "طبعة دار ابن الجوزي / مطبعة الحكومة بالرياض",
  totalVolumes: 1,
  chapters: [
    {
      title: "كتاب الصلاة - شروط الصلاة",
      sections: [
        {
          title: "باب شروط الصلاة",
          blocks: [
            {
              id: "fb-rawd-1",
              topic: "تعريف شرط الصلاة وعدد الشروط",
              vol: 1,
              page: 204,
              matn: "وَشُرُوطُهَا تِسْعَةٌ: الإِسْلاَمُ، وَالعَقْلُ، وَالتَّمْيِيزُ، وَرَفْعُ الحَدَثِ، وَإِزَالَةُ النَّجَاسَةِ، وَسَتْرُ العَوْرَةِ، وَدُخُولُ الوَقْتِ، وَاسْتِقْبَالُ القِبْلَةِ، وَالنِّيَّةُ.",
              sharh: "وهي -أي شروط الصلاة- جمع شرط، وهو لغة العلامة، واصطلاحاً: ما يلزم من عدمه العدم ولا يلزم من وجوده وجود ولا عدم لذاته. وهي (تسعة) شروط لا تصح الصلاة بدونها، وتقديمها عليها متعيّن مع الاستمرار فيها بقدر الإمكان:\nأحدها: (الإسلام) فلا تصح من كافر إجماعاً.\nوالثاني: (العقل) فلا تصح من مجنون ومعتوه.\nوالثالث: (التمييز) وهو بلوغ سبع سنين، فلا تصح من طفل دونها لعدم النية.",
              hashiyah: [
                "الشرط بالفتح العلامة، ومنه أشراط الساعة. واصطلاحاً: ما وجد قبله واستمر معه، بخلاف الركن الذي هو جزء من الماهية.",
                "الإسلام شرط لصحة كل عبادة، والنية لا تصح من كافر لعدم الأهلية، والخطاب فروعاً لا يصح منه فعلاً بل عقاباً.",
                "التمييز عند الحنابلة يُحدد بالبلوغ سبع سنين، ويؤمر بها لسبع ويُضرب عليها لعشر لحديث سبرة بن معبد."
              ]
            },
            {
              id: "fb-rawd-2",
              topic: "الشرط الرابع: رفع الحدث والوضوء",
              vol: 1,
              page: 205,
              matn: "وَالرَّابِعُ: رَفْعُ الحَدَثِ، وَهُВО الوُضُوءُ إِذَا كَانَ أَصْغَرَ، وَالغُسْلُ إِذَا كَانَ أَكْبَرَ، أَوِ التَّيَمُّمُ عِنْدَ العَجْزِ عَنْهُمَا.",
              sharh: "(والرابع: رفع الحدث) بالماء المطلق, وهو زوال الوصف القائم بالبدن المانع من الصلاة ونحوها، وهو (الوضوء) بضم الواو (إذا كان أصغر) لحدث أصغر، (والغسل إذا كان أكبر) لحدث جنابة أو حيض، (أو التيمم عند العجز عنهما) بالتراب الطهور لمرض أو فقد ماء.",
              hashiyah: [
                "رفع الحدث لا يكون إلا بالماء الطهور وهو الباقي على خلقته، وعند تعذره يُعدل للتيمم بالتراب.",
                "الحدث وصف حكمي يحل بالأعضاء يمنع من الصلاة، والخبث نجاسة عينية تطرأ على البدن أو الثوب أو البقعة."
              ]
            }
          ]
        }
      ]
    }
  ]
};

/** Scroll to the first coloured term once, on arrival from a search (?q=). Lives inside the provider. */
function ScrollToFirstMark({ enabled, loaded }: { enabled: boolean; loaded: number }) {
  useScrollToFirstMark(enabled, [loaded]);
  return null;
}

type WindowFailure = { ok: false; status: number; error: string };
type WindowAnswer = { ok: true; run: OrderedRun } | WindowFailure;

export default function FeqhBookPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { isDark, isRTL } = useTheme();

  const [book, setBook] = useState<ReaderBook | null>(null);
  const [loading, setLoading] = useState(true);
  /** Arabic message when the API failed (5xx) — distinct from "not found". */
  const [loadError, setLoadError] = useState<string | null>(null);

  // Everything loaded so far, keyed by section (the index lists it), and the
  // sections known to be complete (see linkRun). Refs mirror the state so
  // async loaders read the latest values between awaits.
  const [blocksBySection, setBlocksBySection] = useState<BlocksBySection>({});
  const [completeSections, setCompleteSections] = useState<CompleteSections>({});
  const blocksRef = useRef<BlocksBySection>({});
  const completeRef = useRef<CompleteSections>({});
  const linksRef = useRef<BookLinks>(emptyLinks());
  const bookGeneration = useRef(0);

  // Owner note ٠٢: the stream — blocks contiguous in book order, rendered one
  // under another (_reader-model.ts ReaderStream).
  const [stream, setStream] = useState<ReaderStream>(emptyStream);
  const streamRef = useRef<ReaderStream>(emptyStream());
  /** Bumped on every new stream (a jump): a batch still in flight for the old one is dropped. */
  const streamGeneration = useRef(0);
  const morePending = useRef<Promise<void> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const streamRootRef = useRef<HTMLDivElement | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** The last batch added nothing while the server said more follow (order_index ties). */
  const [stalled, setStalled] = useState(false);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [beforeError, setBeforeError] = useState<string | null>(null);
  /** «عرض ما قبل»: keep the block that was on screen where it was once blocks land above it. */
  const prependAnchor = useRef<{ id: string; top: number } | null>(null);
  // Jumps (an index entry, «انتقال للصفحة»).
  const [jumping, setJumping] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  /** True from opening until the first jump or appended batch: ?q= may scroll to its first match only then. */
  const [arrival, setArrival] = useState(true);

  // Reader states
  /** The block in view — followed by the index (IntersectionObserver). */
  const [activeBlockId, setActiveBlockId] = useState<string>("");
  const [settledBlockId, setSettledBlockId] = useState<string>("");
  const isScrolling = useRef(false);
  const scrollTimer = useRef<number | null>(null);
  // N2.3: the four layers of the owner preview (_reader-model.ts READER_LAYERS).
  const [viewLayer, setViewLayer] = useState<ReaderLayer>("all");
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("large");
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [copiedBlockId, setCopiedBlockId] = useState<string>("");
  const [showCommunity, setShowCommunity] = useState(false);
  const lawMeta = getLawMeta(book?.id || slug);

  // Folder & Search states
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickJumpQuery, setQuickJumpQuery] = useState("");
  const [jumpError, setJumpError] = useState(false);

  // Owner note ٠٦: arriving from a search (/book/…?q=) colours its terms
  // through the whole stream — nothing is hidden. The index's own box, when
  // typed in, takes over; ✕ «مسح الألوان» clears both and drops ?q=.
  // Read from the address bar when the book loads (loadBookData below).
  const [urlQuery, setUrlQuery] = useState("");
  const highlightQuery = searchQuery.trim() ? searchQuery : urlQuery;
  const clearHighlight = useCallback(() => {
    setSearchQuery("");
    setUrlQuery("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* the colours are gone either way */
    }
  }, []);

  // N2.6: the draft cart («مسودة التجميع») — the tab's one shared cart
  // (useDraftCart). Its drawer and save-error notice are the global
  // FloatingButtons' (root layout): the «المسودة» button below opens that
  // drawer, so this page mounts no second copy of either.
  const { cart, setCart } = useDraftCart();
  const addEntryToCart = useCallback((entry: CartEntry) => {
    setCart((prev) => (prev.find((e) => e.articleId === entry.articleId) ? prev : [...prev, entry]));
  }, [setCart]);
  const cartIds = useMemo(() => new Set(cart.map((e) => e.articleId)), [cart]);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  const filteredChapters = useMemo(() => {
    if (!book) return [];
    return filterToc(book.chapters, blocksBySection, searchQuery);
  }, [book, blocksBySection, searchQuery]);

  const commitReaderState = useCallback((map: BlocksBySection, complete: CompleteSections) => {
    blocksRef.current = map;
    completeRef.current = complete;
    setBlocksBySection(map);
    setCompleteSections(complete);
  }, []);

  const commitStream = useCallback((next: ReaderStream) => {
    streamRef.current = next;
    setStream(next);
  }, []);

  /** Record an ordered window: its blocks join the index, its links mark complete sections. */
  const recordRun = useCallback((run: OrderedRun) => {
    const linked = linkRun(linksRef.current, completeRef.current, run, blocksRef.current);
    linksRef.current = linked.links;
    commitReaderState(mergeSectionBlocks(blocksRef.current, run.blocks), linked.complete);
  }, [commitReaderState]);

  /** One reading-order window from the books API (no TOC). */
  const fetchWindow = useCallback(async (cursor: string, dir: 1 | -1): Promise<WindowAnswer> => {
    try {
      const res = await fetch(`/api/library/books/${apiSlug(slug)}?${cursor}&toc=0&limit=${STREAM_BATCH}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        return { ok: false, status: res.status, error: typeof body?.error === "string" ? body.error : "تعذّر تحميل نص الكتاب، حاول مجدداً" };
      }
      return { ok: true, run: runFromCursorResponse(body, dir) };
    } catch {
      return { ok: false, status: 0, error: "تعذّر تحميل نص الكتاب، تحقّق من الاتصال" };
    }
  }, [slug]);

  /**
   * Scroll a block of the stream into view (once it is rendered — a stream
   * that was just replaced renders on the next commit). The scroll observer is
   * held off meanwhile, so it does not re-pick the block mid-scroll.
   */
  const scrollToBlock = useCallback((id: string, behavior: ScrollBehavior = "smooth") => {
    isScrolling.current = true;
    setActiveBlockId(id);
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    let frames = 0;
    const attempt = () => {
      const el = document.getElementById(`book-block-${id}`);
      if (!el) {
        if (frames++ < 60) requestAnimationFrame(attempt);
        else isScrolling.current = false;
        return;
      }
      el.scrollIntoView({ behavior, block: "start" });
      scrollTimer.current = window.setTimeout(() => { isScrolling.current = false; }, 1000);
    };
    requestAnimationFrame(attempt);
  }, []);

  /**
   * Replace the stream with a new run that starts at `cursor` (a jump), then
   * scroll to `targetId` — or to the run's first block. The stream goes on
   * downward from there. Resolves the failed answer, or null on success.
   */
  const startStreamAt = useCallback(async (cursor: string, targetId?: string): Promise<WindowFailure | null> => {
    const generation = bookGeneration.current;
    setJumping(true);
    setNavError(null);
    try {
      const answer = await fetchWindow(cursor, 1);
      if (generation !== bookGeneration.current) return null;
      if (!answer.ok) return answer;
      streamGeneration.current += 1;
      morePending.current = null;
      recordRun(answer.run);
      const next = streamFromRun(answer.run, linksRef.current);
      commitStream(next);
      setStalled(false);
      setMoreError(null);
      setBeforeError(null);
      setArrival(false);
      const target = targetId && next.blocks.some((b) => b.id === targetId) ? targetId : next.blocks[0]?.id;
      if (target) scrollToBlock(target, "auto");
      return null;
    } finally {
      if (generation === bookGeneration.current) setJumping(false);
    }
  }, [fetchWindow, recordRun, commitStream, scrollToBlock]);

  /**
   * Append the next batch (?from_order= the last block's order — inclusive;
   * the anchor and order_index ties come back and are dropped by id). Callers
   * share one request in flight, so the sentinel and the button never ask twice.
   */
  const loadMore = useCallback((): Promise<void> => {
    if (morePending.current) return morePending.current;
    const current = streamRef.current;
    const cursor = streamCursor(current, 1);
    if (current.endsBook || cursor === null) return Promise.resolve();
    const generation = streamGeneration.current;
    const bookGen = bookGeneration.current;
    const run = (async () => {
      setLoadingMore(true);
      setMoreError(null);
      try {
        const answer = await fetchWindow(`from_order=${cursor}`, 1);
        if (generation !== streamGeneration.current || bookGen !== bookGeneration.current) return;
        if (!answer.ok) {
          setMoreError(answer.error);
          return;
        }
        recordRun(answer.run);
        const { stream: next, added } = extendStream(streamRef.current, answer.run, 1);
        commitStream(next);
        setArrival(false);
        // A window of nothing new while more follow: stop instead of asking
        // for the same window forever; the button stays as a manual retry.
        if (added === 0 && !next.endsBook) {
          setStalled(true);
          setMoreError("تعذّر متابعة التحميل من هذا الموضع؛ استعمل «انتقال للصفحة» أو الفهرس للمتابعة.");
        }
      } finally {
        if (generation === streamGeneration.current) setLoadingMore(false);
      }
    })();
    morePending.current = run;
    run.finally(() => {
      if (morePending.current === run) morePending.current = null;
    });
    return run;
  }, [fetchWindow, recordRun, commitStream]);

  /** «عرض ما قبل هذا الموضع»: prepend the window before the stream (after a jump into the middle). */
  const loadBefore = useCallback(async () => {
    const current = streamRef.current;
    const cursor = streamCursor(current, -1);
    if (current.startsBook || cursor === null || loadingBefore) return;
    const generation = streamGeneration.current;
    const bookGen = bookGeneration.current;
    setLoadingBefore(true);
    setBeforeError(null);
    try {
      const answer = await fetchWindow(`before_order=${cursor}`, -1);
      if (generation !== streamGeneration.current || bookGen !== bookGeneration.current) return;
      if (!answer.ok) {
        setBeforeError(answer.error);
        return;
      }
      const first = streamRef.current.blocks[0];
      const el = first ? document.getElementById(`book-block-${first.id}`) : null;
      prependAnchor.current = first && el ? { id: first.id, top: el.getBoundingClientRect().top } : null;
      recordRun(answer.run);
      commitStream(extendStream(streamRef.current, answer.run, -1).stream);
    } finally {
      setLoadingBefore(false);
    }
  }, [fetchWindow, recordRun, commitStream, loadingBefore]);

  // After a prepend, put the block that was on screen back where it was (browsers
  // without scroll anchoring would otherwise jump the reader up by the new height).
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    prependAnchor.current = null;
    const el = document.getElementById(`book-block-${anchor.id}`);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }, [stream]);

  const atCap = stream.blocks.length >= STREAM_MAX_BLOCKS;

  // Infinite scroll: the next batch as the end of the stream nears. Re-armed
  // on every new batch, so a sentinel still in view asks again.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || stream.endsBook || atCap || stalled || moreError || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) void loadMore(); },
      { rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [stream, atCap, stalled, moreError, loadMore]);

  // The index follows the block in view: one observer over every rendered
  // block, a reading band 20%–40% from the top (as the precedents reader).
  useEffect(() => {
    const root = streamRootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.streamBlock;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        if (isScrolling.current) return;
        setActiveBlockId((prev) => topmostVisible(streamRef.current, visible, prev));
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    root.querySelectorAll<HTMLElement>("[data-stream-block]").forEach((node) => obs.observe(node));
    return () => obs.disconnect();
  }, [stream]);

  // The notes panel (ResearchWorkspace) is keyed per block: it follows the
  // block in view only once the reader rests there, not on every scroll step.
  useEffect(() => {
    if (!activeBlockId) return;
    const t = window.setTimeout(() => setSettledBlockId(activeBlockId), WORKSPACE_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [activeBlockId]);

  /** An index entry (a block row): scroll when the stream holds it, else a new stream from it. */
  const handleScrollToBlock = useCallback((id: string) => {
    const plan = planBlockJump(streamRef.current, blocksRef.current, id);
    if (!plan) return;
    if (plan.kind === "scroll") scrollToBlock(plan.id);
    else void startStreamAt(`from_order=${plan.order}`, plan.id).then((failed) => {
      if (failed) setNavError(failed.error);
    });
  }, [scrollToBlock, startStreamAt]);

  /**
   * A section title in the index: its first block, then the stream continues
   * downward. When the stream does not hold it, one row (?section_id=&limit=1,
   * ordered by order_index) tells where the section starts.
   */
  const handleOpenSection = useCallback(async (sectionId: string) => {
    const inStream = firstStreamBlockOfSection(streamRef.current, sectionId);
    // The stream's very first block may sit mid-section (it began at a jump):
    // then the section starts earlier and is looked up below.
    const startsHere = inStream && (streamRef.current.startsBook || streamRef.current.blocks[0]?.id !== inStream.id);
    if (inStream && startsHere) {
      scrollToBlock(inStream.id);
      return;
    }
    const known = completeRef.current[sectionId] ? blocksRef.current[sectionId]?.[0] : undefined;
    if (known && known.orderIndex !== null) {
      const failed = await startStreamAt(`from_order=${known.orderIndex}`, known.id);
      if (failed) setNavError(failed.error);
      return;
    }
    const generation = bookGeneration.current;
    setLoadingSectionId(sectionId);
    setNavError(null);
    try {
      const res = await fetch(
        `/api/library/books/${apiSlug(slug)}?section_id=${encodeURIComponent(sectionId)}&toc=0&limit=1&page=1`,
      );
      const body = await res.json().catch(() => null);
      if (generation !== bookGeneration.current) return;
      if (!res.ok || !body) {
        setNavError(typeof body?.error === "string" ? body.error : "تعذّر فتح هذا الموضع، حاول مجدداً");
        return;
      }
      const first = (Array.isArray(body.blocks) ? body.blocks : [])
        .map((b: Record<string, unknown>) => normalizeBlock(b, sectionId))[0] as ReaderBlock | undefined;
      if (!first) {
        // A section with no text: say so in the index («لا نص»).
        commitReaderState(blocksRef.current, { ...completeRef.current, [sectionId]: true });
        return;
      }
      if (first.orderIndex === null) return;
      const failed = await startStreamAt(`from_order=${first.orderIndex}`, first.id);
      if (failed) setNavError(failed.error);
    } catch {
      if (generation === bookGeneration.current) setNavError("تعذّر فتح هذا الموضع، تحقّق من الاتصال");
    } finally {
      setLoadingSectionId((cur) => (cur === sectionId ? null : cur));
    }
  }, [slug, scrollToBlock, startStreamAt, commitReaderState]);

  /**
   * «انتقال للصفحة»: "47" (any volume) or "3/47". The stream first, then the
   * blocks the index already holds, then the books API (?at_page=) for a page
   * not loaded yet — the stream continues downward from that page.
   */
  const handleQuickJump = async (query: string) => {
    if (!book) return;
    setJumpError(false);
    const { vol, page, server } = parseJumpQuery(query);
    if (!page) return;
    const fail = () => {
      setJumpError(true);
      setTimeout(() => setJumpError(false), 2000);
    };
    const inStream = streamRef.current.blocks.find((b) => matchesLocator(b, vol, page));
    if (inStream) {
      scrollToBlock(inStream.id);
      return;
    }
    const known = Object.values(blocksRef.current).flat()
      .filter((b) => b.orderIndex !== null && matchesLocator(b, vol, page))
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];
    if (!server) {
      if (known && known.orderIndex !== null) {
        const failed = await startStreamAt(`from_order=${known.orderIndex}`, known.id);
        if (failed) fail();
      } else {
        fail();
      }
      return;
    }
    // The server finds the FIRST block printed on that page, even when a later
    // one of the same page is already held.
    const cursor = `at_page=${server.page}${server.vol !== null ? `&at_vol=${server.vol}` : ""}`;
    const failed = await startStreamAt(cursor);
    if (failed) {
      fail();
      if (failed.status !== 404) setNavError(failed.error);
    }
  };

  const currentDoc = useMemo(() => {
    return {
      slug: book?.id || slug,
      title: book?.title || "",
      titleEn: book?.title || "",
      catId: "SA-00",
      type: "book" as const
    };
  }, [book, slug]);

  useEffect(() => {
    let cancelled = false;
    const apply = (state: ReaderState) => {
      if (cancelled) return;
      setBook(state.book);
      linksRef.current = state.links;
      commitReaderState(state.blocksBySection, state.complete);
      const first = streamFromFirstPage(state);
      commitStream(first);
      setActiveBlockId(state.firstBlockId);
      setSettledBlockId(state.firstBlockId);
    };
    async function loadBookData() {
      // Owner note ٠٦: ?q= from a search result colours the whole book.
      let q = "";
      try {
        q = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
      } catch {
        q = "";
      }
      setUrlQuery(q);
      setLoading(true);
      setLoadError(null);
      setNavError(null);
      setMoreError(null);
      setBeforeError(null);
      setStalled(false);
      setArrival(true);
      setBook(null);
      bookGeneration.current += 1;
      streamGeneration.current += 1;
      morePending.current = null;
      linksRef.current = emptyLinks();
      commitReaderState({}, {});
      commitStream(emptyStream());
      try {
        // The complete TOC plus the first batch of the stream. apiSlug()
        // decodes then encodes once, so a pre-encoded slug is not
        // double-encoded into %25… (a 404).
        const res = await fetch(`/api/library/books/${apiSlug(slug)}?limit=${STREAM_BATCH}`);
        if (cancelled) return;
        if (res.ok) {
          const apiData = await res.json();
          apply(fromApiBook(apiData));
          if (!cancelled) setLoading(false);
          return;
        }
        // A server failure is not "not found": say so instead of falling through.
        if (res.status >= 500) {
          const body = await res.json().catch(() => null);
          if (cancelled) return;
          setLoadError(typeof body?.error === "string" ? body.error : "تعذّر تحميل الكتاب، حاول مجدداً");
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[Books] API fetch failed, using JSON fallback:', e);
      }
      if (cancelled) return;

      // Fallback. DEMO_RAWD is demo content (owner decision ١١٥): it may stand
      // in for a missing book only in demo mode, never on production.
      if (slug === "rawd-al-murbi" && isDemoMode) {
        apply(fromNestedBook(DEMO_RAWD as unknown as Record<string, unknown>));
      } else if (slug === "sources-of-right-1") {
        try {
          const data = await import("@/constants/sources-of-right-1.json");
          apply(fromNestedBook(data.default as unknown as Record<string, unknown>));
        } catch (e) {
          console.error("Failed to load book sources-of-right-1", e);
        }
      }
      if (!cancelled) setLoading(false);
    }
    loadBookData();
    return () => { cancelled = true; };
  }, [slug, commitReaderState, commitStream]);

  // Multi-volume series (T28-24): the header names the series and the volume
  // being read, and a switcher moves between volumes. The volume's own title
  // does not always carry its number («الوسيط … — نظرية الالتزام بوجه عام —
  // مصادر الالتزام» is الجزء 1), so citations use «السلسلة — الجزء N — …».
  const series = book?.series ?? null;
  const seriesIndex = series ? series.volumes.findIndex((v) => v.id === series.currentId) : -1;
  const currentVolume = series && seriesIndex >= 0 ? series.volumes[seriesIndex] : null;
  const volumeNote = book && currentVolume ? volumeSubtitle(book.title, book.id) : "";
  const citeTitle = series && currentVolume
    ? [series.title, currentVolume.label, volumeNote].filter(Boolean).join(" — ")
    : book?.title ?? "";

  /** Reference line: the locator segment disappears when the source has none. */
  const blockCitation = useCallback((block: ReaderBlock) => {
    if (!book) return "";
    const loc = formatLocator(block, isRTL, "short");
    // The API carries no publisher; «(طبعة undefined)» was printed into every citation.
    return [book.author, citeTitle, loc, book.publisher ? `(طبعة ${book.publisher})` : ""]
      .filter(Boolean)
      .join("، ");
  }, [book, citeTitle, isRTL]);

  /**
   * «نسخ بالتوثيق» on a block of the stream: its text (or the part of it the
   * reader selected) with the reference. A locked block has no text here —
   * it copies the reference only.
   */
  const handleCopyBlock = useCallback((block: ReaderBlock) => {
    if (!book) return;
    const citation = blockCitation(block);
    const done = () => {
      setCopiedBlockId(block.id);
      setTimeout(() => setCopiedBlockId((cur) => (cur === block.id ? "" : cur)), 2000);
    };
    if (block.locked) {
      navigator.clipboard.writeText(citation);
      done();
      return;
    }

    const selectedText = getSelectedTextWithin(`book-block-${block.id}`);
    let textBlock = "";
    let isSelectionCopy = false;

    if (selectedText) {
      textBlock = selectedText;
      isSelectionCopy = true;
    } else {
      const parts = [];
      if (block.matn) parts.push(`المتن:\n${block.matn}`);
      if (block.sharh) parts.push(`الشرح:\n${block.sharh}`);
      if (block.hashiyah.length > 0) {
        parts.push(`الحواشي:\n${block.hashiyah.map((h, i) => `${i + 1}- ${h}`).join("\n")}`);
      }
      textBlock = parts.join("\n\n");
    }

    // «كتاب (العنوان - ج 3، ص 47)» → «كتاب (العنوان)» when the source gives no
    // locator, instead of «كتاب (العنوان - ج null، ص null)».
    const loc = formatLocator(block, isRTL, "short");
    const where = loc ? `${citeTitle} - ${loc}` : citeTitle;
    const prefixPlain = isSelectionCopy
      ? (isRTL
          ? `مقتبس من كتاب (${where}):`
          : `Excerpt from book (${where}):`)
      : (isRTL
          ? `الموضع من كتاب (${where}):`
          : `Excerpt from book (${where}):`);

    const prefixHtml = `<b>${escapeHtml(prefixPlain)}</b>`;

    const plain = `${prefixPlain}\n“${stripMd(textBlock)}”\n\nالمرجعية: ${citation}`;
    const html  = `${prefixHtml}<br>“${escapeHtml(textBlock).replace(/\n/g, "<br>")}”<br><br><i>المرجعية: ${escapeHtml(citation)}</i>`;

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
    done();
  }, [book, blockCitation, citeTitle, isRTL]);

  /** «+ إضافة للمسودة» on a block of the stream (only a block whose text this viewer has). */
  const handleAddBlockToDraft = useCallback((block: ReaderBlock) => {
    if (block.locked) return;
    addEntryToCart(blockCartEntry(
      { id: block.id, topic: block.topic, matn: block.matn, sharh: block.sharh, hashiyah: block.hashiyah,
        vol: block.vol, page: block.page, volLabel: block.volLabel, pageLabel: block.pageLabel },
      citeTitle,
    ));
  }, [addEntryToCart, citeTitle]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#C8A762] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold">{isRTL ? "جاري تحميل الكتاب الفقهي..." : "Loading Feqh book..."}</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <BookOpen size={48} className="text-red-500 mb-4" />
          <h1 className="text-xl font-black mb-2">{loadError ? "تعذّر تحميل الكتاب" : isRTL ? "عفواً، الكتاب غير موجود" : "Book Not Found"}</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">{loadError ?? (isRTL ? "لم نتمكن من العثور على هذا الكتاب الفقهي في المكتبة." : "We couldn't find this Feqh book in the library.")}</p>
          <Link href="/laws" className="px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">{isRTL ? "العودة للمكتبة" : "Back to Library"}</Link>
        </div>
        <Footer />
      </div>
    );
  }

  // The block in view (for the identity panel and the index), or the stream's first.
  const inViewBlock = stream.blocks.find((b) => b.id === activeBlockId) ?? stream.blocks[0] ?? null;
  const activeSectionId = inViewBlock?.sectionId ?? "";
  const prevVolume = series && seriesIndex > 0 ? series.volumes[seriesIndex - 1] : null;
  const nextVolume = series && seriesIndex >= 0 && seriesIndex < series.volumes.length - 1 ? series.volumes[seriesIndex + 1] : null;
  const workspaceBlockId = settledBlockId || inViewBlock?.id || "";

  const fontClass = {
    normal: "text-base leading-relaxed",
    large: "text-lg md:text-xl leading-loose",
    xlarge: "text-xl md:text-2xl leading-extra-loose",
  }[fontSize];

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-8 mt-12">
        {/* Header Banner */}
        <div className={`${card} p-6 mb-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[#C8A762] text-xs font-black mb-2">
                <Sparkle size={12} weight="fill" />
                {book.school}
              </div>
              {series && currentVolume ? (
                <>
                  <h1 className="text-2xl font-black">
                    {series.title}
                    <span className="text-amber-700 dark:text-[#C8A762]"> — {currentVolume.label}</span>
                  </h1>
                  {volumeNote && (
                    <p className="text-sm font-bold text-slate-600 dark:text-zinc-300 mt-1">{volumeNote}</p>
                  )}
                </>
              ) : (
                <h1 className="text-2xl font-black">{book.title}</h1>
              )}
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
                {isRTL ? "المؤلف:" : "Author:"} {book.author} | {isRTL ? "التحقيق:" : "Investigation:"} {book.investigator}
              </p>
              {/* Owner ٢٦٣: the book's موجز, so a lawyer sees at once what the
                  reference is about. Catalogue text (feqh_books.description),
                  shown to every viewer like the card. */}
              {book.description && (
                <p data-book-summary className="mt-2 max-w-3xl text-xs leading-relaxed whitespace-pre-line text-slate-600 dark:text-zinc-300">
                  <span className="font-bold text-amber-700 dark:text-[#C8A762]">{isRTL ? "موجز: " : "Summary: "}</span>
                  {book.description}
                </p>
              )}
              {/* Volume switcher: one book, many volumes (T28-24). A native
                  select — الإنصاف has 31 volumes, too many for chips — plus
                  the neighbouring volumes for reading straight on. Outside the
                  side panels, so it works on small screens too. */}
              {series && currentVolume && (
                <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                  <label htmlFor="book-volume-switcher" className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                    الجزء:
                  </label>
                  <select
                    id="book-volume-switcher"
                    value={currentVolume.id}
                    onChange={(e) => {
                      if (e.target.value !== currentVolume.id) router.push(`/book/${apiSlug(e.target.value)}`);
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
                      isDark ? "bg-zinc-800 border-white/10 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    {series.volumes.map((v) => (
                      <option key={v.id} value={v.id} title={v.title}>{v.label}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">({volumesCountLabel(series.volumes.length)})</span>
                  {prevVolume && (
                    <Link
                      href={`/book/${apiSlug(prevVolume.id)}`}
                      title={prevVolume.title}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition ${
                        isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <CaretRight size={12} />
                      <span>{prevVolume.label}</span>
                    </Link>
                  )}
                  {nextVolume && (
                    <Link
                      href={`/book/${apiSlug(nextVolume.id)}`}
                      title={nextVolume.title}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition ${
                        isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>{nextVolume.label}</span>
                      <CaretLeft size={12} />
                    </Link>
                  )}
                </div>
              )}
            </div>
            {/* Note ٠٢: «نسخ بالتوثيق» and «إضافة للمسودة» sit on the head of
                every block of the stream; the header keeps print and the draft. */}
            <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className={`px-4 py-2.5 text-xs font-bold border rounded-xl hover:opacity-90 transition flex items-center gap-1.5 ${
                    isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  title={isRTL ? "طباعة الكتاب" : "Print Book"}
                >
                  <Printer size={14} />
                  <span>{isRTL ? "طباعة" : "Print"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("nzamy-open-cart"))}
                  aria-label={isRTL ? `فتح المسودة (${cart.length})` : `Open draft (${cart.length})`}
                  className="relative px-4 py-2.5 text-xs font-bold bg-[#C8A762] text-[#0B3D2E] rounded-xl hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <Stack size={14} />
                  {isRTL ? "المسودة" : "Draft"}
                  {cart.length > 0 && (
                    <span className="ms-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0B3D2E] text-white text-[10px] font-black flex items-center justify-center">{cart.length}</span>
                  )}
                </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <Link
              href="/laws"
              className={`inline-flex items-center gap-2 text-xs font-bold transition-all ${
                isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-[#0B3D2E]"
              }`}
            >
              <ArrowRight size={14} className={isRTL ? "" : "rotate-180"} />
              {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
            </Link>

            <div
              role="group"
              aria-label={isRTL ? "طبقات النص" : "Text layers"}
              className={`inline-flex flex-wrap p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}
            >
              {READER_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  aria-pressed={viewLayer === layer.id}
                  onClick={() => setViewLayer(layer.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewLayer === layer.id
                      ? isDark ? "bg-[#0B3D2E] text-white shadow" : "bg-white text-zinc-900 shadow-sm"
                      : "text-slate-500 dark:text-zinc-400 hover:opacity-85"
                  }`}
                >
                  {isRTL ? layer.ar : layer.en}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Reading Mode Toggle Button */}
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
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-bold">{isRTL ? "حجم الخط:" : "Font Size:"}</span>
              <div className={`inline-flex p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/[0.05]" : "bg-slate-200"}`}>
                {(["normal", "large", "xlarge"] as const).map(sz => (
                  <button
                    key={sz}
                    onClick={() => setFontSize(sz)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      fontSize === sz
                        ? isDark ? "bg-[#C8A762] text-[#0B3D2E] shadow" : "bg-white text-amber-700 shadow-sm"
                        : "text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    {sz === "normal" ? (isRTL ? "عادي" : "A") : sz === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضخم" : "A++")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* N2.6: search every volume of the book with the library's operators;
            the matching passages stack here in full (paywall by the route). */}
        <ScopedSearchPanel
          key={`book:${book.id}`}
          scope={`book:${book.id}`}
          documentLabel="هذا الكتاب"
          volumeCount={series?.volumes.length ?? 1}
          isDark={isDark}
          onAddToDraft={addEntryToCart}
          inDraft={(id) => cartIds.has(id)}
        />

        {/* Workspace Layout */}
        <div className={isReadingMode ? "flex gap-6 items-start justify-center" : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full"}>

          {/* RIGHT COLUMN: Book Metadata Card AND TOC Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 shrink-0 sticky top-6 z-40 space-y-3 print:hidden">
              <IdentityPanel
                isDark={isDark}
                isRTL={isRTL}
                // The volume count is the series size. A single row's
                // total_volumes is its own volume number, not a count: no
                // series → no count rather than a wrong one (T28-24).
                book={{ ...book, totalVolumes: series ? series.volumes.length : undefined }}
                activeBlock={inViewBlock}
                setShowFolderModal={setShowFolderModal}
              />

              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                quickJumpQuery={quickJumpQuery}
                setQuickJumpQuery={setQuickJumpQuery}
                handleQuickJump={(q) => { void handleQuickJump(q); }}
                jumpError={jumpError}
                filteredChapters={filteredChapters}
                blocksBySection={blocksBySection}
                completeSections={completeSections}
                loadingSectionId={loadingSectionId}
                onOpenSection={(id) => { void handleOpenSection(id); }}
                activeBlockId={inViewBlock?.id ?? ""}
                activeSectionId={activeSectionId}
                handleScrollToBlock={handleScrollToBlock}
              />
            </aside>
          )}

          {/* Center Reading Container — owner note ٠٢: the book as one
              continuous stream, block under block, loading as it scrolls. */}
          <HighlightProvider query={highlightQuery}>
          <div
            ref={streamRootRef}
            className={`nzamy-reader-container ${isReadingMode ? "max-w-3xl w-full" : "col-span-12 lg:col-span-6"} min-w-0 print:col-span-12 print:w-full print:max-w-none space-y-4`}
          >
            {highlightQuery.trim() && (
              <div className="sticky top-20 z-30 print:hidden">
                {/* Counts are of the loaded part of the book, unless it is all here. */}
                <SearchLegendBar partial={!(stream.startsBook && stream.endsBook)} onClear={clearHighlight} />
              </div>
            )}
            <ScrollToFirstMark enabled={arrival && urlQuery !== "" && !searchQuery.trim()} loaded={stream.blocks.length} />

            {jumping && (
              <div role="status" className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-400 print:hidden">
                <span className="w-4 h-4 border-2 border-[#C8A762] border-t-transparent rounded-full animate-spin" />
                {isRTL ? "جارٍ الانتقال إلى الموضع…" : "Opening…"}
              </div>
            )}
            {navError && (
              <p role="alert" className="text-xs text-center font-bold text-red-600 dark:text-red-400 print:hidden">{navError}</p>
            )}

            {/* After a jump into the middle: what comes before, on request. */}
            {!stream.startsBook && stream.blocks.length > 0 && (
              <div className="text-center print:hidden">
                {beforeError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{beforeError}</p>
                )}
                <button
                  type="button"
                  onClick={() => { void loadBefore(); }}
                  disabled={loadingBefore}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold border rounded-xl transition disabled:opacity-60 ${
                    isDark ? "border-white/[0.07] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <CaretUp size={12} />
                  {loadingBefore ? "جارٍ التحميل…" : "عرض الصفحات السابقة لهذا الموضع"}
                </button>
              </div>
            )}

            {stream.blocks.map((block) => (
              <StreamBlock
                key={block.id}
                block={block}
                isActive={block.id === inViewBlock?.id}
                isDark={isDark}
                isRTL={isRTL}
                viewLayer={viewLayer}
                fontClass={fontClass}
                inDraft={cartIds.has(block.id)}
                copied={copiedBlockId === block.id}
                onCopy={handleCopyBlock}
                onAddToDraft={handleAddBlockToDraft}
              />
            ))}

            {stream.blocks.length === 0 && (
              <div className={`${card} p-8 text-center`}>
                <p className="text-xs text-slate-500">{isRTL ? "لا يوجد نص لهذا الكتاب بعد." : "This book has no text yet."}</p>
              </div>
            )}

            {/* The stream's end: the infinite-scroll sentinel, with a visible
                manual fallback; at the DOM cap, a fresh stream from here. */}
            {!stream.endsBook && stream.blocks.length > 0 && (
              <div ref={sentinelRef} className={`${card} p-4 text-center print:hidden`}>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">
                  {atCap
                    ? `عُرض ${stream.blocks.length} موضعاً متتالياً في هذه الصفحة؛ تابع القراءة من آخر موضع في عرض جديد.`
                    : `عُرض ${stream.blocks.length} موضعاً — تُحمَّل الصفحات التالية تلقائياً مع التمرير.`}
                </p>
                {moreError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{moreError}</p>
                )}
                {atCap ? (
                  <button
                    type="button"
                    onClick={() => {
                      const last = stream.blocks[stream.blocks.length - 1];
                      if (last?.orderIndex !== null && last?.orderIndex !== undefined) {
                        void startStreamAt(`from_order=${last.orderIndex}`, last.id).then((failed) => {
                          if (failed) setMoreError(failed.error);
                        });
                      }
                    }}
                    disabled={jumping}
                    className="px-4 py-2 text-xs font-bold bg-[#0B3D2E] text-white rounded-xl hover:opacity-90 transition disabled:opacity-60"
                  >
                    متابعة القراءة من هنا
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      // A manual retry clears a stall: the reader asked for it.
                      setStalled(false);
                      void loadMore();
                    }}
                    disabled={loadingMore}
                    className="px-4 py-2 text-xs font-bold bg-[#0B3D2E] text-white rounded-xl hover:opacity-90 transition disabled:opacity-60"
                  >
                    {loadingMore ? "جارٍ التحميل…" : moreError ? "إعادة المحاولة" : "تحميل المزيد من الصفحات"}
                  </button>
                )}
              </div>
            )}
            {stream.endsBook && stream.blocks.length > 0 && (
              <p className="text-center text-[11px] font-bold text-slate-500 dark:text-zinc-400 print:hidden">
                {isRTL ? "— نهاية الكتاب —" : "— End of book —"}
              </p>
            )}
          </div>
          </HighlightProvider>

          {/* LEFT COLUMN: AI Assistant & Tools */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 shrink-0 space-y-3 sticky top-6 z-40 print:hidden">
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

              {/* Notes stay keyed per block (existing notes keep their key);
                  the key follows the block in view once the reader rests. */}
              <ResearchWorkspace isDark={isDark} pageId={`feqh-${book.id}-${workspaceBlockId}`} isRTL={isRTL} />

              {/* Related Documents Card */}
              {((lawMeta.related_systems && lawMeta.related_systems.length > 0) ||
                (lawMeta.related_principles && lawMeta.related_principles.length > 0)) && (
                <div className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} space-y-3.5`}>
                  <h3 className="text-xs font-black text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 border-b pb-2 border-black/5 dark:border-white/5">
                    <Stack size={14} className="text-[#C8A762]" weight="fill" />
                    <span>{isRTL ? "وثائق وأنظمة ذات صلة" : "Related Documents"}</span>
                  </h3>

                  {/* Related Systems */}
                  {lawMeta.related_systems && lawMeta.related_systems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                        {isRTL ? "الأنظمة واللوائح المرتبطة:" : "Related Laws & Regs:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_systems.map((doc: any, idx: number) => (
                          <Link
                            key={idx}
                            href={`/laws/${doc.slug}`}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                              isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white" : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <span>{doc.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Principles */}
                  {lawMeta.related_principles && lawMeta.related_principles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-purple-600 dark:text-purple-400/90 uppercase tracking-wider">
                        {isRTL ? "المبادئ القضائية المرتبطة:" : "Related Judicial Principles:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_principles.map((doc: any, idx: number) => (
                          <Link
                            key={idx}
                            href={`/precedents/${doc.slug}`}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                              isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-300 hover:text-white" : "border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-[#0B3D2E]"
                            }`}
                          >
                            <span>{doc.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      <Footer />

      <FolderSelectionModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        currentDoc={currentDoc}
      />

      {/* ── Community Question Modal ── */}
      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={book?.title}
            onClose={() => setShowCommunity(false)}
          />
        )}
      </AnimatePresence>
      <PrintWatermark isRTL={isRTL} />
    </div>
  );
}
