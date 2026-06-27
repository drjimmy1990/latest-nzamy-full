"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, Faders, CaretDown, Check,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import InvitationBanner from "@/components/InvitationBanner";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { PaywallModal, AdvancedSearchModal } from "./components/PaywallModal";
import {
  DEMO_PRINCIPLES,
  DEMO_PRECEDENTS,
  DEMO_ORDERS,
  PRINCIPLE_SOURCES,
  DEMO_FEQH_BOOKS,
  DEMO_PRECEDENTS_COLLECTIONS,
  ORDER_ISSUERS,
  type DemoPrinciple,
  type DemoPrecedent,
  type DemoOrder,
  type PrincipleSourceId,
} from "./demo-data";
import RecentSessions from "./components/RecentSessions";
import SmartFolders from "./components/SmartFolders";
import { MyNotesSection } from "./components/MyNotesSection";
import { GamificationCard } from "./components/GamificationCard";
import LegislativeUpdates from "./components/LegislativeUpdates";

import {
  type Cat,
  type ContentType,
  type FeqhType,
  type FeqhMadhab,
  type PrecMode,
  CONTENT_TYPES,
  PLACEHOLDERS,
  PLACEHOLDERS_EN,
  catTotalCount,
  MAIN_CATEGORIES,
  OTHER_CATEGORIES,
  matchesFeqhCategory,
} from "@/constants/lawsLibraryData";

