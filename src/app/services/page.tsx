"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, Users, Star, ArrowRight, MagnifyingGlass,
  MapPin, Scales, Buildings, SealCheck,
  CashRegister, FileText, Gavel, PencilSimpleLine,
  User, ClipboardText, CheckCircle
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import ServiceRequestWizard from "@/components/services/ServiceRequestWizard";

// ─── Types ────────────────────────────────────────────────────────────────────
type UserRole = "individual" | "corporate" | "lawyer_client" | "lawyer_provider";
type ServiceCat = "individual" | "corporate" | "lawyer";

// ─── Role Definitions ─────────────────────────────────────────────────────────
const ROLES: { id: UserRole; icon: typeof User; label: string; labelEn: string; desc: string; descEn: string }[] = [
  {
    id: "individual",
    icon: User,
    label: "أنا مستفيد من الخدمة",
    labelEn: "I'm seeking legal help",
    desc: "أفرادٌ يسعون للحصول على خدمات قانونية متخصصة.",
    descEn: "Individuals seeking specialized legal services.",
  },
  {
    id: "corporate",
    icon: Buildings,
    label: "أنا أمثل شركة",
    labelEn: "I represent a company",
    desc: "للكيانات التجارية الباحثة عن تأسيس، استشارات وعقود للشركات.",
    descEn: "Commercial entities seeking registration, consultations, and contracts.",
  },
  {
    id: "lawyer_client",
    icon: Scales,
    label: "أنا محامٍ — أطلب خدمة",
    labelEn: "I'm a Lawyer — Requesting a Service",
    desc: "للمحامين الذين يحتاجون إلى خدمات قانونية متخصصة أو استشارات من زملائهم.",
    descEn: "Lawyers seeking specialized services or peer consultations.",
  },
  {
    id: "lawyer_provider",
    icon: Briefcase,
    label: "أنا محامٍ — أقدّم خدمة",
    labelEn: "I'm a Lawyer — Offering Services",
    desc: "استقبل طلبات العملاء من الأفراد والشركات وزملاء المهنة.",
    descEn: "Accept requests from individuals, businesses, and fellow lawyers.",
  },
];

