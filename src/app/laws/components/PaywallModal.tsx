"use client";

"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, CheckCircle, Scales, ListBullets, Gavel, X, BookOpen, Books, BookmarkSimple, Scroll } from "@phosphor-icons/react";
import Link from "next/link";

// ─── Types & Constants ─────────────────────────────────────────────────────────

/**
 * Fallback free-article count shown when no caller supplies the real one.
 * Mirrors the PLATFORM DEFAULT in checkLibraryAccess()
 * (src/lib/access-control.ts:177 — `library_free_article_limit ?? 5`), which
 * is the number actually enforced for any law without its own override.
 *
 * This can only ever be a mirrored literal, not an import: access-control.ts
 * pulls in `@/lib/supabase/server` → `next/headers`, which cannot be bundled
 * into a "use client" component. If that default setting ever changes, this
 * literal has to change with it.
 *
 * A caller that already knows the SERVER-COMPUTED number for the item the
 * user is actually looking at — e.g. `/api/library/laws/[slug]`'s
 * `paywall.freeLimit`, which folds in any per-law override — should pass it
 * via the `freeLimit` prop instead of relying on this fallback, so the text
 * never contradicts what was actually enforced.
 */
export const FREE_LIMIT = 5;

// ─── Library Paywall Plans ─────────────────────────────────────────────────────
// NOTE: الصائغ القانوني + السكرتير + AI tokens هي أدوات المحامي حصراً
// وتظهر في /pricing ضمن باقات المحامي — لا تظهر هنا.
export const PLANS = [
  {
    id: "texts",
    name: "نصوص الأنظمة", nameEn: "Law Texts",
    price: "٢٩", priceEn: "29", period: "شهرياً", periodEn: "/month",
    desc: "كامل نصوص الأنظمة ولوائحها التنفيذية", descEn: "Full access to all law & regulation texts",
    features: [
      "الوصول لكل مواد الأنظمة",
      "اللوائح التنفيذية المرتبطة",
      "تحديثات نصوص الأنظمة",
    ],
    featuresEn: [
      "Access all law articles",
      "Linked executive regulations",
      "Law text updates",
    ],
    highlight: false,
  },
  {
    id: "full",
    name: "النصوص + المبادئ والسوابق", nameEn: "Texts + Judicial Research",
    price: "٧٩", priceEn: "79", period: "شهرياً", periodEn: "/month",
    desc: "النصوص الكاملة + المبادئ القضائية المستقرة + السوابق", descEn: "Full texts + settled judicial principles + precedents",
    features: [
      "كل مزايا خطة النصوص",
      "المبادئ القضائية المستقرة",
      "السوابق القضائية الكاملة",
      "ربط الأنظمة بأحكامها القضائية",
      "تحديثات يومية بالأحكام الجديدة",
    ],
    featuresEn: [
      "Everything in Texts plan",
      "Settled judicial principles",
      "Full judicial precedents",
      "Laws cross-linked with rulings",
      "Daily updates with new judgments",
    ],
    highlight: true,
  },
];



// ─── PaywallModal ──────────────────────────────────────────────────────────────