import { LibraryHero } from "./components/LibraryHero";
import { PrecedentsTabContent } from "./components/PrecedentsTabContent";
import { OrdersTabContent } from "./components/OrdersTabContent";
import { LawsTabContent } from "./components/LawsTabContent";
import { FeqhTabContent } from "./components/FeqhTabContent";
import { ISSUER_MAP } from "./components/ListItems";

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function LegalLibraryPage() {
  const { isRTL, isDark } = useTheme();
  const { isLoggedIn }    = useUser();
  const router = useRouter();

  // --- Database-backed state variables ---
  const [dbLaws, setDbLaws] = useState<any[]>([]);
  const [dbDecrees, setDbDecrees] = useState<any[]>([]);
  const [dbPrinciples, setDbPrinciples] = useState<any[]>([]);
  const [dbBooks, setDbBooks] = useState<any[]>([]);
  const [dbCollections, setDbCollections] = useState<any[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // — Core filters —
  const [search,         setSearch]         = useState("");
  const [showSuggest,    setShowSuggest]    = useState(false);
  const [activeCat,      setActiveCat]      = useState<Cat>("all");
  const [activeType,     setActiveType]     = useState<ContentType>("all");
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [otherMenuOpen,  setOtherMenuOpen]  = useState(false);
  const [showPaywall,    setShowPaywall]    = useState(false);
  const [showAdvSearch,  setShowAdvSearch]  = useState(false);
  const [mounted,        setMounted]        = useState(false);
  const [layoutMode,     setLayoutMode]     = useState<"grid" | "list">("grid");
  const [showSidebars,   setShowSidebars]   = useState(true);

  // Arabic Normalization Helper (shared utility)
  const { normalizeArabic } = require("@/utils/normalizeArabic");

  // — API-backed autocomplete state —
  const [autocompleteCounts, setAutocompleteCounts] = useState<{ laws: number; precedents: number; orders: number; feqh: number }>({ laws: 0, precedents: 0, orders: 0, feqh: 0 });
  const [autocompleteMatches, setAutocompleteMatches] = useState<{ label: string; type: string; typeLabel: string; id?: string }[]>([]);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autocomplete API call
  const fetchAutocomplete = useCallback(async (q: string) => {
    if (q.length < 2) {
      setAutocompleteCounts({ laws: 0, precedents: 0, orders: 0, feqh: 0 });
      setAutocompleteMatches([]);
      return;
    }
    try {
      const res = await fetch(`/api/library/autocomplete?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setAutocompleteCounts(data.counts || { laws: 0, precedents: 0, orders: 0, feqh: 0 });
        const matches = (data.topMatches || []).map((m: { title: string; section: string; slug: string; snippet?: string }) => ({
          label: m.title,
          type: m.section === "laws" ? "laws" : m.section === "orders" ? "orders" : m.section === "feqh" ? "feqh" : "precedents",
          typeLabel: m.section === "laws" ? (isRTL ? "نظام" : "Law") : m.section === "orders" ? (isRTL ? "مرسوم" : "Decree") : m.section === "feqh" ? (isRTL ? "كتاب" : "Book") : (isRTL ? "مبدأ" : "Principle"),
          id: m.slug,
        }));
        setAutocompleteMatches(matches);
      }
    } catch (e) {
      console.error("[Autocomplete] fetch error:", e);
    }
  }, [isRTL]);

  // Trigger autocomplete with 300ms debounce
  useEffect(() => {
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(() => {
      fetchAutocomplete(search);
    }, 300);
    return () => {
      if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    };
  }, [search, fetchAutocomplete]);

  // — Feqh filters —
  const [feqhType,    setFeqhType]    = useState<FeqhType>("all");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [feqhMadhab,  setFeqhMadhab]  = useState<FeqhMadhab>("all"); // reserved — Madhab filter UI coming soon
  const [feqhSubCat,  setFeqhSubCat]  = useState<string>("all");

  // — Precedents dual-filter —
  const [precMode,       setPrecMode]       = useState<PrecMode>("all");
  const [precSource,     setPrecSource]     = useState<PrincipleSourceId>("all");
  const [precTrack,      setPrecTrack]      = useState<"all" | "ordinary" | "admin" | "semi">("all");
  const [orderIssuer,    setOrderIssuer]    = useState<string>("all");

  const [precPage,       setPrecPage]       = useState(1);
  const [precSort,       setPrecSort]       = useState<"relevance" | "year-desc" | "year-asc" | "date-desc">("relevance");

  const isLoadedRef = useRef(false);

  // Reset page index on filter/search changes
  useEffect(() => {
    if (isLoadedRef.current) {
      setPrecPage(1);
    }
  }, [search, activeType, activeCat, precSource, precTrack, precSort]);

  // — Rotating placeholder —
  const [phIdx, setPhIdx] = useState(0);
  const phList = (isRTL ? PLACEHOLDERS : PLACEHOLDERS_EN)[activeType];
  useEffect(() => { setPhIdx(0); }, [activeType]);
  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % phList.length), 3000);
    return () => clearInterval(t);
  }, [phList]);

  useEffect(() => {
    setSelectedHashtag(null);
  }, [activeType, activeCat]);
  // Load state from sessionStorage after component is mounted on the client
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSearch = sessionStorage.getItem("nzamy_search_search");
      if (savedSearch !== null) setSearch(savedSearch);
      
      const savedActiveCat = sessionStorage.getItem("nzamy_search_activeCat");
      if (savedActiveCat !== null) setActiveCat(savedActiveCat as any);
      
      const savedActiveType = sessionStorage.getItem("nzamy_search_activeType");
      if (savedActiveType !== null) setActiveType(savedActiveType as any);
      
      const savedLayoutMode = sessionStorage.getItem("nzamy_search_layoutMode");
      if (savedLayoutMode !== null) setLayoutMode(savedLayoutMode as any);
      
      const savedFeqhType = sessionStorage.getItem("nzamy_search_feqhType");
      if (savedFeqhType !== null) setFeqhType(savedFeqhType as any);
      
      const savedFeqhSubCat = sessionStorage.getItem("nzamy_search_feqhSubCat");
      if (savedFeqhSubCat !== null) setFeqhSubCat(savedFeqhSubCat);
      
      const savedPrecMode = sessionStorage.getItem("nzamy_search_precMode");
      if (savedPrecMode !== null) setPrecMode(savedPrecMode as any);
      
      const savedPrecSource = sessionStorage.getItem("nzamy_search_precSource");
      if (savedPrecSource !== null) setPrecSource(savedPrecSource as any);
      
      const savedPrecTrack = sessionStorage.getItem("nzamy_search_precTrack");
      if (savedPrecTrack !== null) setPrecTrack(savedPrecTrack as any);
      
      const savedOrderIssuer = sessionStorage.getItem("nzamy_search_orderIssuer");
      if (savedOrderIssuer !== null) setOrderIssuer(savedOrderIssuer);
      
      const savedPrecPage = sessionStorage.getItem("nzamy_search_precPage");
      if (savedPrecPage !== null) {
        const p = parseInt(savedPrecPage);
        if (!isNaN(p)) setPrecPage(p);
      }
      
      const savedPrecSort = sessionStorage.getItem("nzamy_search_precSort");
      if (savedPrecSort !== null) setPrecSort(savedPrecSort as any);

      const savedShowSidebars = sessionStorage.getItem("nzamy_search_showSidebars");
      if (savedShowSidebars !== null) setShowSidebars(savedShowSidebars === "true");

      isLoadedRef.current = true;
    }
    fetch("/api/library/init")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load library data");
        return r.json();
      })
      .then((data) => {
        setDbLaws(data.laws || []);
        setDbDecrees(data.decrees || []);
        setDbPrinciples(data.principles || []);
        setDbBooks(data.books || []);
        setDbCollections(data.collections || []);
        setDbLoading(false);
      })
      .catch((e) => {
        console.error("Library initialization failed:", e);
        setDbLoading(false);
      });
    setMounted(true);
  }, []);

  // Save state to sessionStorage when any search/filter state changes
  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      sessionStorage.setItem("nzamy_search_search", search);
      sessionStorage.setItem("nzamy_search_activeCat", activeCat);
      sessionStorage.setItem("nzamy_search_activeType", activeType);
      sessionStorage.setItem("nzamy_search_layoutMode", layoutMode);
      sessionStorage.setItem("nzamy_search_feqhType", feqhType);
      sessionStorage.setItem("nzamy_search_feqhSubCat", feqhSubCat);
      sessionStorage.setItem("nzamy_search_precMode", precMode);
      sessionStorage.setItem("nzamy_search_precSource", precSource);
      sessionStorage.setItem("nzamy_search_precTrack", precTrack);
      sessionStorage.setItem("nzamy_search_orderIssuer", orderIssuer);
      sessionStorage.setItem("nzamy_search_precPage", precPage.toString());
      sessionStorage.setItem("nzamy_search_precSort", precSort);
      sessionStorage.setItem("nzamy_search_showSidebars", showSidebars.toString());
    }
  }, [
    mounted,
    search,
    activeCat,
    activeType,
    layoutMode,
    feqhType,
    feqhSubCat,
    precMode,
    precSource,
    precTrack,
    orderIssuer,
    precPage,
    precSort,
    showSidebars
  ]);
  if (!mounted) return null;

  const muted       = isDark ? "text-gray-400" : "text-gray-500";
  const isOtherActive = OTHER_CATEGORIES.some(c => c.id === activeCat);
  const q           = search.toLowerCase().trim();
  const nq          = normalizeArabic(q);

  // ─── Search autocomplete suggestions (API-backed with demo fallback) ────────
  const searchSuggestions = nq.length >= 2 ? (() => {
    // If API returned results, use them
    if (autocompleteMatches.length > 0) {
      return autocompleteMatches.slice(0, 6);
    }
    
    // Fallback: scan local demo data for basic matching
    const results: { label: string; type: string; typeLabel: string; id?: string }[] = [];
    PhosphorIcons; // reference to prevent unused warning if any

    // Scan systems
    const FULL_LAWS_SYSTEMS_LOCAL = [
      { id: "sys-1", slug: "civil-transactions", title: "نظام المعاملات المدنية", desc: "القانون المدني السعودي الشامل", free: true },
      { id: "sys-2", slug: "commercial-courts", title: "نظام المحاكم التجارية", desc: "تنظيم اختصاصات المحاكم التجارية", free: true },
      { id: "sys-3", slug: "labor-law", title: "نظام العمل السعودي", desc: "تنظيم العلاقة التعاقدية", free: false },
      { id: "sys-4", slug: "companies-law", title: "نظام الشركات الجديد", desc: "تنظيم شركات المساهمة والمحدودة", free: false }
    ];

    FULL_LAWS_SYSTEMS_LOCAL.forEach(s => {
      if (normalizeArabic(s.title).includes(nq) && (activeType === "all" || activeType === "laws"))
        results.push({ label: s.title, type: "laws", typeLabel: isRTL ? "نظام" : "Law", id: s.slug });
    });
    DEMO_PRINCIPLES.forEach(p => {
      if ((normalizeArabic(p.text).includes(nq) || normalizeArabic(p.source).includes(nq)) && (activeType === "all" || activeType === "precedents"))
        results.push({ label: p.text.substring(0, 60) + "...", type: "precedents", typeLabel: isRTL ? "مبدأ" : "Principle" });
    });
    return results.slice(0, 6);
  })() : [];

  // Highlight utility
  function highlightText(text: string, term: string): string {
    if (!term || term.length < 2) return text;
    // Highlight based on normalized representation
    const nTerm = normalizeArabic(term);
    const escaped = nTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark class=\"bg-yellow-300/80 text-yellow-900 rounded px-0.5\">$1</mark>");
  }

  // Helper to map principle sourceId to judicial track
  function matchesPrecTrack(sourceId: string, track: string): boolean {
    if (track === "all") return true;
    if (track === "ordinary") {
      return [
        "supreme", "supreme-general", "permanent-cmte", "sjc-general",
        "higher-judicial", "tamyeez", "appeal-courts", "specialized", "sjc"
      ].includes(sourceId);
    }
    if (track === "admin") {
      return ["admin-supreme", "admin-appeal", "admin-first"].includes(sourceId);
    }
    if (track === "semi") {
      return [
        "sama-cmte", "cma-cmte", "zatca-cmte", "commercial-paper",
        "labor-board", "prosecution"
      ].includes(sourceId);
    }
    return false;
  }

  // Helper to map precedent court to judicial track
  function matchesPrecedentTrack(court: string, track: string): boolean {
    if (track === "all") return true;
    const isBOG = court.includes("ديوان") || court.includes("إداري") || court.includes("إدارية");
    const isCommittee = (court.includes("لجنة") || court.includes("لجان") || court.includes("هيئة السوق") || court.includes("ساما") || court.includes("الزكاة") || court.includes("العمالية")) && !court.includes("الهيئة القضائية العليا") && !court.includes("الهيئة العامة") && !court.includes("المحكمة العليا");
    if (track === "ordinary") return !isBOG && !isCommittee;
    if (track === "admin") return isBOG;
    if (track === "semi") return isCommittee;
    return false;
  }

  // ─── Mapping Database Data to Frontend structures ───────────────────────────
  // ─── Helper: Classify law category from section_name or title ────────────────
  function classifyLawCategory(law: any): string {
    // 1. If section_code is already set and valid (e.g. "4" → "SA-04")
    if (law.section_code && law.section_code.trim()) {
      const code = law.section_code.trim();
      // Handle both "SA-04" format and bare "4" format
      if (code.startsWith("SA-")) return code;
      const num = parseInt(code);
      if (!isNaN(num)) return `SA-${String(num).padStart(2, "0")}`;
    }

    // 2. Map from section_name (Arabic category label)
    const sn = (law.section_name || "").trim();
    if (sn.includes("إجرائي") || sn.includes("قضائي") || sn.includes("القضاء")) return "SA-00";
    if (sn.includes("جنائي") || sn.includes("عقوبات")) return "SA-01";
    if (sn.includes("إداري") || sn.includes("خدمة مدنية")) return "SA-02";
    if (sn.includes("مدني") || sn.includes("أحوال شخصية")) return "SA-03";
    if (sn.includes("تجاري") || sn.includes("شركات")) return "SA-04";
    if (sn.includes("ملكية فكرية")) return "SA-05";
    if (sn.includes("عمل") || sn.includes("تأمينات")) return "SA-06";
    if (sn.includes("عقاري") || sn.includes("بناء") || sn.includes("مقاولات")) return "SA-07";
    if (sn.includes("مالي") || sn.includes("مصرفي")) return "SA-08";
    if (sn.includes("ضريبي") || sn.includes("زكو") || sn.includes("جمرك")) return "SA-09";

    // 3. Fallback: classify from title keywords
    const t = (law.title || "").trim();
    if (t.includes("القضاء") || t.includes("المرافعات") || t.includes("الإثبات") || t.includes("التنفيذ") || t.includes("المحاماة") || t.includes("التكاليف القضائية") || t.includes("التوثيق") || t.includes("المظالم") || t.includes("المصالحة") || t.includes("استئناف") || t.includes("التقاضي") || t.includes("خبرة") || t.includes("اعتراض") || t.includes("أعوان القضاء") || t.includes("تفتيش قضائي") || t.includes("تنفيذ") || t.includes("ترخيص") || t.includes("مكاتب المحاماة")) return "SA-00";
    if (t.includes("تجاري") || t.includes("المحاكم التجارية") || t.includes("شركات")) return "SA-04";
    if (t.includes("عمل") || t.includes("عمالي")) return "SA-06";
    if (t.includes("جنائي") || t.includes("عقوبات")) return "SA-01";
    if (t.includes("مدني") || t.includes("معاملات مدنية")) return "SA-03";

    return "SA-00"; // Most seeded laws are procedural/judicial
  }

  const lawsList = (dbLaws.length > 0
    ? dbLaws
        .filter((law: any) => law.title !== "EXTRACTION_MEMORY") // Filter out extraction artifacts
        .map((law: any) => ({
        id: law.slug,
        slug: law.slug,
        title: law.title,
        titleEn: law.title_en || "",
        desc: law.description || "",
        descEn: law.description_en || "",
        free: true, // All laws are free for now
        progress: 100,
        articlesCount: law.total_articles || 0,
        chaptersCount: 0,
        lastUpdated: law.issue_date_hijri || "—",
        cat: classifyLawCategory(law),
        type: "laws",
        subType: "basic"
      }))
    : [
        { id: "sys-1", slug: "civil-transactions", title: "نظام المعاملات المدنية", titleEn: "Civil Transactions Law", desc: "القانون المدني السعودي الشامل المنظم للعقود والالتزامات والمسؤولية التقصيرية والممتلكات.", descEn: "The comprehensive Saudi civil code regulating contracts, obligations, tort liability, and property rights.", free: true, progress: 60, articlesCount: 720, chaptersCount: 3, lastUpdated: "١٤٤٦/٥/١٢هـ", cat: "SA-03", type: "laws", subType: "basic" },
        { id: "sys-2", slug: "commercial-courts", title: "نظام المحاكم التجارية", titleEn: "Commercial Courts Law", desc: "تنظيم اختصاصات وإجراءات المحاكم التجارية ونظر الدعاوى والطلبات المتعلقة بالتجار.", descEn: "Regulating the jurisdiction, rules, and procedures of commercial courts for merchants and companies.", free: true, progress: 20, articlesCount: 96, chaptersCount: 2, lastUpdated: "١٤٤٥/١٠/٨هـ", cat: "SA-04", type: "laws", subType: "basic" },
        { id: "sys-3", slug: "labor-law", title: "نظام العمل السعودي", titleEn: "Saudi Labor Law", desc: "تنظيم العلاقة التعاقدية بين صاحب العمل والعامل وحقوق الطرفين والنزاعات العمالية.", descEn: "Regulating employer-employee contracts, statutory rights, working hours, and labor disputes resolution.", free: true, progress: 0, articlesCount: 245, chaptersCount: 4, lastUpdated: "١٤٤٦/٢/١هـ", cat: "SA-04", type: "laws", subType: "basic" },
        { id: "sys-4", slug: "companies-law", title: "نظام الشركات الجديد", titleEn: "New Companies Law", desc: "تنظيم شركات المساهمة والمحدودة والتضامن وحوكمتها وقواعد الاندماج والاستحواذ.", descEn: "Regulating joint-stock, LLCs, partnerships, corporate governance, mergers, and acquisitions.", free: true, progress: 0, articlesCount: 282, chaptersCount: 5, lastUpdated: "١٤٤٥/١٢/٢٢هـ", cat: "SA-04", type: "laws", subType: "basic" }
      ]) as any[];

  const ordersList = (dbDecrees.length > 0
    ? dbDecrees.map((d: any) => ({
        id: String(d.id),
        title: d.title,
        type: d.type || "circular",
        issuer: d.issuer || "—",
        ref: d.ref || "—",
        date: d.date || "—",
        summary: d.summary_brief || d.title || "",
        summary_brief: d.summary_brief || "",
        cat: d.category || "SA-04",
        hashtags: d.hashtags || []
      }))
    : DEMO_ORDERS) as any[];

  const principlesList = (dbPrinciples.length > 0
    ? dbPrinciples.map((p: any) => ({
        id: String(p.id),
        sourceId: p.judicial_collections?.source_id || "supreme",
        source: p.issuing_body || p.judicial_collections?.court || "المحكمة العليا",
        srcAbbr: p.judicial_collections?.source_id === "supreme" ? "م ع" : "ت ق",
        text: p.text || "",
        ref: p.decision_number || "—",
        year: String(p.year_hijri || 1445),
        subject: "civil" as any,
        cat: p.judicial_collections?.category || "SA-03"
      }))
    : DEMO_PRINCIPLES) as any[];

  // NOTE: precedentsList is unified with principlesList to avoid duplication.
  // We use the DEMO_PRECEDENTS only when DB has no data at all.
  const precedentsList = (dbPrinciples.length > 0
    ? [] as any[] // DB principles are already shown in principlesList — no duplication
    : DEMO_PRECEDENTS) as any[];

  const booksList = (dbBooks.length > 0
    ? dbBooks.map((b: any) => {
        let type = b.type || "sharia";
        let category = b.category || "";
        let categoryLabel = "";

        const title = b.title || "";
        
        // Auto-detect type and category based on title if empty
        if (title.includes("كشاف القناع") || title.includes("الشرح الكبير") || title.includes("الروض المربع") || title.includes("زاد المستقنع") || title.includes("المغني") || title.includes("المقنع")) {
          type = "sharia";
          if (title.includes("زاد المستقنع") || title.includes("أخصر المختصرات")) {
            category = "mutun";
            categoryLabel = isRTL ? "متون فقهية" : "Fiqh Texts";
          } else if (title.includes("المغني") || title.includes("الشرح الكبير")) {
            category = "encyclopedia";
            categoryLabel = isRTL ? "موسوعات وخلاف" : "Encyclopedias";
          } else {
            category = "sharuh";
            categoryLabel = isRTL ? "شروح وحواشي" : "Explanations";
          }
        } else if (title.includes("الوسيط") || title.includes("مصادر الحق") || title.includes("السنهوري")) {
          type = "comparative";
          category = "civil";
          categoryLabel = isRTL ? "مدني مقارن" : "Comparative Civil";
        } else if (title.includes("عقوبات") || title.includes("جنائي")) {
          type = "wadi";
          category = "criminal";
          categoryLabel = isRTL ? "جنائي" : "Criminal";
        } else if (title.includes("شركات") || title.includes("تجاري")) {
          type = "wadi";
          category = "corporate";
          categoryLabel = isRTL ? "تجاري" : "Commercial";
        } else {
          // Defaults if no keyword matches
          if (type === "sharia") {
            category = "sharuh";
            categoryLabel = isRTL ? "شروح وحواشي" : "Explanations";
          } else if (type === "comparative") {
            category = "civil";
            categoryLabel = isRTL ? "مدني مقارن" : "Comparative Civil";
          } else {
            category = "civil";
            categoryLabel = isRTL ? "مدني" : "Civil";
          }
        }

        return {
          id: String(b.id),
          slug: b.id,
          title: b.title,
          author: b.author || (title.includes("البهوتي") ? "منصور بن يونس البهوتي" : title.includes("ابن قدامة") ? "موفق الدين ابن قدامة" : "—"),
          type,
          category,
          categoryLabel,
          desc: b.description || "",
          free: b.free ?? true,
          progress: 100,
          volCount: b.total_volumes || 1,
          lastUpdated: "—"
        };
      })
    : DEMO_FEQH_BOOKS) as any[];

  const getCatTotalCount = (catId: string, type: string) => {
    let lawsCount = 0;
    let precedentsCount = 0;
    let ordersCount = 0;
    let feqhCount = 0;

    if (catId === "all") {
      lawsCount = lawsList.length;
      precedentsCount = precedentsList.length;
      ordersCount = ordersList.length;
      feqhCount = booksList.length;
    } else {
      lawsCount = lawsList.filter(s => s.cat === catId).length;
      precedentsCount = precedentsList.filter(s => s.cat === catId).length;
      ordersCount = ordersList.filter(s => s.cat === catId).length;
      feqhCount = booksList.filter(b => matchesFeqhCategory(b as any, catId)).length;
    }

    if (type === "laws")       return lawsCount;
    if (type === "precedents") return precedentsCount;
    if (type === "orders")     return ordersCount;
    if (type === "feqh")       return feqhCount;
    return lawsCount + precedentsCount + ordersCount + feqhCount;
  };

  // ─── Filter: Laws ─────────────────────────────────────────────────────────────
  const filteredLaws = lawsList.filter(s => {
    const inCat  = activeCat === "all" || s.cat === activeCat;
    const inQ   = !nq || normalizeArabic(s.title).includes(nq) || normalizeArabic(s.desc).includes(nq);
    return inCat && inQ;
  });

  // ─── Filter: Principles ───────────────────────────────────────────────────────
  const filteredPrinciples = principlesList.filter(p => {
    const inCat    = activeCat === "all" || p.cat === activeCat;
    const inTrack  = matchesPrecTrack(p.sourceId, precTrack);
    const inSrc    = precSource  === "all" || p.sourceId === precSource;
    const inQ      = !nq || normalizeArabic(p.text).includes(nq) || normalizeArabic(p.source).includes(nq) || normalizeArabic(p.ref).includes(nq);
    return inCat && inTrack && inSrc && inQ;
  });

  // ─── Filter: Precedents ───────────────────────────────────────────────────────
  const filteredPrecedents = precedentsList.filter(pr => {
    const inCat  = activeCat === "all" || pr.cat === activeCat;
    const inTrack = matchesPrecedentTrack(pr.court, precTrack);
    const inQ    = !nq || normalizeArabic(pr.summary).includes(nq) || normalizeArabic(pr.court).includes(nq) || normalizeArabic(pr.relevance).includes(nq);
    const inHashtag = !selectedHashtag || pr.hashtags?.includes(selectedHashtag);
    return inCat && inTrack && inQ && inHashtag;
  });

  // ─── Collections: prefer DB data, fallback to demo ──────────────────────────
  const collectionsList = (dbCollections.length > 0
    ? dbCollections.map((col: any) => ({
        id: col.id,
        slug: col.id,
        title: col.title,
        court: col.court || "—",
        track: col.track || "ordinary",
        year: col.year_hijri || "—",
        desc: col.description || "",
        free: col.free ?? true,
        progress: col.progress || 0,
        rulingCount: col.ruling_count || 0,
        part: col.part ? `المجلد ${col.part}` : undefined,
      }))
    : DEMO_PRECEDENTS_COLLECTIONS) as any[];

  const filteredCollections = collectionsList.filter((col: any) => {
    const inTrack = precTrack === "all" || col.track === precTrack;
    const inQ = !nq || normalizeArabic(col.title).includes(nq) || normalizeArabic(col.court).includes(nq) || normalizeArabic(col.desc || "").includes(nq);
    return inTrack && inQ;
  });

  // ─── Filter: Orders ───────────────────────────────────────────────────────────
  const filteredOrders = ordersList.filter(o => {
    const inCat = activeCat === "all" || o.cat === activeCat;
    const inQ   = !nq || normalizeArabic(o.title).includes(nq) || (o.summary && normalizeArabic(o.summary).includes(nq)) || normalizeArabic(o.ref).includes(nq);
    const inIssuer = orderIssuer === "all" || o.issuer === orderIssuer || o.issuer === ISSUER_MAP[orderIssuer]?.ar;
    const inHashtag = !selectedHashtag || o.hashtags?.includes(selectedHashtag);
    return inCat && inQ && inIssuer && inHashtag;
  });

  // ─── Filter: Feqh Books ──────────────────────────────────────────────────────
  const filteredFeqhBooks = booksList.filter(book => {
    const matchesCatTab = activeCat === "all" || matchesFeqhCategory(book, activeCat);
    if (activeType === "feqh") {
      const matchesType = feqhType === "all" || book.type === feqhType;
      let matchesSub = true;
      if (feqhSubCat !== "all") {
        matchesSub = book.category === feqhSubCat;
      }
      const matchesQuery = !nq || 
        normalizeArabic(book.title).includes(nq) || 
        normalizeArabic(book.author).includes(nq) || 
        (book.desc && normalizeArabic(book.desc).includes(nq));
      return matchesType && matchesSub && matchesQuery && matchesCatTab;
    } else {
      const matchesQuery = !nq || 
        normalizeArabic(book.title).includes(nq) || 
        normalizeArabic(book.author).includes(nq) || 
        (book.desc && normalizeArabic(book.desc).includes(nq));
      return matchesQuery && matchesCatTab;
    }
  });

  const hasResults = (type: ContentType) => {
    if (type === "laws")       return filteredLaws.length > 0;
    if (type === "orders")     return filteredOrders.length > 0;
    if (type === "precedents") return filteredPrinciples.length > 0 || filteredPrecedents.length > 0;
    if (type === "feqh")       return filteredFeqhBooks.length > 0;
    return filteredLaws.length > 0 || filteredOrders.length > 0 ||
           filteredPrinciples.length > 0 || filteredPrecedents.length > 0 ||
           filteredFeqhBooks.length > 0;
  };

  const catHasContent = (catId: string) => getCatTotalCount(catId, activeType) > 0;

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"} font-sans`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      {/* ── Invitation Banner (subscribers only) ───────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <InvitationBanner />
      </div>

      {/* ── Library Hero ── */}
      <LibraryHero isDark={isDark} isRTL={isRTL} muted={muted} />

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <section className="pb-32 px-4 flex-1">
        <div className="mx-auto max-w-[1200px]">

          {/* Search Bar */}
          <div className="mb-6 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <div className={`absolute top-1/2 -translate-y-1/2 z-10 ${isRTL ? "right-4" : "left-4"}`}>
                <MagnifyingGlass size={20} className={isDark ? "text-gray-500" : "text-gray-400"} />
              </div>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 180)}
                placeholder={phList[phIdx]}
                className={`w-full py-4 px-12 rounded-2xl border text-sm font-medium transition-all focus:ring-2 focus:ring-[#0B3D2E]/20 focus:border-[#0B3D2E] outline-none ${
                  isDark
                    ? "bg-[#161b22] border-[#2d3748] text-white placeholder-gray-500"
                    : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 shadow-sm"
                }`}
              />
              {/* Autocomplete dropdown */}
              <AnimatePresence>
                {showSuggest && searchSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className={`absolute top-full mt-2 w-full rounded-2xl border shadow-2xl z-50 overflow-hidden ${
                      isDark ? "bg-[#161b22]/95 border-[#2d3748] backdrop-blur-md" : "bg-white/95 border-gray-200 backdrop-blur-md"
                    }`}
                  >
                    {/* Header stats block */}
                    <div className={`p-4 border-b ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-slate-50/50"} text-right`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                          {autocompleteCounts.laws + autocompleteCounts.precedents + autocompleteCounts.orders + autocompleteCounts.feqh > 0
                            ? `تم العثور على ${(autocompleteCounts.laws + autocompleteCounts.precedents + autocompleteCounts.orders + autocompleteCounts.feqh).toLocaleString('ar-SA')} نتيجة لكلمة (${search})`
                            : `نتائج البحث المقترحة بـ (${search})`}
                        </span>
                        <span className="text-[10px] text-[#C8A762] font-bold">معاينة فورية ذكية</span>
                      </div>
                      
                      {/* Distribution badges — API-backed counts */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-800"}`}>
                          مبادئ وسوابق ({autocompleteCounts.precedents > 0 ? autocompleteCounts.precedents.toLocaleString('ar-SA') : filteredPrinciples.length + filteredPrecedents.length})
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-green-900/20 text-green-400" : "bg-green-50 text-green-800"}`}>
                          أنظمة ولوائح ({autocompleteCounts.laws > 0 ? autocompleteCounts.laws.toLocaleString('ar-SA') : filteredLaws.length})
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-blue-900/20 text-blue-400" : "bg-blue-50 text-blue-800"}`}>
                          أوامر وتعاميم ({autocompleteCounts.orders > 0 ? autocompleteCounts.orders.toLocaleString('ar-SA') : filteredOrders.length})
                        </span>
                      </div>
                    </div>

                    {/* Results list */}
                    <div className="max-h-[320px] overflow-y-auto">
                      {searchSuggestions.map((s, i) => (
                        <button key={i}
                          onMouseDown={() => {
                            setSearch(s.label.replace(/\.\.\.$/, ""));
                            if (s.type === "laws" && s.id) setActiveType("laws");
                            else if (s.type === "precedents") setActiveType("precedents");
                            setShowSuggest(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-right transition border-b last:border-0 ${
                            isDark
                              ? "hover:bg-white/5 text-gray-200 border-white/[0.04]"
                              : "hover:bg-gray-50 text-gray-800 border-gray-100"
                          }`}
                          dir={isRTL ? "rtl" : "ltr"}
                        >
                          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            s.type === "laws" ? (isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700") :
                            isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700"
                          }`}>{s.typeLabel}</span>
                          <span
                            className="flex-1 truncate text-[13px] font-medium"
                            dangerouslySetInnerHTML={{ __html: highlightText(s.label, search) }}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Search tip footer */}
                    <div className={`px-4 py-2 text-[10px] border-t flex items-center gap-1.5 justify-between ${
                      isDark ? "bg-[#0B3D2E]/10 border-white/[0.04] text-[#C8A762]/80" : "bg-[#0B3D2E]/5 border-gray-100 text-[#0B3D2E]"
                    }`}>
                      <span className="font-semibold">
                        💡 نصيحة: اكتب ({search} + عقد) للبحث عن الكلمات معاً، أو ({search} - جنائي) للاستبعاد.
                      </span>
                      <span className="font-bold cursor-pointer underline shrink-0 hover:text-white" onClick={() => setShowAdvSearch(true)}>
                        تصفية متقدمة
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAdvSearch(true)}
                className="shrink-0 flex items-center justify-center gap-2 px-6 py-4 bg-[#0B3D2E] text-white rounded-2xl font-bold text-sm hover:bg-[#0a3328] transition-colors shadow-md"
              >
                <Faders size={20} weight="fill" />
                {isRTL ? "بحث متقدم" : "Advanced"}
              </button>

              <div className={`flex items-center p-1.5 rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} shadow-sm`}>
                <button
                  type="button"
                  onClick={() => setLayoutMode("grid")}
                  className={`p-2 rounded-xl transition-all duration-200 flex items-center justify-center ${
                    layoutMode === "grid"
                      ? "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                  title={isRTL ? "عرض شبكة" : "Grid View"}
                >
                  <PhosphorIcons.SquaresFour size={20} weight={layoutMode === "grid" ? "fill" : "regular"} />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("list")}
                  className={`p-2 rounded-xl transition-all duration-200 flex items-center justify-center ${
                    layoutMode === "list"
                      ? "bg-[#0B3D2E] text-white shadow-sm"
                      : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                  title={isRTL ? "عرض قائمة" : "List View"}
                >
                  <PhosphorIcons.List size={20} weight={layoutMode === "list" ? "fill" : "regular"} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowSidebars(!showSidebars)}
                className={`p-3 rounded-2xl border transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-sm shadow-sm ${
                  !showSidebars
                    ? "bg-[#C8A762] text-[#0B3D2E] border-[#C8A762] hover:bg-[#b08e4f] hover:border-[#b08e4f]"
                    : isDark
                    ? "bg-[#161b22] border-[#2d3748] text-gray-300 hover:text-white hover:bg-white/5"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                }`}
                title={isRTL ? (showSidebars ? "إخفاء الأدوات جانباً (وضع التركيز)" : "إظهار الأدوات جانباً") : (showSidebars ? "Hide Sidebars (Focus Mode)" : "Show Sidebars")}
              >
                <PhosphorIcons.SidebarSimple size={20} weight={!showSidebars ? "fill" : "regular"} />
                <span className="hidden md:inline">
                  {isRTL ? (showSidebars ? "إخفاء الأدوات" : "إظهار الأدوات") : (showSidebars ? "Hide Tools" : "Show Tools")}
                </span>
              </button>
            </div>
          </div>

          {/* ── Filter Unit: Content Type + Category Tabs ────── */}
          {/* ROW 1: Content type selector */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {CONTENT_TYPES.map(ct => {
              const CtIcon   = ct.icon;
              const isActive = activeType === ct.id;
              return (
                <button key={ct.id}
                  onClick={() => { setActiveType(ct.id); setPrecMode("all"); setPrecSource("all"); setFeqhType("all"); setFeqhMadhab("all"); setOrderIssuer("all"); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? isDark ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                      : isDark ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0B3D2E]"
                  }`}
                >
                  <CtIcon size={15} weight={isActive ? "fill" : "duotone"} className={isActive ? "text-[#C8A762]" : ""} />
                  {isRTL ? ct.label : ct.labelEn}
                </button>
              );
            })}
          </div>

          {/* ROW 2: Category section tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <div className={`inline-flex items-center p-1.5 rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
              {MAIN_CATEGORIES.map(cat => {
                const isActive = activeCat === cat.id;
                const Icon     = cat.icon;
                const count    = cat.id === "all" ? null : getCatTotalCount(cat.id, activeType);
                return (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                    className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      isActive
                        ? isDark ? "text-white" : "text-white bg-[#0B3D2E]"
                        : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    {isActive && isDark && <motion.div layoutId="cat-active" className="absolute inset-0 bg-white/10 rounded-xl" />}
                    <Icon size={16} weight={isActive ? "fill" : "duotone"} className="relative z-10 hidden sm:block" />
                    <span className="relative z-10">{isRTL ? cat.label : cat.labelEn}</span>
                    {count !== null && count > 0 && (
                      <span className={`relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? "bg-white/20 text-white" : isDark ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-500"
                      }`}>{count}</span>
                    )}
                    {count !== null && count === 0 && (
                      <span className={`relative z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"
                      }`}>{isRTL ? "قريباً" : "Soon"}</span>
                    )}
                  </button>
                );
              })}

              {/* Other dropdown */}
              <div className="relative">
                <button onClick={() => setOtherMenuOpen(!otherMenuOpen)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    isOtherActive
                      ? isDark ? "bg-white/10 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                      : isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <span>{isRTL ? "أخرى" : "Other"}</span>
                  <CaretDown size={14} weight="bold" className={`transition-transform duration-200 ${otherMenuOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {otherMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={{ duration: 0.15 }}
                      className={`absolute top-full mt-2 w-56 rounded-2xl border shadow-xl z-30 p-2 ${isRTL ? "right-0" : "left-0"} ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}
                    >
                      {OTHER_CATEGORIES.map(cat => {
                        const isSelect = activeCat === cat.id;
                        const count    = getCatTotalCount(cat.id, activeType);
                        return (
                          <button key={cat.id}
                            onClick={() => { setActiveCat(cat.id); setOtherMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition ${
                              isSelect
                                ? isDark ? "bg-white/10 text-white font-bold" : "bg-gray-100 text-gray-900 font-bold"
                                : isDark ? "text-gray-400 hover:bg-white/5 hover:text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <span>{isRTL ? cat.label : cat.labelEn}</span>
                            <div className="flex items-center gap-1.5">
                              {count > 0
                                ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{count}</span>
                                : <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"}`}>{isRTL ? "قريباً" : "Soon"}</span>
                              }
                              {isSelect && <Check size={14} weight="bold" />}
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Active Hashtag Filter Banner */}
          {selectedHashtag && (
            <div className={`mb-6 flex items-center justify-between p-3.5 rounded-2xl border ${
              isDark 
                ? "bg-purple-950/25 border-purple-500/30 text-purple-300" 
                : "bg-purple-50 border-purple-200 text-purple-800"
            }`}>
              <div className="flex items-center gap-2">
                <PhosphorIcons.Tag size={16} weight="fill" />
                <span className="text-xs font-bold">
                  {isRTL ? "مصفى بالوسم النشط:" : "Filtered by active tag:"}
                </span>
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/25">
                  {selectedHashtag}
                </span>
              </div>
              <button
                onClick={() => setSelectedHashtag(null)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                  isDark ? "bg-white/10 hover:bg-white/15 text-white" : "bg-purple-200 hover:bg-purple-300 text-purple-900"
                }`}
              >
                {isRTL ? "إلغاء التصفية" : "Clear Filter"}
              </button>
            </div>
          )}

          {/* ── 3-Column Layout Grid ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
            
            {/* Right Column: Sessions, Folders & Notes (Desktop Col 3, Mobile stacks below results) */}
            {showSidebars && (
              <aside className="lg:col-span-3 space-y-6 order-2 lg:order-1">
                <RecentSessions isDark={isDark} isRTL={isRTL} />
                <SmartFolders isDark={isDark} isRTL={isRTL} />
                <MyNotesSection isDark={isDark} isRTL={isRTL} />
              </aside>
            )}

            {/* Center Column: Results & Active Tab Panels (Desktop Col 6, Mobile stacks at top) */}
            <main className={`order-1 lg:order-2 space-y-6 ${showSidebars ? "lg:col-span-6" : "lg:col-span-12"}`}>
              {/* ── Tab Content Panels ── */}
              <AnimatePresence mode="wait">
                {dbLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-20"
                  >
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#0B3D2E] dark:border-[#C8A762] mb-4"></div>
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      {isRTL ? "جاري تحميل المكتبة القانونية..." : "Loading legal library..."}
                    </p>
                  </motion.div>
                ) : (
                  <>
                    {activeType === "precedents" && (
                      <PrecedentsTabContent
                        isDark={isDark}
                        isRTL={isRTL}
                        muted={muted}
                        precMode={precMode}
                        setPrecMode={(mode) => setPrecMode(mode as any)}
                        precTrack={precTrack}
                        setPrecTrack={setPrecTrack}
                        precSource={precSource}
                        setPrecSource={(src) => setPrecSource(src as any)}
                        filteredCollections={filteredCollections}
                        filteredPrinciples={filteredPrinciples}
                        filteredPrecedents={filteredPrecedents}
                        layoutMode={layoutMode}
                        isLoggedIn={isLoggedIn}
                        setShowPaywall={setShowPaywall}
                        activeCat={activeCat}
                        q={q}
                        setSelectedHashtag={setSelectedHashtag}
                        precPage={precPage}
                        setPrecPage={setPrecPage}
                        precSort={precSort}
                        setPrecSort={setPrecSort}
                      />
                    )}

                    {activeType === "orders" && (
                      <OrdersTabContent
                        isDark={isDark}
                        isRTL={isRTL}
                        muted={muted}
                        orderIssuer={orderIssuer}
                        setOrderIssuer={setOrderIssuer}
                        filteredOrders={filteredOrders}
                        ORDER_ISSUERS={ORDER_ISSUERS}
                        layoutMode={layoutMode}
                        activeCat={activeCat}
                        catHasContent={catHasContent}
                        q={q}
                        setSelectedHashtag={setSelectedHashtag}
                      />
                    )}

                    {(activeType === "laws" || activeType === "all") && (
                      <LawsTabContent
                        isDark={isDark}
                        isRTL={isRTL}
                        muted={muted}
                        activeType={activeType}
                        setActiveType={setActiveType}
                        layoutMode={layoutMode}
                        isLoggedIn={isLoggedIn}
                        q={q}
                        filteredLaws={filteredLaws}
                        filteredFeqhBooks={filteredFeqhBooks}
                        filteredCollections={filteredCollections}
                        filteredPrinciples={filteredPrinciples}
                        filteredPrecedents={filteredPrecedents}
                        filteredOrders={filteredOrders}
                        setShowPaywall={setShowPaywall}
                        setPrecMode={(mode) => setPrecMode(mode as any)}
                        setSelectedHashtag={setSelectedHashtag}
                        catHasContent={catHasContent}
                        activeCat={activeCat}
                        hasResults={hasResults}
                      />
                    )}

                    {activeType === "feqh" && (
                      <FeqhTabContent
                        isDark={isDark}
                        isRTL={isRTL}
                        muted={muted}
                        feqhType={feqhType}
                        setFeqhType={setFeqhType}
                        feqhSubCat={feqhSubCat}
                        setFeqhSubCat={setFeqhSubCat}
                        filteredFeqhBooks={filteredFeqhBooks}
                        layoutMode={layoutMode}
                        isLoggedIn={isLoggedIn}
                        setShowPaywall={setShowPaywall}
                        activeCat={activeCat}
                        q={q}
                      />
                    )}
                  </>
                )}
              </AnimatePresence>
            </main>

            {/* Left Column: Activity & Updates (Desktop Col 3, Mobile stacks at bottom) */}
            {showSidebars && (
              <aside className="lg:col-span-3 space-y-6 order-3 lg:order-3">
                <GamificationCard isDark={isDark} isRTL={isRTL} />
                <LegislativeUpdates isDark={isDark} isRTL={isRTL} />
              </aside>
            )}

          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons reportConfig={{ pageSlug: "laws-index", pageType: "law" }} />
      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} isRTL={isRTL} isDark={isDark} />
      <AdvancedSearchModal 
        isOpen={showAdvSearch} 
        onClose={() => setShowAdvSearch(false)} 
        isRTL={isRTL} 
        isDark={isDark} 
        onApplySearch={(query, section) => {
          setSearch(query);
          setActiveType(section);
          setShowAdvSearch(false);
        }}
      />
    </div>
  );
}