// ─── Services Data ─────────────────────────────────────────────────────────────
const ALL_SERVICES = [
  {
    id: "srv-1", cat: "corporate" as ServiceCat, icon: PencilSimpleLine,
    title: "صياغة عقود تجارية وموردين", titleEn: "Drafting Commercial & Vendor Contracts",
    desc: "صياغة ومراجعة العقود التجارية، عقود الشراكات، وعقود الموردين (NDA) لحماية الملكية وتجنب النزاعات.",
    descEn: "Drafting and reviewing commercial, partnership, and vendor agreements.",
    priceRef: "يبدأ من ١,٥٠٠ ر.س", priceRefEn: "Starts from 1,500 SAR",
    avgTime: "٣ - ٥ أيام", avgTimeEn: "3 - 5 Days", demand: "طلب مرتفع",
  },
  {
    id: "srv-2", cat: "corporate" as ServiceCat, icon: Buildings,
    title: "تأسيس شركات وتسجيل العلامات", titleEn: "Company Registration & IP",
    desc: "تأسيس الكيانات القانونية، استخراج السجلات، تسجيل العلامات التجارية وبراءات الاختراع.",
    descEn: "Establishing entities, extracting records, and IP registration.",
    priceRef: "يبدأ من ٣,٠٠٠ ر.س", priceRefEn: "Starts from 3,000 SAR",
    avgTime: "أسبوعين", avgTimeEn: "2 Weeks", demand: "سريع",
  },
  {
    id: "srv-3", cat: "corporate" as ServiceCat, icon: CashRegister,
    title: "تحصيل ديون تجارية (B2B)", titleEn: "B2B Debt Collection",
    desc: "الوساطة لجمع الديون المتعثرة والمطالبات المالية ضد الشركات للحد من الخسائر.",
    descEn: "Mediating bad debts and financial claims against corporations.",
    priceRef: "نسبة من التحصيل", priceRefEn: "Percentage based",
    avgTime: "متغير", avgTimeEn: "Variable", demand: null,
  },
  {
    id: "srv-4", cat: "individual" as ServiceCat, icon: FileText,
    title: "كتابة لوائح اعتراضية واستئنافية", titleEn: "Appeals & Governance",
    desc: "دراسة الأحكام القضائية وإعداد لوائح استئناف وطلبات التماس إعادة النظر بدقة عالية.",
    descEn: "Reviewing judgments and preparing appeal and review petitions.",
    priceRef: "يبدأ من ٢,٥٠٠ ر.س", priceRefEn: "Starts from 2,500 SAR",
    avgTime: "يومين - أسبوع", avgTimeEn: "2 Days - 1 Week", demand: "طلب مرتفع",
  },
  {
    id: "srv-5", cat: "individual" as ServiceCat, icon: Users,
    title: "قضايا عمالية وتسوية نزاعات", titleEn: "Labor Disputes & Settlement",
    desc: "التمثيل القانوني في قضايا الفصل التعسفي، المستحقات العمالية، أو التسويات الودية.",
    descEn: "Representation in wrongful termination and labor claims.",
    priceRef: "يبدأ من ١,٠٠٠ ر.س", priceRefEn: "Starts from 1,000 SAR",
    avgTime: "متغير", avgTimeEn: "Variable", demand: null,
  },
  {
    id: "srv-6", cat: "individual" as ServiceCat, icon: Scales,
    title: "قضايا أحوال شخصية وتركات", titleEn: "Family Law & Estates",
    desc: "تقسيم المواريث، الوصايا، الحضانة، والنفقات الزوجية في بيئة من السرية التامة.",
    descEn: "Inheritance division, wills, custody, and alimony.",
    priceRef: "حسب التقييم", priceRefEn: "By assessment",
    avgTime: "متغير", avgTimeEn: "Variable", demand: null,
  },
  {
    id: "srv-7", cat: "lawyer" as ServiceCat, icon: ClipboardText,
    title: "مراجعة مذكرات قانونية بين المحامين", titleEn: "Peer Legal Brief Review",
    desc: "راجع مذكراتك القانونية ودفوعك مع محامٍ متخصص في ذات المجال للتعزيز والتدقيق.",
    descEn: "Peer review of legal briefs and submissions with a specialist colleague.",
    priceRef: "يبدأ من ٥٠٠ ر.س", priceRefEn: "Starts from 500 SAR",
    avgTime: "يوم", avgTimeEn: "1 Day", demand: "جديد",
  },
  {
    id: "srv-8", cat: "lawyer" as ServiceCat, icon: Gavel,
    title: "حضور جلسات بالإنابة (توكيل مؤقت)", titleEn: "Session Attendance by Proxy",
    desc: "حضور الجلسات القضائية نيابةً عن محامٍ آخر في مناطق مختلفة داخل المملكة.",
    descEn: "Attend court sessions on behalf of another lawyer in different regions.",
    priceRef: "يبدأ من ٣٠٠ ر.س", priceRefEn: "Starts from 300 SAR",
    avgTime: "حسب الجلسة", avgTimeEn: "Per session", demand: "طلب مرتفع",
  },
];

const INCOMING_REQUESTS = [
  { id: "req-1", from: "individual", fromLabel: "فرد", title: "احتاج محامي لقضية عمالية فصل تعسفي", budget: "١,٢٠٠ - ٢,٠٠٠ ر.س", date: "منذ ٣ ساعات", region: "الرياض" },
  { id: "req-2", from: "corporate", fromLabel: "شركة", title: "مراجعة عقود موردين لشركة مقاولات", budget: "٣,٠٠٠ ر.س", date: "منذ ٦ ساعات", region: "جدة" },
  { id: "req-3", from: "lawyer", fromLabel: "محامٍ", title: "حضور جلسة بالنيابة بمحكمة الاستئناف بالدمام", budget: "٤٠٠ ر.س", date: "منذ يوم", region: "الدمام" },
  { id: "req-4", from: "individual", fromLabel: "فرد", title: "استشارة في قضية تركة وميراث", budget: "٨٠٠ ر.س", date: "منذ يومين", region: "مكة المكرمة" },
];