export function PaywallModal({ isOpen, onClose, isRTL, isDark, freeLimit }: {
  isOpen: boolean; onClose: () => void; isRTL: boolean; isDark: boolean;
  /**
   * The server-enforced free-article count for the item the caller is
   * actually showing (e.g. `paywall.freeLimit` from
   * `/api/library/laws/[slug]`, which already folds in any per-law
   * override) — pass it whenever it's known, so the copy below matches what
   * the server actually enforced instead of a generic default. `-1` means
   * "unlimited" (whitelisted/Pro+, see checkLibraryAccess) and can't be
   * rendered as a count, so it falls back to FREE_LIMIT like an omitted prop.
   */
  freeLimit?: number;
}) {
  if (!isOpen) return null;
  const displayLimit = typeof freeLimit === "number" && freeLimit > 0 ? freeLimit : FREE_LIMIT;
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden ${isDark ? "bg-[#0c0f12] border-[#2d3748]" : "bg-white border-gray-200"}`}>
          <div className="relative bg-gradient-to-br from-[#0B3D2E] to-[#0a3328] p-8 text-white text-center">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#C8A762] to-transparent opacity-60" />
            <Crown size={40} color="#C8A762" weight="fill" className="mx-auto mb-3" />
            <h2 className="text-2xl font-black mb-2">
              {isRTL ? "اشترك للوصول لباقي الأنظمة" : "Subscribe for full access to all laws"}
            </h2>
            <p className="text-sm text-white/70">
              {isRTL
                // A number-then-noun sentence ("أول ٥ مواد") needs different
                // Arabic agreement at 1, 2, 3–10, and 11+ — and this same
                // modal is reused from the precedents/books tabs (laws/page.tsx),
                // where the unit checkLibraryAccess actually gates is pages or
                // blocks, not articles. A label:value form sidesteps both: the
                // digit is a value next to "العدد", never the head of an
                // agreeing noun phrase, and "عنصر" stays true whatever the
                // content type gates on.
                ? `عدد العناصر المجانية من كل نص: ${displayLimit} — اختر الباقة التي تناسب احتياجك البحثي`
                : `Free items per text: ${displayLimit} — choose the plan that fits your research needs`}
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4" dir={isRTL ? "rtl" : "ltr"}>
            {PLANS.map(plan => (
              <div key={plan.id} className={`rounded-2xl border p-5 relative ${plan.highlight ? "border-[#C8A762] bg-[#C8A762]/5" : isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
                {plan.highlight && (
                  <div className="absolute -top-3 inset-x-0 flex justify-center">
                    <span className="px-3 py-1 bg-[#C8A762] text-[#0B3D2E] text-xs font-black rounded-full">{isRTL ? "الأكثر قيمة" : "Best Value"}</span>
                  </div>
                )}
                <p className={`text-base font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{isRTL ? plan.name : plan.nameEn}</p>
                <p className={`text-xs mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? plan.desc : plan.descEn}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className={`text-3xl font-black ${plan.highlight ? "text-[#C8A762]" : isDark ? "text-white" : "text-gray-900"}`}>{isRTL ? plan.price : plan.priceEn}</span>
                  <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? " ر.س" : " SAR"} {isRTL ? plan.period : plan.periodEn}</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {(isRTL ? plan.features : plan.featuresEn).map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      <CheckCircle size={13} color="#22c55e" weight="fill" className="mt-0.5 flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <Link href={`/pricing?plan=${plan.id}`}
                  className={`block text-center py-2.5 rounded-xl text-sm font-bold transition ${plan.highlight ? "bg-[#C8A762] text-[#0B3D2E] hover:opacity-90" : "bg-[#0B3D2E] text-white hover:bg-[#0a3328]"}`}>
                  {isRTL ? "اشترك الآن" : "Subscribe Now"}
                </Link>
              </div>
            ))}
          </div>
          <p className={`text-center text-xs pb-5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            {isRTL ? "بدون عقود — يمكن الإلغاء في أي وقت" : "No contracts — cancel anytime"}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


// ─── AdvancedSearchModal ───────────────────────────────────────────────────────
// س-01 (2026-08-24): the OPERATORS table (+//-/""/'*' search-syntax buttons)
// that used to live here was removed — see the comment above the General
// Search input further down for why.

const LAW_TYPES = [
  { ar: "الكل",                                  en: "All" },
  { ar: "نظام / قانون",                           en: "Law / Statute" },
  { ar: "لائحة تنفيذية",                          en: "Executive Regulation" },
  { ar: "قواعد وضوابط",                          en: "Rules & Standards" },
  { ar: "أدلة إجرائية / دليل إجراءات",           en: "Procedural Manuals" },
  { ar: "تعاميم",                                en: "Circulars" },
  { ar: "قرارات وزارية",                         en: "Min. Decisions" },
  { ar: "أوامر ملكية / مراسيم رئاسية",           en: "Royal / Presidential Decrees" },
  { ar: "قرارات مجلس الوزراء / مجلس الرئاسة",   en: "Council of Ministers Resolutions" },
  { ar: "اتفاقيات دولية مُصادَق عليها",          en: "Ratified International Treaties" },
];

// ── Scoped search modes for Precedents ──────────────────────────────────────
const PREC_MODES = [
  { id: "all",        icon: ListBullets, labelAr: "بحث عام",          labelEn: "General Search" },
  { id: "principles", icon: Scales,      labelAr: "مبادئ مستقرة فقط", labelEn: "Principles Only" },
  { id: "rulings",    icon: Gavel,       labelAr: "سوابق قضائية فقط", labelEn: "Precedents Only" },
];

export function AdvancedSearchModal({ 
  isOpen, 
  onClose, 
  isRTL, 
  isDark,
  onApplySearch
}: {
  isOpen: boolean; 
  onClose: () => void; 
  isRTL: boolean; 
  isDark: boolean;
  onApplySearch?: (searchQuery: string, section: "laws" | "precedents") => void;
}) {
  const [tab,      setTab]      = useState<"laws" | "precedents">("laws");
  const [lawType,  setLawType]  = useState(0);
  const [precMode, setPrecMode] = useState("all");
  const searchRef               = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // ── theme tokens ─────────────────────────────────────────────────────────
  const bg  = isDark ? "bg-[#0c0f12]"    : "bg-white";
  const bdr = isDark ? "border-[#2d3748]" : "border-gray-200";
  const mut = isDark ? "text-gray-400"    : "text-gray-500";
  const inp = isDark
    ? "bg-[#161b22] border-[#2d3748] text-white placeholder-gray-600"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";
  const sec = isDark ? "bg-[#161b22]/60 border-[#2d3748]/70" : "bg-slate-50/80 border-gray-100";

  // ── shared classes ────────────────────────────────────────────────────────
  const field = `w-full px-2.5 py-[6px] rounded-lg border text-[11.5px] outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition ${inp}`;
  const lbl   = `block text-[9.5px] font-bold uppercase tracking-wider mb-1 ${mut}`;

  // ── reusable blocks ───────────────────────────────────────────────────────
  const SectionLabel = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-gray-500" : "text-gray-400"}`}>{label}</span>
      <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-gray-200"}`} />
    </div>
  );

  const DateField = ({ lbl: label, ph }: { lbl: string; ph: string }) => (
    <div>
      <label className={lbl}>{label}</label>
      <input type="text" placeholder={ph} className={field} />
    </div>
  );

  const SelectField = ({ lbl: label, opts }: { lbl: string; opts: { v: string; ar: string; en: string }[] }) => (
    <div>
      <label className={lbl}>{label}</label>
      <select className={field}>
        {opts.map(o => <option key={o.v} value={o.v}>{isRTL ? o.ar : o.en}</option>)}
      </select>
    </div>
  );

  // س-01 (2026-08-24): honesty fix — this modal's footer used to read "الفلاتر
  // جاهزة للباك-اند" ("filters ready for backend") while `handleApply` above
  // only ever reads 4-7 of the ~20 visible fields via querySelector; the rest
  // (type/issuer/section/status/journal-no./every date field, and the whole
  // precedents-tab court/scope/date filters) were pure decoration — set into
  // React state or rendered as plain uncontrolled inputs, never read anywhere.
  // Confirmed by a full council-reviewed search audit (see
  // RFC_معمارية_البحث_الشامل_2026-08-24.md in the content repo). Rather than
  // silently wire them to the DB (several risk returning zero results forever
  // — e.g. LAW_TYPES' compound labels like "نظام / قانون" don't match the
  // single-token values actually stored in `laws.type`), this wraps every
  // still-unwired section so the UI stops promising what it can't do. Remove
  // the wrapper (not the fields) once a given section is genuinely wired.
  const ComingSoon = ({ children }: { children: React.ReactNode }) => (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-45 grayscale-[30%]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`px-2.5 py-1 rounded-full text-[9.5px] font-bold border shadow-sm
          ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-300" : "bg-white border-gray-300 text-gray-600"}`}>
          {isRTL ? "🚧 قيد التفعيل — لا يؤثر على النتائج بعد" : "🚧 Not wired yet — has no effect on results"}
        </span>
      </div>
    </div>
  );

  const ISSUERS = [
    { v: "",        ar: "الكل",                                          en: "All" },
    // ── جهات سيادية ─────────────────────────────────────────────────
    { v: "diwan",   ar: "الديوان الملكي",                               en: "Royal Court" },
    { v: "cabinet", ar: "مجلس الوزراء",                                 en: "Council of Ministers" },
    // ── وزارات ──────────────────────────────────────────────────────
    { v: "moj",     ar: "وزارة العدل",                                   en: "Ministry of Justice" },
    { v: "mol",     ar: "وزارة الموارد البشرية والتنمية الاجتماعية",    en: "Ministry of HR" },
    { v: "moc",     ar: "وزارة التجارة",                                 en: "Ministry of Commerce" },
    { v: "moi",     ar: "وزارة الداخلية",                                en: "Ministry of Interior" },
    { v: "misa",    ar: "وزارة الاستثمار (ميسا)",                       en: "MISA" },
    { v: "mof",     ar: "وزارة المالية",                                 en: "Ministry of Finance" },
    { v: "moh",     ar: "وزارة الصحة",                                   en: "Ministry of Health" },
    // ── هيئات تنظيمية ────────────────────────────────────────────────
    { v: "sama",    ar: "البنك المركزي السعودي (ساما)",                  en: "SAMA" },
    { v: "cma",     ar: "هيئة السوق المالية (CMA)",                     en: "Capital Market Authority" },
    { v: "zatca",   ar: "هيئة الزكاة والضريبة والجمارك",                en: "ZATCA" },
    { v: "nia",     ar: "النيابة العامة",                                 en: "Public Prosecution" },
  ];
  const BRANCHES = [
    { v: "",           ar: "الكل",                              en: "All" },
    { v: "SA-00",      ar: "الإجرائي والقضائي",                en: "Procedural & Judicial" },
    { v: "SA-01",      ar: "الجنائي والعقوبات",                en: "Criminal & Penal" },
    { v: "SA-02",      ar: "الإداري والخدمة المدنية",          en: "Administrative" },
    { v: "SA-03",      ar: "المدني والأحوال الشخصية",          en: "Civil & Personal Status" },
    { v: "SA-04",      ar: "التجاري والشركات",                 en: "Commercial & Corporate" },
    { v: "SA-05",      ar: "الملكية الفكرية",                  en: "Intellectual Property" },
    { v: "SA-06",      ar: "العمل والتأمينات",                 en: "Labor & Social Insurance" },
    { v: "SA-07",      ar: "العقاري والتوثيق",                 en: "Real Estate & Notarization" },
    { v: "SA-08",      ar: "المالي والبنكي",                   en: "Financial & Banking" },
    { v: "SA-09",      ar: "الضريبي والزكوي والجمركي",         en: "Tax, Zakat & Customs" },
    { v: "SA-10",      ar: "الصحي والدوائي",                   en: "Health & Pharmaceutical" },
    { v: "SA-12",      ar: "التقنية والاتصالات",               en: "Technology & Telecom" },
    { v: "SA-14",      ar: "الطاقة والتعدين",                  en: "Energy & Mining" },
    { v: "SA-17",      ar: "الدستوري والسيادي",               en: "Constitutional & Sovereign" },
  ];
  const COURTS = [
    { v: "",              ar: "الكل",                                             en: "All" },
    { v: "supreme",       ar: "المحكمة العليا",                                   en: "Supreme Court" },
    { v: "perm-cmte",     ar: "الهيئة الدائمة بالمحكمة العليا",                   en: "Supreme Court — Permanent Commission" },
    { v: "tamyeez",       ar: "محكمة التمييز (تاريخية — قبل 1428هـ)",             en: "Court of Cassation (Historic)" },
    { v: "appeal",        ar: "محاكم الاستئناف",                                  en: "Courts of Appeal" },
    { v: "commercial",    ar: "المحاكم التجارية",                                 en: "Commercial Courts" },
    { v: "labor",         ar: "المحاكم العمالية",                                 en: "Labor Courts" },
    { v: "personal",      ar: "محاكم الأحوال الشخصية",                            en: "Personal Status Courts" },
    { v: "criminal",      ar: "المحاكم الجزائية",                                 en: "Criminal Courts" },
    { v: "specialized",   ar: "المحكمة الجزائية المتخصصة",                        en: "Specialized Criminal Court" },
    { v: "sjc",           ar: "المجلس الأعلى للقضاء",                             en: "Supreme Judicial Council" },
    { v: "admin-supreme", ar: "المحكمة الإدارية العليا",                          en: "Supreme Administrative Court" },
    { v: "admin-appeal",  ar: "محاكم الاستئناف الإدارية",                         en: "Administrative Courts of Appeal" },
    { v: "admin-first",   ar: "المحاكم الإدارية الابتدائية",                      en: "Administrative Courts (First Instance)" },
    { v: "sama-cmte",     ar: "لجنة المنازعات المصرفية (ساما)",                   en: "SAMA Banking Disputes Committee" },
    { v: "cma-cmte",      ar: "هيئة السوق المالية — لجان الفصل",                 en: "CMA Adjudicative Committees" },
    { v: "zatca-cmte",    ar: "لجان الزكاة والضريبة والجمارك",                    en: "ZATCA Tax Committees" },
    { v: "labor-board",   ar: "هيئات تسوية الخلافات العمالية (تاريخية)",       en: "Labor Disputes Board (Historic)" },
    { v: "prosecution",   ar: "النيابة العامة",                                    en: "Public Prosecution" },
  ];
  const STATUSES = [
    { v: "",         ar: "الكل",        en: "All" },
    { v: "active",   ar: "ساري",        en: "Active" },
    { v: "amended",  ar: "مُعدَّل",      en: "Amended" },
    { v: "repealed", ar: "منسوخ / ملغى", en: "Repealed" },
  ];

  const handleApply = () => {
    const query = searchRef.current?.value || "";
    let fullQuery = query;

    if (tab === "laws") {
      const title = (document.querySelector('input[placeholder*="نظام الشركات"]') as HTMLInputElement)?.value;
      const num = (document.querySelector('input[placeholder*="م/6"]') as HTMLInputElement)?.value;
      const year = (document.querySelector('input[placeholder*="1444"]') as HTMLInputElement)?.value;
      const articleText = (document.querySelector('input[placeholder*="ابحث داخل المواد"]') as HTMLInputElement)?.value;

      const terms = [];
      if (query) terms.push(query);
      if (title) terms.push(title);
      if (num) terms.push(num);
      if (year) terms.push(year);
      if (articleText) terms.push(articleText);

      fullQuery = terms.join(" ");
    } else {
      const text = (document.querySelector('input[placeholder*="منطوق المبدأ"]') as HTMLInputElement)?.value;
      const summary = (document.querySelector('input[placeholder*="موجز الحكم"]') as HTMLInputElement)?.value;
      const num = (document.querySelector('input[placeholder*="م/49"]') as HTMLInputElement)?.value;

      const terms = [];
      if (query) terms.push(query);
      if (text) terms.push(text);
      if (summary) terms.push(summary);
      if (num) terms.push(num);

      fullQuery = terms.join(" ");
    }

    if (onApplySearch) {
      onApplySearch(fullQuery, tab);
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 14 }}
          onClick={e => e.stopPropagation()}
          className={`w-full max-w-5xl flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${bg} ${bdr}`}
          dir={isRTL ? "rtl" : "ltr"}
        >
          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className={`flex items-center justify-between px-5 py-3 border-b ${bdr}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0B3D2E]/10 flex items-center justify-center shrink-0">
                <Scales size={17} className="text-[#0B3D2E]" weight="duotone" />
              </div>
              <div>
                <p className={`text-[13px] font-black leading-none ${isDark ? "text-white" : "text-gray-900"}`}>
                  {isRTL ? "البحث القانوني المتقدم" : "Advanced Legal Search"}
                </p>
                <p className={`text-[10px] mt-0.5 ${mut}`}>
                  {isRTL ? "في الأنظمة والمبادئ القضائية السعودية" : "Saudi laws & judicial precedents"}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
              <X size={15} />
            </button>
          </div>

          {/* ── Body ──────────────────────────────────────────────────────── */}
          <div className="px-5 pt-3.5 pb-3 space-y-3">

            {/* Tab switcher */}
            <div className={`flex p-[3px] rounded-xl ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
              {(["laws", "precedents"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-[11.5px] font-bold transition-all
                    ${tab === t ? "bg-[#0B3D2E] text-white shadow" : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}>
                  {t === "laws"
                    ? <BookOpen size={13} weight={tab === "laws" ? "fill" : "regular"} />
                    : <Scales   size={13} weight={tab === "precedents" ? "fill" : "regular"} />}
                  {t === "laws"
                    ? (isRTL ? "الأنظمة واللوائح (التشريعات)" : "Laws & Regulations")
                    : (isRTL ? "السوابق والمبادئ القضائية"    : "Judicial Precedents")}
                </button>
              ))}
            </div>

            {/* General Search — س-01 (2026-08-24): the +//-/""/'*' operator
                toolbar that used to sit here is removed. The backend calls
                Postgres `plainto_tsquery` (`type: 'plain'` in search/route.ts),
                which treats the whole query as a plain bag of AND-ed words and
                silently ignores/strips every one of those symbols — so "-"
                never excluded anything, it behaved as AND, the opposite of
                what its own tooltip promised. Restoring real operator support
                is tracked separately (س-03, needs a safe query parser before
                any operator syntax is exposed again — see the search RFC). */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className={`text-[9.5px] font-bold ${mut}`}>{isRTL ? "بحث عام في كافة النصوص" : "General Search"}</span>
                <div className={`h-3 w-px ${isDark ? "bg-white/10" : "bg-gray-300"}`} />
                <span className={`text-[9.5px] ${mut}`}>
                  {isRTL ? "كلمات أو عبارة بسيطة — بلا معاملات بحث حالياً" : "Plain words or a phrase — no search operators yet"}
                </span>
              </div>
              <input ref={searchRef} type="text"
                placeholder={isRTL ? "أدخل الكلمات الدلالية أو الجملة القانونية..." : "Enter keywords or legal phrase..."}
                className={field} />
            </div>

            {/* ══════════════ LAWS TAB ═════════════════════════════════════ */}
            {tab === "laws" && (
              <div className="space-y-3">

                {/* Types */}
                <div>
                  <SectionLabel label={isRTL ? "نوع التشريع" : "Legislation Type"} />
                  <ComingSoon>
                  <div className="flex flex-wrap gap-1.5">
                    {LAW_TYPES.map((t, i) => (
                      <button key={i} onClick={() => setLawType(i)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all
                          ${lawType === i
                            ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                            : isDark ? "bg-[#161b22] border-[#2d3748] text-gray-300 hover:border-gray-500" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                        {isRTL ? t.ar : t.en}
                      </button>
                    ))}
                  </div>
                  </ComingSoon>
                </div>

                {/* Identity row */}
                <div>
                  <SectionLabel label={isRTL ? "هوية التشريع" : "Legislation Identity"} />
                  <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl border ${sec}`}>
                    <div>
                      <label className={lbl}>{isRTL ? "عنوان التشريع" : "Legislation Title"}</label>
                      <input type="text" placeholder={isRTL ? "نظام الشركات..." : "Companies Law..."} className={field} />
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "رقم التشريع" : "Legislation No."}</label>
                      <input type="text" placeholder={isRTL ? "م/6" : "M/6"} className={field} />
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "سنة التشريع" : "Legislation Year"}</label>
                      <input type="text" placeholder={isRTL ? "1444" : "2023"} className={field} />
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "نص المادة" : "Article Text"}</label>
                      <input type="text" placeholder={isRTL ? "ابحث داخل المواد..." : "Search articles..."} className={field} />
                    </div>
                  </div>
                </div>

                {/* Classification row */}
                <div>
                  <SectionLabel label={isRTL ? "التصنيف والحالة" : "Classification & Status"} />
                  <ComingSoon>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    <SelectField lbl={isRTL ? "الجهة المُصدِرة" : "Issuing Authority"} opts={ISSUERS} />
                    <SelectField lbl={isRTL ? "القسم القانوني" : "Legal Section"} opts={BRANCHES} />
                    <SelectField lbl={isRTL ? "حالة التشريع" : "Status"} opts={STATUSES} />
                    <div>
                      <label className={lbl}>{isRTL ? "عدد الجريدة الرسمية" : "Journal Issue No."}</label>
                      <input type="text" placeholder={isRTL ? "مثال: 4945" : "e.g. 4945"} className={field} />
                    </div>
                  </div>
                  </ComingSoon>
                </div>

                {/* Dates row */}
                <div>
                  <SectionLabel label={isRTL ? "التواريخ" : "Dates"} />
                  <ComingSoon>
                  <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 p-3 rounded-xl border ${sec}`}>
                    <DateField lbl={isRTL ? "تاريخ الإصدار" : "Issuance Date"} ph={isRTL ? "1/1/1446" : "1/1/2025"} />
                    <DateField lbl={isRTL ? "تاريخ النشر" : "Publication Date"} ph={isRTL ? "1/1/1446" : "1/1/2025"} />
                    <DateField lbl={isRTL ? "تاريخ النفاذ" : "Effective Date"} ph={isRTL ? "1/1/1446" : "1/1/2025"} />
                    <div>
                      <label className={lbl}>{isRTL ? "سنة الإصدار (هجري)" : "Year (Hijri)"}</label>
                      <div className="flex gap-1 items-center">
                        <input type="number" min={1300} max={1500} placeholder={isRTL ? "من" : "From"} className={`${field} flex-1`} />
                        <span className={`text-[9px] ${mut} shrink-0`}>—</span>
                        <input type="number" min={1300} max={1500} placeholder={isRTL ? "إلى" : "To"} className={`${field} flex-1`} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "سنة الإصدار (ميلادي)" : "Year (Gregorian)"}</label>
                      <div className="flex gap-1 items-center">
                        <input type="number" min={1900} max={2100} placeholder={isRTL ? "من" : "From"} className={`${field} flex-1`} />
                        <span className={`text-[9px] ${mut} shrink-0`}>—</span>
                        <input type="number" min={1900} max={2100} placeholder={isRTL ? "إلى" : "To"} className={`${field} flex-1`} />
                      </div>
                    </div>
                  </div>
                  </ComingSoon>
                </div>
              </div>
            )}

            {/* ══════════════ PRECEDENTS TAB ═════════════════════════════════ */}
            {tab === "precedents" && (
              <div className="space-y-3">

                {/* Search Scope */}
                <div>
                  <SectionLabel label={isRTL ? "نطاق البحث" : "Search Scope"} />
                  <ComingSoon>
                  <div className="grid grid-cols-3 gap-2">
                    {PREC_MODES.map(m => {
                      const Icon    = m.icon;
                      const active  = precMode === m.id;
                      return (
                        <button key={m.id} onClick={() => setPrecMode(m.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all
                            ${active
                              ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-md"
                              : isDark ? "bg-[#161b22] border-[#2d3748] text-gray-300 hover:border-gray-500" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                          <Icon size={15} weight={active ? "fill" : "duotone"}
                            className={active ? "text-[#C8A762]" : isDark ? "text-gray-500" : "text-gray-400"} />
                          {isRTL ? m.labelAr : m.labelEn}
                        </button>
                      );
                    })}
                  </div>
                  </ComingSoon>
                </div>

                {/* Text search fields */}
                <div>
                  <SectionLabel label={isRTL ? "البحث النصي" : "Text Search"} />
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className={lbl}>{isRTL ? "نص المبدأ أو السابقة" : "Principle / Precedent Text"}</label>
                      <input type="text" placeholder={isRTL ? "ابحث في منطوق المبدأ..." : "Search principle text..."} className={field} />
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "الموجز" : "Summary"}</label>
                      <input type="text" placeholder={isRTL ? "ابحث في موجز الحكم..." : "Search ruling summary..."} className={field} />
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "رقم المبدأ" : "Principle Number"}</label>
                      <input type="text" placeholder={isRTL ? "مثال: م/49" : "e.g. م/49"} className={field} />
                    </div>
                  </div>
                </div>

                {/* Case / Deed identity */}
                <div>
                  <SectionLabel label={isRTL ? "بيانات الصك / القضية" : "Case / Deed Identity"} />
                  <ComingSoon>
                  <div className={`grid grid-cols-4 gap-2.5 p-3 rounded-xl border ${sec}`}>
                    <div className="col-span-2">
                      <label className={lbl}>{isRTL ? "رقم الصك / القضية ولسنة" : "Deed / Case No. & Year"}</label>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? "رقم" : "No."}</span>
                        <input type="text" placeholder={isRTL ? "49" : "49"} className={`${field} flex-1`} />
                        <span className={`text-[10px] font-bold shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? "لسنة" : "Year"}</span>
                        <input type="text" placeholder={isRTL ? "1446" : "2024"} className={`${field} flex-1`} />
                      </div>
                    </div>
                    <DateField lbl={isRTL ? "تاريخ الجلسة" : "Session Date"} ph={isRTL ? "1/1/1446" : "1/1/2025"} />
                    <SelectField lbl={isRTL ? "المحكمة" : "Court"} opts={COURTS} />
                  </div>
                  </ComingSoon>
                </div>

                {/* Classification + Year */}
                <div>
                  <SectionLabel label={isRTL ? "التصنيف والتواريخ" : "Classification & Dates"} />
                  <ComingSoon>
                  <div className="grid grid-cols-4 gap-2.5">
                    <SelectField lbl={isRTL ? "القسم القانوني" : "Legal Section"} opts={BRANCHES} />
                    <SelectField lbl={isRTL ? "جهة الإصدار" : "Issuing Authority"} opts={[
                      { v: "",                ar: "الكل",                                                   en: "All" },
                      { v: "supreme",          ar: "المحكمة العليا (ك ع)",                                  en: "Supreme Court (SC)" },
                      { v: "supreme-general",  ar: "المحكمة العليا — الهيئة العامة (ك ع ع)",               en: "SC — General Assembly" },
                      { v: "permanent-cmte",   ar: "مجلس القضاء الأعلى — الهيئة الدائمة (م ق د)",           en: "SJC — Permanent Commission" },
                      { v: "sjc-general",      ar: "مجلس القضاء الأعلى — الهيئة العامة (م ق ع)",            en: "SJC — General Assembly" },
                      { v: "higher-judicial",  ar: "الهيئة القضائية العليا (هـ ق ع) — تاريخية",             en: "Higher Judicial Body (Historic)" },
                      { v: "tamyeez",          ar: "محكمة التمييز — تاريخية (قبل 1428هـ)",                  en: "Court of Cassation (Historic)" },
                      { v: "sjc",              ar: "المجلس الأعلى للقضاء — تعاميم",                         en: "Supreme Judicial Council" },
                      { v: "admin-supreme",    ar: "المحكمة الإدارية العليا",                  en: "Supreme Admin. Court" },
                      { v: "admin-appeal",     ar: "محاكم الاستئناف الإدارية",                 en: "Admin. Appeal Courts" },
                      { v: "sama-cmte",        ar: "لجان المنازعات المصرفية والتمويلية (ساما)",  en: "SAMA Banking Committee" },
                      { v: "cma-cmte",         ar: "هيئة السوق المالية — لجان الفصل",            en: "CMA Committees" },
                      { v: "zatca-cmte",       ar: "اللجنة الاستئنافية لمنازعات الزكاة والضريبة",en: "ZATCA Committees" },
                      { v: "commercial-paper", ar: "اللجنة القانونية لمنازعات الأوراق التجارية", en: "Commercial Paper Committee" },
                      { v: "labor-board",      ar: "الهيئة العليا لتسوية الخلافات العمالية (تاريخية)",  en: "Labor Disputes Board (Historic)" },
                      { v: "prosecution",      ar: "النيابة العامة",                               en: "Public Prosecution" },
                    ]} />
                    <div>
                      <label className={lbl}>{isRTL ? "سنة الحكم (هجري)" : "Ruling Year (H)"}</label>
                      <div className="flex gap-1 items-center">
                        <input type="number" min={1300} max={1500} placeholder={isRTL ? "من" : "From"} className={`${field} flex-1`} />
                        <span className={`text-[9px] ${mut} shrink-0`}>—</span>
                        <input type="number" min={1300} max={1500} placeholder={isRTL ? "إلى" : "To"} className={`${field} flex-1`} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>{isRTL ? "سنة الحكم (ميلادي)" : "Ruling Year (G)"}</label>
                      <div className="flex gap-1 items-center">
                        <input type="number" min={1900} max={2100} placeholder={isRTL ? "من" : "From"} className={`${field} flex-1`} />
                        <span className={`text-[9px] ${mut} shrink-0`}>—</span>
                        <input type="number" min={1900} max={2100} placeholder={isRTL ? "إلى" : "To"} className={`${field} flex-1`} />
                      </div>
                    </div>
                  </div>
                  </ComingSoon>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className={`flex items-center justify-between px-5 py-3 border-t ${bdr} ${isDark ? "bg-white/[0.02]" : "bg-gray-50/60"}`}>
            <button onClick={onClose}
              className={`px-4 py-1.5 rounded-xl text-[11.5px] font-bold border transition flex items-center gap-1.5
                ${isDark ? "text-gray-400 hover:bg-white/10 border-white/10" : "text-gray-600 hover:bg-gray-100 border-gray-200"}`}>
              <X size={12} />
              {isRTL ? "مسح الكل" : "Clear All"}
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${mut}`}>
                {isRTL ? "الحقول المظلَّلة 🚧 لا تُطبَّق على النتائج بعد" : "Greyed-out 🚧 fields have no effect on results yet"}
              </span>
              <button onClick={handleApply}
                className="flex items-center gap-1.5 px-6 py-1.5 bg-[#0B3D2E] text-white text-[11.5px] font-bold rounded-xl hover:bg-[#0a3328] transition shadow-md">
                <Scales size={13} weight="fill" />
                {isRTL ? "تطبيق البحث" : "Apply Search"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── RegisteredUserStats ───────────────────────────────────────────────────────

export function RegisteredUserStats({ isRTL, isDark }: { isRTL: boolean; isDark: boolean }) {
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card  = `rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
      <h2 className={`text-xl font-black mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
        {isRTL ? "مرحباً بك في مكتبتك القانونية الشاملة" : "Welcome to your Legal Library"}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Books,          color: "bg-[#0B3D2E]/10 text-[#0B3D2E]",  val: "14", labelAr: "نظام تمت قراءته",    labelEn: "Systems Read" },
          { icon: BookmarkSimple, color: "bg-amber-500/10 text-amber-600",   val: "32", labelAr: "مبدأ/مادة محفوظة",  labelEn: "Saved Items" },
          { icon: Scroll,         color: "bg-purple-500/10 text-purple-600", val: "5",  labelAr: "تحديثات قضائية لك", labelEn: "New Judicial Updates" },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`${card} flex items-center gap-4`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.color.split(" ")[0]}`}>
                <Icon size={24} className={item.color.split(" ")[1]} weight="duotone" />
              </div>
              <div>
                <p className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>{item.val}</p>
                <p className={`text-xs ${muted}`}>{isRTL ? item.labelAr : item.labelEn}</p>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
