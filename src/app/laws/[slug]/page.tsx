"use client";

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowUp, Crown, Stack, Check, Copy, BookOpen, Bookmark, Scales, Printer
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { PrintWatermark } from "@/app/laws/components/PrintWatermark";
import type { LawArticle, LawSystem } from "../data";
import { getLawMeta, fetchLawMetadata, SECTION_COLORS } from "../law-metadata-map";
import type { LawMetaEntry } from "../law-metadata-map";
import { PaywallModal } from "../components/PaywallModal";
import { useDraftCart } from "@/hooks/useDraftCart";
import {
  ArticleBlock,
  ArticleExplainModal,
  CommunityQuestionModal,
  DraftDrawer,
  LibraryAI,
  PreambleBlock,
  MD,
  type CartEntry,
} from "./_components";
import FolderSelectionModal from "@/components/laws/FolderSelectionModal";
import SidebarPanel from "./_sidebar";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
import { apiSlug } from '@/utils/apiSlug';

function LawSystemPageContent() {
  const { isDark, isRTL }  = useTheme();
  const { userType, isLoggedIn } = useUser();

  const [showFolderModal, setShowFolderModal] = useState(false);
  const params = useParams();
  const slug = (params?.slug as string) ?? "companies-law";

  const [lawMeta, setLawMeta] = useState<LawMetaEntry>(() => getLawMeta(slug));

  useEffect(() => {
    let cancelled = false;
    fetchLawMetadata(slug).then(meta => {
      if (!cancelled) setLawMeta(meta);
    });
    return () => { cancelled = true; };
  }, [slug]);

  const [showPaywall, setShowPaywall] = useState(false);
  const [showCart,    setShowCart]    = useState(false);
  const [activeId,    setActiveId]    = useState<string>("art-1");
  const [explainArticle, setExplainArticle] = useState<LawArticle | null>(null);
  // Starts empty. This used to default to the bundled COMPANIES_LAW, which meant
  // every law page — whichever one you opened — briefly rendered نظام الشركات
  // while its own data loaded. The `if (!law)` guard below the loading/error
  // early-returns is what lets the rest of the component keep reading `law.x`.
  const [law, setLaw] = useState<LawSystem | null>(null);
  // The server-enforced free-article count for THIS law, straight off
  // `paywall.freeLimit` in the API response below (checkLibraryAccess — folds
  // in any per-law override, not just the platform default). Kept separate
  // from `law` because LawSystem has no paywall field; PaywallModal falls
  // back to its own default when this is still null (loading, or the fetch
  // failed before setting it).
  const [libraryFreeLimit, setLibraryFreeLimit] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jumpQuery,  setJumpQuery]  = useState("");  // بحث سريع للمواد
  const [fontSize,        setFontSize]        = useState<"normal"|"large"|"xlarge">("normal"); // حجم الخط
  const [showCommunity,   setShowCommunity]   = useState(false); // popup اسأل المجتمع
  const isScrolling = useRef(false);                 // منع تعارض scroll و click
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false); // زر العودة لأعلى

  // ── Scroll-to-Top observer ──
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  const searchParams = useSearchParams();
  const initialViewMode = (searchParams?.get("viewMode") as "all" | "law" | "regulation" | "appendix") || "all";
  const [viewMode, setViewMode] = useState<"all" | "law" | "regulation" | "appendix">(initialViewMode);
  const [selectedRegName, setSelectedRegName] = useState<string | null>(null); // فلتر اللائحة المختارة عند تعددها

  useEffect(() => {
    const mode = searchParams?.get("viewMode");
    if (mode === "all" || mode === "law" || mode === "regulation" || mode === "appendix") {
      setViewMode(mode);
    }
  }, [searchParams]);

  // Cart: global, backed by localStorage via useDraftCart
  const { cart, setCart } = useDraftCart();

    // ── Dynamic slug loading (API-backed) ──────────────────────────────────
  useEffect(() => {
    async function loadLaw() {
      // NOTE: `companies-law` used to short-circuit to the bundled COMPANIES_LAW
      // constant here, BEFORE the fetch — so the reader never asked the database
      // for it. Measured: the database holds 281 articles for that law and the
      // bundled constant held 17, so 264 articles were invisible, and because no
      // request was made the SERVER-SIDE paywall never ran for it either (the
      // 13 "locked" articles shipped in full inside the JS bundle).
      //
      // A second fallback here did `await import('@/constants/laws/<slug>.json')`.
      // That directory does not exist in the repo at all, so the import always
      // threw and the catch set loadError — identical to having no fallback,
      // except it also emitted a build warning on every build.
      //
      // Both are gone: every law now takes the same API path.
      try {
        setLoadError(false);
        setLoading(true);
        const res = await fetch(`/api/library/laws/${apiSlug(slug)}`);
        if (!res.ok) {
          console.warn(`[LawReader] Law "${slug}" not found in API (${res.status})`);
          setLoadError(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setLibraryFreeLimit(
          typeof data?.paywall?.freeLimit === "number" ? data.paywall.freeLimit : null,
        );
        // Transform API response to match LawSystem interface
        setLaw({
          id: data.id || data.slug,
          slug: data.slug,
          title: data.title,
          titleEn: data.titleEn || '',
          documentType: data.documentType || '',
          issuanceDecree: data.issuanceDecree || '',
          issuanceDate: data.issuanceDate || '',
          source: data.source || '',
          // ك-02 (2026-08-23): whitelist mapping — omitting a field here
          // silently discards it (see the `originalText` note below this
          // block from an earlier incident of the same kind).
          law_status: data.law_status || 'active',
          preamble: data.preamble || '',
          chapters: (data.chapters || []).map((ch: { title: string; articles: LawArticle[] }) => ({
            title: ch.title,
            articles: (ch.articles || []).map((a: LawArticle) => ({
              id: a.id,
              num: a.num,
              // Raw locator parts — the citation builder uses these instead of
              // regex-stripping the display label.
              number: a.number,
              numberText: a.numberText,
              title: a.title || '',
              status: a.status || 'active',
              free: a.free ?? true,
              text: a.text || '',
              // This mapping is a whitelist: anything omitted here is silently
              // discarded before the renderer ever sees it. originalText was
              // omitted, so the article's superseded wording never arrived —
              // and for a repealed article that IS the article (1,613 of 1,862
              // have an empty `text` and their whole substance in originalText).
              originalText: a.originalText,
              historicRegulationText: a.historicRegulationText,
              executiveReg: a.executiveReg,
              regulations: a.regulations,
              amendments: a.amendments,
              instrument: a.instrument,
            })),
          })),
          summary: data.summary || '',
          metadata_card: data.metadata_card || null,
          appendices: data.appendices || null,
          regulationPreamble: data.regulationPreamble || '',
          regulationInstruments: data.regulationInstruments || [],
        } as LawSystem);
      } catch (err) {
        console.error('[LawReader] Failed to load law:', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadLaw();
  }, [slug]);

  // ── Persist law name + track activity ────────────────────────────────────
  useEffect(() => {
    if (slug && law?.title) {
      localStorage.setItem(`nzamy_law_title_${slug}`, law.title);
      try {
        const raw = localStorage.getItem("nzamy_activity");
        const data = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        const weekMs  = 7  * 24 * 60 * 60 * 1000;
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        if (!data.lastWeekReset  || now - data.lastWeekReset  > weekMs)  { data.lawsThisWeek  = 0; data.lastWeekReset  = now; }
        if (!data.lastMonthReset || now - data.lastMonthReset > monthMs) { data.lawsThisMonth = 0; data.lastMonthReset = now; }
        data.lawsThisWeek  = (data.lawsThisWeek  || 0) + 1;
        data.lawsThisMonth = (data.lawsThisMonth || 0) + 1;
        localStorage.setItem("nzamy_activity", JSON.stringify(data));
      } catch {}
    }
  }, [slug, law?.title]);

  // Track this law in recent sessions
  useEffect(() => {
    if (!slug || !law?.title) return;
    try {
      const meta = lawMeta;
      const raw = localStorage.getItem("nzamy_recent_sessions");
      const sessions = raw ? JSON.parse(raw) : [];
      const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "law"));
      filtered.unshift({
        slug,
        title: law.title,
        titleEn: law.titleEn || law.title,
        catId: meta.section_code ? `SA-${meta.section_code}` : "SA-00",
        type: "law"
      });
      localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  }, [slug, law?.title, lawMeta]);


  // ── Persist law name + track activity ────────────────────────────────────
  useEffect(() => {
    if (slug && law?.title) {
      localStorage.setItem(`nzamy_law_title_${slug}`, law.title);
      try {
        const raw = localStorage.getItem("nzamy_activity");
        const data = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        const weekMs  = 7  * 24 * 60 * 60 * 1000;
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        if (!data.lastWeekReset  || now - data.lastWeekReset  > weekMs)  { data.lawsThisWeek  = 0; data.lastWeekReset  = now; }
        if (!data.lastMonthReset || now - data.lastMonthReset > monthMs) { data.lawsThisMonth = 0; data.lastMonthReset = now; }
        data.lawsThisWeek  = (data.lawsThisWeek  || 0) + 1;
        data.lawsThisMonth = (data.lawsThisMonth || 0) + 1;
        localStorage.setItem("nzamy_activity", JSON.stringify(data));
      } catch {}
    }
  }, [slug, law?.title]);

  // Track this law in recent sessions
  useEffect(() => {
    if (!slug || !law?.title) return;
    try {
      const meta = getLawMeta(slug);
      const raw = localStorage.getItem("nzamy_recent_sessions");
      const sessions = raw ? JSON.parse(raw) : [];
      const filtered = sessions.filter((s: any) => !(s.slug === slug && s.type === "law"));
      filtered.unshift({
        slug,
        title: law.title,
        titleEn: law.titleEn || law.title,
        catId: meta.section_code ? `SA-${meta.section_code}` : "SA-00",
        type: "law"
      });
      localStorage.setItem("nzamy_recent_sessions", JSON.stringify(filtered.slice(0, 10)));
    } catch (e) {
      console.error(e);
    }
  }, [slug, law]);

  // Listen to open folder modal from mobile trigger stacked FAB
  useEffect(() => {
    const handleOpenFolder = () => setShowFolderModal(true);
    window.addEventListener("nzamy-open-folder-modal", handleOpenFolder);
    return () => window.removeEventListener("nzamy-open-folder-modal", handleOpenFolder);
  }, []);

  // Current Document Meta for folder auto-add
  const currentDoc = useMemo(() => {
    const meta = getLawMeta(slug);
    // ⚠️ `law` is null until the first fetch resolves, and this memo runs during
    // that render. The `as any` cast hides that from the type checker entirely —
    // `tsc --noEmit` reports zero errors either way — so the optional chaining
    // here is load-bearing, not cosmetic.
    //
    // It is also easy to "verify" as working when it is not: getLawMeta returns
    // {} for any slug absent from law-metadata-map.ts, so `meta.section_code` is
    // falsy and the `||` falls through to this dereference. companies-law HAS a
    // section_code in that map, so testing that page alone passes while most of
    // the 1,532-document corpus throws.
    const sectionCode = meta.section_code || (law as any)?.section_code;
    return {
      slug,
      title: law?.title ?? "",
      titleEn: law?.titleEn || law?.title || "",
      catId: sectionCode ? `SA-${sectionCode}` : "SA-00",
      type: "law" as const
    };
  }, [slug, law]);

  // ك-13: `executiveReg` كان الشكل الوحيد القديم (مادة واحدة = كتلة لائحة
  // مدموجة واحدة). `regulations[]` (مصفوفة، مادة لائحة واحدة لكل عنصر مع
  // regNum حقيقي) هو المصدر الحيّ الآن — route.ts ما زال يبني executiveReg
  // بدمج نفس المصفوفة (ref مُفرَّق بفاصلة، text مدموج بسطرين فارغين) لأجل
  // مستهلكين لم يُرحَّلوا بعد؛ هذه الدالة تُعيد بناء نفس الدمج محلياً بدل
  // القراءة من executiveReg، فتحافظ حرفياً على سلوك كل الاستدلالات أدناه
  // (extractRegFullName/extractRegNum) بلا أي تغيير بمنطقها الداخلي.
  const getMergedReg = (art: any): { ref: string; text: string } | null => {
    if (!art.regulations || art.regulations.length === 0) return null;
    const distinctRefs = Array.from(
      new Set(art.regulations.map((r: any) => String(r.ref || "")).filter(Boolean)),
    );
    return {
      ref: distinctRefs.join(", "),
      text: art.regulations.map((r: any) => String(r.text || "")).join("\n\n"),
    };
  };

  // ── كشف أسماء اللوائح المتعددة في النظام الواحد ──────────────────────────
  // ── كشف الأسماء الكاملة للتشريعات الفرعية (لوائح/قواعد/ضوابط/تعليمات) ──
  const extractRegFullName = (art: any): string => {
    // 1) إذا كانت المادة مدمجة ولها لائحة (regulations[])
    const mergedReg = getMergedReg(art);
    if (mergedReg) {
      const ref = mergedReg.ref.trim();
      const text = mergedReg.text.trim();

      // محاولة استخراج الاسم من أول خط عريض في متن نص اللائحة (وهي الطريقة الأدق والأسلم للوائح المدمجة)
      const boldMatch = text.match(/^\s*\*\*(.+?):\*\*/) || text.match(/^\s*\*\*(.+?)\*\*/);
      if (boldMatch) {
        const candidate = boldMatch[1].trim();
        // نتأكد أن الاسم المستخرج هو اسم اللائحة وليس مجرد كلمة المادة
        if (candidate.length > 5 && 
            !candidate.match(/^المادة\s+/) && 
            (candidate.includes("اللائحة") || candidate.includes("الائحة") || candidate.includes("قواعد") || candidate.includes("ضوابط") || candidate.includes("تعليمات") || candidate.includes("ملحق"))) {
          return candidate;
        }
      }

      if (ref) {
        const cleaned = ref
          .replace(/^من\s+/, "")
          .replace(/^المادة\s+المقابلة\s+(في|من)\s+/, "")
          .replace(/^المواد\s+المقابلة\s+(في|من)\s+/, "")
          .trim();
        // نتأكد أن الاسم النظيف ليس مجرد رقم مادة
        if (cleaned.length > 20) return cleaned;
        if (cleaned.length > 5 && 
            !cleaned.match(/^اللائحة\s*التنفيذية\s*$/) && 
            !cleaned.match(/^المادة\s+/) && 
            !cleaned.match(/^(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة)/)) {
          return cleaned;
        }
      }
      
      // Fallback للنوع من ref+text
      const combined = ref + " " + text;
      if (combined.includes("قواعد التطبيق")) return "قواعد التطبيق";
      if (combined.includes("القواعد التنفيذية")) return "القواعد التنفيذية";
      if (combined.includes("ضوابط التطبيق")) return "ضوابط التطبيق";
      if (combined.includes("الضوابط")) return "الضوابط";
      if (combined.includes("تعليمات التطبيق")) return "تعليمات التطبيق";
      if (combined.includes("التعليمات")) return "التعليمات";
      if (combined.includes("اللائحة التنفيذية")) return "اللائحة التنفيذية";
      if (combined.includes("اللائحة")) return "اللائحة";
      return ref.substring(0, 40).trim() || "التشريع الفرعي";
    }

    // 2) إذا كانت المادة مستقلة (instrument: لائحة أو ملحق)
    if (art.instrument === "لائحة" || art.instrument === "ملحق") {
      const text = art.text || "";
      // محاولة استخراج الاسم من أول bold label في النص (مثال: > **لائحة الوثائق القضائية:**)
      const boldMatch = text.match(/^\s*>\s*\*\*(.+?):\*\*/m) || text.match(/>\s*\*\*(.+?)\*\*/m);
      if (boldMatch) {
        return boldMatch[1].trim();
      }
      return art.instrument === "لائحة" ? "لائحة مستقلة" : "ملحق مستقل";
    }

    return "النظام الأساسي";
  };

  const availableRegNames = useMemo(() => {
    const names = new Set<string>();
    if (!law?.chapters) return [];
    for (const ch of law.chapters) {
      for (const art of ch.articles) {
        if ((art.regulations && art.regulations.length > 0) || art.instrument === "لائحة" || art.instrument === "ملحق") {
          const regName = extractRegFullName(art);
          if (regName && regName !== "النظام الأساسي") {
            names.add(regName);
          }
        }
      }
    }
    return Array.from(names);
  }, [law]);


  const regulationTabLabel = useMemo(() => {
    // إذا كان هناك نوع واحد فقط → نسميه باسمه (مثل "اللائحة التنفيذية فقط" أو "الضوابط فقط")
    // إذا كان هناك أكثر من نوع → "التشريعات الفرعية" (شامل)
    if (availableRegNames.length === 1) {
      const name = availableRegNames[0];
      // اسم قصير → نضيف "فقط"
      if (name.length <= 25) return isRTL ? `${name} فقط` : "Sub-legislation Only";
      // اسم طويل → نختصره
      return isRTL ? "التشريعات الفرعية" : "Sub-legislation";
    }
    return isRTL ? "التشريعات الفرعية" : "Sub-legislation";
  }, [availableRegNames, isRTL]);

  // ــ Intersection Observer: تحديث activeId عند السكرول تلقائياً ــــــــــــــــــ
  useEffect(() => {
    if (!law) return;
    const ids = law.chapters.flatMap(ch => ch.articles.map(a => a.id));
    const observers = ids.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrolling.current) {
            setActiveId(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, [law]);

  const sectionColors = SECTION_COLORS[lawMeta.section_code ?? "00"];

  const allArticles  = law?.chapters.flatMap(ch => ch.articles) ?? [];
  const activeArticle = allArticles.find(a => a.id === activeId) ?? null;
  const cartMap      = new Map(cart.map(e => [e.articleId, e]));

  // فلترة البحث الشاملة — رقم المادة + عنوانها + نص المادة + اللائحة التنفيذية
  const filteredArticles = (() => {
    const q = jumpQuery.trim();
    if (!q) return null; // null = no filter, show full chapter tree
    const normalize = (s: string) =>
      s.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي").toLowerCase();
    const nq = normalize(q);
    return allArticles.filter(a => {
      const mergedReg = getMergedReg(a);
      const haystack = normalize([
        a.num,
        a.title ?? "",
        a.text,
        mergedReg?.text ?? "",
        mergedReg?.ref  ?? "",
        a.id,
      ].join(" "));
      return haystack.includes(nq);
    });
  })();

  const getOrCreateEntry = useCallback((a: LawArticle): CartEntry => {
    const mergedReg = getMergedReg(a);
    return {
      articleId: a.id, articleNum: a.num, articleTitle: a.title, articleText: a.text,
      lawName: law?.title ?? "", lawSlug: law?.slug ?? slug,
      execReg: mergedReg ? { ref: mergedReg.ref, text: mergedReg.text } : undefined,
      principles: [], precedents: [], isArticleAdded: false, isExecRegAdded: false,
    };
  }, [law?.title, law?.slug, slug]);

  const addArticle = useCallback((a: LawArticle) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === a.id);
      if (exists) return prev.map(e => e.articleId === a.id ? { ...e, isArticleAdded: true } : e);
      return [...prev, { ...getOrCreateEntry(a), isArticleAdded: true }];
    });
  }, [getOrCreateEntry, setCart]);

  const removeArticle = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isExecRegAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isArticleAdded: false } : e);
    });
  }, [setCart]);

  const addExecReg = useCallback((a: LawArticle) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === a.id);
      if (exists) return prev.map(e => e.articleId === a.id ? { ...e, isExecRegAdded: true } : e);
      return [...prev, { ...getOrCreateEntry(a), isExecRegAdded: true }];
    });
  }, [getOrCreateEntry, setCart]);

  const removeExecReg = useCallback((id: string) => {
    setCart(prev => {
      const exists = prev.find(e => e.articleId === id);
      if (!exists) return prev;
      const hasOthers = exists.isArticleAdded || exists.principles.length > 0 || exists.precedents.length > 0;
      if (!hasOthers) return prev.filter(e => e.articleId !== id);
      return prev.map(e => e.articleId === id ? { ...e, isExecRegAdded: false } : e);
    });
  }, [setCart]);

  const clearAll = useCallback(() => setCart([]), [setCart]);

  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;
  const lawTitle = (isRTL ? law?.title : law?.titleEn) ?? "";
  const fontClass = { normal: "text-[13px]", large: "text-[15px]", xlarge: "text-[17px]" }[fontSize];

  // Copy DRAFT — HTML Clipboard (Bold في Word)
  const [copiedDraft, setCopiedDraft] = useState(false);
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

  const layoutClass = "flex-row";

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <main className="flex-1 max-w-[1280px] mx-auto w-full px-3 py-8 pt-32 pb-24 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-t-[#0B3D2E] border-slate-200 dark:border-white/10 animate-spin" />
            <p className={`text-sm font-bold ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {isRTL ? "جاري تحميل تفاصيل التشريع..." : "Loading law details..."}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // `law` is null only before the first successful load. `loading` covers that
  // window, so this is a belt-and-braces guard — but it is also what narrows the
  // type for the ~24 `law.x` reads below now that the state starts empty.
  if (!law && !loadError) return null;

  if (loadError || !law) {
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <main className="flex-1 max-w-[1280px] mx-auto w-full px-3 py-8 pt-32 pb-24 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-md p-6 rounded-2xl border border-red-500/20 bg-red-500/5">
            <Scales size={48} className="text-red-500" />
            <h2 className="text-lg font-black">{isRTL ? "عذراً، لم نتمكن من العثور على هذا التشريع" : "Law Not Found"}</h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {isRTL 
                ? "قد يكون الرابط غير صحيح، أو أن الوثيقة لم ترفع بعد. يمكنك العودة إلى الفهرس الرئيسي والبحث من جديد." 
                : "The requested document might not be available or the link is incorrect."}
            </p>
            <Link href="/laws" className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
              {isRTL ? "العودة إلى المكتبة القانونية" : "Back to Legal Library"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <main className="flex-1 max-w-[1280px] mx-auto w-full px-3 py-8 pt-32 pb-24">

        <div className="h-6" />

        {/* ── Law header ── */}
        <div className={`${card} ${border} p-4 mb-5`}>
          <div className={`flex items-center gap-2 text-[11px] mb-3 print:hidden ${muted}`}>
            <Link href="/laws" className="hover:underline">{isRTL ? "المكتبة القانونية" : "Legal Library"}</Link>
            <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
            <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>{lawTitle}</span>
          </div>
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div>
              <h1 className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{lawTitle}</h1>
              <p className={`text-[12px] ${muted}`}>{law.issuanceDecree}</p>
            </div>
            <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                    isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  title={isRTL ? "طباعة النظام" : "Print Law"}
                >
                  <Printer size={11} />
                  <span>{isRTL ? "طباعة" : "Print"}</span>
                </button>
                <button
                  onClick={handleCopyDraft}
                  disabled={cart.length === 0}
                title={cart.length === 0 ? (isRTL ? "أضف مواد للمسودة أولاً" : "Add articles to the draft first") : (isRTL ? "نسخ محتوى المسودة" : "Copy draft content")}
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

        {/* ــ شريط وضع القراءة وحجم الخط والعودة ــ */}
        <div className={`relative z-45 flex flex-wrap items-center justify-between gap-4 mb-3 print:hidden ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
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
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition font-semibold ${
                    fontSize === size
                      ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-amber-400 text-amber-700 bg-amber-50"
                      : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {size === "normal" ? (isRTL ? "عادي" : "A") : size === "large" ? (isRTL ? "كبير" : "A+") : (isRTL ? "ضغم" : "A++")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Dynamic layout ── */}
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${isReadingMode ? "justify-center" : ""}`}>

          {/* RIGHT COLUMN: Identity Panel AND Index Panel */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ overscrollBehavior: 'auto' }}>
              {/* Identity Card */}
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                law={law}
                lawMeta={lawMeta}
                sectionColors={sectionColors}
                activeId={activeId}
                setActiveId={setActiveId}
                jumpQuery={jumpQuery}
                setJumpQuery={setJumpQuery}
                filteredArticles={filteredArticles}
                cartMap={cartMap}
                isScrolling={isScrolling}
                setShowFolderModal={setShowFolderModal}
                setShowPaywall={setShowPaywall}
                userType={userType}
                mode="identity"
                viewMode={viewMode as any}
              />
              {/* Index Panel */}
              <SidebarPanel
                isDark={isDark}
                isRTL={isRTL}
                law={law}
                lawMeta={lawMeta}
                sectionColors={sectionColors}
                activeId={activeId}
                setActiveId={setActiveId}
                jumpQuery={jumpQuery}
                setJumpQuery={setJumpQuery}
                filteredArticles={filteredArticles}
                cartMap={cartMap}
                isScrolling={isScrolling}
                setShowFolderModal={setShowFolderModal}
                setShowPaywall={setShowPaywall}
                userType={userType}
                mode="index"
                viewMode={viewMode as any}
              />
            </aside>
          )}

          {/* CENTER COLUMN: Articles list */}
          <div className={`nzamy-reader-container col-span-12 min-w-0 space-y-4 ${isReadingMode ? "max-w-3xl mx-auto w-full" : "lg:col-span-6"}`}>
            {/* View Mode Switcher (Tabs) */}
            {!isReadingMode && (
              <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"} w-fit mb-4 print:hidden`}>
                <button
                  onClick={() => setViewMode("all")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "all"
                      ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {isRTL ? "عرض الكل" : "All View"}
                </button>
                <button
                  onClick={() => setViewMode("law")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "law"
                      ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {isRTL ? "النظام فقط" : "Law Only"}
                </button>
                {law.chapters.some(ch => ch.articles.some(a => a.regulations && a.regulations.length > 0)) && (
                  <button
                    onClick={() => setViewMode("regulation")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === "regulation"
                        ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {regulationTabLabel}
                  </button>
                )}
                {law.appendices && law.appendices.length > 0 && (
                  <button
                    onClick={() => setViewMode("appendix")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === "appendix"
                        ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {isRTL ? "الجداول والملاحق فقط" : "Tables & Appendices Only"}
                  </button>
                )}
              </div>
            )}

            {/* Preamble */}
            <PreambleBlock
              text={law.preamble}
              regulationPreamble={(law as any).regulationPreamble}
            isDark={isDark}
              isRTL={isRTL}
              viewMode={viewMode as any}
            />

            {viewMode === "appendix" ? (
              <div className="space-y-4">
                {(law.appendices ?? []).map(app => (
                  <div key={app.id} className={`${card} ${border} p-5`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
                        {app.type === "جدول" ? (isRTL ? "📊 جدول" : "📊 Table") : (isRTL ? "📁 ملحق" : "📁 Appendix")}
                      </span>
                      <h3 className={`font-bold text-sm ${isDark ? "text-white" : "text-zinc-900"}`}>{app.title}</h3>
                    </div>
                    <div className="leading-relaxed">
                      <MD text={app.content} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === "regulation" && (law as any).regulationInstruments?.length > 0 ? (
              // ── العرض المسطَّح الجديد "اللائحة وحدها" ──────────────────────
              // مبني من law.regulationInstruments (محسوب مسبقاً من الخادم:
              // مجمَّع بـref، مرتَّب بـsort_key، ومُستبعَد منه is_secondary_display)
              // بدل محاولة استنتاج الترتيب من نص/ref كل مادة نظامية بتخمين هش.
              // راجع 00_عقل_القوانين/13_دليل_المبرمج/02_عقد_اللوائح_المدمجة_والبذر.md §1-3-د.
              <div className="space-y-4">
                {(() => {
                  const instruments = (law as any).regulationInstruments as Array<{
                    ref: string;
                    articles: { regNum: string | null; text: string; status: string; systemArticleNumber: string | null }[];
                  }>;
                  const visible = selectedRegName
                    ? instruments.filter((i) => i.ref === selectedRegName)
                    : instruments;

                  return (
                    <>
                      {instruments.length > 1 && (
                        <div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
                          <button
                            onClick={() => setSelectedRegName(null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              selectedRegName === null
                                ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                                : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {isRTL ? "الكل" : "All"}
                          </button>
                          {instruments.map((inst) => (
                            <button
                              key={inst.ref}
                              onClick={() => setSelectedRegName(inst.ref)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                selectedRegName === inst.ref
                                  ? isDark ? "bg-[#C8A762] text-[#0B3D2E]" : "bg-amber-100 text-amber-800 border border-amber-300"
                                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                              }`}
                            >
                              {inst.ref}
                            </button>
                          ))}
                        </div>
                      )}
                      {visible.map((inst) => (
                        <div key={inst.ref} className="space-y-3">
                          {inst.articles.map((a, i) => (
                            <div
                              key={`${inst.ref}-${a.regNum ?? i}`}
                              className={`rounded-xl border p-4 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}
                            >
                              <MD text={a.text} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            ) : viewMode === "regulation" ? (
              <div className="space-y-4">
                {/* ── اختيار اللائحة عند تعدد اللوائح (نمط تراجعي: بيانات قديمة بلا regulationInstruments) ── */}
                {availableRegNames.length > 1 && (
                  <div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
                    <button
                      onClick={() => setSelectedRegName(null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedRegName === null
                          ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
                          : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {isRTL ? "الكل" : "All"}
                    </button>
                    {availableRegNames.map((name) => (
                      <button
                        key={name}
                        onClick={() => setSelectedRegName(name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          selectedRegName === name
                            ? isDark ? "bg-[#C8A762] text-[#0B3D2E]" : "bg-amber-100 text-amber-800 border border-amber-300"
                            : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}

                {(() => {
                  // ── تحويل الأعداد الترتيبية العربية اللفظية إلى أرقام تسلسلية للترتيب ──
                  const parseArabicNumeral = (numStr: string): number => {
                    const clean = numStr.replace(/^المادة\s+/, "").trim();
                    const units: Record<string, number> = {
                      "الأولى": 1, "الأول": 1, "الواحدة": 1, "واحد": 1,
                      "الثانية": 2, "الثاني": 2, "اثنان": 2,
                      "الثالثة": 3, "الثالث": 3, "ثلاثة": 3,
                      "الرابعة": 4, "الرابع": 4, "أربعة": 4,
                      "الخامسة": 5, "الخامس": 5, "خمسة": 5,
                      "السادسة": 6, "السادس": 6, "ستة": 6,
                      "السابعة": 7, "السابع": 7, "سبعة": 7,
                      "الثامنة": 8, "الثامن": 8, "ثمانية": 8,
                      "التاسعة": 9, "التاسع": 9, "تسعة": 9,
                      "العاشرة": 10, "العاشر": 10, "عشرة": 10,
                      "الحادية عشرة": 11, "الحادي عشر": 11,
                      "الثانية عشرة": 12, "الثاني عشر": 12,
                      "الثالثة عشرة": 13, "الثالث عشر": 13,
                      "الرابعة عشرة": 14, "الرابع عشر": 14,
                      "الخامسة عشرة": 15, "الخامس عشر": 15,
                      "السادسة عشرة": 16, "السادس عشر": 16,
                      "السابعة عشرة": 17, "السابع عشر": 17,
                      "الثامنة عشرة": 18, "الثامن عشر": 18,
                      "التاسعة عشرة": 19, "التاسع عشر": 19
                    };

                    const tens: Record<string, number> = {
                      "العشرون": 20, "العشرين": 20,
                      "الثلاثون": 30, "الثلاثين": 30,
                      "الأربعون": 40, "الأربعين": 40,
                      "الخمسون": 50, "الخمسين": 50,
                      "الستون": 60, "الستين": 60,
                      "السبعون": 70, "السبعين": 70,
                      "الثمانون": 80, "الثمانين": 80,
                      "التسعون": 90, "التسعين": 90
                    };

                    const hundreds: Record<string, number> = {
                      "المائة": 100, "المئة": 100,
                      "المائتين": 200, "المئتين": 200,
                      "الثلاثمائة": 300,
                      "الأربعمائة": 400
                    };

                    if (units[clean]) return units[clean];
                    if (tens[clean]) return tens[clean];
                    if (hundreds[clean]) return hundreds[clean];

                    // تركيبية مثل: الحادية والعشرون...
                    const waSplit = clean.split(/\s+و\s+/);
                    if (waSplit.length === 2) {
                      const unitPart = waSplit[0];
                      const tenPart = waSplit[1];
                      if (units[unitPart] && tens[tenPart]) {
                        return units[unitPart] + tens[tenPart];
                      }
                    }

                    // تركيبية مع مئات مثل: الأولى بعد المائة
                    const afterSplit = clean.split(/\s+بعد\s+/);
                    if (afterSplit.length === 2) {
                      const unitPart = afterSplit[0];
                      const hundredPart = afterSplit[1];
                      let unitVal = 0;
                      if (units[unitPart]) unitVal = units[unitPart];
                      else {
                        const subWa = unitPart.split(/\s+و\s+/);
                        if (subWa.length === 2 && units[subWa[0]] && tens[subWa[1]]) {
                          unitVal = units[subWa[0]] + tens[subWa[1]];
                        }
                      }
                      if (hundreds[hundredPart]) {
                        return unitVal + hundreds[hundredPart];
                      }
                    }

                    const numMatch = clean.match(/\d+/);
                    if (numMatch) return parseInt(numMatch[0], 10);

                    return 9_999;
                  };

                  // ── استخراج رقم مادة اللائحة: regNum الحقيقي أولاً (ك-13، مصدر
                  // موثوق من article_regulations.reg_num)، ثم الاستدلال النصي
                  // القديم كشبكة أمان فقط حين regNum غائب/فارغ ──
                  const parseRegNumString = (raw: string): number | null => {
                    const slash = raw.match(/(\d+)\s*\/\s*(\d+)/);
                    if (slash) return parseInt(slash[1], 10) * 1000 + parseInt(slash[2], 10);
                    const plain = raw.match(/\d+/);
                    if (plain) return parseInt(plain[0], 10) * 1000;
                    return null;
                  };
                  const extractRegNum = (art: any): number => {
                    const realRegNum = art.regulations?.[0]?.regNum;
                    if (realRegNum) {
                      const parsed = parseRegNumString(String(realRegNum));
                      if (parsed !== null) return parsed;
                    }
                    const mergedReg = getMergedReg(art);
                    if (mergedReg) {
                      const text = mergedReg.text || "";
                      const ref  = mergedReg.ref  || "";
                      // أولاً: نمط (X/Y) في التكست — مثل المادة (1/3) → أولوية X*1000+Y
                      const slashMatch = text.match(/#*\s*\u0627\u0644\u0645\u0627\u062f\u0629\s*\((\d+)\/(\d+)\)/);
                      if (slashMatch) return parseInt(slashMatch[1], 10) * 1000 + parseInt(slashMatch[2], 10);
                      // ثانياً: رقم بسيط داخل قوسين في التكست — مثل (3)
                      const parenText = text.match(/\u0627\u0644\u0645\u0627\u062f\u0629\s*\((\d+)\)/);
                      if (parenText) return parseInt(parenText[1], 10) * 1000;
                      // ثالثاً: رقم داخل قوسين في ref
                      const parenRef = ref.match(/\((\d+)\)/);
                      if (parenRef) return parseInt(parenRef[1], 10) * 1000;
                      // رابعاً: أرقام عربية كلامية في ref
                      const arabicNums: Record<string, number> = {
                        "\u0627\u0644\u0623\u0648\u0644\u0649": 1, "\u0627\u0644\u0623\u0648\u0644": 1,
                        "\u0627\u0644\u062b\u0627\u0646\u064a\u0629": 2, "\u0627\u0644\u062b\u0627\u0646\u064a": 2,
                        "\u0627\u0644\u062b\u0627\u0644\u062b\u0629": 3, "\u0627\u0644\u062b\u0627\u0644\u062b": 3,
                        "\u0627\u0644\u0631\u0627\u0628\u0639\u0629": 4, "\u0627\u0644\u0631\u0627\u0628\u0639": 4,
                        "\u0627\u0644\u062e\u0627\u0645\u0633\u0629": 5, "\u0627\u0644\u062e\u0627\u0645\u0633": 5,
                        "\u0627\u0644\u0633\u0627\u062f\u0633\u0629": 6, "\u0627\u0644\u0633\u0627\u062f\u0633": 6,
                        "\u0627\u0644\u0633\u0627\u0628\u0639\u0629": 7, "\u0627\u0644\u0633\u0627\u0628\u0639": 7,
                        "\u0627\u0644\u062b\u0627\u0645\u0646\u0629": 8, "\u0627\u0644\u062b\u0627\u0645\u0646": 8,
                        "\u0627\u0644\u062a\u0627\u0633\u0639\u0629": 9, "\u0627\u0644\u062a\u0627\u0633\u0639": 9,
                        "\u0627\u0644\u0639\u0627\u0634\u0631\u0629": 10, "\u0627\u0644\u0639\u0627\u0634\u0631": 10,
                      };
                      for (const [word, num] of Object.entries(arabicNums)) {
                        if (ref.includes(word)) return num * 1000;
                      }
                      return 9_999_000;
                    }

                    // إذا كانت مادة مستقلة، نستخرج رقمها اللفظي من num
                    return parseArabicNumeral(art.num || "") * 1000;
                  };

                  // ── مساعد: كشف اسم اللائحة من المادة ──
                  const getRegName = extractRegFullName;

                  const regArticles = law.chapters
                    .flatMap(ch => ch.articles)
                    .filter(a => (a.regulations && a.regulations.length > 0) || a.instrument === "لائحة" || a.instrument === "ملحق")
                    // ── فلترة اللائحة المختارة
                    .filter(a => {
                      if (!selectedRegName) return true;
                      return getRegName(a) === selectedRegName;
                    })
                    // ── ترتيب تسلسلي
                    .sort((a, b) => extractRegNum(a) - extractRegNum(b));

                  const visibleRegArts = filteredArticles
                    ? regArticles.filter(a => filteredArticles.some(f => f.id === a.id))
                    : regArticles;

                  return visibleRegArts.map(article => (
                    <ArticleBlock
                      key={article.id}
                      article={article}
                      lawName={lawTitle}
                      lawType={law.documentType}
                      isDark={isDark}
                      entry={cartMap.get(article.id)}
                      onAddArticle={addArticle}
                      onRemoveArticle={removeArticle}
                      onAddExecReg={addExecReg}
                      onRemoveExecReg={removeExecReg}
                      onActive={setActiveId}
                      isActive={activeId === article.id}
                      showPaywall={() => setShowPaywall(true)}
                      onExplain={(a) => setExplainArticle(a)}
                      isRTL={isRTL}
                      fontClass={fontClass}
                      isReadingMode={isReadingMode}
                      viewMode={viewMode}
                    />
                  ));
                })()}
              </div>
            ) : (
              law.chapters.map((ch, ci) => {
                const visibleArts = filteredArticles
                  ? ch.articles.filter(a => filteredArticles.some(f => f.id === a.id))
                  : ch.articles;
                
                const displayedArts = visibleArts;

                if (displayedArts.length === 0) return null;
                return (
                  <div key={ci} className="space-y-3">
                    {!filteredArticles && (
                      <div className="flex items-center gap-3 py-1">
                        <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isDark ? "border-white/[0.07] text-zinc-400 bg-zinc-800/60" : "border-slate-200 text-slate-500 bg-slate-50"}`}>{ch.title}</span>
                        <div className={`h-px flex-1 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                      </div>
                    )}
                    {displayedArts.map(article => (
                      <ArticleBlock
                        key={article.id}
                        article={article}
                        lawName={lawTitle}
                        lawType={law.documentType}
                        isDark={isDark}
                        entry={cartMap.get(article.id)}
                        onAddArticle={addArticle}
                        onRemoveArticle={removeArticle}
                        onAddExecReg={addExecReg}
                        onRemoveExecReg={removeExecReg}
                        onActive={setActiveId}
                        isActive={activeId === article.id}
                        showPaywall={() => setShowPaywall(true)}
                        onExplain={(a) => setExplainArticle(a)}
                        isRTL={isRTL}
                        fontClass={fontClass}
                        isReadingMode={isReadingMode}
                        viewMode={viewMode}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* LEFT COLUMN: AI Tools and related documents */}
          {!isReadingMode && (
            <aside className="hidden lg:block lg:col-span-3 sticky top-6 z-40 space-y-3 print:hidden max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ overscrollBehavior: 'auto' }}>
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

              <ResearchWorkspace isDark={isDark} pageId={law.id || slug} isRTL={isRTL} />

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
                        {lawMeta.related_systems.map((doc, idx) => (
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
                  {lawMeta.related_principles && lawMeta.related_principles.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/90 uppercase tracking-wider">
                        {isRTL ? "المبادئ القضائية المتصلة:" : "Related Principles:"}
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {lawMeta.related_principles.map((doc, idx) => (
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
          )}

        </div>
      </main>

      <Footer />

      <FloatingButtons
        reportConfig={{ pageSlug: slug, pageType: "law" }}
        cartCount={cart.length}
        onCartClick={() => setShowCart(true)}
      />

      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCart(false)} className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px]" />
            <DraftDrawer cart={cart} onRemoveArticle={removeArticle} onClearAll={clearAll} onClose={() => setShowCart(false)} isDark={isDark} isRTL={isRTL} />
          </>
        )}
      </AnimatePresence>

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} isRTL={isRTL} isDark={isDark} freeLimit={libraryFreeLimit ?? undefined} />

      <AnimatePresence>
        {explainArticle && (
          <ArticleExplainModal
            article={explainArticle}
            isDark={isDark}
            onClose={() => setExplainArticle(null)}
            isRTL={isRTL}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCommunity && (
          <CommunityQuestionModal
            isDark={isDark}
            isRTL={isRTL}
            lawName={law?.title}
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

      {/* ── Scroll-to-Top Button (Positioned on the RIGHT in RTL to prevent collision) ── */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`fixed z-[9999] bottom-20 md:bottom-6 ${isRTL ? "right-6" : "left-6"} w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-300 print:hidden ${
              isDark
                ? "bg-[#0B3D2E] border-[#C8A762]/60 text-[#C8A762] hover:bg-[#082d22] hover:border-[#C8A762] shadow-[0_8px_20px_rgba(200,167,98,0.25)]"
                : "bg-[#0B3D2E] border-[#C8A762] text-[#C8A762] hover:bg-[#082d22] shadow-[0_8px_20px_rgba(11,61,46,0.35)]"
            }`}
            title={isRTL ? "العودة لأعلى الصفحة" : "Scroll to top"}
            aria-label={isRTL ? "العودة لأعلى الصفحة" : "Scroll to top"}
          >
            <ArrowUp size={20} weight="bold" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LawSystemPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">جاري التحميل...</div>}>
      <LawSystemPageContent />
    </Suspense>
  );
}