const fromBadgeColors: Record<string, string> = {
  individual: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  corporate: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  lawyer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const FEATURED_LAWYERS = [
  {
    id: "lawyer-1", name: "د. طارق الحارثي", nameEn: "Dr. Tariq Al-Harthi",
    title: "محامٍ تجاري — مستشار قانوني للشركات", titleEn: "Corporate Counsel",
    rating: 4.9, location: "الرياض", locationEn: "Riyadh",
    verified: true, skills: ["العقود التجارية", "الشركات", "الملكية الفكرية"],
  },
  {
    id: "lawyer-2", name: "أ. سارة الميمان", nameEn: "Sarah Al-Mayman",
    title: "محامية متخصصة في قضايا الأسرة والعمل", titleEn: "Family & Labor Law",
    rating: 4.8, location: "جدة", locationEn: "Jeddah",
    verified: true, skills: ["اللجان العمالية", "التركات", "الاستئناف"],
  },
];

export default function ServicesMarketplacePage() {
  const { isRTL, isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [search, setSearch] = useState("");
  const [wizardService, setWizardService] = useState<{ id: string; title: string; titleEn: string } | null>(null);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200";
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const heading = isDark ? "text-white" : "text-gray-900";

  // ── Service visibility logic ──────────────────────────────────────────────
  const visibleCats: ServiceCat[] = role === "individual"
    ? ["individual"]
    : role === "corporate"
    ? ["corporate"]
    : role === "lawyer_client"
    ? ["individual", "corporate", "lawyer"]
    : [];

  const filteredServices = ALL_SERVICES.filter(srv => {
    const qMatch = (isRTL ? srv.title : srv.titleEn).toLowerCase().includes(search.toLowerCase());
    const cMatch = visibleCats.includes(srv.cat);
    return qMatch && cMatch;
  });

  const catLabel: Record<ServiceCat, string> = {
    individual: isRTL ? "خدمات الأفراد" : "Individual Services",
    corporate: isRTL ? "خدمات الشركات" : "Corporate Services",
    lawyer: isRTL ? "خدمات بين المحامين" : "Lawyer-to-Lawyer",
  };

  return (
    <div className={`min-h-screen flex flex-col ${bg} font-sans`} dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Service Request Wizard Modal ── */}
      {wizardService && role && role !== "lawyer_provider" && (
        <ServiceRequestWizard
          serviceId={wizardService.id}
          serviceTitle={wizardService.title}
          serviceTitleEn={wizardService.titleEn}
          userRole={role === "individual" ? "individual" : "lawyer_client"}
          onClose={() => setWizardService(null)}
        />
      )}
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-16 overflow-hidden mt-10">
        <div className="absolute top-0 right-0 -mr-32 -mt-32 opacity-10 pointer-events-none">
          <svg width="404" height="404" fill="none" viewBox="0 0 404 404">
            <defs>
              <pattern id="dot-p" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="2" fill={isDark ? "#ffffff" : "#0B3D2E"} />
              </pattern>
            </defs>
            <rect width="404" height="404" fill="url(#dot-p)" />
          </svg>
        </div>
        <div className="mx-auto max-w-[1200px] px-4 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] text-xs font-bold">
            <Scales size={14} weight="fill" />
            {isRTL ? "المنصة القانونية للخدمات" : "Legal Services Platform"}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`text-4xl md:text-5xl font-black tracking-tight mb-4 ${heading}`}>
            {isRTL ? "خدمات قانونية متخصصة — موثوقة وسرية" : "Specialized Legal Services — Trusted & Confidential"}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className={`max-w-2xl mx-auto text-sm md:text-base leading-relaxed mb-10 ${muted}`}>
            {isRTL
              ? "منصة راقية تربط أصحاب الحاجة بنخبة المحامين المرخصين — من الأفراد إلى الشركات وزملاء المهنة."
              : "A premium platform connecting legal seekers with top licensed lawyers — individuals, businesses, and fellow counsel."}
          </motion.p>
        </div>
      </section>

      {/* ── Role Selector ── */}
      <section className="pb-10 px-4">
        <div className="mx-auto max-w-[900px]">
          <p className={`text-center text-sm font-bold mb-6 ${muted}`}>
            {isRTL ? "أخبرنا بطبيعة احتياجك للمتابعة" : "Let us know your role to continue"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ROLES.map(r => {
              const Icon = r.icon;
              const isActive = role === r.id;
              return (
                <motion.button key={r.id} onClick={() => setRole(r.id)}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className={`relative flex flex-col items-center text-center p-6 rounded-3xl border transition-all ${
                    isActive
                      ? "border-[#0B3D2E] bg-[#0B3D2E] text-white shadow-xl"
                      : isDark ? "border-[#2d3748] bg-[#161b22] hover:border-gray-500 text-gray-300" : "border-gray-200 bg-white hover:border-gray-300 text-gray-700 shadow-sm"
                  }`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${isActive ? "bg-white/10" : isDark ? "bg-white/5" : "bg-[#0B3D2E]/5"}`}>
                    <Icon size={24} weight={isActive ? "fill" : "regular"} className={isActive ? "text-[#C8A762]" : "text-[#0B3D2E] dark:text-[#C8A762]"} />
                  </div>
                  <span className="font-black text-sm mb-1">{isRTL ? r.label : r.labelEn}</span>
                  <span className={`text-[11px] leading-relaxed ${isActive ? "text-white/70" : muted}`}>{isRTL ? r.desc : r.descEn}</span>
                  {isActive && (
                    <div className="absolute top-3 left-3 w-5 h-5 rounded-full bg-[#C8A762] flex items-center justify-center">
                      <CheckCircle size={14} weight="fill" className="text-[#0B3D2E]" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Content — Only shows after role is selected ── */}
      <AnimatePresence mode="wait">
        {role && (
          <motion.section key={role} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pb-24 px-4 flex-1">
            <div className="mx-auto max-w-[1200px]">

              {/* ─── Provider: Incoming Requests Board ─── */}
              {role === "lawyer_provider" ? (
                <>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className={`text-2xl font-black mb-1 ${heading}`}>
                        {isRTL ? "لوحة الطلبات الواردة" : "Incoming Request Board"}
                      </h2>
                      <p className={`text-sm ${muted}`}>
                        {isRTL ? "طلبات من الأفراد والشركات وزملاء المهنة — قبّل ما يناسب تخصصك" : "Requests from individuals, businesses & fellow lawyers"}
                      </p>
                    </div>
                    <div className="relative hidden sm:block w-64">
                      <input type="text" placeholder={isRTL ? "بحث في الطلبات..." : "Search requests..."}
                        className={`w-full py-2.5 px-10 rounded-xl border text-sm outline-none ${isDark ? "bg-[#161b22] border-[#2d3748] text-white" : "bg-white border-gray-200 shadow-sm"}`} />
                      <MagnifyingGlass size={16} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "right-3" : "left-3"} ${muted}`} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {INCOMING_REQUESTS.map((req, idx) => (
                      <motion.div key={req.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.07 }}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border ${card} hover:shadow-md transition`}>
                        <div className="flex items-start gap-4">
                          <div className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold ${fromBadgeColors[req.from]}`}>
                            {req.fromLabel}
                          </div>
                          <div>
                            <p className={`font-bold text-sm ${heading}`}>{req.title}</p>
                            <p className={`text-xs mt-1 ${muted}`}>{req.region} · {req.date}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{req.budget}</span>
                          <button className="px-5 py-2 bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-xs font-bold rounded-xl transition">
                            {isRTL ? "تقديم عرض" : "Submit Offer"}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : (
                /* ─── Seeker: Services Grid ─── */
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className={`text-2xl font-black mb-1 ${heading}`}>
                        {isRTL
                          ? role === "individual" ? "الخدمات القانونية المتاحة لك" 
                          : role === "corporate" ? "خدمات قطاع الأعمال"
                          : "جميع الخدمات القانونية"
                          : role === "individual" ? "Available Services for You" 
                          : role === "corporate" ? "Corporate Services"
                          : "All Legal Services"}
                      </h2>
                      <p className={`text-sm ${muted}`}>
                        {role === "individual"
                          ? isRTL ? "خدمات متخصصة للأفراد بسرية تامة وضمان الجودة" : "Specialized individual services with full confidentiality"
                          : role === "corporate"
                          ? isRTL ? "خدمات متخصصة للشركات والكيانات التجارية" : "Specialized corporate and commercial services"
                          : isRTL ? "كمحامٍ، يمكنك طلب خدمات من الأفراد أو الشركات أو زملائك" : "As a lawyer, you can request services across all categories"}
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={isRTL ? "ابحث عن خدمة..." : "Search a service..."}
                        className={`w-full py-3 px-10 rounded-xl border text-sm outline-none ${isDark ? "bg-[#161b22] border-[#2d3748] text-white" : "bg-white border-gray-200 shadow-sm"}`} />
                      <MagnifyingGlass size={16} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "right-3" : "left-3"} ${muted}`} />
                    </div>
                  </div>

                  {/* Group by category */}
                  {(["individual", "corporate", "lawyer"] as ServiceCat[]).filter(c => visibleCats.includes(c)).map(cat => {
                    const catServices = filteredServices.filter(s => s.cat === cat);
                    if (!catServices.length) return null;
                    return (
                      <div key={cat} className="mb-12">
                        <div className="flex items-center gap-3 mb-5">
                          <span className={`px-3 py-1 text-xs font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>
                            {catLabel[cat]}
                          </span>
                          <div className={`flex-1 h-px ${isDark ? "bg-gray-800" : "bg-gray-100"}`} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          <AnimatePresence mode="popLayout">
                            {catServices.map((srv, idx) => {
                              const Icon = srv.icon;
                              return (
                                <motion.div key={srv.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.04 }}
                                  className={`group rounded-3xl border p-6 flex flex-col hover:-translate-y-1 hover:shadow-lg transition-all ${card}`}>
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="w-11 h-11 rounded-2xl bg-[#0B3D2E]/5 flex items-center justify-center">
                                      <Icon size={22} className="text-[#0B3D2E] dark:text-[#C8A762]" weight="duotone" />
                                    </div>
                                    {srv.demand && (
                                      <span className="px-2.5 py-1 text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg">
                                        🔥 {srv.demand}
                                      </span>
                                    )}
                                  </div>
                                  <h3 className={`text-base font-black mb-2 group-hover:text-[#C8A762] transition-colors ${heading}`}>
                                    {isRTL ? srv.title : srv.titleEn}
                                  </h3>
                                  <p className={`text-xs flex-1 leading-relaxed mb-5 ${muted}`}>{isRTL ? srv.desc : srv.descEn}</p>
                                  <div className={`grid grid-cols-2 gap-2 p-3 rounded-xl border mb-4 ${isDark ? "bg-white/5 border-gray-800" : "bg-gray-50 border-gray-100"}`}>
                                    <div>
                                      <span className={`block text-[10px] ${muted}`}>{isRTL ? "مؤشر السعر" : "Est. Price"}</span>
                                      <span className={`text-xs font-bold ${heading}`}>{isRTL ? srv.priceRef : srv.priceRefEn}</span>
                                    </div>
                                    <div>
                                      <span className={`block text-[10px] ${muted}`}>{isRTL ? "مدة التنفيذ" : "Est. Time"}</span>
                                      <span className={`text-xs font-bold ${heading}`}>{isRTL ? srv.avgTime : srv.avgTimeEn}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => setWizardService({ id: srv.id, title: srv.title, titleEn: srv.titleEn })}
                                    className="w-full py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
                                  >
                                    {isRTL ? "طلب الخدمة الآن" : "Request Service"}
                                  </button>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Featured Lawyers — for seeker roles ── */}
              {role !== "lawyer_provider" && (
                <div className="pt-10 border-t mt-8 border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className={`text-2xl font-black mb-1 ${heading}`}>
                        {isRTL ? "نخبة المستشارين القانونيين" : "Our Distinguished Legal Counsel"}
                      </h2>
                      <p className={`text-sm ${muted}`}>
                        {isRTL ? "محامون مرخصون من أهل الخبرة والتخصص — يُعينونك بدقة واحترافية" : "Licensed, experienced specialists who serve with precision and integrity"}
                      </p>
                    </div>
                    <Link href="/lawyers" className={`hidden sm:flex items-center gap-1 text-sm font-bold hover:underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                      {isRTL ? "عرض جميع المستشارين" : "View All Counsel"} <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {FEATURED_LAWYERS.map(lawyer => (
                      <div key={lawyer.id} className={`flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 rounded-3xl border hover:shadow-md transition ${card}`}>
                        <div className="relative shrink-0">
                          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border-2 border-white dark:border-[#0c0f12]">
                            <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${lawyer.id}&backgroundColor=C8A762`} alt={lawyer.name} className="w-full h-full object-cover" />
                          </div>
                          {lawyer.verified && (
                            <div className="absolute -bottom-1 -right-1 bg-white dark:bg-[#0c0f12] rounded-full p-0.5">
                              <SealCheck size={20} className="text-blue-500" weight="fill" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-center sm:text-start" dir={isRTL ? "rtl" : "ltr"}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className={`font-black text-lg ${heading}`}>{isRTL ? lawyer.name : lawyer.nameEn}</h3>
                              <p className={`text-xs mt-0.5 ${muted}`}>{isRTL ? lawyer.title : lawyer.titleEn}</p>
                            </div>
                            <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-yellow-400/10 rounded-lg">
                              <Star size={12} weight="fill" className="text-yellow-500" />
                              <span className={`text-xs font-bold ${isDark ? "text-yellow-400" : "text-yellow-700"}`}>{lawyer.rating}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                              <MapPin size={11} /> {isRTL ? lawyer.location : lawyer.locationEn}
                            </span>
                            {lawyer.skills.map((s, i) => (
                              <span key={i} className={`text-[10px] px-2 py-1 rounded-md border ${isDark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-600"}`}>{s}</span>
                            ))}
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                            <button className="flex-1 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-lg hover:bg-[#0a3328] transition">
                              {isRTL ? "تواصل وطلب عرض" : "Contact & Request"}
                            </button>
                            <button className={`px-4 py-2 border text-xs font-bold rounded-lg transition ${isDark ? "border-gray-700 hover:bg-gray-800 text-white" : "border-gray-200 hover:bg-gray-50 text-gray-900"}`}>
                              {isRTL ? "الملف المهني" : "Profile"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
